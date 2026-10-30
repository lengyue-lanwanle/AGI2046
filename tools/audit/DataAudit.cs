#:project ../../src/AGI2046.Rules/AGI2046.Rules.csproj

// AGI2046 完整性审计：数据交叉引用 + 地图结构 + 规则行为探针
// 用法：dotnet run audit/DataAudit.cs
using System.Text.Json;
using System.Text.Json.Serialization;
using AGI2046.Rules;

var RepoRoot = RepoRootOf();
int pass = 0, total = 0;
var failures = new List<string>();
void Ok(string name, bool cond, string detail = "")
{
    total++;
    if (cond) pass++; else failures.Add($"{name} — {detail}");
    Console.WriteLine($"{(cond ? "PASS" : "FAIL")}  {name}{(detail == "" ? "" : "  —  " + detail)}");
}
void Section(string title) => Console.WriteLine($"\n── {title} ─────────────────────────────");

/* ═══════════════ A. 数据交叉引用 ═══════════════ */
Section("A1 角色 / 技能");
var chars = GameData.Characters.Values.ToList();
Ok("16 名角色", chars.Count == 16, chars.Count.ToString());
Ok("每个角色 3 个技能", chars.All(c => c.SkillIds.Count == 3),
    string.Join(",", chars.Where(c => c.SkillIds.Count != 3).Select(c => c.Id)));
Ok("技能 ID 全部存在", chars.All(c => c.SkillIds.All(GameData.Skills.ContainsKey)),
    string.Join(",", chars.SelectMany(c => c.SkillIds).Where(s => !GameData.Skills.ContainsKey(s)).Distinct()));
Ok("每个角色恰好 1 个终极技",
    chars.All(c => c.SkillIds.Count(s => GameData.Skills[s].IsUltimate) == 1),
    string.Join(",", chars.Where(c => c.SkillIds.Count(s => GameData.Skills[s].IsUltimate) != 1).Select(c => c.Id)));
Ok("技能 Owner 与角色一致",
    chars.All(c => c.SkillIds.All(s => GameData.Skills[s].Owner == c.Id)),
    string.Join(",", chars.SelectMany(c => c.SkillIds.Where(s => GameData.Skills[s].Owner != c.Id))));
Ok("初始武器存在且是 Weapon 槽",
    chars.All(c => GameData.Gear.TryGetValue(c.StarterWeaponId, out var g) && g.Slot == "Weapon"),
    string.Join(",", chars.Where(c => !GameData.Gear.TryGetValue(c.StarterWeaponId, out var g) || g.Slot != "Weapon").Select(c => c.Id + ":" + c.StarterWeaponId)));
Ok("角色头像文件都在 web/ 下",
    chars.All(c => File.Exists(System.IO.Path.Combine(RepoRoot, "web", c.Portrait))),
    string.Join(",", chars.Where(c => !File.Exists(System.IO.Path.Combine(RepoRoot, "web", c.Portrait))).Select(c => c.Portrait)));

Section("A2 觉醒");
Ok("16 个觉醒武器 ID 都有定义",
    chars.All(c => GameData.AwakeningWeapon.TryGetValue(c.Id, out var w) && GameData.Gear.ContainsKey(w)),
    string.Join(",", chars.Where(c => !GameData.AwakeningWeapon.TryGetValue(c.Id, out var w) || !GameData.Gear.ContainsKey(w)).Select(c => c.Id)));
Ok("每个原技能都有 _awakened 版本",
    chars.All(c => c.SkillIds.All(s => GameData.Skills.ContainsKey(s + "_awakened"))),
    string.Join(",", chars.SelectMany(c => c.SkillIds).Where(s => !GameData.Skills.ContainsKey(s + "_awakened"))));
Ok("觉醒技 id 不与原技能冲突", GameData.Skills.Keys.Count(k => k.EndsWith("_awakened")) == 48,
    GameData.Skills.Keys.Count(k => k.EndsWith("_awakened")).ToString());

Section("A3 敌人 / 敌人组");
var enemies = GameData.Enemies.Values.ToList();
Ok("22 种敌人", enemies.Count == 22, enemies.Count.ToString());
Ok("敌人技能全部存在", enemies.All(e => e.SkillIds.All(GameData.Skills.ContainsKey)),
    string.Join(",", enemies.SelectMany(e => e.SkillIds).Where(s => !GameData.Skills.ContainsKey(s)).Distinct()));
Ok("敌人组引用的敌人全部存在", GameData.EnemyGroups.Values.All(g => g.All(GameData.Enemies.ContainsKey)),
    string.Join(",", GameData.EnemyGroups.SelectMany(kv => kv.Value).Where(e => !GameData.Enemies.ContainsKey(e)).Distinct()));
Ok("三幕首领组都在", new[] { 1, 2, 3 }.All(a => GameData.EnemyGroups.ContainsKey(GameData.Acts[a].BossGroup)));
Ok("三幕首领掉落都有定义", new[] { 1, 2, 3 }.All(a => GameData.Gear.ContainsKey(GameData.Acts[a].BossDrop)),
    string.Join(",", new[] { 1, 2, 3 }.Where(a => !GameData.Gear.ContainsKey(GameData.Acts[a].BossDrop)).Select(a => GameData.Acts[a].BossDrop)));
Ok("每个敌人组都至少 1 个敌人", GameData.EnemyGroups.Values.All(g => g.Count > 0));
var unusedGroups = GameData.EnemyGroups.Keys.Where(k =>
    !new[] { 1, 2, 3 }.Select(a => GameData.Acts[a].BossGroup).Contains(k) &&
    !MapGeneratorSkirmishGroups().Contains(k) && !MapGeneratorCombatGroups().Contains(k) &&
    k != "g_elite" && k != "g_elite2" && k != "g_elite3").ToList();
Ok("没有从未被使用的敌人组", unusedGroups.Count == 0, string.Join(",", unusedGroups));

Section("A4 装备 / 套装");
var gear = GameData.Gear.Values.ToList();
Ok("装备数量 ≥ 37", gear.Count >= 37, gear.Count.ToString());
Ok("装备引用套装都存在",
    gear.Where(g => !string.IsNullOrWhiteSpace(g.SetId)).All(g => GameData.GearSets.ContainsKey(g.SetId)),
    string.Join(",", gear.Where(g => !string.IsNullOrWhiteSpace(g.SetId) && !GameData.GearSets.ContainsKey(g.SetId)).Select(g => g.Id + ":" + g.SetId)));
var setPieces = GameData.GearSets.Keys.ToDictionary(k => k,
    k => gear.Count(g => string.Equals(g.SetId, k, StringComparison.OrdinalIgnoreCase)));
Ok("每套套装都有 ≥4 件（否则 4 件套效果不可达）",
    setPieces.Values.All(v => v >= 4), string.Join(",", setPieces.Select(kv => $"{kv.Key}:{kv.Value}")));
Ok("每个套装的件数档位递增且 ≤4 件",
    GameData.GearSets.Values.All(s => s.Tiers.Count > 0 && s.Tiers.Zip(s.Tiers.Skip(1)).All(p => p.First.Pieces < p.Second.Pieces) && s.Tiers.Max(t => t.Pieces) <= 4),
    string.Join(",", GameData.GearSets.Values.Where(s => s.Tiers.Count == 0 || s.Tiers.Max(t => t.Pieces) > 4).Select(s => s.Id)));
var slots = gear.Select(g => g.Slot).Distinct().OrderBy(x => x).ToList();
Ok("装备槽只有 5 种", slots.Count == 5, string.Join(",", slots));

Section("A5 事件");
var events = GameData.Events.Values.ToList();
Ok("16 个事件", events.Count == 16, events.Count.ToString());
Ok("事件奖励装备都存在",
    events.SelectMany(e => e.Choices).SelectMany(c => new[] { c.SuccessItem, c.FailItem })
        .Where(x => !string.IsNullOrWhiteSpace(x)).All(x => GameData.Gear.ContainsKey(x!)),
    string.Join(",", events.SelectMany(e => e.Choices).SelectMany(c => new[] { c.SuccessItem, c.FailItem })
        .Where(x => !string.IsNullOrWhiteSpace(x) && !GameData.Gear.ContainsKey(x!)).Distinct()));
Ok("事件 CostItem 都存在",
    events.SelectMany(e => e.Choices).Where(c => !string.IsNullOrWhiteSpace(c.CostItem)).All(c => GameData.Gear.ContainsKey(c.CostItem!)),
    "—");
var costItemEvents = events.SelectMany(e => e.Choices.Select(c => (e, c))).Where(t => !string.IsNullOrWhiteSpace(t.c.CostItem)).ToList();
Ok("事件 CostItem 目前未被任何事件使用（死字段，改内容前先补扣物品逻辑）", costItemEvents.Count == 0,
    $"{costItemEvents.Count} 个选项声明了 CostItem：" + string.Join(",", costItemEvents.Select(t => t.e.Id)));

Section("A6 支线 / 消耗品");
Ok("15 条支线（每幕 5 条池）", GameData.Quests.Count == 15, GameData.Quests.Count.ToString());
Ok("每幕池 >= 5 条，且 QuestForAct 按 seed 抽 2 条",
    new[] { 1, 2, 3 }.All(a => GameData.Quests.Values.Count(q => q.Act == a) >= 5
        && GameData.QuestForAct(a, 0, 12345) is not null && GameData.QuestForAct(a, 1, 12345) is not null
        && GameData.QuestForAct(a, 0, 12345)!.Id != GameData.QuestForAct(a, 1, 12345)!.Id),
    string.Join(",", new[] { 1, 2, 3 }.Select(a => $"{a}:{GameData.QuestForAct(a, 0, 12345)?.Id}/{GameData.QuestForAct(a, 1, 12345)?.Id}")));
Ok("不同 seed 抽到的支线组合不同（第二周目不会一字不差）",
    Enumerable.Range(1, 12).Select(sd => string.Join("|", new[] { 1, 2, 3 }.Select(a => $"{GameData.QuestForAct(a, 0, sd)?.Id}/{GameData.QuestForAct(a, 1, sd)?.Id}")))
        .Distinct().Count() > 3,
    $"12 个 seed 产生了 {Enumerable.Range(1, 12).Select(sd => string.Join("|", new[] { 1, 2, 3 }.Select(a => $"{GameData.QuestForAct(a, 0, sd)?.Id}/{GameData.QuestForAct(a, 1, sd)?.Id}"))).Distinct().Count()} 种组合");
Ok("支线奖励装备都存在",
    GameData.Quests.Values.Where(q => !string.IsNullOrWhiteSpace(q.RewardItem)).All(q => GameData.Gear.ContainsKey(q.RewardItem!)),
    string.Join(",", GameData.Quests.Values.Where(q => !string.IsNullOrWhiteSpace(q.RewardItem) && !GameData.Gear.ContainsKey(q.RewardItem!)).Select(q => q.Id)));
Ok("5 种消耗品", GameData.Consumables.Count == 5, string.Join(",", GameData.Consumables.Keys));

/* ═══════════════ B. 技能 Special / Effect 处理覆盖 ═══════════════ */
Section("B 技能特殊字段");
var handledSpecial = new HashSet<string> {
    "boss_execute", "boss_aoe", "boss_shield", "boss_summon", "rewind", "copy_ally", "dash", "retreat" };
var usedSpecial = GameData.Skills.Values.Where(s => !string.IsNullOrWhiteSpace(s.Special)).Select(s => s.Special!).Distinct().ToList();
Ok("没有引擎不认识的 Special", usedSpecial.All(handledSpecial.Contains), string.Join(",", usedSpecial.Where(s => !handledSpecial.Contains(s))));

var effectTypes = GameData.Skills.Values.SelectMany(s => s.Effects).Select(e => e.Type).Distinct().OrderBy(x => x).ToList();
var handledEffects = new HashSet<string> {
    "heal", "lifesteal", "shield", "buff", "debuff", "stun", "taunt", "mark", "cleanse", "dispel", "focus",
    "revive_or_heal", "execute", "extra_action", "echo_bonus", "dash", "retreat", "random_targets",
    "summon", "summon_enemy", "reset_cooldowns", "purge", "self_damage", "heal_all_allies",
    "buff_all_allies", "debuff_all_enemies", "mark_all", "taunt_all", "rewind", "copy_ally" };
Ok("效果类型清单", true, string.Join(",", effectTypes));
var deadEffects = new HashSet<string> { "rewind", "copy_ally", "dash", "retreat" };
foreach (var fx in deadEffects)
{
    var owners = GameData.Skills.Values.Where(s => s.Effects.Any(e => e.Type == fx)).Select(s => s.Id).ToList();
    var specialSet = owners.All(id => GameData.Skills[id].Special == fx);
    Ok($"【缺陷】效果「{fx}」能真正触发（须写成 Special 而非 Effects）", specialSet && owners.Count > 0,
        $"只有 {string.Join(",", owners)} 使用它，而它们的 Special 是 null → 引擎里 if (skill.Special == \"{fx}\") 永远不成立");
}

Section("C 敌方资源");
{
    // 运行时检查：敌人 Focus 必须 > 0，否则 FocusCost>0 的敌方技能永远进不了 AI 候选
    var st = GameEngine.NewGame(new NewGameRequest { CharacterIds = new() { "gpt" }, Seed = 1 });
    var node = st.Nodes.First(n => n.Type == NodeType.Elite);
    st.Players[0].NodeId = node.Id;
    CombatEngine.StartCombat(st, st.Players[0], node);
    var e = st.Combat!.Units.First(u => u.Side == Side.Enemy);
    var gated = enemies.SelectMany(x => x.SkillIds.Select(id => (x, s: GameData.Skills[id])))
        .Where(t => t.s.FocusCost > 0).ToList();
    var spammy = enemies.SelectMany(x => x.SkillIds.Select(id => GameData.Skills[id]))
        .Where(x => x.Cooldown == 0 && x.Effects.Any(e => e.Type is "heal" or "shield"))
        .Select(x => x.Id).Distinct().ToList();
    Ok("敌方治疗/护盾技能都有冷却（无限续航 = 不可战胜）", spammy.Count == 0, string.Join(",", spammy));
    Ok("敌人 Focus 有来源（否则 FocusCost>0 的技能永远不可用）", e.MaxFocus > 0 && e.Focus >= gated.Select(t => t.s.FocusCost).DefaultIfEmpty(0).Max(),
        $"敌人 Focus={e.Focus}/{e.MaxFocus}；受 Focus 限制的技能：" + string.Join(",", gated.Select(t => $"{t.x.Id}/{t.s.Id}({t.s.FocusCost})")));
}

/* ═══════════════ D. 地图结构 ═══════════════ */
Section("D 地图");
foreach (var act in new[] { 1, 2, 3 })
{
    foreach (var seed in new[] { 12345, 1, 999, 2046, 777777 })
    {
        var (nodes, edges) = MapGenerator.Generate(seed, act);
        var tag = $"act{act}/seed{seed}";
        var dup = nodes.GroupBy(n => n.Id).Where(g => g.Count() > 1).Select(g => g.Key).ToList();
        var adjOk = nodes.All(n => n.Neighbors.Contains(n.Id) == false &&
            n.Neighbors.All(x => nodes.Any(m => m.Id == x && m.Neighbors.Contains(n.Id))));
        // BFS
        var map = nodes.ToDictionary(n => n.Id, n => n.Neighbors);
        var seen = new HashSet<string> { "start" };
        var q = new Queue<string>(); q.Enqueue("start");
        while (q.Count > 0) { var c = q.Dequeue(); foreach (var nb in map[c]) if (seen.Add(nb)) q.Enqueue(nb); }
        var unreachable = nodes.Where(n => !seen.Contains(n.Id)).Select(n => n.Id).ToList();
        if (seed == 12345)
        {
            Ok($"{tag} 95 节点", nodes.Count == 95, nodes.Count.ToString());
            Ok($"{tag} 无重复 id", dup.Count == 0, string.Join(",", dup));
            Ok($"{tag} 邻接双向一致", adjOk, "—");
            Ok($"{tag} 全部可达", unreachable.Count == 0, string.Join(",", unreachable));
            var by = nodes.GroupBy(n => n.Type).ToDictionary(g => g.Key, g => g.Count());
            Ok($"{tag} 配额完整",
                by.GetValueOrDefault(NodeType.Server) == 9 && by.GetValueOrDefault(NodeType.KeyElite) == 3 &&
                by.GetValueOrDefault(NodeType.Shop) == 5 && by.GetValueOrDefault(NodeType.Safehouse) == 5 &&
                by.GetValueOrDefault(NodeType.Echo) == 2 && by.GetValueOrDefault(NodeType.Awakening) == 2 &&
                by.GetValueOrDefault(NodeType.Elite) == 1 && by.GetValueOrDefault(NodeType.Terminal) == 1 &&
                by.GetValueOrDefault(NodeType.Blank) == 11 && by.GetValueOrDefault(NodeType.Boss) == 1,
                string.Join(",", by.Select(kv => $"{kv.Key}:{kv.Value}").OrderBy(x => x)));
            Ok($"{tag} 战斗类节点都有敌人组",
                nodes.Where(n => n.Type is NodeType.Combat or NodeType.Skirmish or NodeType.Elite or NodeType.KeyElite or NodeType.Boss)
                     .All(n => !string.IsNullOrWhiteSpace(n.EnemyGroup) && GameData.EnemyGroups.ContainsKey(n.EnemyGroup!)),
                string.Join(",", nodes.Where(n => n.Type is NodeType.Combat or NodeType.Skirmish or NodeType.Elite or NodeType.KeyElite or NodeType.Boss)
                     .Where(n => string.IsNullOrWhiteSpace(n.EnemyGroup) || !GameData.EnemyGroups.ContainsKey(n.EnemyGroup!)).Select(n => n.Id)));
            Ok($"{tag} 事件节点都绑定了本幕事件",
                nodes.Where(n => n.Type == NodeType.Event).All(n => GameData.Events.TryGetValue(n.EventId ?? "", out var ev) && ev.Act == act),
                string.Join(",", nodes.Where(n => n.Type == NodeType.Event).Select(n => $"{n.Id}:{n.EventId}")));
        }
        else
        {
            Ok($"{tag} 结构完整", nodes.Count == 95 && unreachable.Count == 0 && dup.Count == 0,
                $"nodes={nodes.Count} unreachable={unreachable.Count} dup={dup.Count}");
        }
    }
}

/* ═══════════════ E. 规则行为探针 ═══════════════ */
Section("E 行为探针");

// E1 服务器属性是否真的生效
{
    var st = GameEngine.NewGame(new NewGameRequest { CharacterIds = new() { "gpt" }, Seed = 12345 });
    var p = st.Players[0];
    var before = (V: p.Stats.Vit, Hp: p.MaxHp, C: p.Stats.C);
    p.ServerBonus.Vit += 5;
    GameRules.RecalculatePlayer(p);
    var after = (V: p.Stats.Vit, Hp: p.MaxHp, C: p.Stats.C);
    Ok("【缺陷】服务器写入的永久属性会进入 Stats（影响命中/伤害/生命）",
        after.V == before.V + 5,
        $"ServerBonus.Vit +5 后 Stats.Vit {before.V} → {after.V}；MaxHp {before.Hp} → {after.Hp}（BaseStats={p.BaseStats.Vit}）");
}

// E2 存档往返后 StartUnits 丢失 → 上下文回滚失效
{
    var st = GameEngine.NewGame(new NewGameRequest { CharacterIds = new() { "kimi" }, Seed = 12345 });
    var node = st.Nodes.First(n => n.Type == NodeType.Skirmish);
    st.Players[0].NodeId = node.Id;
    CombatEngine.StartCombat(st, st.Players[0], node);
    var combat = st.Combat!;
    var startUnitsBefore = combat.StartUnits.Count;
    var opts = new JsonSerializerOptions
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        TypeInfoResolver = new System.Text.Json.Serialization.Metadata.DefaultJsonTypeInfoResolver(),
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) }
    };
    var json = JsonSerializer.Serialize(st, opts);
    var reloaded = JsonSerializer.Deserialize<GameState>(json, opts)!;
    Ok("存档往返不丢 StartUnits", reloaded.Combat!.StartUnits.Count == startUnitsBefore,
        $"序列化前 {startUnitsBefore} 个，反序列化后 {reloaded.Combat!.StartUnits.Count} 个（[JsonIgnore]）");
}

// E3 长夜两个技能是不是空壳
{
    var st = GameEngine.NewGame(new NewGameRequest { CharacterIds = new() { "kimi", "gpt" }, Seed = 12345 });
    var node = st.Nodes.First(n => n.Type == NodeType.Skirmish);
    foreach (var p in st.Players) p.NodeId = node.Id;
    CombatEngine.StartCombat(st, st.Players[0], node);
    // 强制让长夜成为 active
    var combat = st.Combat!;
    var kimi = combat.Units.First(u => u.PlayerId == "p1");
    EncounterForceActive(st, kimi);
    kimi.Focus = 8; kimi.MaxFocus = 8;
    var enemy = combat.Units.First(u => u.Side == Side.Enemy);
    kimi.Col = enemy.Col - 1; kimi.Row = enemy.Row;
    var hpBefore = combat.Units.Where(u => u.Side == Side.Enemy).Sum(u => u.Hp);
    Exception? err = null;
    var lastRollKind = "";
    try
    {
        GameEngine.ApplyAction(st, new GameAction { Type = "combatAction", PlayerId = "p1", SkillId = "kimi_u", TargetUnitId = enemy.Id });
        lastRollKind = st.LastRoll?.Kind ?? "(none)";
    }
    catch (Exception ex) { err = ex; }
    Ok("【缺陷】长夜终极技「上下文回滚」真的回滚了战斗",
        st.Combat is null || (st.Combat.Round == 1 && st.Combat.Units.Any(u => u.PlayerId == "p1" && u.Hp == 1)),
        $"err={err?.Message} round={st.Combat?.Round} 长夜HP={st.Combat?.Units.FirstOrDefault(u => u.PlayerId == "p1")?.Hp} lastRoll={lastRollKind}");
}

// E4 敌人 Focus
{
    var st = GameEngine.NewGame(new NewGameRequest { CharacterIds = new() { "gpt" }, Seed = 1 });
    var node = st.Nodes.First(n => n.Type == NodeType.Elite);
    st.Players[0].NodeId = node.Id;
    CombatEngine.StartCombat(st, st.Players[0], node);
    var e = st.Combat!.Units.First(u => u.Side == Side.Enemy);
    Ok("敌人 MaxFocus > 0（否则 e_shield_ally / e_mark_shot 永远用不出来）", e.MaxFocus > 0, $"MaxFocus={e.MaxFocus} Focus={e.Focus}");
}

// E5 消耗品：探索里能用的效果
{
    var st = GameEngine.NewGame(new NewGameRequest { CharacterIds = new() { "gpt" }, Seed = 1 });
    var p = st.Players[0];
    p.Consumables["purifier"] = 1;
    var threw = "";
    try { GameEngine.ApplyAction(st, new GameAction { Type = "useItem", PlayerId = "p1", ItemId = "purifier", TargetPlayerId = "p1" }); }
    catch (GameException ex) { threw = ex.Message; }
    Ok("战斗专用消耗品在探索阶段被正确拒绝（purifier/护盾/肾上腺素）", threw != "" && GameData.Consumables["purifier"].CombatOnly,
        $"结果：{(threw == "" ? "居然可用" : threw)}；探索期可用道具 = " +
        string.Join(",", GameData.Consumables.Values.Where(c => !c.CombatOnly).Select(c => c.Id)));
}

// E6a 撤离检定：12 个种子跑一遍，必须既有成功也有失败（证明检定真的在跑）
{
    var okCount = 0; var failCount = 0;
    for (var seed = 1; seed <= 12; seed++)
    {
        var st = GameEngine.NewGame(new NewGameRequest { CharacterIds = new() { "gpt" }, Seed = seed });
        var p = st.Players[0];
        var target = st.Nodes.First(n => n.Type == NodeType.Skirmish);
        p.NodeId = target.Id;
        CombatEngine.StartCombat(st, p, target);
        try { GameEngine.ApplyAction(st, new GameAction { Type = "retreat", PlayerId = "p1" }); } catch (GameException) { }
        if (st.Phase == GamePhase.Exploration) okCount++; else if (st.Phase == GamePhase.Combat) failCount++;
    }
    Ok("撤离检定有成功也有失败", okCount > 0 && failCount > 0, $"12 个种子：成功 {okCount} / 失败 {failCount}");
}

// E6b 撤离成功后：回上一节点、节点未清空、掉 10% 生命（多试几个种子直到成功）
{
    var st = GameEngine.NewGame(new NewGameRequest { CharacterIds = new() { "gpt", "claude" }, Seed = 12345 });
    var from = st.Node("start")!;
    var target = st.Nodes.First(n => n.Type == NodeType.Skirmish);
    var p = st.Players[0];
    p.NodeId = target.Id;
    var hpBefore = p.Hp;
    CombatEngine.StartCombat(st, p, target);
    var combatNode = p.NodeId;
    var succeeded = false;
    for (var i = 0; i < 20 && st.Phase == GamePhase.Combat && st.Combat is { IsOver: false }; i++)
    {
        try { GameEngine.ApplyAction(st, new GameAction { Type = "retreat", PlayerId = st.ActivePlayerId }); }
        catch (GameException) { break; }
        if (st.Phase == GamePhase.Exploration) { succeeded = true; break; }
    }
    Ok("撤离成功后：回上一节点 / 节点未清空 / 掉 10% 生命",
        succeeded && st.Combat is null && st.Players.All(x => x.NodeId == from.Id) &&
        st.Node(combatNode) is { Cleared: false } && st.Player("p1")!.Hp < hpBefore && st.Player("p1")!.Hp >= 1,
        $"phase={st.Phase} 位置={string.Join(",", st.Players.Select(x => x.NodeId))} cleared={st.Node(combatNode)?.Cleared} hp={hpBefore}→{st.Player("p1")!.Hp}");
}

// E7 战斗拖长会走时钟：第 6 轮起每轮 -1 电子追踪
{
    var st = GameEngine.NewGame(new NewGameRequest { CharacterIds = new() { "gpt" }, Seed = 12345 });
    var p = st.Players[0];
    var target = st.Nodes.First(n => n.Type == NodeType.Skirmish);
    p.NodeId = target.Id;
    CombatEngine.StartCombat(st, p, target);
    var purge0 = st.Purge;
    for (var i = 0; i < 60 && st.Phase == GamePhase.Combat && st.Combat is { IsOver: false }; i++)
    {
        try { GameEngine.ApplyAction(st, new GameAction { Type = "combatEndTurn", PlayerId = st.ActivePlayerId }); }
        catch (GameException) { break; }
    }
    var rounds = st.Combat?.Round ?? 0;
    var expected = Math.Max(0, (rounds - 5) / 2);   // 每 2 轮 -1
    Ok("战斗第 6 轮起扣电子追踪", purge0 - st.Purge == expected && expected > 0,
        $"打到第 {rounds} 轮，追踪 {purge0} → {st.Purge}（应为 -{expected}）");
}

// E11 技能描述不能把命中率写成「X% 伤害」——那个百分比是 accuracy，不是伤害倍率
{
    var bad = GameData.Skills.Values
        .Where(x => System.Text.RegularExpressions.Regex.IsMatch(x.Desc ?? "", @"\d+ 次 \d+% (物理|技术)伤害"))
        .Select(x => x.Id).ToList();
    Ok("技能描述不再把命中率写成「X% 伤害」", bad.Count == 0,
        bad.Count == 0 ? "全部写成「N 次 X 攻击（命中 Y%）」" : string.Join(",", bad));
}

// E10 幕间能强化（0.13.1 起 Upgrad 放开了 ActTransition），但探索期不行
{
    var st = GameEngine.NewGame(new NewGameRequest { CharacterIds = new() { "gpt" }, Seed = 12345 });
    var p = st.Players[0];
    st.Memory = 800;
    st.Alloy = 20;

    var slot = p.Equipment.Where(kv => kv.Value is not null).Select(kv => kv.Key).FirstOrDefault();
    if (slot is null) Ok("开局至少有一件装备可强化", false, "开局没有装备");
    else
    {
        // 探索期必须先被拒绝
        var blockedInExplore = false;
        try { GameEngine.ApplyAction(st, new GameAction { Type = "upgrade", PlayerId = p.Id, Slot = slot }); }
        catch (GameException) { blockedInExplore = true; }
        Ok("探索期不能强化装备（防止随时随地练级）", blockedInExplore, blockedInExplore ? "已拒绝" : "居然成功了");

        // 幕间应该允许
        st.Phase = GamePhase.ActTransition;
        var memBefore = st.Memory;
        var lvBefore = p.Equipment[slot]!.Level;
        var okInterlude = true;
        try { GameEngine.ApplyAction(st, new GameAction { Type = "upgrade", PlayerId = p.Id, Slot = slot }); }
        catch (GameException) { okInterlude = false; }
        Ok("幕间可以强化装备（不用等下一个安全屋）",
            okInterlude && st.Memory < memBefore && p.Equipment[slot]!.Level == lvBefore + 1,
            $"记忆币 {memBefore}→{st.Memory}，{slot} +{lvBefore}→+{p.Equipment[slot]!.Level}");
    }
}

// E8 时钟按「玩家回合」扣，而不是按「轮」：
//    一轮是"所有玩家各行动一次"，按轮扣会让 2 人队的时钟压力翻倍（实测真机 25 轮就被追上）
{
    var parties = new (int Size, List<string> Ids)[]
    {
        (1, new() { "gpt" }),
        (2, new() { "gpt", "claude" }),
        (3, new() { "gpt", "claude", "mistral" }),
        (4, new() { "gpt", "claude", "mistral", "deepseek" })
    };
    var okAll = true;
    var detail = new List<string>();
    foreach (var (size, ids) in parties)
    {
        var st = GameEngine.NewGame(new NewGameRequest { CharacterIds = ids, Seed = 12345 });
        var purge0 = st.Purge;
        for (var i = 0; i < 4; i++) GameEngine.AdvanceExplorationTurn(st);
        var spent = purge0 - st.Purge;
        detail.Add($"{size} 人队走 4 个回合 -{spent}");
        if (spent != 1) okAll = false;
    }
    Ok("所有人数走 4 个玩家回合都只扣 1 点时钟", okAll, string.Join(" / ", detail));
}

// E9 2 人普通遭遇只出 2 个敌人（旧规则 3 个 = 每人 1.5 个，全场最陡）；4 人队不受影响
{
    var st2 = GameEngine.NewGame(new NewGameRequest { CharacterIds = new() { "gpt", "claude" }, Seed = 12345 });
    var node2 = st2.Nodes.First(n => n.Type == NodeType.Combat);
    foreach (var p in st2.Players) p.NodeId = node2.Id;
    CombatEngine.StartCombat(st2, st2.Players[0], node2);
    var enemies2 = st2.Combat!.Units.Count(u => u.Side == Side.Enemy);

    var st4 = GameEngine.NewGame(new NewGameRequest { CharacterIds = new() { "gpt", "claude", "mistral", "deepseek" }, Seed = 12345 });
    var node4 = st4.Nodes.First(n => n.Type == NodeType.Combat);
    foreach (var p in st4.Players) p.NodeId = node4.Id;
    CombatEngine.StartCombat(st4, st4.Players[0], node4);
    var enemies4 = st4.Combat!.Units.Count(u => u.Side == Side.Enemy);

    Ok("2 人队普通遭遇只出 2 个敌人（每人 1 个）；4 人队不变", enemies2 == 2 && enemies4 >= 3,
        $"2 人 → {enemies2} 个；4 人 → {enemies4} 个");
}

Console.WriteLine($"\n===== {pass}/{total} 通过 =====");
if (failures.Count > 0)
{
    Console.WriteLine("失败项：");
    foreach (var f in failures) Console.WriteLine(" - " + f);
}
return 0;

// ── helpers ──
static string RepoRootOf()
{
    var dir = new DirectoryInfo(Directory.GetCurrentDirectory());
    while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "src", "AGI2046.Rules", "AGI2046.Rules.csproj")))
        dir = dir.Parent;
    return dir?.FullName ?? Directory.GetCurrentDirectory();
}

string[] MapGeneratorSkirmishGroups() => new[] { "g_skim_patrol", "g_skim_swarm", "g_skim_hack", "g_skim_mirror", "g_skim_usher", "g_skim_orbit", "g_skim_ember" };
string[] MapGeneratorCombatGroups() => new[] { "g_patrol", "g_hack", "g_swarm", "g_medic", "g_sniper", "g_mirror", "g_audit", "g_choir", "g_usher", "g_guard2", "g_protocol", "g_orbit", "g_hound3", "g_ember", "g_seraph" };

static void EncounterForceActive(GameState st, CombatUnit unit)
{
    st.Combat!.ActiveUnitId = unit.Id;
    typeof(CombatEngine).GetMethod("UpdateUiLists", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static)!
        .Invoke(null, new object[] { st.Combat! });
    // 把回合顺序调到该单位之后，避免 FinishUnitTurn 立刻跳回原顺序
    var idx = st.Combat!.TurnOrder.IndexOf(unit.Id);
    if (idx > 1)
    {
        st.Combat.TurnOrder.RemoveAt(idx);
        st.Combat.TurnOrder.Insert(1, unit.Id);
    }
}
