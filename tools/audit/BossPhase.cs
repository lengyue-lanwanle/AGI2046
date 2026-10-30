#:project ../../src/AGI2046.Rules/AGI2046.Rules.csproj

// Boss 二阶段规则探针：不是"有没有横幅"，而是"规则有没有真的变"。
// 用法：dotnet run tools/audit/BossPhase.cs
using AGI2046.Rules;

int pass = 0, total = 0;
void Ok(string name, bool cond, string detail = "")
{
    total++;
    if (cond) pass++;
    Console.WriteLine($"{(cond ? "PASS" : "FAIL")}  {name}{(detail == "" ? "" : "  —  " + detail)}");
}

GameState GameFor(int act, string bossId)
{
    var g = GameEngine.NewGame(new NewGameRequest { CharacterIds = new() { "gpt", "claude", "deepseek", "jev" }, Seed = 4242 });
    var node = new NodeState
    {
        Id = "n_boss_test",
        Type = NodeType.Boss,
        Name = "测试首领",
        District = "测试区",
        X = 600,
        Y = 300,
        Revealed = true
    };
    g.Nodes.Add(node);
    g.Edges.RemoveAll(_ => true);
    g.Act = act;
    foreach (var p in g.Players)
    {
        p.NodeId = node.Id;
        p.Ap = 2;
    }
    g.ActivePlayerId = "p1";
    var player = g.Players[0];
    var state = CombatEngine.StartCombat(g, player, node);
    // 把首领换成指定 Boss（StartCombat 按节点组队，这里直接替换，保证探针稳定）
    var combat = state.Combat!;
    var def = GameData.Enemies[bossId];
    combat.Units.RemoveAll(u => u.Role == "首领");
    var boss = new CombatUnit
    {
        Id = "u_boss",
        Name = def.Name,
        Side = Side.Enemy,
        EnemyId = def.Id,
        Role = def.Role,
        Hp = def.Hp,
        MaxHp = def.Hp,
        Armor = def.Armor,
        Resistance = def.Resistance,
        Evasion = def.Evasion,
        Speed = def.Speed,
        Col = 5,
        Row = 2,
        Movement = 2,
        MovementLeft = 2,
        SkillIds = def.SkillIds.ToList(),
        Stats = new Stats(60, 60, 60, 60, def.Speed, 50),
        WeaponDice = 2,
        WeaponAccuracy = 70,
        WeaponDamage = 4
    };
    combat.Units.Add(boss);
    combat.TurnOrder.Insert(0, boss.Id);
    combat.ActiveUnitId = combat.TurnOrder[0];
    return state;
}

// 把首领打到半血以下，再让玩家"结束回合"触发一次 FinishUnitTurn
GameState BreakHalf(GameState g)
{
    var c = g.Combat!;
    var boss = c.Units.First(u => u.Role == "首领");
    boss.Hp = boss.MaxHp / 2 - 1;
    var actor = c.Units.First(u => u.Side == Side.Player && !u.Downed);
    c.ActiveUnitId = actor.Id;
    return CombatEngine.ApplyCombatAction(g, new GameAction { Type = "combatDefend", PlayerId = actor.PlayerId });
}

// 推进若干轮：玩家结束回合 → 敌方回合自动跑完 → 进下一轮
GameState AdvanceRounds(GameState g, int rounds)
{
    var c = g.Combat!;
    var target = c.Round + rounds;
    for (var i = 0; i < 60 && c.Round < target && !c.IsOver; i++)
    {
        var active = c.Units.FirstOrDefault(u => u.Id == c.ActiveUnitId);
        if (active is null) break;
        if (active.Side == Side.Player)
            CombatEngine.ApplyCombatAction(g, new GameAction { Type = "combatEndTurn", PlayerId = active.PlayerId });
        else
            CombatEngine.Resume(g);
    }
    return g;
}

Console.WriteLine("\n── 拍卖人 · 清仓 ─────────────────────────────");
{
    var g = BreakHalf(GameFor(1, "e_boss_auctioneer"));
    var c = g.Combat!;
    Ok("进入二阶段", c.BossPhase == 2, $"phase={c.BossPhase}");
    Ok("阶段名是清仓", c.BossPhaseName == "清仓", c.BossPhaseName ?? "");
    Ok("召出记忆盲盒", c.Units.Any(u => u.Name == "记忆盲盒" && u.Side == Side.Enemy), string.Join('/', c.Units.Select(u => u.Name)));
    var boss = c.Units.First(u => u.Role == "首领");
    boss.Hp = boss.MaxHp - 20;
    var before = boss.Hp;
    AdvanceRounds(g, 4);
    var after = c.Units.First(u => u.Role == "首领").Hp;
    Ok("偶数轮回收生命", c.Log.Any(l => l.Contains("清仓")) && after > before, $"before={before} after={after}");
}

Console.WriteLine("\n── 镜面执政官 · 分摊 ─────────────────────────");
{
    var g = BreakHalf(GameFor(2, "e_boss_archon"));
    var c = g.Combat!;
    Ok("进入二阶段", c.BossPhase == 2, $"phase={c.BossPhase}");
    Ok("阶段名是分摊", c.BossPhaseName == "分摊", c.BossPhaseName ?? "");
    Ok("分裂出执政官镜像", c.Units.Any(u => u.Name == "执政官镜像"), string.Join('/', c.Units.Select(u => u.Name)));
}

Console.WriteLine("\n── 零号主脑 · 上传倒计时 ─────────────────────");
{
    var g = BreakHalf(GameFor(3, "e_boss_zero"));
    var c = g.Combat!;
    Ok("进入二阶段", c.BossPhase == 2, $"phase={c.BossPhase}");
    Ok("阶段名是上传倒计时", c.BossPhaseName == "上传倒计时", c.BossPhaseName ?? "");
    Ok("护盾清零", c.Units.First(u => u.Role == "首领").Shield == 0);
    var purgeBefore = g.Purge;
    AdvanceRounds(g, 6);
    Ok("每 3 轮额外扣追踪", c.Log.Any(l => l.Contains("上传推进")) && g.Purge < purgeBefore, $"{purgeBefore} → {g.Purge}");
    Ok("二阶段掉防（让终局打得完）", c.Units.First(u => u.Role == "首领").Armor <= 4, $"armor={c.Units.First(u => u.Role == "首领").Armor}");
}

Console.WriteLine("\n── 回归：普通敌人不会误触发 ───────────────────");
{
    var g = GameFor(1, "e_boss_auctioneer");
    var c = g.Combat!;
    var elite = c.Units.First(u => u.Role != "首领" && u.Side == Side.Enemy);
    elite.Hp = 1;
    var actor = c.Units.First(u => u.Side == Side.Player && !u.Downed);
    c.ActiveUnitId = actor.Id;
    g = CombatEngine.ApplyCombatAction(g, new GameAction { Type = "combatDefend", PlayerId = actor.PlayerId });
    Ok("普通敌人掉血不切阶段", g.Combat!.BossPhase == 1, $"phase={g.Combat!.BossPhase}");
    Ok("没有误召唤", !g.Combat!.Units.Any(u => u.Name is "记忆盲盒" or "执政官镜像"));
}

Console.WriteLine($"\n{pass}/{total} 通过");
return pass == total ? 0 : 1;
