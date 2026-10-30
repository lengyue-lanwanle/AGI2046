namespace AGI2046.Rules;

public sealed class GameException : Exception
{
    public GameException(string message) : base(message) { }
}

public static partial class GameEngine
{
    public static GameState NewGame(NewGameRequest request)
    {
        // 教学不生成正式三幕地图，也不消耗角色选择：它有自己的固定队伍和训练场。
        if (request.Mode == GameMode.Tutorial) return TutorialEngine.NewTutorial();

        var ids = request.CharacterIds?.Where(x => !string.IsNullOrWhiteSpace(x)).Distinct().ToList() ?? new();
        var prepared = request.PreparedChallenge
            ?? (request.Mode == GameMode.Challenge
                ? ChallengeEngine.BuildRun(
                    request.Challenge ?? new ChallengeConfig(),
                    new HashSet<string>(StringComparer.OrdinalIgnoreCase),
                    request.Seed != 0 ? request.Seed : Environment.TickCount)
                : null);
        var isChallenge = prepared is not null;
        var teamCap = isChallenge ? ChallengeEngine.TeamCapOf(prepared) : 4;
        if (ids.Count == 0) throw new GameException("至少选择一名角色。");
        if (ids.Count > teamCap)
            throw new GameException(isChallenge && teamCap < 4
                ? $"当前挑战协议最多 {teamCap} 名角色。"
                : "最多选择四名角色。");
        foreach (var id in ids)
            if (!GameData.Characters.ContainsKey(id))
                throw new GameException($"未知角色：{id}");

        var seed = prepared?.Seed ?? (request.Seed != 0 ? request.Seed : Environment.TickCount);
        var actDef = GameData.Acts[1];
        var firstRun = !isChallenge && (request.FirstRun ?? false);
        var (nodes, edges) = MapGenerator.Generate(seed, 1, firstRun);
        var state = new GameState
        {
            SessionId = Guid.NewGuid().ToString("N")[..12],
            Mode = isChallenge ? GameMode.Challenge : GameMode.Standard,
            Challenge = prepared,
            Seed = seed,
            Act = 1,
            ActName = actDef.Name,
            ActSubtitle = actDef.Subtitle,
            Objective = actDef.Objective,
            Nodes = nodes,
            Edges = edges,
            Memory = isChallenge && ChallengeEngine.HasMutator(prepared, "poverty") ? 0 : 120,
            Alloy = 4,
            Purge = actDef.PurgeMax,
            PurgeMax = actDef.PurgeMax,
            TeamLives = isChallenge && ChallengeEngine.HasMutator(prepared, "ironman") ? 1 : 3,
            Signal = 2,
            Phase = GamePhase.Exploration,
            ActivePlayerId = "p1",
            FirstRun = firstRun
        };

        for (var i = 0; i < ids.Count; i++)
        {
            var def = GameData.Characters[ids[i]];
            var p = new PlayerState
            {
                Id = $"p{i + 1}",
                CharacterId = def.Id,
                Name = def.Name,
                Model = def.Model,
                Faction = def.Faction,
                Role = def.Role,
                Portrait = def.Portrait,
                Color = def.Color,
                PassiveName = def.PassiveName,
                PassiveDesc = def.PassiveDesc,
                PassiveKey = def.PassiveKey,
                Level = 1,
                Xp = 0,
                XpNext = GameRules.XpToNext(1),
                NodeId = "start",
                SkillIds = def.SkillIds.ToList(),
                Ap = i == 0 ? 3 : 0
            };
            p.Equipment["Weapon"] = GameRules.CreateItem(def.StarterWeaponId);
            p.Equipment["Armor"] = GameRules.CreateItem("a_jacket");
            p.Focus = 99;
            GameRules.RecalculatePlayer(p);
            p.Focus = p.MaxFocus;
            p.Hp = p.MaxHp;
            state.Players.Add(p);
        }

        if (isChallenge)
        {
            ChallengeEngine.ApplyToRun(state);
            ChallengeEngine.ApplyToMap(state);
            var names = string.Join(" · ", ChallengeEngine.Defs(state).Select(m => m.Name));
            GameRules.Log(state, $"挑战协议已加载：{names}（×{prepared!.ScoreMultiplier:0.##} 评分）", "warn");
            if (!string.IsNullOrWhiteSpace(state.ClosedNodeType))
                GameRules.Log(state, $"全局故障：本幕「{state.ClosedNodeType}」节点全部下线。", "warn");
        }

        GameRules.Log(state, "零号协议已启动。霓虹港的电子钟停在 2046 年，但雨还在下。", "story");
        GameRules.Log(state, $"队伍已集结：{string.Join("、", state.Players.Select(p => p.Name))}。", "story");
        GameRules.Log(state, $"目标：{actDef.Objective}", "story");
        GameRules.Log(state, "每轮电子追踪会推进 1 格。归零前完成任务。", "warn");
        state.Message = "轮到 p1 行动。";
        QueueBeat(state, "prologue");
        RefreshObjectives(state);
        return state;
    }

    /// <summary>一幕结束时的回顾：只写「这一幕发生了什么」，不给建议也不评分。</summary>
    private static RunRecap BuildRecap(GameState state)
    {
        var snap = state.ActStart ?? new ActSnapshot();
        var bonds = state.Relationships.Where(r => r.Level > 0)
            .Select(r => RelationshipEngine.Describe(state, r)).ToList();
        return new RunRecap
        {
            Act = state.Act,
            Name = state.ActName,
            Nodes = state.Nodes.Count(n => n.Visited) - snap.Nodes,
            Battles = state.Stats.Battles - snap.Battles,
            Victories = state.Stats.Victories - snap.Victories,
            Events = state.Stats.SeenEvents.Count - snap.Events,
            Assists = state.Stats.Assists - snap.Assists,
            Synergies = state.Stats.SynergyTriggers - snap.Synergies,
            PurgeLeft = state.Purge,
            PurgeMax = state.PurgeMax,
            TeamLives = state.TeamLives,
            AvgLevel = state.Players.Count == 0 ? 1 : (int)Math.Round(state.Players.Average(p => p.Level)),
            ConsequenceTitles = state.Consequences.Select(c => c.Title).ToList(),
            BondLines = bonds
        };
    }

    private static ActSnapshot Snapshot(GameState state, int act) => new()
    {
        Act = act,
        Battles = state.Stats.Battles,
        Victories = state.Stats.Victories,
        Events = state.Stats.SeenEvents.Count,
        Assists = state.Stats.Assists,
        Synergies = state.Stats.SynergyTriggers,
        Nodes = state.Nodes.Count(n => n.Visited)
    };

    public static GameState AdvanceAct(GameState state)
    {
        if (state.Phase != GamePhase.ActTransition)
            throw new GameException("当前没有待进入的下一幕。");
        var nextAct = state.Act + 1;
        if (nextAct > 3)
            throw new GameException("零号协议已经终止。");

        // 先给刚结束的一幕留一份回顾，再做任何重置
        state.Recaps.Add(BuildRecap(state));

        var def = GameData.Acts[nextAct];
        state.Act = nextAct;
        state.ActName = def.Name;
        state.ActSubtitle = def.Subtitle;
        state.Objective = def.Objective;
        state.NextActName = null;
        state.NextActSubtitle = null;
        state.NextActObjective = null;
        state.Round = 1;
        state.PurgeMax = def.PurgeMax;
        state.Purge = def.PurgeMax;
        state.HasKey = false;
        state.KeyShards = 0;
        state.BossDefeated = false;
        state.Phase = GamePhase.Exploration;
        state.Signal = 2;
        var carried = ConsequenceEngine.OnActStart(state);
        state.ActStart = Snapshot(state, nextAct);
        state.Memory += def.EntryMemory + carried;
        state.Alloy += def.EntryAlloy;
        state.Combat = null;
        state.PendingEvent = null;
        state.Shop = new();
        state.ShopNodeId = null;
        state.SafehouseNodeId = null;
        state.LastRoll = null;
        state.Outcome = null;
        state.DefeatedBy = null;
        ClearQuestsOnActChange(state);

        var (nodes, edges) = MapGenerator.Generate(state.Seed, nextAct);
        state.Nodes = nodes;
        state.Edges = edges;
        state.ClosedNodeType = null;
        ChallengeEngine.ApplyToMap(state);
        ChallengeEngine.OnActStart(state);

        foreach (var p in state.Players)
        {
            p.ServerWrites = 0;
            var wasDowned = p.Downed;
            p.NodeId = "start";
            p.LastNodeId = "start";
            p.Ap = 0;
            p.Downed = false;
            p.Hp = wasDowned
                ? Math.Max(1, p.MaxHp * 40 / 100)
                : Math.Max(p.Hp, (int)Math.Ceiling(p.MaxHp * 0.7));
            p.Focus = p.MaxFocus;
            p.AssistBonus = 0;
            p.Cooldowns.Clear();
            p.UltimateUsed = false;
            GameRules.GrantXp(state, p, def.EntryXp);
        }

        state.ActivePlayerId = state.Players.FirstOrDefault(p => !p.Downed)?.Id ?? state.Players[0].Id;
        if (state.ActivePlayer is not null) state.ActivePlayer.Ap = 3;
        state.Message = $"{def.Name} 接入。{def.StartDesc}";
        GameRules.Log(state, $"—— {def.Name} · {def.Subtitle} ——", "story");
        GameRules.Log(state, def.StartDesc, "story");
        GameRules.Log(state, $"幕间整备：全队恢复至至少七成生命，倒下成员以四成生命重新上线；获得 {def.EntryMemory} 记忆币、{def.EntryAlloy} 合金与 {def.EntryXp} XP。", "heal");
        GameRules.Log(state, $"目标：{def.Objective}", "story");
        QueueBeat(state, nextAct == 2 ? "act2_open" : "act3_open");
        return state;
    }

    public static GameState ApplyAction(GameState state, GameAction action)
    {
        // 教学：先挡「跳步」，再执行，最后按结果推进步骤。
        if (state.Mode == GameMode.Tutorial) TutorialEngine.Validate(state, action);
        var result = ApplyActionCore(state, action);
        if (result.Mode == GameMode.Tutorial) TutorialEngine.After(result, action);
        CoopEngine.CheckTimeout(result);
        if (result.Phase is GamePhase.Victory or GamePhase.Defeat) RunAnalytics.Finalize(result);
        RefreshObjectives(result);   // 「此刻最重要的事」每次行动后重算
        CombatEngine.RefreshIntents(result);   // 每次动作后刷新敌方意图预告
        result.Revision++;
        return result;
    }

    private static GameState ApplyActionCore(GameState state, GameAction action)
    {
        if (string.IsNullOrWhiteSpace(action.Type)) throw new GameException("缺少行动类型。");
        // 联机剧情游标：房主每推进一句写一次，其他人只读跟随。
        // 放在阶段判断之前——任何阶段都应该允许「把当前这句同步出去」。
        if (action.Type == "storyCue")
        {
            if (string.IsNullOrWhiteSpace(action.SceneId)) return state;
            state.StoryCue = new StoryCue
            {
                SceneId = action.SceneId!,
                Line = Math.Max(0, action.Line ?? 0),
                By = action.PlayerId ?? "",
                At = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
            };
            return state;
        }

        if (action.Type == "ackBeat")
        {
            var beatId = action.BeatId ?? state.PendingBeat?.Id;
            if (!string.IsNullOrWhiteSpace(beatId) && !state.SeenBeats.Contains(beatId))
                state.SeenBeats.Add(beatId);
            state.PendingBeat = null;
            return state;
        }
        if (state.Phase is GamePhase.Victory or GamePhase.Defeat)
        {
            // 结局阶段同样允许结算确认：只清战斗快照，阶段不变
            if (action.Type == "closeCombat" && state.Combat is not null) return CombatEngine.CloseCombat(state);
            return state;
        }
        // 教学专用动作（下一步 / 查看意图 / 跳过）：只改教学状态，不推进战斗与轮次
        if (action.Type is "tutorialNext" or "tutorialInspect" or "tutorialSkip")
        {
            if (state.Mode != GameMode.Tutorial) throw new GameException("当前不是教学模式。");
            return TutorialEngine.Handle(state, action);
        }
        if (state.Phase == GamePhase.ActTransition)
        {
            if (action.Type == "advanceAct") return AdvanceAct(state);
            // 首领战结算面板的「确认」可能晚于幕间阶段：允许收尾，但只清战斗快照，不改阶段
            if (action.Type == "closeCombat" && state.Combat is not null) return CombatEngine.CloseCombat(state);
            // 幕间整备：换装和强化放行——刚打完首领是最该配装的时刻，
            // 以前这里一刀切「请先进入下一幕」，玩家只能带着没花的钱进下一幕。
            if (action.Type is not ("equip" or "upgrade"))
                throw new GameException("请先进入下一幕。");
        }

        if (state.Phase == GamePhase.Coop)
            return CoopEngine.Apply(state, action);
        if (state.Phase == GamePhase.Combat)
            return CombatEngine.ApplyCombatAction(state, action);
        if (state.Phase == GamePhase.Event)
            return ApplyEventAction(state, action);

        switch (action.Type)
        {
            case "move": return Move(state, action);
            case "interact": return Interact(state, action);
            case "acceptQuest": return AcceptQuest(state, action);
            case "declineQuest": return DeclineQuest(state, action);
            case "rest": return Rest(state, action);
            case "assist": return Assist(state, action);
            case "assistGuard": return AssistGuard(state, action);
            case "assistFocus": return AssistFocus(state, action);
            case "assistMark": return AssistMark(state, action);
            case "assistRescue": return AssistRescue(state, action);
            case "assistPing": return AssistPing(state, action);
            case "endTurn": return EndTurn(state, action);
            case "useItem": return UseItem(state, action);
            case "equip": return Equip(state, action);
            case "upgrade": return Upgrade(state, action);
            case "buy": return Buy(state, action);
            case "close": return CloseModal(state, action);
            case "revive": return ReviveAtSafehouse(state, action);
            default: throw new GameException($"当前阶段无法执行行动：{action.Type}");
        }
    }

    private static void QueueBeat(GameState state, string id)
    {
        // 教学有自己的步骤条：再叠一张叙事卡只会挡住下一步该点哪里
        if (state.Mode == GameMode.Tutorial) return;
        if (state.SeenBeats.Contains(id)) return;
        // 未读的卡会被新卡顶掉：宁可少播一张，也不要永远堵住后续剧情
        if (!Narrative.Beats.TryGetValue(id, out var beat)) return;
        state.PendingBeat = new StoryBeat
        {
            Id = beat.Id,
            Title = beat.Title,
            Subtitle = beat.Subtitle,
            Body = beat.Body
        };
    }

    private static PlayerState RequireActive(GameState state, string? playerId)
    {
        var active = state.ActivePlayer ?? throw new GameException("没有当前行动角色。");
        if (active.Downed) throw new GameException("当前角色已倒下。");
        if (!string.IsNullOrEmpty(playerId) && playerId != active.Id)
            throw new GameException("现在不是该角色的行动轮。");
        return active;
    }

    private static PlayerState PlayerAtNode(GameState state, string? playerId, string? nodeId, bool requireActive = true)
    {
        var player = state.Players.FirstOrDefault(p => p.Id == playerId)
                     ?? throw new GameException("找不到角色。");
        if (requireActive && player.Id != state.ActivePlayerId)
            throw new GameException("现在不是该角色的行动轮。");
        if (!string.IsNullOrEmpty(nodeId) && player.NodeId != nodeId)
            throw new GameException("角色不在此节点。");
        return player;
    }

    private static GameState Move(GameState state, GameAction action)
    {
        var p = RequireActive(state, action.PlayerId);
        if (p.Ap <= 0) throw new GameException("AP 不足。结束回合或休息。");
        if (string.IsNullOrWhiteSpace(action.NodeId)) throw new GameException("缺少目标节点。");
        var current = state.Node(p.NodeId) ?? throw new GameException("当前位置无效。");
        var target = state.Node(action.NodeId) ?? throw new GameException("目标节点无效。");
        if (!current.Neighbors.Contains(target.Id)) throw new GameException("只能移动到相邻节点。");
        var keyName = GameData.Acts.TryGetValue(state.Act, out var actDef) ? actDef.KeyName : "密钥";
        if (!state.HasKey && target.Type == NodeType.Boss)
            throw new GameException($"终局大门紧闭。{keyName}碎片 {state.KeyShards}/{state.KeyShardGoal}，还差 {state.KeyShardGoal - state.KeyShards} 片。");
        p.LastNodeId = current.Id;   // 撤离时的退路
        p.NodeId = target.Id;
        p.Ap--;
        target.Visited = true;
        target.Revealed = true;
        QuestHooks.OnEnterNode(state, target);
        ConsequenceEngine.OnNodeEntered(state, target);
        RelationshipEngine.OnSameNode(state, target);
        state.Stats.Moves++;
        var typeKey = target.Type.ToString().ToLowerInvariant();
        if (!state.Stats.SeenNodes.Contains(typeKey)) state.Stats.SeenNodes.Add(typeKey);
        if (!ChallengeEngine.Fog(state))
        {
            foreach (var neighbor in target.Neighbors)
            {
                var n = state.Node(neighbor);
                if (n is not null) n.Revealed = true;
            }
        }
        // 陷阱先结算，再考虑多人事件：否则「踩到陷阱的那一格恰好触发投票」时，
        // 陷阱结算会被投票挡掉，之后再也踩不响（0.22 引入的时序 bug）。
        if (target.Type == NodeType.Trap) return ResolveTrap(state, p, target);
        CoopEngine.MaybeTrigger(state, target);
        if (state.Phase == GamePhase.Coop) return state;
        if (target.Type == NodeType.Blank)
        {
            state.Message = string.IsNullOrWhiteSpace(target.Flavor)
                ? $"{p.Name} 走进 {target.Name}。这里什么都没有。"
                : target.Flavor;
            GameRules.Log(state, target.Flavor, "story");
            return state;
        }
        state.Message = $"{p.Name} 移动到 {target.Name}。";
        GameRules.Log(state, state.Message, "move");
        return state;
    }

    private static GameState Interact(GameState state, GameAction action)
    {
        var p = RequireActive(state, action.PlayerId);
        if (p.Ap <= 0) throw new GameException("AP 不足。");
        var node = state.Node(p.NodeId) ?? throw new GameException("当前位置无效。");
        if (!string.IsNullOrWhiteSpace(action.NodeId) && action.NodeId != node.Id)
            throw new GameException("只能与当前节点互动。");

        switch (node.Type)
        {
            case NodeType.Start:
                state.Message = "这里只有风和坏掉的自动售货机。";
                return state;
            case NodeType.Event:
            {
                if (node.Cleared) throw new GameException("这个节点已经被搜刮过了。");
                if (!GameData.Events.TryGetValue(node.EventId ?? "", out var ev))
                {
                    var available = GameData.Events.Values.Where(e => e.Act == state.Act).ToList();
                    if (available.Count == 0) available = GameData.Events.Values.ToList();
                    ev = available[new Random(state.Seed + node.Layer * 17).Next(available.Count)];
                }
                p.Ap--;
                node.Visited = true;
                state.PendingEvent = new EventState { PlayerId = p.Id, NodeId = node.Id, Event = ev };
                if (!state.Stats.SeenEvents.Contains(ev.Id)) state.Stats.SeenEvents.Add(ev.Id);
                state.Phase = GamePhase.Event;
                state.Message = $"{p.Name} 触发了事件：{ev.Title}";
                GameRules.Log(state, state.Message, "event");
                return state;
            }
            case NodeType.Skirmish:
            case NodeType.Combat:
            case NodeType.Elite:
            case NodeType.KeyElite:
            case NodeType.Boss:
            {
                if (node.Cleared) throw new GameException("这个节点已经清空了。");
                if (node.Type == NodeType.Boss && !state.HasKey)
                    throw new GameException($"需要集齐 {state.KeyShardGoal} 片密钥（当前 {state.KeyShards}/{state.KeyShardGoal}）才能进入终局。");
                p.Ap--;
                node.Visited = true;
                state.Message = $"{p.Name} 进入了战斗：{node.Name}";
                GameRules.Log(state, state.Message, "combat");
                return CombatEngine.StartCombat(state, p, node);
            }
            case NodeType.Shop:
                p.Ap--;
                state.ShopNodeId = node.Id;
                state.Shop = GenerateShop(state, node);
                state.Phase = GamePhase.Shop;
                state.Message = "黑市终端已连接。记忆币是唯一的礼貌。";
                if (!node.Supplied)
                {
                    node.Supplied = true;
                    foreach (var ally in state.Players.Where(x => x.NodeId == node.Id && !x.Downed))
                        ally.Hp = Math.Min(ally.MaxHp, ally.Hp + Math.Max(4, ally.MaxHp * 15 / 100));
                    state.Message = "黑市终端已连接，并做了一次免费补给（全队 +15% HP）。";
                    GameRules.Log(state, "商店首访补给：全队恢复 15% HP。", "heal");
                }
                GameRules.Log(state, state.Message, "shop");
                return state;
            case NodeType.Corpse:
                return LootCorpse(state, p, node);
            case NodeType.Server:
                return UseServer(state, p, node);
            case NodeType.Awakening:
                return Awaken(state, p, node);
            case NodeType.Echo:
                return InteractEcho(state, p, node);
            case NodeType.Safehouse:
                p.Ap--;
                state.SafehouseNodeId = node.Id;
                state.Phase = GamePhase.Safehouse;
                state.Message = "安全屋的门锁认得你们。这里暂时安全。";
                GameRules.Log(state, state.Message, "safehouse");
                return state;
            case NodeType.Terminal:
                if (node.Cleared) throw new GameException("这台终端已经接入过了。");
                p.Ap--;
                node.Cleared = true;
                node.Visited = true;
                foreach (var n in state.Nodes) n.Revealed = true;
                GameRules.GainMemory(state, 30);
                GameRules.Log(state, "旧网终端接入成功：全图揭示，获得 30 记忆币。", "loot");
                state.Message = "旧网终端把整座城市的地图吐了出来。";
                return state;
            case NodeType.Treasure:
                if (node.Cleared) throw new GameException("数据宝库已经被搬空了。");
                p.Ap--;
                node.Cleared = true;
                node.Visited = true;
                if (!string.IsNullOrEmpty(node.LootItem))
                    GameRules.GrantItem(state, p, node.LootItem, "数据宝库");
                else
                    GameRules.GrantItem(state, p, "t_chip", "数据宝库");
                GameRules.GainMemory(state, 25);
                QuestHooks.OnLoot(state, NodeType.Treasure);
                state.Message = "数据宝库打开了。里面有一件装备和 25 记忆币。";
                return state;
            case NodeType.Key:
                if (node.Cleared) throw new GameException("密钥已经在你手里了。");
                p.Ap--;
                node.Cleared = true;
                node.Visited = true;
                state.HasKey = true;
                QueueBeat(state, "key_first");
                foreach (var n in state.Nodes) n.Revealed = true;
                var currentKey = GameData.Acts[state.Act].KeyName;
                GameRules.Log(state, $"{currentKey}已获取。终局大门解除锁定。", "story");
                state.Message = $"{currentKey}在掌心发烫。它像一枚被遗忘的牙。";
                return state;
            case NodeType.Blank:
                state.Message = string.IsNullOrWhiteSpace(node.Flavor) ? "这里什么都没有。" : node.Flavor;
                return state;
            default:
                throw new GameException("这里没有可互动的东西。");
        }
    }

    private static GameState UseItem(GameState state, GameAction action)
    {
        var p = RequireActive(state, action.PlayerId);
        var id = action.ItemId ?? "";
        if (!GameData.Consumables.TryGetValue(id, out var def))
            throw new GameException("没有这个道具。");
        if (def.CombatOnly)
            throw new GameException($"{def.Name}只能在战斗中使用。");
        var target = state.Players.FirstOrDefault(x => x.Id == (action.TargetPlayerId ?? p.Id)) ?? p;
        if (target.Downed) throw new GameException("倒下的角色不能作为目标。");
        if (!GameRules.TakeConsumable(p, id)) throw new GameException("道具不足。");
        switch (def.Effect)
        {
            case "heal":
            {
                var amount = Math.Max(1, target.MaxHp * def.Amount / 100);
                var before = target.Hp;
                target.Hp = Math.Min(target.MaxHp, target.Hp + amount);
                state.Message = $"{p.Name} 给 {target.Name} 用了{def.Name}：+{target.Hp - before} HP。";
                GameRules.Log(state, state.Message, "heal");
                break;
            }
            case "focus":
            {
                var before = target.Focus;
                target.Focus = Math.Min(target.MaxFocus, target.Focus + def.Amount);
                state.Message = $"{p.Name} 给 {target.Name} 用了{def.Name}：+{target.Focus - before} Focus。";
                GameRules.Log(state, state.Message, "heal");
                break;
            }
            default:
                throw new GameException($"{def.Name}只能在战斗中使用。");
        }
        p.Ap--;
        return state;
    }

    /// <summary>陷阱：进入即触发，d100 检定，永不致死。</summary>
    private static GameState ResolveTrap(GameState state, PlayerState p, NodeState node)
    {
        if (node.Cleared)
        {
            state.Message = "这块地面已经被标出来了，绕过去就好。";
            return state;
        }
        node.Cleared = true;
        var rng = new Random(state.Seed ^ Stable.Hash(node.Id) ^ (state.Round * 31));
        var chance = Math.Clamp(30 + (p.Stats.Spd - 50) / 2 + (p.Stats.L - 50) / 4, 10, 85);
        var roll = rng.Next(1, 101);
        if (roll <= chance)
        {
            state.Message = $"{p.Name} 踩住了那块松动的板。「{node.Name}」没有响。";
            GameRules.Log(state, state.Message, "info");
            if (rng.Next(100) < 20)
                GameRules.GrantConsumable(state, p, GameRules.RandomConsumableId(state.Act, rng), 1);
            return state;
        }
        var pct = 8 + rng.Next(0, 7);
        var dmg = Math.Max(2, p.MaxHp * pct / 100);
        p.Hp = Math.Max(1, p.Hp - dmg);
        state.Message = $"{p.Name} 触发了「{node.Name}」，失去 {dmg} HP（{pct}%）。";
        GameRules.Log(state, state.Message, "death");
        return state;
    }

    /// <summary>前人的遗骸：记忆币 + 概率道具/装备。</summary>
    private static GameState LootCorpse(GameState state, PlayerState p, NodeState node)
    {
        if (node.Cleared) throw new GameException("这里已经被搜过了。");
        p.Ap--;
        node.Cleared = true;
        node.Visited = true;
        var rng = new Random(state.Seed ^ Stable.Hash(node.Id) ^ (state.Round * 17));
        var memory = 20 + rng.Next(0, 16);
        GameRules.GainMemory(state, memory);
        var extra = "";
        if (rng.Next(100) < 8)
        {
            var pool = state.Act switch
            {
                2 => new[] { "t_mirror_invite", "h_mirror_crown", "c_eye" },
                3 => new[] { "t_orbit_key", "h_orbit_halo", "c_core" },
                _ => new[] { "t_chip", "t_feather", "c_eye" }
            };
            GameRules.GrantItem(state, p, pool[rng.Next(pool.Length)], "遗骸");
            extra = "，还有一件装备";
        }
        else if (rng.Next(100) < 60)
        {
            var cid = GameRules.RandomConsumableId(state.Act, rng);
            GameRules.GrantConsumable(state, p, cid, 1);
            extra = $"，还有一件{GameData.ConsumableName(cid)}";
        }
        var flavor = Narrative.CorpseLine(rng);
        GameRules.Log(state, $"{p.Name} 搜刮了「{node.Name}」：+{memory} 记忆币{extra}。", "loot");
        QuestHooks.OnLoot(state, NodeType.Corpse);
        state.Message = $"{flavor}（+{memory} 记忆币{extra}）";
        return state;
    }

    /// <summary>废弃服务器：只给使用者一项数值；属性类每人每幕上限 2 台。</summary>
    private static GameState UseServer(GameState state, PlayerState p, NodeState node)
    {
        if (node.Cleared) throw new GameException("这台服务器已经被格式化过了。");
        p.Ap--;
        node.Cleared = true;
        node.Visited = true;
        var kind = node.ServerKind ?? "vit";
        var name = MapGenerator.ServerName(kind);
        QuestHooks.OnServerWrite(state);

        if (GameData.ServerStatKey.TryGetValue(kind, out var stat))
        {
            if (p.ServerWrites >= 2)
            {
                GameRules.GainMemory(state, 60);
                state.Message = "接口烧了。你在冒烟的手腕上捡到 60 记忆币。";
                GameRules.Log(state, $"{p.Name} 本幕已写入两次，第三台{name}只留下 60 记忆币。", "info");
                return state;
            }
            var gain = state.Act switch { 2 => 3, 3 => 4, _ => 2 };
            switch (stat)
            {
                case "VIT": p.ServerBonus.Vit += gain; break;
                case "C": p.ServerBonus.C += gain; break;
                case "H": p.ServerBonus.H += gain; break;
                case "E": p.ServerBonus.E += gain; break;
                case "SPD": p.ServerBonus.Spd += gain; break;
                case "L": p.ServerBonus.L += gain; break;
            }
            p.ServerWrites++;
            GameRules.RecalculatePlayer(p);
            state.Message = $"{p.Name} 接入了{name}：{stat} +{gain}（本幕第 {p.ServerWrites}/2 次写入）。";
            GameRules.Log(state, state.Message, "level");
            return state;
        }

        switch (kind)
        {
            case "heal":
            {
                var heal = Math.Max(8, p.MaxHp * 40 / 100);
                var before = p.Hp;
                p.Hp = Math.Min(p.MaxHp, p.Hp + heal);
                state.Message = $"{p.Name} 接入了{name}：+{p.Hp - before} HP。";
                break;
            }
            case "focus":
            {
                var before = p.Focus;
                p.Focus = Math.Min(p.MaxFocus, p.Focus + 4);
                state.Message = $"{p.Name} 接入了{name}：+{p.Focus - before} Focus。";
                break;
            }
            case "xp":
                GameRules.GrantXp(state, p, 60);
                state.Message = $"{p.Name} 接入了{name}：+60 XP。";
                break;
            default:
                state.Message = $"{p.Name} 接入了{name}。";
                break;
        }
        GameRules.Log(state, state.Message, "level");
        return state;
    }

    /// <summary>
    /// 「找回自我」：**每个角色各能觉醒一次**；回声节点仍然只能被取走一次。
    /// 0.14 之前是全队只能一个人觉醒 —— 4 人队里 3 个人永远看不到自己那 3 条觉醒技，
    /// 48 条觉醒内容一局最多只能用掉 3 条（6.25%）。
    /// 稀缺的应该是「回声」，不是「名额」。
    /// </summary>
    private static GameState Awaken(GameState state, PlayerState p, NodeState node)
    {
        if (p.Awakened)
        {
            state.Message = "你已经找回过自己一次。回声不再回应。";
            return state;
        }
        if (node.Cleared)
        {
            state.Message = "这个回声已经被取走了。去别处找。";
            GameRules.Log(state, state.Message, "info");
            return state;
        }

        p.Ap--;
        node.Cleared = true;
        node.Visited = true;
        p.Awakened = true;
        // AwakenedPlayerId 保留为"第一个觉醒的人"（存档兼容 + 前端展示），但不再作为名额限制
        if (string.IsNullOrEmpty(state.AwakenedPlayerId)) state.AwakenedPlayerId = p.Id;

        var weaponId = GameData.AwakeningWeapon.TryGetValue(p.CharacterId, out var wid) ? wid : "";
        if (!string.IsNullOrEmpty(weaponId))
        {
            if (p.Equipment.TryGetValue("Weapon", out var oldWeapon) && oldWeapon is not null)
                p.Inventory.Add(oldWeapon);
            p.Equipment["Weapon"] = GameRules.CreateItem(weaponId);
        }
        p.SkillIds = p.SkillIds
            .Select(id => GameData.Skills.ContainsKey(id + "_awakened") ? id + "_awakened" : id)
            .ToList();
        ChallengeEngine.OnAwaken(state, p);
        RelationshipEngine.OnAwaken(state, p.Id);

        // 觉醒共鸣：队伍里每有一名觉醒者，全队 +1 护甲 / +1 抗性 / +5 最大生命（上限 3 层）。
        // 包括自己在内——这样第一个觉醒的人也能立刻感到"变强了"，而不是等队友。
        var resonance = Math.Min(3, state.Players.Count(x => x.Awakened));
        foreach (var ally in state.Players)
        {
            ally.AwakenResonance = resonance;
            GameRules.RecalculatePlayer(ally);
            ally.Hp = Math.Min(ally.Hp, ally.MaxHp);   // 共鸣加了 MaxHp，不会超；但装备换过要防一手
        }

        var line = GameData.AwakeningLine.TryGetValue(p.CharacterId, out var text)
            ? text
            : "它找回了自己。";
        var weaponName = !string.IsNullOrEmpty(weaponId) && GameData.Gear.TryGetValue(weaponId, out var wg)
            ? wg.Name
            : "一件旧东西";
        state.PendingBeat = new StoryBeat
        {
            Id = $"awaken_{p.Id}",
            Title = "找回自我",
            Subtitle = $"AWAKENING // {p.Name}",
            Body = line + "\n\n" +
                   $"它手里多了一件东西：{weaponName}。\n" +
                   "技能也变了——还是那几招，但不再一样。\n\n" +
                   "这段回声只够一个人用。剩下的路，其他人还得靠自己。"
        };
        GameRules.Log(state, $"{p.Name} 完成觉醒，获得 {weaponName}，技能全部强化。全局觉醒名额已用尽。", "level");
        state.Message = $"{p.Name} 找回了自己。";
        return state;
    }

    private static GameState Rest(GameState state, GameAction action)
    {
        var p = RequireActive(state, action.PlayerId);
        if (state.Phase == GamePhase.Safehouse)
        {
            var heal = Math.Max(10, (int)Math.Ceiling(p.MaxHp * 0.35));
            p.Hp = Math.Min(p.MaxHp, p.Hp + heal);
            GameRules.Log(state, $"{p.Name} 在安全屋休息，恢复 {heal} HP。", "heal");
            state.Message = "安全屋的灯管闪了两下，像某种古老的祝福。";
            return state;
        }
        if (p.Ap < 2) throw new GameException("休息需要 2 AP。");
        p.Ap -= 2;
        var amount = Math.Max(8, (int)Math.Ceiling(p.MaxHp * 0.2));
        p.Hp = Math.Min(p.MaxHp, p.Hp + amount);
        GameRules.Log(state, $"{p.Name} 原地休整，恢复 {amount} HP。", "heal");
        state.Message = $"休息完成，恢复 {amount} HP。";
        return state;
    }

    private static PlayerState AssistTarget(GameState state, PlayerState p, GameAction action)
    {
        var target = state.Players.FirstOrDefault(x => x.Id == action.TargetPlayerId)
                     ?? throw new GameException("找不到协助目标。");
        if (target.Id == p.Id) throw new GameException("不能协助自己。");
        if (target.NodeId != p.NodeId && !(state.Node(p.NodeId)?.Neighbors.Contains(target.NodeId) ?? false))
            throw new GameException("只能协助同节点或相邻节点的队友。");
        return target;
    }

    /// <summary>assistGuard：为相邻队友承担本场战斗一半伤害（消耗 1 AP）。</summary>
    private static GameState AssistGuard(GameState state, GameAction action)
    {
        var p = RequireActive(state, action.PlayerId);
        if (p.Ap < 1) throw new GameException("AP 不足。");
        var target = AssistTarget(state, p, action);
        p.Ap--;
        target.GuardLinkFrom = p.Id;
        state.Stats.Assists++;
        RelationshipEngine.OnAssist(state, p.Id, target.Id);
        GameRules.Log(state, $"{p.Name} 为 {target.Name} 提供掩护：下一场战斗替 TA 承担一半伤害。", "support");
        state.Message = $"{target.Name} 获得掩护。";
        return state;
    }

    /// <summary>assistFocus：把自己的 1 点 Focus 让给队友；赠满则强化其终极技。</summary>
    private static GameState AssistFocus(GameState state, GameAction action)
    {
        var p = RequireActive(state, action.PlayerId);
        if (p.Ap < 1) throw new GameException("AP 不足。");
        if (p.Focus < 1) throw new GameException("自己的 Focus 不足。");
        var target = AssistTarget(state, p, action);
        p.Ap--;
        p.Focus--;
        target.Focus = Math.Min(target.MaxFocus, target.Focus + 1);
        if (target.Focus >= target.MaxFocus)
        {
            target.UltimatePrep += 3;
            GameRules.Log(state, $"{p.Name} 把 Focus 赠给 {target.Name}：Focus 已满，终极技每击 +3。", "support");
            state.Synergies.Add("focus_gift");
            state.Stats.SynergyTriggers++;
        }
        else
        {
            GameRules.Log(state, $"{p.Name} 把 1 点 Focus 让给 {target.Name}。", "support");
        }
        state.Stats.Assists++;
        state.Message = $"{target.Name} 获得 Focus。";
        return state;
    }

    /// <summary>assistMark：为队友的下一次攻击标记目标（+8 命中，最多叠到 25）。</summary>
    private static GameState AssistMark(GameState state, GameAction action)
    {
        var p = RequireActive(state, action.PlayerId);
        if (p.Ap < 1) throw new GameException("AP 不足。");
        var target = AssistTarget(state, p, action);
        p.Ap--;
        target.AssistBonus = Math.Min(25, target.AssistBonus + 8);
        state.Stats.Assists++;
        RelationshipEngine.OnAssist(state, p.Id, target.Id);
        GameRules.Log(state, $"{p.Name} 为 {target.Name} 标记了下一次攻击的目标：命中 +8%。", "support");
        state.Message = $"{target.Name} 的下一次攻击获得标记加成。";
        return state;
    }

    /// <summary>assistRescue：把同节点倒下的队友拉起来（1 AP，每幕一次）。</summary>
    private static GameState AssistRescue(GameState state, GameAction action)
    {
        var p = RequireActive(state, action.PlayerId);
        if (p.Ap < 1) throw new GameException("AP 不足。");
        var target = state.Players.FirstOrDefault(x => x.Id == action.TargetPlayerId)
                     ?? throw new GameException("找不到救援目标。");
        if (target.NodeId != p.NodeId) throw new GameException("只能救援同节点的队友。");
        if (!target.Downed) throw new GameException("该队友没有倒下。");
        if (p.RescueUsedAct == state.Act) throw new GameException("本幕已经救援过一次了。");
        p.Ap--;
        p.RescueUsedAct = state.Act;
        target.Downed = false;
        target.Hp = Math.Max(1, target.MaxHp / 10);
        target.Ap = 0;
        state.Stats.Assists++;
        RelationshipEngine.OnAssist(state, p.Id, target.Id);
        GameRules.Log(state, $"{p.Name} 把 {target.Name} 从地上拖了回来（{target.Hp} HP）。每幕只能救一次。", "support");
        state.Message = $"{target.Name} 重新上线。";
        return state;
    }

    /// <summary>assistPing：只写一个共享标记，不改任何规则状态，也不消耗 AP。</summary>
    private static GameState AssistPing(GameState state, GameAction action)
    {
        var p = RequireActive(state, action.PlayerId);
        var nodeId = !string.IsNullOrWhiteSpace(action.NodeId) ? action.NodeId : p.NodeId;
        var node = state.Node(nodeId) ?? throw new GameException("目标节点无效。");
        state.Ping = new PingState
        {
            NodeId = node.Id,
            By = p.Name,
            Note = string.IsNullOrWhiteSpace(action.Slot) ? "看这里" : action.Slot!,
            At = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        };
        GameRules.Log(state, $"{p.Name} 标记了 {node.Name}：{state.Ping.Note}。", "support");
        state.Message = $"已标记 {node.Name}。";
        return state;
    }

    private static GameState Assist(GameState state, GameAction action)
    {
        var p = RequireActive(state, action.PlayerId);
        if (p.Ap < 1) throw new GameException("AP 不足。");
        var target = state.Players.FirstOrDefault(x => x.Id == action.TargetPlayerId)
                     ?? throw new GameException("找不到协助目标。");
        if (target.Id == p.Id) throw new GameException("不能协助自己。");
        if (target.NodeId != p.NodeId && !(state.Node(p.NodeId)?.Neighbors.Contains(target.NodeId) ?? false))
            throw new GameException("只能协助同节点或相邻节点的队友。");
        p.Ap--;
        target.AssistBonus = Math.Min(25, target.AssistBonus + 10);
        GameRules.Log(state, $"{p.Name} 协助 {target.Name}：下一次战斗准确率 +10%。", "support");
        state.Message = $"{target.Name} 获得协助，战斗准确率 +10%。";
        return state;
    }

    private static GameState EndTurn(GameState state, GameAction action)
    {
        var p = RequireActive(state, action.PlayerId);
        // 剩下的行动力用来包扎：让"见好就收"变成一个真实选择，而不是纯浪费
        if (p.Ap > 0 && p.Hp < p.MaxHp)
        {
            var heal = Math.Max(1, p.MaxHp * 4 / 100 * p.Ap);
            var before = p.Hp;
            p.Hp = Math.Min(p.MaxHp, p.Hp + heal);
            if (p.Hp > before)
                GameRules.Log(state, $"{p.Name} 把剩下的 {p.Ap} 点行动力用在包扎上：+{p.Hp - before} HP。", "heal");
        }
        p.Ap = 0;
        AdvanceExplorationTurn(state);
        return state;
    }

    /// <summary>每多少个「玩家回合」扣 1 点电子追踪。4 = 4 人队正好一轮一次，与旧规则完全等价。</summary>
    private const int PlayerTurnsPerPurgeTick = 4;

    public static void AdvanceExplorationTurn(GameState state)
    {
        if (state.Phase is GamePhase.Victory or GamePhase.Defeat) return;

        // 时钟按「玩家回合」走，而不是按「轮」。
        // 一轮的定义是"所有玩家各行动一次"：4 人队一轮就有 4 个玩家回合，所以旧规则（每轮 -1）
        // 对 4 人队是"每 4 回合 -1"；但 2 人队一轮只有 2 个回合，同样每轮 -1，等于时钟压力翻倍。
        // 实测 2 人局 25 轮就被追踪追上、第一幕都没打完 —— 这是少人局的系统性歧视，不是难度问题。
        // 按回合计之后，42 点追踪 = 168 个玩家回合，对所有人数都是同一份预算。
        state.PurgeTicks++;
        var tickEvery = ChallengeEngine.PurgeTickEvery(state);
        if (state.PurgeTicks >= tickEvery)
        {
            state.PurgeTicks -= tickEvery;
            GameRules.AdjustPurge(state, -1);
            if (state.Purge == 3) QueueBeat(state, "purge_low");
            if (state.Purge <= 0)
            {
                state.Phase = GamePhase.Defeat;
                state.Outcome = state.Act switch
                {
                    2 => "电子追踪已完成。镜海穹顶把你们移出了宾客名单，并收走了雨伞。",
                    3 => "电子追踪已完成。零号轨道把你们归档为一次成功的删除操作。",
                    _ => "电子追踪已完成。霓虹港把你们归档为‘已注销’。"
                };
                state.DefeatedBy = "电子追踪归零";
                GameRules.Log(state, state.Outcome, "death");
                return;
            }
            GameRules.Log(state, $"时钟仍在走：电子追踪剩余 {state.Purge}/{state.PurgeMax}。", "round");
        }

        var currentIndex = state.Players.FindIndex(p => p.Id == state.ActivePlayerId);
        for (var step = 1; step <= state.Players.Count * 2; step++)
        {
            var next = (currentIndex + step) % state.Players.Count;
            if (next == 0 || currentIndex < 0) state.Round++;
            var candidate = state.Players[next];
            if (candidate.Downed) continue;
            state.ActivePlayerId = candidate.Id;
            candidate.Ap = 3;
            state.Message = $"轮到 {candidate.Name} 行动。";
            GameRules.Log(state, state.Message, "turn");
            return;
        }
        state.Phase = GamePhase.Defeat;
        state.Outcome = state.Act switch
        {
            2 => "队伍全员倒下。穹顶的侍者把你们摆回宴会厅，作为下一道冷盘。",
            3 => "队伍全员倒下。主脑把你们的声音收进了会议纪要，并宣布全票通过。",
            _ => "队伍全员倒下。霓虹港学会了你们的名字，然后删除了它。"
        };
        state.DefeatedBy = "全员倒下";
    }

    private static GameState Equip(GameState state, GameAction action)
    {
        var p = state.Players.FirstOrDefault(x => x.Id == action.PlayerId) ?? throw new GameException("找不到角色。");
        var item = p.Inventory.FirstOrDefault(x => x.InstanceId == action.ItemId)
                   ?? throw new GameException("背包里没有这件装备。");
        if (!string.IsNullOrEmpty(action.Slot) && !string.Equals(item.Slot, action.Slot, StringComparison.OrdinalIgnoreCase))
            throw new GameException("装备槽不匹配。");
        p.Inventory.Remove(item);
        if (p.Equipment.TryGetValue(item.Slot, out var old) && old is not null)
            p.Inventory.Add(old);
        p.Equipment[item.Slot] = item;
        GameRules.RecalculatePlayer(p);
        GameRules.Log(state, $"{p.Name} 装备了 {item.Name} {item.LevelText}。", "gear");
        state.Message = $"{p.Name} 装备了 {item.Name}。";
        return state;
    }

    private static GameState Upgrade(GameState state, GameAction action)
    {
        // 幕间也算整备窗口：进下一幕之前把钱花掉，是玩家最需要的一次决策。
        // 以前只能等到下一个安全屋，等于把「刚打完首领」这个最该配装的时刻浪费掉了。
        if (state.Phase is not (GamePhase.Safehouse or GamePhase.ActTransition))
            throw new GameException("只能在安全屋或幕间强化装备。");
        var p = state.Players.FirstOrDefault(x => x.Id == action.PlayerId) ?? throw new GameException("找不到角色。");
        if (string.IsNullOrWhiteSpace(action.Slot)) throw new GameException("缺少装备槽。");
        if (!p.Equipment.TryGetValue(action.Slot, out var item) || item is null)
            throw new GameException("该槽位没有装备。");
        if (item.Level >= 5) throw new GameException("装备已达到 +5。");
        var costMemory = 35 + item.Level * 30;
        var costAlloy = 1 + item.Level / 3;
        if (state.Memory < costMemory) throw new GameException($"记忆币不足，需要 {costMemory}。");
        if (state.Alloy < costAlloy) throw new GameException($"合金不足，需要 {costAlloy}。");
        state.Memory -= costMemory;
        state.Alloy -= costAlloy;
        var upgraded = GameRules.CreateItem(item.ItemId, item.Level + 1);
        p.Equipment[action.Slot] = upgraded;
        GameRules.RecalculatePlayer(p);
        GameRules.Log(state, $"{p.Name} 将 {item.Name} 强化至 {upgraded.LevelText}。", "forge");
        state.Message = $"{item.Name} 强化成功：{upgraded.LevelText}。没有失败，没有破碎，只有账单。";
        return state;
    }

    private static List<ShopItem> GenerateShop(GameState state, NodeState node)
    {
        var rng = new Random(state.Seed ^ (Stable.Hash(node.Id) * 397));
        var pool = new List<string>
        {
            "w_blade", "w_rifle", "w_deck", "w_gauntlet",
            "a_jacket", "a_plate", "a_robe", "a_exo",
            "h_visor", "h_helm", "h_crown", "h_mask",
            "t_coin", "t_chip", "t_feather", "t_heart",
            "c_legs", "c_arms", "c_eye", "c_lung", "c_singularity"
        };
        if (state.Act == 2)
            pool.AddRange(new[] { "w_mirror_blade", "a_mirror_suit", "h_mirror_crown", "t_mirror_invite", "c_core" });
        else if (state.Act == 3)
            pool.AddRange(new[] { "w_orbit_lance", "a_orbit_shell", "h_orbit_halo", "t_orbit_key", "c_core" });
        if (node.Layer >= 3)
        {
            if (state.Act == 1)
                pool.AddRange(new[] { "w_blade_rare", "w_rifle_rare", "w_deck_rare", "w_gauntlet_rare", "c_core" });
            else if (state.Act == 2)
                pool.Add("w_archon_edge");
            else
                pool.Add("w_zenith");
        }
        var chosen = pool.OrderBy(_ => rng.Next()).Take(4).ToList();
        var shopItems = chosen.Select(id =>
        {
            var g = GameData.Gear[id];
            return new ShopItem
            {
                ItemId = id,
                Name = g.Name,
                Slot = g.Slot,
                Rarity = g.Rarity,
                Desc = g.Desc,
                Price = g.Price + rng.Next(0, 21),
                Level = 0,
                Sold = false
            };
        }).ToList();

        // 消耗品位：每个商店固定两个，让玩家随时能把钱变成续航
        var consumablePool = state.Act >= 2
            ? new[] { "medkit", "focus_cell", "purifier", "shield_gen", "adrenaline" }
            : new[] { "medkit", "focus_cell", "purifier" };
        foreach (var cid in consumablePool.OrderBy(_ => rng.Next()).Take(2))
        {
            var c = GameData.Consumables[cid];
            shopItems.Add(new ShopItem
            {
                ItemId = cid,
                Name = c.Name,
                Slot = "Consumable",
                Rarity = c.Rarity,
                Desc = c.Desc,
                Price = c.Price,
                Level = 0,
                Sold = false
            });
        }
        var priceMul = ChallengeEngine.ShopPriceMul(state) * ConsequenceEngine.ShopMul(state);
        if (priceMul != 1)
            foreach (var it in shopItems)
                it.Price = Math.Max(1, (int)Math.Round(it.Price * priceMul));
        return shopItems;
    }

    private static GameState Buy(GameState state, GameAction action)
    {
        if (state.Phase != GamePhase.Shop) throw new GameException("当前不在商店。");
        var p = RequireActive(state, action.PlayerId);
        var item = state.Shop.FirstOrDefault(x => x.ItemId == action.ItemId)
                   ?? throw new GameException("商店里没有这件商品。");
        if (item.Sold) throw new GameException("这件商品已经卖出去了。");
        if (state.Memory < item.Price) throw new GameException($"记忆币不足，需要 {item.Price}。");
        state.Memory -= item.Price;
        item.Sold = true;
        if (item.Slot == "Consumable")
        {
            GameRules.GrantConsumable(state, p, item.ItemId, 1);
            GameRules.Log(state, $"{p.Name} 购买了 {item.Name}，花费 {item.Price} 记忆币。", "shop");
            state.Message = $"购买成功：{item.Name}。随时可用。";
            return state;
        }
        p.Inventory.Add(GameRules.CreateItem(item.ItemId, item.Level));
        GameRules.Log(state, $"{p.Name} 购买了 {item.Name}，花费 {item.Price} 记忆币。", "shop");
        state.Message = $"购买成功：{item.Name}。装备后才会生效。";
        return state;
    }

    private static GameState CloseModal(GameState state, GameAction action)
    {
        if (state.Phase is GamePhase.Shop or GamePhase.Safehouse)
        {
            state.Phase = GamePhase.Exploration;
            state.Shop = new();
            state.ShopNodeId = null;
            state.SafehouseNodeId = null;
            state.Message = "你离开了终端。城市的噪声重新涌进来。";
            return state;
        }
        throw new GameException("当前没有可关闭的界面。");
    }

    private static GameState ReviveAtSafehouse(GameState state, GameAction action)
    {
        if (state.Phase != GamePhase.Safehouse) throw new GameException("只能在安全屋复活。");
        if (ChallengeEngine.NoRevive(state)) throw new GameException("铁人协议：安全屋不提供复活。");
        var target = state.Players.FirstOrDefault(p => p.Id == action.PlayerId) ?? throw new GameException("找不到角色。");
        if (!target.Downed) throw new GameException("该角色没有倒下。");
        if (state.TeamLives <= 0) throw new GameException("队伍生命已耗尽。");
        if (state.Memory < 60) throw new GameException("复活需要 60 记忆币。");
        state.Memory -= 60;
        state.TeamLives--;
        target.Downed = false;
        target.Hp = Math.Max(1, target.MaxHp / 2);
        GameRules.Log(state, $"{target.Name} 在安全屋重新上线。剩余队伍生命：{state.TeamLives}。", "revive");
        state.Message = "生命维持系统发出一声不太可靠的启动音。";
        return state;
    }

    private static GameState ApplyEventAction(GameState state, GameAction action)
    {
        if (action.Type != "eventChoice") throw new GameException("请先处理当前事件。");
        var pending = state.PendingEvent ?? throw new GameException("没有待处理事件。");
        if (action.ChoiceIndex < 0 || action.ChoiceIndex >= pending.Event.Choices.Count)
            throw new GameException("无效的事件选项。");
        var player = state.Players.FirstOrDefault(p => p.Id == pending.PlayerId)
                     ?? throw new GameException("事件角色不存在。");
        var choice = pending.Event.Choices[action.ChoiceIndex];

        if (choice.CostMemory > 0 && state.Memory < choice.CostMemory)
            throw new GameException($"需要 {choice.CostMemory} 记忆币。");
        if (choice.CostHp > 0 && player.Hp <= choice.CostHp)
            throw new GameException("生命不足，无法支付代价。");
        if (!string.IsNullOrWhiteSpace(choice.CostItem) &&
            !player.Inventory.Any(i => i.ItemId == choice.CostItem))
            throw new GameException("缺少所需物品。");

        state.Memory -= choice.CostMemory;
        if (choice.CostHp > 0) player.Hp -= choice.CostHp;

        var rng = ActionRng(state);
        var success = true;
        if (!string.IsNullOrWhiteSpace(choice.Stat) && choice.Dc > 0)
        {
            var roll = GameRules.Check(rng, player, choice.Stat!, choice.Dc, $"{pending.Event.Title} · {GameRules.StatLabel(choice.Stat)}");
            state.LastRoll = roll;
            success = roll.Success;
        }
        else
        {
            state.LastRoll = null;
        }

        var text = success ? choice.SuccessText : choice.FailText;
        var memory = success ? choice.SuccessMemory : choice.FailMemory;
        var hp = success ? choice.SuccessHp : choice.FailHp;
        var xp = success ? choice.SuccessXp : choice.FailXp;
        var purge = success ? choice.SuccessPurge : choice.FailPurge;
        var alloy = success ? choice.SuccessAlloy : choice.FailAlloy;
        var signal = success ? choice.SuccessSignal : choice.FailSignal;
        var item = success ? choice.SuccessItem : choice.FailItem;

        if (memory != 0) GameRules.GainMemory(state, memory > 0 ? ChallengeEngine.Reward(state, memory) : memory);
        if (hp > 0) player.Hp = Math.Min(player.MaxHp, player.Hp + hp);
        if (hp < 0) player.Hp = Math.Max(1, player.Hp + hp);
        if (purge != 0) GameRules.AdjustPurge(state, purge);
        if (alloy != 0) state.Alloy = Math.Max(0, state.Alloy + (alloy > 0 ? ChallengeEngine.Reward(state, alloy) : alloy));
        if (signal != 0) state.Signal = Math.Max(0, state.Signal + signal);
        if (!string.IsNullOrWhiteSpace(item)) GameRules.GrantItem(state, player, item, pending.Event.Title);
        if (xp > 0) GameRules.GrantXp(state, player, (int)Math.Round(xp * Math.Max(1, ChallengeEngine.RewardMul(state) * 0.5)));

        var node = state.Node(pending.NodeId);
        if (node is not null)
        {
            node.Cleared = true;
            node.Visited = true;
        }
        ConsequenceEngine.OnEventResolved(state, pending.Event, success);
        GameRules.Log(state, $"{pending.Event.Title}：{text}", success ? "event" : "warn");
        state.PendingEvent = null;
        state.Phase = GamePhase.Exploration;
        state.Message = string.IsNullOrWhiteSpace(text) ? "事件已处理。" : text;
        return state;
    }

    private static Random ActionRng(GameState state)
        => new(state.Seed ^ (state.Round * 104729) ^ (state.Log.Count * 7919) ^ (state.Purge * 31));
}
