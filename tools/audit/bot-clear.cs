#:project ../../src/AGI2046.Rules/AGI2046.Rules.csproj
using AGI2046.Rules;

/* 0.25.1 真实通关验证：1 / 2 / 4 人各打一遍完整三幕
   和 BotSim 的区别：这个机器人会
     · 按「先拿碎片 → 补给 → 少打精英」的路线走；
     · 战斗里吃道具、留终极技、残血撤退；
     · 安全屋休息到满血、升级武器和护甲；
     · 商店补道具。
   目的是证明「这一版是真的能通关」，而不是证明机器人多聪明。
   用法：dotnet run tools/audit/bot-clear.cs [人数，逗号分隔]                         */

var sizes = (args.Length > 0 ? args[0] : "1,2,4").Split(',').Select(int.Parse).ToArray();
var seedBase = args.Length > 1 ? int.Parse(args[1]) : 2046;

var parties = new Dictionary<int, string[]>
{
    [1] = new[] { "gpt" },
    [2] = new[] { "gpt", "claude" },
    [3] = new[] { "mistral", "wenxin", "qwen" },
    [4] = new[] { "gpt", "claude", "mistral", "deepseek" }
};

var pass = 0;
var fail = 0;
void Ok(string name, bool cond, string detail = "")
{
    if (cond) { pass++; Console.WriteLine($"PASS  {name}"); }
    else { fail++; Console.WriteLine($"FAIL  {name}   {detail}"); }
}

foreach (var size in sizes)
{
    var bot = new ClearBot(parties[size], seedBase + size);
    var result = bot.Play();
    Console.WriteLine($"      {size} 人：{result.Summary}");
    Console.WriteLine("        动作分布：" + string.Join(" · ", bot.Tally.OrderByDescending(k => k.Value).Take(8).Select(k => $"{k.Key}×{k.Value}")));
    if (bot.ActLog.Count > 0) Console.WriteLine("        换幕：" + string.Join(" / ", bot.ActLog));
    if (Environment.GetEnvironmentVariable("BOT_TRACE") is "1" or "2")
    {
        var lines = Environment.GetEnvironmentVariable("BOT_TRACE") == "2"
            ? bot.Trace.Where(l => l.Contains("无目标") || l.Contains("走不到") || l.Contains("目标=当前")).TakeLast(8)
            : bot.Trace.TakeLast(45);
        foreach (var line in lines) Console.WriteLine("        " + line);
    }
    Ok($"{size} 人队通关三幕", result.Won, result.Summary);
    Ok($"{size} 人队没有卡死", result.Actions < 6000, $"{result.Actions} 个动作");
    Ok($"{size} 人队没有异常", result.Error is null, result.Error ?? "");
}

Console.WriteLine($"===== {pass} passed, {fail} failed =====");
return fail == 0 ? 0 : 1;

sealed class ClearBot
{
    private readonly string[] _ids;
    private readonly int _seed;
    private readonly HashSet<string> _done = new();
    /// <summary>全队共享的目标节点：4 人队各走各的会散成一盘沙，追踪条禁不起。</summary>
    private string? _objective;
    private GameState _s = null!;
    private int _actions;

    public ClearBot(string[] ids, int seed) { _ids = ids; _seed = seed; }

    public (bool Won, int Actions, string Summary, string? Error) Play()
    {
        try
        {
            _s = GameEngine.NewGame(new NewGameRequest
            {
                CharacterIds = _ids.ToList(), Seed = _seed, FirstRun = false
            });
            for (var i = 0; i < 6000; i++)
            {
                _actions = i;
                if (_s.Phase == GamePhase.Victory) return (true, i, Summary("通关"), null);
                if (_s.Phase == GamePhase.Defeat) return (false, i, Summary("失败"), null);
                if (!Step()) return (false, i, Summary("卡死：没有可执行动作"), null);
            }
            return (false, _actions, Summary("超过动作上限"), null);
        }
        catch (Exception ex)
        {
            return (false, _actions, Summary("异常"), $"{ex.GetType().Name}: {ex.Message}");
        }
    }

    private string Summary(string head) =>
        $"{head} · 第{_s.Act}幕 · 动作{_actions} · 追踪{_s.Purge}/{_s.PurgeMax} · 记忆{_s.Memory} · " +
        $"Lv{(int)Math.Round(_s.Players.Average(p => p.Level))} · 战斗{_s.Stats.Battles}";

    private bool Step()
    {
        if (_s.PendingBeat is not null) { Act(new GameAction { Type = "ackBeat", BeatId = _s.PendingBeat.Id }); return true; }
        if (_s.PendingQuestOffer is not null) { Act(new GameAction { Type = "acceptQuest" }); return true; }

        switch (_s.Phase)
        {
            case GamePhase.ActTransition: Act(new GameAction { Type = "advanceAct" }); return true;
            case GamePhase.Combat: return Combat();
            case GamePhase.Coop: return Coop();
            case GamePhase.Event: return Event();
            case GamePhase.Shop: return Shop();
            case GamePhase.Safehouse: return Safehouse();
            case GamePhase.Exploration: return Explore();
            default: return false;
        }
    }

    public readonly Dictionary<string, int> Tally = new();
    public readonly List<string> Trace = new();
    public readonly List<string> ActLog = new();

    private void Act(GameAction a)
    {
        var beforeAct = _s.Act;
        GameEngine.ApplyAction(_s, a);
        _actions++;
        var key = a.Type == "combatAction" ? "combatAction:" + (a.SkillId ?? "") : a.Type;
        if (Environment.GetEnvironmentVariable("BOT_TRACE") == "1")
        {
            var ap = _s.ActivePlayer is null ? 0 : _s.ActivePlayer.Ap;
            var hp = _s.ActivePlayer is null ? 0 : _s.ActivePlayer.Hp;
            var node = _s.ActivePlayer is null ? null : _s.Node(_s.ActivePlayer.NodeId);
            Trace.Add($"#{_actions} {a.Type}{(a.SkillId is null ? "" : ":" + a.SkillId)} 幕{_s.Act} 追踪{_s.Purge} AP{ap} HP{hp} 节点{node?.Type} 目标{_objective}");
        }
        Tally[key] = Tally.GetValueOrDefault(key) + 1;
        if (_s.Act != beforeAct) ActLog.Add($"→ 第{_s.Act}幕 @动作{_actions} 追踪{_s.Purge} 记忆{_s.Memory}");
    }

    public string LastError = "";

    private bool TryAct(GameAction a)
    {
        try { Act(a); return true; }
        catch (GameException ex) { LastError = $"{a.Type}:{ex.Message}"; return false; }
    }

    /* ── 探索 ─────────────────────────────────────────────────── */

    private bool Explore()
    {
        var p = _s.ActivePlayer!;
        if (p.Ap <= 0) { TryAct(new GameAction { Type = "endTurn", PlayerId = p.Id }); return true; }

        var here = _s.Node(p.NodeId)!;

        // 顺路的一次性节点（商店 / 安全屋 / 服务器 / 终端 / 支线）：站着就点，
        // 不需要为了它专门改路线。
        if (here.Type is NodeType.Shop or NodeType.Safehouse or NodeType.Server or
            NodeType.Terminal or NodeType.Echo or NodeType.Awakening &&
            Actionable(here) && p.Ap > 0)
        {
            if (TryAct(new GameAction { Type = "interact", PlayerId = p.Id, NodeId = here.Id }))
            {
                _done.Add(here.Id);
                if (_objective == here.Id) _objective = null;
                return true;
            }
            _done.Add(here.Id);
            if (_objective == here.Id) _objective = null;
        }

        // 目标失效就重算
        if (_objective is null || !IsWorthGoing(_objective))
            _objective = PickTarget(p);

        if (_objective is null)
        {
            TryAct(new GameAction { Type = "endTurn", PlayerId = p.Id });
            return true;
        }

        // 到达目标：战斗类要等人齐再开打（半队进战斗 = 同一场仗打两遍）
        if (_objective == p.NodeId)
        {
            var fight = here.Type is NodeType.Combat or NodeType.Skirmish or NodeType.Elite or
                        NodeType.KeyElite or NodeType.Boss;
            var missing = _s.Players.Count(x => !x.Downed && x.NodeId != p.NodeId);
            if (fight && missing > 0 && p.Ap > 0)
            {
                TryAct(new GameAction { Type = "endTurn", PlayerId = p.Id });
                return true;
            }
            if (Actionable(here) && p.Ap > 0 &&
                TryAct(new GameAction { Type = "interact", PlayerId = p.Id, NodeId = here.Id }))
            {
                if (here.Type is NodeType.Shop or NodeType.Safehouse or NodeType.Server or
                    NodeType.Terminal or NodeType.Echo or NodeType.Awakening)
                    _done.Add(here.Id);
                if (_objective == here.Id) _objective = null;
                return true;
            }
            // 点不动：普通节点放弃；Boss / 碎片看守保留目标，等状态变化再试
            if (here.Type is not (NodeType.Boss or NodeType.KeyElite))
            {
                _done.Add(here.Id);
                _objective = null;
            }
            TryAct(new GameAction { Type = "endTurn", PlayerId = p.Id });
            return true;
        }

        var path = Bfs(p.NodeId, _objective);
        if (path.Count == 0)
        {
            _done.Add(_objective);
            _objective = null;
            TryAct(new GameAction { Type = "endTurn", PlayerId = p.Id });
            return true;
        }
        if (!TryAct(new GameAction { Type = "move", PlayerId = p.Id, NodeId = path[0] }))
            TryAct(new GameAction { Type = "endTurn", PlayerId = p.Id });
        return true;
    }

    private bool IsWorthGoing(string nodeId)
    {
        var n = _s.Node(nodeId);
        if (n is null || n.Cleared || _done.Contains(nodeId)) return false;
        return Actionable(n) || n.Type is NodeType.Boss or NodeType.KeyElite;
    }

    private bool Actionable(NodeState n) => n.Type switch
    {
        NodeType.Start or NodeType.Blank or NodeType.Trap => false,
        NodeType.Boss => !n.Cleared && _s.HasKey,
        NodeType.Awakening => !n.Cleared && string.IsNullOrEmpty(_s.AwakenedPlayerId),
        NodeType.Shop or NodeType.Safehouse => !_done.Contains(n.Id),
        NodeType.Echo => !_done.Contains(n.Id) &&
                         (_s.Quests.Any(q => q.Status == "done") ||
                          (!string.IsNullOrWhiteSpace(n.QuestId) && !_s.Quests.Any(q => q.QuestId == n.QuestId))),
        NodeType.Event or NodeType.Combat or NodeType.Skirmish or NodeType.Elite or NodeType.KeyElite or
        NodeType.Corpse or NodeType.Server or NodeType.Treasure or NodeType.Terminal => !n.Cleared,
        _ => false
    };

    private string? PickTarget(PlayerState p)
    {
        var avgLv = _s.Players.Average(x => x.Level);
        var hurt = _s.Players.Min(x => x.Hp * 100 / Math.Max(1, x.MaxHp));
        var lowPurge = _s.Purge <= 6;

        // 时钟优先：追踪见底时只做「拿钥匙 / 打首领 / 救命」三件事，
        // 否则机器人会把最后 10 点追踪花在清普通战斗上——那不是难度，是路线错误。
        var urgent = _s.Purge <= 10;
        var hasKey = _s.HasKey;

        int Score(NodeState n)
        {
            if (n.Cleared || _done.Contains(n.Id)) return 0;
            if (hasKey && n.Type != NodeType.Boss && n.Type != NodeType.Safehouse) return 0;
            if (urgent && n.Type is not (NodeType.Boss or NodeType.KeyElite or NodeType.Safehouse or NodeType.Shop)) return 0;
            return n.Type switch
            {
                NodeType.Boss => hasKey ? 9000 : 0,
                NodeType.KeyElite => _s.KeyShards < _s.KeyShardGoal ? 4000 : 0,
                NodeType.Safehouse => hurt < 55 || _s.Players.Any(x => x.Downed) ? 2600 : 300,
                NodeType.Awakening => string.IsNullOrEmpty(_s.AwakenedPlayerId) ? 2200 : 0,
                NodeType.Echo => 1200,
                NodeType.Treasure => 1200,
                // 等级够了、碎片齐了、追踪见底——三种情况都不该再刷普通战斗。
                // 一场普通战斗 ≈ 3~5 点追踪，1 人队还能扛，2/4 人队的回合数翻倍，扛不住。
                NodeType.Combat => _s.KeyShards >= _s.KeyShardGoal ? 0 : (avgLv < 3 && _s.Purge > 20 ? 700 : 100),
                NodeType.Skirmish => _s.KeyShards >= _s.KeyShardGoal ? 0 : (avgLv < 3 && _s.Purge > 20 ? 600 : 90),
                NodeType.Corpse => 700,
                NodeType.Server => _s.Signal < 3 ? 800 : 400,
                NodeType.Event => 900,
                NodeType.Shop => _s.Memory > 200 || _s.Players[0].Consumables.GetValueOrDefault("medkit") < 1 ? 950 : 300,
                NodeType.Elite => avgLv >= 5 && _s.Purge > 18 ? 500 : 30,
                NodeType.Terminal => 200,
                _ => 0
            };
        }

        var best = 0;
        string? bestId = null;
        var table = new List<string>();
        foreach (var n in _s.Nodes)
        {
            var score = Score(n);
            var dist = Bfs(p.NodeId, n.Id).Count;
            if (Environment.GetEnvironmentVariable("BOT_TRACE") == "2" && score > 0)
                table.Add($"{n.Id}:{n.Type} score={score} dist={dist} cleared={n.Cleared} done={_done.Contains(n.Id)}");
            if (score <= 0) continue;
            if (dist == 0) continue;
            var value = score * 10 / Math.Max(1, dist);
            if (value > best) { best = value; bestId = n.Id; }
        }
        if (bestId is null && Environment.GetEnvironmentVariable("BOT_TRACE") == "2")
        {
            var boss = _s.Nodes.FirstOrDefault(x => x.Type == NodeType.Boss);
            Trace.Add($"无目标：hasKey={_s.HasKey} shards={_s.KeyShards}/{_s.KeyShardGoal} purge={_s.Purge} " +
                      $"boss={(boss is null ? "无" : $"{boss.Id} cleared={boss.Cleared} done={_done.Contains(boss.Id)} dist={Bfs(p.NodeId, boss.Id).Count}")} " +
                      $"未达={string.Join(" | ", table.Take(4))}");
        }
        return bestId;
    }

    /* ── 战斗 ─────────────────────────────────────────────────── */

    private bool Combat()
    {
        var c = _s.Combat!;
        if (c.IsOver) { Act(new GameAction { Type = "closeCombat" }); return true; }
        var active = c.ActiveUnit;
        if (active is null || active.Side == Side.Enemy) return false;

        var enemies = c.Units.Where(u => u.Side == Side.Enemy && !u.Downed).ToList();
        if (enemies.Count == 0) { TryAct(new GameAction { Type = "combatEndTurn" }); return true; }
        var owner = _s.Players.FirstOrDefault(x => x.Id == active.PlayerId);
        var isBoss = c.Units.Any(u => u.Role == "首领");

        // 1) 有人快倒了：先道具，再治疗技
        var critical = c.Units.Where(u => u.Side == Side.Player && !u.Downed && u.Hp * 100 <= u.MaxHp * 45)
            .OrderBy(u => u.Hp).FirstOrDefault();
        if (critical is not null && owner is not null)
        {
            var kit = new[] { "medkit", "medkit_l", "shield_cell", "stim" }
                .FirstOrDefault(id => owner.Consumables.GetValueOrDefault(id) > 0);
            if (kit is not null)
            {
                try
                {
                    Act(new GameAction
                    {
                        Type = "combatItem", PlayerId = active.PlayerId, ItemId = kit, TargetUnitId = critical.Id
                    });
                    return true;
                }
                catch (GameException) { }
            }
            var heal = Usable(active).FirstOrDefault(s => s.Effects.Any(e => e.Type is "heal" or "heal_all_allies"));
            if (heal is not null && TrySkill(active, heal, enemies)) return true;
        }

        // 2) 伤害技能：终极技留到第 2 轮或敌人只剩 1 个
        foreach (var sk in Usable(active)
                     .Where(s => s.Dice > 0)
                     .OrderByDescending(s => s.IsUltimate && (c.Round >= 2 || enemies.Count == 1))
                     .ThenByDescending(s => s.Dice * Math.Max(1, s.DamagePerDie)))
        {
            if (sk.IsUltimate && c.Round < 2 && enemies.Count > 1) continue;
            if (TrySkill(active, sk, enemies)) return true;
        }

        // 3) 普攻
        var reach = enemies.Where(e => Hex.Distance(active.Col, active.Row, e.Col, e.Row) <= Math.Max(1, active.WeaponRange)).ToList();
        if (reach.Count > 0)
        {
            var t = reach.OrderBy(e => e.Hp).First();
            try
            {
                Act(new GameAction { Type = "combatAction", PlayerId = active.PlayerId, SkillId = "basic", TargetUnitId = t.Id });
                return true;
            }
            catch (GameException) { }
        }

        // 4) 贴脸
        var near = enemies.OrderBy(e => Hex.Distance(active.Col, active.Row, e.Col, e.Row)).First();
        var step = c.Reachable
            .OrderBy(h => Hex.Distance(h.Col, h.Row, near.Col, near.Row))
            .ThenBy(h => Hex.Distance(active.Col, active.Row, h.Col, h.Row))
            .FirstOrDefault();
        if (step is not null && (step.Col != active.Col || step.Row != active.Row))
        {
            if (TryAct(new GameAction { Type = "combatMove", PlayerId = active.PlayerId, Col = step.Col, Row = step.Row }))
                return true;
        }

        // 5) 非首领战、队伍快崩：撤退（保住追踪条，比全灭好）
        var avgHp = c.Units.Where(u => u.Side == Side.Player && !u.Downed)
            .Select(u => u.Hp * 100 / Math.Max(1, u.MaxHp)).DefaultIfEmpty(100).Average();
        if (!isBoss && avgHp < 22 && c.Round >= 3)
        {
            if (TryAct(new GameAction { Type = "retreat", PlayerId = active.PlayerId })) return true;
        }

        TryAct(new GameAction { Type = "combatEndTurn", PlayerId = active.PlayerId });
        return true;
    }

    private List<SkillDef> Usable(CombatUnit u) => u.SkillIds.Select(GameRules.Skill)
        .Where(s => s.FocusCost <= u.Focus)
        .Where(s => s.Cooldown == 0 || u.Cooldowns.GetValueOrDefault(s.Id) <= 0)
        .Where(s => !s.IsUltimate || !u.UltimateUsed)
        .ToList();

    private bool TrySkill(CombatUnit active, SkillDef sk, List<CombatUnit> enemies)
    {
        string? targetId = null;
        switch (sk.Target)
        {
            case TargetType.Enemy:
            case TargetType.Area:
            case TargetType.AllEnemies:
                targetId = enemies.Where(e => sk.Range <= 0 || Hex.Distance(active.Col, active.Row, e.Col, e.Row) <= sk.Range)
                    .OrderBy(e => e.Hp).FirstOrDefault()?.Id;
                if (targetId is null) return false;
                break;
            case TargetType.Ally:
                targetId = _s.Combat!.Units.Where(u => u.Side == Side.Player && !u.Downed)
                    .OrderBy(a => a.Hp * 100 / Math.Max(1, a.MaxHp)).FirstOrDefault()?.Id;
                break;
        }
        try
        {
            Act(new GameAction { Type = "combatAction", PlayerId = active.PlayerId, SkillId = sk.Id, TargetUnitId = targetId });
            return true;
        }
        catch (GameException) { return false; }
    }

    /* ── 其它阶段 ─────────────────────────────────────────────── */

    private bool Coop()
    {
        var coop = _s.Coop;
        if (coop is null) return false;
        if (coop.Resolved) { TryAct(new GameAction { Type = "coopClose" }); return true; }
        var option = coop.Options.FirstOrDefault()?.Id;
        var voter = _s.Players.FirstOrDefault(p => !p.Downed && !(coop.Votes ?? new()).ContainsKey(p.Id));
        if (option is not null && voter is not null)
            TryAct(new GameAction { Type = "coopVote", PlayerId = voter.Id, Slot = option });
        else
            TryAct(new GameAction { Type = "coopResolve" });
        return true;
    }

    private bool Event()
    {
        var ev = _s.PendingEvent;
        if (ev is null) return false;
        for (var i = 0; i < ev.Event.Choices.Count; i++)
        {
            if (ev.Event.Choices[i].CostMemory > _s.Memory) continue;
            if (TryAct(new GameAction { Type = "eventChoice", ChoiceIndex = i })) return true;
        }
        TryAct(new GameAction { Type = "eventChoice", ChoiceIndex = 0 });
        return true;
    }

    private bool Shop()
    {
        // 先补两个止血针，再考虑升级
        var owner = _s.Players[0];
        if (owner.Consumables.GetValueOrDefault("medkit") < 2)
        {
            var item = _s.Shop.FirstOrDefault(x => !x.Sold && x.ItemId == "medkit" && x.Price <= _s.Memory);
            if (item is not null && TryAct(new GameAction { Type = "buy", ItemId = item.ItemId })) return true;
        }
        TryAct(new GameAction { Type = "close" });
        return true;
    }

    private bool Safehouse()
    {
        // 复活 > 休息回血 > 升级
        var downed = _s.Players.FirstOrDefault(p => p.Downed);
        if (downed is not null && _s.Memory >= 60 && _s.TeamLives > 0)
            if (TryAct(new GameAction { Type = "revive", PlayerId = downed.Id })) return true;

        var hurt = _s.Players.OrderBy(p => p.Hp * 100 / Math.Max(1, p.MaxHp)).FirstOrDefault();
        if (hurt is not null && hurt.Hp < hurt.MaxHp * 0.85 && _s.Memory >= 20)
        {
            if (TryAct(new GameAction { Type = "rest", PlayerId = hurt.Id })) return true;
        }

        // 升级：优先武器，其次护甲（+5 上限，合金够就升）
        foreach (var slot in new[] { "Weapon", "Armor", "Helmet" })
        {
            foreach (var p in _s.Players)
            {
                if (!p.Equipment.TryGetValue(slot, out var item) || item.Level >= 5) continue;
                if (_s.Alloy < 2 || _s.Memory < 120) continue;
                if (TryAct(new GameAction { Type = "upgrade", PlayerId = p.Id, Slot = slot })) return true;
            }
        }

        TryAct(new GameAction { Type = "close" });
        return true;
    }

    private List<string> Bfs(string from, string to)
    {
        var map = _s.Nodes.ToDictionary(n => n.Id, n => n.Neighbors);
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
}
