#:project ../../src/AGI2046.Rules/AGI2046.Rules.csproj
using AGI2046.Rules;

/* 0.24 平衡回归（协同 / 支援）：1000 局短战对照
   一半「裸打」，一半预先建立关系 + 掩护 + 赠 Focus，比较胜率与轮数。
   目标：协同要有感知，但不能变成白送；也不能触发无限循环。
   用法：dotnet run tools/audit/balance-synergy.cs [每侧局数]                     */

var perSide = args.Length > 0 ? int.Parse(args[0]) : 500;

var parties = new Dictionary<int, string[]>
{
    [2] = new[] { "gpt", "claude" },
    [3] = new[] { "mistral", "wenxin", "qwen" },
    [4] = new[] { "gpt", "claude", "mistral", "deepseek" }
};
var groups = new[] { "g_patrol", "g_hack", "g_mirror", "g_elite2", "g_orbit" };

var pass = 0;
var fail = 0;
void Ok(string name, bool cond, string detail = "")
{
    if (cond) { pass++; Console.WriteLine($"PASS  {name}"); }
    else { fail++; Console.WriteLine($"FAIL  {name}   {detail}"); }
}

(int Win, int Lose, int Stuck, int Rounds) Run(bool synergy, int index)
{
    var size = 2 + index % 3;
    var group = groups[index % groups.Length];
    var state = GameEngine.NewGame(new NewGameRequest
    {
        CharacterIds = parties[size].ToList(),
        Seed = 7000 + index,
        FirstRun = false
    });
    var node = new NodeState
    {
        Id = "syn", Name = "协同探针", Type = NodeType.Combat, Layer = 1, Lane = 2,
        X = 100, Y = 100, Revealed = true, Visited = true
    };
    state.Nodes.Add(node);
    foreach (var p in state.Players) p.NodeId = node.Id;
    state.ActivePlayerId = state.Players[0].Id;

    if (synergy)
    {
        // 关系拉满 + 掩护 + 终极预备：模拟「一局认真配合过的队伍」
        for (var i = 0; i < state.Players.Count; i++)
            for (var j = i + 1; j < state.Players.Count; j++)
                for (var k = 0; k < 9; k++)
                    RelationshipEngine.OnSynergy(state, state.Players[i].Id, state.Players[j].Id);
        if (state.Players.Count >= 2)
        {
            state.Players[1].GuardLinkFrom = state.Players[0].Id;
            state.Players[0].UltimatePrep = 3;
        }
    }

    var st = CombatEngine.StartCombat(state, state.ActivePlayer!, node, group);
    var guard = 0;
    while (st.Combat is { IsOver: false } && st.Combat.Round <= 25 && guard++ < 400)
    {
        var c = st.Combat!;
        var active = c.ActiveUnit;
        if (active is null || active.Side == Side.Enemy) break;
        var enemies = c.Units.Where(u => u.Side == Side.Enemy && !u.Downed).ToList();
        if (enemies.Count == 0) break;

        var wounded = c.Units.Where(u => u.Side == Side.Player && !u.Downed &&
                                         u.Hp * 100 / Math.Max(1, u.MaxHp) < 35)
            .OrderBy(u => u.Hp).FirstOrDefault();
        var acted = false;
        if (wounded is not null)
        {
            var heal = active.SkillIds.Select(GameRules.Skill)
                .FirstOrDefault(s => s.Effects.Any(e => e.Type is "heal" or "heal_all_allies") &&
                                     s.FocusCost <= active.Focus &&
                                     (s.Cooldown == 0 || active.Cooldowns.GetValueOrDefault(s.Id) <= 0));
            if (heal is not null)
            {
                try
                {
                    GameEngine.ApplyAction(st, new GameAction
                    {
                        Type = "combatAction", PlayerId = active.PlayerId, SkillId = heal.Id,
                        TargetUnitId = wounded.Id
                    });
                    acted = true;
                }
                catch (GameException) { }
            }
        }

        if (!acted)
        {
            var near = enemies.OrderBy(e => Hex.Distance(active.Col, active.Row, e.Col, e.Row)).First();
            var inRange = Hex.Distance(active.Col, active.Row, near.Col, near.Row) <= Math.Max(1, active.WeaponRange);
            if (inRange)
            {
                try
                {
                    GameEngine.ApplyAction(st, new GameAction
                    {
                        Type = "combatAction", PlayerId = active.PlayerId, SkillId = "basic",
                        TargetUnitId = near.Id
                    });
                    acted = true;
                }
                catch (GameException) { }
            }
            else if (c.Reachable.Count > 0)
            {
                var step = c.Reachable.OrderBy(h => Hex.Distance(h.Col, h.Row, near.Col, near.Row)).First();
                try
                {
                    GameEngine.ApplyAction(st, new GameAction
                    {
                        Type = "combatMove", PlayerId = active.PlayerId, Col = step.Col, Row = step.Row
                    });
                    acted = true;
                }
                catch (GameException) { }
            }
        }

        if (!acted)
        {
            try { GameEngine.ApplyAction(st, new GameAction { Type = "combatEndTurn" }); }
            catch (GameException) { break; }
        }
    }

    var combat = st.Combat!;
    var result = combat.IsOver && combat.Result == "victory" ? "win"
        : st.Phase == GamePhase.Defeat || combat.Result == "defeat" ? "lose" : "stuck";
    return (result == "win" ? 1 : 0, result == "lose" ? 1 : 0, result == "stuck" ? 1 : 0, combat.Round);
}

(double rate, double avg) Summarize(string label, List<(int Win, int Lose, int Stuck, int Rounds)> rows)
{
    var win = rows.Sum(r => r.Win);
    var lose = rows.Sum(r => r.Lose);
    var stuck = rows.Sum(r => r.Stuck);
    var total = Math.Max(1, win + lose + stuck);
    var rate = win * 100.0 / total;
    var avg = rows.Sum(r => r.Rounds) / (double)rows.Count;
    Console.WriteLine($"      {label,-10} 胜率 {rate,5:0.0}%  平均 {avg,4:0.0} 轮  （{total} 局，僵局 {stuck}）");
    Ok($"{label} 胜率不低于 25%", rate >= 25, $"{rate:0.0}%");
    Ok($"{label} 平均不超过 20 轮", avg <= 20, $"{avg:0.0}");
    Ok($"{label} 僵局不超过 5%", stuck <= total * 0.05, $"{stuck}/{total}");
    return (rate, avg);
}

var baseRows = new List<(int, int, int, int)>();
var synRows = new List<(int, int, int, int)>();
var errors = new List<string>();

for (var i = 0; i < perSide; i++)
{
    try { baseRows.Add(Run(false, i)); }
    catch (Exception ex) { errors.Add("基线 " + ex.GetType().Name + ":" + ex.Message); }
    try { synRows.Add(Run(true, i)); }
    catch (Exception ex) { errors.Add("协同 " + ex.GetType().Name + ":" + ex.Message); }
}

Ok("两侧都没有异常", errors.Count == 0, string.Join(" | ", errors.Take(3)));
var b = Summarize("裸打", baseRows);
var s = Summarize("协同", synRows);

Ok("协同不会降低胜率", s.rate >= b.rate - 1, $"裸打 {b.rate:0.0}% / 协同 {s.rate:0.0}%");
Ok("协同不会把战斗变成秒杀", s.avg >= 1.5, $"{s.avg:0.0} 轮");
if (b.avg > 0)
    Ok("协同的轮数收益有上限（不超过 60%）", (b.avg - s.avg) / b.avg <= 0.6,
        $"裸打 {b.avg:0.0} → 协同 {s.avg:0.0}");

Console.WriteLine($"===== {pass} passed, {fail} failed =====");
return fail == 0 ? 0 : 1;
