#:project ../../src/AGI2046.Rules/AGI2046.Rules.csproj

// 死局复现 / 回归测试：1 名低伤角色 vs 医疗机（"这一场根本打不完"）
//   现状（0.12.0）：医疗机「修复协议」0 冷却、每回合 +9，宪章普攻 9→7（护甲 2）→ 医疗机永远满血
//   判定：30 轮内把医疗机打死 = PASS；否则 FAIL
// 用法：dotnet run tools/audit/StalemateProbe.cs
using AGI2046.Rules;

var st = GameEngine.NewGame(new NewGameRequest { CharacterIds = new() { "claude", "gpt" }, Seed = 2046 });
var node = new NodeState
{
    Id = "probe", Name = "死局探针", Type = NodeType.Combat, Layer = 1, Lane = 0,
    EnemyGroup = "g_medic", Revealed = true
};
st.Nodes.Add(node);
foreach (var p in st.Players) p.NodeId = node.Id;
CombatEngine.StartCombat(st, st.Players[0], node);
var combat = st.Combat!;

// 构造"打到最后只剩宪章一个人"的局面（自动通关里实际卡住的就是这个状态）
var gptUnit = combat.Units.First(u => u.PlayerId == "p2");
gptUnit.Hp = 0;
gptUnit.Downed = true;
var medic = combat.Units.First(u => u.EnemyId == "e_medic");
var guard = combat.Units.First(u => u.EnemyId == "e_sentinel");
medic.Hp = 14;
guard.Hp = 22;

Console.WriteLine("轮次\t医疗机HP\t宪章HP");
var lastRound = 0;
var guardLoop = 0;
while (!combat.IsOver && combat.Round <= 30 && guardLoop++ < 400)
{
    var active = combat.ActiveUnit;
    if (active is null) break;
    if (active.Side == Side.Enemy) { combat.ActiveUnitId = combat.TurnOrder.First(id => combat.Units.Any(u => u.Id == id && u.Side == Side.Player && !u.Downed)); continue; }
    // 只做一件事：贴身普攻血量最低的敌人（人类玩家的最低操作）
    var target = combat.Units.Where(x => x.Side == Side.Enemy && !x.Downed).OrderBy(x => x.Hp).FirstOrDefault();
    if (target is null) break;
    try
    {
        if (Hex.Distance(active.Col, active.Row, target.Col, target.Row) <= Math.Max(1, active.WeaponRange))
            GameEngine.ApplyAction(st, new GameAction { Type = "combatAction", PlayerId = active.PlayerId, SkillId = "basic", TargetUnitId = target.Id });
        else if (combat.Reachable.Count > 0)
        {
            var step = combat.Reachable.OrderBy(h => Hex.Distance(h.Col, h.Row, target.Col, target.Row)).First();
            GameEngine.ApplyAction(st, new GameAction { Type = "combatMove", PlayerId = active.PlayerId, Col = step.Col, Row = step.Row });
        }
        else
            GameEngine.ApplyAction(st, new GameAction { Type = "combatEndTurn", PlayerId = active.PlayerId });
    }
    catch (GameException)
    {
        try { GameEngine.ApplyAction(st, new GameAction { Type = "combatEndTurn", PlayerId = active.PlayerId }); } catch { break; }
    }
    if (combat.Round != lastRound)
    {
        lastRound = combat.Round;
        var me = combat.Units.First(u => u.PlayerId == "p1");
        Console.WriteLine($"{combat.Round}\t{medic.Hp}/{medic.MaxHp}\t{me.Hp}/{me.MaxHp}");
    }
}

var killed = medic.Downed || medic.Hp <= 0;
var won = combat.IsOver && combat.Result == "victory";
Console.WriteLine();
if (won || killed)
    Console.WriteLine($"PASS  医疗机在第 {combat.Round} 轮被击杀（战斗 {combat.Result}）");
else
    Console.WriteLine($"FAIL  烧到第 {combat.Round} 轮医疗机仍有 {medic.Hp}/{medic.MaxHp} ——「修复协议」每回合 +9，" +
                      $"宪章普攻 9→7（护甲 2），净回血 +2/回合，这一场打不完");

Console.WriteLine("说明：0.13 起医疗机「修复协议」冷却 3 回合 + 命中保底 1 点伤害，这场仗现在 9 轮内就能打完。");
Console.WriteLine("      规则层另有 retreat 动作（整队退回上一节点、-10% 生命、节点不清空），作为打不过时的软出口。");
return (won || killed) ? 0 : 1;
