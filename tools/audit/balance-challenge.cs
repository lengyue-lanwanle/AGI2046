#:project ../../src/AGI2046.Rules/AGI2046.Rules.csproj
using AGI2046.Rules;

/* 0.24 平衡回归（挑战 / 变异）：1000 局短战
   目的不是「几成胜率好看」，而是：
     · 任何组合都不会抛异常；
     · 没有超过 5% 的僵局（打不完）；
     · 变异确实更难，但不会把胜率压到 0；
     · 每一幕的短战都在可完成区间内。
   用法：dotnet run tools/audit/balance-challenge.cs [局数]                       */

var rounds = args.Length > 0 ? int.Parse(args[0]) : 1000;

var parties = new Dictionary<int, string[]>
{
    [1] = new[] { "gpt" },
    [2] = new[] { "gpt", "claude" },
    [3] = new[] { "mistral", "wenxin", "qwen" },
    [4] = new[] { "gpt", "claude", "mistral", "deepseek" }
};
var groups = new Dictionary<int, string[]>
{
    [1] = new[] { "g_skim_patrol", "g_skim_swarm", "g_patrol", "g_hack" },
    [2] = new[] { "g_mirror", "g_guard2", "g_elite2", "g_skim_mirror" },
    [3] = new[] { "g_orbit", "g_protocol", "g_elite3", "g_skim_orbit" }
};

var pass = 0;
var fail = 0;
void Ok(string name, bool cond, string detail = "")
{
    if (cond) { pass++; Console.WriteLine($"PASS  {name}"); }
    else { fail++; Console.WriteLine($"FAIL  {name}   {detail}"); }
}

var stats = new Dictionary<string, (int Win, int Lose, int Stuck, int Rounds)>();
void Add(string key, string result, int round)
{
    stats.TryGetValue(key, out var s);
    stats[key] = (
        s.Win + (result == "win" ? 1 : 0),
        s.Lose + (result == "lose" ? 1 : 0),
        s.Stuck + (result == "stuck" ? 1 : 0),
        s.Rounds + round
    );
}

var errors = new List<string>();
var stalemates = 0;

for (var i = 0; i < rounds; i++)
{
    var size = 1 + i % 4;
    var act = 1 + (i / 4) % 3;
    var groupPool = groups[act];
    var group = groupPool[(i / 12) % groupPool.Length];
    var mutated = i % 3 == 0;      // 三分之一带变异
    var tag = $"{size}人/第{act}幕{(mutated ? "/变异" : "")}";

    try
    {
        var mutators = mutated
            ? GameData.Mutators.Take(2).Select(m => m.Id).ToList()
            : new List<string>();
        var state = GameEngine.NewGame(new NewGameRequest
        {
            CharacterIds = parties[size].ToList(),
            Seed = 1000 + i,
            FirstRun = false,
            Mode = mutated ? GameMode.Challenge : GameMode.Standard,
            Challenge = mutated ? new ChallengeConfig { Seed = 1000 + i, MutatorIds = mutators, Difficulty = "normal" } : null
        });

        var node = new NodeState
        {
            Id = "bal", Name = "平衡探针", Type = NodeType.Combat, Layer = 1, Lane = 2,
            X = 100, Y = 100, Revealed = true, Visited = true
        };
        state.Nodes.Add(node);
        foreach (var p in state.Players) p.NodeId = node.Id;
        state.ActivePlayerId = state.Players[0].Id;

        var st = CombatEngine.StartCombat(state, state.ActivePlayer!, node, group);
        var maxRounds = 30;
        var guard = 0;
        while (st.Combat is { IsOver: false } && st.Combat.Round <= maxRounds && guard++ < 400)
        {
            var c = st.Combat!;
            var active = c.ActiveUnit;
            if (active is null) break;
            if (active.Side == Side.Enemy) break;   // 引擎应已跑完敌方回合

            var enemies = c.Units.Where(u => u.Side == Side.Enemy && !u.Downed).ToList();
            if (enemies.Count == 0) break;

            // 简单策略：残血先治疗，否则打最近的
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
                    // 走到「离目标最近的空格」——直接点敌人所在格永远不可达
                    var step = c.Reachable
                        .OrderBy(h => Hex.Distance(h.Col, h.Row, near.Col, near.Row))
                        .ThenBy(h => h.Col).First();
                    try
                    {
                        GameEngine.ApplyAction(st, new GameAction
                        {
                            Type = "combatMove", PlayerId = active.PlayerId,
                            Col = step.Col, Row = step.Row
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
        string result;
        if (combat.IsOver && combat.Result == "victory") result = "win";
        else if (st.Phase == GamePhase.Defeat || combat.Result == "defeat") result = "lose";
        else { result = "stuck"; stalemates++; }
        Add(tag, result, combat.Round);
        Add(size + "人", result, combat.Round);
        Add("第" + act + "幕", result, combat.Round);
        Add(mutated ? "变异" : "标准", result, combat.Round);
    }
    catch (Exception ex)
    {
        errors.Add($"{tag}: {ex.GetType().Name} {ex.Message}");
    }
}

Ok("1000 局没有异常", errors.Count == 0, string.Join(" | ", errors.Take(3)));
Ok("僵局不超过 5%", stalemates <= rounds * 0.05, $"{stalemates}/{rounds}");

foreach (var (key, s) in stats.OrderBy(k => k.Key))
{
    var total = s.Win + s.Lose + s.Stuck;
    if (total == 0) continue;
    var winRate = s.Win * 100.0 / total;
    var avgRounds = s.Rounds / (double)total;
    Console.WriteLine($"      {key,-14} 胜率 {winRate,5:0.0}%  平均 {avgRounds,4:0.0} 轮  （{total} 局）");
    // 每一档都必须在「能赢但不白送」的区间里。
    // 100% 是允许的：第 1 幕的小型战斗本来就是教学强度，不该在这里卡人。
    Ok($"{key} 胜率不低于 25%", winRate >= 25, $"{winRate:0.0}%");
    Ok($"{key} 平均不超过 20 轮", avgRounds <= 20, $"{avgRounds:0.0}");
}

if (stats.TryGetValue("标准", out var std) && stats.TryGetValue("变异", out var mut))
{
    var stdRate = std.Win * 100.0 / Math.Max(1, std.Win + std.Lose + std.Stuck);
    var mutRate = mut.Win * 100.0 / Math.Max(1, mut.Win + mut.Lose + mut.Stuck);
    // 不是所有变异都是纯减益（有的给资源），所以只看「没有明显变成送分」
    Ok("变异没有让短战变成送分", mutRate <= stdRate + 15, $"标准 {stdRate:0.0}% / 变异 {mutRate:0.0}%");
}

/* 难度梯度：第 3 幕应当比第 1 幕难 */
if (stats.TryGetValue("第1幕", out var a1) && stats.TryGetValue("第3幕", out var a3))
{
    var r1 = a1.Win * 100.0 / Math.Max(1, a1.Win + a1.Lose + a1.Stuck);
    var r3 = a3.Win * 100.0 / Math.Max(1, a3.Win + a3.Lose + a3.Stuck);
    Ok("第 3 幕比第 1 幕难", r3 < r1, $"第1幕 {r1:0.0}% / 第3幕 {r3:0.0}%");
}

Console.WriteLine($"===== {pass} passed, {fail} failed =====");
return fail == 0 ? 0 : 1;
