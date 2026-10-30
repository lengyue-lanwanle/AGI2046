namespace AGI2046.Rules;

/// <summary>
/// 协同规则（0.22）。原则：
///   · 协同是额外选择，不是通关门槛：单人/热座用同样的规则，不依赖第二个真人；
///   · 每类协同至少两种触发方式（技能、支援动作、状态都能碰到）；
///   · 触发必须有文字与行动记录，不能只在数值上偷偷发生；
///   · 每回合每单位最多触发一次同类协同，避免无限连锁。
/// </summary>
public static class SynergyEngine
{
    public static readonly List<SynergyDef> Catalog = new()
    {
        new() { Id = "focus_fire", Name = "标记 → 集火", Trigger = "队友攻击被标记的敌人",
            Effect = "伤害 +15%，并在战斗记录里标注协同。", Preview = "对被标记目标 +15% 伤害" },
        new() { Id = "shield_counter", Name = "护盾 → 反击", Trigger = "带护盾的队友被近战击中",
            Effect = "护盾来源对攻击者造成 3 点反伤（每轮一次）。", Preview = "受击时反伤 3" },
        new() { Id = "control_burst", Name = "控制 → 追加伤害", Trigger = "攻击被眩晕/嘲讽的敌人",
            Effect = "本次伤害 +20%。", Preview = "对受控目标 +20% 伤害" },
        new() { Id = "heal_purify", Name = "治疗 → 净化", Trigger = "治疗技能落在队友身上",
            Effect = "额外清除 1 个负面状态，并 +1 护甲 1 回合。", Preview = "治疗附带净化 +1 护甲" },
        new() { Id = "summon_cover", Name = "召唤 → 掩护", Trigger = "召唤物出现",
            Effect = "相邻友军获得 4 点护盾。", Preview = "召唤时相邻友军 +4 护盾" },
        new() { Id = "expose_true", Name = "暴露 → 必中", Trigger = "攻击被暴露的目标",
            Effect = "本次攻击命中 +20，并消耗暴露。", Preview = "对暴露目标命中 +20" },
        new() { Id = "speed_chain", Name = "速度 → 连携", Trigger = "在队友相邻格结束回合",
            Effect = "该队友下回合移动 +1。", Preview = "相邻结束回合：队友移动 +1" },
        new() { Id = "focus_gift", Name = "资源赠与 → 终极技", Trigger = "把 Focus 赠满队友",
            Effect = "队友下次终极技每击 +3 伤害。", Preview = "赠满 Focus：终极技 +3/击" }
    };

    public static SynergyDef? Get(string id) => Catalog.FirstOrDefault(s => s.Id == id);

    private static void Trigger(GameState state, CombatState combat, string id, string text)
    {
        if (!state.Synergies.Contains(id)) state.Synergies.Add(id);
        state.Stats.SynergyTriggers++;
        combat.Log.Add($"协同 · {Get(id)?.Name ?? id}：{text}");
    }

    /* ── 伤害结算 ─────────────────────────────────────────────── */

    /// <summary>命中修正：暴露让技能几乎必中。</summary>
    public static int AccuracyBonus(CombatUnit target) => target.Statuses.Any(s => s.Exposed) ? 20 : 0;

    /// <summary>伤害修正 + 护盾反击 + 掩护分摊。返回最终伤害。</summary>
    public static int OnIncomingDamage(GameState state, CombatState combat, CombatUnit attacker,
        CombatUnit target, SkillDef skill, int damage, ref CombatUnit? counterSource)
    {
        if (damage <= 0 || attacker.Side == Side.Player && target.Side == Side.Player) return damage;

        // 标记 → 集火：不是自己标的，才算协同
        var mark = target.Statuses.FirstOrDefault(s => s.Marked && s.SourceId != attacker.Id);
        if (mark is not null && attacker.Side == Side.Player)
        {
            damage += (damage * 15 + 99) / 100;
            Trigger(state, combat, "focus_fire", $"{attacker.Name} 打在被 {mark.SourceId} 标记的目标上，伤害 +15%。");
            if (mark.SourceId is not null)
            {
                var marker = combat.Units.FirstOrDefault(u => u.Id == mark.SourceId);
                if (marker?.PlayerId is not null && attacker.PlayerId is not null)
                    RelationshipEngine.OnSynergy(state, marker.PlayerId, attacker.PlayerId);
            }
        }

        // 控制 → 追加伤害
        if (attacker.Side == Side.Player &&
            target.Statuses.Any(s => s.Stun || s.Taunt))
        {
            damage += (damage * 20 + 99) / 100;
            Trigger(state, combat, "control_burst", $"{target.Name} 处于控制状态，追加 20% 伤害。");
        }

        // 暴露 → 必中（命中在 ResolveAttack 里加；这里补一点伤害并消耗）
        var exposed = target.Statuses.FirstOrDefault(s => s.Exposed);
        if (exposed is not null && attacker.Side == Side.Player)
        {
            damage += (damage * 10 + 99) / 100;
            target.Statuses.Remove(exposed);
            Trigger(state, combat, "expose_true", $"暴露被兑现：{attacker.Name} 的 {skill.Name} 命中并追加 10%。");
        }

        // 护盾 → 反击：只对近战，且每轮一次
        if (damage > 0 && target.Shield > 0 && !string.IsNullOrWhiteSpace(target.ShieldFrom))
        {
            var source = combat.Units.FirstOrDefault(u => u.Id == target.ShieldFrom && !u.Downed);
            var roundKey = $"counter:{target.Id}:{combat.Round}";
            if (source is not null && source.Side == Side.Player && !source.Statuses.Any(s => s.Id == roundKey))
            {
                source.Statuses.Add(new StatusState { Id = roundKey, Name = "反击已用", Duration = 1, IsBuff = true });
                DirectCounter(combat, source, attacker, 3);
                Trigger(state, combat, "shield_counter", $"{source.Name} 的护盾替 {target.Name} 反击了 {attacker.Name} 3 点。");
                if (source.PlayerId is not null && target.PlayerId is not null)
                    RelationshipEngine.OnSynergy(state, source.PlayerId, target.PlayerId);
            }
        }

        return damage;
    }

    private static void DirectCounter(CombatState combat, CombatUnit source, CombatUnit attacker, int amount)
    {
        attacker.Hp = Math.Max(0, attacker.Hp - amount);
        if (attacker.Hp <= 0) attacker.Downed = true;
    }

    /// <summary>掩护（assistGuard）：把一半伤害转给承担者。</summary>
    public static int RedirectGuard(GameState state, CombatState combat, CombatUnit target, int damage, out CombatUnit? guardian)
    {
        guardian = null;
        var link = target.Statuses.FirstOrDefault(s => s.Id == "guard_link");
        if (link?.SourceId is null || damage <= 0) return damage;
        var g = combat.Units.FirstOrDefault(u => u.Id == link.SourceId && !u.Downed);
        if (g is null) return damage;
        guardian = g;
        var shared = Math.Max(1, damage / 2);
        g.Hp = Math.Max(0, g.Hp - shared);
        if (g.Hp <= 0) g.Downed = true;
        combat.Log.Add($"协同 · 掩护：{g.Name} 替 {target.Name} 承担了 {shared} 点伤害。");
        return damage - shared;
    }

    /* ── 治疗 / 召唤 / 回合结束 ───────────────────────────────── */

    public static void OnHeal(CombatState combat, CombatUnit healer, CombatUnit target, int healed)
    {
        if (healed <= 0 || healer.Side != Side.Player || target.Side != Side.Player) return;
        var debuff = target.Statuses.FirstOrDefault(s => !s.IsBuff && s.Id != "guard_link");
        if (debuff is not null) target.Statuses.Remove(debuff);
        target.Statuses.Add(new StatusState { Id = "heal_purify", Name = "净化余温", Duration = 1, ArmorMod = 1, IsBuff = true });
        combat.Log.Add($"协同 · 治疗 → 净化：{healer.Name} 的治疗清除了 {target.Name} 的 1 个负面状态，+1 护甲 1 回合。");
    }

    public static void OnSummon(CombatState combat, CombatUnit summon)
    {
        foreach (var ally in combat.Units.Where(u => u.Side == summon.Side && !u.Downed && !u.IsSummon))
        {
            if (Hex.Distance(ally.Col, ally.Row, summon.Col, summon.Row) > 1) continue;
            ally.Shield += 4;
            combat.Log.Add($"协同 · 召唤 → 掩护：{summon.Name} 为相邻的 {ally.Name} 提供 4 点护盾。");
        }
    }

    public static void OnTurnEnd(GameState state, CombatState combat, CombatUnit unit)
    {
        if (unit.Side != Side.Player || unit.Downed) return;
        var ally = combat.Units.FirstOrDefault(u => u.Side == Side.Player && u.Id != unit.Id && !u.Downed &&
            Hex.Distance(u.Col, u.Row, unit.Col, unit.Row) == 1);
        if (ally is null) return;
        if (ally.Statuses.Any(s => s.Id == "speed_chain")) return;
        ally.Statuses.Add(new StatusState { Id = "speed_chain", Name = "连携", Duration = 2, MovementMod = 1, IsBuff = true });
        Trigger(state, combat, "speed_chain", $"{unit.Name} 在 {ally.Name} 旁边结束回合，{ally.Name} 下回合移动 +1。");
        if (unit.PlayerId is not null && ally.PlayerId is not null)
            RelationshipEngine.OnSynergy(state, unit.PlayerId, ally.PlayerId);
    }

    /// <summary>技能卡预览里的一行协同提示。</summary>
    public static string PreviewFor(SkillDef skill) => skill.Target switch
    {
        TargetType.Enemy => "协同：对受控/被标记目标有额外伤害",
        TargetType.Ally or TargetType.AllAllies => "协同：治疗会附带净化；赠满 Focus 强化终极技",
        _ => ""
    };
}
