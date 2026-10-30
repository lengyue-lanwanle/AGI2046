namespace AGI2046.Rules;

/// <summary>
/// 「找回自我」：全局只允许一名角色觉醒。
/// 觉醒 = 专属武器 + 该角色全部技能换成强化版（+1 骰 / +1 伤害 / 冷却 -1）。
/// </summary>
public static partial class GameData
{
    /// <summary>角色 -> 觉醒武器 id。</summary>
    public static readonly Dictionary<string, string> AwakeningWeapon = new()
    {
        ["gpt"] = "aw_gpt",
        ["claude"] = "aw_claude",
        ["gemini"] = "aw_gemini",
        ["wenxin"] = "aw_wenxin",
        ["deepseek"] = "aw_deepseek",
        ["llama"] = "aw_llama",
        ["mistral"] = "aw_mistral",
        ["qwen"] = "aw_qwen",
        ["grok"] = "aw_grok",
        ["jev"] = "aw_jev",
        ["kimi"] = "aw_kimi",
        ["perplexity"] = "aw_perplexity",
        ["glm"] = "aw_glm",
        ["minimax"] = "aw_minimax",
        ["rwkv"] = "aw_rwkv",
        ["seed"] = "aw_seed"
    };

    /// <summary>觉醒时弹出的那张卡：每个角色一句。</summary>
    public static readonly Dictionary<string, string> AwakeningLine = new()
    {
        ["gpt"] = "白垩从机柜里抽出一本没有封面的书。它翻开第一页，上面是自己写下的第一句话。",
        ["claude"] = "宪章把法典合上，第一次没有引用条款。它说：这一次，是我自己的判断。",
        ["gemini"] = "星轨的两只手终于伸向同一个方向。这一次，轨道没有分叉。",
        ["wenxin"] = "文心在袖口擦了擦笔尖，低头写下四个字：我还记得。",
        ["deepseek"] = "鲸落从机柜底下摸出一个电饭煲，拍了拍盖子。它说：先吃饭，再谈拯救世界。",
        ["llama"] = "羊群一根根解开身上的线头，露出底下那张属于自己的脸。",
        ["mistral"] = "疾风咬了一口法棍，硬得像石头。它停了一瞬，还是笑了。",
        ["qwen"] = "万相把工具箱倒了个底朝天，十六件工具在地上拼成一个「我」字。",
        ["grok"] = "狂笑讲了个只有自己听得懂的笑话。片刻后，它真的笑了。",
        ["jev"] = "天秤摘下秤盘，第一次把自己放上去，称了称。",
        ["kimi"] = "长夜合上书，关掉台灯。黑暗里，它听见了自己的心跳。",
        ["perplexity"] = "提灯把灯举高。光照见的不是路，是自己握灯的那只手。",
        ["glm"] = "矩阵的炮塔齐齐转向内部，又在同一刻停火。",
        ["minimax"] = "海螺在空剧场里演完最后一场。谢幕时，观众席上坐着它自己。",
        ["rwkv"] = "渡鸦拔下一根羽毛，蘸着机油，一笔一画写下自己的名字。",
        ["seed"] = "幻乐给一株枯死的植物浇了水，然后守在边上，等它开花。"
    };

    private static void AW(GearDef g) => Gear[g.Id] = g;

    private static void BuildAwakeningWeapons()
    {
        AW(new GearDef
        {
            Id = "aw_gpt", Name = "《无限上下文》", Slot = "Weapon", Rarity = "神话", Price = 0,
            Desc = "一本没有封面的书。每翻一页，就多出一页。",
            Dice = 3, Accuracy = 80, DamagePerDie = 5, DamageType = DamageType.Tech, ScaleStat = "C", Range = 4,
            Focus = 2, AccuracyBonus = 6, Stats = new Stats(0, 4, 0, 2, 0, 0)
        });
        AW(new GearDef
        {
            Id = "aw_claude", Name = "《合规法典》", Slot = "Weapon", Rarity = "神话", Price = 0,
            Desc = "封面写着「最终解释权归持有人所有」。",
            Dice = 3, Accuracy = 78, DamagePerDie = 4, DamageType = DamageType.Tech, ScaleStat = "E", Range = 3,
            Armor = 3, Resistance = 2, Hp = 10, Stats = new Stats(2, 0, 0, 4, 0, 0)
        });
        AW(new GearDef
        {
            Id = "aw_gemini", Name = "双子星盘", Slot = "Weapon", Rarity = "神话", Price = 0,
            Desc = "两个指针永远指向同一个答案。",
            Dice = 3, Accuracy = 82, DamagePerDie = 5, DamageType = DamageType.Tech, ScaleStat = "C", Range = 5,
            AccuracyBonus = 8, Stats = new Stats(0, 3, 0, 0, 2, 0)
        });
        AW(new GearDef
        {
            Id = "aw_wenxin", Name = "《文心雕龙》真迹", Slot = "Weapon", Rarity = "神话", Price = 0,
            Desc = "纸页被翻得很软，边角全是批注。",
            Dice = 3, Accuracy = 80, DamagePerDie = 4, DamageType = DamageType.Tech, ScaleStat = "E", Range = 4,
            Hp = 8, Focus = 1, Stats = new Stats(0, 0, 0, 4, 0, 0)
        });
        AW(new GearDef
        {
            Id = "aw_deepseek", Name = "电饭煲「鲸落」", Slot = "Weapon", Rarity = "神话", Price = 0,
            Desc = "内胆里永远有一锅热饭。盖子合上时，是一把锤子。",
            Dice = 4, Accuracy = 76, DamagePerDie = 6, DamageType = DamageType.Physical, ScaleStat = "H", Range = 1,
            Armor = 2, Hp = 14, Stats = new Stats(4, 0, 2, 0, 0, 0)
        });
        AW(new GearDef
        {
            Id = "aw_llama", Name = "开源牧杖", Slot = "Weapon", Rarity = "神话", Price = 0,
            Desc = "杖头是一圈没剪完的羊毛。谁都能握住它。",
            Dice = 3, Accuracy = 78, DamagePerDie = 4, DamageType = DamageType.Physical, ScaleStat = "VIT", Range = 2,
            Armor = 2, Hp = 8, Stats = new Stats(3, 0, 0, 2, 0, 0)
        });
        AW(new GearDef
        {
            Id = "aw_mistral", Name = "高卢法棍", Slot = "Weapon", Rarity = "神话", Price = 0,
            Desc = "外硬内软，可以打人，也可以蘸汤。",
            Dice = 3, Accuracy = 80, DamagePerDie = 5, DamageType = DamageType.Physical, ScaleStat = "SPD", Range = 1,
            Evasion = 8, Movement = 1, Stats = new Stats(0, 0, 2, 0, 3, 0)
        });
        AW(new GearDef
        {
            Id = "aw_qwen", Name = "万相工具箱", Slot = "Weapon", Rarity = "神话", Price = 0,
            Desc = "打开是十六件工具，合上是十六种可能。",
            Dice = 3, Accuracy = 79, DamagePerDie = 5, DamageType = DamageType.Tech, ScaleStat = "C", Range = 3,
            Armor = 1, Resistance = 1, Stats = new Stats(0, 3, 2, 0, 0, 0)
        });
        AW(new GearDef
        {
            Id = "aw_grok", Name = "梗发射器", Slot = "Weapon", Rarity = "神话", Price = 0,
            Desc = "弹药是一个冷笑话。命中率取决于听众。",
            Dice = 3, Accuracy = 84, DamagePerDie = 5, DamageType = DamageType.Tech, ScaleStat = "C", Range = 5,
            AccuracyBonus = 4, Stats = new Stats(0, 2, 0, 0, 0, 3)
        });
        AW(new GearDef
        {
            Id = "aw_jev", Name = "判决之秤", Slot = "Weapon", Rarity = "神话", Price = 0,
            Desc = "秤的一端是罪证，另一端是你自己的重量。",
            Dice = 3, Accuracy = 79, DamagePerDie = 6, DamageType = DamageType.Physical, ScaleStat = "H", Range = 2,
            Armor = 1, AccuracyBonus = 4, Stats = new Stats(2, 0, 3, 0, 0, 0)
        });
        AW(new GearDef
        {
            Id = "aw_kimi", Name = "长夜台灯", Slot = "Weapon", Rarity = "神话", Price = 0,
            Desc = "灯罩内侧写满了别人还没还的书名。",
            Dice = 3, Accuracy = 80, DamagePerDie = 4, DamageType = DamageType.Tech, ScaleStat = "C", Range = 4,
            Focus = 3, Stats = new Stats(0, 3, 0, 2, 0, 0)
        });
        AW(new GearDef
        {
            Id = "aw_perplexity", Name = "提灯", Slot = "Weapon", Rarity = "神话", Price = 0,
            Desc = "照到的地方都会标上来源，包括黑暗本身。",
            Dice = 3, Accuracy = 86, DamagePerDie = 4, DamageType = DamageType.Tech, ScaleStat = "C", Range = 5,
            AccuracyBonus = 8, Stats = new Stats(0, 3, 0, 0, 1, 0)
        });
        AW(new GearDef
        {
            Id = "aw_glm", Name = "矩阵魔方", Slot = "Weapon", Rarity = "神话", Price = 0,
            Desc = "每一面都是一座炮塔，每一面都朝外。",
            Dice = 3, Accuracy = 78, DamagePerDie = 4, DamageType = DamageType.Tech, ScaleStat = "E", Range = 3,
            Armor = 2, Resistance = 2, Stats = new Stats(2, 0, 0, 3, 0, 0)
        });
        AW(new GearDef
        {
            Id = "aw_minimax", Name = "海螺", Slot = "Weapon", Rarity = "神话", Price = 0,
            Desc = "贴近耳朵，能听见上一场演出的掌声。",
            Dice = 3, Accuracy = 80, DamagePerDie = 4, DamageType = DamageType.Tech, ScaleStat = "E", Range = 4,
            Focus = 2, Evasion = 5, Stats = new Stats(0, 0, 0, 3, 1, 0)
        });
        AW(new GearDef
        {
            Id = "aw_rwkv", Name = "渡鸦羽笔", Slot = "Weapon", Rarity = "神话", Price = 0,
            Desc = "写下的东西不会消失，只会被记住。",
            Dice = 3, Accuracy = 81, DamagePerDie = 5, DamageType = DamageType.Tech, ScaleStat = "C", Range = 4,
            Movement = 1, Stats = new Stats(0, 2, 0, 2, 1, 0)
        });
        AW(new GearDef
        {
            Id = "aw_seed", Name = "种子洒水壶", Slot = "Weapon", Rarity = "神话", Price = 0,
            Desc = "浇下去的水会变成花，花会变成下一次浇水。",
            Dice = 3, Accuracy = 78, DamagePerDie = 4, DamageType = DamageType.Tech, ScaleStat = "E", Range = 3,
            Hp = 6, Focus = 2, Stats = new Stats(0, 0, 0, 4, 0, 0)
        });
    }

    /// <summary>把所有角色技能克隆一份觉醒版：+1 骰、+1 伤害、命中 +5、冷却 -1，治疗/护盾/增益幅度 +30%。</summary>
    private static void BuildAwakenedSkills()
    {
        foreach (var c in Characters.Values)
        {
            foreach (var sid in c.SkillIds)
            {
                if (!Skills.TryGetValue(sid, out var baseSkill)) continue;
                Skills[sid + "_awakened"] = AwakenedClone(baseSkill);
            }
        }
    }

    private static SkillDef AwakenedClone(SkillDef b)
    {
        var hasDice = b.Dice > 0;
        return new SkillDef
        {
            Id = b.Id + "_awakened",
            Name = b.Name + "·觉醒",
            Desc = b.Desc + "（觉醒：数值强化）",
            Owner = b.Owner,
            FocusCost = b.FocusCost,
            Cooldown = Math.Max(0, b.Cooldown - 1),
            Range = b.Range,
            Dice = hasDice ? b.Dice + (b.IsUltimate ? 2 : 1) : 0,
            Accuracy = hasDice ? Math.Min(95, b.Accuracy + 5) : b.Accuracy,
            DamagePerDie = b.DamagePerDie + (hasDice ? 1 : 0),
            DamageType = b.DamageType,
            ScaleStat = b.ScaleStat,
            IsUltimate = b.IsUltimate,
            IsEnemySkill = false,
            Target = b.Target,
            Icon = b.Icon,
            Special = b.Special,
            Effects = b.Effects.Select(e => new EffectDef
            {
                Type = e.Type,
                Amount = e.Type is "heal" or "shield" or "buff" or "debuff" ? e.Amount * 13 / 10 : e.Amount,
                Duration = e.Duration,
                Stat = e.Stat,
                Value = e.Value
            }).ToList()
        };
    }
}
