#:project ../../src/AGI2046.Rules/AGI2046.Rules.csproj
using AGI2046.Rules;

/* 0.25.1 群体技能骰子探针
   问题：群体技能（AllEnemies）是「每个目标各掷一次」，还是「一次骰子打全场」？
   验证：
     · 一次施放会在 trace.Hits 里留下每个目标一条；
     · 不同目标的命中数/伤害不是复制粘贴（独立掷骰）；
     · lastRoll 只描述最后一个目标（所以 UI 必须额外说明，不能假装是全体结果）。
   用法：dotnet run tools/audit/aoe-probe.cs [施放次数]                                 */

var casts = args.Length > 0 ? int.Parse(args[0]) : 12;

var pass = 0;
var fail = 0;
void Ok(string name, bool cond, string detail = "")
{
    if (cond) { pass++; Console.WriteLine($"PASS  {name}"); }
    else { fail++; Console.WriteLine($"FAIL  {name}   {detail}"); }
}

/* 找一个群体技能：优先 mistral 的终极技，其次任何 AllEnemies 技能 */
SkillDef? aoe = GameData.Skills.Values.FirstOrDefault(s => s.Id == "mistral_u")
                ?? GameData.Skills.Values.FirstOrDefault(s => s.Target == TargetType.AllEnemies && s.Dice > 0 && !s.IsUltimate);
Ok("存在群体攻击技能", aoe is not null, aoe?.Id ?? "none");
if (aoe is null) { Console.WriteLine("===== 0 passed, 1 failed ====="); return 1; }

var observed = new List<(int Targets, int DistinctOutcomes, string Detail)>();
var traceHasPerTarget = 0;
var lastRollIsSingle = 0;
var exceptions = new List<string>();

for (var i = 0; i < casts; i++)
{
    try
    {
        var state = GameEngine.NewGame(new NewGameRequest
        {
            CharacterIds = new List<string> { "mistral", "gpt" },
            Seed = 90000 + i * 37,
            FirstRun = false
        });
        var node = new NodeState
        {
            Id = "aoe", Name = "群体探针", Type = NodeType.Combat, Layer = 1, Lane = 2,
            X = 100, Y = 100, Revealed = true, Visited = true
        };
        state.Nodes.Add(node);
        foreach (var p in state.Players) p.NodeId = node.Id;
        state.ActivePlayerId = state.Players[0].Id;

        // g_hack 有 3 个敌人，保证群体技有多个目标
        var st = CombatEngine.StartCombat(state, state.ActivePlayer!, node, "g_hack");
        var c = st.Combat!;
        var caster = c.Units.First(u => u.Side == Side.Player && u.PlayerId == "p1");
        // 群体技需要射程内的敌人：把施法者放到中间，敌人围过来之前也能打到
        caster.Col = 3; caster.Row = 2;
        caster.SkillIds = new List<string> { aoe.Id, "basic" };
        caster.Focus = 5;
        caster.UltimateUsed = false;
        c.ActiveUnitId = caster.Id;
        c.TurnOrder = new List<string> { caster.Id };

        GameEngine.ApplyAction(st, new GameAction
        {
            Type = "combatAction", PlayerId = caster.PlayerId, SkillId = aoe.Id
        });

        var trace = c.LastActions.LastOrDefault();
        if (trace is null) { exceptions.Add($"#{i}: 没有 trace"); continue; }
        var hits = trace.Hits;
        if (hits.Count > 1) traceHasPerTarget++;

        // 独立掷骰的表现：多目标之间「命中数 + 伤害」不完全相同
        var outcomes = hits.Select(h => $"{h.Hits}:{h.Damage}").Distinct().Count();
        observed.Add((hits.Count, outcomes, string.Join(" | ", hits.Select(h => $"{h.Hits}中/{h.Damage}伤"))));

        // lastRoll 只描述一个目标
        if (c.LastRoll is not null) lastRollIsSingle++;
    }
    catch (Exception ex)
    {
        exceptions.Add($"#{i}: {ex.GetType().Name} {ex.Message}");
    }
}

Ok("每场都能施放群体技", exceptions.Count == 0, string.Join(" | ", exceptions.Take(3)));
Ok("trace 里每个目标一条记录", traceHasPerTarget == observed.Count && observed.Count > 0,
    $"{traceHasPerTarget}/{observed.Count}");
Ok("群体技确实打到多个目标", observed.All(o => o.Targets >= 2),
    string.Join(",", observed.Select(o => o.Targets)));

var anyDistinct = observed.Any(o => o.DistinctOutcomes > 1);
Ok("不同目标的结果不是复制粘贴（独立掷骰）", anyDistinct,
    string.Join(" || ", observed.Take(3).Select(o => o.Detail)));

var distinctRatio = observed.Count(o => o.DistinctOutcomes > 1) / (double)Math.Max(1, observed.Count);
Ok("多数施放能看到目标间差异", distinctRatio >= 0.5, $"{distinctRatio:0.00}");

Ok("lastRoll 只描述一个目标（UI 需要额外说明）", lastRollIsSingle == observed.Count,
    $"{lastRollIsSingle}/{observed.Count}");

Console.WriteLine($"===== {pass} passed, {fail} failed =====");
return fail == 0 ? 0 : 1;
