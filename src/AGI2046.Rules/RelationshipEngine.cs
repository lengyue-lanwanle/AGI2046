namespace AGI2046.Rules;

/// <summary>
/// 角色关系（0.23）。规则：
///   · 助攻、协同、多人事件、共同觉醒、同行都能推进；
///   · 等级 1 = 有故事，2 = +3 命中，3 = 额外 +1 护甲（只在同场战斗生效）；
///   · 不锁角色、不给不可逆的永久数值，换队也保留但只作用于共同出战的场次；
///   · 等级变化写行动记录，档案里可回看。
/// </summary>
public static class RelationshipEngine
{
    public static int LevelOf(GameState state, string a, string b)
        => Find(state, a, b)?.Level ?? 0;

    public static Relationship? Find(GameState state, string a, string b)
    {
        if (string.IsNullOrWhiteSpace(a) || string.IsNullOrWhiteSpace(b) || a == b) return null;
        var (x, y) = string.CompareOrdinal(a, b) < 0 ? (a, b) : (b, a);
        return state.Relationships.FirstOrDefault(r => r.A == x && r.B == y);
    }

    public static Relationship Touch(GameState state, string a, string b, int points, string note)
    {
        if (string.IsNullOrWhiteSpace(a) || string.IsNullOrWhiteSpace(b) || a == b)
            return new Relationship();

        var (x, y) = string.CompareOrdinal(a, b) < 0 ? (a, b) : (b, a);
        var rel = state.Relationships.FirstOrDefault(r => r.A == x && r.B == y);
        if (rel is null)
        {
            rel = new Relationship { A = x, B = y };
            state.Relationships.Add(rel);
        }

        rel.Points += Math.Max(1, points);
        var level = 0;
        foreach (var (threshold, _, _) in NarrativeData.RelationLevels)
            if (rel.Points >= threshold) level++;
        level = Math.Min(3, level);

        if (level > rel.Level)
        {
            rel.Level = level;
            var nameA = state.Player(x)?.Name ?? x;
            var nameB = state.Player(y)?.Name ?? y;
            var line = NarrativeData.RelationLines[Math.Clamp(level - 1, 0, NarrativeData.RelationLines.Length - 1)];
            var text = string.Format(line, nameA, nameB);
            GameRules.Log(state, text, "support");
            state.Message = text;
            state.Stats.SynergyTriggers++;
            if (!state.Synergies.Contains("relation_" + level)) state.Synergies.Add("relation_" + level);
        }

        if (!string.IsNullOrWhiteSpace(note)) rel.Note = note;
        return rel;
    }

    public static void OnAssist(GameState state, string from, string to)
        => Touch(state, from, to, 1, "支援动作");

    public static void OnSynergy(GameState state, string from, string to)
        => Touch(state, from, to, 1, "战斗协同");

    /// <summary>多人事件：所有参与者之间各 +1。这是「一起做过决定」的记忆。</summary>
    public static void OnCoop(GameState state)
    {
        var ids = state.Players.Where(p => !p.Downed).Select(p => p.Id).ToList();
        for (var i = 0; i < ids.Count; i++)
            for (var j = i + 1; j < ids.Count; j++)
                Touch(state, ids[i], ids[j], 1, "共同决定");
    }

    public static void OnAwaken(GameState state, string awakenedId)
    {
        foreach (var other in state.Players.Where(p => p.Id != awakenedId))
            Touch(state, awakenedId, other.Id, 1, "见证觉醒");
    }

    /// <summary>移动/换节点：同节点的两个人算「同行」，每次进入节点最多推一次。</summary>
    public static void OnSameNode(GameState state, NodeState node)
    {
        var ids = state.Players.Where(p => p.NodeId == node.Id && !p.Downed).Select(p => p.Id).ToList();
        if (ids.Count < 2) return;
        for (var i = 0; i < ids.Count; i++)
            for (var j = i + 1; j < ids.Count; j++)
            {
                var rel = Find(state, ids[i], ids[j]);
                if (rel is not null && rel.Note == "同行") continue;   // 同一节点不重复刷
                Touch(state, ids[i], ids[j], 1, "同行");
            }
    }

    /// <summary>战斗开始：把关系等级变成可解释的小加成。只对同场出战的两人生效。</summary>
    public static void ApplyCombatBonus(GameState state, CombatState combat)
    {
        foreach (var rel in state.Relationships.Where(r => r.Level >= 2))
        {
            var ua = combat.Units.FirstOrDefault(u => u.PlayerId == rel.A && u.Side == Side.Player);
            var ub = combat.Units.FirstOrDefault(u => u.PlayerId == rel.B && u.Side == Side.Player);
            if (ua is null || ub is null) continue;

            ua.AccuracyBonus += 3;
            ub.AccuracyBonus += 3;
            var extra = rel.Level >= 3 ? 1 : 0;
            if (extra > 0)
            {
                ua.Armor += extra;
                ub.Armor += extra;
                combat.Log.Add($"关系 · {ua.Name} / {ub.Name}：后背交给对方，各 +1 护甲、+3 命中。");
            }
            else
            {
                combat.Log.Add($"关系 · {ua.Name} / {ub.Name}：互相补位，+3 命中。");
            }
        }
    }

    /// <summary>给 UI 用的一句话：这一对现在是什么关系。</summary>
    public static string Describe(GameState state, Relationship rel)
    {
        var a = state.Player(rel.A)?.Name ?? rel.A;
        var b = state.Player(rel.B)?.Name ?? rel.B;
        var idx = Math.Clamp(rel.Level - 1, 0, NarrativeData.RelationLevels.Length - 1);
        var title = rel.Level <= 0 ? "还不熟" : NarrativeData.RelationLevels[idx].Title;
        var effect = rel.Level <= 0 ? "一起行动会推进关系" : NarrativeData.RelationLevels[idx].Effect;
        return $"{a} / {b} · {title}（{effect}）";
    }
}
