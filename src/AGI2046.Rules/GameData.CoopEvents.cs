namespace AGI2046.Rules;

/// <summary>
/// 多人事件（0.22）。每个事件都必须让玩家真的需要讨论：
///   · 两个终端：分头操作有额外奖励，撞在一起只有一份；
///   · 分摊：谁掉血、谁拿奖励；
///   · 限时：多数决，超时走安全默认。
/// 单人/热座也能完成：一个人可以替所有座位投票，规则完全一样。
/// </summary>
public static partial class GameData
{
    public static readonly List<CoopEventDef> CoopEvents = new();

    private static void CE(CoopEventDef e) => CoopEvents.Add(e);

    public static CoopEventDef CoopForAct(int act, int seed)
    {
        var pool = CoopEvents.Where(e => e.Id.EndsWith($"_{act}")).ToList();
        if (pool.Count == 0) pool = CoopEvents.ToList();
        return pool[Math.Abs(Stable.Hash($"coop{seed}:{act}")) % Math.Max(1, pool.Count)];
    }

    private static void BuildCoopEvents()
    {
        CE(new CoopEventDef
        {
            Id = "coop_terminals_1",
            Title = "两只终端，一个窗口",
            Text = "走廊两端，各有一台还能用的终端。它们在同一秒亮起，机会只有一次。\n\n分头操作，能读完一整份档案；挤在同一台前，只能拿到半份，还会触发一次告警。",
            DefaultOptionId = "split",
            Options = new()
            {
                new CoopOption { Id = "split", Label = "分头操作", Desc = "每人守一台：全队 +50 记忆币，电子追踪 +1（告警被提前拆掉）。", Effect = "memory:+50;purge:+1" },
                new CoopOption { Id = "together", Label = "一起读一台", Desc = "稳一点：只拿 +20 记忆币，但全队恢复 1 点 Focus。", Effect = "memory:+20;focus:1" }
            }
        });
        CE(new CoopEventDef
        {
            Id = "coop_sacrifice_2",
            Title = "谁去按那个按钮",
            Text = "闸门后就是通往穹顶的捷径，按钮却装在闸门内侧。按下去的人会挨一次电击，全队则能省下一段路。\n\n你们也可以绕路。只是追踪不会停在原地等你们。",
            DefaultOptionId = "detour",
            Options = new()
            {
                new CoopOption { Id = "sacrifice", Label = "有人去按", Desc = "全队各 −6 HP，电子追踪 +2，合金 +1。", Effect = "hp:-6;purge:+2;alloy:+1" },
                new CoopOption { Id = "detour", Label = "绕路", Desc = "不受伤，但电子追踪 −2。", Effect = "purge:-2" }
            }
        });
        CE(new CoopEventDef
        {
            Id = "coop_vote_3",
            Title = "限时表决：留还是烧",
            Text = "档案室里堆着上一批执行体的记忆。带走它们，要花时间；烧掉它们，能拖慢追踪网。\n\n广播开始倒数。交由多数决定，平票，则按「烧」处理。",
            DefaultOptionId = "burn",
            Options = new()
            {
                new CoopOption { Id = "take", Label = "带走", Desc = "全队 +80 记忆币，电子追踪 −1。", Effect = "memory:+80;purge:-1" },
                new CoopOption { Id = "burn", Label = "烧掉", Desc = "电子追踪 +2，全队 +1 合金。", Effect = "purge:+2;alloy:+1" }
            }
        });
    }
}
