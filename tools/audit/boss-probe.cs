#:project ../../src/AGI2046.Rules/AGI2046.Rules.csproj
using AGI2046.Rules;

/* 0.24「有辨识度」首领机制探针：拍卖人 / 镜面执政官 / 主脑 */

var pass = 0;
var fail = 0;
void Ok(string name, bool cond, string detail = "")
{
    if (cond) { pass++; Console.WriteLine($"PASS  {name}"); }
    else { fail++; Console.WriteLine($"FAIL  {name}   {detail}"); }
}

GameState Start()
{
    var s = GameEngine.NewGame(new NewGameRequest
    {
        CharacterIds = new List<string> { "gpt", "claude" },
        Seed = 424242,
        FirstRun = false
    });
    s.Log.Clear();
    return s;
}

/// 造一个指定 boss 的战斗：把玩家挪到 Boss 节点上，再直接开战
GameState Fight(string bossId)
{
    var s = Start();
    var p = s.ActivePlayer!;
    // 造一个临时 Boss 节点，保证 StartCombat 走 Boss 分支
    var node = new NodeState
    {
        Id = "test_boss",
        Name = "测试首领",
        Type = NodeType.Boss,
        Layer = 1,
        Lane = 1,
        X = 100, Y = 100,
        Revealed = true,
        Visited = true
    };
    s.Nodes.Add(node);
    p.NodeId = node.Id;
    foreach (var other in s.Players) other.NodeId = node.Id;
    s.HasKey = true;
    return CombatEngine.StartCombat(s, p, node, bossId);
}

/* ── 1. 拍卖人：开价 → 接受 / 拒绝都有代价 ─────────────────────── */
{
    var s = Fight("g_boss");
    var c = s.Combat!;
    var mech = c.BossMechanic;
    Ok("拍卖人有机制", mech?.Kind == "auction", mech?.Kind ?? "null");
    Ok("开场就有一笔开价", mech!.Trades.Count(t => t.State == "open") == 1, mech.Trades.Count.ToString());
    Ok("机制有标题和提示", !string.IsNullOrWhiteSpace(mech.Title) && !string.IsNullOrWhiteSpace(mech.Hint));

    var before = s.Memory;
    var trade = mech.Trades.First(t => t.State == "open");
    if (trade.Id == "credit")
    {
        GameEngine.ApplyAction(s, new GameAction { Type = "bossTrade", Slot = "credit" });
        Ok("赊账扣 40 记忆币", s.Memory == before - 40, $"{before} → {s.Memory}");
        Ok("赊账给全队 +6 命中",
            c.Units.Where(u => u.Side == Side.Player).All(u => u.AccuracyBonus >= 6),
            string.Join(",", c.Units.Where(u => u.Side == Side.Player).Select(u => u.AccuracyBonus)));
        Ok("成交计数 +1", mech.Accepted == 1, mech.Accepted.ToString());
    }
    else
    {
        // 不是赊账也没关系：拒绝路径照样要验证
        GameEngine.ApplyAction(s, new GameAction { Type = "bossTrade", Slot = "decline" });
        Ok("拒绝让首领变强", mech.Refusals == 1, mech.Refusals.ToString());
    }
    Ok("成交或拒绝后交易关闭", mech.Trades.All(t => t.State != "open"), string.Join(",", mech.Trades.Select(t => t.State)));
}

/* ── 2. 拍卖人：拒绝 → 伤害 +2，且有上限语义（每次 +2） ───────── */
{
    var s = Fight("g_boss");
    var c = s.Combat!;
    var mech = c.BossMechanic!;
    var boss = c.Units.First(u => u.Role == "首领");
    var baseDmg = boss.DamageBonus;
    GameEngine.ApplyAction(s, new GameAction { Type = "bossTrade", Slot = "decline" });
    Ok("拒绝一次：伤害 +2", boss.DamageBonus == baseDmg + 2, $"{baseDmg} → {boss.DamageBonus}");
    Ok("拒绝写日志", c.Log.Any(l => l.Contains("拒绝了拍卖人")), "no log");
}

/* ── 3. 拍卖人胜利奖励随交易记录变化 ──────────────────────────── */
{
    var s = Fight("g_boss");
    var c = s.Combat!;
    c.BossMechanic!.Accepted = 2;
    var boosted = BossMechanics.OnVictory(s, c, 100);
    c.BossMechanic!.Accepted = 0;
    c.BossMechanic!.Refusals = 2;
    var reduced = BossMechanics.OnVictory(s, c, 100);
    Ok("成交越多奖励越高", boosted > 100, boosted.ToString());
    Ok("拒绝越多奖励越低", reduced < 100, reduced.ToString());
    Ok("奖励有上下限", boosted <= 160 && reduced >= 60, $"{boosted}/{reduced}");
}

/* ── 4. 镜面执政官：学习玩家用的伤害类型 ──────────────────────── */
{
    var s = Fight("g_boss2");
    var c = s.Combat!;
    var mech = c.BossMechanic!;
    Ok("镜面有机制", mech.Kind == "mirror", mech.Kind);
    var player = c.Units.First(u => u.Side == Side.Player);
    var boss = c.Units.First(u => u.Role == "首领");
    var baseArmor = boss.Armor;

    var phys = new SkillDef { Id = "t_phys", Name = "测试物理", DamageType = DamageType.Physical, Target = TargetType.Enemy, Accuracy = 90, DamagePerDie = 5 };
    BossMechanics.OnPlayerAction(s, c, player, "skill", phys);
    Ok("学会物理（1 层）", mech.LearnType == "physical" && mech.LearnStacks == 1, $"{mech.LearnType}/{mech.LearnStacks}");
    BossMechanics.OnPlayerAction(s, c, player, "skill", phys);
    BossMechanics.OnPlayerAction(s, c, player, "skill", phys);
    Ok("同一类型叠到 3 层", mech.LearnStacks == 3, mech.LearnStacks.ToString());
    Ok("物理抗性随层数上升", boss.Armor == baseArmor + 4, $"{baseArmor} → {boss.Armor}");
    Ok("抗性有上限（最多 +4）", boss.Armor == baseArmor + 4, boss.Armor.ToString());

    var tech = new SkillDef { Id = "t_tech", Name = "测试技术", DamageType = DamageType.Tech, Target = TargetType.Enemy, Accuracy = 90, DamagePerDie = 5 };
    BossMechanics.OnPlayerAction(s, c, player, "skill", tech);
    Ok("换类型：重新从 1 层学", mech.LearnType == "tech" && mech.LearnStacks == 1, $"{mech.LearnType}/{mech.LearnStacks}");
    Ok("换类型后物理抗性回落", boss.Armor == baseArmor, $"{boss.Armor} / {baseArmor}");

    BossMechanics.OnPlayerAction(s, c, player, "defend", null);
    Ok("防御污染样本", mech.LearnStacks == 0 && mech.LearnType == "none", $"{mech.LearnType}/{mech.LearnStacks}");
    Ok("描述能读出当前状态", BossMechanics.Describe(c).Contains("还没学到") || BossMechanics.Describe(c).Contains("正在学习"),
        BossMechanics.Describe(c));
}

/* ── 5. 镜面二阶段：镜像优先咬残血 ────────────────────────────── */
{
    var s = Fight("g_boss2");
    var c = s.Combat!;
    var mech = c.BossMechanic!;
    mech.LearnType = "physical";
    mech.LearnStacks = 2;
    c.BossPhase = 2;
    Ok("二阶段 + 2 层 → 猎残血", BossMechanics.MirrorHuntsWeakest(c));
    mech.LearnStacks = 1;
    Ok("层数不足 → 不猎残血", !BossMechanics.MirrorHuntsWeakest(c));
}

/* ── 6. 主脑：关格 + 限时并行目标 ────────────────────────────── */
{
    var s = Fight("g_boss3");
    var c = s.Combat!;
    var mech = c.BossMechanic!;
    Ok("主脑有机制", mech.Kind == "protocol", mech.Kind);
    // 推进到第 3 轮（关格节奏）
    c.Round = 2;
    var live = c.Units.Where(u => !u.Downed).ToList();
    CombatEngineTestHooks.NewRound(s, c);
    Ok("第 3 轮关掉 2 格", mech.ClosedCells.Count == 2, mech.ClosedCells.Count.ToString());
    Ok("关格写在日志里", c.Log.Any(l => l.Contains("协议覆写")), "no log");

    // 二阶段：挂 3 个协议节点
    c.BossPhase = 2;
    c.Round = 3;
    mech.ClosedCells.Clear();
    CombatEngineTestHooks.NewRound(s, c);
    Ok("二阶段挂 3 个协议节点", mech.ProtocolNodes.Count == 3, mech.ProtocolNodes.Count.ToString());
    Ok("有明确截止轮", mech.DeadlineRound == c.Round + 5, $"{mech.DeadlineRound} vs {c.Round}");
    Ok("节点是敌人且有名字", c.Units.Where(u => mech.ProtocolNodes.Contains(u.Id)).All(u => u.Side == Side.Enemy && u.Name.Contains("协议节点")));

    // 到期未拆：扣追踪，不秒杀
    var purgeBefore = s.Purge;
    c.Round = mech.DeadlineRound - 1;
    CombatEngineTestHooks.NewRound(s, c);
    Ok("到期未拆：按节点数扣追踪", s.Purge < purgeBefore, $"{purgeBefore} → {s.Purge}");
    Ok("到期未拆：不直接判负", s.Phase != GamePhase.Defeat || s.Purge <= 0, s.Phase.ToString());
    Ok("到期后不再重复扣", mech.ProtocolNodes.Count == 0, mech.ProtocolNodes.Count.ToString());
}

/* ── 7. 主脑：拆完节点给奖励 ─────────────────────────────────── */
{
    var s = Fight("g_boss3");
    var c = s.Combat!;
    var mech = c.BossMechanic!;
    c.BossPhase = 2;
    c.Round = 3;
    CombatEngineTestHooks.NewRound(s, c);
    var boss = c.Units.First(u => u.Role == "首领");
    var armorBefore = boss.Armor;
    foreach (var id in mech.ProtocolNodes.ToList())
    {
        var n = c.Units.First(u => u.Id == id);
        n.Hp = 0;
        n.Downed = true;
    }
    CombatEngineTestHooks.NewRound(s, c);
    Ok("拆完节点：判定为完成", mech.Flags.Contains("protocol_done"), string.Join(",", mech.Flags));
    Ok("拆完节点：首领护甲 -3", boss.Armor == Math.Max(0, armorBefore - 3), $"{armorBefore} → {boss.Armor}");
}

/* ── 8. 非首领战不带机制 ─────────────────────────────────────── */
{
    var s = Start();
    var p = s.ActivePlayer!;
    var node = s.Nodes.First(n => n.Type == NodeType.Combat);
    p.NodeId = node.Id;
    foreach (var other in s.Players) other.NodeId = node.Id;
    var st = CombatEngine.StartCombat(s, p, node);
    Ok("普通战没有首领机制", st.Combat?.BossMechanic is null, st.Combat?.BossMechanic?.Kind ?? "null");
    Ok("普通战机制描述为空", BossMechanics.Describe(st.Combat!) == "", BossMechanics.Describe(st.Combat!));
}

Console.WriteLine($"===== {pass} passed, {fail} failed =====");
return fail == 0 ? 0 : 1;

/// 用反射调私有的 BeginNewRound，避免为了测试把接口公开
static class CombatEngineTestHooks
{
    public static void NewRound(GameState state, CombatState combat)
    {
        var mi = typeof(CombatEngine).GetMethod("BeginNewRound",
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static)!;
        mi.Invoke(null, new object[] { combat, state });
    }
}
