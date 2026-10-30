namespace AGI2046.Rules;

/// <summary>
/// 「此刻最重要的事」：把散在地图、时钟、队伍面板里的信息收成一块，永远只有一个主目标。
/// 规则：
///   · 主目标唯一，且不随随机数变化；
///   · 近期目标最多 3 条，按「会影响这一局成败」排序；
///   · 支线不进这里（它们有自己的面板），避免支线压过主线；
///   · 推荐动作只是建议，永远不会阻止玩家做别的事。
/// </summary>
public static partial class GameEngine
{
    public static void RefreshObjectives(GameState state)
    {
        if (state.Mode == GameMode.Tutorial) return;   // 教学有自己的步骤条
        var board = BuildObjectives(state);
        var previous = state.Objectives?.Current;
        if (!string.IsNullOrWhiteSpace(previous) && previous != board.Current)
        {
            board.Change = $"{previous} → {board.Current}";
            GameRules.Log(state, $"目标更新：{board.Current}", "goal");
        }
        state.Objectives = board;
    }

    public static ObjectiveBoard BuildObjectives(GameState state)
    {
        var actDef = GameData.Acts.TryGetValue(state.Act, out var a) ? a : GameData.Acts[1];
        var keyName = actDef.KeyName;
        var goal = Math.Max(1, state.KeyShardGoal);
        var board = new ObjectiveBoard
        {
            Round = state.Round,
            Failure = new List<string>
            {
                "电子追踪归零（每 4 个玩家回合 −1）",
                "队伍全员倒下"
            }
        };

        // ── 主目标：整局只变一次（拿到钥匙之后）──
        board.Main = state.HasKey
            ? $"击败{actDef.BossName}，终止第 {state.Act} 幕协议"
            : $"集齐 {goal} 片{keyName}碎片，打开终局大门";

        // ── 当前目标：现在这一步该干什么 ──
        var active = state.Players.FirstOrDefault(p => p.Id == state.ActivePlayerId) ?? state.Players.FirstOrDefault();
        var here = active is null ? null : state.Node(active.NodeId);
        var elites = state.Nodes.Where(n => n.Type == NodeType.KeyElite && !n.Cleared)
            .OrderBy(n => n.Layer).ToList();
        var nextElite = elites.FirstOrDefault(n => active is null || n.Layer >= (here?.Layer ?? 0)) ?? elites.FirstOrDefault();

        switch (state.Phase)
        {
            case GamePhase.Combat:
            {
                var enemies = state.Combat?.Units.Count(u => u.Side == Side.Enemy && !u.Downed) ?? 0;
                board.Current = $"清除当前敌对信号（剩余 {enemies} 个单位）";
                break;
            }
            case GamePhase.Event:
                board.Current = $"处理事件：{state.PendingEvent?.Event?.Title ?? "未标记遭遇"}";
                break;
            case GamePhase.Coop:
                board.Current = $"队伍表决：{state.Coop?.Title ?? "多人事件"}";
                break;
            case GamePhase.Shop:
                board.Current = "在黑市把记忆币换成续航或装备";
                break;
            case GamePhase.Safehouse:
                board.Current = "在安全屋休息 / 强化 / 复活，然后继续推进";
                break;
            case GamePhase.ActTransition:
                board.Current = $"整备队伍，进入{state.NextActName ?? "下一幕"}";
                break;
            case GamePhase.Victory:
                board.Current = "本局已通关";
                break;
            case GamePhase.Defeat:
                board.Current = "本局已失败";
                break;
            default:
                if (state.HasKey)
                    board.Current = "终局大门已开：进入首领节点";
                else if (nextElite is not null)
                    board.Current = $"前往第 {nextElite.Layer} 层的碎片看守（碎片 {state.KeyShards}/{goal}）";
                else
                    board.Current = $"寻找剩余的{keyName}碎片（{state.KeyShards}/{goal}）";
                break;
        }

        // ── 近期目标：最多三条，按「这一局会不会死」排序 ──
        var near = new List<GoalItem>
        {
            new()
            {
                Id = "key", Kind = "key",
                Title = state.HasKey ? $"{keyName}已到手" : $"{keyName}碎片",
                Detail = state.HasKey ? "终局大门开启" : $"还差 {Math.Max(0, goal - state.KeyShards)} 片",
                Done = state.HasKey || state.KeyShards >= goal,
                Progress = state.HasKey ? goal : state.KeyShards, Target = goal
            },
            new()
            {
                Id = "purge", Kind = "clock",
                Title = "电子追踪",
                Detail = $"剩 {state.Purge} 格，每 4 个玩家回合 −1",
                Done = false,
                Progress = state.Purge, Target = state.PurgeMax
            },
            new()
            {
                Id = "lives", Kind = "lives",
                Title = "队伍生命",
                Detail = state.Players.Any(p => p.Downed) ? "有队友掉线，先去安全屋" : "全员在线",
                Done = state.TeamLives >= 3,
                Progress = state.TeamLives, Target = 3
            }
        };
        board.Near = near.Take(3).ToList();

        board.Progress = state.HasKey
            ? $"碎片 {goal}/{goal} · 追踪 {state.Purge}/{state.PurgeMax} · 第 {state.Act} 幕"
            : $"碎片 {state.KeyShards}/{goal} · 追踪 {state.Purge}/{state.PurgeMax} · 第 {state.Act} 幕";

        // ── 风险：只写会影响下一步决策的两件事 ──
        var adjacentSafehouse = here is not null && here.Neighbors
            .Select(state.Node)
            .Any(n => n is not null && n.Type == NodeType.Safehouse && n.Layer >= here.Layer);
        var risk = state.Purge <= Math.Max(2, state.PurgeMax / 5)
            ? $"电子追踪 {state.Purge}/{state.PurgeMax}（见底）"
            : $"电子追踪 {state.Purge}/{state.PurgeMax}";
        if (nextElite is not null && !state.HasKey)
            risk += $" · 下一处碎片：第 {nextElite.Layer} 层";
        board.Risk = risk;

        // ── 推荐：一条，能执行，不强制 ──
        var avgHp = state.Players.Count == 0
            ? 1
            : state.Players.Average(p => p.MaxHp <= 0 ? 0 : (double)p.Hp / p.MaxHp);
        if (state.Phase == GamePhase.Combat)
            board.Recommended = "先看敌方意图再决定站位；打不动就从「撤离」退出去，别硬耗追踪。";
        else if (state.Phase is GamePhase.Event or GamePhase.Shop or GamePhase.Safehouse)
            board.Recommended = "先把当前界面处理完——它会占着行动权，队友也在等。";
        else if (state.Phase == GamePhase.ActTransition)
            board.Recommended = "把记忆币和合金花掉再进下一幕：下一个安全屋不一定在你路上。";
        else if (state.Purge <= Math.Max(2, state.PurgeMax / 5))
            board.Recommended = "追踪见底：别再绕路，直取最近的碎片看守。";
        else if (avgHp < 0.45 && adjacentSafehouse)
            board.Recommended = "队伍血量偏低，先到相邻安全屋恢复，再进精英战。";
        else if (active is not null && active.Ap <= 0)
            board.Recommended = "当前角色 AP 用完了：结束回合，把行动权交给队友。";
        else if (state.HasKey)
            board.Recommended = "门已经开了。进终局前把消耗品、装备和 Focus 整理好。";
        else
            board.Recommended = "沿最短路径推进到最近的碎片看守；路上顺手清 1–2 场小战斗再升级。";

        return board;
    }
}
