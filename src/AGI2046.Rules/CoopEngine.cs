namespace AGI2046.Rules;

/// <summary>
/// 多人事件引擎（0.22）。规则：
///   · 每幕最多一次，2 人以上才触发；单人局永远不弹，不阻塞主线；
///   · 一票一人，多数决；平票/超时走安全默认；
///   · 掉线的座位不阻塞：只要剩下的人投完就结算；
///   · 投票、倒计时、结果都写在共享状态里，所有玩家看到同一份。
/// </summary>
public static class CoopEngine
{
    public const int VoteSeconds = 120;

    public static void MaybeTrigger(GameState state, NodeState node)
    {
        if (state.Mode == GameMode.Tutorial) return;
        if (state.Players.Count < 2) return;
        if (state.Coop is not null) return;
        if (state.CoopSeenActs.Contains(state.Act)) return;
        if (node.Layer < 4) return;
        var def = GameData.CoopForAct(state.Act, state.Seed);
        state.CoopSeenActs.Add(state.Act);
        state.Coop = new CoopState
        {
            Id = def.Id,
            Title = def.Title,
            Text = def.Text,
            Options = def.Options.Select(o => new CoopOption
            {
                Id = o.Id, Label = o.Label, Desc = o.Desc, Effect = o.Effect
            }).ToList(),
            DeadlineAt = DateTimeOffset.UtcNow.AddSeconds(VoteSeconds).ToUnixTimeMilliseconds()
        };
        state.Phase = GamePhase.Coop;
        state.Message = "多人事件：队伍需要做一个共同决定。";
        GameRules.Log(state, $"多人事件「{def.Title}」：等待队伍表决（多数决，超时按安全选项）。", "event");
    }

    /// <summary>超时兜底：任何接口读到状态时都可以调用，幂等。</summary>
    public static bool CheckTimeout(GameState state)
    {
        if (state.Coop is null || state.Coop.Resolved) return false;
        if (state.Coop.DeadlineAt <= 0) return false;
        if (DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() < state.Coop.DeadlineAt) return false;
        Resolve(state, timedOut: true, forced: null);
        return true;
    }

    public static GameState Apply(GameState state, GameAction action)
    {
        var coop = state.Coop ?? throw new GameException("当前没有多人事件。");
        switch (action.Type)
        {
            case "coopVote":
            {
                if (coop.Resolved) throw new GameException("事件已经结算了。");
                var option = coop.Options.FirstOrDefault(o => o.Id == action.Slot)
                             ?? throw new GameException("没有这个选项。");
                var voter = state.Players.FirstOrDefault(p => p.Id == action.PlayerId)
                            ?? throw new GameException("找不到投票人。");
                if (voter.Downed) throw new GameException("倒下的成员不能投票。");
                coop.Votes[voter.Id] = option.Id;
                LogVote(state, voter, option);
                // 所有在线（未倒下）成员都投完 → 立刻结算
                var eligible = state.Players.Where(p => !p.Downed).Select(p => p.Id).ToList();
                if (eligible.All(id => coop.Votes.ContainsKey(id)))
                    Resolve(state, timedOut: false, forced: null);
                return state;
            }
            case "coopResolve":
                Resolve(state, timedOut: action.Slot == "timeout", forced: action.Slot is not ("timeout" or null) ? action.Slot : null);
                return state;
            case "coopClose":
                if (!coop.Resolved) throw new GameException("事件还没有结算。");
                state.Coop = null;
                state.Phase = GamePhase.Exploration;
                state.Message = "事件已处理，队伍继续前进。";
                return state;
            default:
                throw new GameException($"多人事件中无法执行：{action.Type}");
        }
    }

    private static void LogVote(GameState state, PlayerState voter, CoopOption option)
    {
        GameRules.Log(state, $"{voter.Name} 投给了「{option.Label}」。", "support");
        state.Message = $"{voter.Name} 已投票：{option.Label}。";
    }

    private static void Resolve(GameState state, bool timedOut, string? forced)
    {
        var coop = state.Coop!;
        if (coop.Resolved) return;

        var counts = coop.Votes.Values.GroupBy(x => x).ToDictionary(g => g.Key, g => g.Count());
        string chosen;
        if (forced is not null)
        {
            chosen = forced;
        }
        else if (counts.Count == 0)
        {
            chosen = DefaultOf(state, coop);
        }
        else
        {
            var top = counts.OrderByDescending(kv => kv.Value).ThenBy(kv => kv.Key).ToList();
            var tied = top.Where(kv => kv.Value == top[0].Value).Select(kv => kv.Key).ToList();
            chosen = tied.Count == 1 ? top[0].Key : DefaultOf(state, coop);
        }

        var option = coop.Options.FirstOrDefault(o => o.Id == chosen) ?? coop.Options[0];
        coop.Resolved = true;
        coop.ChosenId = option.Id;
        coop.TimedOut = timedOut;
        var result = ApplyEffect(state, option.Effect);
        coop.Result = result;
        RelationshipEngine.OnCoop(state);
        GameRules.Log(state,
            $"多人事件结算：{(timedOut ? "超时，采用安全选项" : "多数决")}「{option.Label}」——{result}", "event");
        state.Message = $"事件结算：{option.Label}。{result}";
    }

    private static string DefaultOf(GameState state, CoopState coop)
    {
        var def = GameData.CoopEvents.FirstOrDefault(e => e.Id == coop.Id);
        return def?.DefaultOptionId ?? coop.Options[0].Id;
    }

    /// <summary>效果串：memory:+40;hp:-6;purge:+2;alloy:+1;focus:1。</summary>
    public static string ApplyEffect(GameState state, string effect)
    {
        var parts = new List<string>();
        foreach (var raw in (effect ?? "").Split(';', StringSplitOptions.RemoveEmptyEntries))
        {
            var kv = raw.Split(':', 2);
            if (kv.Length != 2) continue;
            var key = kv[0].Trim().ToLowerInvariant();
            if (!int.TryParse(kv[1], out var value)) continue;
            switch (key)
            {
                case "memory":
                    GameRules.GainMemory(state, Math.Max(0, value));
                    parts.Add($"记忆币 {value:+0;-0}");
                    break;
                case "hp":
                    foreach (var p in state.Players.Where(p => !p.Downed))
                        p.Hp = Math.Clamp(p.Hp + value, 1, p.MaxHp);
                    parts.Add($"全队生命 {value:+0;-0}");
                    break;
                case "purge":
                    GameRules.AdjustPurge(state, value);
                    parts.Add($"电子追踪 {value:+0;-0}");
                    break;
                case "alloy":
                    state.Alloy = Math.Max(0, state.Alloy + value);
                    parts.Add($"合金 {value:+0;-0}");
                    break;
                case "focus":
                    foreach (var p in state.Players.Where(p => !p.Downed))
                        p.Focus = Math.Clamp(p.Focus + value, 0, p.MaxFocus);
                    parts.Add($"Focus {value:+0;-0}");
                    break;
            }
        }
        return parts.Count == 0 ? "没有额外效果" : string.Join("、", parts) + "。";
    }
}
