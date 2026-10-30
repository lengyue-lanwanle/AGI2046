namespace AGI2046.Rules;

/// <summary>
/// 规则变异的唯一开关表（0.21）。所有 hook 都是「没有变异就返回默认值」，
/// 所以标准局的数值与 0.20 完全一致，变异也永远可解释。
/// </summary>
public static class ChallengeEngine
{
    public static bool Has(GameState state, string id)
        => state.Challenge?.MutatorIds.Contains(id) == true;

    public static MutatorDef? Def(string id) => GameData.Mutator(id);

    public static List<MutatorDef> Defs(GameState state)
        => (state.Challenge?.MutatorIds ?? new List<string>())
            .Select(GameData.Mutator).Where(m => m is not null).Select(m => m!).ToList();

    /* ── 时钟 / 经济 ─────────────────────────────────────────────── */

    public static int PurgeTickEvery(GameState state) => Has(state, "tracking_fast") ? 3 : 4;

    public static double ShopPriceMul(GameState state) => Has(state, "scarcity") ? 1.35 : 1.0;

    /// <summary>正收益的统一倍率。负面数值不乘，避免「资源匮乏」把惩罚也放大。</summary>
    public static double RewardMul(GameState state)
    {
        var mul = 1.0;
        if (Has(state, "tracking_fast")) mul *= 1.2;
        if (Has(state, "scarcity")) mul *= 1.3;
        if (Has(state, "hostile")) mul *= 1.25;
        if (Has(state, "poverty")) mul *= 1.5;
        return mul;
    }

    public static int Reward(GameState state, int amount)
        => amount <= 0 ? amount : (int)Math.Round(amount * RewardMul(state));

    /* ── 队伍 / 战斗 ─────────────────────────────────────────────── */

    public static double PlayerMaxHpMul(GameState state) => Has(state, "glass") ? 0.75 : 1.0;
    public static double PlayerDamageMul(GameState state) => Has(state, "glass") ? 1.2 : 1.0;

    public static double EnemyDamageMul(GameState state)
    {
        var mul = Has(state, "hostile") ? 1.15 : 1.0;
        mul *= state.Challenge?.Difficulty switch
        {
            "hard" => 1.1,
            "nightmare" => 1.22,
            _ => 1.0
        };
        return mul;
    }

    public static int SkillCooldownBonus(GameState state) => Has(state, "cooldown") ? 1 : 0;
    public static int TeamCap(GameState state) => Has(state, "few") ? 3 : 4;

    public static int TeamCapOf(ChallengeRun? run)
        => run is not null && run.MutatorIds.Contains("few") ? 3 : 4;

    public static bool HasMutator(ChallengeRun? run, string id)
        => run is not null && run.MutatorIds.Contains(id);
    public static double XpMul(GameState state) => Has(state, "few") ? 1.3 : 1.0;
    public static bool NoHoard(GameState state) => Has(state, "no_hoard");
    public static bool NoRevive(GameState state) => Has(state, "ironman");
    public static bool Fog(GameState state) => Has(state, "fog");
    public static int StartMemory(GameState state) => Has(state, "poverty") ? 0 : 120;
    public static int TeamLives(GameState state) => Has(state, "ironman") ? 1 : 3;

    public static double EliteHpMul(GameState state)
    {
        var mul = 1.0;
        if (Has(state, "elite_hunt")) mul *= 1.4;
        if (Has(state, "deep_awaken")) mul *= 1.25;
        return mul;
    }

    /// <summary>开局/换幕：把变异写进地图与队伍。必须幂等。</summary>
    public static void ApplyToRun(GameState state)
    {
        foreach (var p in state.Players)
        {
            p.HpScale = PlayerMaxHpMul(state);
            GameRules.RecalculatePlayer(p);
            if (p.Hp > p.MaxHp) p.Hp = p.MaxHp;
        }
    }

    public static void ApplyToMap(GameState state)
    {
        if (state.Challenge is null) return;
        if (Has(state, "no_safehouse"))
        {
            var shelters = state.Nodes.Where(n => n.Type == NodeType.Safehouse).OrderBy(n => n.Layer).ToList();
            foreach (var node in shelters.Take(2))
            {
                node.Type = NodeType.Event;
                var ids = GameData.Events.Values.Where(e => e.Act == state.Act).Select(e => e.Id).OrderBy(x => x).ToList();
                node.EventId = ids.Count > 0 ? ids[Stable.Hash(node.Id) % ids.Count] : null;
                node.Name = $"被封存的安全屋";
                node.Desc = "门是从里面锁上的。屋里还有一台没断电的终端——进去就得先付点什么。";
            }
        }
        if (Has(state, "global_fault"))
        {
            var candidates = new[] { NodeType.Trap, NodeType.Corpse, NodeType.Shop, NodeType.Server };
            var closed = candidates[Math.Abs(Stable.Hash($"fault{state.Seed}:{state.Act}")) % candidates.Length];
            foreach (var node in state.Nodes.Where(n => n.Type == closed))
            {
                node.Type = NodeType.Blank;
                node.Name = "全局故障 · 已下线";
                node.Desc = $"这一类节点在本幕被协议关闭了（{closed}）。";
                node.Flavor = "协议把这一段城市擦掉了。这里什么都没有，连回声都没有。";
                node.Cleared = true;
            }
            state.ClosedNodeType = closed.ToString();
        }
        if (Has(state, "fog"))
        {
            var start = state.Nodes.FirstOrDefault(n => n.Type == NodeType.Start);
            var near = new HashSet<string>(start?.Neighbors ?? new List<string>());
            foreach (var node in state.Nodes)
                node.Revealed = node.Type == NodeType.Start || (start is not null && near.Contains(node.Id));
        }
    }

    /// <summary>战斗开始：精英加血、敌方增伤。</summary>
    public static void OnCombatStart(GameState state, CombatState combat)
    {
        if (state.Challenge is null) return;
        var eliteMul = EliteHpMul(state);
        if (eliteMul > 1)
        {
            foreach (var u in combat.Units.Where(u => u.Side == Side.Enemy))
            {
                u.Hp = (int)Math.Round(u.Hp * eliteMul);
                u.MaxHp = (int)Math.Round(u.MaxHp * eliteMul);
            }
        }
        var enemyMul = EnemyDamageMul(state);
        if (enemyMul > 1)
        {
            var bonus = Math.Max(1, (int)Math.Round(4 * (enemyMul - 1)));
            foreach (var u in combat.Units.Where(u => u.Side == Side.Enemy)) u.DamageBonus += bonus;
            combat.Log.Add($"挑战协议：敌方伤害 +{bonus}（{enemyMul:0.##}×）。");
        }
    }

    /// <summary>技能使用后：过热与镜像。只作用于本场战斗，且都有上限。</summary>
    public static void OnSkillUsed(GameState state, CombatState combat, CombatUnit caster, SkillDef skill)
    {
        if (state.Challenge is null || caster.Side != Side.Player) return;
        if (skill.IsUltimate) return;

        if (Has(state, "cooldown"))
        {
            // 基础冷却已经由 CombatEngine 写入；这里再 +1（0 冷却技能也会变成 1 回合）
            caster.Cooldowns[skill.Id] = caster.Cooldowns.GetValueOrDefault(skill.Id) + 1;
            combat.Log.Add($"冷却失控：「{skill.Name}」冷却 +1。");
        }

        if (Has(state, "overheat"))
        {
            var used = combat.SkillRepeats.GetValueOrDefault(skill.Id);
            if (used >= 1)
            {
                caster.AccuracyBonus -= 8;
                combat.Log.Add($"过热：{caster.Name} 重复使用「{skill.Name}」，命中 −8%（累计 {Math.Min(24, used * 8)}%）。");
            }
            combat.SkillRepeats[skill.Id] = Math.Min(9, used + 1);
        }

        if (Has(state, "mirror") && combat.MirrorStacks < 3)
        {
            combat.MirrorStacks++;
            foreach (var e in combat.Units.Where(u => u.Side == Side.Enemy && !u.Downed))
            {
                e.Armor += 2;
                e.Resistance += 2;
            }
            combat.Log.Add($"镜像协议：敌方复制了「{skill.Name}」的结构，全体护甲/抗性 +2（{combat.MirrorStacks}/3）。");
        }
    }

    /// <summary>换幕：反囤积把消耗品清空。</summary>
    public static void OnActStart(GameState state)
    {
        if (state.Challenge is null || !NoHoard(state)) return;
        foreach (var p in state.Players)
        {
            var lost = p.Consumables.Values.Sum();
            if (lost <= 0) continue;
            p.Consumables.Clear();
            GameRules.Log(state, $"反囤积：{p.Name} 的 {lost} 件消耗品在协议转移时作废。", "warn");
        }
    }

    /// <summary>觉醒节点额外加成（深层觉醒）。</summary>
    public static void OnAwaken(GameState state, PlayerState p)
    {
        if (!Has(state, "deep_awaken")) return;
        p.ServerBonus.Vit += 2;
        p.ServerBonus.C += 2;
        p.ServerBonus.H += 2;
        p.ServerBonus.E += 2;
        p.ServerBonus.Spd += 2;
        p.ServerBonus.L += 2;
        GameRules.RecalculatePlayer(p);
        GameRules.Log(state, "深层觉醒：额外 +2 全属性。", "level");
    }

    /* ── 配置解析 ───────────────────────────────────────────────── */

    /// <summary>把请求里的配置规范化：去重、校验解锁、算倍率。非法直接拒绝，不做静默降级。</summary>
    public static ChallengeRun BuildRun(ChallengeConfig config, IReadOnlySet<string> unlocked, int fallbackSeed)
    {
        var ids = (config.MutatorIds ?? new List<string>())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        foreach (var id in ids)
        {
            var def = GameData.Mutator(id) ?? throw new GameException($"未知的规则变异：{id}");
            if (def.UnlockId is not null && !unlocked.Contains(def.UnlockId))
                throw new GameException($"「{def.Name}」还没有解锁。");
        }
        var difficulty = (config.Difficulty ?? "normal").ToLowerInvariant();
        if (difficulty is not ("normal" or "hard" or "nightmare"))
            throw new GameException($"未知难度：{config.Difficulty}");
        var mul = ids.Select(GameData.Mutator).Where(m => m is not null).Aggregate(1.0, (a, m) => a * m!.ScoreMul);
        mul *= difficulty switch { "hard" => 1.25, "nightmare" => 1.6, _ => 1.0 };
        return new ChallengeRun
        {
            Kind = ids.Count == 0 ? "custom_seed" : "mutated",
            ChallengeId = string.IsNullOrWhiteSpace(config.ChallengeId) ? null : config.ChallengeId,
            Seed = config.Seed != 0 ? config.Seed : fallbackSeed,
            MutatorIds = ids,
            Difficulty = difficulty,
            ScoreMultiplier = Math.Round(mul, 2),
            StartedAt = DateTimeOffset.UtcNow
        };
    }

    public static string MutatorSummary(GameState state)
        => state.Challenge is null || state.Challenge.MutatorIds.Count == 0
            ? "标准协议"
            : string.Join(" · ", Defs(state).Select(m => m.Name));
}
