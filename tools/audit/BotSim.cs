#:project ../../src/AGI2046.Rules/AGI2046.Rules.csproj

// AGI2046 自动通关模拟：让机器把三幕打穿，验证规则层能否真正走完
// 用法：dotnet run audit/BotSim.cs            （默认 1/2/3/4 人 × 多个种子）
//       PARTY=2 SEED=12345 dotnet run audit/BotSim.cs
using AGI2046.Rules;

var results = new List<(string Tag, bool Won, string Detail)>();
var errors = new List<string>();
int pass = 0, total = 0;
void Ok(string name, bool cond, string detail = "")
{
    total++;
    if (cond) pass++; else errors.Add($"{name} — {detail}");
    Console.WriteLine($"{(cond ? "PASS" : "FAIL")}  {name}{(detail == "" ? "" : "  —  " + detail)}");
}

var parties = new Dictionary<int, string[]>
{
    [1] = new[] { "gpt" },
    [2] = new[] { "gpt", "claude" },
    [3] = new[] { "mistral", "wenxin", "qwen" },
    [4] = new[] { "gpt", "claude", "mistral", "deepseek" },
    [5] = new[] { "mistral", "gpt", "gemini", "jev" },
    [6] = new[] { "wenxin", "glm", "qwen", "seed" }
};

var onlyParty = Environment.GetEnvironmentVariable("PARTY");
var onlySeed = Environment.GetEnvironmentVariable("SEED");
var seeds = onlySeed is null ? new[] { 12345, 777, 2046 } : new[] { int.Parse(onlySeed) };
var partySizes = onlyParty is null ? new[] { 1, 2, 3, 4, 5, 6 } : new[] { int.Parse(onlyParty) };

foreach (var size in partySizes)
{
    foreach (var seed in seeds)
    {
        var run = new Run(parties[size], seed);
        var outcome = run.Play();
        var tag = $"{size}人/seed{seed}";
        Console.WriteLine($"[{tag}] {outcome.Summary}");
        results.Add((tag, outcome.Won, outcome.Summary));
        Ok($"{tag} 走到结局（胜利）", outcome.Won, outcome.Summary);
        Ok($"{tag} 没有未处理异常", outcome.Error is null, outcome.Error ?? "");
        Ok($"{tag} 没有卡死（动作数 < 8000）", outcome.Actions < 8000, outcome.Actions.ToString());
    }
}

Console.WriteLine();
Console.WriteLine($"===== 模拟 {pass}/{total} 通过 =====");
foreach (var r in results) Console.WriteLine($"  {(r.Won ? "WIN " : "LOSE")} {r.Tag}  {r.Detail}");
if (errors.Count > 0)
{
    Console.WriteLine("失败项：");
    foreach (var e in errors) Console.WriteLine(" - " + e);
}
return 0;

/* ══════════════════════════════════════════════════════════ */
sealed class Run
{
    private readonly string[] _chars;
    private readonly int _seed;
    private readonly HashSet<string> _visitedOnce = new();   // 商店 / 安全屋 / 残响：一轮只进一次
    public Run(string[] chars, int seed) { _chars = chars; _seed = seed; }

    public sealed record Outcome(bool Won, string Summary, string? Error, int Actions);

    public Outcome Play()
    {
        GameState st;
        try { st = GameEngine.NewGame(new NewGameRequest { CharacterIds = _chars.ToList(), Seed = _seed }); }
        catch (Exception ex) { return new Outcome(false, "开局失败", ex.ToString(), 0); }

        var actions = 0;
        var trace = new List<string>();
        var lastSignature = "";
        var sameCount = 0;
        var combats = 0;
        var events = 0;
        var shops = 0;
        var traps = 0;
        var revives = 0;
        var bestEnemyHp = int.MaxValue;
        var lastProgressRound = 0;
        var lastCombatNode = "";
        var lastCombatRound = 0;

        while (actions < 8000)
        {
            if (st.Phase is GamePhase.Victory or GamePhase.Defeat) break;
            // 僵持判定不能只看轮数：残局里「治疗角色单挑高抗性敌人」也会拖到 60 轮以上，
            // 但敌人血量一直在掉 —— 那是慢，不是死。
            // 所以要求「轮数够久」且「敌人血量在最近 20 轮没有创新低」才判定僵持。
            if (st.Phase == GamePhase.Combat && st.Combat is { IsOver: false } liveCombat)
            {
                // 换了一场战斗（新节点，或同一节点重开导致轮数回退）→ 进度基准重置。
                // 不重置的话，上一场打到 0 血会让这一场永远"没有新低"，直接误判成僵持。
                if (liveCombat.NodeId != lastCombatNode || liveCombat.Round < lastCombatRound)
                {
                    bestEnemyHp = int.MaxValue;
                    lastProgressRound = liveCombat.Round;
                }
                lastCombatNode = liveCombat.NodeId;
                lastCombatRound = liveCombat.Round;

                var enemyHpNow = liveCombat.Units.Where(u => u.Side == Side.Enemy).Sum(u => u.Hp);
                if (enemyHpNow < bestEnemyHp)
                {
                    bestEnemyHp = enemyHpNow;
                    lastProgressRound = liveCombat.Round;
                }
                if (liveCombat.Round > 60 && liveCombat.Round - lastProgressRound > 20)
                    return Stuck(st, actions, $"战斗僵持：第 {liveCombat.Round} 轮仍未分胜负，且最近 20 轮敌人血量没有进展（敌人：{string.Join("/", liveCombat.Units.Where(u => u.Side == Side.Enemy && !u.Downed).Select(u => u.Name + "(" + u.Hp + ")"))}）\n" + string.Join("\n", trace));
            }
            var before = (st.Phase, st.ActivePlayerId, st.Round, st.Message);
            var signature = $"{before.Phase}|{before.ActivePlayerId}|{before.Round}|{before.Message}";
            if (signature == lastSignature) { sameCount++; if (sameCount > 60) return Stuck(st, actions, "同一状态重复 60 次\n" + string.Join("\n", trace)); }
            else { sameCount = 0; lastSignature = signature; }

            try
            {
                var acted = Step(st, ref combats, ref events, ref shops, ref traps, ref revives);
                if (trace.Count > 12) trace.RemoveAt(0);
                trace.Add($"{LastAction} | err={LastError} | cr={st.Combat?.Round} active={st.Combat?.ActiveUnitId} " +
                          $"P={string.Join("/", st.Combat?.Units.Where(u => u.Side == Side.Player).Select(u => u.Id + ":" + u.Hp) ?? new List<string>())} " +
                          $"E={string.Join("/", st.Combat?.Units.Where(u => u.Side == Side.Enemy).Select(u => u.Id + ":" + u.Hp) ?? new List<string>())} " +
                          $"log={st.Combat?.Log.LastOrDefault()}");
                if (!acted) return Stuck(st, actions, "没有可执行的行动");
            }
            catch (GameException ex)
            {
                var here = st.ActivePlayer is null ? null : st.Node(st.ActivePlayer.NodeId);
                return new Outcome(false, "规则异常（GameException 冒到顶层）",
                    $"{ex.Message} @ action#{actions} phase={st.Phase} node={here?.Type}/{here?.Id} cleared={here?.Cleared} msg={st.Message}", actions);
            }
            catch (Exception ex)
            {
                return new Outcome(false, "未处理异常", $"{ex.GetType().Name}: {ex.Message}\n{ex.StackTrace}\n@ action#{actions} phase={st.Phase}", actions);
            }
            actions++;
        }

        var won = st.Phase == GamePhase.Victory;
        var p0 = st.Players[0];
        var summary = won
            ? $"通关 act{st.Act} 动作{actions} 轮{st.Round} 追踪{st.Purge}/{st.PurgeMax} 记忆{st.Memory} 合金{st.Alloy} 队伍生命{st.TeamLives} Lv{p0.Level} 战斗{combats} 事件{events} 商店{shops} 陷阱{traps} 复活{revives}"
            : $"{st.Phase} act{st.Act} 动作{actions} 轮{st.Round} 追踪{st.Purge} 战斗{combats} 主线{st.DefeatedBy ?? st.Outcome?.Split('\n')[0]}";
        return new Outcome(won, summary, null, actions);
    }

    private Outcome Stuck(GameState st, int actions, string why) =>
        new(false, "卡死：" + why, $"phase={st.Phase} active={st.ActivePlayerId} round={st.Round} msg={st.Message}", actions);

    private bool Step(GameState st, ref int combats, ref int events, ref int shops, ref int traps, ref int revives)
    {
        // 剧情卡 / 支线卡
        if (st.PendingBeat is not null) { Act(st, new GameAction { Type = "ackBeat", BeatId = st.PendingBeat.Id }); return true; }
        if (st.PendingQuestOffer is not null) { Act(st, new GameAction { Type = "acceptQuest" }); return true; }

        switch (st.Phase)
        {
            case GamePhase.ActTransition:
                Act(st, new GameAction { Type = "advanceAct" });
                return true;
            case GamePhase.Coop:
                return CoopStep(st);
            case GamePhase.Combat:
                return CombatStep(st, ref combats);
            case GamePhase.Event:
                return EventStep(st, ref events);
            case GamePhase.Shop:
                shops++;
                Act(st, new GameAction { Type = "close" });
                return true;
            case GamePhase.Safehouse:
                return SafehouseStep(st, ref revives);
            case GamePhase.Exploration:
                return ExploreStep(st, ref traps);
            default:
                return false;
        }
    }

    public static string LastAction = "";
    public static string LastError = "";
    private static void Act(GameState st, GameAction a)
    {
        LastError = "";
        LastAction = $"{a.Type}{(a.SkillId is null ? "" : ":" + a.SkillId)}{(a.TargetUnitId is null ? "" : "->" + a.TargetUnitId)}";
        GameEngine.ApplyAction(st, a);
    }

    /// <summary>多人事件：先让每个人投第一个选项，再结算。验证投票路径不会卡住自动模拟。</summary>
    private bool CoopStep(GameState st)
    {
        var coop = st.Coop;
        if (coop is null) return false;
        if (coop.Resolved)
        {
            Act(st, new GameAction { Type = "coopClose" });
            return true;
        }
        var option = coop.Options.FirstOrDefault()?.Id;
        if (option is null) return false;
        foreach (var p in st.Players.Where(p => !p.Downed))
        {
            if ((coop.Votes ?? new()).ContainsKey(p.Id)) continue;
            try { Act(st, new GameAction { Type = "coopVote", PlayerId = p.Id, Slot = option }); }
            catch (GameException) { }
            return true;   // 一次只投一票，下一步再投下一个
        }
        Act(st, new GameAction { Type = "coopResolve" });
        return true;
    }

    private bool EventStep(GameState st, ref int events)
    {
        var ev = st.PendingEvent;
        if (ev is null) return false;
        // 选第一个付得起的选项
        for (var i = 0; i < ev.Event.Choices.Count; i++)
        {
            var c = ev.Event.Choices[i];
            if (c.CostMemory > st.Memory) continue;
            try { Act(st, new GameAction { Type = "eventChoice", ChoiceIndex = i }); events++; return true; }
            catch (GameException) { }
        }
        Act(st, new GameAction { Type = "eventChoice", ChoiceIndex = 0 });
        events++;
        return true;
    }

    private bool SafehouseStep(GameState st, ref int revives)
    {
        var downed = st.Players.FirstOrDefault(p => p.Downed);
        if (downed is not null && st.Memory >= 60 && st.TeamLives > 0)
        {
            try { Act(st, new GameAction { Type = "revive", PlayerId = downed.Id }); revives++; return true; }
            catch (GameException) { }
        }
        // 强化一次武器（有闲钱时）
        var p = st.Players[0];
        if (p.Equipment.TryGetValue("Weapon", out var w) && w.Level < 5 && st.Memory > 260 && st.Alloy > 2)
        {
            try { Act(st, new GameAction { Type = "upgrade", PlayerId = p.Id, Slot = "Weapon" }); return true; }
            catch (GameException) { }
        }
        Act(st, new GameAction { Type = "close" });
        return true;
    }

    private bool ExploreStep(GameState st, ref int traps)
    {
        var p = st.ActivePlayer ?? throw new GameException("没有当前角色");
        if (p.Ap <= 0) { Act(st, new GameAction { Type = "endTurn", PlayerId = p.Id }); return true; }

        var here = st.Node(p.NodeId)!;
        if (IsActionable(here, st))
        {
            if (here.Type == NodeType.Trap) traps++;
            if (here.Type is NodeType.Shop or NodeType.Safehouse or NodeType.Echo or NodeType.Awakening or NodeType.Terminal) _visitedOnce.Add(here.Id);
            Act(st, new GameAction { Type = "interact", PlayerId = p.Id, NodeId = here.Id });
            return true;
        }

        var target = ChooseTarget(st, p);
        if (target is null) { Act(st, new GameAction { Type = "endTurn", PlayerId = p.Id }); return true; }
        var path = Bfs(st, p.NodeId, target);
        if (path.Count == 0) { Act(st, new GameAction { Type = "endTurn", PlayerId = p.Id }); return true; }
        Act(st, new GameAction { Type = "move", PlayerId = p.Id, NodeId = path[0] });
        return true;
    }

    private bool IsActionable(NodeState n, GameState st) => _visitedOnce.Contains(n.Id) ? false : n.Type switch
    {
        NodeType.Start or NodeType.Blank => false,
        NodeType.Trap => false,   // 陷阱在「走进去」时自动结算，不需要再点
        NodeType.Event or NodeType.Combat or NodeType.Skirmish or NodeType.Elite or NodeType.KeyElite or
        NodeType.Corpse or NodeType.Server or NodeType.Treasure or NodeType.Terminal => !n.Cleared,
        NodeType.Boss => !n.Cleared && st.HasKey,
        NodeType.Awakening => !n.Cleared && string.IsNullOrEmpty(st.AwakenedPlayerId),
        NodeType.Shop or NodeType.Safehouse => !_visitedOnce.Contains(n.Id),
        NodeType.Echo => !_visitedOnce.Contains(n.Id) &&
                         (st.Quests.Any(q => q.Status == "done") ||
                          (!string.IsNullOrWhiteSpace(n.QuestId) && !st.Quests.Any(q => q.QuestId == n.QuestId))),
        _ => false
    };

    private string? ChooseTarget(GameState st, PlayerState p)
    {
        int Score(NodeState n, GameState s, PlayerState pl)
        {
            if (_visitedOnce.Contains(n.Id)) return 0;
            var baseScore = n.Type switch
            {
                NodeType.Boss => s.HasKey ? 5000 : 0,
                NodeType.KeyElite => 3000,
                NodeType.Awakening => string.IsNullOrEmpty(s.AwakenedPlayerId) ? 2400 : 0,
                NodeType.Echo => s.PendingQuestOffer is not null ? 0 : 1500,
                NodeType.Elite => 900,
                NodeType.Combat => 800,
                NodeType.Skirmish => 700,
                NodeType.Treasure => 650,
                NodeType.Corpse => 600,
                NodeType.Server => pl.ServerWrites < 2 ? 560 : 0,
                NodeType.Event => 520,
                NodeType.Shop => s.Memory > 300 ? 500 : 200,
                NodeType.Safehouse => (s.Players.Any(x => x.Downed) && s.Memory >= 60) || pl.Hp < pl.MaxHp * 0.4 ? 900 : 120,
                NodeType.Terminal => n.Cleared ? 0 : 300,
                _ => 0
            };
            return n.Cleared ? 0 : baseScore;
        }

        var best = -1;
        string? bestId = null;
        foreach (var n in st.Nodes)
        {
            var score = Score(n, st, p);
            if (score <= 0) continue;
            var dist = Bfs(st, p.NodeId, n.Id).Count;
            if (dist == 0) continue;
            var value = score / dist;
            if (value > best) { best = value; bestId = n.Id; }
        }
        return bestId;
    }

    private static List<string> Bfs(GameState st, string from, string to)
    {
        var map = st.Nodes.ToDictionary(n => n.Id, n => n.Neighbors);
        if (!map.ContainsKey(from) || !map.ContainsKey(to)) return new();
        var prev = new Dictionary<string, string?> { [from] = null };
        var q = new Queue<string>(); q.Enqueue(from);
        while (q.Count > 0)
        {
            var cur = q.Dequeue();
            if (cur == to) break;
            foreach (var nb in map[cur])
            {
                if (prev.ContainsKey(nb)) continue;
                prev[nb] = cur;
                q.Enqueue(nb);
            }
        }
        if (!prev.ContainsKey(to)) return new();
        var path = new List<string>();
        string? c = to;
        while (c is not null && c != from) { path.Add(c); c = prev[c]; }
        path.Reverse();
        return path;
    }

    private bool CombatStep(GameState st, ref int combats)
    {
        var combat = st.Combat!;
        if (combat.IsOver) { Act(st, new GameAction { Type = "closeCombat" }); combats++; return true; }
        var active = combat.ActiveUnit;
        if (active is null) return false;
        if (active.Side == Side.Enemy) return false; // 引擎应该已经跑完敌方回合

        var enemies = combat.Units.Where(u => u.Side == Side.Enemy && !u.Downed).ToList();
        if (enemies.Count == 0) { Act(st, new GameAction { Type = "combatEndTurn" }); return true; }

        var usable = active.SkillIds.Select(GameRules.Skill)
            .Where(s => s.FocusCost <= active.Focus)
            .Where(s => s.Cooldown == 0 || active.Cooldowns.GetValueOrDefault(s.Id) <= 0)
            .Where(s => !s.IsUltimate || !active.UltimateUsed)
            .ToList();

        // 0) 危急时先治疗（治疗技 > 止血针）
        var wounded = combat.Units.Where(u => u.Side == Side.Player && !u.Downed && u.Hp * 100 / Math.Max(1, u.MaxHp) < 35)
            .OrderBy(u => u.Hp * 100 / Math.Max(1, u.MaxHp)).FirstOrDefault();
        if (wounded is not null)
        {
            var heal = usable.Where(s => s.Effects.Any(e => e.Type is "heal" or "heal_all_allies" or "revive_or_heal"))
                .OrderByDescending(s => s.Effects.Where(e => e.Type is "heal" or "heal_all_allies").Sum(e => e.Amount))
                .FirstOrDefault();
            if (heal is not null && TrySkill(st, combat, active, heal, enemies)) return true;
        }
        // 1) 伤害技能（含终极技）：先打伤害
        foreach (var sk in usable.Where(s => s.Dice > 0)
                     .OrderByDescending(s => s.IsUltimate)
                     .ThenByDescending(s => s.Dice * Math.Max(1, s.DamagePerDie)))
        {
            if (TrySkill(st, combat, active, sk, enemies)) return true;
        }
        // 2) 普攻
        var adj = enemies.Where(e => Hex.Distance(active.Col, active.Row, e.Col, e.Row) <= Math.Max(1, active.WeaponRange)).ToList();
        if (adj.Count > 0)
        {
            var t = adj.OrderBy(e => e.Hp).First();
            try
            {
                Act(st, new GameAction { Type = "combatAction", PlayerId = active.PlayerId, SkillId = "basic", TargetUnitId = t.Id });
                return true;
            }
            catch (GameException) { }
        }
        // 3) 靠近
        var near = enemies.OrderBy(e => Hex.Distance(active.Col, active.Row, e.Col, e.Row)).First();
        if (combat.Reachable.Count > 0)
        {
            var step = combat.Reachable
                .OrderBy(h => Hex.Distance(h.Col, h.Row, near.Col, near.Row))
                .ThenBy(h => Hex.Distance(active.Col, active.Row, h.Col, h.Row))
                .First();
            try
            {
                Act(st, new GameAction { Type = "combatMove", PlayerId = active.PlayerId, Col = step.Col, Row = step.Row });
                return true;
            }
            catch (GameException) { }
        }
        // 4) 打不到人了才考虑辅助技能（治疗优先）
        foreach (var sk in usable.Where(s => s.Dice == 0)
                     .OrderByDescending(s => s.Effects.Any(e => e.Type is "heal" or "heal_all_allies" or "revive_or_heal")))
        {
            if (TrySkill(st, combat, active, sk, enemies)) return true;
        }
        // 5) 结束回合
        Act(st, new GameAction { Type = "combatEndTurn", PlayerId = active.PlayerId });
        return true;
    }

    private static bool TrySkill(GameState st, CombatState combat, CombatUnit active, SkillDef sk, List<CombatUnit> enemies)
    {
        string? targetId = null;
        switch (sk.Target)
        {
            case TargetType.Enemy:
            {
                var t = enemies.Where(e => sk.Range <= 0 || Hex.Distance(active.Col, active.Row, e.Col, e.Row) <= sk.Range)
                    .OrderBy(e => e.Hp).FirstOrDefault();
                if (t is null) return false;
                targetId = t.Id;
                break;
            }
            case TargetType.Ally:
            {
                var allies = combat.Units.Where(u => u.Side == active.Side && !u.Downed).ToList();
                var t = allies.Where(a => sk.Range <= 0 || Hex.Distance(active.Col, active.Row, a.Col, a.Row) <= sk.Range)
                    .OrderBy(a => a.Hp * 100 / Math.Max(1, a.MaxHp)).FirstOrDefault();
                if (t is null) return false;
                targetId = t.Id;
                break;
            }
            case TargetType.AllEnemies:
            {
                var any = enemies.Any(e => sk.Range <= 0 || Hex.Distance(active.Col, active.Row, e.Col, e.Row) <= sk.Range);
                if (!any) return false;
                targetId = enemies.OrderBy(e => e.Hp).First().Id;
                break;
            }
            case TargetType.Area:
            {
                var t = enemies.OrderBy(e => e.Hp).FirstOrDefault();
                if (t is null) return false;
                targetId = t.Id;
                break;
            }
        }
        try
        {
            Act(st, new GameAction { Type = "combatAction", PlayerId = active.PlayerId, SkillId = sk.Id, TargetUnitId = targetId, Col = -1, Row = -1 });
            return true;
        }
        catch (GameException ex) { LastError = sk.Id + ":" + ex.Message; return false; }
    }
}
