#:project ../../src/AGI2046.Rules/AGI2046.Rules.csproj
using AGI2046.Rules;

/* 0.23「有记忆」规则探针：事件后果 + 角色关系 */

var pass = 0;
var fail = 0;
void Ok(string name, bool cond, string detail = "")
{
    if (cond) { pass++; Console.WriteLine($"PASS  {name}"); }
    else { fail++; Console.WriteLine($"FAIL  {name}   {detail}"); }
}

GameState Start(int act = 1)
{
    var s = GameEngine.NewGame(new NewGameRequest
    {
        CharacterIds = new List<string> { "gpt", "claude" },
        Seed = 20261027,
        FirstRun = false
    });
    s.Act = act;
    s.Log.Clear();
    s.Stats = new RunStats();
    return s;
}

/* ── 1. 后果登记：来源/原因/到期幕都能回答「为什么」 ───────────── */
{
    var s = Start();
    var ev = GameData.Events["ev_auction"];
    ConsequenceEngine.OnEventResolved(s, ev, true);
    var c = s.Consequences.FirstOrDefault();
    Ok("事件产生后果", c is not null, $"count={s.Consequences.Count}");
    Ok("后果能说明来源", c?.Source == ev.Title, c?.Source ?? "null");
    Ok("后果有原因文案", !string.IsNullOrWhiteSpace(c?.Why), c?.Why ?? "null");
    Ok("后果有到期幕", c is not null && c.ExpiresAct > s.Act, $"{c?.ExpiresAct}");
    Ok("商店价格 +15%", Math.Abs(ConsequenceEngine.ShopMul(s) - 1.15) < 0.001, ConsequenceEngine.ShopMul(s).ToString("0.00"));
}

/* ── 2. 属性类后果真的改了数值，且到期会回滚 ───────────────────── */
{
    var s = Start();
    var before = s.Players[0].Stats.Vit;
    ConsequenceEngine.OnEventResolved(s, GameData.Events["ev_clinic"], true);
    Ok("VIT 立即 +2", s.Players[0].Stats.Vit == before + 2, $"{before} → {s.Players[0].Stats.Vit}");
    s.Act = 2;   // 换幕：幕数先前进，再结算到期
    ConsequenceEngine.OnActStart(s);
    Ok("换幕后 VIT 回滚", s.Players[0].Stats.Vit == before, $"{s.Players[0].Stats.Vit}");
    Ok("到期后果被移除", s.Consequences.All(c => c.Id != "stim_residue"), s.Consequences.Count.ToString());
}

/* ── 3. 上限 5 条：超出时最旧的退场并回滚，不静默丢 ───────────── */
{
    var s = Start();
    var ids = new[] { "ev_auction", "ev_clinic", "ev_signal", "ev_firewall", "ev_cat", "ev_zero", "ev_billboard", "ev_relic" };
    foreach (var id in ids) ConsequenceEngine.OnEventResolved(s, GameData.Events[id], true);
    Ok("同时最多追踪 5 条", s.Consequences.Count == 5, s.Consequences.Count.ToString());
    Ok("最新的一条在列", s.Consequences.Any(c => c.Id == "relic_chance"), string.Join(",", s.Consequences.Select(c => c.Id)));
    Ok("最早的一条已退场", s.Consequences.All(c => c.Id != "market_debt"), string.Join(",", s.Consequences.Select(c => c.Id)));
    Ok("退场时也记了日志", s.Log.Any(l => l.Text.Contains("后果过多")), "no log");
}

/* ── 4. 下一幕资源：兑现后消失，不会重复发 ─────────────────────── */
{
    var s = Start(2);
    ConsequenceEngine.OnEventResolved(s, GameData.Events["ev_firewall"], true);
    var bonus = ConsequenceEngine.OnActStart(s);
    Ok("下一幕记忆币 +50", bonus == 50, bonus.ToString());
    var again = ConsequenceEngine.OnActStart(s);
    Ok("不会重复兑现", again == 0, again.ToString());
}

/* ── 5. 敌人命中 / Boss 血量：可查询、可解释 ──────────────────── */
{
    var s = Start();
    ConsequenceEngine.OnEventResolved(s, GameData.Events["ev_signal"], true);
    Ok("敌人命中 −5", ConsequenceEngine.EnemyAccuracyMod(s) == -5, ConsequenceEngine.EnemyAccuracyMod(s).ToString());
    ConsequenceEngine.OnEventResolved(s, GameData.Events["ev_zero"], true);
    Ok("Boss 生命 ×1.05", Math.Abs(ConsequenceEngine.BossHpMul(s) - 1.05) < 0.001, ConsequenceEngine.BossHpMul(s).ToString("0.00"));
}

/* ── 6. 遗物：留 1 HP，且只用一次 ─────────────────────────────── */
{
    var s = Start();
    ConsequenceEngine.OnEventResolved(s, GameData.Events["ev_relic"], true);
    Ok("遗物可用", ConsequenceEngine.LastStand(s));
    ConsequenceEngine.ConsumeLastStand(s);
    Ok("用掉后失效", !ConsequenceEngine.LastStand(s));
    Ok("用掉后后果移除", s.Consequences.All(c => c.Id != "relic_chance"), s.Consequences.Count.ToString());
}

/* ── 7. 路线后果：多揭示一层 ──────────────────────────────────── */
{
    var s = Start();
    ConsequenceEngine.OnEventResolved(s, GameData.Events["ev_billboard"], true);
    var all = s.Nodes.ToList();
    foreach (var n in all) n.Revealed = false;
    var start = all.First(n => n.Type == NodeType.Start);
    start.Revealed = true;
    ConsequenceEngine.OnNodeEntered(s, start);
    var revealed = all.Count(n => n.Revealed);
    Ok("路线后果揭示邻居及其邻居", revealed >= 3, revealed.ToString());
}

/* ── 8. 关系：支援推进等级，等级 2/3 有可解释加成 ─────────────── */
{
    var s = Start();
    var a = s.Players[0].Id;
    var b = s.Players[1].Id;
    Ok("初始关系等级 0", RelationshipEngine.LevelOf(s, a, b) == 0);
    for (var i = 0; i < 3; i++) RelationshipEngine.OnAssist(s, a, b);
    Ok("3 点后到等级 1", RelationshipEngine.LevelOf(s, a, b) == 1, RelationshipEngine.LevelOf(s, a, b).ToString());
    for (var i = 0; i < 3; i++) RelationshipEngine.OnSynergy(s, a, b);
    Ok("6 点后到等级 2", RelationshipEngine.LevelOf(s, a, b) == 2, RelationshipEngine.LevelOf(s, a, b).ToString());
    for (var i = 0; i < 3; i++) RelationshipEngine.OnSynergy(s, b, a);
    Ok("9 点后到等级 3", RelationshipEngine.LevelOf(s, a, b) == 3, RelationshipEngine.LevelOf(s, a, b).ToString());
    Ok("等级推进写日志", s.Log.Any(l => l.Text.Contains("后背")), "no log");
    Ok("关系描述可读", RelationshipEngine.Describe(s, RelationshipEngine.Find(s, a, b)!).Contains("护甲"),
        RelationshipEngine.Describe(s, RelationshipEngine.Find(s, a, b)!));
}

/* ── 9. 关系加成只在同场战斗生效，且不会重复叠 ────────────────── */
{
    var s = Start();
    var a = s.Players[0].Id;
    var b = s.Players[1].Id;
    for (var i = 0; i < 9; i++) RelationshipEngine.OnSynergy(s, a, b);
    var node = s.Nodes.First(n => n.Type is NodeType.Combat or NodeType.Skirmish);
    s.ActivePlayerId = a;
    s.ActivePlayer!.NodeId = node.Id;
    s.Players[1].NodeId = node.Id;   // 同场作战才吃关系加成
    GameEngine.ApplyAction(s, new GameAction { Type = "interact", PlayerId = a, NodeId = node.Id });
    Ok("进入战斗", s.Combat is not null, s.Phase.ToString());
    if (s.Combat is not null)
    {
        var ua = s.Combat.Units.FirstOrDefault(u => u.PlayerId == a);
        var ub = s.Combat.Units.FirstOrDefault(u => u.PlayerId == b);
        Ok("关系 +3 命中", ua is not null && ub is not null && ua.AccuracyBonus >= 3 && ub.AccuracyBonus >= 3,
            $"{ua?.AccuracyBonus} / {ub?.AccuracyBonus}");
        var baseArmor = 3;
        Ok("关系 3 级 +1 护甲", ua is not null && ua.Armor > baseArmor, ua?.Armor.ToString() ?? "null");
        Ok("战斗日志解释了加成", s.Combat.Log.Any(l => l.Contains("关系")), "no log");
    }
}

/* ── 10. 隐私：关系不跨角色写错，且不会自己跟自己组队 ─────────── */
{
    var s = Start();
    var a = s.Players[0].Id;
    RelationshipEngine.Touch(s, a, a, 5, "自恋");
    Ok("不与自己建立关系", s.Relationships.Count == 0, s.Relationships.Count.ToString());
    RelationshipEngine.OnAssist(s, a, s.Players[1].Id);
    RelationshipEngine.OnAssist(s, s.Players[1].Id, a);
    Ok("A→B 与 B→A 是同一条关系", s.Relationships.Count == 1 && s.Relationships[0].Points == 2,
        $"{s.Relationships.Count} / {s.Relationships.FirstOrDefault()?.Points}");
}

/* ── 11. 同行推进：同节点才加，重复进入不刷分 ─────────────────── */
{
    var s = Start();
    var a = s.Players[0].Id;
    var b = s.Players[1].Id;
    var node = s.Nodes.First(n => n.Type == NodeType.Start);
    s.Players[0].NodeId = node.Id;
    s.Players[1].NodeId = node.Id;
    RelationshipEngine.OnSameNode(s, node);
    var p1 = RelationshipEngine.Find(s, a, b)?.Points ?? 0;
    RelationshipEngine.OnSameNode(s, node);
    var p2 = RelationshipEngine.Find(s, a, b)?.Points ?? 0;
    Ok("同节点推进一次", p1 == 1, p1.ToString());
    Ok("同一节点不重复刷", p2 == p1, $"{p1} → {p2}");
}

/* ── 12. 章节回顾：换幕时定格，数字能对上 ─────────────────────── */
{
    var s = Start();
    var node = s.Nodes.First(n => n.Type is NodeType.Combat or NodeType.Skirmish);
    s.ActivePlayer!.NodeId = node.Id;
    GameEngine.ApplyAction(s, new GameAction { Type = "interact", PlayerId = s.ActivePlayerId, NodeId = node.Id });
    var battlesBefore = s.Stats.Battles;
    s.Phase = GamePhase.ActTransition;
    GameEngine.AdvanceAct(s);
    var recap = s.Recaps.LastOrDefault();
    Ok("换幕后生成章节回顾", recap is not null && recap.Act == 1, recap?.Act.ToString() ?? "null");
    Ok("回顾的战斗数对得上", recap is not null && recap.Battles == battlesBefore, $"{recap?.Battles} / {battlesBefore}");
    Ok("回顾有幕名", !string.IsNullOrWhiteSpace(recap?.Name), recap?.Name ?? "null");
    Ok("回顾不重复生成", s.Recaps.Count == 1, s.Recaps.Count.ToString());
    Ok("换幕后快照重置为新一幕", s.ActStart.Act == 2, s.ActStart.Act.ToString());
}

Console.WriteLine($"===== {pass} passed, {fail} failed =====");
return fail == 0 ? 0 : 1;
