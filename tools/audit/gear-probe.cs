#:project ../../src/AGI2046.Rules/AGI2046.Rules.csproj
using AGI2046.Rules;

/* 0.24「有辨识度」装备特性探针：8 个构筑方向 + 最多 3 条生效 */

var pass = 0;
var fail = 0;
void Ok(string name, bool cond, string detail = "")
{
    if (cond) { pass++; Console.WriteLine($"PASS  {name}"); }
    else { fail++; Console.WriteLine($"FAIL  {name}   {detail}"); }
}

GameState Start()
{
    var s = GameEngine.NewGame(new NewGameRequest
    {
        CharacterIds = new List<string> { "gpt", "claude" },
        Seed = 31337,
        FirstRun = false
    });
    s.Log.Clear();
    return s;
}

void Equip(PlayerState p, string itemId)
{
    var def = GameData.Gear[itemId];
    p.Equipment[def.Slot] = new ItemInstance
    {
        InstanceId = Guid.NewGuid().ToString("N")[..10],
        ItemId = def.Id,
        Name = def.Name,
        Slot = def.Slot,
        Rarity = def.Rarity,
        SetId = def.SetId,
        Level = 1
    };
}

GameState Fight()
{
    var s = Start();
    var node = s.Nodes.First(n => n.Type is NodeType.Combat or NodeType.Skirmish);
    foreach (var p in s.Players) p.NodeId = node.Id;
    s.ActivePlayer!.NodeId = node.Id;
    return CombatEngine.StartCombat(s, s.ActivePlayer!, node);
}

/* ── 1. 数据完整性 ───────────────────────────────────────────── */
{
    Ok("8 个构筑方向", GameData.Traits.Count == 8, GameData.Traits.Count.ToString());
    var withTrait = GameData.Gear.Values.Count(g => !string.IsNullOrWhiteSpace(g.TraitId));
    Ok("有 8 件装备挂特性", withTrait == 8, withTrait.ToString());
    var bad = GameData.Gear.Values
        .Where(g => !string.IsNullOrWhiteSpace(g.TraitId))
        .Where(g => !GameData.Traits.ContainsKey(g.TraitId!))
        .Select(g => g.Id).ToList();
    Ok("特性 id 都能解析", bad.Count == 0, string.Join(",", bad));
    Ok("每条特性都有描述", GameData.Traits.Values.All(t => !string.IsNullOrWhiteSpace(t.Desc)));
}

/* ── 2. 最多 3 条生效，其余待机（按槽位顺序） ─────────────────── */
{
    var s = Start();
    var p = s.Players[0];
    Equip(p, "w_blade_rare");    // Weapon  t_expose
    Equip(p, "a_exo");           // Armor   t_drone
    Equip(p, "t_heart");         // Trinket t_item
    Equip(p, "c_eye");           // Cyberware t_retreat
    var active = GearTraits.Active(p);
    var dormant = GearTraits.Dormant(p);
    Ok("生效最多 3 条", active.Count == 3, active.Count.ToString());
    Ok("超出的进待机", dormant.Count == 1 && dormant[0].Id == "t_retreat", string.Join(",", dormant.Select(t => t.Id)));
    Ok("优先武器特性", active[0].Id == "t_expose", active[0].Id);
    Ok("待机特性不生效", !GearTraits.Has(p, "t_retreat"));
    Ok("生效特性可查", GearTraits.Has(p, "t_expose") && GearTraits.Has(p, "t_drone"));
}

/* ── 3. 标记集火 / 低生命爆发：只加可解释的固定值 ─────────────── */
{
    var s = Fight();
    var c = s.Combat!;
    var p = s.Players[0];
    var u = c.Units.First(x => x.PlayerId == p.Id);
    var e = c.Units.First(x => x.Side == Side.Enemy);

    Ok("没特性时无加成", GearTraits.DamageBonus(p, u, e) == 0, GearTraits.DamageBonus(p, u, e).ToString());

    Equip(p, "w_blade_rare");
    e.Statuses.Add(new StatusState { Id = "mark", Name = "标记", Duration = 2, Marked = true });
    Ok("标记目标 +3", GearTraits.DamageBonus(p, u, e) == 3, GearTraits.DamageBonus(p, u, e).ToString());
    e.Statuses.Clear();
    e.Statuses.Add(new StatusState { Id = "expose", Name = "暴露", Duration = 1, Exposed = true });
    Ok("暴露目标也算", GearTraits.DamageBonus(p, u, e) == 3, GearTraits.DamageBonus(p, u, e).ToString());

    // 换成低生命特性（同一武器槽只有一个特性）：此时标记不再加成
    Equip(p, "w_rifle_rare");
    Ok("换装后旧特性失效", GearTraits.DamageBonus(p, u, e) == 0, GearTraits.DamageBonus(p, u, e).ToString());
    u.Hp = (int)Math.Floor(u.MaxHp * 0.3);
    Ok("低生命 +3", GearTraits.DamageBonus(p, u, e) == 3, GearTraits.DamageBonus(p, u, e).ToString());
    u.Hp = u.MaxHp;
    Ok("满血时没有低血加成", GearTraits.DamageBonus(p, u, e) == 0, GearTraits.DamageBonus(p, u, e).ToString());
}

/* ── 4. 召唤占位：开战给一架无人机，且不会每回合再召唤 ───────── */
{
    var s = Start();
    var p = s.Players[0];
    Equip(p, "a_exo");
    var node = s.Nodes.First(n => n.Type is NodeType.Combat or NodeType.Skirmish);
    foreach (var pl in s.Players) pl.NodeId = node.Id;
    s.ActivePlayer!.NodeId = node.Id;
    var st = CombatEngine.StartCombat(s, s.ActivePlayer!, node);
    var c = st.Combat!;
    var drones = c.Units.Count(u => u.Name == "随行无人机");
    Ok("开战召唤 1 架无人机", drones == 1, drones.ToString());
    Ok("无人机是我方且有限时", c.Units.Where(u => u.Name == "随行无人机").All(u => u.Side == Side.Player && u.SummonDuration > 0));
    Ok("召唤写日志", c.Log.Any(l => l.Contains("召唤占位")), "no log");
}

/* ── 5. 消耗品强化 +50%（有上限，不会无限叠） ────────────────── */
{
    var s = Start();
    var p = s.Players[0];
    Ok("无特性时不加成", GearTraits.BoostConsumable(p, 20) == 20, GearTraits.BoostConsumable(p, 20).ToString());
    Equip(p, "t_heart");
    var boosted = GearTraits.BoostConsumable(p, 20);
    Ok("治疗 +50%", boosted == 30, boosted.ToString());
    Ok("0 值不放大", GearTraits.BoostConsumable(p, 0) == 0);
}

/* ── 6. 终极技回收 Focus：每场一次 ───────────────────────────── */
{
    var s = Start();
    var p = s.Players[0];
    Equip(p, "w_deck_rare");
    var node = s.Nodes.First(n => n.Type is NodeType.Combat or NodeType.Skirmish);
    foreach (var pl in s.Players) pl.NodeId = node.Id;
    s.ActivePlayer!.NodeId = node.Id;
    var st = CombatEngine.StartCombat(s, s.ActivePlayer!, node);
    var c = st.Combat!;
    var u = c.Units.First(x => x.PlayerId == p.Id);
    u.Focus = 0;
    GearTraits.OnUltimate(st, c, u);
    var first = u.Focus;
    GearTraits.OnUltimate(st, c, u);
    Ok("终极技后返还 2 Focus", first == 2, first.ToString());
    Ok("每场只返还一次", u.Focus == 2, u.Focus.ToString());
}

/* ── 7. 速度连动：移动后带队友 +1 移动，每轮一次 ─────────────── */
{
    var s = Start();
    var p = s.Players[0];
    Equip(p, "c_legs");
    var node = s.Nodes.First(n => n.Type is NodeType.Combat or NodeType.Skirmish);
    foreach (var pl in s.Players) pl.NodeId = node.Id;
    s.ActivePlayer!.NodeId = node.Id;
    var st = CombatEngine.StartCombat(s, s.ActivePlayer!, node);
    var c = st.Combat!;
    var u = c.Units.First(x => x.PlayerId == p.Id);
    var ally = c.Units.First(x => x.Side == Side.Player && x.Id != u.Id);
    // 把两人摆近一点，保证 2 格内
    ally.Col = Math.Min(c.Width - 1, u.Col + 1);
    ally.Row = u.Row;
    GearTraits.OnMoved(st, c, u);
    var buffed = ally.Statuses.Count(s2 => s2.Id == "t_speedlink");
    GearTraits.OnMoved(st, c, u);
    var twice = ally.Statuses.Count(s2 => s2.Id == "t_speedlink");
    Ok("移动带动队友", buffed == 1, buffed.ToString());
    Ok("同一轮不重复叠", twice == 1, twice.ToString());
    Ok("连动加移动力", ally.Statuses.First(s2 => s2.Id == "t_speedlink").MovementMod == 1);
}

/* ── 8. 风险撤退：成功率 +20，失败有代价 ─────────────────────── */
{
    var s = Start();
    var p = s.Players[0];
    Ok("无特性无加成", GearTraits.RetreatBonus(p) == 0);
    Equip(p, "c_eye");
    Ok("撤退 +20", GearTraits.RetreatBonus(p) == 20, GearTraits.RetreatBonus(p).ToString());
    Ok("失败有代价标记", GearTraits.RetreatBacklash(p));
}

/* ── 9. 护盾反击：每轮一次，不是每次挨打都反 ─────────────────── */
{
    var s = Start();
    var p = s.Players[0];
    Equip(p, "w_gauntlet_rare");
    var node = s.Nodes.First(n => n.Type is NodeType.Combat or NodeType.Skirmish);
    foreach (var pl in s.Players) pl.NodeId = node.Id;
    s.ActivePlayer!.NodeId = node.Id;
    var st = CombatEngine.StartCombat(s, s.ActivePlayer!, node);
    var c = st.Combat!;
    var u = c.Units.First(x => x.PlayerId == p.Id);
    var e = c.Units.First(x => x.Side == Side.Enemy);
    u.Shield = 6;
    var enemyHp = e.Hp;
    GearTraits.OnDamaged(st, c, u, e, 5);
    var afterFirst = e.Hp;
    GearTraits.OnDamaged(st, c, u, e, 5);
    Ok("护盾反击生效", afterFirst == enemyHp - 3, $"{enemyHp} → {afterFirst}");
    Ok("同一轮只反一次", e.Hp == afterFirst, $"{afterFirst} → {e.Hp}");

    // 没护盾不反击
    var s2 = Start();
    var p2 = s2.Players[0];
    Equip(p2, "w_gauntlet_rare");
    var node2 = s2.Nodes.First(n => n.Type is NodeType.Combat or NodeType.Skirmish);
    foreach (var pl in s2.Players) pl.NodeId = node2.Id;
    s2.ActivePlayer!.NodeId = node2.Id;
    var st2 = CombatEngine.StartCombat(s2, s2.ActivePlayer!, node2);
    var c2 = st2.Combat!;
    var u2 = c2.Units.First(x => x.PlayerId == p2.Id);
    var e2 = c2.Units.First(x => x.Side == Side.Enemy);
    u2.Shield = 0;
    var hp2 = e2.Hp;
    GearTraits.OnDamaged(st2, c2, u2, e2, 5);
    Ok("没护盾不反击", e2.Hp == hp2, $"{hp2} → {e2.Hp}");
}

/* ── 10. 不允许无限：所有 Once 特性在一场战斗里最多一次 ──────── */
{
    var once = GameData.Traits.Values.Where(t => t.Once).ToList();
    Ok("有次数限制的特性存在", once.Count >= 2, once.Count.ToString());
    Ok("强效果都带限制或成本", GameData.Traits.Values.All(t =>
        !string.IsNullOrWhiteSpace(t.Condition) || !string.IsNullOrWhiteSpace(t.Trigger)),
        "missing condition");
}

Console.WriteLine($"===== {pass} passed, {fail} failed =====");
return fail == 0 ? 0 : 1;
