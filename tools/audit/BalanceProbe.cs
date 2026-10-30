#:project ../../src/AGI2046.Rules/AGI2046.Rules.csproj

// AGI2046 数值探针：每个角色单独面对最基础的敌人，看能不能打死
// 用法：dotnet run audit/BalanceProbe.cs
using AGI2046.Rules;

Console.WriteLine("角色\t武器\tH\t单次攻击期望伤害\t自动战斗结果");
Console.WriteLine("--------------------------------------------------------------");

foreach (var c in GameData.Characters.Values.OrderBy(x => x.Id))
{
    var st = GameEngine.NewGame(new NewGameRequest { CharacterIds = new() { c.Id }, Seed = 4242 });
    var p = st.Players[0];
    var node = new NodeState
    {
        Id = "probe", Name = "探针", Type = NodeType.Skirmish, Layer = 1, Lane = 0,
        EnemyGroup = "g_skim_patrol", Revealed = true
    };
    st.Nodes.Add(node);
    p.NodeId = node.Id;
    CombatEngine.StartCombat(st, p, node);
    var combat = st.Combat!;
    var unit = combat.Units.First(u => u.Side == Side.Player);
    var enemy = combat.Units.First(u => u.Side == Side.Enemy);

    // 理论伤害：普攻（武器）一次
    var stat = unit.Stats[unit.WeaponScale];
    var perHit = Math.Max(1, unit.WeaponDamage + Dice.DamageBonus(stat) + unit.DamageBonus);
    var armor = enemy.Armor;
    var raw = unit.WeaponDice * perHit;
    var mitigation = Math.Min(raw * 0.75, armor);
    var dmg = Math.Max(0, raw - (int)Math.Round(mitigation));

    // 自动战斗：一直普攻（贴身就打），最多 60 轮
    var rounds = 0;
    var actions = 0;
    var res = "僵持";
    while (!combat.IsOver && combat.Round <= 60 && actions < 900)
    {
        var active = combat.ActiveUnit;
        if (active is null) break;
        if (active.Side == Side.Enemy) { res = "（敌方回合未推进）"; break; }
        var e = combat.Units.First(u => u.Side == Side.Enemy && !u.Downed);
        var dist = Hex.Distance(active.Col, active.Row, e.Col, e.Row);
        try
        {
            if (dist <= Math.Max(1, active.WeaponRange))
                GameEngine.ApplyAction(st, new GameAction { Type = "combatAction", PlayerId = active.PlayerId, SkillId = "basic", TargetUnitId = e.Id });
            else if (combat.Reachable.Count > 0)
            {
                var step = combat.Reachable.OrderBy(h => Hex.Distance(h.Col, h.Row, e.Col, e.Row)).First();
                GameEngine.ApplyAction(st, new GameAction { Type = "combatMove", PlayerId = active.PlayerId, Col = step.Col, Row = step.Row });
            }
            else
                GameEngine.ApplyAction(st, new GameAction { Type = "combatEndTurn", PlayerId = active.PlayerId });
        }
        catch (GameException) { try { GameEngine.ApplyAction(st, new GameAction { Type = "combatEndTurn", PlayerId = active.PlayerId }); } catch { break; } }
        actions++;
    }
    rounds = combat.Round;
    if (combat.IsOver) res = combat.Result == "victory" ? $"胜（{rounds} 轮）" : $"败（{rounds} 轮）";
    else res = $"僵持（{rounds} 轮，敌人剩 {combat.Units.First(u => u.Side == Side.Enemy).Hp}）";

    Console.WriteLine($"{c.Name}({c.Id})\t{unit.WeaponName}\t{stat}\t{raw}→{dmg}\t{res}");

    if (c.Id == "gpt") { /* 只打印一行表头示例 */ }
}
Console.WriteLine();
Console.WriteLine("说明：4→1 表示普攻原始伤害 4 点，被护甲削减后只剩 1 点；敌人护甲固定 4（巡逻哨兵）。");
