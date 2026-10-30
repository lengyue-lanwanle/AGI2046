namespace AGI2046.Rules;

/// <summary>
/// 首领专属机制（0.24 / 任务 P）。三个首领各一套，共同约束：
///   1. 机制在开场横幅和战斗内一直可见（Title + Hint），不靠死记；
///   2. 一阶段和二阶段的解法不同；
///   3. 机制失误只扣资源（记忆币 / 电子追踪），不做「无提示秒杀」；
///   4. 全部走状态字段，单人热座与联机走同一条路径。
/// </summary>
public static class BossMechanics
{
    /// <summary>战前预告：进战斗前就能读到的机制说明（UI 用，不参与判定）。</summary>
    public static readonly (int Act, string BossId, string Name, string Title, string Hint, string Phase2)[] Preview =
    {
        (1, "e_boss_auctioneer", "拍卖人", "拍卖：账要有人付",
            "每 2 轮开一次价。拒绝它会更强；接受要付记忆币或队伍生命。",
            "清仓：从台下取回生命，先拆「记忆盲盒」才能断掉它的回收。"),
        (2, "e_boss_archon", "镜面执政官", "学习：它会变成你的打法",
            "它记录你最近用的伤害类型。换着打，或者用「防御」污染它的样本。",
            "分摊：它会分裂镜像，优先咬血最少的那个。"),
        (3, "e_boss_zero", "零号协议·主脑", "协议覆写：棋盘与时限",
            "每 3 轮关闭 2 格，踩上去会掉血；二阶段要在 5 轮内拆掉 3 个协议节点。",
            "上传：护盾归零、护甲抗性下降，但电子追踪推进更快。")
    };

    /* ── 初始化 ─────────────────────────────────────────────────── */

    public static void OnCombatStart(GameState state, CombatState combat)
    {
        var boss = combat.Units.FirstOrDefault(u => u.Side == Side.Enemy && u.Role == "首领");
        if (boss?.EnemyId is null) return;
        var kind = boss.EnemyId switch
        {
            "e_boss_auctioneer" => "auction",
            "e_boss_archon" => "mirror",
            "e_boss_zero" => "protocol",
            _ => ""
        };
        if (kind.Length == 0) return;

        var mech = new BossMechanicState
        {
            BossId = boss.EnemyId,
            Kind = kind,
            Title = kind switch
            {
                "auction" => "拍卖：账要有人付",
                "mirror" => "学习：它会变成你的打法",
                _ => "协议覆写：棋盘与时限"
            },
            Hint = kind switch
            {
                "auction" => "每 2 轮开一次价。拒绝它会更强；接受要付记忆币或队伍生命。",
                "mirror" => "它记录你最近用的伤害类型。换着打，或者用「防御」污染它的样本。",
                _ => "每 3 轮关闭 2 格，踩上去会掉血；二阶段要在 5 轮内拆掉 3 个协议节点。"
            }
        };
        combat.BossMechanic = mech;
        combat.Log.Add($"首领机制 · {mech.Title}：{mech.Hint}");

        if (kind == "auction") OfferTrade(state, combat, mech);
    }

    /* ── 拍卖人：交易 ───────────────────────────────────────────── */

    private static void OfferTrade(GameState state, CombatState combat, BossMechanicState mech)
    {
        if (mech.Trades.Count(t => t.State == "open") >= 2) return;
        var pool = new List<BossTrade>();
        if (state.Memory >= 40)
        {
            pool.Add(new BossTrade
            {
                Id = "credit", Title = "赊一笔账",
                Cost = "40 记忆币", Gain = "全队命中 +6",
                Detail = "它先给你货，账记在本幕结束。"
            });
        }
        if (state.TeamLives > 1)
        {
            pool.Add(new BossTrade
            {
                Id = "blood", Title = "抵押一条命",
                Cost = "1 队伍生命", Gain = "全队伤害 +2",
                Detail = "它对你的命很感兴趣，出价也最爽快。"
            });
        }
        pool.Add(new BossTrade
        {
            Id = "silence", Title = "买它闭嘴",
            Cost = "25 记忆币", Gain = "本场它不再开价",
            Detail = "一次性付清，这一场它不会再用交易分散你的注意力。"
        });

        var rng = new Random(state.Seed ^ (combat.Round * 7919) ^ mech.Trades.Count * 31);
        var pick = pool[rng.Next(pool.Count)];
        if (mech.Trades.Any(t => t.Id == pick.Id && t.State == "open")) return;
        pick.State = "open";
        mech.Trades.Add(pick);
        combat.Log.Add($"拍卖人开价「{pick.Title}」：{pick.Cost} 换 {pick.Gain}。接受或拒绝都算回答。");
        state.Message = $"拍卖人开价：{pick.Title}";
        state.Stats.BossTradesOffered++;
    }

    /// <summary>玩家回应一笔交易（action.Type = bossTrade，Slot = 交易 id 或 decline）。</summary>
    public static GameState Trade(GameState state, GameAction action)
    {
        var combat = state.Combat ?? throw new GameException("当前没有战斗。");
        var mech = combat.BossMechanic ?? throw new GameException("这场战斗没有拍卖机制。");
        if (mech.Kind != "auction") throw new GameException("这个首领不做交易。");
        var boss = combat.Units.FirstOrDefault(u => u.Side == Side.Enemy && !u.Downed && u.Role == "首领");
        if (boss is null) return state;

        var slot = (action.Slot ?? "").Trim();
        if (string.Equals(slot, "decline", StringComparison.OrdinalIgnoreCase))
        {
            foreach (var t in mech.Trades.Where(t => t.State == "open")) t.State = "declined";
            mech.Refusals++;
            boss.DamageBonus += 2;
            combat.Log.Add($"你拒绝了拍卖人。它笑了：伤害 +2（累计 +{boss.DamageBonus}）。");
            state.Message = "拍卖人记下了你的拒绝。";
            return state;
        }

        var trade = mech.Trades.FirstOrDefault(t => t.Id == slot && t.State == "open")
                    ?? throw new GameException("这笔交易已经不在了。");

        switch (trade.Id)
        {
            case "credit":
                if (state.Memory < 40) throw new GameException("记忆币不足。");
                state.Memory -= 40;
                foreach (var u in combat.Units.Where(u => u.Side == Side.Player && !u.Downed))
                    u.AccuracyBonus += 6;
                combat.Log.Add("赊账成交：全队命中 +6。账记在本幕结束。");
                break;
            case "blood":
                if (state.TeamLives <= 1) throw new GameException("队伍生命见底，它不收这笔抵押。");
                state.TeamLives -= 1;
                foreach (var u in combat.Units.Where(u => u.Side == Side.Player && !u.Downed))
                    u.DamageBonus += 2;
                combat.Log.Add("抵押成交：全队伤害 +2，队伍生命 -1。");
                break;
            case "silence":
                if (state.Memory < 25) throw new GameException("记忆币不足。");
                state.Memory -= 25;
                mech.Flags.Add("silenced");
                combat.Log.Add("你买下了它的沉默：本场不再开价。");
                break;
        }

        trade.State = "accepted";
        mech.Accepted++;
        state.Stats.BossTradesAccepted++;
        state.Message = $"交易成立：{trade.Title}。";
        return state;
    }

    /* ── 镜面执政官：学习 ───────────────────────────────────────── */

    /// <summary>玩家每次用技能/防御，都算一次「样本」。防御是污染样本的最便宜方式。</summary>
    public static void OnPlayerAction(GameState state, CombatState combat, CombatUnit unit, string actionType, SkillDef? skill)
    {
        var mech = combat.BossMechanic;
        if (mech is null || mech.Kind != "mirror" || unit.Side != Side.Player) return;

        if (actionType == "defend")
        {
            if (mech.LearnStacks > 0)
            {
                mech.LearnStacks--;
                combat.Log.Add($"镜面学到了犹豫：学习层数 -1（{mech.LearnStacks}/3）。");
            }
            if (mech.LearnStacks == 0)
            {
                mech.LearnType = "none";
                RebalanceMirrors(state, combat, mech);
            }
            return;
        }

        if (skill is null) return;
        var type = skill.DamageType == DamageType.Tech ? "tech" : "physical";
        if (mech.LearnType != type)
        {
            // 换类型 = 重新开始学，这是「换着打」的收益
            mech.LearnType = type;
            mech.LearnStacks = 1;
            combat.Log.Add($"镜面开始学习{(type == "tech" ? "技术" : "物理")}结构（1/3）。");
        }
        else if (mech.LearnStacks < 3)
        {
            mech.LearnStacks++;
            combat.Log.Add($"镜面加深了{(type == "tech" ? "技术" : "物理")}理解（{mech.LearnStacks}/3）。");
        }
        RebalanceMirrors(state, combat, mech);
    }

    /// <summary>把「学到的东西」变成镜像和首领的抗性。层数越高越硬，但有上限。</summary>
    private static void RebalanceMirrors(GameState state, CombatState combat, BossMechanicState mech)
    {
        var targets = combat.Units
            .Where(u => u.Side == Side.Enemy && !u.Downed &&
                        (u.Role == "首领" || u.Name.Contains("镜像") || u.EnemyId == "e_mirror"))
            .ToList();
        // 上限 +4：三层叠满会给物理队直接加 6 点护甲，实测把二阶段变成「打不动」。
        var bonus = Math.Min(mech.LearnStacks, 2) * 2;
        foreach (var t in targets)
        {
            // 先把自己上次加过的量退掉，再按「当前学到的类型」重新加。
            // 少了这一步，换类型时上一种抗性会留在身上——等于学习只涨不跌。
            if ((t.LearnedArmor ?? 0) != 0)
            {
                t.Armor = Math.Max(0, t.Armor - t.LearnedArmor!.Value);
                t.LearnedArmor = 0;
            }
            if ((t.LearnedResist ?? 0) != 0)
            {
                t.Resistance = Math.Max(0, t.Resistance - t.LearnedResist!.Value);
                t.LearnedResist = 0;
            }
            if (mech.LearnType == "physical" && bonus > 0)
            {
                t.Armor += bonus;
                t.LearnedArmor = bonus;
            }
            else if (mech.LearnType == "tech" && bonus > 0)
            {
                t.Resistance += bonus;
                t.LearnedResist = bonus;
            }
        }
        if (bonus > 0)
            combat.Log.Add($"镜像同步：{(mech.LearnType == "tech" ? "技术" : "物理")}抗性 +{bonus}（层数 {mech.LearnStacks}/3，上限 +4）。");
    }

    /// <summary>二阶段：镜像优先级改为「咬最低血」。用 Flag 表达，AI 侧读。</summary>
    public static bool MirrorHuntsWeakest(CombatState combat)
        => combat.BossMechanic is { Kind: "mirror" } m && combat.BossPhase >= 2 && m.LearnStacks >= 2;

    /* ── 主脑：关格 + 并行目标 ─────────────────────────────────── */

    /// <summary>每 3 轮关 2 格；踩在关格上开场掉 3 点。只关空格和不重要地形。</summary>
    public static void OnNewRound(GameState state, CombatState combat)
    {
        var mech = combat.BossMechanic;
        if (mech is null) return;

        if (mech.Kind == "auction")
        {
            // 一阶段每 2 轮开一次价；二阶段每 3 轮
            var every = combat.BossPhase >= 2 ? 3 : 2;
            if (!mech.Flags.Contains("silenced") && combat.Round % every == 0)
                OfferTrade(state, combat, mech);
            return;
        }

        if (mech.Kind != "protocol") return;

        if (combat.Round % 3 == 0)
        {
            var taken = combat.Units.Where(u => !u.Downed).Select(u => $"{u.Col},{u.Row}").ToHashSet();
            var rng = new Random(state.Seed ^ (combat.Round * 104729));
            var closed = 0;
            for (var guard = 0; guard < 40 && closed < 2; guard++)
            {
                var col = rng.Next(combat.Width);
                var row = rng.Next(combat.Height);
                var key = $"{col},{row}";
                if (mech.ClosedCells.Contains(key) || taken.Contains(key)) continue;
                mech.ClosedCells.Add(key);
                closed++;
            }
            if (closed > 0) combat.Log.Add($"协议覆写：{closed} 格被关闭，站在上面的人每轮掉 3 点。");
        }

        // 站在关闭格上：掉血（可见、可躲、不致命）
        foreach (var u in combat.Units.Where(u => !u.Downed))
        {
            if (!mech.ClosedCells.Contains($"{u.Col},{u.Row}")) continue;
            u.Hp = Math.Max(1, u.Hp - 3);
            combat.Log.Add($"{u.Name} 站在关闭格上，协议灼烧 -3 HP。");
        }

        // 二阶段：限时并行目标
        if (combat.BossPhase >= 2 && mech.ProtocolNodes.Count == 0 && !mech.Flags.Contains("protocol_done"))
        {
            var boss = combat.Units.FirstOrDefault(u => u.Side == Side.Enemy && !u.Downed && u.Role == "首领");
            if (boss is null) return;
            mech.DeadlineRound = combat.Round + 5;
            for (var i = 0; i < 3; i++)
            {
                var node = SpawnProtocolNode(state, combat, boss, i);
                if (node is not null) mech.ProtocolNodes.Add(node.Id);
            }
            combat.Log.Add($"主脑挂载 3 个协议节点（各 9 HP）：第 {mech.DeadlineRound} 轮前没拆完，每个节点扣 2 点电子追踪。");
            state.Message = "拆掉 3 个协议节点。";
        }

        if (mech.ProtocolNodes.Count > 0)
        {
            var alive = mech.ProtocolNodes
                .Select(id => combat.Units.FirstOrDefault(u => u.Id == id && !u.Downed))
                .Where(u => u is not null).ToList();
            mech.ProtocolNodes = alive.Select(u => u!.Id).ToList();
            if (mech.ProtocolNodes.Count == 0 && !mech.Flags.Contains("protocol_done"))
            {
                mech.Flags.Add("protocol_done");
                combat.Log.Add("3 个协议节点全部拆除：主脑的覆写被打断，护甲 -3。");
                var boss = combat.Units.FirstOrDefault(u => u.Side == Side.Enemy && !u.Downed && u.Role == "首领");
                if (boss is not null) boss.Armor = Math.Max(0, boss.Armor - 3);
            }
        }

        if (combat.Round >= mech.DeadlineRound && mech.DeadlineRound > 0 && mech.ProtocolNodes.Count > 0)
        {
            var left = mech.ProtocolNodes.Count;
            mech.ProtocolNodes.Clear();
            mech.Flags.Add("protocol_done");
            GameRules.AdjustPurge(state, -left * 2);
            combat.Log.Add($"限期到了：{left} 个节点没拆完，电子追踪 -{left * 2}（剩余 {state.Purge}/{state.PurgeMax}）。");
            if (state.Purge <= 0)
            {
                CombatEngine.LoseCombatPublic(state, combat, "协议覆写完成",
                    "节点把整座城市写进了同一份档案，你们的名字排在最后一行。");
            }
        }
    }

    private static CombatUnit? SpawnProtocolNode(GameState state, CombatState combat, CombatUnit boss, int index)
    {
        var taken = combat.Units.Where(u => !u.Downed).Select(u => $"{u.Col},{u.Row}").ToHashSet();
        var rng = new Random(state.Seed ^ (combat.Round * 31 + index * 977));
        for (var guard = 0; guard < 60; guard++)
        {
            var col = rng.Next(combat.Width);
            var row = rng.Next(combat.Height);
            var key = $"{col},{row}";
            if (taken.Contains(key)) continue;
            if (combat.BossMechanic?.ClosedCells.Contains(key) == true) continue;
            if (combat.Terrain.Any(t => t.Type == "obstacle" && t.Col == col && t.Row == row)) continue;

            var unit = new CombatUnit
            {
                Id = $"pn{combat.Round}_{index}",
                Name = $"协议节点 {index + 1}",
                Side = Side.Enemy,
                Role = "节点",
                EnemyId = "e_zero_shard",
                MaxHp = 9, Hp = 9,
                Armor = 0, Resistance = 0, Evasion = 0,
                Speed = 1, Movement = 0,
                Col = col, Row = row,
                IsSummon = true,
                SummonDuration = 99,
                Portrait = boss.Portrait
            };
            combat.Units.Add(unit);
            combat.TurnOrder.Add(unit.Id);
            return unit;
        }
        return null;
    }

    /// <summary>胜利后的结算：拍卖人按交易记录改变奖励。</summary>
    public static int OnVictory(GameState state, CombatState combat, int memory)
    {
        var mech = combat.BossMechanic;
        if (mech is null) return memory;
        if (mech.Kind != "auction") return memory;
        var mul = 1 + 0.15 * mech.Accepted - 0.05 * mech.Refusals;
        mul = Math.Clamp(mul, 0.6, 1.6);
        var result = (int)Math.Round(memory * mul);
        if (mech.Accepted > 0 || mech.Refusals > 0)
            state.Log.Add(new LogEntry
            {
                Round = state.Round,
                Kind = "story",
                Text = $"拍卖结算：成交 {mech.Accepted} 笔、拒绝 {mech.Refusals} 次 → 记忆币 ×{mul:0.00}。"
            });
        return result;
    }

    /// <summary>给 UI 的一句话：现在这套机制在做什么。</summary>
    public static string Describe(CombatState combat)
    {
        var mech = combat.BossMechanic;
        if (mech is null) return "";
        return mech.Kind switch
        {
            "auction" => $"成交 {mech.Accepted} · 拒绝 {mech.Refusals}" +
                         (mech.Flags.Contains("silenced") ? " · 已买断沉默" : ""),
            "mirror" => mech.LearnStacks == 0
                ? "还没学到东西"
                : $"正在学习：{(mech.LearnType == "tech" ? "技术" : "物理")}（{mech.LearnStacks}/3）",
            "protocol" => combat.BossPhase >= 2
                ? $"协议节点 {mech.ProtocolNodes.Count}/3 · 截止第 {mech.DeadlineRound} 轮"
                : $"已关闭 {mech.ClosedCells.Count} 格",
            _ => ""
        };
    }
}
