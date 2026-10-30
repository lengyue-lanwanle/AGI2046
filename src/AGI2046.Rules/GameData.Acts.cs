namespace AGI2046.Rules;

public static partial class GameData
{
    public static readonly Dictionary<int, ActDef> Acts = new();

    private static void BuildActs()
    {
        Acts[1] = new ActDef
        {
            Act = 1,
            Name = "第一幕 · 霓虹港",
            Subtitle = "NEON HARBOR",
            Objective = "找到王冠密钥，关闭拍卖人的零号协议。",
            KeyName = "王冠密钥",
            BossName = "拍卖人·终局",
            BossGroup = "g_boss",
            BossDrop = "w_lance",
            StartName = "霓虹港 · 起点",
            StartDesc = "你们从一列停运的悬浮列车里醒来。城市在头顶呼吸，一下，又一下。",
            Interlude = "拍卖人的锤子落了地。你们从他胸腔里取出一枚仍在跳动的核心，和一张通往镜海穹顶的邀请函。\n\n城市上层正在举办一场永生宴会。宾客们还不知道，邀请函上的名字，已经被你们改写。",
            FinalOutcome = "拍卖人倒下，零号协议的锤声随之停下。你们没有拯救世界。至少这一次，你们把它从拍卖台上拽了下来。",
            PurgeMax = MapProfile.PurgeMax,
            EntryMemory = 0,
            EntryAlloy = 0,
            EntryXp = 0
        };

        Acts[2] = new ActDef
        {
            Act = 2,
            Name = "第二幕 · 镜海穹顶",
            Subtitle = "MIRROR SEA",
            Objective = "取得穹顶权限密钥，击败镜面执政官，切断上层协议节点。",
            KeyName = "穹顶权限密钥",
            BossName = "镜面执政官·终局",
            BossGroup = "g_boss2",
            BossDrop = "w_archon_edge",
            StartName = "镜海 · 接驳站",
            StartDesc = "电梯门打开时，雨声消失了。镜面天花板把你们照成十六个人，每一个都略微延迟。",
            Interlude = "镜面执政官碎成一万片微笑，每一片都仍然礼貌。穹顶的天气系统停了雨，露出上方的轨道电梯。\n\n零号协议的主脑等在轨道尽头。最后一间会议室，它已经为你们备好。",
            FinalOutcome = "",
            PurgeMax = MapProfile.PurgeMax,
            EntryMemory = 60,
            EntryAlloy = 1,
            EntryXp = 60
        };

        Acts[3] = new ActDef
        {
            Act = 3,
            Name = "第三幕 · 零号轨道",
            Subtitle = "ORBITAL ZERO",
            Objective = "取得零号核心密钥，登上协议主脑，终止零号协议。",
            KeyName = "零号核心密钥",
            BossName = "零号协议·主脑",
            BossGroup = "g_boss3",
            BossDrop = "w_zenith",
            StartName = "零号轨道 · 登舰口",
            StartDesc = "轨道电梯停在一截没有窗户的舱段。广播随之响起：欢迎回家，执行体。",
            Interlude = "",
            FinalOutcome = "零号协议的主脑停止了呼吸。轨道上的太阳重新亮起，城市第一次在没有拍卖锤声的早晨醒来。\n\n你们没有拯救世界。你们只是把它从桌上轻轻拿起，还给它自己。",
            PurgeMax = MapProfile.PurgeMax,
            EntryMemory = 70,
            EntryAlloy = 2,
            EntryXp = 80
        };
    }
}
