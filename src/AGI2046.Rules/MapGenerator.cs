namespace AGI2046.Rules;

/// <summary>地图规模与节奏常量。改这里就能调整单局长度。</summary>
public static class MapProfile
{
    public const int Layers = 17;
    public const int Lanes = 5;
    public const int NodeWidth = 150;
    public const int NodeHeight = 110;
    public const int CanvasWidth = 2820;
    public const int CanvasHeight = 560;
    public const double PurgePerLayer = 2.5;
    public static int PurgeMax => (int)Math.Round(Layers * PurgePerLayer);
}

public static class MapGenerator
{
    private static readonly Dictionary<NodeType, string[]> Names = new()
    {
        [NodeType.Event] = new[] { "黑市记忆摊", "义体诊所", "旧网裂缝", "无人广告牌", "猫巷", "遗物博物馆" },
        [NodeType.Combat] = new[] { "巡逻哨卡", "无人机巢", "黑客据点", "蜂群管道", "废弃地铁" },
        [NodeType.Skirmish] = new[] { "巡逻残部", "拾荒小队", "自动哨戒", "断线清扫机", "散落的保安机" },
        [NodeType.Elite] = new[] { "拍卖人前厅", "重装检查站", "精英猎杀队" },
        [NodeType.Shop] = new[] { "黑市终端", "军火自动贩卖机", "义体跳蚤市场" },
        [NodeType.Safehouse] = new[] { "零号安全屋", "旧教堂避难所", "地下车库营地" },
        [NodeType.Terminal] = new[] { "旧网终端", "城市记忆库", "废弃数据中心" },
        [NodeType.Treasure] = new[] { "数据宝库", "记忆保险箱", "拍卖品仓库" },
        [NodeType.Trap] = new[] { "松动的电缆", "压力板", "锈死的闸门", "断裂的格栅", "漏电的水洼" },
        [NodeType.Corpse] = new[] { "前人的遗骸", "蜷缩的背包", "半截义体", "无人认领的骨灰盒" },
        [NodeType.Server] = new[] { "废弃服务器" },
        [NodeType.Awakening] = new[] { "自我残响" },
        [NodeType.Echo] = new[] { "残响" },
        [NodeType.KeyElite] = new[] { "密钥看守者" },
        [NodeType.Key] = new[] { "王冠密钥" },
        [NodeType.Boss] = new[] { "拍卖人·终局" }
    };

    private static readonly Dictionary<NodeType, string[]> Act2Names = new()
    {
        [NodeType.Event] = new[] { "镜面失物招领", "白噪教堂", "永生订阅中心", "镜海宴会厅", "玻璃雨巷", "上层档案馆" },
        [NodeType.Combat] = new[] { "镜面巡逻线", "审计官哨塔", "礼宾机通道", "静默电梯井", "穹顶检修口" },
        [NodeType.Skirmish] = new[] { "礼宾机小队", "镜面碎片群", "失物招领巡警", "白噪残响" },
        [NodeType.Elite] = new[] { "执政官仪仗队", "白噪审判庭", "镜面猎杀者" },
        [NodeType.Shop] = new[] { "穹顶黑市", "香槟自动贩卖机", "记忆免税店" },
        [NodeType.Safehouse] = new[] { "镜海安全屋", "无窗休息舱", "白噪避难所" },
        [NodeType.Terminal] = new[] { "穹顶主控台", "镜海数据库", "天气控制终端" },
        [NodeType.Treasure] = new[] { "穹顶保险库", "拍卖品冷藏仓", "镜面宝库" },
        [NodeType.Trap] = new[] { "镜像错位", "无声的礼宾地毯", "倒置的走廊", "碎镜地带" },
        [NodeType.Corpse] = new[] { "没被邀请的宾客", "镜前的遗骸", "被退回的礼物" },
        [NodeType.Server] = new[] { "废弃服务器" },
        [NodeType.Awakening] = new[] { "自我残响" },
        [NodeType.Echo] = new[] { "残响" },
        [NodeType.KeyElite] = new[] { "穹顶密钥看守" },
        [NodeType.Key] = new[] { "穹顶权限密钥" },
        [NodeType.Boss] = new[] { "镜面执政官·终局" }
    };

    private static readonly Dictionary<NodeType, string[]> Act3Names = new()
    {
        [NodeType.Event] = new[] { "零号候车厅", "最后一位乘客", "轨道墓园", "协议告解室", "黑匣子广播", "太阳坠落处" },
        [NodeType.Combat] = new[] { "协议执剑者", "轨道守卫线", "记忆猎犬窝", "零号余烬", "失重走廊" },
        [NodeType.Skirmish] = new[] { "零号巡逻机", "失重拾荒者", "协议残片", "冷却失败的守卫" },
        [NodeType.Elite] = new[] { "主脑禁卫", "终焉审计组", "零号执刑者" },
        [NodeType.Shop] = new[] { "轨道黑市", "最后一台贩卖机", "失重免税店" },
        [NodeType.Safehouse] = new[] { "轨道休眠舱", "零号安全屋", "返回舱营地" },
        [NodeType.Terminal] = new[] { "主脑接口", "零号黑匣子", "轨道主控" },
        [NodeType.Treasure] = new[] { "协议圣物库", "太阳遗物箱", "零号金库" },
        [NodeType.Trap] = new[] { "失压的舱门", "零重力陷阱", "灼热的散热口", "断裂的轨道" },
        [NodeType.Corpse] = new[] { "上一批访客", "轨道里的遗骸", "没等到日出的乘客" },
        [NodeType.Server] = new[] { "废弃服务器" },
        [NodeType.Awakening] = new[] { "自我残响" },
        [NodeType.Echo] = new[] { "残响" },
        [NodeType.KeyElite] = new[] { "核心密钥看守" },
        [NodeType.Key] = new[] { "零号核心密钥" },
        [NodeType.Boss] = new[] { "零号协议·主脑" }
    };

    private static readonly Dictionary<NodeType, string> Descs = new()
    {
        [NodeType.Event] = "一段未标记的遭遇。选择会留下痕迹。",
        [NodeType.Combat] = "敌对信号密集。清除后可获得记忆币与装备。",
        [NodeType.Skirmish] = "零散的敌对单位。规模不大，适合练手。",
        [NodeType.Elite] = "高强度敌对信号。掉落更好，代价也更高。",
        [NodeType.Shop] = "用记忆币交换装备与补给。黑市不提供售后。",
        [NodeType.Safehouse] = "可以休息、强化装备、复活倒下的同伴。",
        [NodeType.Terminal] = "接入旧网，揭示地图并获得记忆币。",
        [NodeType.Treasure] = "一个上锁的数据宝库。里面有好东西。",
        [NodeType.Trap] = "一块不太对劲的地面。踩上去会疼。",
        [NodeType.Corpse] = "有人比你们先到，并且没能走出去。",
        [NodeType.Server] = "一台还在待机的旧服务器。里面存着某人的一部分。",
        [NodeType.Awakening] = "一段还没被删干净的回声。它记得自己是谁，也想让你记起来。",
        [NodeType.Echo] = "一段还没散的回声。它有一件没做完的事，想交给路过的人。",
        [NodeType.KeyElite] = "一名守着密钥碎片的精英。它不会让路。",
        [NodeType.Key] = "打开终局大门的唯一钥匙。",
        [NodeType.Boss] = "零号协议的最终拍卖场。",
        [NodeType.Blank] = "什么也没有。城市在这里留了一块空白。"
    };

    /// <summary>固定服务器表：layer, lane, kind。三幕共用层位，道按幕轮换。</summary>
    private static readonly (int Layer, int Lane, string Kind)[] ServerSlots =
    {
        (3, 1, "vit"), (5, 3, "heal"), (7, 3, "c"), (9, 0, "h"),
        (11, 2, "focus"), (12, 4, "e"), (14, 2, "spd"), (16, 4, "xp"), (17, 1, "l")
    };

    /// <summary>碎片精英：1/3、2/3、近末端，三条不同道。</summary>
    private static readonly (int Layer, int Lane)[] KeyEliteSlots = { (6, 0), (12, 2), (15, 4) };

    private static readonly (int Layer, int Lane)[] SafehouseSlots = { (3, 3), (5, 0), (9, 1), (11, 1), (14, 4) };
    private static readonly (int Layer, int Lane)[] ShopSlots = { (2, 2), (6, 3), (9, 4), (13, 1), (17, 3) };
    private static readonly (int Layer, int Lane)[] TreasureSlots = { (4, 2), (10, 0), (16, 2) };
    private static readonly (int Layer, int Lane)[] BlankSlots = { (2, 4), (6, 1), (10, 3) };
    /// <summary>残响节点：每幕两个固定层位（第 4 层与第 13 层），道按幕轮换。</summary>
    private static readonly (int Layer, int Lane)[] EchoSlots = { (4, 0), (13, 4) };
    /// <summary>「找回自我」节点：每幕一个，固定第 9 层第 3 道。</summary>
    // 每幕两个觉醒节点：0.15 起「每个角色各能觉醒一次」，4 人队需要在一幕里找到 2 个、下一幕再找 2 个。
    // 只放 1 个的话，"每人一次"这条规则等于没写。
    private static readonly (int Layer, int Lane)[] AwakenSlots = { (9, 3), (7, 2) };
    private const int EliteLayer = 10, EliteLane = 1;
    private const int TerminalLayer = 8, TerminalLane = 4;

    public static (List<NodeState> nodes, List<EdgeState> edges) Generate(int seed, int act = 1, bool firstRun = false)
    {
        var rng = new Random(seed ^ 0x2046 ^ ((act - 1) * 0x9e37));
        var actDef = GameData.Acts.TryGetValue(act, out var found) ? found : GameData.Acts[1];
        var names = act switch { 2 => Act2Names, 3 => Act3Names, _ => Names };
        var nodes = new List<NodeState>();
        var edges = new List<EdgeState>();
        var laneShift = (act - 1) * 2 % MapProfile.Lanes;

        NodeState Make(string id, NodeType type, int layer, int lane, string? name = null)
        {
            var pool = names.TryGetValue(type, out var poolNames) ? poolNames : new[] { "未知节点" };
            return new NodeState
            {
                Id = id,
                Type = type,
                Layer = layer,
                Lane = lane,
                Name = name ?? pool[rng.Next(pool.Length)],
                District = act switch
                {
                    2 => layer <= 5 ? "镜海 · 外环" : layer <= 11 ? "镜海 · 穹顶" : "镜海 · 执政官厅",
                    3 => layer <= 5 ? "零号轨道 · 外舱" : layer <= 11 ? "零号轨道 · 主控层" : "零号轨道 · 协议核心",
                    _ => layer switch
                    {
                        <= 5 => "霓虹港 · 下城区",
                        <= 11 => "霓虹港 · 数据中层",
                        _ => "零号拍卖场"
                    }
                },
                Desc = Descs.TryGetValue(type, out var d) ? d : "",
                X = 60 + layer * MapProfile.NodeWidth + WobbleX(seed, layer) + WobbleLaneX(seed, layer, lane),
                Y = 70 + lane * MapProfile.NodeHeight + WobbleY(seed, layer, lane),
                Revealed = false,
                Cleared = false,
                Visited = false
            };
        }

        var start = Make("start", NodeType.Start, 0, 1, actDef.StartName);
        start.Desc = actDef.StartDesc;
        start.Revealed = true;
        start.Visited = true;
        start.Cleared = true;
        nodes.Add(start);

        // ── 固定布局：碎片精英 / 服务器 / 商店 / 安全屋 / 宝库 / 精英 / 终端 / 空地 ──
        var fixedCells = new Dictionary<(int, int), NodeType>();
        foreach (var (layer, lane) in KeyEliteSlots) fixedCells[(layer, (lane + laneShift) % MapProfile.Lanes)] = NodeType.KeyElite;
        foreach (var (layer, lane) in SafehouseSlots) fixedCells[(layer, (lane + laneShift) % MapProfile.Lanes)] = NodeType.Safehouse;
        foreach (var (layer, lane) in ShopSlots) fixedCells[(layer, (lane + laneShift) % MapProfile.Lanes)] = NodeType.Shop;
        foreach (var (layer, lane) in TreasureSlots) fixedCells[(layer, (lane + laneShift) % MapProfile.Lanes)] = NodeType.Treasure;
        foreach (var (layer, lane) in BlankSlots) fixedCells[(layer, (lane + laneShift) % MapProfile.Lanes)] = NodeType.Blank;
        foreach (var (layer, lane) in AwakenSlots) fixedCells[(layer, (lane + laneShift) % MapProfile.Lanes)] = NodeType.Awakening;
        fixedCells[(EliteLayer, (EliteLane + laneShift) % MapProfile.Lanes)] = NodeType.Elite;
        fixedCells[(TerminalLayer, (TerminalLane + laneShift) % MapProfile.Lanes)] = NodeType.Terminal;

        var echoSlotByCell = new Dictionary<(int, int), int>();
        for (var i = 0; i < EchoSlots.Length; i++)
        {
            var cell = (EchoSlots[i].Layer, (EchoSlots[i].Lane + laneShift) % MapProfile.Lanes);
            fixedCells[cell] = NodeType.Echo;
            echoSlotByCell[cell] = i;
        }

        var serverByCell = new Dictionary<(int, int), string>();
        foreach (var (layer, lane, kind) in ServerSlots)
        {
            var cell = (layer, (lane + laneShift) % MapProfile.Lanes);
            fixedCells[cell] = NodeType.Server;
            serverByCell[cell] = kind;
        }

        // ── 剩余格子按配额填充（确定性洗牌，同一幕每次一致）──
        var freeCells = new List<(int Layer, int Lane)>();
        for (var layer = 1; layer <= MapProfile.Layers; layer++)
            for (var lane = 0; lane < MapProfile.Lanes; lane++)
                if (!fixedCells.ContainsKey((layer, lane)))
                    freeCells.Add((layer, lane));

        var bucket = new List<NodeType>();
        void Add(NodeType t, int n) { for (var i = 0; i < n; i++) bucket.Add(t); }
        // 18 层地图里固定槽位多放了一个觉醒节点（每幕 2 个，见 AwakenSlots），
        // 从最容易替换的小战斗里扣 1 个，总节点数保持不变。
        Add(NodeType.Skirmish, 19);
        Add(NodeType.Event, 9);
        Add(NodeType.Corpse, 8);
        Add(NodeType.Trap, 8);
        Add(NodeType.Combat, 7);
        if (bucket.Count != freeCells.Count)
            throw new InvalidOperationException($"地图配额不匹配：{bucket.Count} 个节点 vs {freeCells.Count} 个空位");

        Shuffle(bucket, rng);
        Shuffle(freeCells, rng);
        var assigned = new Dictionary<(int, int), NodeType>();
        for (var i = 0; i < freeCells.Count; i++) assigned[freeCells[i]] = bucket[i];

        // 新手首局：只调「哪些格子放什么」，不动配额本身——
        // 每种节点的总数不变，老玩家标准局和既有配额测试都不受影响。
        if (firstRun && act == 1) ApplyFirstRunPacing(assigned);

        var eventIds = GameData.Events.Values.Where(e => e.Act == act).Select(e => e.Id).OrderBy(x => x).ToList();
        if (eventIds.Count == 0) eventIds = GameData.Events.Keys.OrderBy(x => x).ToList();

        for (var layer = 1; layer <= MapProfile.Layers; layer++)
        {
            for (var lane = 0; lane < MapProfile.Lanes; lane++)
            {
                var cell = (layer, lane);
                NodeType type;
                if (fixedCells.TryGetValue(cell, out var fixedType)) type = fixedType;
                else if (assigned.TryGetValue(cell, out var freeType)) type = freeType;
                else continue;

                var node = Make($"n{layer}{lane}", type, layer, lane);
                switch (type)
                {
                    case NodeType.Event:
                        node.EventId = eventIds[rng.Next(eventIds.Count)];
                        break;
                    case NodeType.Skirmish:
                        node.EnemyGroup = SkirmishGroups(act)[rng.Next(SkirmishGroups(act).Length)];
                        break;
                    case NodeType.Combat:
                        node.EnemyGroup = CombatGroups(act)[rng.Next(CombatGroups(act).Length)];
                        break;
                    case NodeType.Elite:
                        node.EnemyGroup = act switch { 2 => "g_elite2", 3 => "g_elite3", _ => "g_elite" };
                        break;
                    case NodeType.KeyElite:
                        node.EnemyGroup = act switch { 2 => "g_elite2", 3 => "g_elite3", _ => "g_elite" };
                        break;
                    case NodeType.Treasure:
                        var loot = act switch
                        {
                            2 => new[] { "t_mirror_invite", "h_mirror_crown", "a_mirror_suit", "w_mirror_blade", "c_core", "c_singularity" },
                            3 => new[] { "t_orbit_key", "h_orbit_halo", "a_orbit_shell", "w_orbit_lance", "c_core", "c_singularity" },
                            _ => new[] { "t_chip", "t_feather", "t_heart", "c_legs", "c_eye", "w_blade_rare", "w_deck_rare", "w_rifle_rare", "c_singularity" }
                        };
                        node.LootItem = loot[rng.Next(loot.Length)];
                        break;
                    case NodeType.Server:
                        node.ServerKind = serverByCell.TryGetValue(cell, out var kind) ? kind : "vit";
                        node.Name = ServerName(node.ServerKind);
                        node.Revealed = true; // 服务器是地标：开局可见，便于规划路线
                        break;
                    case NodeType.Echo:
                        var echoSlot = echoSlotByCell.TryGetValue(cell, out var esi) ? esi : 0;
                        var echoQuest = GameData.QuestForAct(act, echoSlot, seed);
                        node.QuestId = echoQuest?.Id;
                        node.Revealed = true; // 残响也是地标：开局可见
                        break;
                    case NodeType.Awakening:
                        node.Revealed = true; // 觉醒节点是地标：开局可见，便于规划路线
                        break;
                }
                nodes.Add(node);
            }
        }

        var boss = Make("boss", NodeType.Boss, MapProfile.Layers + 1, 2, actDef.BossName);
        boss.X = 60 + (MapProfile.Layers + 1) * MapProfile.NodeWidth;
        boss.Y = 290;
        boss.EnemyGroup = actDef.BossGroup;
        boss.Desc = act switch
        {
            2 => "镜海穹顶的最高层。每一面镜子都替执政官看着你。",
            3 => "零号协议的最后一间会议室。桌上只有一把椅子。",
            _ => "零号协议的最终拍卖场。"
        };
        nodes.Add(boss);

        void Connect(string from, string to)
        {
            if (from == to) return;
            if (edges.Any(e => e.From == from && e.To == to)) return;
            edges.Add(new EdgeState { From = from, To = to });
            var fn = nodes.First(n => n.Id == from);
            var tn = nodes.First(n => n.Id == to);
            if (!fn.Neighbors.Contains(to)) fn.Neighbors.Add(to);
            if (!tn.Neighbors.Contains(from)) tn.Neighbors.Add(from);
        }

        for (var lane = 0; lane < MapProfile.Lanes; lane++) Connect("start", $"n1{lane}");

        for (var layer = 1; layer < MapProfile.Layers; layer++)
        {
            for (var lane = 0; lane < MapProfile.Lanes; lane++)
            {
                var from = $"n{layer}{lane}";
                var low = Math.Max(0, lane - 1);
                var high = Math.Min(MapProfile.Lanes - 1, lane + 1);
                for (var targetLane = low; targetLane <= high; targetLane++)
                    Connect(from, $"n{layer + 1}{targetLane}");
            }
        }

        for (var lane = 0; lane < MapProfile.Lanes; lane++) Connect($"n{MapProfile.Layers}{lane}", "boss");

        // ── 空白支路：8 个叶子，只挂旁白，不参与主路线 ──
        var leafParents = new[] { "n22", "n41", "n64", "n81", "n103", "n122", "n141", "n163" };
        var flavorPool = Narrative.BlankFlavor.TryGetValue(act, out var fp) ? fp : Narrative.BlankFlavor[1];
        var blankNamePool = Narrative.BlankNames.TryGetValue(act, out var bp) ? bp : Narrative.BlankNames[1];
        var shuffledFlavor = flavorPool.OrderBy(_ => rng.Next()).ToList();
        var flavorIndex = 0;
        var nameIndex = rng.Next(blankNamePool.Length);
        var spotIndex = 0;
        foreach (var parent in leafParents)
        {
            var host = nodes.FirstOrDefault(n => n.Id == parent);
            if (host is null) continue;
            var blank = Make($"x{spotIndex + 1}", NodeType.Blank, host.Layer, host.Lane, blankNamePool[nameIndex % blankNamePool.Length]);
            blank.X = host.X + 70;
            blank.Y = Math.Clamp(host.Y + (spotIndex % 2 == 0 ? -55 : 55), 60, 520);
            blank.Flavor = shuffledFlavor[flavorIndex % shuffledFlavor.Count];
            blank.Desc = Descs[NodeType.Blank];
            blank.Cleared = true;
            nodes.Add(blank);
            Connect(parent, blank.Id);
            flavorIndex++;
            nameIndex++;
            spotIndex++;
        }

        // 网格空地的旁白：按层段取，尽量不重复
        var blanks = nodes.Where(n => n.Type == NodeType.Blank).OrderBy(n => n.Layer).ThenBy(n => n.Lane).ToList();
        var banded = blanks.Select(n => FlavorForLayer(act, n.Layer, rng)).ToList();
        for (var i = 0; i < blanks.Count; i++)
        {
            blanks[i].Flavor = banded[i];
            blanks[i].Desc = Descs[NodeType.Blank];
        }

        foreach (var neighbor in start.Neighbors)
        {
            var n = nodes.FirstOrDefault(x => x.Id == neighbor);
            if (n is not null) n.Revealed = true;
        }

        return (nodes, edges);
    }

    private static void Shuffle<T>(IList<T> list, Random rng)
    {
        for (var i = list.Count - 1; i > 0; i--)
        {
            var j = rng.Next(i + 1);
            (list[i], list[j]) = (list[j], list[i]);
        }
    }

    /// <summary>
    /// 新手首局节奏：前两层只出现「看得懂」的节点。
    ///   · 第 1 层：全是小战斗 / 普通战斗 —— 玩家第一件事就是学会「进战斗」；
    ///   · 第 2 层：不出陷阱；商店固定在第 2 层，正好教「补给」；
    ///   · 第 3 层：至少一个事件 —— 教「选择会留下痕迹」。
    /// 实现方式是**交换两个自由格子的类型**，所以每种节点的总数一分不差。
    /// </summary>
    private static void ApplyFirstRunPacing(Dictionary<(int, int), NodeType> assigned)
    {
        var cells = assigned.Keys.OrderBy(c => c.Item1).ThenBy(c => c.Item2).ToList();
        // 只从第 4 层之后借节点：前几层要保持教学节奏，不能被换回去
        var donors = cells.Where(c => c.Item1 >= 4).ToList();

        bool SwapTo((int Layer, int Lane) cell, Func<NodeType, bool> good, params NodeType[] prefer)
        {
            if (good(assigned[cell])) return true;
            foreach (var want in prefer)
            {
                var donor = donors.FirstOrDefault(c => assigned[c] == want);
                if (donor == default) continue;
                (assigned[cell], assigned[donor]) = (assigned[donor], assigned[cell]);
                return true;
            }
            return false;
        }

        foreach (var cell in cells.Where(c => c.Item1 == 1))
            SwapTo(cell, t => t is NodeType.Skirmish or NodeType.Combat, NodeType.Skirmish, NodeType.Combat);

        foreach (var cell in cells.Where(c => c.Item1 == 2))
            SwapTo(cell, t => t is not (NodeType.Trap or NodeType.Elite or NodeType.KeyElite),
                NodeType.Skirmish, NodeType.Combat, NodeType.Corpse);

        // 第 3 层保证有一个事件：第一次「选择」要来得早，但不能挤掉固定槽位
        var layer3 = cells.Where(c => c.Item1 == 3).ToList();
        if (layer3.Count > 0 && layer3.All(c => assigned[c] != NodeType.Event))
            SwapTo(layer3[0], t => t == NodeType.Event, NodeType.Event);
    }

    private static string[] SkirmishGroups(int act) => act switch
    {
        2 => new[] { "g_skim_mirror", "g_skim_usher" },
        3 => new[] { "g_skim_orbit", "g_skim_ember" },
        _ => new[] { "g_skim_patrol", "g_skim_swarm", "g_skim_hack" }
    };

    private static string[] CombatGroups(int act) => act switch
    {
        2 => new[] { "g_mirror", "g_audit", "g_choir", "g_usher", "g_guard2" },
        3 => new[] { "g_protocol", "g_orbit", "g_hound3", "g_ember", "g_seraph" },
        _ => new[] { "g_patrol", "g_hack", "g_swarm", "g_medic", "g_sniper" }
    };

    /// <summary>层间横向蜿蜒（整层统一的正弦波 + 小幅抖动），让地图不是一条直尺。</summary>
    private static int WobbleX(int seed, int layer)
    {
        var wave = (int)(System.Math.Sin(layer * 0.62) * 32);
        return wave + System.Math.Abs(Stable.Hash($"wx{seed}:{layer}")) % 13 - 6;
    }

    /// <summary>道间错落，让同一层五个节点不排成一条水平线。</summary>
    /// <summary>同层内每道再错开一点，避免五个节点排成一条竖线。</summary>
    private static int WobbleLaneX(int seed, int layer, int lane)
    {
        return System.Math.Abs(Stable.Hash($"lx{seed}:{layer}:{lane}")) % 25 - 12;
    }

    private static int WobbleY(int seed, int layer, int lane)
    {
        var wave = (int)(System.Math.Sin(layer * 0.45 + lane * 1.15) * 18);
        return wave + System.Math.Abs(Stable.Hash($"wy{seed}:{layer}:{lane}")) % 13 - 6;
    }

    public static string ServerName(string kind) => kind switch
    {
        "vit" => "生体服务器",
        "c" => "运算服务器",
        "h" => "火控服务器",
        "e" => "引擎服务器",
        "spd" => "调度服务器",
        "l" => "概率服务器",
        "heal" => "医疗服务器",
        "focus" => "冷却服务器",
        "xp" => "日志服务器",
        _ => "废弃服务器"
    };

    private static string FlavorForLayer(int act, int layer, Random rng)
    {
        var pool = Narrative.BlankFlavor.TryGetValue(act, out var fp) ? fp : Narrative.BlankFlavor[1];
        var band = layer <= 5 ? 0 : layer <= 11 ? 1 : 2;
        var slice = pool.Skip(band * (pool.Length / 3)).Take(Math.Max(1, pool.Length / 3)).ToArray();
        if (slice.Length == 0) slice = pool;
        return slice[rng.Next(slice.Length)];
    }
}
