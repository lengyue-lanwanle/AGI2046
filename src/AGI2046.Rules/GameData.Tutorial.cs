namespace AGI2046.Rules;

/// <summary>
/// 教学的固定内容：步骤顺序、每一步的目标文案、训练场地图、固定队伍。
/// 文案集中在这里，前端只负责显示，避免 UI 和规则各写一份说明。
/// </summary>
public static partial class GameData
{
    /// <summary>教学队伍固定两人：支援（白垩）+ 守护（宪章）。一攻一守，正好演示「帮队友」。</summary>
    public static readonly string[] TutorialTeam = { "gpt", "claude" };

    public static readonly TutorialStep[] TutorialOrder =
    {
        TutorialStep.Intro,
        TutorialStep.Move,
        TutorialStep.Attack,
        TutorialStep.Skill,
        TutorialStep.EnemyIntent,
        TutorialStep.EndTurn,
        TutorialStep.Resource,
        TutorialStep.Retreat,
        TutorialStep.Complete
    };

    /// <summary>训练靶机：一个慢、软、只会近战的敌人。存在的意义是被打完，不是打赢。</summary>
    public static readonly EnemyDef TutorialDummy = new()
    {
        Id = "e_tut_drone",
        Name = "训练靶机",
        Role = "训练",
        Desc = "一台被拆掉武器的旧哨兵。它仍然很努力地执行巡逻命令。",
        Hp = 30,
        Armor = 3,
        Resistance = 0,
        Evasion = 5,
        Speed = 40,
        Movement = 2,
        Tier = 1,
        SkillIds = new() { "e_slash" },
        Color = "#ff8a8a"
    };

    public static TutorialGoal TutorialGoalFor(TutorialStep step) => step switch
    {
        TutorialStep.Intro => new TutorialGoal
        {
            Title = "先弄明白：这局要做什么",
            Detail = "关闭信标，别让电子追踪归零。接下来 10 分钟，你会走一遍完整的核心循环。",
            Hint = "点「开始教学」进入训练场。教学随时可以跳过，也可以从标题页重新打开。",
            Why = "零号协议每 4 个玩家回合推进 1 格电子追踪；归零 = 任务失败。",
            ActionLabel = "开始教学",
            Focus = ""
        },
        TutorialStep.Move => new TutorialGoal
        {
            Title = "移动到「训练靶机」",
            Detail = "点高亮的相邻节点走过去。移动消耗 1 AP；走到之后再点它一次进入战斗。",
            Hint = "AP 是行动力：移动、互动、休息都要花。AP 用完就结束回合。",
            Why = "节点图是唯一的路。你只能走向相邻节点，所以要提前看路线。",
            ActionLabel = "知道了",
            Focus = "node"
        },
        TutorialStep.Attack => new TutorialGoal
        {
            Title = "先用一次普通攻击",
            Detail = "点战场右侧的「普通攻击」，再点敌人。",
            Hint = "普通攻击不消耗 Focus，永远可用。够不到就先移动——移动不结束回合。",
            Why = "先看清命中率和伤害，再决定要不要为这一回合花 Focus。",
            ActionLabel = "知道了",
            Focus = "basic"
        },
        TutorialStep.Skill => new TutorialGoal
        {
            Title = "用一个主动技能",
            Detail = "点一张技能卡（消耗 1 Focus），再选目标。",
            Hint = "Focus 每场战斗有限（3–8 点），技能的唯一成本就是它。",
            Why = "技能改变的不是数字，是这一回合能做的选择。",
            ActionLabel = "知道了",
            Focus = "skill"
        },
        TutorialStep.EnemyIntent => new TutorialGoal
        {
            Title = "看清敌人下回合要做什么",
            Detail = "点敌人卡上的「下回合意图」。",
            Hint = "意图只是预告，不锁定；但绝大多数敌人会照做。",
            Why = "先读意图再站位，通常比多打一下更值。",
            ActionLabel = "我看到了",
            Focus = "intent"
        },
        TutorialStep.EndTurn => new TutorialGoal
        {
            Title = "结束这个角色的回合",
            Detail = "点「结束回合」，把行动权交给下一个单位。",
            Hint = "移动不结束回合；攻击、技能、防御会。",
            Why = "一轮里每个单位只能做一件大事，顺序本身就是战术。",
            ActionLabel = "知道了",
            Focus = "endturn"
        },
        TutorialStep.Resource => new TutorialGoal
        {
            Title = "用掉一个消耗品",
            Detail = "打开「道具」，用一支止血针。",
            Hint = "消耗品不占 Focus；在战斗中使用会结束该单位的回合。",
            Why = "资源不用就是浪费——它们不会跟你进下一幕。",
            ActionLabel = "知道了",
            Focus = "item"
        },
        TutorialStep.Retreat => new TutorialGoal
        {
            // 这一步是「认识出口」，不是「必须撤一次」。
            // 之前的文案写成「记住撤退的代价和时机」，配上高亮按钮，玩家会以为非撤不可。
            Title = "看一眼撤离按钮（不用真的撤）",
            Detail = "战斗右下角有「撤离」：全队退回上一个节点，各失去 10% 最大生命，敌人不会消失。这一步不需要使用它。",
            Hint = "撤退要过速度检定，失败会被咬一口。它是设计好的出口，不是必经流程。",
            Why = "打不动的时候，撤退保住的是一整局的追踪预算；能打赢的时候，它只会浪费你的生命。",
            ActionLabel = "知道了",
            Focus = "retreat"
        },
        TutorialStep.Complete => new TutorialGoal
        {
            Title = "打完这场，再去安全屋",
            Detail = "清掉训练靶机，走到「训练安全屋」，休息一次再离开。",
            Hint = "安全屋能休息、强化装备、复活队友。三个页签都值得看一眼。",
            Why = "这就是一局的循环：推进 → 战斗 → 补给 → 再推进。",
            ActionLabel = "去安全屋",
            Focus = "safehouse"
        },
        _ => new TutorialGoal { Title = "教学完成", Detail = "你已经走完核心循环。", ActionLabel = "进入标准模式" }
    };

    public static string TutorialStepLabel(TutorialStep step) => step switch
    {
        TutorialStep.Intro => "目标",
        TutorialStep.Move => "移动",
        TutorialStep.Attack => "普通攻击",
        TutorialStep.Skill => "主动技能",
        TutorialStep.EnemyIntent => "敌方意图",
        TutorialStep.EndTurn => "结束回合",
        TutorialStep.Resource => "资源",
        TutorialStep.Retreat => "撤离常识",
        TutorialStep.Complete => "安全屋",
        _ => step.ToString()
    };
}
