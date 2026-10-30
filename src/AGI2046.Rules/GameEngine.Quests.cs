namespace AGI2046.Rules;

/// <summary>
/// 支线任务：残响节点发放、进度钩子、交付与换幕清理。
/// 支线完全可选——不做也能通关，换幕自动失效、不惩罚。
/// </summary>
public static partial class GameEngine
{
    private static QuestState? QuestOf(GameState state, string questId) =>
        state.Quests.FirstOrDefault(q => q.QuestId == questId);

    /// <summary>残响节点：优先交付已完成的支线，其次发放本节点绑定的支线。</summary>
    private static GameState InteractEcho(GameState state, PlayerState p, NodeState node)
    {
        var claimable = state.Quests.FirstOrDefault(q => q.Status == "done");
        if (claimable is not null) return ClaimQuest(state, p, node, claimable);

        var def = GameData.Quest(node.QuestId ?? "");
        if (def is null)
        {
            state.Message = "残响安静了一会儿，然后散开了。它已经没有什么可托付的。";
            return state;
        }

        var qs = QuestOf(state, def.Id);
        if (qs is null)
        {
            p.Ap--;
            node.Visited = true;
            state.PendingQuestOffer = def;
            state.Message = $"残响在等你回答：「{def.Title}」";
            GameRules.Log(state, $"残响提出支线「{def.Title}」：{def.Objective}。", "story");
            return state;
        }

        state.Message = qs.Status switch
        {
            "active" => $"「{def.Title}」进行中：{qs.Progress}/{def.TargetCount}。",
            "claimed" => $"「{def.Title}」已经了结了。残响不记得还欠谁什么。",
            _ => "残响看着你们。"
        };
        return state;
    }

    private static GameState AcceptQuest(GameState state, GameAction action)
    {
        var def = state.PendingQuestOffer ?? throw new GameException("现在没有待接取的支线。");
        state.PendingQuestOffer = null;
        if (QuestOf(state, def.Id) is not null) return state;

        state.Quests.Add(new QuestState
        {
            QuestId = def.Id,
            Status = "active",
            Progress = 0,
            Act = state.Act
        });
        GameRules.Log(state, $"接取支线「{def.Title}」：{def.Objective}。", "story");
        state.Message = $"支线「{def.Title}」已记录在案。";

        // 探索类可能一接就已经满足条件（例如先到了目标层）
        QuestHooks.OnActivated(state, def);
        return state;
    }

    private static GameState DeclineQuest(GameState state, GameAction action)
    {
        if (state.PendingQuestOffer is null) return state;
        var title = state.PendingQuestOffer.Title;
        state.PendingQuestOffer = null;
        state.Message = $"你拒绝了「{title}」。残响没有追问。";
        GameRules.Log(state, $"拒绝了支线「{title}」。", "info");
        return state;
    }

    private static GameState ClaimQuest(GameState state, PlayerState p, NodeState node, QuestState qs)
    {
        var def = GameData.Quest(qs.QuestId);
        if (def is null) return state;

        p.Ap--;
        node.Visited = true;
        qs.Status = "claimed";
        state.QuestClaims++;

        if (def.RewardMemory > 0) GameRules.GainMemory(state, def.RewardMemory);
        if (!string.IsNullOrWhiteSpace(def.RewardItem))
            GameRules.GrantItem(state, p, def.RewardItem!, "支线奖励");
        if (def.RewardConsumableCount > 0)
        {
            var rng = new Random(state.Seed ^ Stable.Hash(def.Id) ^ (state.Act * 7) ^ state.Round);
            for (var i = 0; i < def.RewardConsumableCount; i++)
                GameRules.GrantConsumable(state, p, GameRules.RandomConsumableId(state.Act, rng), 1);
        }
        if (def.RewardPurge > 0) GameRules.AdjustPurge(state, def.RewardPurge);
        if (def.RewardTeamLife > 0) state.TeamLives = Math.Min(5, state.TeamLives + def.RewardTeamLife);

        state.PendingBeat = new StoryBeat
        {
            Id = $"quest_done_{def.Id}_{state.Act}",
            Title = $"支线 · {def.Title}",
            Subtitle = "SIDE QUEST // CLOSED",
            Body = def.DoneText + $"\n\n—— 报酬：{def.RewardText}。"
        };
        GameRules.Log(state, $"{p.Name} 交付了支线「{def.Title}」，获得：{def.RewardText}。", "loot");
        state.Message = $"支线「{def.Title}」完成：{def.RewardText}。";
        return state;
    }

    /// <summary>换幕：未领取的支线直接失效，不惩罚、不提示。</summary>
    private static void ClearQuestsOnActChange(GameState state)
    {
        state.PendingQuestOffer = null;
        state.Quests.RemoveAll(q => q.Status != "claimed");
    }
}

/// <summary>支线进度钩子：只在 active 状态推进。</summary>
public static class QuestHooks
{
    private static int CombatWeight(NodeType type) => type switch
    {
        NodeType.Elite or NodeType.KeyElite => 2,
        NodeType.Combat or NodeType.Skirmish => 1,
        _ => 0
    };

    /// <summary>接取后立即结算一次（探索类可能已经达成）。</summary>
    public static void OnActivated(GameState state, QuestDef def)
    {
        if (def.Kind != "explore") return;
        var qs = state.Quests.FirstOrDefault(q => q.QuestId == def.Id);
        if (qs is not null)
            Push(state, qs, def, state.Players.Any(p => (state.Node(p.NodeId)?.Layer ?? 0) >= def.TargetLayer) ? 1 : 0);
    }

    /// <summary>移动进入节点：探索类支线。</summary>
    public static void OnEnterNode(GameState state, NodeState node)
    {
        foreach (var qs in state.Quests.Where(q => q.Status == "active").ToList())
        {
            var def = GameData.Quest(qs.QuestId);
            if (def is null || def.Kind != "explore") continue;
            if (node.Layer >= def.TargetLayer) Push(state, qs, def, 1);
        }
    }

    /// <summary>战斗胜利：猎杀类支线。</summary>
    public static void OnCombatWin(GameState state, NodeType nodeType)
    {
        foreach (var qs in state.Quests.Where(q => q.Status == "active").ToList())
        {
            var def = GameData.Quest(qs.QuestId);
            if (def is null || def.Kind != "hunt") continue;
            var gain = def.Source == "elite"
                ? (nodeType is NodeType.Elite or NodeType.KeyElite ? 1 : 0)
                : CombatWeight(nodeType);
            if (gain > 0) Push(state, qs, def, gain);
        }
    }

    /// <summary>搜刮遗骸 / 宝库：寻物类支线。</summary>
    public static void OnLoot(GameState state, NodeType nodeType)
    {
        foreach (var qs in state.Quests.Where(q => q.Status == "active").ToList())
        {
            var def = GameData.Quest(qs.QuestId);
            if (def is null || def.Kind != "fetch") continue;
            var match = def.Source switch
            {
                "corpse" => nodeType == NodeType.Corpse,
                "treasure" => nodeType == NodeType.Treasure,
                "mirror" => nodeType is NodeType.Corpse or NodeType.Treasure,
                _ => true
            };
            if (match) Push(state, qs, def, 1);
        }
    }

    /// <summary>在服务器上完成一次写入：行动类支线。</summary>
    public static void OnServerWrite(GameState state)
    {
        foreach (var qs in state.Quests.Where(q => q.Status == "active").ToList())
        {
            var def = GameData.Quest(qs.QuestId);
            if (def is null || def.Kind != "action") continue;
            Push(state, qs, def, 1);
        }
    }

    private static void Push(GameState state, QuestState qs, QuestDef def, int amount)
    {
        if (amount <= 0 || qs.Status != "active") return;
        qs.Progress = Math.Min(def.TargetCount, qs.Progress + amount);
        if (qs.Progress >= def.TargetCount)
        {
            qs.Status = "done";
            GameRules.Log(state, $"支线「{def.Title}」已达成。到任意残响节点领取报酬。", "loot");
            state.Message = $"支线「{def.Title}」已达成：去残响节点领报酬。";
        }
        else
        {
            GameRules.Log(state, $"支线「{def.Title}」进度 {qs.Progress}/{def.TargetCount}。", "info");
        }
    }
}
