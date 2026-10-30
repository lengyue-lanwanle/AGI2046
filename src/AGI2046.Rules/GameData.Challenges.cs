namespace AGI2046.Rules;

/// <summary>
/// 规则变异目录（0.21）。12 条常驻 + 4 条解锁。
/// 约束：每条都必须写清「风险 / 奖励 / 适合的策略」，不允许隐藏惩罚；
/// 变异只改可解释的数值或规则，不夺走角色和技能。
/// </summary>
public static partial class GameData
{
    public static readonly List<MutatorDef> Mutators = new();

    private static void M(MutatorDef m) => Mutators.Add(m);

    private static void BuildMutators()
    {
        M(new MutatorDef
        {
            Id = "tracking_fast", Name = "追踪加速", ScoreMul = 1.25,
            Desc = "电子追踪每 3 个玩家回合推进 1 格（常规为 4）。",
            Risk = "同样的路线，你能用的回合数少 25%。",
            Reward = "战斗与事件掉落的记忆币 +20%。",
            Strategy = "少绕路、少打非必要战斗；碎片看守优先。"
        });
        M(new MutatorDef
        {
            Id = "scarcity", Name = "资源匮乏", ScoreMul = 1.2,
            Desc = "黑市价格 +35%，事件与战利品收益 +30%。",
            Risk = "前期买不起关键装备，续航更紧。",
            Reward = "打与选的价值变高，收益更集中。",
            Strategy = "优先买消耗品和武器，别囤记忆币。"
        });
        M(new MutatorDef
        {
            Id = "cooldown", Name = "冷却失控", ScoreMul = 1.2,
            Desc = "所有主动技能冷却 +1 回合。",
            Risk = "同一个技能不能连续两回合用。",
            Reward = "无额外奖励，纯难度。",
            Strategy = "带两个不同功能的技能，别把输出压在一条线上。"
        });
        M(new MutatorDef
        {
            Id = "glass", Name = "玻璃队伍", ScoreMul = 1.25,
            Desc = "全队最大生命 −25%，造成的伤害 +20%。",
            Risk = "两三次失误就会减员。",
            Reward = "清场更快，追踪压力更小。",
            Strategy = "先手、掩体、护盾；别站在敌人技能范围里换血。"
        });
        M(new MutatorDef
        {
            Id = "hostile", Name = "敌意协议", ScoreMul = 1.25,
            Desc = "敌人伤害 +15%，战斗与事件收益 +25%。",
            Risk = "精英战与首领战明显更痛。",
            Reward = "每一场战斗都更值钱。",
            Strategy = "把防御和撤退当常规选项，不要每场都硬拼到最后。"
        });
        M(new MutatorDef
        {
            Id = "no_safehouse", Name = "无安全屋", ScoreMul = 1.3,
            Desc = "每幕有 2 个安全屋被替换成特殊事件。",
            Risk = "恢复与复活点变少，路线要重新规划。",
            Reward = "那些位置会给额外的事件奖励。",
            Strategy = "看到安全屋就先恢复；别把复活留到弹尽粮绝。"
        });
        M(new MutatorDef
        {
            Id = "overheat", Name = "过热武器", ScoreMul = 1.15,
            Desc = "同一场战斗里重复使用同一个主动技能，每次叠加 −8 命中（最多 −24）。",
            Risk = "一套连招打到底会越来越不准。",
            Reward = "无额外奖励，考验技能轮换。",
            Strategy = "普攻与技能交替，或用不同技能打断连用。"
        });
        M(new MutatorDef
        {
            Id = "mirror", Name = "镜像敌人", ScoreMul = 1.2,
            Desc = "你每次使用主动技能，敌方会复制该伤害类型：全体 +2 对应抗性（最多 +6）。",
            Risk = "单一伤害类型的队伍会被越打越硬。",
            Reward = "无额外奖励，考验伤害类型搭配。",
            Strategy = "物理与技术混编；别让全队只打一种伤害。"
        });
        M(new MutatorDef
        {
            Id = "few", Name = "少数派", ScoreMul = 1.15,
            Desc = "队伍上限降为 3 人，全队经验 +30%。",
            Risk = "少一个单位，战斗轮次更长。",
            Reward = "等级起得更快。",
            Strategy = "带一个能治疗/护盾的角色，减少对人数的依赖。"
        });
        M(new MutatorDef
        {
            Id = "no_hoard", Name = "反囤积", ScoreMul = 1.1,
            Desc = "进入下一幕时，背包里的消耗品全部作废。",
            Risk = "跨幕囤积的补给会消失。",
            Reward = "无额外奖励，逼你把资源用掉。",
            Strategy = "每幕末把消耗品用光或卖掉，别留到下一幕。"
        });
        M(new MutatorDef
        {
            Id = "deep_awaken", Name = "深层觉醒", ScoreMul = 1.2,
            Desc = "觉醒额外 +2 全属性；碎片看守生命 +25%。",
            Risk = "必经的碎片战更硬。",
            Reward = "觉醒后的成长更明显。",
            Strategy = "先觉醒再打碎片看守；把觉醒节点当路线锚点。"
        });
        M(new MutatorDef
        {
            Id = "global_fault", Name = "全局故障", ScoreMul = 1.15,
            Desc = "每幕随机关闭一类节点（陷阱 / 遗骸 / 商店 / 服务器），该类节点变成空地。",
            Risk = "关键补给类型可能整幕消失（开局会预告）。",
            Reward = "无额外奖励，考验应变。",
            Strategy = "开局先看被关闭的类型，再决定要不要囤资源。"
        });

        /* ── 4 条解锁变异：给重玩一个明确目标，但不给永久数值 ── */
        M(new MutatorDef
        {
            Id = "elite_hunt", Name = "猎杀协议", ScoreMul = 1.35, UnlockId = "unlock_elite_hunt",
            Desc = "精英与碎片看守生命 +40%，掉落 +1 合金。",
            Risk = "精英战时间翻倍，追踪压力更大。",
            Reward = "合金更充裕，强化更早到位。",
            Strategy = "先升两级再碰精英；把强化花在武器上。"
        });
        M(new MutatorDef
        {
            Id = "fog", Name = "迷雾协议", ScoreMul = 1.3, UnlockId = "unlock_fog",
            Desc = "地图只显示当前位置的相邻节点，地标不再开局可见。",
            Risk = "无法提前规划整条路线。",
            Reward = "探索感更强，事件与遗骸更容易被撞见。",
            Strategy = "沿主路推进，别为了找商店横跳。"
        });
        M(new MutatorDef
        {
            Id = "poverty", Name = "赤贫协议", ScoreMul = 1.35, UnlockId = "unlock_poverty",
            Desc = "开局记忆币为 0，战利品收益 +50%。",
            Risk = "前两场战斗前买不了任何东西。",
            Reward = "打赢第一场后经济反弹更快。",
            Strategy = "先打小战斗攒钱，别一上来就进精英。"
        });
        M(new MutatorDef
        {
            Id = "ironman", Name = "铁人协议", ScoreMul = 1.5, UnlockId = "unlock_ironman",
            Desc = "队伍生命降为 1，安全屋不能复活。",
            Risk = "一次全灭就是终局。",
            Reward = "评分倍率最高。",
            Strategy = "撤退不是丢脸，是这条协议里唯一的容错。"
        });
    }

    public static MutatorDef? Mutator(string id) => Mutators.FirstOrDefault(m => m.Id == id);

    /// <summary>每日挑战：用日期算一个稳定的 6 位种子，所有人同一天同一张图。</summary>
    public static int DailySeed(DateTimeOffset now)
    {
        var key = now.ToString("yyyyMMdd");
        return 100000 + Math.Abs(Stable.Hash($"daily-{key}")) % 900000;
    }
}
