#:project ../../src/AGI2046.Rules/AGI2046.Rules.csproj

// 0.21 挑战模式 / 变异效果 / 复盘评级 规则探针
// 用法：dotnet run tools/audit/challenge-probe.cs
using AGI2046.Rules;

var fails = new List<string>();
void Ok(string name, bool pass, string detail = "")
{
    Console.WriteLine($"{(pass ? "PASS" : "FAIL")}  {name}{(detail.Length > 0 ? "  —  " + detail : "")}");
    if (!pass) fails.Add(name);
}

ChallengeRun Run(params string[] mutators)
    => ChallengeEngine.BuildRun(new ChallengeConfig { Seed = 7777, MutatorIds = mutators.ToList() },
        Unlocks.Catalog.Select(u => u.Id).ToHashSet(StringComparer.OrdinalIgnoreCase), 7777);

GameState Start(params string[] mutators)
{
    var state = GameEngine.NewGame(new NewGameRequest
    {
        CharacterIds = new() { "gpt", "claude" },
        PreparedChallenge = Run(mutators)
    });
    return state;
}

/* 1. 目录完整性：每条变异都必须有说明/风险/奖励/策略 */
{
    Ok("变异目录 ≥ 16 条", GameData.Mutators.Count >= 16, GameData.Mutators.Count.ToString());
    var incomplete = GameData.Mutators.Where(m =>
        string.IsNullOrWhiteSpace(m.Name) || string.IsNullOrWhiteSpace(m.Desc) ||
        string.IsNullOrWhiteSpace(m.Risk) || string.IsNullOrWhiteSpace(m.Reward) ||
        string.IsNullOrWhiteSpace(m.Strategy)).Select(m => m.Id).ToList();
    Ok("每条都有说明/风险/奖励/策略", incomplete.Count == 0, string.Join(",", incomplete));
    Ok("4 条解锁变异", GameData.Mutators.Count(m => m.UnlockId is not null) == 4,
        GameData.Mutators.Count(m => m.UnlockId is not null).ToString());
    Ok("解锁条目都在目录里", GameData.Mutators.Where(m => m.UnlockId is not null)
        .All(m => Unlocks.Get(m.UnlockId!) is not null));
}

/* 2. 基础变异效果 */
{
    var glass = Start("glass");
    var plain = Start();
    var gHp = glass.Players[0].MaxHp;
    var pHp = plain.Players[0].MaxHp;
    Ok("玻璃队伍：最大生命 −25%", Math.Abs(gHp - Math.Round(pHp * 0.75)) <= 2, $"{pHp} → {gHp}");

    Ok("赤贫协议：开局 0 记忆", Start("poverty").Memory == 0, Start("poverty").Memory.ToString());
    Ok("铁人协议：队伍生命 1", Start("ironman").TeamLives == 1, Start("ironman").TeamLives.ToString());
    Ok("追踪加速：3 回合 1 格", ChallengeEngine.PurgeTickEvery(Start("tracking_fast")) == 3);
    Ok("常规：4 回合 1 格", ChallengeEngine.PurgeTickEvery(Start()) == 4);
    Ok("资源匮乏：商店 ×1.35", Math.Abs(ChallengeEngine.ShopPriceMul(Start("scarcity")) - 1.35) < 0.001);
    Ok("敌意协议：敌方增伤", ChallengeEngine.EnemyDamageMul(Start("hostile")) > 1.1,
        ChallengeEngine.EnemyDamageMul(Start("hostile")).ToString("0.###"));
    Ok("少数派：队伍上限 3", ChallengeEngine.TeamCap(Start("few")) == 3);
    Ok("猎杀协议：精英生命 ×1.4", Math.Abs(ChallengeEngine.EliteHpMul(Start("elite_hunt")) - 1.4) < 0.001);

    var noSafe = Start("no_safehouse");
    Ok("无安全屋：5 → 3 个", noSafe.Nodes.Count(n => n.Type == NodeType.Safehouse) == 3,
        noSafe.Nodes.Count(n => n.Type == NodeType.Safehouse).ToString());

    var fault = Start("global_fault");
    Ok("全局故障：预告关闭类型", !string.IsNullOrWhiteSpace(fault.ClosedNodeType), fault.ClosedNodeType);
    Ok("全局故障：该类型全部下线",
        fault.Nodes.Count(n => n.Type.ToString() == fault.ClosedNodeType) == 0);

    var fog = Start("fog");
    var revealed = fog.Nodes.Count(n => n.Revealed);
    Ok("迷雾协议：只揭示起点与相邻", revealed <= 8, $"{revealed} 个可见");
}

/* 3. 战斗 hook：冷却 / 过热 / 镜像 / 精英加血 */
{
    var state = Start("cooldown", "overheat", "mirror");
    var node = new NodeState { Id = "probe", Name = "探针", Type = NodeType.Elite, Layer = 1, Lane = 0, EnemyGroup = "g_skim_patrol", Revealed = true };
    state.Nodes.Add(node);
    state.Players[0].NodeId = node.Id;
    CombatEngine.StartCombat(state, state.Players[0], node);
    var combat = state.Combat!;
    var caster = combat.Units.First(u => u.Side == Side.Player);
    var skill = GameData.Skills["gpt_1"];
    var beforeAcc = caster.AccuracyBonus;
    ChallengeEngine.OnSkillUsed(state, combat, caster, skill);
    Ok("冷却失控：技能冷却 +1", caster.Cooldowns.GetValueOrDefault("gpt_1") >= 1, caster.Cooldowns.GetValueOrDefault("gpt_1").ToString());
    ChallengeEngine.OnSkillUsed(state, combat, caster, skill);
    Ok("过热：重复技能减命中", caster.AccuracyBonus <= beforeAcc - 8, $"{beforeAcc} → {caster.AccuracyBonus}");
    Ok("镜像：两层复制", combat.MirrorStacks == 2, combat.MirrorStacks.ToString());
    Ok("镜像：敌方护甲上调", combat.Units.Where(u => u.Side == Side.Enemy).All(u => u.Armor >= 4),
        string.Join(",", combat.Units.Where(u => u.Side == Side.Enemy).Select(u => u.Armor)));

    var elite = Start("elite_hunt");
    var eliteNode = new NodeState { Id = "e", Name = "精英", Type = NodeType.Elite, Layer = 1, Lane = 0, EnemyGroup = "g_skim_patrol", Revealed = true };
    elite.Nodes.Add(eliteNode);
    elite.Players[0].NodeId = eliteNode.Id;
    CombatEngine.StartCombat(elite, elite.Players[0], eliteNode);
    // g_skim_patrol = 巡逻哨兵 32 HP；小规模缩放后仍应比无变异高 40%
    var plainElite = Start();
    plainElite.Nodes.Add(new NodeState { Id = "e", Name = "精英", Type = NodeType.Elite, Layer = 1, Lane = 0, EnemyGroup = "g_skim_patrol", Revealed = true });
    plainElite.Players[0].NodeId = "e";
    CombatEngine.StartCombat(plainElite, plainElite.Players[0], plainElite.Nodes.Last());
    var a = elite.Combat!.Units.First(u => u.Side == Side.Enemy).MaxHp;
    var b = plainElite.Combat!.Units.First(u => u.Side == Side.Enemy).MaxHp;
    Ok("猎杀协议：精英血量更高", a > b, $"{b} → {a}");
}

/* 4. 反囤积：换幕清空消耗品 */
{
    var state = Start("no_hoard");
    state.Players[0].Consumables["medkit"] = 3;
    state.Phase = GamePhase.ActTransition;
    state.Act = 1;
    state.BossDefeated = true;
    GameEngine.AdvanceAct(state);
    Ok("反囤积：换幕后消耗品作废", state.Players.All(p => p.Consumables.Count == 0),
        state.Players.Sum(p => p.Consumables.Count).ToString());
    Ok("反囤积：进入第 2 幕", state.Act == 2 && state.Phase == GamePhase.Exploration);
}

/* 5. 复盘与评级 */
{
    var state = Start("tracking_fast", "glass");
    state.Phase = GamePhase.Defeat;
    state.DefeatedBy = "电子追踪归零";
    state.Purge = 0;
    state.Stats.Battles = 9;
    state.Stats.Victories = 7;
    state.Stats.CombatRounds = 41;
    state.Stats.DamageBySkill["提示注入"] = 88;
    state.Stats.RetreatAttempts = 2;
    state.Stats.RetreatSuccess = 1;
    RunAnalytics.Finalize(state);
    Ok("失败也有复盘", state.Review is not null, state.Review?.Reason);
    Ok("复盘写清失败阶段", !string.IsNullOrWhiteSpace(state.Review?.FailureStage), state.Review?.FailureStage);
    Ok("复盘给出关键原因", (state.Review?.KeyCause ?? "").Contains("追踪"), state.Review?.KeyCause);
    Ok("复盘带最近 10 个行动", (state.Review?.LastActions.Count ?? 0) <= 10, (state.Review?.LastActions.Count ?? 0).ToString());
    Ok("复盘给出下局建议", !string.IsNullOrWhiteSpace(state.Review?.Suggestion), state.Review?.Suggestion);
    Ok("复盘记录本局变异", (state.Review?.Mutators.Count ?? 0) == 2, string.Join("/", state.Review?.Mutators ?? new()));
    Ok("失败也有评级（不阻塞）", state.Rating is not null && state.Rating.Grade is "S" or "A" or "B" or "C",
        $"{state.Rating?.Grade} {state.Rating?.Score}");
    Ok("评级 7 个维度", state.Rating?.Dimensions.Count == 7, (state.Rating?.Dimensions.Count ?? 0).ToString());
    Ok("评级带备注", state.Rating!.Dimensions.All(d => !string.IsNullOrWhiteSpace(d.Note)));
    Ok("挑战局记录完成时间与结果",
        state.Challenge?.CompletedAt is not null && state.Challenge?.Result == "defeat",
        state.Challenge?.Result);

    var victory = Start("elite_hunt");
    victory.Phase = GamePhase.Victory;
    victory.Act = 3;
    victory.QuestClaims = 3;
    victory.Purge = victory.PurgeMax;
    victory.Stats.Battles = 12;
    victory.Stats.Victories = 12;
    victory.Stats.CombatRounds = 40;
    victory.Stats.Assists = 3;
    victory.Stats.SynergyTriggers = 2;
    RunAnalytics.Finalize(victory);
    Ok("通关评级可到 S/A", victory.Rating!.Grade is "S" or "A", $"{victory.Rating.Grade} {victory.Rating.Score}");
    Ok("通关解锁新内容", victory.Rating.UnlockedIds.Count > 0, string.Join(",", victory.Rating.UnlockedIds));
    Ok("解锁不会给永久数值", victory.Rating.UnlockedIds.All(id => Unlocks.Get(id)?.Kind != "stat"));
}

/* 6. 同 seed 同变异 = 同地图（纯规则层可复现） */
{
    var a = Start("scarcity", "tracking_fast");
    var b = Start("scarcity", "tracking_fast");
    var c = ChallengeEngine.BuildRun(new ChallengeConfig { Seed = 8888, MutatorIds = new() { "scarcity", "tracking_fast" } },
        new HashSet<string>(), 8888);
    var d = GameEngine.NewGame(new NewGameRequest { CharacterIds = new() { "gpt", "claude" }, PreparedChallenge = c });
    string Sig(GameState s) => string.Join("|", s.Nodes.Select(n => $"{n.Id}:{n.Type}:{n.EnemyGroup}"));
    Ok("同 seed 同变异地图一致", Sig(a) == Sig(b));
    Ok("不同 seed 地图不同", Sig(a) != Sig(d));
    Ok("挑战倍率随变异累加", a.Challenge!.ScoreMultiplier > 1.3, a.Challenge.ScoreMultiplier.ToString("0.##"));
}

/* 7. 旧请求不因新字段报错 */
{
    var plain = GameEngine.NewGame(new NewGameRequest { CharacterIds = new() { "gpt" } });
    Ok("不传挑战 = 标准局", plain.Mode == GameMode.Standard && plain.Challenge is null);
    Ok("标准局倍率为 1", ChallengeEngine.RewardMul(plain) == 1 && ChallengeEngine.EnemyDamageMul(plain) == 1);
}

Console.WriteLine($"\n===== {(fails.Count == 0 ? "全部通过" : fails.Count + " 项失败")} =====");
if (fails.Count > 0) Environment.Exit(1);
