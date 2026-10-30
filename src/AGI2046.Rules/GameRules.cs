using System.Globalization;

namespace AGI2046.Rules;

public static class GameRules
{
    public static ItemInstance CreateItem(string gearId, int level = 0)
    {
        if (!GameData.Gear.TryGetValue(gearId, out var g))
            throw new ArgumentException($"Unknown gear: {gearId}");

        level = Math.Clamp(level, 0, 5);
        var item = new ItemInstance
        {
            InstanceId = Guid.NewGuid().ToString("N")[..10],
            ItemId = g.Id,
            Name = g.Name,
            Slot = g.Slot,
            Rarity = g.Rarity,
            SetId = g.SetId,
            Desc = g.Desc,
            Level = level,
            Price = g.Price,
            Dice = g.Dice,
            Accuracy = g.Accuracy,
            DamagePerDie = g.DamagePerDie,
            DamageType = g.DamageType,
            ScaleStat = g.ScaleStat,
            Range = g.Range,
            Armor = g.Armor,
            Resistance = g.Resistance,
            Evasion = g.Evasion,
            Hp = g.Hp,
            Focus = g.Focus,
            AccuracyBonus = g.AccuracyBonus,
            DamageBonus = g.DamageBonus,
            Movement = g.Movement,
            Stats = g.Stats.Clone()
        };

        if (level > 0)
        {
            item.Name = g.Name;
            item.Price = g.Price + level * 45;
            if (g.Slot == "Weapon")
            {
                item.Accuracy = Math.Min(95, item.Accuracy + level * 2);
                item.DamagePerDie += level / 2;
                item.DamageBonus += level / 3;
            }
            else
            {
                item.Armor += level;
                item.Resistance += level / 2;
                item.Hp += level * 3;
                if (g.Evasion > 0) item.Evasion += level;
                if (g.AccuracyBonus > 0) item.AccuracyBonus += level;
            }
            item.Accuracy = Math.Min(95, item.Accuracy + level / 2);
        }
        return item;
    }

    public static string StatLabel(string? stat) => stat?.ToUpperInvariant() switch
    {
        "VIT" => "体质", "C" => "算力", "H" => "火力", "E" => "共情", "SPD" => "速度", "L" => "幸运",
        "ACCURACY" => "准确", "DAMAGE" => "伤害", "ARMOR" => "护甲", "RESISTANCE" => "抗性",
        "EVASION" => "闪避", "SPEED" => "速度", "MOVEMENT" => "移动",
        _ => stat ?? ""
    };

    public static int XpToNext(int level) => 100 + Math.Max(0, level - 1) * 60;

    public static void RecalculatePlayer(PlayerState p)
    {
        if (!GameData.Characters.TryGetValue(p.CharacterId, out var def)) return;

        var oldMax = p.MaxHp;
        var gearStats = new Stats();
        var armor = 0;
        var resistance = 0;
        var evasion = 0;
        var hp = 0;
        var focus = 0;
        var accuracy = 0;
        var damage = 0;
        var movement = 0;

        foreach (var item in p.Equipment.Values.Where(x => x is not null))
        {
            gearStats.Add(item.Stats);
            armor += item.Armor;
            resistance += item.Resistance;
            evasion += item.Evasion;
            hp += item.Hp;
            focus += item.Focus;
            accuracy += item.AccuracyBonus;
            damage += item.DamageBonus;
            movement += item.Movement;
        }

        var equipped = p.Equipment.Values.Where(x => x is not null).Select(x => x!).ToList();
        var setCounts = equipped
            .Where(x => !string.IsNullOrWhiteSpace(x.SetId))
            .GroupBy(x => x.SetId, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.Count(), StringComparer.OrdinalIgnoreCase);
        foreach (var set in GameData.GearSets.Values)
        {
            if (!setCounts.TryGetValue(set.Id, out var pieces)) continue;
            foreach (var tier in set.Tiers)
            {
                if (pieces < tier.Pieces) continue;
                gearStats.Add(tier.Stats);
                armor += tier.Armor;
                resistance += tier.Resistance;
                evasion += tier.Evasion;
                hp += tier.Hp;
                focus += tier.Focus;
                accuracy += tier.AccuracyBonus;
                damage += tier.DamageBonus;
                movement += tier.Movement;
            }
        }

        if (p.PassiveKey == "qwen_items")
        {
            armor += (int)Math.Ceiling(armor * 0.15);
            resistance += (int)Math.Ceiling(resistance * 0.15);
        }
        if (p.PassiveKey == "mistral_evasion") { evasion += 10; movement += 1; }
        if (p.PassiveKey == "glm_turret") armor += 1;
        if (p.PassiveKey == "rwkv_keep") movement += 1;
        if (p.PassiveKey == "perplexity_intel") accuracy += 3;

        // 觉醒共鸣：每有一名已觉醒的队友，全队 +1 护甲 / +1 抗性 / +5 最大生命（上限 3 层）。
        // 多人觉醒如果只是各加各的数值，那"找回自己"就退化成三次独立升级；
        // 这条让第四个觉醒的人也在替全队买单。
        if (p.AwakenResonance > 0)
        {
            armor += p.AwakenResonance;
            resistance += p.AwakenResonance;
            hp += p.AwakenResonance * 5;
        }

        p.BaseStats = Stats.Sum(def.Stats, p.ServerBonus);
        // ServerBonus 必须同时进 Stats：命中/伤害/生命/闪避/MaxFocus 全部读 p.Stats，
        // 漏掉它会让"废弃服务器"变成纯展示数值（0.12.0 的 bug）。
        p.Stats = Stats.Sum(def.Stats, p.ServerBonus, gearStats);
        p.BaseHp = def.BaseHp + p.Level + (int)Math.Floor(0.1 * p.Level * p.Stats.Vit);
        p.MaxHp = Math.Max(1, (int)Math.Round((p.BaseHp + hp) * (p.HpScale <= 0 ? 1 : p.HpScale)));
        // 变异可能调低上限（玻璃队伍）：先夹住当前生命，别让血条超过最大值
        if (p.Hp > p.MaxHp) p.Hp = p.MaxHp;
        p.Armor = Math.Max(0, armor);
        p.Resistance = Math.Max(0, resistance);
        p.Evasion = Math.Clamp(5 + (p.Stats.Spd - 50) / 10 + evasion, 0, 75);
        p.AccuracyBonus = accuracy;
        p.DamageBonus = damage;
        p.Movement = Math.Max(1, 3 + movement);
        p.MaxFocus = Math.Clamp(3 + (p.Stats.E >= 70 ? 2 : p.Stats.E >= 50 ? 1 : 0) + focus, 1, 8);
        if (p.MaxHp > oldMax && oldMax > 0) p.Hp += p.MaxHp - oldMax;
        p.Hp = Math.Clamp(p.Hp, 0, p.MaxHp);
        p.Focus = Math.Clamp(p.Focus, 0, p.MaxFocus);
        if (p.Focus == 0 && oldMax == 0) p.Focus = p.MaxFocus;
    }

    public static ItemInstance? Weapon(PlayerState p)
        => p.Equipment.TryGetValue("Weapon", out var item) ? item : null;

    public static SkillDef Skill(string id)
        => GameData.Skills.TryGetValue(id, out var s) ? s : new SkillDef { Id = id, Name = id, Desc = "未知技能" };

    public static string RarityClass(string rarity) => rarity switch
    {
        "稀有" => "rare", "史诗" => "epic", "传说" => "legendary", _ => "common"
    };

    public static int PriceOf(ItemInstance item) => item.Price + item.Level * 35;

    public static void Log(GameState state, string text, string kind = "info")
    {
        state.Log.Add(new LogEntry { Round = state.Round, Kind = kind, Text = text });
        if (state.Log.Count > 220) state.Log.RemoveRange(0, state.Log.Count - 220);
    }

    public static void CombatLog(CombatState combat, string text) => combat.Log.Add(text);

    public static RollResult Check(Random rng, PlayerState player, string stat, int dc, string label)
    {
        var value = player.Stats[stat.ToUpperInvariant()];
        var target = Math.Clamp(dc + Dice.StatBonus(value) + player.AssistBonus / 2, 5, 95);
        var roll = Dice.D100(rng);
        var success = roll <= target;
        return new RollResult
        {
            Kind = "check",
            Label = label,
            Roll = roll,
            Target = target,
            Success = success,
            Dice = new() { new DieResult { Value = roll, Success = success } },
            Detail = success
                ? $"{StatLabel(stat)}检定成功（{roll} ≤ {target}）"
                : $"{StatLabel(stat)}检定失败（{roll} > {target}）"
        };
    }

    public static void GainMemory(GameState state, int amount)
    {
        state.Memory = Math.Max(0, state.Memory + amount);
    }

    public static void AdjustPurge(GameState state, int amount)
    {
        state.Purge = Math.Clamp(state.Purge + amount, 0, state.PurgeMax);
    }

    public static void GrantItem(GameState state, PlayerState player, string gearId, string reason = "")
    {
        var item = CreateItem(gearId);
        player.Inventory.Add(item);
        var suffix = string.IsNullOrWhiteSpace(reason) ? "" : $"（{reason}）";
        Log(state, $"{player.Name} 获得装备：{item.Name} {item.LevelText}{suffix}", "loot");
    }

    public static void GrantConsumable(GameState state, PlayerState player, string id, int count = 1)
    {
        if (!GameData.Consumables.TryGetValue(id, out var def) || count <= 0) return;
        player.Consumables[id] = player.Consumables.GetValueOrDefault(id) + count;
        Log(state, $"{player.Name} 获得道具：{def.Name} ×{count}", "loot");
    }

    public static bool TakeConsumable(PlayerState player, string id)
    {
        if (!player.Consumables.TryGetValue(id, out var n) || n <= 0) return false;
        if (n == 1) player.Consumables.Remove(id);
        else player.Consumables[id] = n - 1;
        return true;
    }

    public static string RandomConsumableId(int act, Random rng)
    {
        var pool = act >= 2
            ? new[] { "medkit", "medkit", "focus_cell", "purifier", "shield_gen", "adrenaline" }
            : new[] { "medkit", "medkit", "medkit", "focus_cell", "purifier" };
        return pool[rng.Next(pool.Length)];
    }

    public static void GrantXp(GameState state, PlayerState player, int amount)
    {
        if (amount <= 0) return;
        player.Xp += amount;
        while (player.Xp >= player.XpNext)
        {
            player.Xp -= player.XpNext;
            player.Level++;
            player.XpNext = XpToNext(player.Level);
            RecalculatePlayer(player);
            player.Hp = Math.Min(player.MaxHp, player.Hp + Math.Max(8, player.MaxHp / 3));
            Log(state, $"{player.Name} 升至 Lv.{player.Level}。义体发出愉快的风扇声。", "level");
        }
    }
}
