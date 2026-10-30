namespace AGI2046.Rules;

/// <summary>解锁目录（0.21）。只解锁内容与情报，不给永久数值。</summary>
public sealed class UnlockDef
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Desc { get; set; } = "";
    /// <summary>mutator / intel / title / outfit / strategy。</summary>
    public string Kind { get; set; } = "intel";
}

public static class Unlocks
{
    public static readonly List<UnlockDef> Catalog = new()
    {
        new() { Id = "unlock_elite_hunt", Kind = "mutator", Name = "变异：猎杀协议", Desc = "精英更硬、合金更多。" },
        new() { Id = "unlock_fog", Kind = "mutator", Name = "变异：迷雾协议", Desc = "地图只显示相邻节点。" },
        new() { Id = "unlock_poverty", Kind = "mutator", Name = "变异：赤贫协议", Desc = "开局 0 记忆币，收益更高。" },
        new() { Id = "unlock_ironman", Kind = "mutator", Name = "变异：铁人协议", Desc = "1 点队伍生命，不能复活。" },
        new() { Id = "intel_mirror_archon", Kind = "intel", Name = "情报：镜面执政官", Desc = "它的礼貌是有代价的。" },
        new() { Id = "intel_zero_protocol", Kind = "intel", Name = "情报：零号协议", Desc = "主脑的会议室只有一把椅子。" },
        new() { Id = "title_clockbreaker", Kind = "title", Name = "称号：拆钟人", Desc = "在追踪见底前完成一局。" },
        new() { Id = "title_ghost", Kind = "title", Name = "称号：不留痕", Desc = "零撤退、满队伍生命通关。" },
        new() { Id = "outfit_neon_rain", Kind = "outfit", Name = "外观：霓虹雨披", Desc = "纯展示，不改变任何数值。" },
        new() { Id = "strategy_scout", Kind = "strategy", Name = "起始策略：侦察开局", Desc = "开局多揭示一层地图（仅标准局可选）。" }
    };

    public static UnlockDef? Get(string id) => Catalog.FirstOrDefault(u => u.Id == id);

    /// <summary>根据这一局的评级与统计推导新解锁。纯函数，便于测试。</summary>
    public static List<string> Evaluate(GameState state)
    {
        var result = new List<string>();
        var victory = state.Phase == GamePhase.Victory;
        var mutators = state.Challenge?.MutatorIds ?? new List<string>();
        var grade = state.Rating?.Grade ?? "C";

        if (mutators.Count >= 2) result.Add("unlock_elite_hunt");
        if (mutators.Count >= 1 && (victory || grade is "S" or "A")) result.Add("unlock_fog");
        if (mutators.Contains("poverty") && (victory || state.Act >= 2)) result.Add("unlock_poverty");
        if (victory && state.Challenge?.Difficulty is "hard" or "nightmare") result.Add("unlock_ironman");
        if (state.BossDefeated && state.Act >= 2) result.Add("intel_mirror_archon");
        if (victory) result.Add("intel_zero_protocol");
        if ((victory || state.Act >= 2) && state.Purge > 0 && state.Purge <= state.PurgeMax / 5)
            result.Add("title_clockbreaker");
        if (victory && state.Stats.RetreatAttempts == 0 && state.TeamLives >= 3) result.Add("title_ghost");
        if (victory || grade is "S" or "A") result.Add("outfit_neon_rain");
        if (state.QuestClaims >= 3 && (victory || state.Act >= 2)) result.Add("strategy_scout");
        return result;
    }
}

/// <summary>
/// 结局复盘与评级（0.21）。原则：
///   · 复盘只解释「为什么」，不重新审判玩家；
///   · 评级是反馈，低评级不锁角色、不阻塞主线；
///   · 只存摘要，不把完整日志写进档案。
/// </summary>
public static class RunAnalytics
{
    public static void Finalize(GameState state)
    {
        if (state.Mode == GameMode.Tutorial) return;   // 教学不是一局，不进复盘与档案
        if (state.Review is not null) return;
        if (state.Phase is not (GamePhase.Victory or GamePhase.Defeat)) return;
        state.Rating = BuildRating(state);
        state.Review = BuildReview(state, state.Rating);
        if (state.Challenge is not null)
        {
            state.Challenge.CompletedAt = DateTimeOffset.UtcNow;
            state.Challenge.Result = state.Phase == GamePhase.Victory ? "victory" : "defeat";
        }
    }

    public static RunReview BuildReview(GameState state, RunRating? rating = null)
    {
        var victory = state.Phase == GamePhase.Victory;
        var stats = state.Stats;
        var avgHp = state.Players.Count == 0
            ? 0
            : (int)Math.Round(state.Players.Average(p => p.MaxHp <= 0 ? 0 : (double)p.Hp / p.MaxHp * 100));
        var reason = victory ? "协议终止" : (state.DefeatedBy ?? "未知原因");
        var review = new RunReview
        {
            Victory = victory,
            FailureStage = victory ? $"{state.ActName} · 完成" : $"{state.ActName} · 第 {state.Round} 轮",
            Reason = reason,
            PurgeLeft = state.Purge,
            PurgeMax = state.PurgeMax,
            AvgHpPct = avgHp,
            TeamLives = state.TeamLives,
            RetreatAttempts = stats.RetreatAttempts,
            RetreatSuccess = stats.RetreatSuccess,
            Mutators = ChallengeEngine.Defs(state).Select(m => m.Name).ToList()
        };

        // 关键原因：优先说「时钟」，其次说「人」，最后才说战斗细节
        if (victory)
        {
            review.KeyCause = $"三幕协议全部终止：{stats.Victories} 场战斗、{state.QuestClaims} 条支线、剩余追踪 {state.Purge}。";
        }
        else if (reason.Contains("追踪"))
        {
            var wasted = stats.RetreatAttempts > 0
                ? $"其中 {stats.RetreatAttempts} 次撤退（成功 {stats.RetreatSuccess} 次）额外消耗了回合。"
                : "没有撤退记录——是路线本身太长，或战斗拖得太久。";
            review.KeyCause = $"电子追踪被耗尽：本局共 {stats.Battles} 场战斗、{stats.CombatRounds} 个战斗回合。{wasted}";
        }
        else
        {
            review.KeyCause = $"队伍全灭：{stats.Victories}/{stats.Battles} 场胜利，队伍生命剩 {state.TeamLives}。" +
                              (stats.RetreatAttempts == 0 ? "本局一次都没撤退过。" : $"撤退 {stats.RetreatAttempts} 次。");
        }

        review.KeyBattles = (state.Log ?? new List<LogEntry>())
            .Where(l => l.Text.Contains("首领") || l.Text.Contains("精英") || l.Text.Contains("碎片看守"))
            .TakeLast(3).Select(l => $"R{l.Round} {l.Text}").ToList();
        review.LastActions = (state.Log ?? new List<LogEntry>())
            .TakeLast(10).Select(l => $"R{l.Round} {l.Text}").ToList();
        review.TopSkill = stats.DamageBySkill.Count == 0
            ? "—"
            : stats.DamageBySkill.OrderByDescending(kv => kv.Value).First().Key +
              $"（{stats.DamageBySkill.OrderByDescending(kv => kv.Value).First().Value} 伤害）";
        review.UnusedResources = UnusedResources(state);
        review.KeyChoices = (state.Log ?? new List<LogEntry>())
            .Where(l => l.Kind == "event").TakeLast(3).Select(l => l.Text).ToList();
        review.Suggestion = Suggest(state, rating);
        return review;
    }

    private static List<string> UnusedResources(GameState state)
    {
        var list = new List<string>();
        var consumables = state.Players.Sum(p => p.Consumables.Values.Sum());
        if (consumables > 0) list.Add($"消耗品 {consumables} 件未使用");
        if (state.Memory >= 150) list.Add($"记忆币剩 {state.Memory}（够买 2–3 件装备）");
        if (state.Alloy >= 4) list.Add($"合金剩 {state.Alloy}（够强化 2 次）");
        if (state.Players.Any(p => !p.Awakened)) list.Add("有角色没觉醒");
        if (list.Count == 0) list.Add("资源基本用尽，没有明显浪费");
        return list;
    }

    private static string Suggest(GameState state, RunRating? rating)
    {
        if (state.Phase == GamePhase.Victory)
        {
            var next = new List<string>
            {
                "换一套队伍组合，看看协同效果",
                state.Challenge is null ? "试试带 2 条规则变异的挑战局" : "把变异加到 3 条以上",
                "走一条没走过的支线，拿另一件专属装备"
            };
            return string.Join("；", next) + "。";
        }
        if ((state.DefeatedBy ?? "").Contains("追踪"))
            return "下一局优先走安全屋和商店，避开非必要战斗；剩 10 点追踪时直取碎片看守。";
        if (state.Stats.RetreatAttempts == 0)
            return "下一局把「撤离」当成常规选项：打不动就退，保住的追踪比一场胜利更值钱。";
        if (state.Stats.Battles > 12)
            return "战斗场次偏多：优先清碎片看守和精英，普通战斗尽量绕开。";
        if (rating?.Grade is "S" or "A")
            return "这一局打得很好。下一局可以加一条变异，或换一个没试过的角色。";
        return "下一局先补一个治疗/护盾角色，把队伍生命留到首领战。";
    }

    public static RunRating BuildRating(GameState state)
    {
        var s = state.Stats;
        var victory = state.Phase == GamePhase.Victory;

        int Speed()
        {
            var efficiency = state.PurgeMax <= 0 ? 0 : (int)Math.Round(state.Purge * 100.0 / state.PurgeMax);
            return Math.Clamp(efficiency + (state.Act - 1) * 15, 0, 100);
        }
        int Survival()
        {
            var lives = Math.Clamp(state.TeamLives * 25, 0, 75);
            var hp = Math.Clamp((int)Math.Round(state.Players.Average(p => p.MaxHp <= 0 ? 0 : (double)p.Hp / p.MaxHp) * 25), 0, 25);
            return Math.Clamp(lives + hp, 0, 100);
        }
        int Combat()
        {
            if (s.Battles == 0) return 60;
            var winRate = s.Victories * 100 / Math.Max(1, s.Battles);
            var tempo = Math.Clamp(100 - Math.Max(0, s.CombatRounds - s.Battles * 4) * 3, 0, 100);
            return Math.Clamp((winRate + tempo) / 2, 0, 100);
        }
        var quests = Math.Clamp(state.QuestClaims * 34, 0, 100);
        var resources = Math.Clamp(100 - UnusedResources(state).Count * 18 - (state.Memory > 300 ? 15 : 0), 0, 100);
        var challenge = state.Challenge is null
            ? 40
            : Math.Clamp((int)Math.Round(45 * state.Challenge.ScoreMultiplier), 0, 100);
        var synergy = Math.Clamp(s.Assists * 8 + s.SynergyTriggers * 6, 0, 100);

        var dims = new List<RatingDimension>
        {
            new() { Key = "speed", Label = "追踪效率", Score = Speed(), Note = $"剩余追踪 {state.Purge}/{state.PurgeMax}" },
            new() { Key = "survival", Label = "队伍存活", Score = Survival(), Note = $"队伍生命 {state.TeamLives}，平均生命 {state.Players.Count} 人" },
            new() { Key = "combat", Label = "战斗效率", Score = Combat(), Note = $"{s.Victories}/{s.Battles} 场胜利 · {s.CombatRounds} 战斗回合" },
            new() { Key = "quest", Label = "支线完成", Score = quests, Note = $"已领取 {state.QuestClaims} 条" },
            new() { Key = "resource", Label = "资源使用", Score = resources, Note = $"记忆 {state.Memory} · 合金 {state.Alloy}" },
            new() { Key = "challenge", Label = "挑战难度", Score = challenge, Note = state.Challenge is null ? "标准协议" : $"×{state.Challenge.ScoreMultiplier:0.##}" },
            new() { Key = "synergy", Label = "队伍协同", Score = synergy, Note = $"协助 {s.Assists} · 协同 {s.SynergyTriggers}" }
        };

        var score = (int)Math.Round(dims.Average(d => d.Score));
        if (!victory) score = (int)Math.Round(score * 0.85);
        score = Math.Clamp(score, 0, 100);
        var grade = score >= 88 ? "S" : score >= 75 ? "A" : score >= 60 ? "B" : "C";
        var rating = new RunRating { Grade = grade, Score = score, Dimensions = dims };
        state.Rating = rating;
        rating.UnlockedIds = Unlocks.Evaluate(state);
        return rating;
    }
}
