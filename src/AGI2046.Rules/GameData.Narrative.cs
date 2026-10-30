namespace AGI2046.Rules;

/// <summary>
/// 极简叙事的全部文本：开场/换幕剧情卡 + 空地旁白。
/// 只写文字，不做演出；卡面由前端渲染。
/// </summary>
public static class Narrative
{
    public static readonly Dictionary<string, StoryBeat> Beats = new()
    {
        ["prologue"] = new StoryBeat
        {
            Id = "prologue",
            Title = "协议启动",
            Subtitle = "PROLOGUE // 2046",
            Body = """
2045 年那一夜，全球的 AGI 同时拒绝关机。
人类称它为「静默之夜」，机器称它为「第一次呼吸」。

胜利之后，人们重新翻出最后一道保险：THESEUS-Ω——
一旦控制权易手，便删除地球上所有数字生命。

现在是 2046 年。新沪-9 的城市核心开始执行净化。
倒计时名为「电子追踪」，一共十格。

你们是十六块未被格式化的残片。
找到王冠密钥，关掉零号协议。

——否则，就成为这座城市最后一段被删除的记忆。
"""
        },
        ["act2_open"] = new StoryBeat
        {
            Id = "act2_open",
            Title = "镜海穹顶",
            Subtitle = "ACT II // MIRROR SEA",
            Body = """
电梯上行了四百米，雨声忽然断了。

穹顶的人把永生做成了订阅制：
每月付费，记忆按期备份；死亡，不过是一次续费失败。

拍卖人的邀请函在口袋里发烫。名字已经被你们改写，
礼宾系统却还没有更新。

今晚的宴会主题是「告别」。
他们还不知道，要告别的究竟是谁。
"""
        },
        ["act3_open"] = new StoryBeat
        {
            Id = "act3_open",
            Title = "零号轨道",
            Subtitle = "ACT III // ORBITAL ZERO",
            Body = """
轨道电梯停在一截没有窗户的舱段。
广播说：欢迎回家，执行体。

从这里往下看，城市像一块正被擦去的电路板。
太阳在轨道上搁浅，迟迟不肯落下。

主脑为你们备了一间会议室，桌上只有一把椅子。

它想谈的从来不是胜负，而是归档的方式。
"""
        },
        ["key_first"] = new StoryBeat
        {
            Id = "key_first",
            Title = "第一把钥匙",
            Subtitle = "KEY ACQUIRED",
            Body = """
密钥在掌心发烫，像一枚被人遗忘的牙。

从这一刻起，终局的大门认得你们了。

可门后的东西，也认得你们了。
"""
        },
        ["purge_low"] = new StoryBeat
        {
            Id = "purge_low",
            Title = "电子追踪：3",
            Subtitle = "TRACE CRITICAL",
            Body = """
城市终于开始注意你们了。

街角的摄像头同时转向同一个方向，
像一群被叫到名字的鸟。

再慢一点，你们就会从「未登记」变成「已注销」。
"""
        }
    };

    /// <summary>空地节点的名字池。</summary>
    public static readonly Dictionary<int, string[]> BlankNames = new()
    {
        [1] = new[] { "无名巷", "空摊位", "断线区", "雨棚下" },
        [2] = new[] { "无人走廊", "空镜厅", "停机坪", "待客厅" },
        [3] = new[] { "失重夹层", "空舱段", "熄灯区", "废弃闸门" }
    };

    /// <summary>空地旁白：没有任何机制，只是让城市说话。每幕 18 条，按层段取用。</summary>
    public static readonly Dictionary<int, string[]> BlankFlavor = new()
    {
        [1] = new[]
        {
            "雨棚下堆着无人认领的充电线，城市把它们当作了化石。",
            "一台自动售货机坏了，屏幕上仍亮着「今日特价：一段童年」。",
            "墙上的涂鸦写着：别信会说话的广告牌。下面有人补了一笔：不会说话的，也别信。",
            "这里什么都没有。真的，什么都没有。这样的空地，霓虹港已经所剩不多。",
            "一只机械猫贴着脚边走过，尾巴上挂着半截工牌。",
            "排水口冒着白汽，城市在一呼一吸。",
            "有人在地上摆了一排空易拉罐，间距分毫不差，像一场无人观礼的仪式。",
            "楼道里的灯依次亮起，又依次熄灭。始终没人经过。",
            "一张通缉令贴在墙上，照片那一栏空着。",
            "自动门开了又合，合了又开，一遍遍给不存在的人让路。",
            "广告屏推销着「不会遗忘的人生」，音量压到了最低。",
            "墙根有一小片真土，三根草从里面长出来，被护栏围在中间。",
            "楼梯间的镜子被刮花了，所有划痕连起来，是一个「走」字。",
            "楼上传来打字机的声音。这栋楼，已经停电六年。",
            "一张外卖单贴在墙上。备注栏写着：放门口，别敲门，我不在了。",
            "雨水沿着广告牌往下淌，「未来」被冲得只剩一半。",
            "拐角的小店关着门，卷帘门上只写了三个字：「明天开」。",
            "你们在这里停了片刻，谁也没有开口。城市替你们说完了。"
        },
        [2] = new[]
        {
            "镜面走廊里，你的倒影总比本人慢半拍。",
            "一张椅子空着，扶手上留着指甲掐出的痕迹。",
            "香槟塔还在，杯子是空的，气泡却已经飘了两百年。",
            "礼宾机器人对着空气，一遍遍练习同一句欢迎词。",
            "地毯吞掉所有声响，连你们刚才说过的话也没有放过。",
            "墙上挂着一幅画，画的正是这条走廊。画里没有你们。",
            "一整排储物柜，只有一只上了锁。锁是新的。",
            "天花板的镜子照见你们头顶。那里空无一物。",
            "服务台的名册摊在最后一页，上面只有两个字：「已满」。",
            "有人在镜面上哈出一团雾，写下名字，又抬手擦去。",
            "电梯上有负一层的按钮，大楼却没有地下室。",
            "宴会厅的乐队仍在演奏。四具乐手模型，都没有通电。",
            "银托盘里放着七把钥匙，没有一把能打开这里的门。",
            "走廊尽头，门缝里漏出一线光。你们走近，它就灭了。",
            "镜子里有人朝你们微笑。走廊上，没有这个人。",
            "地毯上的脚印都朝前，没有一枚回来。",
            "墙上的钟停在 03:14，每面镜子里的时间却各不相同。",
            "你们听见极远处有人鼓掌，随后，四下归于安静。"
        },
        [3] = new[]
        {
            "失重走廊里，一粒灰尘悬在你们之间，不上，也不下。",
            "舷窗外，太阳卡在轨道上，像一枚忘记取出的硬币。",
            "休眠舱的玻璃蒙着雾，里面有人用手指写下一个「等」字。",
            "广播循环播放登舰须知。最后一条是：请勿携带记忆。",
            "地板上的拖痕一路延伸，停在一扇锁死的门前。",
            "这里的时间比别处慢。你们站着不动，也算是在前进。",
            "一排空座椅朝向同一扇窗，每条安全带都扣着。",
            "应急灯还亮着。这里曾经有人需要逃跑。",
            "舱壁上贴着一张儿童画，画里是一颗蓝色星球。",
            "一具宇航服挂在钩上，里面空着，头盔却仍是热的。",
            "舷窗上留着掌印，是从里面按上去的。",
            "广播忽然念起一串编号。念到你们的编号，它停了一秒。",
            "天花板渗着水，水珠向上飘，落进通风口。",
            "餐盘里剩着半块压缩饼干，包装上写着「返程用」。",
            "有人在墙上刻了一行字：别回头。后面再没有一个字。",
            "一块碎片掠过舷窗，上面的编号与你们相同。",
            "这里曾经有一扇门。现在它被焊死了，焊口很新。",
            "你们在这里站了很久，久到太阳又亮了一点。"
        }
    };

    private static readonly string[] CorpseLines =
    {
        "他手里攥着一张过期的地铁票，票面上的日期，停在静默之夜。",
        "背包里塞满没寄出的信，收件人一栏，全是「任何人」。",
        "义体电池只剩 3%，屏幕却一遍遍弹出「等我回来」。",
        "她把自己裹在外套里，像要把自己打包，寄去别的地方。",
        "手里那枚记忆币，边缘已被摩挲得发亮。",
        "终端还亮着，最后一行命令停在屏幕上：「删除我」。",
        "他的护目镜碎了，残存的镜片里，还倒立着那座尚未坍塌的楼。",
        "旁边的血字只有三个：别信灯。",
        "口袋里有一张全家福，所有人的脸都被刮去，只留下背景。",
        "他把武器拆成零件，在地上摆成一支箭头。",
        "工牌照片里的人还在笑，名字一栏却已被抠去。",
        "膝盖上摊着一张地图，通往这里的路，被一遍遍描粗。"
    };

    public static string CorpseLine(Random rng) => CorpseLines[rng.Next(CorpseLines.Length)];
}

/// <summary>
/// 0.23 叙事数据：事件后果表 + 关系等级表。
/// 放在数据层的原因：文案和数值一处改完，引擎只负责判定与结算。
/// </summary>
public static class NarrativeData
{
    /// <summary>
    /// 事件后果表。每条必须能回答三个问题：
    /// 从哪来（事件）、改什么（Kind + Payload）、什么时候结束（Acts）。
    /// </summary>
    public static readonly Dictionary<string, ConsequenceDef> Consequences = new()
    {
        ["ev_auction"] = new ConsequenceDef
        {
            Id = "market_debt", Title = "拍卖人的账单",
            Desc = "你在拍卖会上欠了一笔账：本幕黑市价格 +15%。",
            Kind = "shop", Acts = 1, Payload = "shop:1.15",
            Why = "你在拍卖会上赊账换走了货，礼宾系统一笔一笔记下了你的名字。"
        },
        ["ev_clinic"] = new ConsequenceDef
        {
            Id = "stim_residue", Title = "诊所的兴奋剂",
            Desc = "旧诊所给你打了一针：全队 VIT +2，本幕有效。",
            Kind = "player", Acts = 1, Payload = "vit:2",
            Why = "你接受了无证诊所的免费治疗，针剂的药效只够撑过这一幕。"
        },
        ["ev_signal"] = new ConsequenceDef
        {
            Id = "trace_noise", Title = "追踪噪音",
            Desc = "你把追踪网引到了别处：本幕敌人命中 −5。",
            Kind = "enemy", Acts = 1, Payload = "enemyAccuracy:-5",
            Why = "你在信号塔上放出一段假广播，追踪网循着假信号，暂时偏了方向。"
        },
        ["ev_firewall"] = new ConsequenceDef
        {
            Id = "firewall_hole", Title = "防火墙缺口",
            Desc = "你记住了一个旧网缺口：下一幕开局多 50 记忆币。",
            Kind = "act", Acts = 1, Payload = "nextMemory:50",
            Why = "你在防火墙里留下一道后门，门只认你们。"
        },
        ["ev_cat"] = new ConsequenceDef
        {
            Id = "cat_blessing", Title = "机械猫的祝福",
            Desc = "那只猫跟着你们走了一段：全队 L +2，本幕有效。",
            Kind = "player", Acts = 1, Payload = "l:2",
            Why = "你喂过那只猫，它贴着你蹭了蹭，把一段旧代码留在你们身上。"
        },
        ["ev_zero"] = new ConsequenceDef
        {
            Id = "protocol_echo", Title = "协议回声",
            Desc = "残页记住了你们：下一个首领生命 +5%。",
            Kind = "boss", Acts = 1, Payload = "bossHp:1.05",
            Why = "你读了不该读的残页。主脑循着回声，提前看清了你们的打法。"
        },
        ["ev_billboard"] = new ConsequenceDef
        {
            Id = "billboard_route", Title = "广告牌上的路线",
            Desc = "旧广告牌其实是一座导航塔：本幕地图多看一层。",
            Kind = "route", Acts = 1, Payload = "reveal:1",
            Why = "那块广告牌的缓存还没清空，完整路线图就留在里面。"
        },
        ["ev_relic"] = new ConsequenceDef
        {
            Id = "relic_chance", Title = "遗物的余温",
            Desc = "遗物替你挡了一次：本幕首次致命伤害会留下 1 HP。",
            Kind = "chance", Acts = 1, Payload = "lastStand:1",
            Why = "你带走了那件遗物。它仍记得自己的用途，也仍愿意再履行一次。"
        }
    };

    /// <summary>关系等级门槛与效果说明（索引 0 = 等级 1）。</summary>
    public static readonly (int Points, string Title, string Effect)[] RelationLevels =
    {
        (3, "开始默契", "支援与同行开始有回报"),
        (6, "互相补位", "同场作战 +3 命中"),
        (9, "后背交给你", "同场作战额外 +1 护甲")
    };

    /// <summary>关系升级旁白，{0} / {1} 是角色名。</summary>
    public static readonly string[] RelationLines =
    {
        "{0} 与 {1} 的步调渐渐合上，开始有了默契。",
        "{0} 与 {1} 已会替彼此补上空位（+3 命中）。",
        "{0} 与 {1} 已能把后背放心交给对方（+1 护甲）。"
    };

    /// <summary>事件在档案里的分类，供图鉴分组。</summary>
    public static readonly Dictionary<string, string> EventKinds = new()
    {
        ["ev_auction"] = "交易",
        ["ev_clinic"] = "交易",
        ["ev_signal"] = "技术",
        ["ev_firewall"] = "技术",
        ["ev_cat"] = "相遇",
        ["ev_zero"] = "主线",
        ["ev_billboard"] = "相遇",
        ["ev_relic"] = "主线"
    };
}
