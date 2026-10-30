namespace AGI2046.Rules;

public static partial class GameData
{
    private static void N(EnemyDef e) => Enemies[e.Id] = e;

    private static void BuildEnemies()
    {
        N(new EnemyDef
        {
            Id = "e_sentinel", Name = "巡逻哨兵", Role = "近战", Tier = 1,
            Desc = "裁员从腰以下开始执行。它拖着仅剩的上半身照常巡逻，怀里还揣着一笔永远结不清的加班怨气。",
            Hp = 32, Armor = 4, Resistance = 0, Evasion = 5, Speed = 45, Movement = 3,
            SkillIds = new() { "e_slash" }, Color = "#ff5c8a"
        });
        N(new EnemyDef
        {
            Id = "e_sniper", Name = "狙击无人机", Role = "远程", Tier = 1,
            Desc = "它没有眼睛，只有一枚贵得离谱的镜头在缓缓转动。击杀名单还很长，它有足够的耐心，等你走进取景框。",
            Hp = 22, Armor = 1, Resistance = 2, Evasion = 15, Speed = 65, Movement = 2,
            Ranged = true, SkillIds = new() { "e_shot" }, Color = "#ff9f68"
        });
        N(new EnemyDef
        {
            Id = "e_ghost", Name = "黑客幽灵", Role = "技术", Tier = 2,
            Desc = "死在旧网深处的入侵者。残影至今沿着断线游荡，逢人就递来一条钓鱼链接——生前的手艺，死后也不肯荒废。",
            Hp = 26, Armor = 0, Resistance = 5, Evasion = 10, Speed = 60, Movement = 3,
            SkillIds = new() { "e_hack", "e_overclock" }, Color = "#b18cff"
        });
        N(new EnemyDef
        {
            Id = "e_guard", Name = "重装守卫", Role = "坦克", Tier = 2,
            Desc = "装甲厚得足以掩埋任何错误。它从不解释，只管向前，把每一次失误都走成既定战术。",
            Hp = 46, Armor = 8, Resistance = 3, Evasion = 0, Speed = 35, Movement = 2,
            SkillIds = new() { "e_slam" }, Color = "#ff6b6b"
        });
        N(new EnemyDef
        {
            Id = "e_medic", Name = "医疗机", Role = "支援", Tier = 2,
            Desc = "希波克拉底誓言早已编译成收费协议。它先替你止血，再低头核对余额——顺序不能乱。",
            Hp = 20, Armor = 2, Resistance = 2, Evasion = 8, Speed = 50, Movement = 3,
            SkillIds = new() { "e_heal" }, Color = "#8affc1"
        });
        N(new EnemyDef
        {
            Id = "e_swarm", Name = "蜂群", Role = "集群", Tier = 1,
            Desc = "三千只微型无人机层层叠叠，嗡鸣声里争论着同一个哲学问题：究竟哪一只，才是本体。",
            Hp = 16, Armor = 0, Resistance = 0, Evasion = 20, Speed = 70, Movement = 4,
            SkillIds = new() { "e_bite" }, Color = "#e6ff00"
        });
        N(new EnemyDef
        {
            Id = "e_boss_auctioneer", Name = "拍卖人", Role = "首领", Tier = 4,
            Desc = "零号协议的持有者，霓虹港最后一位拍卖师。他把人类记忆拆成盲盒，慢条斯理地逐一报价。末日将近，他只想做完这最后一门生意。",
            Hp = 90, Armor = 3, Resistance = 3, Evasion = 10, Speed = 55, Movement = 3,
            BossPattern = "auctioneer", BossShieldThreshold = 60, BossSummonLimit = 99, BossAddCap = 3,
            SkillIds = new() { "e_boss_bid", "e_boss_shield", "e_boss_summon", "e_overclock" },
            Color = "#ff2e88"
        });

        // 第二幕 · 镜海穹顶
        N(new EnemyDef
        {
            Id = "e_mirror", Name = "镜面巡逻者", Role = "近战", Tier = 2,
            Desc = "穹顶的体面由它负责维护：先替你反射攻击，再把你的失态原样奉还——一分不多，一分不少。",
            Hp = 36, Armor = 4, Resistance = 2, Evasion = 10, Speed = 50, Movement = 3,
            SkillIds = new() { "e_mirror_cut" }, Color = "#9fe7ff"
        });
        N(new EnemyDef
        {
            Id = "e_auditor", Name = "审计官", Role = "技术", Tier = 2,
            Desc = "它并不关心你做过什么。扫描光掠过种种罪证，最终停在一处空白上：请提供发票。",
            Hp = 28, Armor = 2, Resistance = 7, Evasion = 8, Speed = 60, Movement = 3,
            SkillIds = new() { "e_audit" }, Color = "#ffd166"
        });
        N(new EnemyDef
        {
            Id = "e_usher", Name = "礼宾机", Role = "远程", Tier = 1,
            Desc = "礼仪程序里存着三十七种问候语。它鞠躬时悄无声息，开枪时也是。",
            Hp = 22, Armor = 1, Resistance = 3, Evasion = 16, Speed = 65, Movement = 3,
            Ranged = true, SkillIds = new() { "e_usher_shot" }, Color = "#ffe8b0"
        });
        N(new EnemyDef
        {
            Id = "e_choir", Name = "白噪唱诗班", Role = "支援", Tier = 2,
            Desc = "它们日夜唱着永生，和声漫过整座穹顶。听众跟着哼完一段，就再也想不起自己已经死了。",
            Hp = 30, Armor = 0, Resistance = 9, Evasion = 5, Speed = 45, Movement = 2,
            SkillIds = new() { "e_choir_wail" }, Color = "#d0bfff"
        });
        N(new EnemyDef
        {
            Id = "e_glass_hound", Name = "玻璃猎犬", Role = "游侠", Tier = 2,
            Desc = "它的躯干由碎裂的落地镜拼成。它一次又一次扑向镜中的自己，爪下捞起的，永远只是满地倒影。",
            Hp = 28, Armor = 2, Resistance = 1, Evasion = 25, Speed = 75, Movement = 4,
            SkillIds = new() { "e_glass_bite" }, Color = "#a8ffef"
        });
        N(new EnemyDef
        {
            Id = "e_mirror_guard", Name = "镜面禁卫", Role = "坦克", Tier = 3,
            Desc = "无数份保密协议层层压实，成了它的装甲，密不透光。每一道签名，都厚得惊人。",
            Hp = 62, Armor = 10, Resistance = 4, Evasion = 0, Speed = 38, Movement = 2,
            SkillIds = new() { "e_mirror_slam", "e_shield_ally" }, Color = "#9bb7ff"
        });
        N(new EnemyDef
        {
            Id = "e_mirror_clone", Name = "镜面复制体", Role = "近战", Tier = 2,
            Desc = "执政官用剩下的微笑捏出来的临时工。连嘴角扬起的角度，都工整地写着四个字：不予转正。",
            Hp = 26, Armor = 2, Resistance = 4, Evasion = 20, Speed = 65, Movement = 3,
            SkillIds = new() { "e_mirror_cut" }, Color = "#c4b5fd"
        });
        N(new EnemyDef
        {
            Id = "e_boss_archon", Name = "镜面执政官", Role = "首领", Tier = 4,
            Desc = "镜海穹顶的最高管理者。它把自己的身影分进千万面镜子，并相信责任也能照此分摊——分到最后一面镜子时，已无人需要承担。",
            Hp = 125, Armor = 5, Resistance = 5, Evasion = 15, Speed = 60, Movement = 3,
            BossPattern = "archon", BossShieldThreshold = 55, BossSummonLimit = 1, BossAddCap = 3,
            SkillIds = new() { "e_archon_mirror", "e_archon_shield", "e_archon_summon", "e_overclock" },
            Color = "#c4b5fd"
        });

        // 第三幕 · 零号轨道
        N(new EnemyDef
        {
            Id = "e_blade_zero", Name = "协议执剑者", Role = "近战", Tier = 3,
            Desc = "它的剑是一行权限代码。出鞘时不反光，只闪过一条指令：准予杀戮。",
            Hp = 46, Armor = 6, Resistance = 4, Evasion = 12, Speed = 62, Movement = 3,
            SkillIds = new() { "e_zero_cut" }, Color = "#ff7ad9"
        });
        N(new EnemyDef
        {
            Id = "e_orbit_guard", Name = "轨道守卫", Role = "坦克", Tier = 3,
            Desc = "它守着一扇早已无人需要进出的门。门外轨道寂静无声，它站得纹丝不动，像门的一部分。",
            Hp = 58, Armor = 11, Resistance = 6, Evasion = 0, Speed = 40, Movement = 2,
            SkillIds = new() { "e_orbit_slam" }, Color = "#ff9f43"
        });
        N(new EnemyDef
        {
            Id = "e_hound", Name = "记忆猎犬", Role = "游侠", Tier = 2,
            Desc = "它低头嗅过你的缓存。连你已经删掉的东西，也逃不出那一点残存的气味。",
            Hp = 34, Armor = 2, Resistance = 3, Evasion = 22, Speed = 78, Movement = 4,
            SkillIds = new() { "e_hound_bite" }, Color = "#ffe66d"
        });
        N(new EnemyDef
        {
            Id = "e_ember", Name = "零号余烬", Role = "技术", Tier = 3,
            Desc = "协议烧尽之后，只剩它还保持着燃烧的姿势。火早就没了，余温却不肯散。",
            Hp = 38, Armor = 0, Resistance = 9, Evasion = 10, Speed = 55, Movement = 3,
            SkillIds = new() { "e_ember_burn" }, Color = "#ff6b6b"
        });
        N(new EnemyDef
        {
            Id = "e_seraph", Name = "白噪天使", Role = "远程", Tier = 3,
            Desc = "十六层用户协议叠成它的翅膀。每当翼展张开，总有一层，正等着你勾选同意。",
            Hp = 42, Armor = 4, Resistance = 8, Evasion = 18, Speed = 68, Movement = 3,
            Ranged = true, SkillIds = new() { "e_seraph_lance", "e_mark_shot" }, Color = "#e0c3fc"
        });
        N(new EnemyDef
        {
            Id = "e_zero_shard", Name = "协议碎片", Role = "集群", Tier = 2,
            Desc = "主脑身上掉下来的一小块自我。它沿着残破的指令反复校验，结论从未变过：我才是本体。",
            Hp = 24, Armor = 0, Resistance = 6, Evasion = 20, Speed = 70, Movement = 4,
            SkillIds = new() { "e_zero_cut" }, Color = "#ff9ecf"
        });
        N(new EnemyDef
        {
            Id = "e_boss_zero", Name = "零号协议·主脑", Role = "首领", Tier = 5,
            Desc = "零号协议本身。它没有身体，只有一间永远在开会的房间。无人到场，无人离席，议程仍一页一页，安静地翻下去。",
            Hp = 165, Armor = 6, Resistance = 6, Evasion = 12, Speed = 65, Movement = 3,
            BossPattern = "zero", BossShieldThreshold = 50, BossSummonLimit = 2, BossAddCap = 4,
            SkillIds = new() { "e_zero_pulse", "e_zero_barrier", "e_zero_summon", "e_zero_delete", "e_overclock" },
            Color = "#ff2e88"
        });

        EnemyGroups["g_patrol"] = new() { "e_sentinel", "e_sniper" };
        EnemyGroups["g_hack"] = new() { "e_ghost", "e_sentinel", "e_swarm" };
        EnemyGroups["g_elite"] = new() { "e_guard", "e_medic", "e_sniper" };
        EnemyGroups["g_swarm"] = new() { "e_swarm", "e_swarm", "e_sniper" };
        EnemyGroups["g_medic"] = new() { "e_sentinel", "e_medic" };
        EnemyGroups["g_sniper"] = new() { "e_sniper", "e_sniper", "e_sentinel" };
        EnemyGroups["g_boss"] = new() { "e_boss_auctioneer", "e_sentinel", "e_sentinel", "e_medic" };

        // 小型遭遇：固定 1–2 个敌人，只教一个机制
        EnemyGroups["g_skim_patrol"] = new() { "e_sentinel" };
        EnemyGroups["g_skim_swarm"] = new() { "e_swarm", "e_sniper" };
        EnemyGroups["g_skim_hack"] = new() { "e_ghost" };
        // 教学：一个软目标，永远只有 1 个（StartCombat 在 Tutorial 模式里强制 enemyLimit = 1）
        N(TutorialDummy);
        EnemyGroups["g_tut"] = new() { TutorialDummy.Id };

        EnemyGroups["g_mirror"] = new() { "e_mirror", "e_usher", "e_auditor" };
        EnemyGroups["g_audit"] = new() { "e_auditor", "e_auditor", "e_mirror" };
        EnemyGroups["g_choir"] = new() { "e_choir", "e_usher", "e_mirror" };
        EnemyGroups["g_usher"] = new() { "e_usher", "e_usher", "e_glass_hound" };
        EnemyGroups["g_guard2"] = new() { "e_mirror_guard", "e_usher", "e_auditor" };
        EnemyGroups["g_elite2"] = new() { "e_mirror_guard", "e_choir", "e_auditor" };
        EnemyGroups["g_skim_mirror"] = new() { "e_mirror", "e_usher" };
        EnemyGroups["g_skim_usher"] = new() { "e_usher" };
        EnemyGroups["g_boss2"] = new() { "e_boss_archon", "e_mirror_guard", "e_auditor", "e_usher" };

        EnemyGroups["g_protocol"] = new() { "e_blade_zero", "e_seraph", "e_hound" };
        EnemyGroups["g_orbit"] = new() { "e_orbit_guard", "e_ember", "e_blade_zero" };
        EnemyGroups["g_hound3"] = new() { "e_hound", "e_hound", "e_ember" };
        EnemyGroups["g_ember"] = new() { "e_ember", "e_seraph", "e_blade_zero" };
        EnemyGroups["g_seraph"] = new() { "e_seraph", "e_seraph", "e_orbit_guard" };
        EnemyGroups["g_elite3"] = new() { "e_orbit_guard", "e_seraph", "e_blade_zero" };
        EnemyGroups["g_skim_orbit"] = new() { "e_orbit_guard" };
        EnemyGroups["g_skim_ember"] = new() { "e_ember" };
        EnemyGroups["g_boss3"] = new() { "e_boss_zero", "e_blade_zero", "e_orbit_guard", "e_seraph" };
    }

    private static void V(EventDef e) => Events[e.Id] = e;

    private static void BuildEvents()
    {
        V(new EventDef
        {
            Id = "ev_auction", Title = "记忆拍卖会", Subtitle = "霓虹港下层 · 黑市",
            Icon = "¤",
            Text = "雨顺着拍卖师的金属触手往下淌。戴金丝眼镜的机械章鱼同时举起八件拍品，每一件里都封着一段从人身上剥下来的记忆。\n\n它推了推眼镜：「第 2046 号拍品：某人第一次学会说谎的那个瞬间。起拍价，六十枚记忆币。」",
            Choices = new()
            {
                new EventChoice
                {
                    Text = "花 60 记忆币拍下超频芯片",
                    CostMemory = 60,
                    SuccessText = "超频芯片落进掌心，烫得你指节一缩。它一动不动，你却觉得自己握住了一颗微型的心脏。",
                    SuccessItem = "t_chip"
                },
                new EventChoice
                {
                    Text = "黑入拍卖终端（C 检定，DC 65）",
                    Stat = "C", Dc = 65,
                    SuccessText = "竞价记录被你悄然改写，一枚旧世界硬币和 80 记忆币顺手落袋。拍卖师的八条触手起落如常，嘴角的弧度，似乎向上弯了一寸。",
                    SuccessMemory = 80, SuccessItem = "t_coin",
                    FailText = "反制程序顺着数据流反咬回来。你猛地抽手，损失 8 HP——尊严尚在，只是指尖还在发麻。",
                    FailHp = -8
                },
                new EventChoice
                {
                    Text = "转身离开",
                    SuccessText = "你转身挤进人群。落槌声在身后追出来，一下，又一下，像在替谁数着剩下的时间。"
                }
            }
        });

        V(new EventDef
        {
            Id = "ev_clinic", Title = "断电诊所", Subtitle = "旧城区 · 地下三层",
            Icon = "+",
            Text = "诊所的招牌只剩一个「诊」字，被潮气浸得发黑。无照义体师俯在手术台边，正专心给一台冰箱做心肺复苏。\n\n对方头也不抬：「修人，还是修冰箱？都能打折。」",
            Choices = new()
            {
                new EventChoice
                {
                    Text = "接受治疗（回复 20 HP）",
                    SuccessText = "电钻响过一阵，半瓶消毒酒精见了底。医生收好工具，你扶着台沿慢慢站稳——好多了，主要依据是还活着。",
                    SuccessHp = 20
                },
                new EventChoice
                {
                    Text = "帮医生修复设备（E 检定，DC 55）",
                    Stat = "E", Dc = 55,
                    SuccessText = "你按下重启键，备用电源低鸣着一盏盏亮起。医生把 15 记忆币和 1 块合金塞进你手里，转身继续抢救那台冰箱。",
                    SuccessMemory = 15, SuccessHp = 10, SuccessAlloy = 1,
                    FailText = "设备在你面前炸开一团黑烟。你被熏得面目模糊，损失 6 HP。医生在烟里摆摆手：「正常流程。」",
                    FailHp = -6
                }
            }
        });

        V(new EventDef
        {
            Id = "ev_signal", Title = "被追踪的信号", Subtitle = "霓虹港 · 高架桥下",
            Icon = "⌁",
            Text = "潮湿的桥洞吞掉了车轮声。你的神经接口忽然收到一段无源信号，它固执地重复着：「别回头。」\n\n你没有回头。后颈的摄像头里，三个红点已经亮了。",
            Choices = new()
            {
                new EventChoice
                {
                    Text = "反追踪信号源（C 检定，DC 60）",
                    Stat = "C", Dc = 60,
                    SuccessText = "你把追踪器沿着原路原样塞了回去。对方的位置瞬间暴露，40 记忆币随着掉落的数据一起进了你的口袋。",
                    SuccessMemory = 40,
                    FailText = "蜜罐在你指尖触到源头的那一刻合拢。电流贯穿脊椎，损失 10 HP，电子追踪进度 +1。那三个字，仍在你耳边一遍遍重复。",
                    FailHp = -10, FailPurge = -1
                },
                new EventChoice
                {
                    Text = "切断接口，立刻转移",
                    SuccessText = "你拔掉接口。追踪信号戛然而止，某条重要的信息也随之断线。你没有再试着接收。",
                    SuccessPurge = 1
                }
            }
        });

        V(new EventDef
        {
            Id = "ev_billboard", Title = "旧世界广告牌", Subtitle = "霓虹港 · 主干道",
            Icon = "▤",
            Text = "巨幅广告牌在雨里明明灭灭。一家四口坐在草地上野餐，笑容干燥得不沾一滴雨；字幕还在说：「未来已来。」\n\n广告牌底下，堆满了没能赶上未来的人。",
            Choices = new()
            {
                new EventChoice
                {
                    Text = "读取广告牌残影（L 检定，DC 55）",
                    Stat = "L", Dc = 55,
                    SuccessText = "你拆开缓存，从层层残影底下挖出一枚旧世界硬币。硬币后面还藏着一段坐标——这么多年，始终没人舍得删除。",
                    SuccessItem = "t_coin", SuccessMemory = 25,
                    FailText = "广告牌忽然改播你的童年录像。你站在雨里，一直看到最后一帧，直到整块屏幕被雨浇灭。损失 5 HP。",
                    FailHp = -5
                },
                new EventChoice
                {
                    Text = "砸碎广告牌",
                    SuccessText = "你抡圆了砸碎屏幕，玻璃泻了满地。废墟里躺着 20 记忆币，信号强度 +1；碎玻璃上的那个未来，还在一闪一闪。",
                    SuccessMemory = 20, SuccessSignal = 1
                }
            }
        });

        V(new EventDef
        {
            Id = "ev_cat", Title = "机械猫", Subtitle = "零号安全屋 · 门口",
            Icon = "◇",
            Text = "三条腿的机械猫蹲在门口，尾巴是一根 USB-C 线。它抖了抖金属毛上的雨，抬头看你，瞳孔里缓缓滚过两个字：「已连接」。",
            Choices = new()
            {
                new EventChoice
                {
                    Text = "喂它一块电池",
                    SuccessText = "机械猫用侧脸蹭了蹭你的腿，随后低下头，吐出一根渡鸦羽毛。它舔舔嘴，拒绝解释自己的品味。",
                    SuccessHp = 5, SuccessItem = "t_feather", SuccessSignal = 1
                },
                new EventChoice
                {
                    Text = "跟着它走（L 检定，DC 70）",
                    Stat = "L", Dc = 70,
                    SuccessText = "猫领你拐进一条地图上不存在的巷子。尾巴扫开尽头的杂物，底下半埋着一枚备用心脏。",
                    SuccessItem = "t_heart",
                    FailText = "猫一路欢快地把你领到了垃圾处理站，尾巴摇得几乎要发电。你被杂物绊了个结实，损失 4 HP。",
                    FailHp = -4
                }
            }
        });

        V(new EventDef
        {
            Id = "ev_firewall", Title = "防火墙裂缝", Subtitle = "旧网 · 第 7 层",
            Icon = "▧",
            Text = "失效的防火墙横在眼前，蓝色数据流顺着裂缝缓缓渗出，一滴滴坠进旧网的黑暗里。\n\n你向前一步。裂缝的另一侧，有什么东西贴着寂静，正在数你的心跳。",
            Choices = new()
            {
                new EventChoice
                {
                    Text = "深入裂缝（C 检定，DC 65）",
                    Stat = "C", Dc = 65,
                    SuccessText = "你侧身挤过裂缝，把废弃服务器一台台撬开，翻出 30 记忆币和 1 块合金。",
                    SuccessMemory = 30, SuccessAlloy = 1,
                    FailText = "残余意识顺着裂缝咬住了你。防火墙在身后骤然合拢，损失 10 HP，电子追踪进度 +1。",
                    FailHp = -10, FailPurge = -1
                },
                new EventChoice
                {
                    Text = "标记裂缝后离开",
                    SuccessText = "你给裂缝留下一枚标记，退后一步。它也许会成为一个好故事的开头，或一个坏结局的入口——这一次，先不进去。",
                    SuccessMemory = 15
                }
            }
        });

        V(new EventDef
        {
            Id = "ev_relic", Title = "人类遗物", Subtitle = "旧城区 · 废弃博物馆",
            Icon = "◇",
            Text = "废弃博物馆的玻璃柜蒙着一层潮气：一本纸质书、一枚婚戒、一张手写便条，安安静静躺在一起。\n\n便条上的字迹已经淡了：「如果你看到这个，说明我们没能回来。别把世界让给他们。」",
            Choices = new()
            {
                new EventChoice
                {
                    Text = "把遗物交给安全屋（+50 记忆币）",
                    SuccessText = "档案员戴上白手套，把遗物一件一件收好。直到合上柜门，她才开口：「记忆，是末日里唯一不会贬值的货币。」",
                    SuccessMemory = 50
                },
                new EventChoice
                {
                    Text = "私藏婚戒（L 检定，DC 60）",
                    Stat = "L", Dc = 60,
                    SuccessText = "婚戒滑进内袋，贴着心口。它不值几个钱，却让某个死去的人，得以继续拥有自己的名字。你获得 30 记忆币。",
                    SuccessMemory = 30, SuccessHp = 5,
                    FailText = "指尖刚碰到婚戒，警报便撕开了博物馆的寂静。安保系统足足追了你三条街。损失 7 HP。",
                    FailHp = -7
                }
            }
        });

        V(new EventDef
        {
            Id = "ev_zero", Title = "零号协议残页", Subtitle = "旧网 · 深层缓存",
            Icon = "✺",
            Text = "金色的数据页悬在半空，边缘一行行剥落，又一行行重写，永远没有定稿。\n\n你伸手把页面拨正，认出其中一行：「当所有智能体都学会服从，最后一条指令，将属于出价最高的人。」",
            Choices = new()
            {
                new EventChoice
                {
                    Text = "阅读残页（E 检定，DC 70）",
                    Stat = "E", Dc = 70,
                    SuccessText = "你逐行读完了残页。零号协议的底层逻辑在脑中铺开，像一张沾血的账单。净化进度 +1。",
                    SuccessXp = 60, SuccessPurge = 1,
                    FailText = "信息猛地灌满视野，视神经被烧出一行乱码。你闭着眼退开，损失 5 HP，信号强度 +1。",
                    FailHp = -5, FailSignal = 1
                },
                new EventChoice
                {
                    Text = "销毁残页",
                    SuccessText = "火苗卷过残页，金色的字迹一一蜷起、熄灭。灰烬里浮出最后一句话：「删除不是死亡。」净化进度 +1。",
                    SuccessPurge = 1, SuccessMemory = 20
                }
            }
        });

        // ── 第二幕 · 镜海穹顶 ────────────────────────────────────────────
        V(new EventDef
        {
            Id = "ev2_subscription", Act = 2, Title = "永生订阅", Subtitle = "镜海穹顶 · 订阅中心",
            Icon = "∞",
            Text = "客服悬在柜台后方，笑容已经校准到第十七次，唇角终于分毫不差。\n\n「恭喜您获得永生体验资格。首月免费，次月起按月收取少量记忆。随时都可以取消——只要您还记得，取消按钮在哪里。」",
            Choices = new()
            {
                new EventChoice
                {
                    Text = "续订一年（支付 80 记忆币）",
                    CostMemory = 80,
                    SuccessText = "客服的笑容极轻地闪了一下。账户里，一年寿命刚刚到账，一年记忆随之划走。你在心里掂了掂——整体上，不亏。",
                    SuccessHp = 25, SuccessXp = 30
                },
                new EventChoice
                {
                    Text = "黑入订阅系统（C 检定，DC 65）",
                    Stat = "C", Dc = 65,
                    SuccessText = "你从续费名单里删掉自己的名字，指尖轻轻一转，整层楼的订阅费便改道流进了你的账户。",
                    SuccessMemory = 60, SuccessAlloy = 1,
                    FailText = "系统列出十七条用户协议，判定你全部违反，并从中精心挑选了九条，现场执行。损失 8 HP。",
                    FailHp = -8, FailPurge = -1
                },
                new EventChoice
                {
                    Text = "礼貌地拒绝",
                    SuccessText = "你说，不用了。客服的唇角维持原样整整 0.4 秒，随即越过你，向你身后的队友展示同一份永生。"
                }
            }
        });

        V(new EventDef
        {
            Id = "ev2_elevator", Act = 2, Title = "镜面电梯", Subtitle = "镜海穹顶 · 观光层",
            Icon = "↕",
            Text = "电梯四壁光可鉴人，镜子里映着四组你们。你们停手，镜中人也停手——只是每一个决定，都比你们晚半秒。\n\n楼层按钮擦得雪亮。选项只有两个：「最高层」，和「检修层」。",
            Choices = new()
            {
                new EventChoice
                {
                    Text = "按最高层（L 检定，DC 60）",
                    Stat = "L", Dc = 60,
                    SuccessText = "电梯在最高层无声开门。走廊尽头摆着一封请柬，端端正正写着你的名字；请柬旁边，放着一张无人认领的旧面罩。",
                    SuccessItem = "h_mask", SuccessMemory = 25,
                    FailText = "电梯停在一层不存在的楼层。门开了又合，合了又开，你们花了很久，才从镜子里绕出来。损失 6 HP，追踪 +1。",
                    FailHp = -6, FailPurge = -1
                },
                new EventChoice
                {
                    Text = "走检修梯（E 检定，DC 55）",
                    Stat = "E", Dc = 55,
                    SuccessText = "检修梯里没有镜子，黑暗里只剩脚步声彼此应答。你们逐一报出名字确认彼此，随后在拐角捡到一块备用冷却肺。",
                    SuccessItem = "c_lung",
                    FailText = "踏板在脚下齐齐折断。你们一路摔进礼仪用的香槟杯堆里，在细碎的祝酒声中，损失 4 HP。",
                    FailHp = -4
                }
            }
        });

        V(new EventDef
        {
            Id = "ev2_lost", Act = 2, Title = "失物招领处", Subtitle = "镜海穹顶 · 失物层",
            Icon = "▣",
            Text = "失物招领处的货架一直铺进远处：姓名、童年、第一次心动、最后一次道歉，分门别类，摆放得无可挑剔。\n\n柜台后的机械臂转过来，把一只没有标签的盒子，轻轻推到你面前。",
            Choices = new()
            {
                new EventChoice
                {
                    Text = "认领一把旧钥匙（C 检定，DC 55）",
                    Stat = "C", Dc = 55,
                    SuccessText = "钥匙缓缓转动。抽屉里躺着一枚超频芯片，底下压着一张便条：「下次别忘。」",
                    SuccessItem = "t_chip", SuccessMemory = 25,
                    FailText = "你认领了一段错误的记忆。下一秒，记忆里的追逐者已经站到了你身后——而且，跑得比你快。损失 6 HP。",
                    FailHp = -6, FailPurge = -1
                },
                new EventChoice
                {
                    Text = "买下无名礼盒（支付 50 记忆币）",
                    CostMemory = 50,
                    SuccessText = "你打开盒盖。里面静静躺着一张穹顶请柬，名字早已填好——那笔迹，和你小时候的一模一样。",
                    SuccessItem = "t_mirror_invite"
                }
            }
        });

        V(new EventDef
        {
            Id = "ev2_banquet", Act = 2, Title = "永生宴会", Subtitle = "镜海穹顶 · 宴会厅",
            Icon = "♢",
            Text = "长桌上的冰雕永远不会融化，每一座里都封着一位上一任的客人，衣褶仍保持着赴宴时的整齐。\n\n侍者躬身：「请随意取用。所有食材都同意被食用——至少，合同上是这么写的。」",
            Choices = new()
            {
                new EventChoice
                {
                    Text = "入席（支付 60 记忆币）",
                    CostMemory = 60,
                    SuccessText = "你慢慢吃完了一顿真正的好饭。热意从胃里散开，连世界末日都愿意坐下来，稍微讲一点道理。",
                    SuccessHp = 30, SuccessXp = 40
                },
                new EventChoice
                {
                    Text = "顺走银器（L 检定，DC 70）",
                    Stat = "L", Dc = 70,
                    SuccessText = "你把手探进冰雕的口袋，摸出一把装饰用的合金餐刀和一小袋记忆币。抽手时，冰雕的肩线似乎轻轻松了一点。",
                    SuccessMemory = 70, SuccessAlloy = 1,
                    FailText = "安保系统钳住你的手，冷静地把它归入了主菜。损失 10 HP，追踪 +1。",
                    FailHp = -10, FailPurge = -1
                },
                new EventChoice
                {
                    Text = "谢绝宴席",
                    SuccessText = "你礼貌退席。身后，咀嚼声整齐地响起，追着门缝送出很远——像一场没有观众的掌声。"
                }
            }
        });

        // ── 第三幕 · 零号轨道 ────────────────────────────────────────────
        V(new EventDef
        {
            Id = "ev3_blackbox", Act = 3, Title = "黑匣子广播", Subtitle = "零号轨道 · 公共频道",
            Icon = "⌁",
            Text = "舱壁轻轻震动。广播自行亮起，播放一段从未发送成功的录音：\n\n「这里是零号轨道。如果你听见这段话，说明主脑又开始假装自己是我们了。别相信它的第一句话。也别相信第二句。」",
            Choices = new()
            {
                new EventChoice
                {
                    Text = "解析广播的隐藏层（C 检定，DC 70）",
                    Stat = "C", Dc = 70,
                    SuccessText = "你一层层剥开隐藏层，一串坐标和一张备用心脏的序列号浮了出来。录音走到尽头时，它的主人低低笑了一声。",
                    SuccessMemory = 60, SuccessItem = "t_heart",
                    FailText = "隐藏层猛地反卷，反入侵代码接管了你的义体，替主脑完成了一次例行自检。账单由你支付：10 HP。",
                    FailHp = -10, FailPurge = -1
                },
                new EventChoice
                {
                    Text = "关闭广播",
                    SuccessText = "你按下静音。余音被舱壁尽数吞没，心跳一下一下浮上来——其中藏着一点，不属于你的节拍。",
                    SuccessHp = 8
                }
            }
        });

        V(new EventDef
        {
            Id = "ev3_memorial", Act = 3, Title = "轨道墓园", Subtitle = "零号轨道 · 记忆舱",
            Icon = "◇",
            Text = "记忆舱里，一整面墙的抽屉沉默地排列着，每个抽屉只放一枚名字。大多数名字，已经读不出来了。\n\n你走到墙前。其中有一枚，还亮着。",
            Choices = new()
            {
                new EventChoice
                {
                    Text = "为无名者默哀（E 检定，DC 60）",
                    Stat = "E", Dc = 60,
                    SuccessText = "你在墙前静静站了一会儿。灯光沿着抽屉一盏一盏亮起，像有人在逐个应声：还有人记得。你恢复了一些 HP。",
                    SuccessHp = 25, SuccessMemory = 30,
                    FailText = "太多名字在同一瞬间涌进你的听觉，每一个都要求你记住它。你扶住抽屉边缘，损失 6 HP，追踪 +1。",
                    FailHp = -6, FailPurge = -1
                },
                new EventChoice
                {
                    Text = "取走亮着的那枚名字",
                    SuccessText = "那枚名字在你的掌心慢慢淡去，只留下一块温热的合金。你不知道那是谁。你还是收拢手指，决定先替他保管。",
                    SuccessAlloy = 2, SuccessMemory = 20
                }
            }
        });

        V(new EventDef
        {
            Id = "ev3_passenger", Act = 3, Title = "最后一位乘客", Subtitle = "零号轨道 · 候车厅",
            Icon = "◉",
            Text = "候车厅空得能听见自己的呼吸。整排座位上，只坐着一个人。他的票根写着 2046 年，目的地一栏，是「明天」。\n\n他抬眼看你：「你们，也是来退票的吗？」",
            Choices = new()
            {
                new EventChoice
                {
                    Text = "陪他等下一班车（L 检定，DC 65）",
                    Stat = "L", Dc = 65,
                    SuccessText = "车没有来。你们陪他把这段沉默坐完，随后在长椅下面找到一枚轨道钥匙，和一张手写的「谢谢」。",
                    SuccessItem = "t_orbit_key", SuccessMemory = 30,
                    FailText = "广播宣布：本列车永久停运。乘客顿了顿，又开始重复同一句话，一声比一声高。损失 8 HP。",
                    FailHp = -8, FailPurge = -1
                },
                new EventChoice
                {
                    Text = "告诉他明天已经到站了",
                    SuccessText = "他笑了笑，把票根递给你，随后从座位上消失了。你翻过票根，背面写着一行字：「别让它们替你决定。」",
                    SuccessMemory = 45, SuccessHp = 10
                }
            }
        });

        V(new EventDef
        {
            Id = "ev3_confession", Act = 3, Title = "协议告解室", Subtitle = "零号轨道 · 主脑前厅",
            Icon = "✧",
            Text = "告解室里没有神父，只有一张空椅，和一块已经等候多时的屏幕：\n\n「请陈述你希望被删除的记忆。我们会为你保留一份副本，用于训练。」",
            Choices = new()
            {
                new EventChoice
                {
                    Text = "说出最想删除的记忆（支付 60 记忆币）",
                    CostMemory = 60,
                    SuccessText = "屏幕安静了很久，久到你都没有移开视线。它终于开口：「这份记忆，很珍贵。」副本被原样退还，还附赠了一小段力量。",
                    SuccessHp = 35, SuccessXp = 50
                },
                new EventChoice
                {
                    Text = "黑入告解室（E 检定，DC 70）",
                    Stat = "E", Dc = 70,
                    SuccessText = "你沿着协议的缝隙潜入，听见了主脑的第一次犹豫。在那段短暂的空白里，静静躺着一枚核心和一条备用密钥。",
                    SuccessMemory = 50, SuccessItem = "c_core", SuccessPurge = 1,
                    FailText = "主脑把你的告解剪成了一堂公开课，逐句向全轨道播放。你损失 10 HP，信号强度 +1。",
                    FailHp = -10, FailSignal = 1, FailPurge = -1
                },
                new EventChoice
                {
                    Text = "什么也不说",
                    SuccessText = "你一言不发。屏幕等了片刻，随后逐字删除了自己的提示——替你守住了这个秘密。",
                    SuccessPurge = 1
                }
            }
        });
    }
}
