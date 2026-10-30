#:project ../../src/AGI2046.Rules/AGI2046.Rules.csproj
using AGI2046.Rules;

/* 0.25.1 角色 / 装备统计平衡
   目的：找出「上不了场」和「不选就亏」的两类极端，而不是把所有人调成一样。
   方法：固定搭档 + 固定敌人组 + 多个种子，各打 N 场短战。
   用法：dotnet run tools/audit/balance-roster.cs [每组场次]                              */

var perChar = args.Length > 0 ? int.Parse(args[0]) : 12;
// 单人 + 3 个敌人：这才能把「谁的 kit 顶得住」区分出来。
// 2 人队打 2 个敌人时全部 100% 胜，测不出任何差异（第一版就踩了这个坑）。
var partner = "gpt";                  // 固定搭档：把「角色自身强度」和「运气」分开
var group = "g_elite2";               // 第二幕精英组：守卫 + 医疗 + 狙击，2 打 3
var seedBase = 51000;

var pass = 0;
var fail = 0;
void Ok(string name, bool cond, string detail = "")
{
    if (cond) { pass++; Console.WriteLine($"PASS  {name}"); }
    else { fail++; Console.WriteLine($"FAIL  {name}   {detail}"); }
}

/* 一场自动短战：治疗优先，其次打最近的，打不到就靠近 */
(int Win, int Lose, int Stuck, int Rounds) Fight(string[] ids, string? traitItem, int seed)
{
    var state = GameEngine.NewGame(new NewGameRequest
    {
        CharacterIds = ids.ToList(), Seed = seed, FirstRun = false
    });
    if (traitItem is not null)
    {
        var def = GameData.Gear[traitItem];
        // 必须用规则层的工厂：只填 id/name 的话武器是 0 伤害，
        // 测出来的「特性变差」其实是「拿了把空枪」（第一版踩过）。
        state.Players[0].Equipment[def.Slot] = GameRules.CreateItem(def.Id, 1);
        GameRules.RecalculatePlayer(state.Players[0]);
    }

    var node = new NodeState
    {
        Id = "probe", Name = "平衡探针", Type = NodeType.Combat, Layer = 1, Lane = 2,
        X = 100, Y = 100, Revealed = true, Visited = true
    };
    state.Nodes.Add(node);
    foreach (var p in state.Players) p.NodeId = node.Id;
    state.ActivePlayerId = state.Players[0].Id;

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
                                         u.Hp * 100 / Math.Max(1, u.MaxHp) < 40)
            .OrderBy(u => u.Hp).FirstOrDefault();
        var acted = false;
        if (wounded is not null)
        {
            var heal = active.SkillIds.Select(GameRules.Skill)
                .FirstOrDefault(x => x.Effects.Any(e => e.Type is "heal" or "heal_all_allies") &&
                                     x.FocusCost <= active.Focus &&
                                     (x.Cooldown == 0 || active.Cooldowns.GetValueOrDefault(x.Id) <= 0));
            if (heal is not null)
            {
                try
                {
                    GameEngine.ApplyAction(st, new GameAction
                    {
                        Type = "combatAction", PlayerId = active.PlayerId, SkillId = heal.Id, TargetUnitId = wounded.Id
                    });
                    acted = true;
                }
                catch (GameException) { }
            }
        }

        if (!acted)
        {
            var near = enemies.OrderBy(e => Hex.Distance(active.Col, active.Row, e.Col, e.Row)).First();
            if (Hex.Distance(active.Col, active.Row, near.Col, near.Row) <= Math.Max(1, active.WeaponRange))
            {
                var skill = active.SkillIds.Select(GameRules.Skill)
                    .Where(s => s.Dice > 0 && s.FocusCost <= active.Focus &&
                                (s.Cooldown == 0 || active.Cooldowns.GetValueOrDefault(s.Id) <= 0) &&
                                (!s.IsUltimate || !active.UltimateUsed))
                    .OrderByDescending(s => s.Dice * Math.Max(1, s.DamagePerDie))
                    .FirstOrDefault();
                try
                {
                    GameEngine.ApplyAction(st, new GameAction
                    {
                        Type = "combatAction", PlayerId = active.PlayerId,
                        SkillId = skill?.Id ?? "basic", TargetUnitId = near.Id
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

(double Win, double Rounds) Run(string[] ids, string? traitItem, int count, int seedOffset)
{
    var wins = 0; var total = 0; var rounds = 0; var stuck = 0;
    for (var i = 0; i < count; i++)
    {
        var r = Fight(ids, traitItem, seedBase + seedOffset + i * 17);
        wins += r.Win; total += r.Win + r.Lose + r.Stuck; rounds += r.Rounds; stuck += r.Stuck;
    }
    if (total == 0) return (0, 0);
    if (stuck > count * 0.05) Console.WriteLine($"      注意：{ids[0]} 有 {stuck} 局僵局");
    return (wins * 100.0 / total, rounds / (double)total);
}

/* ── 1. 全角色：谁上不了场？ ─────────────────────────────────── */
var rows = new List<(string Id, string Name, double Win, double Rounds)>();
foreach (var c in GameData.Characters.Values.OrderBy(x => x.Id))
{
    if (c.Id == partner) continue;
    var (win, rounds) = Run(string.IsNullOrEmpty(partner) ? new[] { c.Id } : new[] { c.Id, partner }, null, perChar, 0);
    rows.Add((c.Id, c.Name, win, rounds));
}

Console.WriteLine("      角色胜率：");
foreach (var r in rows.OrderBy(x => x.Win))
    Console.WriteLine($"        {r.Name,-6}({r.Id,-11}) {r.Win,5:0.0}%  {r.Rounds,4:0.0} 轮");

Ok("角色样本覆盖全部 16 人",
    rows.Count == (string.IsNullOrEmpty(partner) ? GameData.Characters.Count : GameData.Characters.Count - 1),
    rows.Count.ToString());
Ok("没有角色完全上不了场（≥ 35%）", rows.All(r => r.Win >= 35),
    string.Join(",", rows.Where(r => r.Win < 35).Select(r => $"{r.Name}={r.Win:0}%")));
Ok("没有角色强到必选（≤ 100%）", rows.All(r => r.Win <= 100));
Ok("角色之间差距不超过 45 个百分点",
    rows.Max(r => r.Win) - rows.Min(r => r.Win) <= 45,
    $"{rows.Min(r => r.Win):0}% ~ {rows.Max(r => r.Win):0}%");
Ok("平均战斗不超过 15 轮", rows.Average(r => r.Rounds) <= 15, $"{rows.Average(r => r.Rounds):0.0}");

// 胜率会撞天花板，轮数不会：用「打得快不快」判断谁在拖后腿。
var fastest = rows.Min(r => r.Rounds);
var slowest = rows.Max(r => r.Rounds);
var avgRounds = rows.Average(r => r.Rounds);
Ok("最快与最慢不超过 2 倍", slowest <= fastest * 2, $"{fastest:0.0} ~ {slowest:0.0} 轮");
Ok("没有角色慢于平均 1.5 倍", slowest <= avgRounds * 1.5,
    $"最慢 {slowest:0.0} / 平均 {avgRounds:0.0}");

/* ── 2. 装备特性：哪条是陷阱 / 哪条是白送？ ───────────────────
   关键：武器特性必须装在「本来就用这类武器」的角色身上。
   否则测的是「给宪章一把狙击枪」，不是「这条特性强不强」。 */
var owners = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
{
    // 武器类：按武器熟练属性挑人
    ["t_counter"] = "llama",       // 拳套 → 羊群
    ["t_expose"] = "claude",       // 太刀 → 宪章
    ["t_focus"] = "gpt",           // 终端 → 白垩
    ["t_lowhp"] = "perplexity",    // 步枪 → 提灯
    // 防具 / 饰品 / 义体：默认宪章
    ["t_drone"] = "claude",
    ["t_item"] = "claude",
    ["t_speedlink"] = "claude",
    ["t_retreat"] = "claude"
};

var traitRows = new List<(string Name, string Owner, double Base, double Win, double Delta)>();
foreach (var t in GameData.Traits.Values.OrderBy(x => x.Id))
{
    var gear = GameData.Gear.Values.FirstOrDefault(g => g.TraitId == t.Id);
    if (gear is null) { Ok($"特性「{t.Name}」有对应装备", false, t.Id); continue; }
    var owner = owners.GetValueOrDefault(t.Id, "claude");
    var team = new[] { owner, partner }.Where(x => !string.IsNullOrEmpty(x)).ToArray();
    var baseWin = Run(team, null, perChar, 300).Win;
    var (win, _) = Run(team, gear.Id, perChar, 800);
    traitRows.Add((t.Name, owner, baseWin, win, win - baseWin));
}

Console.WriteLine("      特性影响（同一角色，只换这一件装备）：");
foreach (var r in traitRows.OrderByDescending(x => x.Delta))
    Console.WriteLine($"        {r.Name,-8} {r.Owner,-11} {r.Base,5:0.0}% → {r.Win,5:0.0}%  ({r.Delta:+0.0;-0.0;0.0})");

Ok("8 条特性都能找到对应装备", traitRows.Count == GameData.Traits.Count, traitRows.Count.ToString());
Ok("没有特性把胜率打崩（≥ -25）", traitRows.All(r => r.Delta >= -25),
    string.Join(",", traitRows.Where(r => r.Delta < -25).Select(r => $"{r.Name}{r.Delta:0}")));
Ok("没有特性变成必选（≤ +25）", traitRows.All(r => r.Delta <= 25),
    string.Join(",", traitRows.Where(r => r.Delta > 25).Select(r => $"{r.Name}+{r.Delta:0}")));
Ok("至少四条特性不亏", traitRows.Count(r => r.Delta >= -5) >= 4,
    $"{traitRows.Count(r => r.Delta >= -5)}/8");

Console.WriteLine($"===== {pass} passed, {fail} failed =====");
return fail == 0 ? 0 : 1;
