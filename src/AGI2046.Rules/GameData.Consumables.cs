namespace AGI2046.Rules;

public static partial class GameData
{
    public static readonly Dictionary<string, ConsumableDef> Consumables = new(StringComparer.OrdinalIgnoreCase);

    private static void C(ConsumableDef c) => Consumables[c.Id] = c;

    private static void BuildConsumables()
    {
        C(new ConsumableDef
        {
            Id = "medkit", Name = "止血针", Icon = "✚", Rarity = "普通", Price = 50,
            Desc = "恢复目标 35% 最大生命。可在探索或战斗中使用。",
            Effect = "heal", Amount = 35, Scope = "ally", Color = "#3ddc97"
        });
        C(new ConsumableDef
        {
            Id = "focus_cell", Name = "聚焦剂", Icon = "◈", Rarity = "普通", Price = 60,
            Desc = "为目标恢复 3 点 Focus。技术型角色的续航。",
            Effect = "focus", Amount = 3, Scope = "ally", Color = "#64e3ff"
        });
        C(new ConsumableDef
        {
            Id = "purifier", Name = "净化剂", Icon = "❖", Rarity = "稀有", Price = 60,
            Desc = "清除目标身上的全部负面状态。单体——和文心的「春风化雨」同效，但更贵。",
            Effect = "cleanse", Amount = 0, Scope = "ally", CombatOnly = true, Color = "#9aa7ff"
        });
        C(new ConsumableDef
        {
            Id = "shield_gen", Name = "护盾发生器", Icon = "▣", Rarity = "稀有", Price = 70,
            Desc = "为目标提供 8 点护盾，持续到被打破。仅战斗中可用。",
            Effect = "shield", Amount = 8, Scope = "ally", CombatOnly = true, Color = "#ffd166"
        });
        C(new ConsumableDef
        {
            Id = "adrenaline", Name = "肾上腺素", Icon = "➤", Rarity = "稀有", Price = 90,
            Desc = "目标速度 +8、命中 +5，持续 3 回合。仅战斗中可用。",
            Effect = "haste", Amount = 3, Scope = "ally", CombatOnly = true, Color = "#ff8ae2"
        });
    }

    /// <summary>服务器写入的属性键与显示名。</summary>
    public static readonly Dictionary<string, string> ServerStatKey = new()
    {
        ["vit"] = "VIT", ["c"] = "C", ["h"] = "H", ["e"] = "E", ["spd"] = "SPD", ["l"] = "L"
    };

    public static string ConsumableName(string id) =>
        Consumables.TryGetValue(id, out var c) ? c.Name : id;
}
