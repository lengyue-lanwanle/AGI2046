namespace AGI2046.Rules;

/// <summary>
/// 事件后果（0.23）。规则：
///   · 每条后果都能在 UI 里看到「为什么」（来源事件 + 原因 + 到期幕）；
///   · 最多同时追踪 5 条，超出时最旧的一条先退场并回滚；
///   · 到期或换幕自动解除，保证不会永久锁死内容；
///   · 只改可解释的数值/规则，不改「有没有这个节点」。
/// </summary>
public static class ConsequenceEngine
{
    public const int MaxTracked = 5;

    public static IReadOnlyDictionary<string, ConsequenceDef> All => NarrativeData.Consequences;

    /// <summary>事件结算后登记后果。失败也登记——账已经记下了，只是理由不同。</summary>
    public static void OnEventResolved(GameState state, EventDef ev, bool success)
    {
        if (ev is null) return;
        if (!NarrativeData.Consequences.TryGetValue(ev.Id, out var def)) return;

        var existing = state.Consequences.FirstOrDefault(c => c.Id == def.Id);
        if (existing is not null)
        {
            existing.ExpiresAct = Math.Max(existing.ExpiresAct, state.Act + def.Acts);
            GameRules.Log(state, $"后果延续：{existing.Title}（到第 {existing.ExpiresAct} 幕）。", "story");
            return;
        }

        var consequence = new Consequence
        {
            Id = def.Id,
            Source = ev.Title,
            Title = def.Title,
            Desc = def.Desc,
            Kind = def.Kind,
            ExpiresAct = state.Act + def.Acts,
            Payload = def.Payload,
            Why = def.Why
        };

        if (state.Consequences.Count >= MaxTracked)
        {
            var dropped = state.Consequences[0];
            state.Consequences.RemoveAt(0);
            Revert(state, dropped);
            GameRules.Log(state, $"后果过多：{dropped.Title} 不再追踪（它的效果已经解除）。", "warn");
        }

        state.Consequences.Add(consequence);
        ApplyImmediate(state, consequence);
        GameRules.Log(state, $"事件后果「{consequence.Title}」：{def.Desc}" +
                             (success ? "" : "（这次检定失败了，但账还是记下了。）"), "story");
    }

    /// <summary>立即生效的后果（属性类）。其余在用到的时候按 state 判定。</summary>
    private static void ApplyImmediate(GameState state, Consequence c)
    {
        var (key, value) = Parse(c.Payload);
        switch (key)
        {
            case "vit":
                foreach (var p in state.Players) p.ServerBonus.Vit += (int)value;
                foreach (var p in state.Players) GameRules.RecalculatePlayer(p);
                break;
            case "l":
                foreach (var p in state.Players) p.ServerBonus.L += (int)value;
                foreach (var p in state.Players) GameRules.RecalculatePlayer(p);
                break;
        }
    }

    /// <summary>回滚立即生效的后果。只回滚能回滚的（属性）；规则类随 state 自然消失。</summary>
    private static void Revert(GameState state, Consequence c)
    {
        var (key, value) = Parse(c.Payload);
        switch (key)
        {
            case "vit":
                foreach (var p in state.Players) p.ServerBonus.Vit = Math.Max(0, p.ServerBonus.Vit - (int)value);
                foreach (var p in state.Players) GameRules.RecalculatePlayer(p);
                break;
            case "l":
                foreach (var p in state.Players) p.ServerBonus.L = Math.Max(0, p.ServerBonus.L - (int)value);
                foreach (var p in state.Players) GameRules.RecalculatePlayer(p);
                break;
        }
    }

    private static (string Key, double Value) Parse(string payload)
    {
        var parts = (payload ?? "").Split(':', 2);
        if (parts.Length != 2) return ("", 0);
        return (parts[0], double.TryParse(parts[1], out var v) ? v : 0);
    }

    /// <summary>换幕：到期后果退场，返回下一幕要额外发放的记忆币。</summary>
    public static int OnActStart(GameState state)
    {
        var bonus = 0;
        foreach (var c in state.Consequences.ToList())
        {
            if (c.Payload.StartsWith("nextMemory:"))
            {
                var v = int.TryParse(c.Payload.Split(':')[1], out var n) ? n : 0;
                bonus += v;
                state.Consequences.Remove(c);
                GameRules.Log(state, $"后果兑现：{c.Title} → 记忆币 +{v}。", "story");
                continue;
            }
            if (c.ExpiresAct <= state.Act)
            {
                state.Consequences.Remove(c);
                Revert(state, c);
                GameRules.Log(state, $"后果结束：{c.Title}。", "story");
            }
        }
        return bonus;
    }

    /// <summary>走到新节点时：路线类后果把邻居多揭示一层。</summary>
    public static void OnNodeEntered(GameState state, NodeState node)
    {
        if (!Has(state, "billboard_route")) return;
        foreach (var neighborId in node.Neighbors)
        {
            var n = state.Node(neighborId);
            if (n is null || n.Revealed) continue;
            n.Revealed = true;
            foreach (var second in n.Neighbors)
            {
                var nn = state.Node(second);
                if (nn is not null) nn.Revealed = true;
            }
        }
    }

    public static bool Has(GameState state, string id)
        => state.Consequences.Any(c => c.Id == id);

    public static double ShopMul(GameState state) => Has(state, "market_debt") ? 1.15 : 1.0;

    public static int EnemyAccuracyMod(GameState state) => Has(state, "trace_noise") ? -5 : 0;

    public static double BossHpMul(GameState state) => Has(state, "protocol_echo") ? 1.05 : 1.0;

    /// <summary>遗物：本幕第一次本该倒下时留 1 HP。</summary>
    public static bool LastStand(GameState state)
        => Has(state, "relic_chance") && !state.LastStandUsed;

    public static void ConsumeLastStand(GameState state)
    {
        state.LastStandUsed = true;
        var c = state.Consequences.FirstOrDefault(x => x.Id == "relic_chance");
        if (c is not null) state.Consequences.Remove(c);
        GameRules.Log(state, "遗物的余温散尽：你本该倒下，但还剩 1 HP。", "warn");
    }
}
