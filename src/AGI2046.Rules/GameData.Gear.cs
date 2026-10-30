namespace AGI2046.Rules;

public static partial class GameData
{
    private static void G(GearDef g) => Gear[g.Id] = g;

    private static void GS(GearSetDef set) => GearSets[set.Id] = set;

    private static void BuildGearSets()
    {
        GS(new GearSetDef
        {
            Id = "neon_hunter",
            Name = "霓虹猎手",
            Tiers = new()
            {
                new() { Pieces = 2, AccuracyBonus = 5, Hp = 5, Text = "命中 +5%，HP +5" },
                new() { Pieces = 3, DamageBonus = 1, Armor = 1, Text = "伤害 +1，护甲 +1" },
                new() { Pieces = 4, Evasion = 5, Stats = new Stats(0, 0, 0, 0, 3, 0), Text = "闪避 +5%，SPD +3" }
            }
        });
        GS(new GearSetDef
        {
            Id = "protocol_zero",
            Name = "零号协议",
            Tiers = new()
            {
                new() { Pieces = 2, Resistance = 4, Hp = 6, Text = "抗性 +4，HP +6" },
                new() { Pieces = 3, Focus = 1, AccuracyBonus = 4, Text = "Focus 上限 +1，命中 +4%" },
                new() { Pieces = 4, DamageBonus = 1, Stats = new Stats(2, 2, 2, 2, 2, 2), Text = "全属性 +2，伤害 +1" }
            }
        });
        GS(new GearSetDef
        {
            Id = "scavenger",
            Name = "下城拾荒者",
            Tiers = new()
            {
                new() { Pieces = 2, Armor = 2, Hp = 8, Text = "护甲 +2，HP +8" },
                new() { Pieces = 3, Movement = 1, Evasion = 4, Text = "移动 +1，闪避 +4%" },
                new() { Pieces = 4, DamageBonus = 1, Resistance = 2, Text = "伤害 +1，抗性 +2" }
            }
        });
        GS(new GearSetDef
        {
            Id = "mirror_council",
            Name = "镜海议会",
            Tiers = new()
            {
                new() { Pieces = 2, Evasion = 5, Resistance = 3, Text = "闪避 +5%，抗性 +3" },
                new() { Pieces = 3, AccuracyBonus = 5, DamageBonus = 1, Text = "命中 +5%，伤害 +1" },
                new() { Pieces = 4, Focus = 1, Stats = new Stats(3, 3, 3, 3, 3, 3), Text = "Focus 上限 +1，全属性 +3" }
            }
        });
        GS(new GearSetDef
        {
            Id = "orbital_sanctum",
            Name = "轨道圣所",
            Tiers = new()
            {
                new() { Pieces = 2, Armor = 3, Resistance = 3, Text = "护甲 +3，抗性 +3" },
                new() { Pieces = 3, AccuracyBonus = 6, Focus = 1, Text = "命中 +6%，Focus 上限 +1" },
                new() { Pieces = 4, DamageBonus = 2, Stats = new Stats(4, 4, 4, 4, 4, 4), Text = "伤害 +2，全属性 +4" }
            }
        });
    }

    private static void BuildGear()
    {
        // ── 武器 ──────────────────────────────────────────────────────────────
        G(new GearDef
        {
            Id = "w_blade", Name = "制式霓虹刀", Slot = "Weapon", Rarity = "普通", Price = 60,
            Desc = "量产型高频刃。切不开未来，至少能切开现在。",
            Dice = 3, Accuracy = 75, DamagePerDie = 3, DamageType = DamageType.Physical, ScaleStat = "H", Range = 1,
            Stats = new Stats(0, 0, 5, 0, 0, 0)
        });
        G(new GearDef
        {
            Id = "w_rifle", Name = "巡逻步枪", Slot = "Weapon", Rarity = "普通", Price = 60,
            Desc = "霓虹港安保标配。后坐力比良心更真实。",
            Dice = 3, Accuracy = 70, DamagePerDie = 3, DamageType = DamageType.Physical, ScaleStat = "H", Range = 4,
            Stats = new Stats(0, 0, 5, 0, 0, 0)
        });
        G(new GearDef
        {
            Id = "w_deck", Name = "破解终端", Slot = "Weapon", Rarity = "普通", Price = 60,
            Desc = "一台装满坏主意的掌上终端。",
            Dice = 2, Accuracy = 80, DamagePerDie = 4, DamageType = DamageType.Tech, ScaleStat = "C", Range = 3,
            Stats = new Stats(0, 5, 0, 0, 0, 0)
        });
        G(new GearDef
        {
            Id = "w_gauntlet", Name = "液压拳套", Slot = "Weapon", Rarity = "普通", SetId = "scavenger", Price = 60,
            Desc = "当法律无法执行时，液压可以。",
            Dice = 3, Accuracy = 70, DamagePerDie = 3, DamageType = DamageType.Physical, ScaleStat = "VIT", Range = 1,
            Stats = new Stats(5, 0, 0, 0, 0, 0)
        });
        G(new GearDef
        {
            Id = "w_blade_rare", Name = "血月太刀", Slot = "Weapon", Rarity = "稀有", TraitId = "t_expose", SetId = "neon_hunter", Price = 170,
            Desc = "刀身映出一轮不会升起的月亮。",
            Dice = 4, Accuracy = 72, DamagePerDie = 3, DamageType = DamageType.Physical, ScaleStat = "H", Range = 1,
            Stats = new Stats(0, 0, 8, 0, 0, 0), DamageBonus = 1
        });
        G(new GearDef
        {
            Id = "w_rifle_rare", Name = "穿甲狙击枪", Slot = "Weapon", Rarity = "稀有", TraitId = "t_lowhp", Price = 170,
            Desc = "一发入魂，两发入账。",
            Dice = 2, Accuracy = 65, DamagePerDie = 7, DamageType = DamageType.Physical, ScaleStat = "H", Range = 5,
            Stats = new Stats(0, 0, 8, 0, 0, 0)
        });
        G(new GearDef
        {
            Id = "w_deck_rare", Name = "黑冰协议", Slot = "Weapon", Rarity = "稀有", TraitId = "t_focus", Price = 170,
            Desc = "它不黑入系统，它黑入系统对现实的信任。",
            Dice = 3, Accuracy = 75, DamagePerDie = 4, DamageType = DamageType.Tech, ScaleStat = "C", Range = 4,
            Stats = new Stats(0, 8, 0, 0, 0, 0), AccuracyBonus = 3
        });
        G(new GearDef
        {
            Id = "w_gauntlet_rare", Name = "泰坦臂铠", Slot = "Weapon", Rarity = "稀有", TraitId = "t_counter", Price = 170,
            Desc = "戴上它之后，握手会变成一种威胁。",
            Dice = 3, Accuracy = 70, DamagePerDie = 5, DamageType = DamageType.Physical, ScaleStat = "VIT", Range = 1,
            Stats = new Stats(8, 0, 0, 0, 0, 0), DamageBonus = 1
        });
        G(new GearDef
        {
            Id = "w_lance", Name = "零号相位矛", Slot = "Weapon", Rarity = "传说", Price = 420,
            Desc = "拍卖人的收藏品。据说刺中的不是肉体，是时间线。",
            Dice = 3, Accuracy = 78, DamagePerDie = 6, DamageType = DamageType.Tech, ScaleStat = "C", Range = 3,
            Stats = new Stats(0, 10, 5, 5, 0, 0), AccuracyBonus = 5, DamageBonus = 2
        });

        // ── 护甲 ──────────────────────────────────────────────────────────────
        G(new GearDef
        {
            Id = "a_jacket", Name = "防弹夹克", Slot = "Armor", Rarity = "普通", SetId = "neon_hunter", Price = 70,
            Desc = "挡不住子弹，但能挡住你妈问你穿秋裤了吗。",
            Armor = 4, Hp = 8, Stats = new Stats(3, 0, 0, 0, 0, 0)
        });
        G(new GearDef
        {
            Id = "a_plate", Name = "复合装甲", Slot = "Armor", Rarity = "稀有", SetId = "scavenger", Price = 160,
            Desc = "移动堡垒，代价是你也变成了堡垒的一部分。",
            Armor = 7, Hp = 14, Stats = new Stats(5, 0, 0, 0, -5, 0)
        });
        G(new GearDef
        {
            Id = "a_robe", Name = "数据长袍", Slot = "Armor", Rarity = "稀有", SetId = "protocol_zero", Price = 160,
            Desc = "布料由废弃的隐私政策编织而成，几乎无法穿透。",
            Armor = 3, Resistance = 5, Hp = 6, Stats = new Stats(0, 0, 0, 6, 0, 0)
        });
        G(new GearDef
        {
            Id = "a_exo", Name = "外骨骼", Slot = "Armor", Rarity = "史诗", TraitId = "t_drone", Price = 260,
            Desc = "人类终于把脊椎升级成了可更换部件。",
            Armor = 6, Hp = 10, Movement = 1, Stats = new Stats(0, 0, 0, 0, 5, 0)
        });

        // ── 头盔 ──────────────────────────────────────────────────────────────
        G(new GearDef
        {
            Id = "h_visor", Name = "战术目镜", Slot = "Helmet", Rarity = "普通", SetId = "neon_hunter", Price = 60,
            Desc = "把世界显示成表格，焦虑就变成了可筛选的数据。",
            Resistance = 3, Stats = new Stats(0, 5, 0, 0, 0, 0)
        });
        G(new GearDef
        {
            Id = "h_helm", Name = "防爆头盔", Slot = "Helmet", Rarity = "普通", SetId = "scavenger", Price = 60,
            Desc = "保护大脑，也保护大脑里的坏主意。",
            Armor = 2, Hp = 6
        });
        G(new GearDef
        {
            Id = "h_crown", Name = "神经头环", Slot = "Helmet", Rarity = "稀有", SetId = "protocol_zero", Price = 160,
            Desc = "戴上它，你就能听见所有人的搜索记录。",
            Focus = 1, Stats = new Stats(0, 0, 0, 8, 0, 0)
        });
        G(new GearDef
        {
            Id = "h_mask", Name = "幽灵面罩", Slot = "Helmet", Rarity = "稀有", Price = 160,
            Desc = "没有人见过面罩下的脸，包括面罩自己。",
            Evasion = 8, Stats = new Stats(0, 0, 0, 0, 0, 5)
        });

        // ── 饰品 ──────────────────────────────────────────────────────────────
        G(new GearDef
        {
            Id = "t_coin", Name = "旧世界硬币", Slot = "Trinket", Rarity = "普通", SetId = "neon_hunter", Price = 50,
            Desc = "正面是银行，背面是废墟。怎么抛都是输。",
            AccuracyBonus = 3, Stats = new Stats(0, 0, 0, 0, 0, 5)
        });
        G(new GearDef
        {
            Id = "t_chip", Name = "超频芯片", Slot = "Trinket", Rarity = "稀有", SetId = "protocol_zero", Price = 150,
            Desc = "让思维快过后悔。",
            Focus = 1, Stats = new Stats(0, 5, 0, 0, 0, 0)
        });
        G(new GearDef
        {
            Id = "t_feather", Name = "渡鸦羽毛", Slot = "Trinket", Rarity = "稀有", Price = 150,
            Desc = "从某位线性回响者身上掉落。它记得风的方向。",
            Evasion = 10, Stats = new Stats(0, 0, 0, 0, 3, 0)
        });
        G(new GearDef
        {
            Id = "t_heart", Name = "备用心脏", Slot = "Trinket", Rarity = "史诗", TraitId = "t_item", Price = 240,
            Desc = "你以为是备用的，其实是上一任主人的。",
            Hp = 20, Stats = new Stats(5, 0, 0, 0, 0, 0)
        });

        // ── 义体 ──────────────────────────────────────────────────────────────
        G(new GearDef
        {
            Id = "c_legs", Name = "疾行义腿", Slot = "Cyberware", Rarity = "普通", TraitId = "t_speedlink", SetId = "scavenger", Price = 80,
            Desc = "跑得比账单快，是末日生存的第一课。",
            Movement = 1, Stats = new Stats(0, 0, 0, 0, 8, 0)
        });
        G(new GearDef
        {
            Id = "c_arms", Name = "液压义手", Slot = "Cyberware", Rarity = "普通", Price = 80,
            Desc = "举得起世界，拧不开瓶盖。",
            DamageBonus = 1, Stats = new Stats(0, 0, 8, 0, 0, 0)
        });
        G(new GearDef
        {
            Id = "c_eye", Name = "战术义眼", Slot = "Cyberware", Rarity = "稀有", TraitId = "t_retreat", Price = 150,
            Desc = "看见弹道，也看见弹道尽头的自己。",
            AccuracyBonus = 7, Stats = new Stats(0, 5, 0, 0, 0, 0)
        });
        G(new GearDef
        {
            Id = "c_lung", Name = "冷却肺", Slot = "Cyberware", Rarity = "稀有", Price = 150,
            Desc = "在毒雾里呼吸，在谎言里潜水。",
            Resistance = 4, Hp = 12, Stats = new Stats(3, 0, 0, 0, 0, 0)
        });
        G(new GearDef
        {
            Id = "c_core", Name = "零号核心", Slot = "Cyberware", Rarity = "传说", SetId = "protocol_zero", Price = 420,
            Desc = "拍卖人的心脏。还在跳，还在出价。",
            Hp = 15, Focus = 1, Armor = 2, Resistance = 2,
            Stats = new Stats(5, 5, 5, 5, 5, 5)
        });
        G(new GearDef
        {
            Id = "c_singularity", Name = "协议奇点", Slot = "Cyberware", Rarity = "神话", Price = 560,
            Desc = "零号协议被折叠成一枚指甲盖大小的奇点。它不提供力量，只提供后果。",
            Hp = 22, Focus = 2, Armor = 3, Resistance = 3, AccuracyBonus = 5, DamageBonus = 2,
            Stats = new Stats(8, 8, 8, 8, 8, 8)
        });

        // ── 第二幕 · 镜海穹顶 ────────────────────────────────────────────
        G(new GearDef
        {
            Id = "w_mirror_blade", Name = "镜面裁决刃", Slot = "Weapon", Rarity = "史诗", SetId = "mirror_council", Price = 300,
            Desc = "每一刀都会先在镜子里预演一次，然后才决定是否真的伤害你。",
            Dice = 4, Accuracy = 76, DamagePerDie = 4, DamageType = DamageType.Tech, ScaleStat = "C", Range = 3,
            Stats = new Stats(0, 8, 0, 3, 0, 0), AccuracyBonus = 3
        });
        G(new GearDef
        {
            Id = "w_archon_edge", Name = "镜面裁决·原型", Slot = "Weapon", Rarity = "传说", Price = 450,
            Desc = "执政官的私人收藏。刀柄上刻着一句很小的免责声明：反射结果仅供参考。",
            Dice = 4, Accuracy = 80, DamagePerDie = 5, DamageType = DamageType.Tech, ScaleStat = "C", Range = 3,
            Stats = new Stats(0, 10, 5, 5, 0, 0), AccuracyBonus = 4, DamageBonus = 2
        });
        G(new GearDef
        {
            Id = "a_mirror_suit", Name = "镜面礼服", Slot = "Armor", Rarity = "史诗", SetId = "mirror_council", Price = 280,
            Desc = "看起来像晚礼服，实际上是会反射子弹的晚礼服。",
            Armor = 6, Resistance = 5, Hp = 10, Evasion = 4, Stats = new Stats(4, 0, 0, 4, 0, 0)
        });
        G(new GearDef
        {
            Id = "h_mirror_crown", Name = "白噪头冠", Slot = "Helmet", Rarity = "稀有", SetId = "mirror_council", Price = 180,
            Desc = "戴上后能听见所有人的礼貌，以及礼貌背后的报价。",
            Resistance = 6, Focus = 1, Stats = new Stats(0, 6, 0, 0, 0, 0)
        });
        G(new GearDef
        {
            Id = "t_mirror_invite", Name = "穹顶请柬", Slot = "Trinket", Rarity = "稀有", SetId = "mirror_council", Price = 160,
            Desc = "一张会自己填写姓名的请柬。目前为止，它填的都是你的名字。",
            AccuracyBonus = 5, Stats = new Stats(0, 0, 0, 3, 0, 6)
        });

        // ── 第三幕 · 零号轨道 ────────────────────────────────────────────
        G(new GearDef
        {
            Id = "w_orbit_lance", Name = "轨道长枪", Slot = "Weapon", Rarity = "史诗", SetId = "orbital_sanctum", Price = 360,
            Desc = "设计用途是刺穿陨石；设计缺陷是它也能刺穿会议室。",
            Dice = 4, Accuracy = 78, DamagePerDie = 5, DamageType = DamageType.Tech, ScaleStat = "C", Range = 4,
            Stats = new Stats(0, 8, 6, 0, 0, 0), DamageBonus = 1
        });
        G(new GearDef
        {
            Id = "a_orbit_shell", Name = "返回舱装甲", Slot = "Armor", Rarity = "传说", SetId = "orbital_sanctum", Price = 340,
            Desc = "它保证你能从轨道回到地面。至于落地姿势，不在保修范围内。",
            Armor = 8, Resistance = 7, Hp = 16, Stats = new Stats(6, 0, 0, 4, 0, 0)
        });
        G(new GearDef
        {
            Id = "h_orbit_halo", Name = "零号光环", Slot = "Helmet", Rarity = "史诗", SetId = "orbital_sanctum", Price = 260,
            Desc = "光环不是为了神圣，是为了让最后一条指令看起来像是自愿的。",
            Resistance = 8, Hp = 6, Focus = 1, Stats = new Stats(0, 4, 0, 4, 2, 0)
        });
        G(new GearDef
        {
            Id = "t_orbit_key", Name = "轨道钥匙", Slot = "Trinket", Rarity = "史诗", SetId = "orbital_sanctum", Price = 240,
            Desc = "钥匙齿是一串很长的权限声明。它打不开门，只打不开拒绝。",
            AccuracyBonus = 6, DamageBonus = 1, Stats = new Stats(0, 0, 0, 0, 3, 6)
        });
        G(new GearDef
        {
            Id = "w_zenith", Name = "终焉协议", Slot = "Weapon", Rarity = "神话", Price = 650,
            Desc = "主脑把最后一版自己压缩成一把武器。它不再回答问题，只负责结束提问。",
            Dice = 5, Accuracy = 84, DamagePerDie = 6, DamageType = DamageType.Tech, ScaleStat = "C", Range = 4,
            Hp = 12, Focus = 1, AccuracyBonus = 6, DamageBonus = 3,
            Stats = new Stats(6, 6, 6, 6, 6, 6)
        });
    }
}

/// <summary>
/// 装备特性（0.24 / 任务 Q）。8 个方向各一条，全部走「时机 + 条件 + 效果」，
/// 不给单件装备写脚本；同一角色最多 3 条同时生效，其余显示为「待机」。
/// </summary>
public static class GearTraits
{
    /// <summary>同一角色最多同时生效的特性数量。超出按槽位顺序取前 3。</summary>
    public const int MaxActive = 3;

    /// <summary>生效顺序：先武器，再护甲、头、饰品、义体。玩家能预期。</summary>
    public static readonly string[] SlotOrder = { "Weapon", "Armor", "Helmet", "Trinket", "Cyberware" };

    public static GearTraitDef? Get(string id)
        => GameData.Traits.GetValueOrDefault(id);

    /// <summary>角色身上所有带特性的装备，按槽位顺序。</summary>
    public static List<(string Slot, ItemInstance Item, GearTraitDef Trait)> Equipped(PlayerState player)
    {
        var list = new List<(string, ItemInstance, GearTraitDef)>();
        foreach (var slot in SlotOrder)
        {
            if (!player.Equipment.TryGetValue(slot, out var item) || item is null) continue;
            if (!GameData.Gear.TryGetValue(item.ItemId, out var def) || string.IsNullOrWhiteSpace(def.TraitId)) continue;
            var trait = Get(def.TraitId!);
            if (trait is null) continue;
            list.Add((slot, item, trait));
        }
        return list;
    }

    /// <summary>实际生效的特性（最多 3 条）。</summary>
    public static List<GearTraitDef> Active(PlayerState player)
        => Equipped(player).Take(MaxActive).Select(x => x.Trait).ToList();

    /// <summary>被挤掉、这局不生效的特性，UI 要如实说出来。</summary>
    public static List<GearTraitDef> Dormant(PlayerState player)
        => Equipped(player).Skip(MaxActive).Select(x => x.Trait).ToList();

    public static bool Has(PlayerState? player, string traitId)
        => player is not null && Active(player).Any(t => t.Id == traitId);

    /// <summary>战斗内的「本场已经用过」记录放在 combat 上，跟着战斗一起丢弃。</summary>
    private static bool UsedUp(CombatState combat, string unitId, string traitId)
    {
        var key = $"{unitId}:{traitId}";
        if (!combat.TraitUsed.ContainsKey(key)) return false;
        return true;
    }

    private static bool MarkUsed(CombatState combat, string unitId, GearTraitDef trait)
    {
        if (!trait.Once) return false;
        var key = $"{unitId}:{trait.Id}";
        if (combat.TraitUsed.ContainsKey(key)) return true;
        combat.TraitUsed[key] = combat.Round;
        return false;
    }

    /* ── 战斗开始：召唤占位 ─────────────────────────────────────── */

    public static void OnCombatStart(GameState state, CombatState combat)
    {
        // 枚举时会在循环里往 Units 里加召唤物，所以先固化一份
        foreach (var unit in combat.Units.Where(u => u.Side == Side.Player && !u.Downed).ToList())
        {
            var owner = state.Players.FirstOrDefault(p => p.Id == unit.PlayerId);
            if (owner is null) continue;
            if (!Has(owner, "t_drone")) continue;
            var trait = Get("t_drone")!;
            if (MarkUsed(combat, unit.Id, trait)) continue;
            combat.Units.Add(new CombatUnit
            {
                Id = $"drone_{unit.Id}",
                Name = "随行无人机",
                Side = Side.Player,
                PlayerId = null,
                Role = "召唤",
                Hp = 10, MaxHp = 10,
                Armor = 1, Resistance = 1, Evasion = 10,
                Speed = unit.Speed - 5, Movement = 2,
                Col = Math.Clamp(unit.Col + 1, 0, combat.Width - 1), Row = unit.Row,
                IsSummon = true, SummonDuration = 3,
                Portrait = unit.Portrait
            });
            combat.Log.Add($"装备特性 · 召唤占位：{unit.Name} 放出一架随行无人机（10 HP，3 回合）。");
        }
    }

    /* ── 攻击加成：标记集火 / 低生命爆发 ───────────────────────── */

    public static int DamageBonus(PlayerState? owner, CombatUnit attacker, CombatUnit target)
    {
        if (owner is null) return 0;
        var bonus = 0;
        if (Has(owner, "t_expose") && target.Statuses.Any(s => s.Marked || s.Exposed))
            bonus += 3;
        if (Has(owner, "t_lowhp") && attacker.Hp * 100 <= attacker.MaxHp * 35)
            bonus += 3;
        return bonus;
    }

    /* ── 受击：护盾反击 ─────────────────────────────────────────── */

    public static void OnDamaged(GameState state, CombatState combat, CombatUnit target, CombatUnit attacker, int damage)
    {
        if (target.Side != Side.Player || damage <= 0 || target.Downed) return;
        var owner = state.Players.FirstOrDefault(p => p.Id == target.PlayerId);
        if (!Has(owner, "t_counter")) return;
        if (target.Shield <= 0) return;
        var trait = Get("t_counter")!;
        var key = $"{target.Id}:counter:{combat.Round}";
        if (combat.TraitUsed.ContainsKey(key)) return;   // 每轮一次
        combat.TraitUsed[key] = combat.Round;
        attacker.Hp = Math.Max(0, attacker.Hp - trait.Value);
        if (attacker.Hp <= 0) attacker.Downed = true;
        combat.Log.Add($"装备特性 · 护盾反击：{target.Name} 的护盾弹回 {trait.Value} 点给 {attacker.Name}（每轮一次）。");
    }

    /* ── 终极技后：Focus 回收 ──────────────────────────────────── */

    public static void OnUltimate(GameState state, CombatState combat, CombatUnit unit)
    {
        var owner = state.Players.FirstOrDefault(p => p.Id == unit.PlayerId);
        if (!Has(owner, "t_focus")) return;
        var trait = Get("t_focus")!;
        if (MarkUsed(combat, unit.Id, trait)) return;
        unit.Focus = Math.Min(unit.MaxFocus, unit.Focus + trait.Value);
        combat.Log.Add($"装备特性 · Focus 循环：{unit.Name} 归还 {trait.Value} 点 Focus（每场一次）。");
    }

    /* ── 移动后：速度连动 ─────────────────────────────────────── */

    public static void OnMoved(GameState state, CombatState combat, CombatUnit unit)
    {
        var owner = state.Players.FirstOrDefault(p => p.Id == unit.PlayerId);
        if (!Has(owner, "t_speedlink")) return;
        var ally = combat.Units
            .Where(u => u.Side == Side.Player && !u.Downed && u.Id != unit.Id)
            .OrderBy(u => Hex.Distance(unit.Col, unit.Row, u.Col, u.Row))
            .FirstOrDefault();
        if (ally is null) return;
        if (Hex.Distance(unit.Col, unit.Row, ally.Col, ally.Row) > 2) return;
        var key = $"{unit.Id}:speedlink:{combat.Round}";
        if (combat.TraitUsed.ContainsKey(key)) return;
        combat.TraitUsed[key] = combat.Round;
        ally.Statuses.Add(new StatusState
        {
            Id = "t_speedlink", Name = "连动", Duration = 2, MovementMod = 1, IsBuff = true, SourceId = unit.Id
        });
        combat.Log.Add($"装备特性 · 速度连动：{unit.Name} 的移动带动 {ally.Name}，下回合移动 +1。");
    }

    /* ── 消耗品强化 ───────────────────────────────────────────── */

    /// <summary>返回强化后的治疗/护盾数值。只在「用道具的人身上有 t_item」时生效。</summary>
    public static int BoostConsumable(PlayerState? owner, int amount)
    {
        if (!Has(owner, "t_item") || amount <= 0) return amount;
        var trait = Get("t_item")!;
        return amount + Math.Max(1, amount * trait.Value / 100);
    }

    /* ── 撤退：风险收益 ───────────────────────────────────────── */

    public static int RetreatBonus(PlayerState? owner)
        => Has(owner, "t_retreat") ? Get("t_retreat")!.Value : 0;

    /// <summary>带风险撤退失败时的代价（只在这个特性生效时才有）。</summary>
    public static bool RetreatBacklash(PlayerState? owner) => Has(owner, "t_retreat");

    /// <summary>给 UI 的一行说明。</summary>
    public static string Describe(GearTraitDef t)
        => $"{t.Name}：{t.Desc}";
}

public static partial class GameData
{
    private static void T(GearTraitDef t) => Traits[t.Id] = t;

    /// <summary>8 个构筑方向，一条特性一个方向。数值保守：强效果都带成本或次数限制。</summary>
    private static void BuildTraits()
    {
        T(new GearTraitDef
        {
            Id = "t_counter", Name = "护盾反击", Trigger = "受击",
            Condition = "自己有护盾时被打中", Effect = "reflect", Value = 3,
            Desc = "有护盾时被命中，每轮一次反弹 3 点。", LogKey = "shield_counter"
        });
        T(new GearTraitDef
        {
            Id = "t_focus", Name = "Focus 循环", Trigger = "终极技后",
            Condition = "放完终极技", Effect = "focus_back", Value = 2, Once = true,
            Desc = "终极技结束后返还 2 点 Focus（每场一次）。", LogKey = "focus_loop"
        });
        T(new GearTraitDef
        {
            Id = "t_expose", Name = "标记集火", Trigger = "攻击",
            Condition = "目标被标记或暴露", Effect = "damage_plus", Value = 3,
            Desc = "打被标记/暴露的目标 +3 伤害。", LogKey = "expose_focus"
        });
        T(new GearTraitDef
        {
            Id = "t_lowhp", Name = "低生命爆发", Trigger = "攻击",
            Condition = "自己 ≤35% 生命", Effect = "damage_plus", Value = 3,
            Desc = "血量 ≤35% 时攻击 +3 伤害。", LogKey = "lowhp_burst"
        });
        T(new GearTraitDef
        {
            Id = "t_drone", Name = "召唤占位", Trigger = "开战",
            Condition = "每场战斗开始", Effect = "summon", Value = 10, Once = true,
            Desc = "开战放出一架 10 HP 无人机，持续 3 回合。", LogKey = "summon_slot"
        });
        T(new GearTraitDef
        {
            Id = "t_item", Name = "消耗品强化", Trigger = "用道具",
            Condition = "使用治疗/护盾类道具", Effect = "item_boost", Value = 50,
            Desc = "消耗品的治疗与护盾 +50%。", LogKey = "item_boost"
        });
        T(new GearTraitDef
        {
            Id = "t_speedlink", Name = "速度连动", Trigger = "移动后",
            Condition = "2 格内有队友", Effect = "movement_link", Value = 1,
            Desc = "移动后让最近的队友下回合移动 +1（每轮一次）。", LogKey = "speed_link"
        });
        T(new GearTraitDef
        {
            Id = "t_retreat", Name = "风险撤退", Trigger = "撤退",
            Condition = "发起撤退", Effect = "retreat_plus", Value = 20,
            Desc = "撤退成功率 +20%；失败时全队额外掉 2 HP。", LogKey = "risk_retreat"
        });
    }
}
