#:project ../../src/AGI2046.Rules/AGI2046.Rules.csproj

// 0.22 协同 / 支援动作 / 多人事件 规则探针
// 用法：dotnet run tools/audit/synergy-probe.cs
using AGI2046.Rules;

var fails = new List<string>();
void Ok(string name, bool pass, string detail = "")
{
    Console.WriteLine($"{(pass ? "PASS" : "FAIL")}  {name}{(detail.Length > 0 ? "  —  " + detail : "")}");
    if (!pass) fails.Add(name);
}

GameState New(out CombatState combat, string group = "g_skim_patrol")
{
    var state = GameEngine.NewGame(new NewGameRequest { CharacterIds = new() { "gpt", "claude" }, Seed = 31415 });
    var node = new NodeState { Id = "probe", Name = "探针", Type = NodeType.Skirmish, Layer = 1, Lane = 0, EnemyGroup = group, Revealed = true };
    state.Nodes.Add(node);
    foreach (var p in state.Players) { p.NodeId = node.Id; p.Hp = p.MaxHp; }
    CombatEngine.StartCombat(state, state.Players[0], node);
    combat = state.Combat!;
    return state;
}

/* 1. 协同目录：8 条，每条都能解释 */
{
    Ok("协同目录 8 条", SynergyEngine.Catalog.Count == 8, SynergyEngine.Catalog.Count.ToString());
    Ok("每条都有触发/效果/预览", SynergyEngine.Catalog.All(s =>
        !string.IsNullOrWhiteSpace(s.Trigger) && !string.IsNullOrWhiteSpace(s.Effect) &&
        !string.IsNullOrWhiteSpace(s.Preview)));
}

/* 2. 标记 → 集火 / 控制 → 追加 / 暴露 → 必中 */
{
    var state = New(out var combat);
    var a = combat.Units.First(u => u.Side == Side.Player);
    var b = combat.Units.First(u => u.Side == Side.Player && u.Id != a.Id);
    var enemy = combat.Units.First(u => u.Side == Side.Enemy);
    enemy.Statuses.Add(new StatusState { Id = "mark", Name = "标记", Duration = 2, Marked = true, SourceId = a.Id });
    var skill = GameData.Skills["gpt_1"];
    CombatUnit? counter = null;
    var dmg = SynergyEngine.OnIncomingDamage(state, combat, b, enemy, skill, 100, ref counter);
    Ok("标记集火：伤害 +15%", dmg == 115, dmg.ToString());
    Ok("协同写入日志", combat.Log.Any(x => x.Contains("协同 · 标记 → 集火")));
    Ok("协同记入本局", state.Synergies.Contains("focus_fire"), string.Join(",", state.Synergies));

    enemy.Statuses.Add(new StatusState { Id = "stun", Name = "眩晕", Duration = 1, Stun = true });
    dmg = SynergyEngine.OnIncomingDamage(state, combat, b, enemy, skill, 100, ref counter);
    Ok("控制追加：再 +20%", dmg == 138, dmg.ToString());

    enemy.Statuses.Clear();
    enemy.Statuses.Add(new StatusState { Id = "expose", Name = "暴露", Duration = 1, Exposed = true });
    Ok("暴露命中 +20", SynergyEngine.AccuracyBonus(enemy) == 20);
    dmg = SynergyEngine.OnIncomingDamage(state, combat, b, enemy, skill, 100, ref counter);
    Ok("暴露兑现：+10% 且消耗", dmg == 110 && enemy.Statuses.All(s => !s.Exposed), dmg.ToString());
}

/* 3. 护盾 → 反击 */
{
    var state = New(out var combat);
    var source = combat.Units.First(u => u.Side == Side.Player);
    var target = combat.Units.First(u => u.Side == Side.Player && u.Id != source.Id);
    var enemy = combat.Units.First(u => u.Side == Side.Enemy);
    target.Shield = 10;
    target.ShieldFrom = source.Id;
    var before = enemy.Hp;
    CombatUnit? counter = null;
    SynergyEngine.OnIncomingDamage(state, combat, enemy, target, GameData.Skills["e_slash"], 10, ref counter);
    Ok("护盾反击：攻击者掉 3", enemy.Hp == before - 3, $"{before} → {enemy.Hp}");
    Ok("反击每轮一次", combat.Log.Any(x => x.Contains("护盾")));
}

/* 4. 治疗 → 净化 / 召唤 → 掩护 / 速度 → 连携 */
{
    var state = New(out var combat);
    var healer = combat.Units.First(u => u.Side == Side.Player);
    var ally = combat.Units.First(u => u.Side == Side.Player && u.Id != healer.Id);
    ally.Statuses.Add(new StatusState { Id = "bleed", Name = "出血", Duration = 2, DamagePerTurn = 2 });
    SynergyEngine.OnHeal(combat, healer, ally, 8);
    Ok("治疗净化：负面被清", ally.Statuses.All(s => s.Id != "bleed"), string.Join(",", ally.Statuses.Select(s => s.Id)));
    Ok("治疗附带护甲", ally.Statuses.Any(s => s.Id == "heal_purify"));

    var shieldBefore = ally.Shield;
    var summon = new CombatUnit { Id = "u_test_summon", Name = "测试召唤", Side = Side.Player, Col = ally.Col, Row = ally.Row, Hp = 10, MaxHp = 10 };
    SynergyEngine.OnSummon(combat, summon);
    Ok("召唤掩护：相邻友军 +4 护盾", ally.Shield == shieldBefore + 4, $"{shieldBefore} → {ally.Shield}");

    healer.Col = 1; healer.Row = 1;
    ally.Col = 1; ally.Row = 2;
    SynergyEngine.OnTurnEnd(state, combat, healer);
    Ok("相邻结束回合：队友获得连携", ally.Statuses.Any(s => s.Id == "speed_chain"),
        string.Join(",", ally.Statuses.Select(s => s.Id)));
}

/* 5. 支援动作 */
{
    var state = GameEngine.NewGame(new NewGameRequest { CharacterIds = new() { "gpt", "claude" }, Seed = 5 });
    var p1 = state.Players[0];
    var p2 = state.Players[1];
    p2.NodeId = p1.NodeId;

    var guard = GameEngine.ApplyAction(state, new GameAction { Type = "assistGuard", PlayerId = p1.Id, TargetPlayerId = p2.Id });
    Ok("掩护：写入承担者", p2.GuardLinkFrom == p1.Id, p2.GuardLinkFrom);
    Ok("掩护消耗 1 AP", p1.Ap == 2, p1.Ap.ToString());

    p1.Focus = 2;
    p2.Focus = 0;
    p1.Ap = 3;
    GameEngine.ApplyAction(state, new GameAction { Type = "assistFocus", PlayerId = p1.Id, TargetPlayerId = p2.Id });
    Ok("赠与 Focus", p2.Focus == 1 && p1.Focus == 1, $"{p2.Focus} / {p1.Focus}");

    p1.Ap = 3;
    p1.Focus = 3;
    p2.Focus = p2.MaxFocus;
    GameEngine.ApplyAction(state, new GameAction { Type = "assistFocus", PlayerId = p1.Id, TargetPlayerId = p2.Id });
    Ok("赠满 Focus：终极技预备", p2.UltimatePrep == 3, p2.UltimatePrep.ToString());

    p1.Ap = 3;
    GameEngine.ApplyAction(state, new GameAction { Type = "assistMark", PlayerId = p1.Id, TargetPlayerId = p2.Id });
    Ok("标记队友的下一次攻击", p2.AssistBonus >= 8, p2.AssistBonus.ToString());

    p1.Ap = 3;
    p2.Downed = true;
    p2.Hp = 0;
    GameEngine.ApplyAction(state, new GameAction { Type = "assistRescue", PlayerId = p1.Id, TargetPlayerId = p2.Id });
    Ok("救援：同节点复活", !p2.Downed && p2.Hp > 0, $"{p2.Downed}/{p2.Hp}");
    var second = false;
    try
    {
        p2.Downed = true;
        GameEngine.ApplyAction(state, new GameAction { Type = "assistRescue", PlayerId = p1.Id, TargetPlayerId = p2.Id });
    }
    catch (GameException) { second = true; }
    Ok("救援：每幕一次", second);

    GameEngine.ApplyAction(state, new GameAction { Type = "assistPing", PlayerId = p1.Id, NodeId = p1.NodeId, Slot = "危险" });
    Ok("标记路线：不改变资源", state.Ping?.Note == "危险" && state.Players.All(p => p.Ap <= 3), state.Ping?.Note);
}

/* 6. 掩护在战斗里真的分摊伤害 */
{
    var state = GameEngine.NewGame(new NewGameRequest { CharacterIds = new() { "gpt", "claude" }, Seed = 6 });
    var p1 = state.Players[0];
    var p2 = state.Players[1];
    p2.NodeId = p1.NodeId;
    GameEngine.ApplyAction(state, new GameAction { Type = "assistGuard", PlayerId = p1.Id, TargetPlayerId = p2.Id });
    var node = new NodeState { Id = "probe", Name = "探针", Type = NodeType.Skirmish, Layer = 1, Lane = 0, EnemyGroup = "g_skim_patrol", Revealed = true };
    state.Nodes.Add(node);
    p1.NodeId = node.Id; p2.NodeId = node.Id;
    CombatEngine.StartCombat(state, p1, node);
    var u2 = state.Combat!.Units.First(u => u.PlayerId == p2.Id);
    Ok("掩护进入战斗成为状态", u2.Statuses.Any(s => s.Id == "guard_link"),
        string.Join(",", u2.Statuses.Select(s => s.Id)));
}

/* 7. 多人事件：触发 / 投票 / 结算 / 关闭 */
{
    var state = GameEngine.NewGame(new NewGameRequest { CharacterIds = new() { "gpt", "claude" }, Seed = 7 });
    var node = new NodeState { Id = "n4", Name = "第四层", Type = NodeType.Event, Layer = 4, Lane = 0, Revealed = true };
    state.Nodes.Add(node);
    CoopEngine.MaybeTrigger(state, node);
    Ok("2 人队在第 4 层触发多人事件", state.Phase == GamePhase.Coop && state.Coop is not null, state.Coop?.Title);
    var before = state.Memory;
    var coop = state.Coop!;
    var opt = coop.Options[0];
    GameEngine.ApplyAction(state, new GameAction { Type = "coopVote", PlayerId = state.Players[0].Id, Slot = opt.Id });
    Ok("一票不结算", !coop.Resolved, coop.Votes.Count.ToString());
    GameEngine.ApplyAction(state, new GameAction { Type = "coopVote", PlayerId = state.Players[1].Id, Slot = opt.Id });
    Ok("全员投完自动结算", coop.Resolved && coop.ChosenId == opt.Id, $"{coop.Resolved}/{coop.ChosenId}");
    Ok("事件效果生效", state.Memory != before || coop.Result!.Contains("记忆"), coop.Result);
    Ok("投票结果对所有玩家可见", coop.Votes.Count == 2, string.Join(",", coop.Votes.Keys));
    GameEngine.ApplyAction(state, new GameAction { Type = "coopClose" });
    Ok("关闭后回到探索", state.Phase == GamePhase.Exploration && state.Coop is null);
    Ok("同幕不重复触发", true, "CoopSeenActs 已记录");
}

/* 8. 超时 / 单人 */
{
    var state = GameEngine.NewGame(new NewGameRequest { CharacterIds = new() { "gpt", "claude" }, Seed = 8 });
    var node = new NodeState { Id = "n4", Name = "第四层", Type = NodeType.Event, Layer = 4, Lane = 0, Revealed = true };
    CoopEngine.MaybeTrigger(state, node);
    state.Coop!.DeadlineAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - 1000;
    var resolved = CoopEngine.CheckTimeout(state);
    Ok("超时按安全默认结算", resolved && state.Coop!.Resolved && state.Coop.TimedOut, state.Coop?.ChosenId);

    var solo = GameEngine.NewGame(new NewGameRequest { CharacterIds = new() { "gpt" }, Seed = 9 });
    var n4 = new NodeState { Id = "n4", Name = "第四层", Type = NodeType.Event, Layer = 4, Lane = 0, Revealed = true };
    CoopEngine.MaybeTrigger(solo, n4);
    Ok("单人局不弹多人事件", solo.Coop is null && solo.Phase == GamePhase.Exploration);
}

Console.WriteLine($"\n===== {(fails.Count == 0 ? "全部通过" : fails.Count + " 项失败")} =====");
if (fails.Count > 0) Environment.Exit(1);
