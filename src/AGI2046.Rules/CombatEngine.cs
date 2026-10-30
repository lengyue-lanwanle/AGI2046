namespace AGI2046.Rules;

public static class CombatEngine
{
    private static readonly Random NoRng = new(1);

    private static void CombatLog(CombatState combat, string text) => GameRules.CombatLog(combat, text);

    /// <param name="enemyGroupId">可选：强制指定敌人组。脚本遭遇与审计探针用，正常流程传 null。</param>
    public static GameState StartCombat(GameState state, PlayerState activePlayer, NodeState node, string? enemyGroupId = null)
    {
        var groupId = enemyGroupId ?? node.EnemyGroup ?? "g_patrol";
        if (!GameData.EnemyGroups.TryGetValue(groupId, out var enemyIds))
            enemyIds = GameData.EnemyGroups["g_patrol"];

        // 摸到首领门口说明线索收束了：追踪网暂时跟丢，补 2 点。
        // 没有这条，玩家一路省着走也会在第 20 轮被终局战斗的时钟拖死——那不是难度，是惩罚探索。
        var trackingSlip = node.Type == NodeType.Boss && state.Purge < state.PurgeMax;
        if (trackingSlip)
        {
            GameRules.AdjustPurge(state, 2);
            state.Message = "你们贴到了信标边缘，追踪网暂时跟丢（电子追踪 +2）。";
        }

        var combat = new CombatState
        {
            NodeId = node.Id,
            EnemyGroupId = groupId,
            Width = 7,
            Height = 5,
            Round = 1,
            Hint = (isSkirmishHint(node) ? "小规模遭遇。移动不结束回合；攻击、技能或防御会结束当前单位的回合。" : "移动不结束回合。攻击、技能或防御会结束当前单位的回合。")
        };
        var mechanicHint = MechanicHint(groupId);
        if (!string.IsNullOrWhiteSpace(mechanicHint)) combat.Hint += "\n" + mechanicHint;

        combat.Terrain.Add(new TerrainState { Col = 3, Row = 0, Type = "obstacle", Name = "断墙" });
        combat.Terrain.Add(new TerrainState { Col = 3, Row = 4, Type = "obstacle", Name = "塌陷" });
        combat.Terrain.Add(new TerrainState { Col = 2, Row = 2, Type = "cover", Name = "掩体" });
        combat.Terrain.Add(new TerrainState { Col = 4, Row = 2, Type = "cover", Name = "掩体" });
        combat.Terrain.Add(new TerrainState { Col = 1, Row = 1, Type = "cover", Name = "掩体" });
        combat.Terrain.Add(new TerrainState { Col = 5, Row = 3, Type = "cover", Name = "掩体" });

        var playerSpawns = new[] { (0, 0), (0, 2), (0, 4), (1, 1) };
        var enemySpawns = new[] { (6, 0), (6, 2), (6, 4), (5, 1) };
        var allies = state.Players.Where(p => p.NodeId == node.Id && !p.Downed).ToList();
        if (allies.Count == 0) allies.Add(activePlayer);

        // 1–4 人合作：遭遇规模随实际参战人数缩放，避免单人面对整组敌人。
        var partySize = Math.Max(1, allies.Count);
        var isSkirmish = node.Type == NodeType.Skirmish;
        // 队伍越少，分摊到每个人头上的敌人就越多。旧规则是「人数 + 1」：
        // 2 人队要吃 3 个敌人（每人 1.5 个），4 人队只要 4 个（每人 1 个）——
        // 2 人队「每人承受的伤害份数」是 4 人队的两倍，是全场最陡的比例（实测真机 25 轮就被时钟追上）。
        // 改成「每人一个」：2 人队面对 2 个敌人。敌人的绝对强度用 hpScale 补回来。
        // 教学固定只有一个软目标：教学要教「读意图 / 用技能」，不是教「被围殴」。
        var enemyLimit = state.Mode == GameMode.Tutorial
            ? 1
            : node.Type == NodeType.Boss
            ? Math.Min(4, partySize)
            : isSkirmish ? Math.Min(2, partySize)
            : partySize == 2 ? 2
            : Math.Min(4, partySize + 1);
        // 小型战斗：1–2 个敌人、血量 70%，目标 1–2 回合结束
        // 2 人队原本 0.8 是配 3 个敌人的；改成 2 个敌人后需要单体更硬，所以抬到 0.9。
        var hpScale = (partySize == 2 ? 0.9 : 0.7 + 0.1 * (partySize - 1)) * (isSkirmish ? 0.7 : 1.0);
        if (state.Mode == GameMode.Tutorial) hpScale = 0.6;   // 30 × 0.6 = 18 HP：两轮打完，够看清流程
        // 「信号」是敌方警戒度：事件里加信号会一路带到战斗里（0.12.0 里这个值只显示、没人读）
        var signalPressure = Math.Clamp(state.Signal - 2, 0, 6);
        hpScale *= 1 + signalPressure * 0.05;
        var enemyDamageBonus = partySize == 1 ? -2 : partySize == 2 ? -1 : 0;

        var spawnIndex = 0;
        foreach (var p in allies)
        {
            var weapon = GameRules.Weapon(p);
            var (col, row) = playerSpawns[Math.Min(spawnIndex, playerSpawns.Length - 1)];
            spawnIndex++;
            if (combat.Units.Any(u => u.Col == col && u.Row == row))
            {
                var free = FindFreeHex(combat, 0, 3);
                if (free is not null) (col, row) = (free.Value.col, free.Value.row);
            }
            var unit = new CombatUnit
            {
                Id = $"u_{p.Id}",
                Name = p.Name,
                Side = Side.Player,
                PlayerId = p.Id,
                Portrait = p.Portrait,
                Color = p.Color,
                Role = p.Role,
                Hp = p.Hp,
                MaxHp = p.MaxHp,
                Armor = p.Armor,
                Resistance = p.Resistance,
                Evasion = p.Evasion,
                Speed = p.Stats.Spd,
                AccuracyBonus = p.AccuracyBonus + p.AssistBonus,
                DamageBonus = p.DamageBonus,
                Focus = p.Focus,
                MaxFocus = p.MaxFocus,
                Col = col,
                Row = row,
                Movement = p.Movement,
                MovementLeft = p.Movement,
                Stats = p.Stats.Clone(),
                SkillIds = p.SkillIds.ToList(),
                PassiveKey = p.PassiveKey,
                WeaponItemId = weapon?.ItemId,
                WeaponName = weapon?.Name ?? "拳头",
                WeaponDice = weapon?.Dice ?? 2,
                WeaponAccuracy = weapon?.Accuracy ?? 65,
                WeaponDamage = weapon?.DamagePerDie ?? 2,
                WeaponType = weapon?.DamageType ?? DamageType.Physical,
                WeaponScale = weapon?.ScaleStat ?? "H",
                WeaponRange = weapon?.Range ?? 1
            };
            combat.Units.Add(unit);
        }

        var enemyIndex = 0;
        foreach (var enemyId in enemyIds.Take(enemyLimit))
        {
            if (!GameData.Enemies.TryGetValue(enemyId, out var def)) continue;
            var (col, row) = enemySpawns[Math.Min(enemyIndex, enemySpawns.Length - 1)];
            enemyIndex++;
            if (combat.Units.Any(u => u.Col == col && u.Row == row))
            {
                var free = FindFreeHex(combat, 6, 3);
                if (free is not null) (col, row) = (free.Value.col, free.Value.row);
            }
            var scaledHp = Math.Max(1, (int)Math.Round(def.Hp * hpScale));
            combat.Units.Add(new CombatUnit
            {
                Id = $"u_e{enemyIndex}",
                Name = def.Name,
                Side = Side.Enemy,
                EnemyId = def.Id,
                Color = def.Color,
                Role = def.Role,
                Hp = scaledHp,
                MaxHp = scaledHp,
                Armor = def.Armor,
                Resistance = def.Resistance,
                Evasion = def.Evasion,
                Speed = def.Speed,
                DamageBonus = enemyDamageBonus,
                Col = col,
                Row = row,
                Movement = def.Movement,
                MovementLeft = def.Movement,
                // 敌人也要有 Focus：否则 FocusCost>0 的技能（镜墙 / 标记载入）永远进不了 AI 候选
                Focus = 3,
                MaxFocus = 3,
                SkillIds = def.SkillIds.ToList(),
                Stats = new Stats(55, 55, 55, 55, def.Speed, 50),
                WeaponName = "敌袭",
                WeaponDice = 2,
                WeaponAccuracy = 70,
                WeaponDamage = 3,
                WeaponRange = def.Ranged ? 4 : 1
            });
        }

        // 协同：支援动作留下的掩护/终极预备，在这里结算成战斗内的状态
        foreach (var u in combat.Units.Where(u => u.Side == Side.Player))
        {
            var owner = state.Players.FirstOrDefault(p => p.Id == u.PlayerId);
            if (owner is null) continue;
            if (!string.IsNullOrWhiteSpace(owner.GuardLinkFrom))
            {
                var guard = combat.Units.FirstOrDefault(x => x.PlayerId == owner.GuardLinkFrom);
                if (guard is not null)
                {
                    AddStatus(u, "guard_link", "掩护", 2, isBuff: true, sourceId: guard.Id);
                    combat.Log.Add($"协同 · 掩护：{guard.Name} 会在本场战斗替 {u.Name} 承担一半伤害。");
                }
                owner.GuardLinkFrom = null;
            }
            if (owner.UltimatePrep > 0)
            {
                u.UltimateBonus = owner.UltimatePrep;
                combat.Log.Add($"协同 · 资源赠与：{u.Name} 的终极技每击 +{owner.UltimatePrep}。");
                owner.UltimatePrep = 0;
            }
        }
        var rng = new Random(state.Seed ^ (state.Log.Count * 37) ^ Stable.Hash(node.Id));
        state.Stats.Battles++;
        foreach (var e in combat.Units.Where(u => u.Side == Side.Enemy && !string.IsNullOrWhiteSpace(u.EnemyId)))
            if (!state.Stats.SeenEnemies.Contains(e.EnemyId!)) state.Stats.SeenEnemies.Add(e.EnemyId!);
        ChallengeEngine.OnCombatStart(state, combat);
        RelationshipEngine.ApplyCombatBonus(state, combat);
        BossMechanics.OnCombatStart(state, combat);
        GearTraits.OnCombatStart(state, combat);
        var traceNoise = ConsequenceEngine.EnemyAccuracyMod(state);
        if (traceNoise != 0)
            foreach (var enemy in combat.Units.Where(u => u.Side == Side.Enemy))
                enemy.AccuracyBonus += traceNoise;
        var bossHpMul = ConsequenceEngine.BossHpMul(state);
        if (bossHpMul != 1)
            foreach (var boss in combat.Units.Where(u => u.Side == Side.Enemy && u.Role == "首领"))
            {
                boss.Hp = (int)Math.Round(boss.Hp * bossHpMul);
                boss.MaxHp = (int)Math.Round(boss.MaxHp * bossHpMul);
                combat.Log.Add($"协议回声：首领生命 +{(bossHpMul - 1) * 100:0}%。");
            }
        var initiative = combat.Units.Select(u => new
        {
            u.Id,
            Score = rng.Next(1, 11) + u.Speed / 10
        }).OrderByDescending(x => x.Score).ThenBy(x => x.Id).Select(x => x.Id).ToList();
        combat.TurnOrder = initiative;
        combat.ActiveUnitId = initiative[0];
        combat.StartTurnOrder = initiative.ToList();
        combat.StartUnits = combat.Units.Select(CloneUnit).ToList();
        combat.StartRound = combat.Round;

        if (combat.Units.Any(u => u.Side == Side.Player && u.PassiveKey == "seed_growth"))
        {
            foreach (var u in combat.Units.Where(u => u.Side == Side.Player && !u.Downed))
            {
                var heal = Math.Min(3, u.MaxHp - u.Hp);
                if (heal > 0) u.Hp += heal;
            }
            CombatLog(combat, "幻乐的种子在战场的裂缝里发芽：全队恢复 3 HP。");
        }

        state.Combat = combat;
        state.Phase = GamePhase.Combat;
        state.LastRoll = null;
        CombatLog(combat, $"战斗开始：{node.Name}。敌方信号 {combat.Units.Count(u => u.Side == Side.Enemy)} 个。");
        if (trackingSlip) CombatLog(combat, "追踪网暂时跟丢：电子追踪 +2。");
        if (signalPressure > 0)
            CombatLog(combat, $"敌方处于警戒状态（信号 {state.Signal}）：敌人生命 +{signalPressure * 5}%。");
        if (combat.Units.Any(u => u.PassiveKey == "perplexity_intel"))
            CombatLog(combat, "提灯标记了敌方信号：护甲与抗性已显示在单位面板。");

        var first = combat.Units.First(u => u.Id == combat.ActiveUnitId);
        BeginUnitTurn(state, combat, first, rng);
        UpdateUiLists(combat);
        if (combat.ActiveUnit?.Side == Side.Enemy) RunEnemyTurns(state, combat, rng);
        return state;
    }

    /// <summary>联机兜底：强制结束当前战斗单位的回合（玩家掉线时由房主触发）。</summary>
    public static GameState SkipActiveUnitTurn(GameState state)
    {
        var combat = state.Combat ?? throw new GameException("当前没有战斗。");
        if (combat.IsOver) return state;
        var active = combat.ActiveUnit ?? throw new GameException("找不到当前单位。");
        var rng = ActionRng(state);
        CombatLog(combat, $"{active.Name} 的回合被房主跳过。");
        FinishUnitTurn(state, combat, active, rng);
        if (!combat.IsOver && combat.ActiveUnit?.Side == Side.Enemy) RunEnemyTurns(state, combat, rng);
        state.Message = "房主跳过了当前回合。";
        return state;
    }

    public static GameState ApplyCombatAction(GameState state, GameAction action)
    {
        var combat = state.Combat ?? throw new GameException("当前没有战斗。");
        if (action.Type == "closeCombat") return CloseCombat(state);
        if (combat.IsOver) return state;
        var active = combat.ActiveUnit ?? throw new GameException("找不到当前单位。");
        if (active.Side != Side.Player) throw new GameException("敌方行动中。");
        if (!string.IsNullOrWhiteSpace(action.PlayerId) && action.PlayerId != active.PlayerId)
            throw new GameException("现在不是该角色的行动轮。");

        var rng = ActionRng(state);

        switch (action.Type)
        {
            // 0.24：首领交易不消耗行动轮，只回应一次开价
            case "bossTrade":
                return BossMechanics.Trade(state, action);
            case "combatMove":
            {
                if (action.Col < 0 || action.Row < 0) throw new GameException("缺少目标格。");
                if (!combat.Reachable.Any(h => h.Col == action.Col && h.Row == action.Row))
                    throw new GameException("该格不可达。");
                var dist = Hex.Distance(active.Col, active.Row, action.Col, action.Row);
                active.Col = action.Col;
                active.Row = action.Row;
                active.MovementLeft = Math.Max(0, active.MovementLeft - dist);
                active.Moved = true;
                CombatLog(combat, $"{active.Name} 移动到 ({active.Col},{active.Row})。");
                GearTraits.OnMoved(state, combat, active);
                UpdateUiLists(combat);
                state.Message = $"{active.Name} 移动。";
                state.LastRoll = null;
                return state;
            }
            case "combatItem":
            {
                var itemId = action.ItemId ?? "";
                if (!GameData.Consumables.TryGetValue(itemId, out var cdef))
                    throw new GameException("没有这个道具。");
                var owner = state.Players.FirstOrDefault(p => p.Id == active.PlayerId);
                if (owner is null || !GameRules.TakeConsumable(owner, itemId))
                    throw new GameException("道具不足。");
                var targetUnit = !string.IsNullOrWhiteSpace(action.TargetUnitId)
                    ? combat.Units.FirstOrDefault(u => u.Id == action.TargetUnitId)
                    : active;
                targetUnit ??= active;
                if (cdef.Scope == "allAllies")
                {
                    foreach (var u in combat.Units.Where(u => u.Side == active.Side && !u.Downed).ToList())
                        ApplyConsumable(combat, u, cdef, owner);
                }
                else
                {
                    ApplyConsumable(combat, targetUnit, cdef, owner);
                }
                CombatLog(combat, $"{active.Name} 使用 {cdef.Name}。");
                state.Message = $"{active.Name} 使用 {cdef.Name}。";
                FinishUnitTurn(state, combat, active, rng);
                if (!combat.IsOver && combat.ActiveUnit?.Side == Side.Enemy) RunEnemyTurns(state, combat, rng);
                return state;
            }
            case "combatDefend":
            {
                active.Shield += 4;
                AddStatus(active, "defend", "防御姿态", 1, isBuff: true, armorMod: 2);
                BossMechanics.OnPlayerAction(state, combat, active, "defend", null);
                CombatLog(combat, $"{active.Name} 进入防御姿态：+4 护盾，+2 护甲。");
                state.Message = $"{active.Name} 防御。";
                FinishUnitTurn(state, combat, active, rng);
                if (!combat.IsOver && combat.ActiveUnit?.Side == Side.Enemy) RunEnemyTurns(state, combat, rng);
                return state;
            }
            case "combatEndTurn":
                CombatLog(combat, $"{active.Name} 结束回合。");
                FinishUnitTurn(state, combat, active, rng);
                if (!combat.IsOver && combat.ActiveUnit?.Side == Side.Enemy) RunEnemyTurns(state, combat, rng);
                return state;
            case "retreat":
                // 主动撤离：不改变胜负，只是把队伍从这个节点撤出去（有失败风险）
                return RetreatCombat(state, active);
            case "combatAction":
            {
                var skill = ResolveSkill(active, action.SkillId);
                if (skill.IsUltimate && active.UltimateUsed) throw new GameException("终极技能每场战斗只能使用一次。");
                if (!skill.IsUltimate && skill.Owner != "summon" && !active.SkillIds.Contains(skill.Id) && skill.Id != "basic")
                    throw new GameException("该单位没有这个技能。");
                if (skill.FocusCost > 0 && active.Focus < skill.FocusCost)
                    throw new GameException($"Focus 不足，需要 {skill.FocusCost}。");
                if (skill.Cooldown > 0 && active.Cooldowns.GetValueOrDefault(skill.Id) > 0)
                    throw new GameException($"{skill.Name} 还在冷却（{active.Cooldowns[skill.Id]} 回合）。");

                if (skill.Special == "copy_ally" && string.IsNullOrWhiteSpace(combat.LastAllySkillId))
                    throw new GameException("没有可借阅的友军技能。");

                var before = CloneState(combat);
                try
                {
                    ExecuteSkill(state, combat, active, skill, action, rng, false);
                }
                catch (GameException)
                {
                    RestoreState(combat, before);
                    throw;
                }

                if (skill.Special == "rewind") active = combat.ActiveUnit ?? active;
                combat.LastPlayerRoll = state.LastRoll ?? combat.LastRoll;
                if (skill.FocusCost > 0)
                {
                    active.Focus -= skill.FocusCost;
                    if (active.PassiveKey == "kimi_store" && !active.KimiUsed)
                    {
                        active.KimiUsed = true;
                        active.Focus = Math.Min(active.MaxFocus, active.Focus + 1);
                        CombatLog(combat, "长夜的被动「借阅不还」返还 1 Focus。");
                    }
                }
                if (skill.Cooldown > 0) active.Cooldowns[skill.Id] = skill.Cooldown + 1;
                if (skill.IsUltimate) active.UltimateUsed = true;
                BossMechanics.OnPlayerAction(state, combat, active, "skill", skill);
                if (skill.IsUltimate) GearTraits.OnUltimate(state, combat, active);
                state.Stats.SkillsUsed++;
                if (skill.IsUltimate) state.Stats.UltimatesUsed++;
                state.Stats.SkillUse[skill.Id] = state.Stats.SkillUse.GetValueOrDefault(skill.Id) + 1;
                if (state.LastRoll is { Damage: > 0 } usedRoll)
                    state.Stats.DamageBySkill[skill.Name] =
                        state.Stats.DamageBySkill.GetValueOrDefault(skill.Name) + usedRoll.Damage;
                ChallengeEngine.OnSkillUsed(state, combat, active, skill);
                if (skill.Special != "copy_ally" && !skill.IsUltimate)
                {
                    combat.LastAllySkillId = skill.Id;
                    combat.LastAllySkillRound = combat.Round;
                }

                if (combat.IsOver) return state;
                FinishUnitTurn(state, combat, active, rng);
                if (!combat.IsOver && combat.ActiveUnit?.Side == Side.Enemy) RunEnemyTurns(state, combat, rng);
                return state;
            }
            default:
                throw new GameException($"战斗中无法执行：{action.Type}");
        }
    }

    /// <summary>
    /// 主动撤离。整队退回「进入战斗前所在的节点」，节点保持未清空（下次还要再打），
    /// 代价是全队失去 10% 最大生命（不致死）。这是死局的唯一软出口。
    /// </summary>
    public static GameState RetreatCombat(GameState state, CombatUnit active)
    {
        var combat = state.Combat ?? throw new GameException("当前没有战斗。");
        if (combat.IsOver) throw new GameException("战斗已经结束。");
        var node = state.Node(combat.NodeId);
        var rng = ActionRng(state);

        // 撤离不是按一下就成功：腿快的更容易跑掉，失败会被咬一口。
        var owner = state.Players.FirstOrDefault(p => p.Id == active.PlayerId);
        var retreatBonus = GearTraits.RetreatBonus(owner);
        var chance = Math.Clamp(40 + (active.Stats.Spd - 50) / 2 + retreatBonus, 10, 95);
        var roll = rng.Next(1, 101);
        state.Stats.RetreatAttempts++;
        state.LastRoll = new RollResult
        {
            Kind = "check",
            Label = "撤离检定",
            Roll = roll,
            Target = chance,
            Success = roll <= chance,
            Dice = new() { new DieResult { Value = roll, Success = roll <= chance } },
            Detail = roll <= chance ? $"撤离成功（{roll} ≤ {chance}）" : $"撤离失败（{roll} > {chance}）"
        };
        if (roll > chance)
        {
            CombatLog(combat, $"{active.Name} 试图带队撤离：{roll} > {chance}，失败。");
            if (GearTraits.RetreatBacklash(owner))
            {
                foreach (var u in combat.Units.Where(u => u.Side == Side.Player && !u.Downed))
                    u.Hp = Math.Max(1, u.Hp - 2);
                CombatLog(combat, "装备特性 · 风险撤退的反面：跑不掉的代价是全队 -2 HP。");
            }
            state.Message = "撤离失败——敌人咬住了队伍。";
            FinishUnitTurn(state, combat, active, rng);
            if (!combat.IsOver && combat.ActiveUnit?.Side == Side.Enemy) RunEnemyTurns(state, combat, rng);
            return state;
        }
        CombatLog(combat, $"{active.Name} 带队撤离：{roll} ≤ {chance}，成功。");
        state.Stats.RetreatSuccess++;

        foreach (var unit in combat.Units.Where(u => u.Side == Side.Player && !u.IsSummon).ToList())
        {
            var p = state.Players.FirstOrDefault(x => x.Id == unit.PlayerId);
            if (p is null) continue;
            if (!p.Downed)
            {
                var loss = Math.Max(3, p.MaxHp * 10 / 100);
                p.Hp = Math.Max(1, p.Hp - loss);
            }
            p.NodeId = RetreatNodeOf(state, p);
            p.Ap = 0;
        }

        state.Combat = null;
        state.Phase = GamePhase.Exploration;
        state.Message = "全队撤出交火区。敌人还守在原处——至少这次先活下来了。";
        GameRules.Log(state, $"撤出战斗：「{node?.Name ?? combat.NodeId}」未清空。参战成员各失去 10% 最大生命。", "warn");
        GameEngine.AdvanceExplorationTurn(state);
        return state;
    }

    private static string RetreatNodeOf(GameState state, PlayerState player)
    {
        if (!string.IsNullOrWhiteSpace(player.LastNodeId) && state.Node(player.LastNodeId) is not null)
            return player.LastNodeId;
        return "start";
    }

    public static GameState CloseCombat(GameState state)
    {
        if (state.Combat is null) return state;
        if (!state.Combat.IsOver) throw new GameException("战斗尚未结束。");
        state.Combat = null;
        // 首领胜利会把阶段直接推到幕间或结局，此时只清战斗快照，
        // 不能把阶段覆盖回探索——否则第二、三幕和结局永远进不去。
        if (state.Phase != GamePhase.Combat) return state;
        state.Phase = GamePhase.Exploration;
        if (state.ActivePlayer is not null)
        {
            state.ActivePlayer.Ap = 0;
            GameEngine.AdvanceExplorationTurn(state);
        }
        return state;
    }

    private static SkillDef ResolveSkill(CombatUnit unit, string? skillId)
    {
        if (string.IsNullOrWhiteSpace(skillId) || skillId == "basic")
        {
            return new SkillDef
            {
                Id = "basic",
                Name = string.IsNullOrWhiteSpace(unit.WeaponName) ? "攻击" : unit.WeaponName,
                Desc = "基础攻击",
                Owner = "basic",
                Range = unit.WeaponRange,
                Dice = unit.WeaponDice,
                Accuracy = unit.WeaponAccuracy,
                DamagePerDie = unit.WeaponDamage,
                DamageType = unit.WeaponType,
                ScaleStat = unit.WeaponScale,
                Target = TargetType.Enemy,
                Icon = "⚔"
            };
        }
        if (!GameData.Skills.TryGetValue(skillId, out var skill))
            throw new GameException("未知技能。");
        return skill;
    }

    private static void ExecuteSkill(GameState state, CombatState combat, CombatUnit caster, SkillDef skill,
        GameAction action, Random rng, bool isCopy)
    {
        if (skill.Special == "rewind")
        {
            RestoreSnapshot(state, combat, caster);
            return;
        }
        if (skill.Special == "copy_ally")
        {
            var copyId = combat.LastAllySkillId;
            if (string.IsNullOrWhiteSpace(copyId) || !GameData.Skills.TryGetValue(copyId, out var copied))
                throw new GameException("没有可复制的技能。");
            if (copied.Id == skill.Id || copied.IsUltimate)
                throw new GameException("这个技能无法被借阅。");
            CombatLog(combat, $"{caster.Name} 借阅了 {copied.Name}。");
            ExecuteSkill(state, combat, caster, copied, action, rng, true);
            return;
        }

        var targets = SelectTargets(combat, caster, skill, action);
        if (skill.Target == TargetType.Enemy && targets.Count == 0)
            throw new GameException("没有合法目标。");
        if (skill.Target == TargetType.Ally && targets.Count == 0)
            throw new GameException("没有合法友军目标。");
        if (skill.Target is TargetType.AllEnemies && targets.Count == 0)
            throw new GameException("射程内没有敌人。");

        // 观战端回放用：记录动作前的站位与目标，客户端据此播前冲/落点环。
        // 用列表而不是单条：一次 action 会连带跑敌方回合，每条都要能演出。
        var trace = new CombatActionTrace
        {
            Seq = (combat.LastActions.Count > 0 ? combat.LastActions[^1].Seq : 0) + 1,
            CasterId = caster.Id,
            SkillId = skill.Id,
            CasterCol = caster.Col,
            CasterRow = caster.Row,
            TargetCol = targets.Count > 0 ? targets[0].Col : caster.Col,
            TargetRow = targets.Count > 0 ? targets[0].Row : caster.Row,
            Targets = targets.Select(t => new HexPos(t.Col, t.Row)).ToList(),
            Ranged = skill.Range > 1 || skill.Target is TargetType.AllEnemies or TargetType.AllAllies or TargetType.Self,
            Dice = skill.Dice
        };
        combat.LastActions.Add(trace);
        if (combat.LastActions.Count > 12) combat.LastActions.RemoveRange(0, combat.LastActions.Count - 12);

        if (skill.Special == "dash" && targets.Count > 0)
            DashAdjacent(combat, caster, targets[0]);

        var dice = skill.Dice;
        if (skill.Effects.Any(e => e.Type == "echo_bonus") &&
            !string.IsNullOrWhiteSpace(combat.LastAllySkillId) &&
            combat.LastAllySkillRound == combat.Round)
            dice += 1;

        var globals = skill.Effects.Where(IsGlobalEffect).ToList();
        var perTarget = skill.Effects.Where(e => !IsGlobalEffect(e)).ToList();

        if (skill.Dice > 0)
        {
            foreach (var target in targets)
            {
                var hits = ResolveAttack(state, combat, caster, target, skill, dice, rng);
                if (combat.LastRoll is { } hitRoll)
                {
                    trace.Hits.Add(new CombatHitTrace
                    {
                        TargetId = target.Id,
                        Damage = hitRoll.Damage,
                        Hits = hitRoll.Hits,
                        Perfect = hitRoll.Perfect,
                        Evaded = hitRoll.Hits == 0 && hitRoll.Dice is { Count: > 0 }
                                 && (hitRoll.Detail?.Contains("闪避") ?? false)
                    });
                }
                if (hits > 0)
                    ApplyEffectsPerTarget(state, combat, caster, target, perTarget, hits, rng);
                CombatLog(combat, $"{caster.Name} 使用「{skill.Name}」攻击 {target.Name}：{combat.LastRoll?.Detail ?? ""}");
                if (CheckCombatEnd(state, combat)) return;
            }
        }
        else
        {
            foreach (var target in targets)
            {
                ApplyEffectsPerTarget(state, combat, caster, target, perTarget, 1, rng);
                if (CheckCombatEnd(state, combat)) return;
            }
            state.LastRoll = new RollResult
            {
                Kind = "support",
                Label = skill.Name,
                SkillName = skill.Name,
                AttackerName = caster.Name,
                TargetName = targets.FirstOrDefault()?.Name,
                Success = true,
                Detail = skill.Desc
            };
            CombatLog(combat, $"{caster.Name} 使用「{skill.Name}」。");
        }

        if (globals.Count > 0)
            ApplyGlobalEffects(state, combat, caster, globals, targets, rng);

        if (skill.Special == "retreat" && targets.Count > 0)
            RetreatFrom(combat, caster, targets[0]);
    }

    private static bool IsGlobalEffect(EffectDef e) => e.Type is
        "summon" or "summon_enemy" or "reset_cooldowns" or "purge" or "self_damage" or
        "heal_all_allies" or "buff_all_allies" or "debuff_all_enemies" or "mark_all" or "taunt_all" or
        "random_targets";

    private static void ApplyGlobalEffects(GameState state, CombatState combat, CombatUnit caster,
        List<EffectDef> effects, List<CombatUnit> targets, Random rng)
    {
        foreach (var effect in effects)
        {
            switch (effect.Type)
            {
                case "self_damage":
                    DirectDamage(combat, caster, effect.Amount, caster, "反噬");
                    break;
                case "purge":
                    GameRules.AdjustPurge(state, effect.Amount);
                    CombatLog(combat, $"净化进度 +{effect.Amount}。");
                    break;
                case "summon":
                    SummonUnit(state, combat, caster, effect.Value ?? "summon_puppet", effect.Duration);
                    break;
                case "summon_enemy":
                    SummonEnemy(state, combat, caster, effect.Value ?? "e_sentinel", effect.Duration);
                    break;
                case "reset_cooldowns":
                    foreach (var ally in combat.Units.Where(u => u.Side == caster.Side && !u.Downed))
                        ally.Cooldowns.Clear();
                    CombatLog(combat, "所有友军的技能冷却被重置。");
                    break;
                case "heal_all_allies":
                    foreach (var ally in combat.Units.Where(u => u.Side == caster.Side && !u.Downed))
                        HealUnit(combat, caster, ally, effect.Amount);
                    break;
                case "buff_all_allies":
                    foreach (var ally in combat.Units.Where(u => u.Side == caster.Side && !u.Downed))
                        AddStatusFromEffect(combat, ally, effect, caster);
                    break;
                case "debuff_all_enemies":
                    foreach (var enemy in combat.Units.Where(u => u.Side != caster.Side && !u.Downed))
                        AddStatusFromEffect(combat, enemy, effect, caster);
                    break;
                case "mark_all":
                    foreach (var enemy in combat.Units.Where(u => u.Side != caster.Side && !u.Downed))
                        AddStatus(enemy, "mark", "标记", Math.Max(1, effect.Duration), isBuff: false, marked: true, sourceId: caster.Id);
                    CombatLog(combat, $"{caster.Name} 标记了所有敌人。");
                    break;
                case "taunt_all":
                    foreach (var enemy in combat.Units.Where(u => u.Side != caster.Side && !u.Downed))
                        AddStatus(enemy, "taunt", "嘲讽", Math.Max(1, effect.Duration), isBuff: false, taunt: true, sourceId: caster.Id);
                    CombatLog(combat, $"{caster.Name} 嘲讽了所有敌人。");
                    break;
            }
        }
    }

    private static void ApplyEffectsPerTarget(GameState state, CombatState combat, CombatUnit caster,
        CombatUnit target, List<EffectDef> effects, int hits, Random rng)
    {
        foreach (var effect in effects)
        {
            switch (effect.Type)
            {
                case "heal":
                    HealUnit(combat, caster, target, effect.Amount);
                    break;
                case "lifesteal":
                    HealUnit(combat, caster, caster, effect.Amount * Math.Max(1, hits));
                    break;
                case "shield":
                    target.Shield += effect.Amount;
                    target.ShieldFrom = caster.Id;
                    CombatLog(combat, $"{target.Name} 获得 {effect.Amount} 护盾。");
                    break;
                case "buff":
                    AddStatusFromEffect(combat, target, effect, caster, isBuff: true);
                    break;
                case "debuff":
                    AddStatusFromEffect(combat, target, effect, caster, isBuff: false);
                    break;
                case "stun":
                    AddStatus(target, "stun", "眩晕", Math.Max(1, effect.Duration), isBuff: false, stun: true);
                    CombatLog(combat, $"{target.Name} 被眩晕。");
                    break;
                case "taunt":
                    AddStatus(target, "taunt", "嘲讽", Math.Max(1, effect.Duration), isBuff: false, taunt: true, sourceId: caster.Id);
                    CombatLog(combat, $"{target.Name} 被嘲讽。");
                    break;
                case "mark":
                    AddStatus(target, "mark", "标记", Math.Max(1, effect.Duration), isBuff: false, marked: true, sourceId: caster.Id);
                    CombatLog(combat, $"{target.Name} 被标记，受到伤害 +20%。");
                    break;
                case "cleanse":
                    target.Statuses.RemoveAll(s => !s.IsBuff);
                    CombatLog(combat, $"{target.Name} 的负面状态被清除。");
                    break;
                case "purge_item":
                    // 「归档」：从每名玩家背包里封存 N 件随机消耗品。
                    // 终局 Boss 专用——惩罚"把一背包道具攒到最后一场"这个几乎必然的玩家行为。
                    PurgeConsumables(state, combat, Math.Max(1, effect.Amount), rng);
                    break;
                case "dispel":
                    var removedBuffs = target.Statuses.Count(s => s.IsBuff);
                    target.Statuses.RemoveAll(s => s.IsBuff);
                    var removedShield = target.Shield;
                    target.Shield = 0;
                    CombatLog(combat, removedBuffs + removedShield > 0
                        ? $"{target.Name} 的 {removedBuffs} 个增益与 {removedShield} 点护盾被剥夺。"
                        : $"{target.Name} 身上没有可剥夺的增益。");
                    break;
                case "focus":
                    target.Focus = Math.Min(target.MaxFocus, target.Focus + effect.Amount);
                    CombatLog(combat, $"{target.Name} 恢复 {effect.Amount} Focus。");
                    break;
                case "revive_or_heal":
                {
                    var downed = combat.Units.FirstOrDefault(u => u.Side == caster.Side && u.Downed);
                    if (downed is not null)
                    {
                        downed.Downed = false;
                        downed.Hp = Math.Max(1, downed.MaxHp * 3 / 10);
                        CombatLog(combat, $"{downed.Name} 被文心的诗重新唤醒。");
                    }
                    else
                    {
                        HealUnit(combat, caster, target, effect.Amount);
                    }
                    break;
                }
                case "execute":
                    if (!target.Downed && target.Hp <= target.MaxHp * effect.Amount / 100)
                    {
                        DirectDamage(combat, target, target.Hp, caster, "处决");
                        CombatLog(combat, $"{target.Name} 被终审判决处决。");
                    }
                    break;
                case "extra_action":
                    target.ExtraActions += effect.Amount;
                    CombatLog(combat, $"{target.Name} 获得一次额外行动。");
                    break;
                case "echo_bonus":
                case "dash":
                case "retreat":
                case "random_targets":
                    break;
            }
        }
    }

    /// <summary>
    /// 「归档」：从玩家背包里封存 N 件随机消耗品（全队合计，不是每人 N 件）。
    /// 这是终局 Boss 的反囤积机制——玩家几乎必然会把道具攒到最后一场，
    /// 没有代价的话，前两幕的商店和掉落会在终局变成"既用不上也用不完"。
    /// 注意：一定要按「全队合计」算。按「每人 N 件」的话，4 人队一次掉 4 件，
    /// 8 轮就能把背包清空——那不是惩罚囤积，是没收。
    /// </summary>
    private static void PurgeConsumables(GameState state, CombatState combat, int count, Random rng)
    {
        var pool = new List<(PlayerState Player, string Id)>();
        foreach (var p in state.Players.Where(x => !x.Downed))
            foreach (var kv in p.Consumables.Where(kv => kv.Value > 0))
                for (var i = 0; i < kv.Value; i++) pool.Add((p, kv.Key));
        if (pool.Count == 0)
        {
            CombatLog(combat, "归档程序扫过你们的背包，什么也没找到。");
            return;
        }

        var taken = new List<string>();
        for (var i = 0; i < count && pool.Count > 0; i++)
        {
            var idx = rng.Next(pool.Count);
            var (player, id) = pool[idx];
            pool.RemoveAt(idx);
            if (!GameRules.TakeConsumable(player, id)) continue;
            var itemName = GameData.Consumables.TryGetValue(id, out var def) ? def.Name : id;
            taken.Add($"{player.Name} 的{itemName}");
        }
        CombatLog(combat, taken.Count > 0
            ? $"归档完成：{string.Join("、", taken)} 被封存了。"
            : "归档程序扫过你们的背包，什么也没找到。");
    }

    private static void AddStatusFromEffect(CombatState combat, CombatUnit target, EffectDef effect, CombatUnit source, bool? isBuff = null)
    {
        var stat = effect.Stat?.ToLowerInvariant() ?? "accuracy";
        var amount = effect.Amount;
        var id = $"{(effect.Type == "debuff" ? "debuff" : "buff")}_{stat}";
        AddStatus(target, id, effect.Type == "debuff" ? $"削弱·{GameRules.StatLabel(stat)}" : $"强化·{GameRules.StatLabel(stat)}",
            Math.Max(1, effect.Duration), isBuff ?? effect.Type != "debuff",
            accuracyMod: stat == "accuracy" ? amount : 0,
            damageMod: stat == "damage" ? amount : 0,
            armorMod: stat == "armor" ? amount : 0,
            resistanceMod: stat == "resistance" ? amount : 0,
            evasionMod: stat == "evasion" ? amount : 0,
            speedMod: stat == "speed" ? amount : 0,
            movementMod: stat == "movement" ? amount : 0,
            sourceId: source.Id);
        CombatLog(combat, target.Side == source.Side
            ? $"{target.Name} 获得强化：{GameRules.StatLabel(stat)} {Text.Signed(amount)}（{effect.Duration} 回合）。"
            : $"{target.Name} 受到削弱：{GameRules.StatLabel(stat)} {Text.Signed(amount)}（{effect.Duration} 回合）。");
    }

    private static void AddStatus(CombatUnit target, string id, string name, int duration, bool isBuff,
        int accuracyMod = 0, int damageMod = 0, int armorMod = 0, int resistanceMod = 0,
        int evasionMod = 0, int speedMod = 0, int movementMod = 0, bool stun = false, bool taunt = false,
        bool marked = false, string? sourceId = null)
    {
        var existing = target.Statuses.FirstOrDefault(s => s.Id == id);
        if (existing is not null)
        {
            existing.Duration = Math.Max(existing.Duration, duration);
            existing.AccuracyMod = accuracyMod != 0 ? accuracyMod : existing.AccuracyMod;
            existing.DamageMod = damageMod != 0 ? damageMod : existing.DamageMod;
            existing.ArmorMod = armorMod != 0 ? armorMod : existing.ArmorMod;
            existing.ResistanceMod = resistanceMod != 0 ? resistanceMod : existing.ResistanceMod;
            existing.EvasionMod = evasionMod != 0 ? evasionMod : existing.EvasionMod;
            existing.SpeedMod = speedMod != 0 ? speedMod : existing.SpeedMod;
            existing.MovementMod = movementMod != 0 ? movementMod : existing.MovementMod;
            existing.Stun |= stun;
            existing.Taunt |= taunt;
            existing.Marked |= marked;
            existing.SourceId = sourceId ?? existing.SourceId;
            return;
        }
        target.Statuses.Add(new StatusState
        {
            Id = id,
            Name = name,
            Duration = Math.Max(1, duration),
            AccuracyMod = accuracyMod,
            DamageMod = damageMod,
            ArmorMod = armorMod,
            ResistanceMod = resistanceMod,
            EvasionMod = evasionMod,
            SpeedMod = speedMod,
            MovementMod = movementMod,
            Stun = stun,
            Taunt = taunt,
            Marked = marked,
            IsBuff = isBuff,
            SourceId = sourceId
        });
    }

    private static int ResolveAttack(GameState state, CombatState combat, CombatUnit attacker, CombatUnit target,
        SkillDef skill, int diceCount, Random rng)
    {
        var statValue = attacker.Stats[skill.ScaleStat];
        var accuracy = skill.Accuracy + Dice.StatBonus(statValue) + attacker.AccuracyBonus +
                       attacker.Statuses.Sum(s => s.AccuracyMod) + AuraAccuracy(combat, attacker) +
                       SynergyEngine.AccuracyBonus(target);
        accuracy = Dice.ClampPct(accuracy);

        var dice = new List<DieResult>();
        var hits = 0;
        for (var i = 0; i < Math.Max(1, diceCount); i++)
        {
            var value = rng.Next(1, 101);
            var success = value <= accuracy;
            if (success) hits++;
            dice.Add(new DieResult { Value = value, Success = success });
        }

        var perfect = diceCount > 0 && hits == diceCount;
        var evasion = Math.Clamp(target.Evasion + target.Statuses.Sum(s => s.EvasionMod), 0, 80);
        var evaded = false;
        if (!perfect && hits > 0 && evasion > 0 && rng.Next(1, 101) <= evasion)
        {
            evaded = true;
            hits = 0;
        }

        // 0.24 装备特性：标记集火 / 低生命爆发。只加成第一次命中的每击伤害，不做乘算。
        var ownerOfAttacker = attacker.PlayerId is null ? null
            : state.Players.FirstOrDefault(p => p.Id == attacker.PlayerId);
        var traitBonus = attacker.Side == Side.Player
            ? GearTraits.DamageBonus(ownerOfAttacker, attacker, target)
            : 0;
        var perHit = Math.Max(1, skill.DamagePerDie + Dice.DamageBonus(statValue) + attacker.DamageBonus +
                                 attacker.Statuses.Sum(s => s.DamageMod) +
                                 (skill.IsUltimate ? attacker.UltimateBonus : 0) + traitBonus);
        var raw = hits * perHit;
        // 挑战变异：玻璃队伍（玩家增伤）/ 敌意协议与难度（敌方增伤）
        var damageMul = attacker.Side == Side.Player
            ? ChallengeEngine.PlayerDamageMul(state)
            : ChallengeEngine.EnemyDamageMul(state);
        if (damageMul != 1) raw = Math.Max(0, (int)Math.Round(raw * damageMul));
        var armor = skill.DamageType == DamageType.Physical
            ? target.Armor + target.Statuses.Sum(s => s.ArmorMod)
            : target.Resistance + target.Statuses.Sum(s => s.ResistanceMod);
        if (IsOnCover(combat, target)) armor += 2;
        var guards = AdjacentGuards(combat, target);
        // 护甲最多吃掉 75% 的原始伤害：避免高护甲单位变成"打不动的墙"，
        // 让低级队伍也有推进手段（0.9.0 起碎片看守是必打的）。
        var mitigation = Math.Min(Math.Max(0, raw) * 0.75, Math.Max(0, armor) + guards * 2);
        var damage = Math.Max(0, raw - (int)Math.Round(mitigation));
        // 命中保底 1 点：raw 很小时 75% 减免会把伤害抹成 0，配合敌方治疗就是"永远打不死"的死局。
        if (hits > 0 && damage == 0) damage = 1;
        if (target.Statuses.Any(s => s.Marked)) damage = (int)Math.Ceiling(damage * 1.2);
        if (target.PassiveKey == "minimax_decoy" && !target.DecoyUsed && damage > 0)
        {
            target.DecoyUsed = true;
            damage = Math.Max(0, damage - 3);
            CombatLog(combat, "海螺的幻影替身吸收了 3 点伤害。");
        }
        // 协同：掩护分摊 → 标记集火 / 受控追加 / 暴露兑现
        damage = SynergyEngine.RedirectGuard(state, combat, target, damage, out _);
        CombatUnit? counterSource = null;
        damage = SynergyEngine.OnIncomingDamage(state, combat, attacker, target, skill, damage, ref counterSource);
        if (damage > 0)
        {
            ApplyDamageToUnit(combat, target, damage, attacker);
            if (attacker.Side == Side.Player) state.Stats.DamageDealt += damage;
            else state.Stats.DamageTaken += damage;
            GearTraits.OnDamaged(state, combat, target, attacker, damage);
        }

        var roll = new RollResult
        {
            Kind = "attack",
            Label = skill.Name,
            SkillName = skill.Name,
            AttackerName = attacker.Name,
            TargetName = target.Name,
            Dice = dice,
            Accuracy = accuracy,
            Hits = hits,
            Damage = damage,
            Success = hits > 0,
            Perfect = perfect,
            Detail = evaded
                ? $"{target.Name} 闪避了攻击。"
                : perfect
                    ? $"完美判定！{hits} 命中，{damage} 伤害（无视闪避）。"
                    : hits > 0
                        ? $"{hits}/{dice.Count} 命中，{damage} 伤害。"
                        : "全部未命中。"
        };
        combat.LastRoll = roll;
        if (attacker.Side == Side.Player) combat.LastPlayerRoll = roll;
        state.LastRoll = roll;
        CombatLog(combat, $"{attacker.Name} → {target.Name}：{roll.Detail}");
        return hits;
    }

    private static int AuraAccuracy(CombatState combat, CombatUnit attacker)
    {
        var bonus = 0;
        foreach (var ally in combat.Units.Where(u => u.Side == attacker.Side && !u.Downed && u.Id != attacker.Id))
        {
            if (ally.PassiveKey == "llama_aura" && Hex.Distance(ally.Col, ally.Row, attacker.Col, attacker.Row) == 1)
                bonus += 5;
            if (ally.PassiveKey == "gpt_scaling")
                bonus += Math.Min(9, combat.Round * 3);
        }
        return bonus;
    }

    private static int AdjacentGuards(CombatState combat, CombatUnit target)
    {
        var count = 0;
        foreach (var ally in combat.Units.Where(u => u.Side == target.Side && !u.Downed && u.Id != target.Id))
        {
            if ((ally.PassiveKey == "claude_guard" || ally.PassiveKey == "jev_guard") &&
                Hex.Distance(ally.Col, ally.Row, target.Col, target.Row) == 1)
                count++;
        }
        return count;
    }

    private static bool IsOnCover(CombatState combat, CombatUnit unit)
        => combat.Terrain.Any(t => t.Col == unit.Col && t.Row == unit.Row && t.Type == "cover");

    private static void ApplyDamageToUnit(CombatState combat, CombatUnit target, int damage, CombatUnit source)
    {
        if (damage <= 0) return;
        // 零号主脑的二阶段是「核心暴露」：护甲掉了，同时受到的伤害 +15%，让终局打得完。
        if (target.Side == Side.Enemy && target.Role == "首领" && combat.BossPhase >= 2 &&
            target.EnemyId == "e_boss_zero")
        {
            damage = (int)Math.Ceiling(damage * 1.15);
        }
        // 镜面执政官的二阶段是「分摊」：只要镜像还在，它就把伤害摊给分身。
        if (target.Side == Side.Enemy && target.Role == "首领" && combat.BossPhase >= 2 &&
            target.EnemyId == "e_boss_archon" &&
            combat.Units.Any(u => u.Side == Side.Enemy && u.IsSummon && !u.Downed))
        {
            damage = Math.Max(1, (int)Math.Ceiling(damage * 0.6));
        }
        var shieldAbsorb = Math.Min(target.Shield, damage);
        target.Shield -= shieldAbsorb;
        damage -= shieldAbsorb;
        target.Hp -= damage;

        if (source.Side != target.Side && target.PassiveKey == "grok_reflect" &&
            target.Hp > 0 && new Random(combat.Round * 73 + target.Hp * 17 + damage).Next(1, 101) <= 25)
        {
            DirectDamage(combat, source, 2, target, "狂笑反弹");
            CombatLog(combat, $"{target.Name} 的「反弹笑话」对 {source.Name} 造成 2 点伤害。");
        }

        if (target.Hp <= 0)
        {
            if (target.Side == Side.Player && target.PassiveKey == "deepseek_reroll" && !target.CheatDeathUsed)
            {
                target.CheatDeathUsed = true;
                target.Hp = 1;
                CombatLog(combat, $"{target.Name} 的「鲸落不死」触发：保留 1 HP。");
                return;
            }
            target.Hp = 0;
            target.Downed = true;
            CombatLog(combat, $"{target.Name} 倒下了。");
        }
        else if (shieldAbsorb > 0)
        {
            CombatLog(combat, $"{target.Name} 的护盾吸收了 {shieldAbsorb} 点伤害。");
        }
    }

    private static void DirectDamage(CombatState combat, CombatUnit target, int damage, CombatUnit source, string label)
    {
        if (damage <= 0 || target.Downed) return;
        target.Hp -= damage;
        if (target.Hp <= 0)
        {
            if (target.Side == Side.Player && target.PassiveKey == "deepseek_reroll" && !target.CheatDeathUsed)
            {
                target.CheatDeathUsed = true;
                target.Hp = 1;
                CombatLog(combat, $"{target.Name} 的「鲸落不死」触发：保留 1 HP。");
                return;
            }
            target.Hp = 0;
            target.Downed = true;
            CombatLog(combat, $"{label} 击倒了 {target.Name}。");
        }
    }

    private static void HealUnit(CombatState combat, CombatUnit healer, CombatUnit target, int baseAmount)
    {
        var before = target.Hp;
        if (target.Downed) return;
        var bonus = Math.Max(0, (healer.Stats.E - 50) / 10);
        var amount = baseAmount + bonus;
        if (healer.PassiveKey == "wenxin_heal") amount = (int)Math.Ceiling(amount * 1.25);
        var actual = Math.Min(amount, target.MaxHp - target.Hp);
        target.Hp += actual;
        if (actual > 0)
        {
            CombatLog(combat, $"{target.Name} 恢复 {actual} HP。");
            SynergyEngine.OnHeal(combat, healer, target, actual);
        }
        _ = before;
    }

    private static List<CombatUnit> SelectTargets(CombatState combat, CombatUnit caster, SkillDef skill, GameAction action)
    {
        var enemies = combat.Units.Where(u => u.Side != caster.Side && !u.Downed).ToList();
        var allies = combat.Units.Where(u => u.Side == caster.Side && !u.Downed).ToList();
        switch (skill.Target)
        {
            case TargetType.Enemy:
            {
                var target = combat.Units.FirstOrDefault(u => u.Id == action.TargetUnitId && u.Side != caster.Side && !u.Downed);
                if (target is null) throw new GameException("请选择一个敌方目标。");
                if (skill.Range > 0 && Hex.Distance(caster.Col, caster.Row, target.Col, target.Row) > skill.Range)
                    throw new GameException("目标不在技能射程内。");
                return new() { target };
            }
            case TargetType.Ally:
            {
                var canRevive = skill.Effects.Any(e => e.Type == "revive_or_heal");
                var target = combat.Units.FirstOrDefault(u => u.Id == action.TargetUnitId && u.Side == caster.Side && (!u.Downed || canRevive));
                if (target is null)
                {
                    target = canRevive
                        ? combat.Units.FirstOrDefault(u => u.Side == caster.Side && u.Downed)
                        : caster;
                }
                if (target is null) throw new GameException("没有合法友军目标。");
                if (skill.Range > 0 && Hex.Distance(caster.Col, caster.Row, target.Col, target.Row) > skill.Range)
                    throw new GameException("友军不在技能射程内。");
                return new() { target };
            }
            case TargetType.Self:
                return new() { caster };
            case TargetType.AllAllies:
                return allies;
            case TargetType.AllEnemies:
            {
                var inRange = enemies.Where(u => skill.Range <= 0 || Hex.Distance(caster.Col, caster.Row, u.Col, u.Row) <= skill.Range).ToList();
                if (skill.Effects.Any(e => e.Type == "random_targets"))
                {
                    var n = skill.Effects.FirstOrDefault(e => e.Type == "random_targets")?.Amount ?? 1;
                    return inRange.OrderBy(_ => NoRng.Next()).Take(Math.Max(1, n)).ToList();
                }
                return inRange;
            }
            case TargetType.Area:
            {
                var col = action.Col;
                var row = action.Row;
                return enemies.Where(u => Hex.Distance(u.Col, u.Row, col, row) <= 1).ToList();
            }
            default:
                return new() { caster };
        }
    }

    private static void DashAdjacent(CombatState combat, CombatUnit caster, CombatUnit target)
    {
        var free = Hex.Neighbors(target.Col, target.Row, combat.Width, combat.Height)
            .Where(x => IsFreeHex(combat, x.col, x.row, caster.Id))
            .OrderBy(x => Hex.Distance(caster.Col, caster.Row, x.col, x.row))
            .FirstOrDefault();
        if (free != default)
        {
            caster.Col = free.col;
            caster.Row = free.row;
            CombatLog(combat, $"{caster.Name} 突进到 {target.Name} 身边。");
        }
    }

    private static void RetreatFrom(CombatState combat, CombatUnit caster, CombatUnit target)
    {
        var free = Hex.Neighbors(caster.Col, caster.Row, combat.Width, combat.Height)
            .Where(x => IsFreeHex(combat, x.col, x.row, caster.Id))
            .OrderByDescending(x => Hex.Distance(x.col, x.row, target.Col, target.Row))
            .FirstOrDefault();
        if (free != default)
        {
            caster.Col = free.col;
            caster.Row = free.row;
            CombatLog(combat, $"{caster.Name} 后撤到 ({caster.Col},{caster.Row})。");
        }
    }

    private static void SummonUnit(GameState state, CombatState combat, CombatUnit summoner, string kind, int duration)
    {
        var free = FindFreeHex(combat, summoner.Col, summoner.Row);
        if (free is null)
        {
            CombatLog(combat, "召唤失败：没有空位。");
            return;
        }
        var hp = kind switch
        {
            "summon_turret" => 15,
            "summon_puppet" => 12,
            "summon_decoy" => 10,
            "summon_seed" => 10,
            _ => 10
        };
        if (summoner.PassiveKey is "glm_turret" or "seed_growth") hp += 5;
        var unit = new CombatUnit
        {
            Id = $"u_s{combat.SummonCounter++}",
            Name = kind switch
            {
                "summon_turret" => "矩阵炮塔",
                "summon_puppet" => "参数傀儡",
                "summon_decoy" => "幻影分身",
                "summon_seed" => "种子精灵",
                _ => "召唤物"
            },
            Side = summoner.Side,
            PlayerId = summoner.PlayerId,
            Color = summoner.Color,
            Role = "召唤物",
            Hp = hp,
            MaxHp = hp,
            Armor = kind == "summon_turret" ? 2 : 0,
            Resistance = kind == "summon_turret" ? 2 : 0,
            Evasion = 0,
            Speed = 40,
            Col = free.Value.col,
            Row = free.Value.row,
            Movement = 0,
            MovementLeft = 0,
            IsSummon = true,
            SummonDuration = Math.Max(1, duration),
            SkillIds = kind switch
            {
                "summon_turret" => new() { "s_turret" },
                "summon_puppet" => new() { "s_puppet" },
                "summon_seed" => new() { "s_seed" },
                _ => new()
            },
            Stats = new Stats(50, 50, 50, 50, 40, 50),
            SummonKind = kind,
            WeaponName = "召唤攻击",
            WeaponDice = 2,
            WeaponAccuracy = 65,
            WeaponDamage = 2,
            WeaponRange = 1
        };
        if (kind == "summon_decoy")
            AddStatus(unit, "taunt", "嘲讽", 2, isBuff: false, taunt: true, sourceId: unit.Id);
        combat.Units.Add(unit);
        combat.TurnOrder.Add(unit.Id);
        CombatLog(combat, $"{summoner.Name} 召唤了 {unit.Name}（{hp} HP，{duration} 回合）。");
        SynergyEngine.OnSummon(combat, unit);
    }

    private static void SummonEnemy(GameState state, CombatState combat, CombatUnit summoner, string enemyId, int duration,
        string? name = null, double hpScale = 0.5)
    {
        if (!GameData.Enemies.TryGetValue(enemyId, out var def)) return;
        var free = FindFreeHex(combat, summoner.Col, summoner.Row);
        if (free is null)
        {
            CombatLog(combat, "敌方召唤失败：没有空位。");
            return;
        }
        var unit = new CombatUnit
        {
            Id = $"u_se{combat.SummonCounter++}",
            Name = string.IsNullOrWhiteSpace(name) ? def.Name : name,
            Side = Side.Enemy,
            EnemyId = def.Id,
            Color = def.Color,
            Hp = Math.Max(1, (int)Math.Round(def.Hp * hpScale)),
            MaxHp = Math.Max(1, (int)Math.Round(def.Hp * hpScale)),
            Armor = def.Armor,
            Resistance = def.Resistance,
            Evasion = def.Evasion,
            Speed = def.Speed,
            Col = free.Value.col,
            Row = free.Value.row,
            Movement = def.Movement,
            MovementLeft = def.Movement,
            SkillIds = def.SkillIds.ToList(),
            Stats = new Stats(55, 55, 55, 55, def.Speed, 50),
            IsSummon = true,
            SummonDuration = Math.Max(1, duration),
            WeaponName = "敌袭",
            WeaponDice = 2,
            WeaponAccuracy = 70,
            WeaponDamage = 3,
            WeaponRange = 1,
            SummonKind = "enemy"
        };
        combat.Units.Add(unit);
        combat.TurnOrder.Add(unit.Id);
        CombatLog(combat, $"{summoner.Name} 召唤了 {unit.Name}。");
    }

    private static (int col, int row)? FindFreeHex(CombatState combat, int preferCol, int preferRow)
    {
        for (var radius = 1; radius <= 8; radius++)
        {
            for (var row = 0; row < combat.Height; row++)
            {
                for (var col = 0; col < combat.Width; col++)
                {
                    if (Hex.Distance(col, row, preferCol, preferRow) != radius) continue;
                    if (IsFreeHex(combat, col, row)) return (col, row);
                }
            }
        }
        return null;
    }

    private static bool IsFreeHex(CombatState combat, int col, int row, string? ignoreUnitId = null)
    {
        if (combat.Terrain.Any(t => t.Col == col && t.Row == row && t.Type == "obstacle")) return false;
        return !combat.Units.Any(u => u.Col == col && u.Row == row && !u.Downed && u.Id != ignoreUnitId);
    }

    private static void FinishUnitTurn(GameState state, CombatState combat, CombatUnit unit, Random rng)
    {
        if (CheckCombatEnd(state, combat)) return;
        TryEnterBossPhase(state, combat);
        unit.Acted = true;
        SynergyEngine.OnTurnEnd(state, combat, unit);
        if (unit.ExtraActions > 0 && unit.Side == Side.Player)
        {
            unit.ExtraActions--;
            unit.Acted = false;
            unit.MovementLeft = EffectiveMovement(unit);
            combat.ActiveUnitId = unit.Id;
            CombatLog(combat, $"{unit.Name} 获得额外行动。");
            UpdateUiLists(combat);
            state.Message = $"{unit.Name} 获得额外行动。";
            return;
        }
        AdvanceCombatTurn(state, combat, rng);
    }

    private static void AdvanceCombatTurn(GameState state, CombatState combat, Random rng)
    {
        if (CheckCombatEnd(state, combat)) return;
        var index = combat.TurnOrder.IndexOf(combat.ActiveUnitId);
        if (index < 0) index = 0;
        var count = combat.TurnOrder.Count;
        for (var guard = 0; guard < count * 3 + 3; guard++)
        {
            index++;
            if (index >= count)
            {
                if (BeginNewRound(combat, state)) return;   // 追踪归零，战斗结束
                index = 0;
                count = combat.TurnOrder.Count;
            }
            var id = combat.TurnOrder[index];
            var unit = combat.Units.FirstOrDefault(u => u.Id == id);
            if (unit is null || unit.Downed) continue;
            if (!BeginUnitTurn(state, combat, unit, rng)) continue;
            combat.ActiveUnitId = unit.Id;
            UpdateUiLists(combat);
            state.Message = $"{unit.Name} 的回合。";
            return;
        }
        CheckCombatEnd(state, combat);
    }

    /// <summary>战斗前几轮不扣时钟，避免正常遭遇战被惩罚。</summary>
    private const int PurgeFreeRounds = 5;

    /// <summary>Boss 战的免费轮数：终局本来就是长战斗，别让赶路时钟替你判负。</summary>
    private const int BossFreeRounds = 12;

    /// <summary>返回 true 表示战斗因为"交战太久、追踪归零"而结束。</summary>
    /// <summary>
    /// Boss 二阶段：血量第一次掉到一半时切换，并**改变规则**，不是只放一个横幅。
    /// 三个 Boss 各自一条：
    /// - 拍卖人「清仓」：召出记忆盲盒，且每 2 轮回收 6 点生命（拖下去会被它回满）；
    /// - 镜面执政官「分摊」：分裂出镜像，分身在场时它受到的伤害 -40%（先清分身）；
    /// - 零号主脑「上传倒计时」：每 2 轮额外扣 1 点电子追踪，同时护盾清零（逼你抢时间）。
    /// </summary>
    private static void TryEnterBossPhase(GameState state, CombatState combat)
    {
        if (combat.IsOver || combat.BossPhase >= 2) return;
        var boss = combat.Units.FirstOrDefault(u => u.Side == Side.Enemy && !u.Downed && u.Role == "首领");
        if (boss is null) return;
        if (boss.Hp > boss.MaxHp / 2) return;

        combat.BossPhase = 2;
        var def = boss.EnemyId is not null ? GameData.Enemies.GetValueOrDefault(boss.EnemyId) : null;
        var pattern = def?.BossPattern ?? "";
        switch (pattern)
        {
            case "auctioneer":
                combat.BossPhaseName = "清仓";
                CombatLog(combat, "拍卖人敲下第二次锤：进入「清仓」。每 2 轮回收 6 点生命，记忆盲盒上架。");
                SummonEnemy(state, combat, boss, "e_ghost", 99, "记忆盲盒", 0.7);
                break;
            case "archon":
                combat.BossPhaseName = "分摊";
                CombatLog(combat, "镜面执政官分裂出镜像：只要分身还在，它受到的伤害 -40%。");
                SummonEnemy(state, combat, boss, "e_mirror", 99, "执政官镜像", 0.55);
                break;
            case "zero":
                combat.BossPhaseName = "上传倒计时";
                boss.Shield = 0;
                // 反过来给它掉防：二阶段应该是「抢时间」，不是「时间到了自动输」。
                boss.Armor = Math.Max(0, boss.Armor - 3);
                boss.Resistance = Math.Max(0, boss.Resistance - 3);
                CombatLog(combat, "主脑开始上传：护盾归零、护甲与抗性 -3，但电子追踪每 3 轮额外 -1。");
                break;
            default:
                combat.BossPhaseName = "第二阶段";
                break;
        }
        state.Message = $"{boss.Name} 进入第二阶段 · {combat.BossPhaseName}。";
    }

    private static bool BeginNewRound(CombatState combat, GameState state)
    {
        combat.Round++;
        CombatLog(combat, $"第 {combat.Round} 轮。");
        BossMechanics.OnNewRound(state, combat);
        if (combat.IsOver) return true;
        // 交战也会走时钟：普通战前 5 轮免费，Boss 战给 12 轮（终局是打斗，不是赶路），之后每轮 -1。
        // 没有这条，"奶住慢慢打"就是零成本，死局的门永远开着。
        var isBossFight = state.Node(combat.NodeId)?.Type == NodeType.Boss;
        var freeRounds = isBossFight ? BossFreeRounds : PurgeFreeRounds;
        // 普通战每 2 轮扣 1 点；首领战每 3 轮——首领本来就长，2 轮一次等于把终局交给时钟。
        var drainEvery = isBossFight ? 3 : 2;
        if (combat.Round > freeRounds && (combat.Round - freeRounds) % drainEvery == 0)
        {
            GameRules.AdjustPurge(state, -1);
            CombatLog(combat, $"交战拖长，电子追踪 -1（剩余 {state.Purge}/{state.PurgeMax}）。");
            if (state.Purge <= 0)
            {
                LoseCombat(state, combat, "电子追踪归零",
                    "追踪条到底了。你们还在打，但城市已经替你们按下了注销键。");
                return true;
            }
        }
        if (combat.BossPhase >= 2)
        {
            var boss = combat.Units.FirstOrDefault(u => u.Side == Side.Enemy && !u.Downed && u.Role == "首领");
            // 拍卖人 / 主脑的周期都是 2 轮，主脑单独放慢到 3 轮：
            // 2 轮一次在终局会把整局变成「谁先到 0 谁输」，实测 4 人自动队在第 23 轮被打穿。
            if (boss is not null && (combat.Round % 2 == 0 || (boss.EnemyId == "e_boss_zero" && combat.Round % 3 == 0)))
            {
                if (boss.EnemyId == "e_boss_auctioneer")
                {
                    // 只有「记忆盲盒」还在场，它才能从台下收回记忆——先清盲盒是正确解法。
                    // 另外最多回收 3 次：没有上限时，拖到第 20 轮也打不死，是把玩家按在椅子上。
                    var boxAlive = combat.Units.Any(u => u.Name == "记忆盲盒" && u.Side == Side.Enemy && !u.Downed);
                    if (boxAlive && combat.BossPhaseHeals < 3)
                    {
                        var heal = Math.Min(4, boss.MaxHp - boss.Hp);
                        if (heal > 0)
                        {
                            boss.Hp += heal;
                            combat.BossPhaseHeals++;
                            CombatLog(combat, $"拍卖人从台下收回 {heal} 点生命（清仓 {combat.BossPhaseHeals}/3）。");
                        }
                    }
                }
                else if (boss.EnemyId == "e_boss_zero" && combat.Round % 3 == 0)
                {
                    GameRules.AdjustPurge(state, -1);
                    CombatLog(combat, $"主脑上传推进，电子追踪 -1（剩余 {state.Purge}/{state.PurgeMax}）。");
                    if (state.Purge <= 0)
                    {
                        LoseCombat(state, combat, "上传完成", "整座城市被压成一张档案卡。你们还在会议室里。");
                        return true;
                    }
                }
            }
        }
        foreach (var unit in combat.Units.Where(u => u.Side == Side.Player && !u.Downed))
            unit.Focus = Math.Min(unit.MaxFocus, unit.Focus + 1);
        foreach (var unit in combat.Units.Where(u => u.IsSummon).ToList())
        {
            unit.SummonDuration--;
            if (unit.SummonDuration <= 0)
            {
                unit.Downed = true;
                unit.Hp = 0;
                combat.TurnOrder.Remove(unit.Id);
                CombatLog(combat, $"{unit.Name} 的召唤时限结束，返回数据层。");
            }
        }
        foreach (var unit in combat.Units)
        {
            unit.Moved = false;
            unit.Acted = false;
            unit.MovementLeft = EffectiveMovement(unit);
        }
        state.Message = $"战斗进入第 {combat.Round} 轮。";
        return false;
    }

    private static bool BeginUnitTurn(GameState state, CombatState combat, CombatUnit unit, Random rng)
    {
        if (unit.Downed) return false;
        foreach (var status in unit.Statuses.Where(s => s.DamagePerTurn > 0).ToList())
        {
            DirectDamage(combat, unit, status.DamagePerTurn, unit, status.Name);
            if (unit.Downed) return false;
        }
        var stun = unit.Statuses.FirstOrDefault(s => s.Stun);
        if (stun is not null)
        {
            CombatLog(combat, $"{unit.Name} 处于眩晕，跳过回合。");
            DecrementStatuses(unit);
            return false;
        }
        DecrementStatuses(unit);
        unit.Moved = false;
        unit.Acted = false;
        unit.MovementLeft = EffectiveMovement(unit);
        foreach (var key in unit.Cooldowns.Keys.ToList())
        {
            if (unit.Cooldowns[key] > 0) unit.Cooldowns[key]--;
        }
        return unit.Hp > 0;
    }

    private static void DecrementStatuses(CombatUnit unit)
    {
        foreach (var status in unit.Statuses)
            status.Duration--;
        unit.Statuses.RemoveAll(s => s.Duration <= 0);
    }

    private static int EffectiveMovement(CombatUnit unit)
        => Math.Max(0, unit.Movement + unit.Statuses.Sum(s => s.MovementMod));

    private static void UpdateUiLists(CombatState combat)
    {
        var active = combat.ActiveUnit;
        if (active is null) return;
        var blocked = combat.Units.Where(u => !u.Downed && u.Id != active.Id).Select(u => $"{u.Col},{u.Row}").ToHashSet();
        foreach (var t in combat.Terrain.Where(t => t.Type == "obstacle")) blocked.Add($"{t.Col},{t.Row}");
        // 主脑「协议覆写」关闭的格子不可进入（站上去会掉血，但不会把人困死）
        if (combat.BossMechanic?.ClosedCells is { Count: > 0 } closed)
            foreach (var cell in closed) blocked.Add(cell);
        combat.Reachable = active.MovementLeft > 0
            ? Hex.Reachable(active.Col, active.Row, active.MovementLeft, combat.Width, combat.Height, blocked)
            : new();
        combat.Targetable = combat.Units.Where(u => u.Side != active.Side && !u.Downed).Select(u => u.Id).ToList();
    }

    /// <summary>从存档恢复战斗时清理「敌方回合中断」：把没跑完的敌方回合继续跑完，避免玩家点不动。</summary>
    public static void Resume(GameState state)
    {
        if (state.Phase != GamePhase.Combat || state.Combat is null) return;
        var combat = state.Combat;
        if (combat.IsOver) return;
        var rng = new Random(state.Seed ^ 0x5EED);
        var guard = 0;
        var changed = false;
        while (!combat.IsOver && combat.ActiveUnit?.Side == Side.Enemy && guard++ < 16)
        {
            changed = true;
            var before = combat.ActiveUnitId;
            TakeEnemyTurn(state, combat, combat.ActiveUnit!, rng);
            if (combat.IsOver) break;
            // 敌人没能把回合交出去（存档中断/异常）：强制推进到下一个可行动单位
            if (combat.ActiveUnitId == before) AdvanceCombatTurn(state, combat, rng);
        }
        if (!combat.IsOver) UpdateUiLists(combat);
        if (changed) state.Revision++;
        RefreshIntents(state);
    }

    private static void RunEnemyTurns(GameState state, CombatState combat, Random rng)
    {
        var guard = 0;
        while (!combat.IsOver && combat.ActiveUnit?.Side == Side.Enemy && guard++ < 32)
        {
            var before = combat.ActiveUnitId;
            var enemy = combat.ActiveUnit!;
            TakeEnemyTurn(state, combat, enemy, rng);
            if (!combat.IsOver && combat.ActiveUnitId == before) AdvanceCombatTurn(state, combat, rng);
        }
    }

    /// <summary>
    /// 敌人的行动决策（纯函数、无副作用）。TakeEnemyTurn 与「意图预告」共用同一份逻辑，
    /// 保证玩家看到的意图和敌人真正做的事不会对不上。
    /// </summary>
    private static (SkillDef Skill, CombatUnit Target, CombatUnit DefaultTarget) ChooseEnemyAction(CombatState combat, CombatUnit enemy)
    {
        var forcedSource = enemy.Statuses.FirstOrDefault(s => s.Taunt && !string.IsNullOrWhiteSpace(s.SourceId))?.SourceId;
        var defaultTarget = combat.Units.Where(u => u.Side == Side.Player && !u.Downed)
            .FirstOrDefault(u => u.Id == forcedSource || u.PlayerId == forcedSource)
            ?? combat.Units.Where(u => u.Side == Side.Player && !u.Downed).FirstOrDefault(u => u.Statuses.Any(s => s.Taunt))
            ?? combat.Units.Where(u => u.Side == Side.Player && !u.Downed)
                .OrderBy(u => Hex.Distance(enemy.Col, enemy.Row, u.Col, u.Row))
                .ThenBy(u => u.Hp).FirstOrDefault();
        // 0.24 镜面二阶段：镜像改成优先咬血最少的那个（玩家看得见，也能提前抬血）
        if (BossMechanics.MirrorHuntsWeakest(combat) && enemy.Name.Contains("镜像"))
        {
            defaultTarget = combat.Units.Where(u => u.Side == Side.Player && !u.Downed)
                .OrderBy(u => u.Hp).ThenBy(u => Hex.Distance(enemy.Col, enemy.Row, u.Col, u.Row))
                .FirstOrDefault() ?? defaultTarget;
        }
        if (defaultTarget is null) return (ResolveSkill(enemy, "basic"), enemy, enemy);

        var usable = enemy.SkillIds.Select(GameRules.Skill)
            .Where(s => s.Cooldown == 0 || enemy.Cooldowns.GetValueOrDefault(s.Id) <= 0)
            .Where(s => enemy.Focus >= s.FocusCost)
            .ToList();

        SkillDef? chosen = null;
        var targetForSkill = defaultTarget;
        var bossDef = enemy.EnemyId is not null ? GameData.Enemies.GetValueOrDefault(enemy.EnemyId) : null;
        if (bossDef?.Role == "首领")
        {
            var shield = usable.FirstOrDefault(s => s.Special == "boss_shield");
            var summon = usable.FirstOrDefault(s => s.Special == "boss_summon");
            var execute = usable.FirstOrDefault(s => s.Special == "boss_execute");
            var partySize = Math.Max(1, combat.Units.Count(u => u.Side == Side.Player && !u.IsSummon));
            var summonBudget = Math.Max(0, partySize - 1);
            var summoned = combat.Units.Count(u => u.Side == Side.Enemy && u.IsSummon);
            var aliveEnemies = combat.Units.Count(u => u.Side == Side.Enemy && !u.Downed);
            // 残血阶段优先处决，并且专挑血最少的人打：终局的最后 25% 必须是压迫感最强的一段
            if (execute is not null && enemy.Hp < enemy.MaxHp * 25 / 100)
            {
                chosen = execute;
                targetForSkill = combat.Units.Where(u => u.Side == Side.Player && !u.Downed)
                    .OrderBy(u => u.Hp).FirstOrDefault() ?? defaultTarget;
            }
            else if (enemy.Hp < enemy.MaxHp * bossDef.BossShieldThreshold / 100 && enemy.Shield <= 0 && shield is not null)
                chosen = shield;
            else if (aliveEnemies < bossDef.BossAddCap &&
                     summoned < Math.Min(summonBudget, bossDef.BossSummonLimit) &&
                     summon is not null)
                chosen = summon;
            else
                chosen = usable.FirstOrDefault(s => s.Special == "boss_aoe" || s.Target == TargetType.AllEnemies)
                         ?? usable.FirstOrDefault(s => s.Target == TargetType.Enemy)
                         ?? ResolveSkill(enemy, "basic");
        }
        else
        {
            var heal = usable.FirstOrDefault(s => s.Effects.Any(e => e.Type == "heal"));
            if (heal is not null)
            {
                var wounded = combat.Units.Where(u => u.Side == Side.Enemy && !u.Downed && u.Hp < u.MaxHp)
                    .OrderBy(u => u.Hp * 100 / Math.Max(1, u.MaxHp)).FirstOrDefault();
                if (wounded is not null)
                {
                    chosen = heal;
                    targetForSkill = wounded;
                }
            }
            // 会套盾的敌人：友军残血且身上没有增益时，先上护盾
            if (chosen is null)
            {
                var shieldSkill = usable.FirstOrDefault(s =>
                    s.Target == TargetType.Ally && s.Effects.Any(e => e.Type == "shield"));
                if (shieldSkill is not null)
                {
                    var shieldTarget = combat.Units
                        .Where(u => u.Side == Side.Enemy && !u.Downed && u.Hp < u.MaxHp * 60 / 100 && !u.Statuses.Any(st => st.IsBuff))
                        .OrderBy(u => u.Hp).FirstOrDefault();
                    if (shieldTarget is not null) { chosen = shieldSkill; targetForSkill = shieldTarget; }
                }
            }
            chosen ??= usable.Where(s => s.Target is TargetType.Enemy)
                .OrderByDescending(s => s.Dice * s.DamagePerDie + s.Accuracy / 10)
                .FirstOrDefault();
            chosen ??= usable.FirstOrDefault(s => s.Target is TargetType.AllEnemies);
            chosen ??= usable.FirstOrDefault(s => s.Target is TargetType.Self or TargetType.AllAllies);
        }

        chosen ??= ResolveSkill(enemy, "basic");
        return (chosen, targetForSkill!, defaultTarget);
    }

    private static void TakeEnemyTurn(GameState state, CombatState combat, CombatUnit enemy, Random rng)
    {
        if (enemy.Downed)
        {
            FinishUnitTurn(state, combat, enemy, rng);
            return;
        }
        var players = combat.Units.Where(u => u.Side == Side.Player && !u.Downed).ToList();
        if (players.Count == 0)
        {
            CheckCombatEnd(state, combat);
            return;
        }

        var plan = ChooseEnemyAction(combat, enemy);
        var chosen = plan.Skill;
        var targetForSkill = plan.Target;
        var target = plan.Target;

        var desiredRange = chosen.Target switch
        {
            TargetType.AllEnemies or TargetType.AllAllies or TargetType.Self => 0,
            _ => Math.Max(1, chosen.Range)
        };

        if (chosen.Target is TargetType.Enemy or TargetType.Ally)
        {
            var dist = Hex.Distance(enemy.Col, enemy.Row, targetForSkill.Col, targetForSkill.Row);
            if (dist > desiredRange && enemy.MovementLeft > 0)
            {
                MoveEnemyToward(combat, enemy, targetForSkill, desiredRange);
                dist = Hex.Distance(enemy.Col, enemy.Row, targetForSkill.Col, targetForSkill.Row);
            }
            if (dist > desiredRange)
            {
                CombatLog(combat, $"{enemy.Name} 无法进入射程。");
                FinishUnitTurn(state, combat, enemy, rng);
                return;
            }
        }

        if (chosen.Target is TargetType.AllEnemies)
        {
            var any = combat.Units.Any(u => u.Side != enemy.Side && !u.Downed &&
                                            (chosen.Range <= 0 || Hex.Distance(enemy.Col, enemy.Row, u.Col, u.Row) <= chosen.Range));
            if (!any && enemy.MovementLeft > 0)
            {
                MoveEnemyToward(combat, enemy, target, chosen.Range);
                any = combat.Units.Any(u => u.Side != enemy.Side && !u.Downed &&
                                            (chosen.Range <= 0 || Hex.Distance(enemy.Col, enemy.Row, u.Col, u.Row) <= chosen.Range));
            }
            if (!any)
            {
                FinishUnitTurn(state, combat, enemy, rng);
                return;
            }
        }

        var action = new GameAction
        {
            Type = "combatAction",
            SkillId = chosen.Id,
            TargetUnitId = targetForSkill.Id,
            PlayerId = enemy.PlayerId
        };
        ExecuteSkill(state, combat, enemy, chosen, action, rng, false);
        if (chosen.Cooldown > 0) enemy.Cooldowns[chosen.Id] = chosen.Cooldown + 1;
        if (chosen.IsUltimate) enemy.UltimateUsed = true;
        if (CheckCombatEnd(state, combat)) return;
        FinishUnitTurn(state, combat, enemy, rng);
    }

    /// <summary>
    /// 把每个敌人的下回合意图写成一行字（Slay the Spire 式的"出牌预告"）。
    /// 复用的是 TakeEnemyTurn 同一份决策逻辑，所以预告不会骗人。
    /// </summary>
    public static void RefreshIntents(GameState state)
    {
        var combat = state.Combat;
        if (combat is null) return;
        foreach (var u in combat.Units) u.Intent = "";
        if (combat.IsOver) return;
        foreach (var enemy in combat.Units.Where(u => u.Side == Side.Enemy && !u.Downed))
        {
            try
            {
                var plan = ChooseEnemyAction(combat, enemy);
                enemy.Intent = DescribeIntent(enemy, plan.Skill, plan.Target);
            }
            catch
            {
                enemy.Intent = "";
            }
        }
    }

    private static string DescribeIntent(CombatUnit enemy, SkillDef skill, CombatUnit target)
    {
        var heal = skill.Effects.FirstOrDefault(e => e.Type == "heal");
        if (heal is not null) return $"{skill.Name} → {target.Name} +{heal.Amount}";
        if (skill.Effects.Any(e => e.Type == "summon_enemy")) return $"{skill.Name}：召唤增援";
        if (skill.Effects.Any(e => e.Type == "shield")) return $"{skill.Name} → {target.Name} 上盾";
        var per = EstimatePerHit(enemy, skill);
        return skill.Target switch
        {
            TargetType.AllEnemies => $"{skill.Name}：全体 {skill.Dice}×{per}",
            TargetType.Enemy => $"{skill.Name} → {target.Name} {skill.Dice}×{per}",
            TargetType.Self or TargetType.AllAllies => $"{skill.Name}：自身强化",
            _ => skill.Name
        };
    }

    /// <summary>按当前属性估算每一次判定的伤害（不含护甲减免）。</summary>
    private static int EstimatePerHit(CombatUnit attacker, SkillDef skill)
    {
        var stat = attacker.Stats[skill.ScaleStat];
        return Math.Max(1, skill.DamagePerDie + Dice.DamageBonus(stat) + attacker.DamageBonus +
                          attacker.Statuses.Sum(s => s.DamageMod));
    }

    private static void MoveEnemyToward(CombatState combat, CombatUnit enemy, CombatUnit target, int desiredRange)
    {
        if (enemy.MovementLeft <= 0) return;
        var blocked = combat.Units.Where(u => !u.Downed && u.Id != enemy.Id).Select(u => $"{u.Col},{u.Row}").ToHashSet();
        foreach (var t in combat.Terrain.Where(t => t.Type == "obstacle")) blocked.Add($"{t.Col},{t.Row}");
        // 主脑「协议覆写」关闭的格子不可进入（站上去会掉血，但不会把人困死）
        if (combat.BossMechanic?.ClosedCells is { Count: > 0 } closed)
            foreach (var cell in closed) blocked.Add(cell);
        var reachable = Hex.Reachable(enemy.Col, enemy.Row, enemy.MovementLeft, combat.Width, combat.Height, blocked);
        if (reachable.Count == 0) return;
        var candidates = reachable.Select(h => new
        {
            h,
            d = Hex.Distance(h.Col, h.Row, target.Col, target.Row)
        }).ToList();
        var best = candidates.Where(x => x.d <= desiredRange).OrderByDescending(x => x.d).FirstOrDefault()
                   ?? candidates.OrderBy(x => x.d).First();
        var moveDistance = Hex.Distance(enemy.Col, enemy.Row, best.h.Col, best.h.Row);
        enemy.Col = best.h.Col;
        enemy.Row = best.h.Row;
        enemy.MovementLeft = Math.Max(0, enemy.MovementLeft - moveDistance);
        CombatLog(combat, $"{enemy.Name} 移动到 ({enemy.Col},{enemy.Row})。");
    }

    private static bool CheckCombatEnd(GameState state, CombatState combat)
    {
        if (combat.IsOver) return true;
        var enemiesAlive = combat.Units.Any(u => u.Side == Side.Enemy && !u.Downed);
        var playersAlive = combat.Units.Any(u => u.Side == Side.Player && !u.Downed);
        if (!enemiesAlive)
        {
            WinCombat(state, combat);
            return true;
        }
        if (!playersAlive)
        {
            // 后果「遗物的余温」：本幕第一次本该全灭时，把一个人拽回来
            if (ConsequenceEngine.LastStand(state))
            {
                var saved = combat.Units.FirstOrDefault(u => u.Side == Side.Player);
                if (saved is not null)
                {
                    saved.Downed = false;
                    saved.Hp = 1;
                    ConsequenceEngine.ConsumeLastStand(state);
                    CombatLog(combat, $"遗物的余温：{saved.Name} 在倒下的一瞬间被拽了回来（1 HP）。");
                    return false;
                }
            }
            LoseCombat(state, combat);
            return true;
        }
        return false;
    }

    private static void WinCombat(GameState state, CombatState combat)
    {
        combat.IsOver = true;
        combat.Result = "victory";
        var node = state.Node(combat.NodeId);
        if (node is not null) node.Cleared = true;
        var active = state.ActivePlayer;
        var nodeType = node?.Type ?? NodeType.Combat;
        var baseXp = 35 + combat.EnemyUnits.Sum(u => GameData.Enemies.TryGetValue(u.EnemyId ?? "", out var e) ? e.Tier * 12 : 8);
        var baseMemory = 45 + combat.EnemyUnits.Sum(u => GameData.Enemies.TryGetValue(u.EnemyId ?? "", out var e) ? e.Tier * 10 : 5);
        var xpMul = nodeType switch { NodeType.Skirmish => 0.28, NodeType.Elite => 1.5, NodeType.KeyElite => 1.8, _ => 1.0 };
        var memMul = nodeType switch { NodeType.Skirmish => 0.3, NodeType.Elite => 2.2, NodeType.KeyElite => 2.4, _ => 1.0 };
        var xp = (int)Math.Round(baseXp * xpMul);
        var memory = (int)Math.Round(baseMemory * memMul);
        memory = ChallengeEngine.Reward(state, memory);
        memory = BossMechanics.OnVictory(state, combat, memory);
        xp = (int)Math.Round(xp * Math.Max(1, ChallengeEngine.RewardMul(state) * 0.5));
        state.Memory += memory;
        state.Stats.Victories++;
        state.Stats.CombatRounds += Math.Max(1, combat.Round);
        if (nodeType is NodeType.Elite or NodeType.KeyElite) state.Stats.EliteKills++;
        if (nodeType != NodeType.Skirmish) state.Alloy += 1;
        foreach (var p in state.Players.Where(p => p.NodeId == combat.NodeId))
        {
            var unit = combat.Units.FirstOrDefault(u => u.PlayerId == p.Id && !u.IsSummon);
            if (unit is not null)
            {
                p.Hp = Math.Max(1, unit.Hp);
                p.Focus = unit.Focus;
                if (unit.Downed)
                {
                    // 战斗胜利不会自动复活倒下的队友。保留“队伍生命”，
                    // 让玩家在安全屋做复活 / 继续冒险的取舍。
                    p.Downed = true;
                    p.Hp = 0;
                }
                p.AssistBonus = 0;
                GameRules.RecalculatePlayer(p);
                GameRules.GrantXp(state, p, xp);
            }
        }

        QuestHooks.OnCombatWin(state, nodeType);

        if (node is not null && node.Type == NodeType.Boss)
        {
            var actDef = GameData.Acts[state.Act];
            state.BossDefeated = true;
            var receiver = active ?? state.Players.First();
            if (!string.IsNullOrWhiteSpace(actDef.BossDrop))
                GameRules.GrantItem(state, receiver, actDef.BossDrop, "终局战利品");

            if (state.Act < 3)
            {
                var next = GameData.Acts[state.Act + 1];
                state.Phase = GamePhase.ActTransition;
                state.Outcome = actDef.Interlude;
                state.NextActName = next.Name;
                state.NextActSubtitle = next.Subtitle;
                state.NextActObjective = next.Objective;
                state.Message = $"{actDef.Name} 完成。{next.Name} 正在接入。";
                GameRules.Log(state, actDef.Interlude, "victory");
                GameRules.Log(state, $"幕间战利品：{receiver.Name} 获得 {GameData.Gear[actDef.BossDrop].Name}。", "loot");
                combat.Log.Add($"{actDef.Name} 已完成。下一幕：{next.Name}。");
            }
            else
            {
                state.Phase = GamePhase.Victory;
                state.Outcome = actDef.FinalOutcome;
                if (state.QuestClaims >= 4)
                    state.Outcome += "\n\n城市记得你们做过的事，虽然它不打算告诉任何人。";
                state.Message = "零号协议已终止。";
                GameRules.Log(state, state.Outcome, "victory");
                GameRules.Log(state, $"终局战利品：{receiver.Name} 获得 {GameData.Gear[actDef.BossDrop].Name}。", "loot");
                combat.Log.Add("零号协议已关闭。");
            }
        }
        else if (node is not null && node.Type == NodeType.KeyElite)
        {
            var rng = new Random(state.Seed ^ (state.Log.Count * 41) ^ combat.Round);
            var receiver = active ?? state.Players.First();
            state.KeyShards = Math.Min(state.KeyShardGoal, state.KeyShards + 1);
            if (state.KeyShards >= state.KeyShardGoal) state.HasKey = true;
            var rarePool = state.Act switch
            {
                2 => new[] { "w_mirror_blade", "a_mirror_suit", "h_mirror_crown", "t_mirror_invite", "c_core" },
                3 => new[] { "w_orbit_lance", "a_orbit_shell", "h_orbit_halo", "t_orbit_key", "c_singularity" },
                _ => new[] { "w_blade_rare", "w_deck_rare", "w_rifle_rare", "a_plate", "h_crown", "t_heart" }
            };
            GameRules.GrantItem(state, receiver, rarePool[rng.Next(rarePool.Length)], "密钥看守的遗物");
            GameRules.GrantConsumable(state, receiver, state.Act >= 2 ? "adrenaline" : "medkit", 1);
            var keyName = GameData.Acts.TryGetValue(state.Act, out var ad) ? ad.KeyName : "密钥";
            state.Message = state.HasKey
                ? $"看守者倒下。{keyName}已集齐（{state.KeyShards}/{state.KeyShardGoal}），终局大门解锁。"
                : $"看守者倒下。密钥碎片 {state.KeyShards}/{state.KeyShardGoal}。";
            GameRules.Log(state, state.Message, "story");
            combat.Log.Add(state.Message);
        }
        else if (node is not null && node.Type == NodeType.Skirmish)
        {
            var rng = new Random(state.Seed ^ (state.Log.Count * 41) ^ combat.Round);
            var receiver = active ?? state.Players.First();
            if (rng.Next(100) < 15) GameRules.GrantConsumable(state, receiver, GameRules.RandomConsumableId(state.Act, rng), 1);
            state.Message = $"遭遇战结束。获得 {memory} 记忆币、{xp} XP。";
            GameRules.Log(state, state.Message, "victory");
            combat.Log.Add(state.Message);
        }
        else
        {
            var lootPool = state.Act switch
            {
                2 => new[] { "w_blade", "w_rifle", "w_deck", "w_gauntlet", "a_mirror_suit", "h_mirror_crown", "t_mirror_invite", "t_chip", "c_eye" },
                3 => new[] { "w_orbit_lance", "a_orbit_shell", "h_orbit_halo", "t_orbit_key", "w_blade_rare", "t_heart", "c_core" },
                _ => new[] { "w_blade", "w_rifle", "w_deck", "w_gauntlet", "a_plate", "a_robe", "h_crown", "t_chip", "c_eye" }
            };
            var rng = new Random(state.Seed ^ (state.Log.Count * 41) ^ combat.Round);
            var loot = lootPool[rng.Next(lootPool.Length)];
            var receiver = active ?? state.Players.First();
            GameRules.GrantItem(state, receiver, loot, "战斗掉落");
            state.Message = $"战斗胜利。获得 {memory} 记忆币、1 合金、{xp} XP。";
            GameRules.Log(state, state.Message, "victory");
            combat.Log.Add(state.Message);
        }
        state.LastRoll = combat.LastRoll;
    }

    internal static void LoseCombatPublic(GameState state, CombatState combat, string? label, string? outcome)
        => LoseCombat(state, combat, label, outcome);

    private static void LoseCombat(GameState state, CombatState combat, string? label = null, string? outcome = null)
    {
        combat.IsOver = true;
        combat.Result = "defeat";
        state.Phase = GamePhase.Defeat;
        state.Outcome = outcome ?? state.Act switch
        {
            2 => "你们的名字从镜海穹顶的宾客名单上消失了。执政官把这件事归档为一次成功的礼宾服务。",
            3 => "轨道重新安静下来。零号协议继续开会，并把你们的席位标记为‘已缺席’。",
            _ => "你们的信号从霓虹港的战术地图上消失了。拍卖人继续敲他的锤子。"
        };
        state.DefeatedBy = label ?? "战斗失败";
        foreach (var p in state.Players.Where(p => p.NodeId == combat.NodeId))
        {
            var unit = combat.Units.FirstOrDefault(u => u.PlayerId == p.Id && !u.IsSummon);
            if (unit is not null)
            {
                p.Hp = unit.Hp;
                p.Focus = unit.Focus;
                p.Downed = unit.Downed;
            }
        }
        GameRules.Log(state, state.Outcome, "death");
        combat.Log.Add(state.Outcome);
    }

    private static void RestoreSnapshot(GameState state, CombatState combat, CombatUnit caster)
    {
        var startUnits = combat.StartUnits.Select(CloneUnit).ToList();
        if (startUnits.All(u => u.Id != caster.Id)) return;
        combat.Units = startUnits;
        combat.TurnOrder = combat.StartTurnOrder.ToList();
        combat.Round = combat.StartRound;
        combat.ActiveUnitId = caster.Id;
        var restoredCaster = combat.Units.First(u => u.Id == caster.Id);
        restoredCaster.Hp = 1;
        restoredCaster.Downed = false;
        restoredCaster.UltimateUsed = true;
        foreach (var u in combat.Units) u.Statuses.Clear();
        combat.LastRoll = new RollResult
        {
            Kind = "support",
            Label = "上下文回滚",
            SkillName = "上下文回滚",
            AttackerName = caster.Name,
            Success = true,
            Detail = "时间线被折叠回战斗开始。长夜记得所有人受过的伤。"
        };
        state.LastRoll = combat.LastRoll;
        CombatLog(combat, "长夜发动「上下文回滚」：战斗回到起点，自身保留 1 HP。");
        UpdateUiLists(combat);
    }

    private static CombatUnit CloneUnit(CombatUnit u) => new()
    {
        Id = u.Id,
        Name = u.Name,
        Side = u.Side,
        PlayerId = u.PlayerId,
        EnemyId = u.EnemyId,
        Portrait = u.Portrait,
        Color = u.Color,
        Role = u.Role,
        Hp = u.Hp,
        MaxHp = u.MaxHp,
        Shield = u.Shield,
        Armor = u.Armor,
        Resistance = u.Resistance,
        Evasion = u.Evasion,
        Speed = u.Speed,
        AccuracyBonus = u.AccuracyBonus,
        DamageBonus = u.DamageBonus,
        Focus = u.Focus,
        MaxFocus = u.MaxFocus,
        Col = u.Col,
        Row = u.Row,
        Movement = u.Movement,
        Moved = u.Moved,
        Acted = u.Acted,
        Downed = u.Downed,
        IsSummon = u.IsSummon,
        SummonDuration = u.SummonDuration,
        Stats = u.Stats.Clone(),
        SkillIds = u.SkillIds.ToList(),
        Cooldowns = u.Cooldowns.ToDictionary(kv => kv.Key, kv => kv.Value),
        UltimateUsed = u.UltimateUsed,
        Statuses = u.Statuses.Select(s => new StatusState
        {
            Id = s.Id,
            Name = s.Name,
            Duration = s.Duration,
            DamagePerTurn = s.DamagePerTurn,
            AccuracyMod = s.AccuracyMod,
            DamageMod = s.DamageMod,
            ArmorMod = s.ArmorMod,
            ResistanceMod = s.ResistanceMod,
            EvasionMod = s.EvasionMod,
            SpeedMod = s.SpeedMod,
            MovementMod = s.MovementMod,
            Stun = s.Stun,
            Taunt = s.Taunt,
            Marked = s.Marked,
            SourceId = s.SourceId,
            IsBuff = s.IsBuff
        }).ToList(),
        WeaponItemId = u.WeaponItemId,
        WeaponName = u.WeaponName,
        WeaponDice = u.WeaponDice,
        WeaponAccuracy = u.WeaponAccuracy,
        WeaponDamage = u.WeaponDamage,
        WeaponType = u.WeaponType,
        WeaponScale = u.WeaponScale,
        WeaponRange = u.WeaponRange,
        MovementLeft = u.MovementLeft,
        ExtraActions = u.ExtraActions,
        PassiveKey = u.PassiveKey,
        CheatDeathUsed = u.CheatDeathUsed,
        DecoyUsed = u.DecoyUsed,
        KimiUsed = u.KimiUsed,
        GeminiRerollUsed = u.GeminiRerollUsed,
        SummonKind = u.SummonKind
    };

    private static CombatState CloneState(CombatState combat) => new()
    {
        NodeId = combat.NodeId,
        EnemyGroupId = combat.EnemyGroupId,
        Width = combat.Width,
        Height = combat.Height,
        Round = combat.Round,
        Units = combat.Units.Select(CloneUnit).ToList(),
        TurnOrder = combat.TurnOrder.ToList(),
        ActiveUnitId = combat.ActiveUnitId,
        Terrain = combat.Terrain.Select(t => new TerrainState { Col = t.Col, Row = t.Row, Type = t.Type, Name = t.Name }).ToList(),
        Reachable = combat.Reachable.ToList(),
        Targetable = combat.Targetable.ToList(),
        Log = combat.Log.ToList(),
        LastRoll = combat.LastRoll,
        LastPlayerRoll = combat.LastPlayerRoll,
        LastActions = combat.LastActions.ToList(),
        IsOver = combat.IsOver,
        Result = combat.Result,
        Hint = combat.Hint,
        SelectedSkillId = combat.SelectedSkillId,
        LastAllySkillId = combat.LastAllySkillId,
        LastAllySkillRound = combat.LastAllySkillRound,
        SummonCounter = combat.SummonCounter
    };

    private static void RestoreState(CombatState combat, CombatState snapshot)
    {
        combat.Units = snapshot.Units;
        combat.TurnOrder = snapshot.TurnOrder;
        combat.ActiveUnitId = snapshot.ActiveUnitId;
        combat.Round = snapshot.Round;
        combat.LastRoll = snapshot.LastRoll;
        combat.LastPlayerRoll = snapshot.LastPlayerRoll;
        combat.LastActions = snapshot.LastActions;
        combat.IsOver = snapshot.IsOver;
        combat.Result = snapshot.Result;
        combat.Reachable = snapshot.Reachable;
        combat.Targetable = snapshot.Targetable;
        combat.LastAllySkillId = snapshot.LastAllySkillId;
        combat.LastAllySkillRound = snapshot.LastAllySkillRound;
        combat.SummonCounter = snapshot.SummonCounter;
    }


    private static bool isSkirmishHint(NodeState node) => node.Type == NodeType.Skirmish;

    /// <summary>每种敌人组一句话机制提示，让新人先看懂再挨打。</summary>
    private static string MechanicHint(string? group) => group switch
    {
        "g_medic" => "提示：敌方医疗机会优先修复残血同伴，先处理它。",
        "g_medic2" => "提示：敌方医疗机会优先修复残血同伴，先处理它。",
        "g_skim_hack" => "提示：黑客幽灵会降低你的命中，别拖太久。",
        "g_skim_swarm" => "提示：蜂群每回合多段攻击，护甲比闪避更可靠。",
        "g_audit" => "提示：审计官会削减命中，优先用必中或范围技能。",
        "g_choir" => "提示：唱诗班会削弱你的抗性，技术伤害会更疼。",
        "g_skim_mirror" => "提示：镜面单位会给同伴套护甲，先破增益再打。",
        "g_skim_orbit" => "提示：轨道守卫护甲极厚，技术伤害或破甲更有效。",
        "g_skim_ember" => "提示：零号余烬会烧穿护甲，速战速决。",
        "g_seraph" => "提示：白噪天使会标记目标，被标记时伤害 +20%。",
        "g_elite" => "提示：精英队有医疗机，先断治疗链。",
        "g_elite2" => "提示：精英队有医疗机，先断治疗链。",
        "g_elite3" => "提示：精英队有医疗机，先断治疗链。",
        _ => ""
    };

    /// <summary>消耗品在战斗中的结算。探索阶段在 GameEngine 里另有一套。</summary>
    private static void ApplyConsumable(CombatState combat, CombatUnit target, ConsumableDef def, PlayerState? owner = null)
    {
        switch (def.Effect)
        {
            case "heal":
            {
                var heal = Math.Max(1, target.MaxHp * def.Amount / 100);
                var boosted = GearTraits.BoostConsumable(owner, heal);
                if (boosted != heal) CombatLog(combat, $"装备特性 · 消耗品强化：治疗 {heal} → {boosted}。");
                heal = boosted;
                target.Hp = Math.Min(target.MaxHp, target.Hp + heal);
                CombatLog(combat, $"{target.Name} 恢复 {heal} HP。");
                break;
            }
            case "focus":
                target.Focus = Math.Min(target.MaxFocus, target.Focus + def.Amount);
                CombatLog(combat, $"{target.Name} 恢复 {def.Amount} Focus。");
                break;
            case "cleanse":
                target.Statuses.RemoveAll(x => !x.IsBuff);
                CombatLog(combat, $"{target.Name} 的负面状态被清除。");
                break;
            case "shield":
            {
                var amount = GearTraits.BoostConsumable(owner, def.Amount);
                target.Shield += amount;
                CombatLog(combat, $"{target.Name} 获得 {amount} 护盾。");
                break;
            }
            case "haste":
                AddStatus(target, "buff_haste", "肾上腺素", Math.Max(1, def.Amount), isBuff: true,
                    speedMod: 8, accuracyMod: 5);
                CombatLog(combat, $"{target.Name} 速度 +8、命中 +5，持续 {def.Amount} 回合。");
                break;
        }
    }

    private static Random ActionRng(GameState state)
        => new(state.Seed ^ (state.Round * 104729) ^ (state.Log.Count * 7919) ^ (state.Purge * 31) ^ ((state.Combat?.Round ?? 0) * 313));
}
