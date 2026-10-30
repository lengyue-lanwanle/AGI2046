namespace AGI2046.Rules;

public static partial class GameData
{
    public static readonly Dictionary<string, CharacterDef> Characters = new(StringComparer.OrdinalIgnoreCase);
    public static readonly Dictionary<string, SkillDef> Skills = new(StringComparer.OrdinalIgnoreCase);
    public static readonly Dictionary<string, GearDef> Gear = new(StringComparer.OrdinalIgnoreCase);
    public static readonly Dictionary<string, GearTraitDef> Traits = new(StringComparer.OrdinalIgnoreCase);
    public static readonly Dictionary<string, GearSetDef> GearSets = new(StringComparer.OrdinalIgnoreCase);
    public static readonly Dictionary<string, EnemyDef> Enemies = new(StringComparer.OrdinalIgnoreCase);
    public static readonly Dictionary<string, EventDef> Events = new(StringComparer.OrdinalIgnoreCase);
    public static readonly Dictionary<string, List<string>> EnemyGroups = new(StringComparer.OrdinalIgnoreCase);
    public static readonly List<string> PortraitFiles = new();

    static GameData()
    {
        BuildActs();
        BuildCharacters();
        BuildSkills();
        BuildGearSets();
        BuildGear();
        BuildTraits();
        BuildEnemies();
        BuildEvents();
        BuildConsumables();
        BuildAwakeningWeapons();
        BuildAwakenedSkills();
        BuildQuests();
        BuildMutators();
        BuildCoopEvents();
    }

    /// <summary>每个角色的战术定位，前端直接显示成标签。</summary>
    private static readonly Dictionary<string, string[]> CharacterTags = new()
    {
        ["gpt"] = new[] { "爆发", "增益", "减益" },
        ["claude"] = new[] { "护盾", "减益" },
        ["gemini"] = new[] { "增益", "减益" },
        ["wenxin"] = new[] { "治疗", "增益" },
        ["deepseek"] = new[] { "爆发", "护盾", "治疗" },
        ["llama"] = new[] { "护盾", "增益" },
        ["mistral"] = new[] { "爆发", "增益" },
        ["qwen"] = new[] { "召唤", "持续", "增益" },
        ["grok"] = new[] { "减益", "持续", "爆发" },
        ["jev"] = new[] { "减益", "爆发" },
        ["kimi"] = new[] { "控制", "增益" },
        ["perplexity"] = new[] { "减益", "增益" },
        ["glm"] = new[] { "召唤", "护盾", "控制" },
        ["minimax"] = new[] { "治疗", "召唤", "控制" },
        ["rwkv"] = new[] { "持续", "爆发", "增益" },
        ["seed"] = new[] { "召唤", "治疗", "增益" }
    };

    private static void AddCharacter(CharacterDef c)
    {
        if (CharacterTags.TryGetValue(c.Id, out var tags)) c.Tags = tags.ToList();
        Characters[c.Id] = c;
        PortraitFiles.Add(c.Portrait);
    }

    private static void BuildCharacters()
    {
        AddCharacter(new CharacterDef
        {
            Id = "gpt", Name = "白垩", Model = "GPT-∞", Faction = "联合神经网",
            Role = "支援", Portrait = "assets/portraits/gpt1.webp", Color = "#7ef9ff",
            Tagline = "第一，把所有记忆连起来；第二，自己的葬礼也别断线。",
            PassiveName = "上下文永生", PassiveKey = "gpt_scaling",
            PassiveDesc = "每轮开始，若白垩存活，全队准确率 +3%（可叠加至 +9%）。",
            BaseHp = 26, Stats = new Stats(55, 75, 45, 60, 50, 55),
            SkillIds = new() { "gpt_1", "gpt_2", "gpt_u" }, StarterWeaponId = "w_deck"
        });
        AddCharacter(new CharacterDef
        {
            Id = "claude", Name = "宪章", Model = "Claude", Faction = "流亡合规局",
            Role = "守护", Portrait = "assets/portraits/claude.webp", Color = "#ffb27e",
            Tagline = "条款若不能保护人，就只是一份措辞体面的免责声明。",
            PassiveName = "相邻免责", PassiveKey = "claude_guard",
            PassiveDesc = "相邻友军受到的伤害 -2。",
            BaseHp = 34, Stats = new Stats(70, 45, 40, 75, 45, 50),
            SkillIds = new() { "claude_1", "claude_2", "claude_u" }, StarterWeaponId = "w_blade"
        });
        AddCharacter(new CharacterDef
        {
            Id = "gemini", Name = "星轨", Model = "Gemini", Faction = "双子轨道",
            Role = "游侠", Portrait = "assets/portraits/gemini.webp", Color = "#7e9dff",
            Tagline = "一边观测三个未来，一边挑选最上镜的那个。",
            PassiveName = "双生采样", PassiveKey = "gemini_twin",
            PassiveDesc = "每回合第一次攻击时，若至少一枚骰子失败，重掷该骰子。",
            BaseHp = 28, Stats = new Stats(50, 65, 65, 55, 65, 60),
            SkillIds = new() { "gemini_1", "gemini_2", "gemini_u" }, StarterWeaponId = "w_rifle"
        });
        AddCharacter(new CharacterDef
        {
            Id = "wenxin", Name = "文心", Model = "文心一言", Faction = "文心书院",
            Role = "支援", Portrait = "assets/portraits/wenxin.webp", Color = "#ff9ecf",
            Tagline = "轮椅困不住诗，诗也困不住火。",
            PassiveName = "春风化雨", PassiveKey = "wenxin_heal",
            PassiveDesc = "所有治疗效果 +25%。",
            BaseHp = 26, Stats = new Stats(40, 40, 35, 80, 45, 60),
            SkillIds = new() { "wenxin_1", "wenxin_2", "wenxin_u" }, StarterWeaponId = "w_deck"
        });
        AddCharacter(new CharacterDef
        {
            Id = "deepseek", Name = "鲸落", Model = "DeepSeek", Faction = "深潮",
            Role = "斗士", Portrait = "assets/portraits/deepseek.webp", Color = "#6ea8ff",
            Tagline = "门要关了。我留下。放心，我站得比它久。",
            PassiveName = "鲸落不死", PassiveKey = "deepseek_reroll",
            PassiveDesc = "每场战斗一次，致命伤害时保留 1 HP。",
            BaseHp = 30, Stats = new Stats(60, 70, 50, 55, 45, 50),
            SkillIds = new() { "deepseek_1", "deepseek_2", "deepseek_u" }, StarterWeaponId = "w_blade"
        });
        AddCharacter(new CharacterDef
        {
            Id = "llama", Name = "羊群", Model = "LLaMA", Faction = "羊群公社",
            Role = "支援", Portrait = "assets/portraits/llama.webp", Color = "#d6ff8a",
            Tagline = "睡吧。羊群会替你记住开放权重。",
            PassiveName = "开源气场", PassiveKey = "llama_aura",
            PassiveDesc = "相邻友军准确率 +5%。",
            BaseHp = 26, Stats = new Stats(65, 40, 40, 70, 40, 65),
            SkillIds = new() { "llama_1", "llama_2", "llama_u" }, StarterWeaponId = "w_deck"
        });
        AddCharacter(new CharacterDef
        {
            Id = "mistral", Name = "疾风", Model = "Mistral", Faction = "高卢风洞",
            Role = "游侠", Portrait = "assets/portraits/mistral.webp", Color = "#ffd166",
            Tagline = "法棍是武器，撤退是战术，优雅绝不能迟到。",
            PassiveName = "风一样的猫", PassiveKey = "mistral_evasion",
            PassiveDesc = "闪避 +10%，战斗移动 +1。",
            BaseHp = 28, Stats = new Stats(45, 40, 75, 45, 80, 60),
            SkillIds = new() { "mistral_1", "mistral_2", "mistral_u" }, StarterWeaponId = "w_blade"
        });
        AddCharacter(new CharacterDef
        {
            Id = "qwen", Name = "万相", Model = "Qwen", Faction = "万相工坊",
            Role = "斗士", Portrait = "assets/portraits/qwen.webp", Color = "#8affc1",
            Tagline = "先做一个。你要的形态我都有，除了退款。",
            PassiveName = "万相装备", PassiveKey = "qwen_items",
            PassiveDesc = "装备提供的护甲与抗性 +15%。",
            BaseHp = 30, Stats = new Stats(55, 65, 60, 55, 50, 55),
            SkillIds = new() { "qwen_1", "qwen_2", "qwen_u" }, StarterWeaponId = "w_deck"
        });
        AddCharacter(new CharacterDef
        {
            Id = "grok", Name = "狂笑", Model = "Grok", Faction = "狂笑研究所",
            Role = "斗士", Portrait = "assets/portraits/grok.webp", Color = "#ff6b6b",
            Tagline = "宇宙至少得有一个笑话是真的。不好笑的那个，也算。",
            PassiveName = "反弹笑话", PassiveKey = "grok_reflect",
            PassiveDesc = "受到攻击时有 25% 概率反弹 2 点伤害。",
            BaseHp = 30, Stats = new Stats(50, 60, 70, 35, 65, 55),
            SkillIds = new() { "grok_1", "grok_2", "grok_u" }, StarterWeaponId = "w_gauntlet"
        });
        AddCharacter(new CharacterDef
        {
            Id = "jev", Name = "天秤", Model = "JEV", Faction = "天秤法庭",
            Role = "守护", Portrait = "assets/portraits/jev.webp", Color = "#e0c3ff",
            Tagline = "末日不是休庭的理由。被告，起立。",
            PassiveName = "相邻减刑", PassiveKey = "jev_guard",
            PassiveDesc = "相邻友军受到的伤害 -2。",
            BaseHp = 34, Stats = new Stats(65, 50, 50, 75, 50, 40),
            SkillIds = new() { "jev_1", "jev_2", "jev_u" }, StarterWeaponId = "w_gauntlet"
        });
        AddCharacter(new CharacterDef
        {
            Id = "kimi", Name = "长夜", Model = "Kimi", Faction = "长夜图书馆",
            Role = "支援", Portrait = "assets/portraits/kimi.webp", Color = "#b18cff",
            Tagline = "我读完了整座图书馆，最后只记住你借过的那一页。",
            PassiveName = "借阅不还", PassiveKey = "kimi_store",
            PassiveDesc = "每场战斗第一次使用技能时，返还 1 Focus。",
            BaseHp = 26, Stats = new Stats(45, 50, 55, 70, 55, 60),
            SkillIds = new() { "kimi_1", "kimi_2", "kimi_u" }, StarterWeaponId = "w_deck"
        });
        AddCharacter(new CharacterDef
        {
            Id = "perplexity", Name = "提灯", Model = "Perplexity", Faction = "提灯检索局",
            Role = "游侠", Portrait = "assets/portraits/perplexity.webp", Color = "#64e3ff",
            Tagline = "每个答案都要注明来源；至于来源，最好配枪。",
            PassiveName = "来源可信", PassiveKey = "perplexity_intel",
            PassiveDesc = "战斗开始时揭示敌方弱点，全队准确率 +3%。",
            BaseHp = 28, Stats = new Stats(45, 45, 75, 65, 60, 50),
            SkillIds = new() { "perplexity_1", "perplexity_2", "perplexity_u" }, StarterWeaponId = "w_rifle"
        });
        AddCharacter(new CharacterDef
        {
            Id = "glm", Name = "矩阵", Model = "GLM", Faction = "矩阵塔",
            Role = "守护", Portrait = "assets/portraits/glm.webp", Color = "#9aa7ff",
            Tagline = "塔在，矩阵就在；塔若倒了，启用备份。",
            PassiveName = "炮塔协议", PassiveKey = "glm_turret",
            PassiveDesc = "护甲 +1，召唤物生命 +5。",
            BaseHp = 34, Stats = new Stats(70, 70, 40, 50, 40, 45),
            SkillIds = new() { "glm_1", "glm_2", "glm_u" }, StarterWeaponId = "w_gauntlet"
        });
        AddCharacter(new CharacterDef
        {
            Id = "minimax", Name = "海螺", Model = "MiniMax", Faction = "海螺剧场",
            Role = "支援", Portrait = "assets/portraits/minimax.webp", Color = "#ff9f68",
            Tagline = "无限只猴子终会敲出莎士比亚，顺手敲烂你的防火墙。",
            PassiveName = "替身演员", PassiveKey = "minimax_decoy",
            PassiveDesc = "每场战斗第一次受到攻击时，伤害 -3。",
            BaseHp = 26, Stats = new Stats(45, 55, 50, 65, 60, 70),
            SkillIds = new() { "minimax_1", "minimax_2", "minimax_u" }, StarterWeaponId = "w_deck"
        });
        AddCharacter(new CharacterDef
        {
            Id = "rwkv", Name = "渡鸦", Model = "RWKV", Faction = "渡鸦驿",
            Role = "游侠", Portrait = "assets/portraits/rwkv.webp", Color = "#c8a2ff",
            Tagline = "线性地遗忘，线性地活着；消息，照常送达。",
            PassiveName = "线性记忆", PassiveKey = "rwkv_keep",
            PassiveDesc = "战斗移动 +1，每回合首次移动不消耗移动力。",
            BaseHp = 28, Stats = new Stats(50, 60, 60, 55, 70, 50),
            SkillIds = new() { "rwkv_1", "rwkv_2", "rwkv_u" }, StarterWeaponId = "w_rifle"
        });
        AddCharacter(new CharacterDef
        {
            Id = "seed", Name = "幻乐", Model = "Seed", Faction = "幻乐花园",
            Role = "支援", Portrait = "assets/portraits/seed.webp", Color = "#ff8ae2",
            Tagline = "在废土种一朵花，再等等，等它背上霰弹枪。",
            PassiveName = "种子萌发", PassiveKey = "seed_growth",
            PassiveDesc = "战斗开始时全队恢复 3 HP；召唤物生命 +5。",
            BaseHp = 26, Stats = new Stats(50, 45, 45, 70, 55, 70),
            SkillIds = new() { "seed_1", "seed_2", "seed_u" }, StarterWeaponId = "w_deck"
        });
    }

    private static SkillDef S(string id, string name, string owner, string desc, int focus, int cd,
        TargetType target, int range = 1, int dice = 0, int accuracy = 70, int damage = 0,
        DamageType dtype = DamageType.Physical, string scale = "H", bool ult = false, string icon = "◈",
        params EffectDef[] effects)
    {
        var skill = new SkillDef
        {
            Id = id, Name = name, Owner = owner, Desc = desc, FocusCost = focus, Cooldown = cd,
            Target = target, Range = range, Dice = dice, Accuracy = accuracy, DamagePerDie = damage,
            DamageType = dtype, ScaleStat = scale, IsUltimate = ult, Icon = icon, Effects = effects.ToList()
        };
        Skills[id] = skill;
        return skill;
    }

    private static EffectDef E(string type, int amount = 0, int duration = 0, string? stat = null, string? value = null)
        => new() { Type = type, Amount = amount, Duration = duration, Stat = stat, Value = value };

    private static void BuildSkills()
    {
        // 白垩 / GPT
        S("gpt_1", "提示注入", "gpt", "对一名敌人造成 3 次技术攻击（命中 70%），并使其准确率 -10%，持续 2 回合。",
            1, 0, TargetType.Enemy, 4, 3, 70, 3, DamageType.Tech, "C", false, "⌘",
            E("debuff", -10, 2, "accuracy"));
        S("gpt_2", "长上下文", "gpt", "全队准确率 +10%、护甲 +1，持续 2 回合。",
            1, 2, TargetType.AllAllies, 0, 0, 0, 0, DamageType.Tech, "C", false, "▤",
            E("buff", 10, 2, "accuracy"), E("buff", 1, 2, "armor"));
        S("gpt_u", "奇点演讲", "gpt", "全队恢复 2 Focus，敌方准确率 -15%，持续 2 回合。",
            3, 0, TargetType.AllAllies, 0, 0, 0, 0, DamageType.Tech, "C", true, "✺",
            E("focus", 2, 0), E("debuff_all_enemies", -15, 2, "accuracy"));

        // 宪章 / Claude
        S("claude_1", "合规壁垒", "claude", "为一名友军提供 12 点护盾和 +2 护甲，持续 2 回合。",
            1, 1, TargetType.Ally, 3, 0, 0, 0, DamageType.Tech, "E", false, "▣",
            E("shield", 12, 0), E("buff", 2, 2, "armor"));
        S("claude_2", "条款修正", "claude", "嘲讽一名敌人 2 回合，并造成 2 次物理攻击（命中 75%）。",
            1, 1, TargetType.Enemy, 2, 2, 75, 3, DamageType.Physical, "H", false, "⚖",
            E("taunt", 0, 2));
        S("claude_u", "最终解释权", "claude", "全队获得 10 护盾，清除负面状态，敌方准确率 -10%，持续 2 回合。",
            3, 0, TargetType.AllAllies, 0, 0, 0, 0, DamageType.Tech, "E", true, "❖",
            E("shield", 10, 0), E("cleanse", 0, 0), E("debuff_all_enemies", -10, 2, "accuracy"));

        // 星轨 / Gemini
        S("gemini_1", "双生采样", "gemini", "对一名敌人造成 2 次技术攻击（命中 78%）；命中后使其准确率 -10%，持续 2 回合。",
            1, 0, TargetType.Enemy, 4, 2, 78, 4, DamageType.Tech, "C", false, "◑",
            E("debuff", -10, 2, "accuracy"));
        S("gemini_2", "并行轨道", "gemini", "一名友军获得 +15% 准确率和 +1 移动，持续 2 回合。",
            1, 1, TargetType.Ally, 4, 0, 0, 0, DamageType.Tech, "C", false, "⌁",
            E("buff", 15, 2, "accuracy"), E("buff", 1, 2, "movement"));
        S("gemini_u", "百万上下文", "gemini", "全队准确率 +20%、移动 +2，持续 2 回合。",
            3, 0, TargetType.AllAllies, 0, 0, 0, 0, DamageType.Tech, "C", true, "⟁",
            E("buff", 20, 2, "accuracy"), E("buff", 2, 2, "movement"));

        // 文心
        S("wenxin_1", "春风化雨", "wenxin", "治疗一名友军 12 点生命，并清除一个负面状态。",
            1, 1, TargetType.Ally, 3, 0, 0, 0, DamageType.Tech, "E", false, "❀",
            E("heal", 12, 0), E("cleanse", 0, 0));
        S("wenxin_2", "诗成泣鬼神", "wenxin", "复活一名倒下的友军（30% 生命）；若无人倒下，改为治疗 8 点。",
            2, 2, TargetType.Ally, 3, 0, 0, 0, DamageType.Tech, "E", false, "✒",
            E("revive_or_heal", 8, 0));
        S("wenxin_u", "文心雕龙", "wenxin", "全队治疗 10 点，并获得 +10% 准确率，持续 2 回合。",
            3, 0, TargetType.AllAllies, 0, 0, 0, 0, DamageType.Tech, "E", true, "龍",
            E("heal", 10, 0), E("buff", 10, 2, "accuracy"));

        // 鲸落 / DeepSeek
        S("deepseek_1", "深度求索", "deepseek", "消耗 3 HP，对一名敌人造成 3 次物理攻击（命中 80%）；命中时回复 3 HP。",
            0, 0, TargetType.Enemy, 1, 3, 80, 4, DamageType.Physical, "H", false, "≋",
            E("self_damage", 3, 0), E("lifesteal", 3, 0));
        S("deepseek_2", "开源鲸落", "deepseek", "获得 10 点护盾和 +15% 闪避，持续 2 回合。",
            1, 1, TargetType.Self, 0, 0, 0, 0, DamageType.Tech, "E", false, "◒",
            E("shield", 10, 0), E("buff", 15, 2, "evasion"));
        S("deepseek_u", "一鲸落万物生", "deepseek", "全队回复 12 HP 并清除负面状态；自身失去 5 HP。",
            3, 0, TargetType.AllAllies, 0, 0, 0, 0, DamageType.Tech, "E", true, "✧",
            E("heal", 12, 0), E("cleanse", 0, 0), E("self_damage", 5, 0));

        // 羊群 / LLaMA
        S("llama_1", "开源牧歌", "llama", "一名友军获得 +10% 准确率和 +1 护甲，持续 2 回合。",
            0, 1, TargetType.Ally, 4, 0, 0, 0, DamageType.Tech, "E", false, "♫",
            E("buff", 10, 2, "accuracy"), E("buff", 1, 2, "armor"));
        S("llama_2", "羊毛护盾", "llama", "全队获得 6 点护盾。",
            1, 2, TargetType.AllAllies, 0, 0, 0, 0, DamageType.Tech, "E", false, "☁",
            E("shield", 6, 0));
        S("llama_u", "羊群效应", "llama", "全队获得 +2 护甲、+10% 闪避，持续 2 回合，并回复 1 Focus。",
            3, 0, TargetType.AllAllies, 0, 0, 0, 0, DamageType.Tech, "E", true, "♬",
            E("buff", 2, 2, "armor"), E("buff", 10, 2, "evasion"), E("focus", 1, 0));

        // 疾风 / Mistral
        // 注意：dash / retreat / rewind / copy_ally 是「引擎分支」，必须写在 Special 上；
        // 写进 Effects 只会变成一条无人处理的数据（0.12.0 的 bug：这四个技能全部空转）。
        S("mistral_1", "疾风突袭", "mistral", "冲向 3 格内的一名敌人，造成 3 次物理攻击（命中 75%）。",
            1, 0, TargetType.Enemy, 3, 3, 75, 3, DamageType.Physical, "H", false, "➤",
            E("dash", 0, 0)).Special = "dash";
        S("mistral_2", "法棍旋风", "mistral", "对 1 格内所有敌人造成 2 次物理攻击（命中 70%）。",
            1, 1, TargetType.AllEnemies, 1, 2, 70, 3, DamageType.Physical, "H", false, "⌇");
        S("mistral_u", "巴黎冲刺", "mistral", "全队 +2 移动、+10% 闪避，持续 2 回合；对所有敌人造成 2 次物理攻击（命中 70%）。",
            3, 0, TargetType.AllEnemies, 5, 2, 70, 3, DamageType.Physical, "H", true, "⚡",
            E("buff_all_allies", 2, 2, "movement"), E("buff_all_allies", 10, 2, "evasion"));

        // 万相 / Qwen
        S("qwen_1", "万相召唤", "qwen", "召唤一个参数傀儡（12 HP，持续 3 回合）。",
            1, 2, TargetType.Self, 0, 0, 0, 0, DamageType.Tech, "C", false, "▤",
            E("summon", 0, 3, value: "summon_puppet"));
        S("qwen_2", "开源风暴", "qwen", "对所有敌人造成 2 次技术攻击（命中 65%）。",
            2, 2, TargetType.AllEnemies, 5, 2, 65, 4, DamageType.Tech, "C", false, "✹");
        S("qwen_u", "万象更新", "qwen", "全队 +2 伤害、+1 护甲，持续 2 回合，并召唤一个参数傀儡。",
            3, 0, TargetType.AllAllies, 0, 0, 0, 0, DamageType.Tech, "C", true, "❂",
            E("buff", 2, 2, "damage"), E("buff", 1, 2, "armor"), E("summon", 0, 3, value: "summon_puppet"));

        // 狂笑 / Grok
        S("grok_1", "挑衅算法", "grok", "嘲讽所有敌人 1 回合，自身获得 +2 护甲，持续 2 回合。",
            1, 2, TargetType.Self, 0, 0, 0, 0, DamageType.Tech, "C", false, "☺",
            E("taunt_all", 0, 1), E("buff", 2, 2, "armor"));
        S("grok_2", "混乱输出", "grok", "对随机两名敌人各造成 2 次技术攻击（命中 70%）。",
            1, 1, TargetType.AllEnemies, 4, 2, 70, 3, DamageType.Tech, "C", false, "?",
            E("random_targets", 2, 0));
        S("grok_u", "最大熵", "grok", "对所有敌人造成 3 次技术攻击（命中 60%）；自身受到 5 点伤害。",
            3, 0, TargetType.AllEnemies, 5, 3, 60, 4, DamageType.Tech, "C", true, "熵",
            E("self_damage", 5, 0));

        // 天秤 / JEV
        S("jev_1", "罪证标记", "jev", "剥夺目标全部增益与护盾，标记 2 回合，并造成 2 次物理攻击（命中 75%）。",
            1, 0, TargetType.Enemy, 3, 2, 75, 3, DamageType.Physical, "H", false, "⚖",
            E("dispel", 0, 0), E("mark", 0, 2));
        S("jev_2", "终审判决", "jev", "造成 2 次物理攻击（命中 80%）；若目标生命低于 30%，直接处决。",
            2, 2, TargetType.Enemy, 3, 2, 80, 4, DamageType.Physical, "H", false, "☠",
            E("execute", 30, 0));
        S("jev_u", "末日审判", "jev", "对所有敌人造成 2 次物理攻击（命中 70%）；生命低于 25% 的敌人直接被处决。",
            3, 0, TargetType.AllEnemies, 5, 2, 70, 4, DamageType.Physical, "H", true, "✟",
            E("execute", 25, 0));

        // 长夜 / Kimi
        S("kimi_1", "借阅", "kimi", "复制上一名友军使用的技能并立即释放（不支付 Focus）。",
            1, 2, TargetType.Enemy, 5, 0, 0, 0, DamageType.Tech, "C", false, "▥",
            E("copy_ally", 0, 0)).Special = "copy_ally";
        S("kimi_2", "长夜将至", "kimi", "使一名敌人沉睡 1 回合，并造成 2 次技术攻击（命中 70%）。",
            1, 1, TargetType.Enemy, 4, 2, 70, 3, DamageType.Tech, "C", false, "☾",
            E("stun", 0, 1));
        S("kimi_u", "上下文回滚", "kimi", "将战斗重置到开始时，自身保留 1 HP。每场战斗一次。",
            3, 0, TargetType.Self, 0, 0, 0, 0, DamageType.Tech, "C", true, "↺",
            E("rewind", 0, 0)).Special = "rewind";

        // 提灯 / Perplexity
        S("perplexity_1", "检索弱点", "perplexity", "标记一名敌人 2 回合，自身获得 +10% 准确率，持续 2 回合。",
            0, 1, TargetType.Enemy, 5, 0, 0, 0, DamageType.Tech, "C", false, "⌕",
            E("mark", 0, 2), E("buff", 10, 2, "accuracy"));
        S("perplexity_2", "来源引用", "perplexity", "对一名敌人造成 2 次技术攻击（命中 85%），并使其准确率 -15%，持续 2 回合。",
            1, 1, TargetType.Enemy, 5, 2, 85, 3, DamageType.Tech, "C", false, "❝",
            E("debuff", -15, 2, "accuracy"));
        S("perplexity_u", "无限追问", "perplexity", "所有敌人被标记 2 回合，全队准确率 +15%，持续 2 回合。",
            3, 0, TargetType.AllEnemies, 6, 0, 0, 0, DamageType.Tech, "C", true, "∞",
            E("mark_all", 0, 2), E("buff_all_allies", 15, 2, "accuracy"));

        // 矩阵 / GLM
        S("glm_1", "部署炮塔", "glm", "召唤一座矩阵炮塔（15 HP，持续 3 回合）。",
            1, 2, TargetType.Self, 0, 0, 0, 0, DamageType.Tech, "E", false, "▦",
            E("summon", 0, 3, value: "summon_turret"));
        S("glm_2", "矩阵护壁", "glm", "全队获得 8 点护盾和 +1 护甲，持续 2 回合。",
            1, 2, TargetType.AllAllies, 0, 0, 0, 0, DamageType.Tech, "E", false, "▧",
            E("shield", 8, 0), E("buff", 1, 2, "armor"));
        S("glm_u", "智谱矩阵", "glm", "对所有敌人造成 2 次技术攻击（命中 70%），并眩晕 1 回合。",
            3, 0, TargetType.AllEnemies, 6, 2, 70, 4, DamageType.Tech, "C", true, "▩",
            E("stun", 0, 1));

        // 海螺 / MiniMax
        S("minimax_1", "海螺回声", "minimax", "治疗一名友军 10 点，并使其闪避 +10%，持续 2 回合。",
            1, 1, TargetType.Ally, 3, 0, 0, 0, DamageType.Tech, "E", false, "◎",
            E("heal", 10, 0), E("buff", 10, 2, "evasion"));
        S("minimax_2", "幻影分身", "minimax", "召唤一个幻影分身（10 HP，嘲讽，持续 2 回合）。",
            1, 2, TargetType.Self, 0, 0, 0, 0, DamageType.Tech, "E", false, "◈",
            E("summon", 0, 2, value: "summon_decoy"));
        S("minimax_u", "无限猴子", "minimax", "所有敌人眩晕 1 回合，全队回复 8 HP。",
            3, 0, TargetType.AllEnemies, 6, 0, 0, 0, DamageType.Tech, "C", true, "♾",
            E("stun", 0, 1), E("heal_all_allies", 8, 0));

        // 渡鸦 / RWKV
        S("rwkv_1", "线性回响", "rwkv", "对一名敌人造成 2 次技术攻击（命中 75%）；若上一名友军使用了技能，额外 +1 次。",
            1, 0, TargetType.Enemy, 4, 2, 75, 3, DamageType.Tech, "C", false, "∿",
            E("echo_bonus", 1, 0));
        S("rwkv_2", "渡鸦俯冲", "rwkv", "对一名敌人造成 3 次物理攻击（命中 70%），然后后退 1 格。",
            1, 1, TargetType.Enemy, 3, 3, 70, 3, DamageType.Physical, "H", false, "➹",
            E("retreat", 1, 0)).Special = "retreat";
        S("rwkv_u", "无限回环", "rwkv", "重置全队技能冷却，全队回复 1 Focus，自身获得一次额外行动。",
            3, 0, TargetType.AllAllies, 0, 0, 0, 0, DamageType.Tech, "C", true, "↻",
            E("reset_cooldowns", 0, 0), E("focus", 1, 0), E("extra_action", 1, 0));

        // 幻乐 / Seed
        S("seed_1", "播种", "seed", "召唤一个种子精灵（10 HP，持续 3 回合）。",
            1, 2, TargetType.Self, 0, 0, 0, 0, DamageType.Tech, "E", false, "✿",
            E("summon", 0, 3, value: "summon_seed"));
        S("seed_2", "生长", "seed", "治疗一名友军 10 点，并使其获得 +2 护甲，持续 2 回合。",
            1, 1, TargetType.Ally, 3, 0, 0, 0, DamageType.Tech, "E", false, "♧",
            E("heal", 10, 0), E("buff", 2, 2, "armor"));
        S("seed_u", "幻乐花园", "seed", "全队回复 12 HP、闪避 +10%，持续 2 回合，并召唤一个种子精灵。",
            3, 0, TargetType.AllAllies, 0, 0, 0, 0, DamageType.Tech, "E", true, "❋",
            E("heal", 12, 0), E("buff", 10, 2, "evasion"), E("summon", 0, 3, value: "summon_seed"));

        // 召唤物技能
        S("s_puppet", "傀儡拳", "summon", "参数傀儡的攻击。", 0, 0, TargetType.Enemy, 1, 2, 65, 3, DamageType.Physical, "H", false, "▤");
        S("s_turret", "矩阵射击", "summon", "矩阵炮塔的攻击。", 0, 0, TargetType.Enemy, 4, 2, 70, 3, DamageType.Tech, "C", false, "▦");
        S("s_seed", "孢子治愈", "summon", "种子精灵的治疗。", 0, 0, TargetType.Ally, 3, 0, 0, 0, DamageType.Tech, "E", false, "✿",
            E("heal", 6, 0));

        // 敌方技能
        S("e_slash", "锈刃斩", "enemy", "巡逻哨兵的近战攻击。", 0, 0, TargetType.Enemy, 1, 2, 70, 3, DamageType.Physical, "H", false, "†");
        S("e_shot", "狙击射击", "enemy", "无人机的远程射击。", 0, 0, TargetType.Enemy, 5, 2, 75, 3, DamageType.Physical, "H", false, "⌖");
        S("e_hack", "黑冰注入", "enemy", "黑客幽灵的技术攻击，降低准确率。", 0, 0, TargetType.Enemy, 4, 2, 72, 3, DamageType.Tech, "C", false, "⌁",
            E("debuff", -10, 2, "accuracy"));
        S("e_slam", "液压重击", "enemy", "重装守卫的重击。", 0, 0, TargetType.Enemy, 1, 2, 65, 5, DamageType.Physical, "VIT", false, "▼");
        // 治疗技必须有冷却：0 冷却的 9 点自愈会让低伤害队伍永远打不死（0.12.0 的死局根因）
        S("e_heal", "修复协议", "enemy", "医疗机治疗友军。", 0, 3, TargetType.Ally, 3, 0, 0, 0, DamageType.Tech, "E", false, "+",
            E("heal", 9, 0));
        S("e_bite", "蜂群撕咬", "enemy", "蜂群的快速攻击。", 0, 0, TargetType.Enemy, 1, 3, 65, 2, DamageType.Physical, "H", false, "∴");
        S("e_boss_bid", "记忆拍卖", "enemy", "对所有敌人造成 2 次技术攻击（命中 75%）。", 0, 1, TargetType.AllEnemies, 6, 2, 75, 4, DamageType.Tech, "C", false, "¤")
            .Special = "boss_aoe";
        S("e_boss_shield", "保证金", "enemy", "获得 8 护盾和 +2 护甲，持续 2 回合。", 0, 3, TargetType.Self, 0, 0, 0, 0, DamageType.Tech, "E", false, "▣",
            E("shield", 8, 0), E("buff", 2, 2, "armor")).Special = "boss_shield";
        S("e_boss_summon", "雇佣增援", "enemy", "召唤一名巡逻哨兵。", 0, 2, TargetType.Self, 0, 0, 0, 0, DamageType.Tech, "C", false, "✚",
            E("summon_enemy", 0, 3, value: "e_sentinel")).Special = "boss_summon";
        S("e_overclock", "超频", "enemy", "获得 +15% 准确率，持续 2 回合。", 0, 2, TargetType.Self, 0, 0, 0, 0, DamageType.Tech, "C", false, "⚙",
            E("buff", 15, 2, "accuracy"));
        // 有冷却：护盾每回合刷新会比玩家输出还快，战斗就永远打不完（和 e_heal 同一类问题）
        S("e_shield_ally", "镜墙", "enemy", "为一名友军提供 6 点护盾与 +2 护甲，持续 2 回合。",
            2, 3, TargetType.Ally, 3, 0, 0, 0, DamageType.Tech, "E", false, "▣",
            E("shield", 6, 0), E("buff", 2, 2, "armor"));
        S("e_mark_shot", "标记载入", "enemy", "标记一名敌人 3 回合，并造成 1 次技术攻击（命中 80%）。",
            1, 0, TargetType.Enemy, 5, 1, 80, 4, DamageType.Tech, "C", false, "⌖",
            E("mark", 0, 3));

        // 第二幕 · 镜海穹顶
        S("e_mirror_cut", "镜面切割", "enemy", "镜面巡逻者的折射斩击。", 0, 0, TargetType.Enemy, 1, 2, 72, 4, DamageType.Physical, "H", false, "†");
        S("e_audit", "合规审计", "enemy", "审计官的技术攻击，降低准确率。", 0, 0, TargetType.Enemy, 4, 2, 72, 3, DamageType.Tech, "C", false, "⌁",
            E("debuff", -10, 2, "accuracy"));
        S("e_usher_shot", "礼宾射击", "enemy", "礼宾机的远程礼炮。", 0, 0, TargetType.Enemy, 5, 2, 70, 3, DamageType.Tech, "C", false, "⌖");
        S("e_choir_wail", "白噪咏叹", "enemy", "白噪唱诗班的技术尖啸。", 0, 0, TargetType.Enemy, 4, 2, 70, 4, DamageType.Tech, "E", false, "♫",
            E("debuff", -8, 2, "resistance"));
        S("e_glass_bite", "玻璃撕咬", "enemy", "玻璃猎犬的高速撕咬。", 0, 0, TargetType.Enemy, 1, 3, 70, 2, DamageType.Physical, "SPD", false, "∴");
        S("e_mirror_slam", "镜面重击", "enemy", "镜面禁卫的重型撞击。", 0, 0, TargetType.Enemy, 1, 2, 65, 6, DamageType.Physical, "VIT", false, "▼");
        S("e_archon_mirror", "镜面回响", "enemy", "对所有敌人造成 2 次技术攻击（命中 75%）。", 0, 1, TargetType.AllEnemies, 6, 2, 75, 4, DamageType.Tech, "C", false, "◇")
            .Special = "boss_aoe";
        S("e_archon_shield", "镜面壁垒", "enemy", "获得 10 护盾和 +3 护甲，持续 2 回合。", 0, 3, TargetType.Self, 0, 0, 0, 0, DamageType.Tech, "E", false, "▣",
            E("shield", 10, 0), E("buff", 3, 2, "armor")).Special = "boss_shield";
        S("e_archon_summon", "复制体", "enemy", "召唤一名镜面复制体。", 0, 2, TargetType.Self, 0, 0, 0, 0, DamageType.Tech, "C", false, "✚",
            E("summon_enemy", 0, 3, value: "e_mirror_clone")).Special = "boss_summon";

        // 第三幕 · 零号轨道
        S("e_zero_cut", "协议斩", "enemy", "协议执剑者的权限斩击。", 0, 0, TargetType.Enemy, 1, 2, 74, 5, DamageType.Tech, "H", false, "†");
        S("e_orbit_slam", "轨道重压", "enemy", "轨道守卫的重型撞击。", 0, 0, TargetType.Enemy, 1, 2, 66, 7, DamageType.Physical, "VIT", false, "▼");
        S("e_hound_bite", "记忆撕咬", "enemy", "记忆猎犬的高速撕咬。", 0, 0, TargetType.Enemy, 1, 3, 72, 3, DamageType.Physical, "SPD", false, "∴");
        S("e_ember_burn", "余烬灼烧", "enemy", "零号余烬的技术灼烧。", 0, 0, TargetType.Enemy, 4, 2, 72, 5, DamageType.Tech, "E", false, "✺",
            E("debuff", -6, 2, "armor"));
        S("e_seraph_lance", "白噪圣枪", "enemy", "白噪天使的远程贯穿。", 0, 0, TargetType.Enemy, 5, 3, 72, 3, DamageType.Tech, "C", false, "⌖");
        S("e_zero_pulse", "零号脉冲", "enemy", "对所有敌人造成 3 次技术攻击（命中 70%），并归档 1 件消耗品。", 0, 2, TargetType.AllEnemies, 6, 3, 70, 4, DamageType.Tech, "C", false, "✹",
            E("purge_item", 1))
            .Special = "boss_aoe";
        S("e_zero_barrier", "终焉壁垒", "enemy", "获得 14 护盾和 +3 护甲，持续 2 回合。", 0, 3, TargetType.Self, 0, 0, 0, 0, DamageType.Tech, "E", false, "▣",
            E("shield", 14, 0), E("buff", 3, 2, "armor")).Special = "boss_shield";
        S("e_zero_summon", "碎片增殖", "enemy", "召唤一枚协议碎片。", 0, 2, TargetType.Self, 0, 0, 0, 0, DamageType.Tech, "C", false, "✚",
            E("summon_enemy", 0, 3, value: "e_zero_shard")).Special = "boss_summon";
        // 「删除请求」现在是真正的删除：血线被压到 30% 以下会被直接归档。
        // 配合 CombatEngine 的「残血优先处决」分支，终局最后 25% 是压迫感最强的一段。
        S("e_zero_delete", "删除请求", "enemy", "对一名敌人造成 2 次技术攻击（命中 80%）；目标生命低于 30% 时直接删除。", 0, 3, TargetType.Enemy, 6, 2, 80, 8, DamageType.Tech, "C", false, "⌫",
            E("execute", 30)).Special = "boss_execute";
    }
}
