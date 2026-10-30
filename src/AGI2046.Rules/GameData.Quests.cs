namespace AGI2046.Rules;

/// <summary>支线任务：每幕两条，由残响节点（NodeType.Echo）发放，换幕失效。</summary>
public static partial class GameData
{
    public static readonly Dictionary<string, QuestDef> Quests = new(StringComparer.OrdinalIgnoreCase);

    private static void Q(QuestDef q) => Quests[q.Id] = q;

    /// <summary>
    /// 某幕第 slot 条支线（0 = 先遇到的残响，1 = 第二个残响）。
    /// 0.15 起按 seed 从本幕支线池里抽 2 条：以前是"按 Id 排序后 Skip(slot)"，
    /// 等于每幕永远固定那 2 条，第二周目和第一周目一字不差。
    /// </summary>
    public static QuestDef? QuestForAct(int act, int slot, int seed = 0)
    {
        var pool = Quests.Values.Where(q => q.Act == act).OrderBy(q => q.Id, StringComparer.Ordinal).ToList();
        if (pool.Count == 0) return null;
        // 池子只有 2 条（或没有 seed）时退化为旧行为，保证测试/旧存档可复现
        if (seed == 0 || pool.Count <= 2) return pool.Skip(slot).FirstOrDefault();
        var rng = new Random(seed * 31 + act * 7919);
        var picked = pool.OrderBy(_ => rng.Next()).Take(2).ToList();
        return picked.Skip(slot).FirstOrDefault();
    }

    public static QuestDef? Quest(string id) =>
        Quests.TryGetValue(id, out var q) ? q : null;

    private static void BuildQuests()
    {
        Q(new QuestDef
        {
            Id = "q1_relay",
            Act = 1,
            Kind = "fetch",
            Title = "还给我",
            Giver = "「有段没能寄出的记忆留在这一层。它托我转交一件东西，东西很轻。」",
            Objective = "在任意遗骸里找到工牌",
            Body =
                "残响把一张脸推到你们面前。你们还没看清，它已经收了回去。\n\n" +
                "「他叫周也。下城区排污班，工号 4471。静默之夜那天，他把工牌塞进外套内袋，走进雨里。」\n\n" +
                "「我找不到他。那块塑料倒还亮着，在某个地方。」\n\n" +
                "「把工牌带回来。随便哪个残响都能收——它们记得的东西是同一个人。」",
            DoneText =
                "工牌上的折痕被雨水泡白了。\n\n" +
                "「周也。下城区排污班。4471。」\n\n" +
                "残响很久没有出声。再伸手时，它递来一双在雨里擦过许多次扳手的手，掌心还留着温度。\n\n" +
                "「谢谢。现在我可以去下一个地方了。」",
            Source = "corpse",
            TargetCount = 1,
            RewardItem = "t_feather",
            RewardMemory = 80,
            RewardText = "稀有装备 + 80 记忆币"
        });

        Q(new QuestDef
        {
            Id = "q1_sweep",
            Act = 1,
            Kind = "hunt",
            Title = "清道",
            Giver = "「这里每周三换班。我一直数着，数到后来，只剩我还在数。」",
            Objective = "清掉 3 场战斗（小战斗 1，常规 1，精英 2）",
            Body =
                "「巡逻队换班了三次。第三次，我在队列里认出以前的同事。」\n\n" +
                "「他从我身边过去，脚步没有乱。眼睛也没有。」\n\n" +
                "「清掉这条街上的东西。三场就够。我想听听，机器停下以后，还有谁在动。」",
            DoneText =
                "最后一台巡逻机在你们脚边熄了灯。残响从墙里挪出半步，胸口轻轻起了一下。\n\n" +
                "「原来安静不是没有声音。是终于轮到我出声。」",
            TargetCount = 3,
            RewardConsumableCount = 2,
            RewardMemory = 120,
            RewardText = "消耗品 ×2 + 120 记忆币"
        });

        Q(new QuestDef
        {
            Id = "q2_invite",
            Act = 2,
            Kind = "fetch",
            Title = "请柬上的名字",
            Giver = "「请柬上写过一个名字。另一种笔迹压过它，把我的名字改了。」",
            Objective = "在宝库或遗骸里找到 2 件镜面遗物",
            Body =
                "「一张请柬从楼上飘下来。原来的名字被划掉了，墨色更深；旁边添了别人的。」\n\n" +
                "「我想知道，被压在下面的名字是谁。」\n\n" +
                "「宝库和遗骸里有些镜面的东西。带两件回来，我大概能把那个名字拼出来。」",
            DoneText =
                "两件镜面遗物碰在一起，反光轻轻一晃，多出一张不属于你们的脸。\n\n" +
                "「是他。他一直在这里。」残响说，「只是名单上没有他。」\n\n" +
                "「被划掉的人，就不用记了，对吗？」\n\n" +
                "「不对。」",
            Source = "mirror",
            TargetCount = 2,
            RewardItem = "t_mirror_invite",
            RewardMemory = 80,
            RewardText = "稀有装备 + 80 记忆币"
        });

        Q(new QuestDef
        {
            Id = "q2_guest",
            Act = 2,
            Kind = "hunt",
            Title = "静默的宾客",
            Giver = "「宴会厅少了一个宾客。没人问他去了哪，连椅子也被撤走了。」",
            Objective = "击败 1 名碎片看守或精英",
            Body =
                "「名单上有四十七位宾客。开宴时，银匙响了四十六次。」\n\n" +
                "「没有人问少了谁。在穹顶，空座位也不该有名字。」\n\n" +
                "「去找那个座位的主人。碎片看守，或者他们养的精英——随便哪一个，只要它身上还有那间宴会厅的编号。」",
            DoneText =
                "编号对上了。它倒下去，胸口的灯仍亮着一个名字，一闪，又一闪。\n\n" +
                "「他来了。」残响说，「迟了四十六年。总算入席。」",
            TargetCount = 1,
            RewardConsumableCount = 2,
            RewardMemory = 120,
            RewardText = "消耗品 ×2 + 120 记忆币"
        });

        Q(new QuestDef
        {
            Id = "q3_bus",
            Act = 3,
            Kind = "explore",
            Title = "最后一班车",
            Giver = "「站台的时刻表还在翻页。车没了，它倒不肯停。」",
            Objective = "抵达第 15 层",
            Body =
                "「最后一班车该在第 15 层进出。我等到时刻表翻过去，它也没来。」\n\n" +
                "「我想把这一层画下来。不是留给谁，是给自己看一眼：我到过这里。」\n\n" +
                "「走到第 15 层。剩下的路，残响替你们记着。」",
            DoneText =
                "第 15 层的站台与下面一模一样。你们拂了拂座位，连灰的厚度也一样。\n\n" +
                "残响没有跟上来。它留在发放这条支线的那一层，脸朝着时刻表。\n\n" +
                "但它把时间还给了你们一点。",
            TargetLayer = 15,
            TargetCount = 1,
            RewardPurge = 3,
            RewardText = "电子追踪 +3"
        });

        Q(new QuestDef
        {
            Id = "q3_backup",
            Act = 3,
            Kind = "action",
            Title = "备份",
            Giver = "「服务器里存着别人的一部分。你们也写一点进去，世上就有两份了。」",
            Objective = "在 2 台服务器上完成写入",
            Body =
                "「协议要删掉所有人。除非有人先留下副本。」\n\n" +
                "「这层有几台服务器。随便找两台，把你们自己的东西写进去。」\n\n" +
                "「别管协议怎么叫。我们要备份的是人。」",
            DoneText =
                "第二台服务器闪了一下，指示灯转绿。\n\n" +
                "「现在有两个人了。」残响说，「一个会死，一个不会。」\n\n" +
                "「机器总算写对了一件事。」",
            TargetCount = 2,
            RewardTeamLife = 1,
            RewardText = "队伍生命 +1（上限 5）"
        });

        // ── 0.15 新增：每幕补齐到 5 条 ────────────────────────────────
        // 目的不是"多写几条文案"，而是让 QuestForAct(act, slot, seed) 真的能抽出不同组合：
        // 池子只有 2 条时，"随机抽 2 条"等于每局完全一样。

        // 第一幕 · 霓虹港
        Q(new QuestDef
        {
            Id = "q1_lungs",
            Act = 1,
            Kind = "explore",
            Title = "还在呼吸的东西",
            Giver = "「第四层往下，有东西隔一阵就喘一口气。不是人。」",
            Objective = "抵达第 4 层，确认那个信号源",
            Body =
                "「排污班的管道里卡着一段录音。每隔 11 秒，铁皮里就响一次『我还在』。」\n\n" +
                "「它说一次，我数一次。数了三年。」\n\n" +
                "「那层楼现在归拍卖行管。他们管这种东西叫『存货』。」\n\n" +
                "「你们上去看一眼就行。别想着救——我早就知道救不回来了。」",
            DoneText =
                "管道尽头是一只旧式生命维持箱。外壳拆过三次，又焊回三次，焊缝一道压着一道。\n\n" +
                "里面是一对肺。它们把薄雾推上箱壁，又慢慢收回来。\n\n" +
                "「谢谢。」残响说，「现在我知道那是谁的肺了。」\n\n" +
                "它没再说下去。管道里的录音停了。",
            TargetLayer = 4,
            RewardPurge = 3,
            RewardText = "电子追踪 +3"
        });
        Q(new QuestDef
        {
            Id = "q1_shift",
            Act = 1,
            Kind = "action",
            Title = "换班记录",
            Giver = "「帮我在系统里留一条记录。那天我在值班。至少排班表一直是这么说的。」",
            Objective = "在服务器上完成 1 次写入",
            Body =
                "「静默之夜那天，我不在岗。我在楼下抽烟，看着烟头灭掉。」\n\n" +
                "「没人问过。可每次系统同步，那天的排班表都会翻出来：我的名字，整晚。」\n\n" +
                "「有人替我签了到。签完，就把那栋楼里的人全卖了。」\n\n" +
                "「让表上写一次实话。一次也行。」",
            DoneText =
                "写入的光标停了。排班表末尾多出一行小字：\n\n" +
                "「22:40 — 离岗。原因：抽烟。」\n\n" +
                "「这下它至少不全是假的了。」残响说。\n\n" +
                "「剩下的部分，我也认。」",
            TargetCount = 1,
            RewardTeamLife = 1,
            RewardText = "队伍生命 +1（上限 5）"
        });
        Q(new QuestDef
        {
            Id = "q1_receipt",
            Act = 1,
            Kind = "fetch",
            Title = "收据",
            Giver = "「宝库里有一张收据。买家栏空着，卖家栏一笔一画，是我。」",
            Objective = "在数据宝库里找到那张收据",
            Body =
                "「器官买卖在这层是合法的。合法的意思是，它有发票。」\n\n" +
                "「我卖过一部分自己。40 记忆币，刚好付三个月房租。」\n\n" +
                "「后来房租涨了。我又卖了一次。」\n\n" +
                "「东西不要回来。我只想看那两行数字，把两次加在一起。」",
            DoneText =
                "收据上只有两行数字。纸很薄，中间隔着四年。\n\n" +
                "「40」和「35」。\n\n" +
                "「降价了。」残响把收据抚平，语气居然有点高兴，「说明剩下的部分不好卖。」\n\n" +
                "「那我就不用再卖了。」",
            Source = "treasure",
            TargetCount = 1,
            RewardItem = "t_chip",
            RewardMemory = 80,
            RewardText = "稀有装备 + 80 记忆币"
        });

        // 第二幕 · 镜海穹顶
        Q(new QuestDef
        {
            Id = "q2_hands",
            Act = 2,
            Kind = "fetch",
            Title = "手套",
            Giver = "「宾客都戴手套。酒杯碰过许多次，手没有。」",
            Objective = "从遗骸或宝库里找到一只摘下来的手套",
            Body =
                "「穹顶的规矩：宴会上不碰别人，也不被人碰。所以所有人戴手套。」\n\n" +
                "「有个人摘了下来。他把手伸出去，想握一握谁。」\n\n" +
                "「三分钟后，他被请出宴会厅。手套留在桌上，没跟主人走。」\n\n" +
                "「我想知道它去了哪。是不是也被归进了没人认领的行李。」",
            DoneText =
                "手套在一具遗骸手里。不是戴着——是握着，指节已经僵了。\n\n" +
                "里面塞着一张纸条，字迹被汗泡花：\n\n" +
                "「如果有人捡到，请把它交给下一个想握手的人。」\n\n" +
                "「他试过了。」残响说。「这比大多数人都强。」",
            Source = "mirror",
            TargetCount = 1,
            RewardItem = "w_mirror_blade",
            RewardMemory = 80,
            RewardText = "稀有装备 + 80 记忆币"
        });
        Q(new QuestDef
        {
            Id = "q2_choir",
            Act = 2,
            Kind = "explore",
            Title = "没有听众的合唱",
            Giver = "「第五层有个教堂，每晚唱一次。票早卖完了，听众还没散。」",
            Objective = "抵达第 5 层，听完那段合唱",
            Body =
                "「白噪教堂的座位是满的。坐着的都是空壳——他们买了永久席位。」\n\n" +
                "「合唱团每晚唱一次，唱给那些已经听不见的人。」\n\n" +
                "「我听过一次。第三句跑了调。它停也没停，还是唱完了。」\n\n" +
                "「再让一个活人听听吧。路过也行，别在门口刷卡就走。」",
            DoneText =
                "你们在第五层的门外停住脚步。\n\n" +
                "里面在唱。第三句散了，一个声部先找回来，其余声音慢慢跟上。\n\n" +
                "唱完时，一排空座位的灯依次灭了。\n\n" +
                "「它唱完了。」残响说。「谢谢你们，当了一次听众。」",
            TargetLayer = 5,
            RewardPurge = 3,
            RewardText = "电子追踪 +3"
        });
        Q(new QuestDef
        {
            Id = "q2_witness",
            Act = 2,
            Kind = "hunt",
            Title = "别让他们看见",
            Giver = "「守卫看见什么，案子上就记下什么。那一页一直没合上。」",
            Objective = "击败 2 个精英守卫（精英与密钥看守各算 1）",
            Body =
                "「穹顶的守卫不抬手。它们抬镜头。」\n\n" +
                "「它们看见你做了什么，那一幕就会被存档，被引用，最后变成证据。」\n\n" +
                "「我在这儿待了很久。案子上已有我的名字，还没轮到我被引用。」\n\n" +
                "「把它们清掉。不是为了杀——是让这一页空着。」",
            DoneText =
                "最后一名守卫倒下时，它手上的记录仪还在转。\n\n" +
                "残响捏住带子的两头，慢慢抽出来，揉碎在掌心。\n\n" +
                "「这一页现在空了。」\n\n" +
                "「空着，不是我不在场。是我不必解释。」",
            Source = "elite",
            TargetCount = 2,
            RewardConsumableCount = 2,
            RewardMemory = 120,
            RewardText = "消耗品 ×2 + 120 记忆币"
        });

        // 第三幕 · 零号轨道
        Q(new QuestDef
        {
            Id = "q3_manifest",
            Act = 3,
            Kind = "fetch",
            Title = "货运清单",
            Giver = "「轨道上什么都有清单。箱子有，数据有，人也有。」",
            Objective = "找到那份货运清单（遗骸或宝库都行）",
            Body =
                "「零号轨道每天运三趟。第 1 趟是补给，第 2 趟是数据，第 3 趟是『样本』。」\n\n" +
                "「样本那一栏不写名字。编号，重量，不多一个字。」\n\n" +
                "「替我看一眼最后一趟。上面有没有我。」\n\n" +
                "「如果有，我想知道，他们把我称成了多少公斤。」",
            DoneText =
                "清单在你们手里翻到最后一行：\n\n" +
                "「样本 47。重量 62。状态：待归档。」\n\n" +
                "「62 公斤。」残响低头念了一遍，「我比记忆里轻了 8 公斤。」\n\n" +
                "「这三年，我还是把一些东西落在了别处。」",
            Source = "any",
            TargetCount = 1,
            RewardItem = "w_orbit_lance",
            RewardMemory = 90,
            RewardText = "稀有装备 + 90 记忆币"
        });
        Q(new QuestDef
        {
            Id = "q3_silence",
            Act = 3,
            Kind = "hunt",
            Title = "安静下来",
            Giver = "「轨道上太吵了。最后之前，我想讨一小会儿安静。」",
            Objective = "清掉 5 场战斗",
            Body =
                "「主脑不睡觉。它开会，表决，通过。一个会接着一个会。」\n\n" +
                "「声音贴着每根管道过来，压得很低，像隔壁有人念一份念不完的文件。」\n\n" +
                "「我在这里待了三年，没听完过一次安静。」\n\n" +
                "「就一小会儿。够我把自己的心跳听完。」",
            DoneText =
                "最后一台机器停转，管道里的低鸣慢慢退了下去。\n\n" +
                "没有人说话。安静持续了大约 20 秒。\n\n" +
                "「听见了吗。」残响说。\n\n" +
                "「那是我的心跳。它还在。」",
            TargetCount = 5,
            RewardConsumableCount = 2,
            RewardMemory = 140,
            RewardText = "消耗品 ×2 + 140 记忆币"
        });
        Q(new QuestDef
        {
            Id = "q3_song",
            Act = 3,
            Kind = "explore",
            Title = "主脑的歌",
            Giver = "「它唱过一次。那时，它还没有名字。」",
            Objective = "抵达第 6 层，听主脑唱完那首歌",
            Body =
                "「零号协议不是被写出来的。它是被唱出来的。」\n\n" +
                "「第一批工程师拿一段童谣给它做启动测试。歌很短，唱错也没人计较。」\n\n" +
                "「后来它越长越大，连自己的开头都记不住了。」\n\n" +
                "「但它还在唱。只是没人敢听到第二句。」",
            DoneText =
                "第六层的机房中央，一个声音反复哼着同一段旋律，指示灯跟着明灭。\n\n" +
                "第三句唱到一半，它停住，从头再来。每次都断在同一个地方。\n\n" +
                "「它记不住第四句。」残响说。\n\n" +
                "「这三年，它一直是你们最大的敌人。而它只是想不起来第四句。」",
            TargetLayer = 6,
            RewardPurge = 4,
            RewardText = "电子追踪 +4"
        });
    }
}
