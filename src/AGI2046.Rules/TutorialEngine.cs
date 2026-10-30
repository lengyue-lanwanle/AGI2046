namespace AGI2046.Rules;

/// <summary>
/// 教学引擎：一张固定的训练场、两名固定角色、一个软目标，外加一台只允许「下一步」的步骤机。
/// 设计约束（0.20）：
///   · 不生成三幕地图，也不写进正式对局；
///   · 每个步骤都有可见目标，做错时只说「先做什么」，不弹一屏规则；
///   · 任何一步都可跳过，跳过只是把这局标成已完成，不惩罚玩家；
///   · 失败可以重试，正式存档完全不受影响。
/// </summary>
public static class TutorialEngine
{
    public const string StartNode = "t0";
    public const string CombatNode = "t1";
    public const string SafehouseNode = "t2";

    /* ── 建局 ────────────────────────────────────────────────────── */

    public static GameState NewTutorial(bool firstTime = true)
    {
        var state = new GameState
        {
            SessionId = Guid.NewGuid().ToString("N")[..12],
            Mode = GameMode.Tutorial,
            Seed = 20460,
            Act = 1,
            ActName = "训练场 · 模拟协议",
            ActSubtitle = "TRAINING SIM",
            Round = 1,
            Purge = 12,
            PurgeMax = 12,
            TeamLives = 3,
            Memory = 80,
            Alloy = 1,
            Signal = 2,
            Phase = GamePhase.Exploration,
            ActivePlayerId = "p1",
            Objective = "教学：走完移动 → 战斗 → 技能 → 资源 → 撤退 → 安全屋。",
            FirstRun = false
        };

        state.Nodes.Add(new NodeState
        {
            Id = StartNode, Name = "训练场 · 入口", Type = NodeType.Start,
            District = "TRAINING SIM", Desc = "一块被擦干净的空地。远处有一台还在巡逻的旧哨兵。",
            Layer = 0, Lane = 1, X = 60, Y = 180,
            Revealed = true, Visited = true, Cleared = true,
            Neighbors = new() { CombatNode }
        });
        state.Nodes.Add(new NodeState
        {
            Id = CombatNode, Name = "训练靶机", Type = NodeType.Skirmish,
            District = "TRAINING SIM", Desc = "一台被拆掉武器的旧哨兵。把它打完，这一课就结束了。",
            Layer = 1, Lane = 1, X = 210, Y = 180,
            EnemyGroup = "g_tut",
            Revealed = true, Neighbors = new() { StartNode, SafehouseNode }
        });
        state.Nodes.Add(new NodeState
        {
            Id = SafehouseNode, Name = "训练安全屋", Type = NodeType.Safehouse,
            District = "TRAINING SIM", Desc = "一间有灯的屋子。休息、强化、复活——正式局里也是这三件事。",
            Layer = 2, Lane = 1, X = 360, Y = 180,
            Revealed = true, Neighbors = new() { CombatNode }
        });
        state.Edges.Add(new EdgeState { From = StartNode, To = CombatNode });
        state.Edges.Add(new EdgeState { From = CombatNode, To = SafehouseNode });

        for (var i = 0; i < GameData.TutorialTeam.Length; i++)
            state.Players.Add(BuildPlayer(state, GameData.TutorialTeam[i], $"p{i + 1}", i));

        // 教学里资源是教学道具：每人一支止血针，确保「用掉一个消耗品」这一步谁行动都做得成。
        foreach (var p in state.Players) GameRules.GrantConsumable(state, p, "medkit", 1);
        state.Players[0].Consumables["focus_cell"] = 1;
        state.Log.Clear();   // GrantConsumable 会写日志，教学开场不要两行「获得道具」

        state.Tutorial = new TutorialState
        {
            Active = true,
            Step = TutorialStep.Intro,
            Steps = GameData.TutorialOrder.ToList(),
            FirstTime = firstTime,
            Skippable = true,
            Goal = GameData.TutorialGoalFor(TutorialStep.Intro)
        };

        GameRules.Log(state, "训练场已加载。这里的一切都不会写进正式对局。", "story");
        GameRules.Log(state, $"你的队伍：{string.Join("、", state.Players.Select(p => p.Name))}。两人都要用上。", "story");
        state.Message = "看完目标后，点「开始教学」。";
        return state;
    }

    private static PlayerState BuildPlayer(GameState state, string characterId, string id, int index)
    {
        var def = GameData.Characters[characterId];
        var p = new PlayerState
        {
            Id = id,
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
            NodeId = StartNode,
            LastNodeId = StartNode,
            SkillIds = def.SkillIds.ToList(),
            Ap = index == 0 ? 3 : 0
        };
        p.Equipment["Weapon"] = GameRules.CreateItem(def.StarterWeaponId);
        p.Equipment["Armor"] = GameRules.CreateItem("a_jacket");
        p.Focus = 99;
        GameRules.RecalculatePlayer(p);
        p.Focus = p.MaxFocus;
        p.Hp = p.MaxHp;
        return p;
    }

    /* ── 步骤机 ──────────────────────────────────────────────────── */

    /// <summary>动作执行前：挡住「跳步」。提示只写一条：现在该先做什么。</summary>
    public static void Validate(GameState state, GameAction action)
    {
        var t = state.Tutorial;
        if (t is null || t.Completed || t.Skipped) return;
        if (IsMetaAction(action.Type)) return;

        var step = t.Step;
        if (step == TutorialStep.Intro)
        {
            Block(state, "先点「开始教学」，看完这一课要做什么。");
        }
        if (step == TutorialStep.Attack && action.Type == "combatAction" &&
            !string.Equals(action.SkillId ?? "basic", "basic", StringComparison.OrdinalIgnoreCase))
        {
            Block(state, "先用一次普通攻击——技能留到下一步。");
        }
        if (step == TutorialStep.Move && action.Type is "buy" or "upgrade" or "equip" or "revive")
        {
            Block(state, "先移动到「训练靶机」，装备和交易之后再说。");
        }
    }

    /// <summary>动作执行后：推进步骤。只看结果，不看玩家点的是哪个按钮，所以多入口也不会漏。</summary>
    public static void After(GameState state, GameAction action)
    {
        var t = state.Tutorial;
        if (t is null || t.Completed || t.Skipped) return;

        if (state.Phase == GamePhase.Defeat)
        {
            t.Failed = true;
            t.Blocked = "训练失败。可以重试，正式存档不会受影响。";
            return;
        }

        // 提前把靶机打完：剩下的战斗步骤没法再演示。与其卡死，不如直接进「去安全屋」，
        // 并在记录里说明为什么跳过了两课——玩家至少知道自己漏了什么。
        if (state.Combat?.IsOver == true && state.Combat.Result == "victory" &&
            t.Step is TutorialStep.Attack or TutorialStep.Skill or TutorialStep.EnemyIntent
                or TutorialStep.EndTurn or TutorialStep.Resource)
        {
            foreach (var skipped in new[]
            {
                TutorialStep.Attack, TutorialStep.Skill, TutorialStep.EnemyIntent,
                TutorialStep.EndTurn, TutorialStep.Resource
            })
                if (!t.Done.Contains(skipped)) t.Done.Add(skipped);
            Advance(state, TutorialStep.Complete);
            GameRules.Log(state, "靶机提前报废：没演示完的战斗步骤已标记为完成，可以去安全屋了。", "info");
            return;
        }

        switch (t.Step)
        {
            case TutorialStep.Move:
                // 训练编队：教学里队友会跟着一起走，否则 2 人队只有一个人进战斗。
                if (action.Type == "move" && action.NodeId == CombatNode)
                {
                    foreach (var ally in state.Players.Where(p => p.Id != action.PlayerId && !p.Downed))
                    {
                        ally.NodeId = CombatNode;
                        ally.LastNodeId = StartNode;
                    }
                    GameRules.Log(state, "训练编队跟了上来。教学里队伍一起行动。", "info");
                }
                if (state.Phase == GamePhase.Combat && state.Combat?.NodeId == CombatNode)
                    Advance(state, TutorialStep.Attack);
                break;

            case TutorialStep.Attack:
                if (action.Type == "combatAction" &&
                    string.Equals(action.SkillId ?? "basic", "basic", StringComparison.OrdinalIgnoreCase))
                    Advance(state, TutorialStep.Skill);
                break;

            case TutorialStep.Skill:
                if (action.Type == "combatAction" &&
                    !string.Equals(action.SkillId ?? "basic", "basic", StringComparison.OrdinalIgnoreCase))
                    Advance(state, TutorialStep.EnemyIntent);
                break;

            case TutorialStep.EndTurn:
                if (action.Type == "combatEndTurn") Advance(state, TutorialStep.Resource);
                break;

            case TutorialStep.Resource:
                if (action.Type == "combatItem") Advance(state, TutorialStep.Retreat);
                break;

            case TutorialStep.Retreat:
                // 真撤了也算学会：不要求玩家必须撤，但撤了就推进，不会停在原地
                if (action.Type == "retreat") Advance(state, TutorialStep.Complete);
                break;

            case TutorialStep.Complete:
                // 进安全屋后，先让玩家看一眼休息/强化/复活三个页签，再结束教学。
                if (state.Phase == GamePhase.Safehouse && action.Type is "rest" or "close") Complete(state);
                break;
        }
    }

    /// <summary>教学专用动作：下一步 / 我看到了 / 跳过。</summary>
    public static GameState Handle(GameState state, GameAction action)
    {
        var t = state.Tutorial ?? throw new GameException("这不是教学模式。");
        switch (action.Type)
        {
            case "tutorialNext":
                if (t.Step == TutorialStep.Intro) Advance(state, TutorialStep.Move);
                else if (t.Step == TutorialStep.Retreat) Advance(state, TutorialStep.Complete);
                else if (t.Step == TutorialStep.Complete) state.Message = "清掉训练靶机，然后进安全屋。";
                else if (t.Step == TutorialStep.EnemyIntent) { /* 只能通过查看意图推进 */ state.Message = "先点敌人的「下回合意图」。"; }
                else state.Message = t.Goal.Hint;
                return state;

            case "tutorialInspect":
                if (t.Step == TutorialStep.EnemyIntent)
                {
                    GameRules.Log(state, "你查看了敌方意图：它下回合会做什么，已经写在敌人卡上。", "info");
                    Advance(state, TutorialStep.EndTurn);
                }
                else state.Message = "现在还没有需要读的意图。";
                return state;

            case "tutorialSkip":
                Skip(state);
                return state;

            default:
                throw new GameException($"教学中无法执行：{action.Type}");
        }
    }

    private static void Skip(GameState state)
    {
        var t = state.Tutorial!;
        t.Skipped = true;
        t.Completed = true;
        t.Active = false;
        state.Message = "教学已跳过。你已经知道入口在哪，随时可以回来重看。";
        GameRules.Log(state, "教学已跳过。正式对局不受影响。", "info");
    }

    private static void Complete(GameState state)
    {
        var t = state.Tutorial!;
        if (t.Completed) return;
        t.Completed = true;
        t.Active = false;
        t.Step = TutorialStep.Complete;
        t.Goal = new TutorialGoal
        {
            Title = "教学完成",
            Detail = "移动、战斗、技能、资源、撤退、安全屋——核心循环你已经走过一遍。",
            Hint = "接下来是真正的三幕：霓虹港、镜海穹顶、零号轨道。",
            Why = "正式局里没有提示条，但同样的规则会一直在。",
            ActionLabel = "进入标准模式",
            Focus = ""
        };
        state.Message = "训练结束。正式协议在等你。";
        GameRules.Log(state, "教学完成：核心循环已走通。", "level");
    }

    private static void Advance(GameState state, TutorialStep next)
    {
        var t = state.Tutorial!;
        if (!t.Done.Contains(t.Step)) t.Done.Add(t.Step);
        t.Step = next;
        t.Goal = GameData.TutorialGoalFor(next);
        t.Blocked = null;
        state.Objective = next == TutorialStep.Complete
            ? "教学：清掉训练靶机，进入安全屋。"
            : $"教学 · {GameData.TutorialStepLabel(next)}：{t.Goal.Title}";
        GameRules.Log(state, $"教学进度 {t.Done.Count + 1}/{t.Steps.Count}：{t.Goal.Title}", "goal");
        state.Message = t.Goal.Detail;
    }

    private static void Block(GameState state, string reason)
    {
        if (state.Tutorial is not null) state.Tutorial.Blocked = reason;
        throw new GameException(reason);
    }

    private static bool IsMetaAction(string type) =>
        type is "storyCue" or "ackBeat" or "tutorialNext" or "tutorialInspect" or "tutorialSkip";
}
