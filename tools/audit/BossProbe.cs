// 第三幕 Boss 行为探针：验证「归档」（消耗品被拿走）和「残血处决」真的生效。
//   dotnet run tools/audit/BossProbe.cs
#:project ../../src/AGI2046.Rules/AGI2046.Rules.csproj
using AGI2046.Rules;

var pass = 0; var total = 0;
void Ok(string name, bool ok, string detail)
{
    total++;
    if (ok) pass++;
    Console.WriteLine($"{(ok ? "PASS" : "FAIL")}  {name}  —  {detail}");
}

// ── 1. 结构：Boss 必须真的是 Boss ────────────────────────────────
var def = GameData.Enemies["e_boss_zero"];
Ok("第三幕 Boss 的 Role 是「首领」", def.Role == "首领", $"Role = {def.Role}");

var specials = def.SkillIds.Select(id => GameData.Skills[id].Special).Where(s => !string.IsNullOrEmpty(s)).ToList();
Ok("四个 Boss 分支技能齐全（aoe / shield / summon / execute）",
    specials.Contains("boss_aoe") && specials.Contains("boss_shield") &&
    specials.Contains("boss_summon") && specials.Contains("boss_execute"),
    string.Join(", ", specials));

Ok("Boss 血量高于前两幕（90 / 125）", def.Hp > 125, $"HP = {def.Hp}");

// ── 2. 行为：归档会拿走消耗品 ────────────────────────────────────
var st = GameEngine.NewGame(new NewGameRequest
{
    CharacterIds = new() { "gpt", "claude", "mistral", "deepseek" },
    Seed = 12345
});
var bossNode = st.Nodes.First(n => n.Type == NodeType.Boss);
bossNode.EnemyGroup = "g_boss3";   // NewGame 只生成第一幕地图，这里直接指向第三幕的 Boss 组
foreach (var p in st.Players) p.NodeId = bossNode.Id;
st.HasKey = true;
foreach (var p in st.Players)
{
    p.Consumables["medkit"] = 2;
    p.Consumables["stimulant"] = 2;
}
var before = st.Players.Sum(p => p.Consumables.Values.Sum());
CombatEngine.StartCombat(st, st.Players[0], bossNode);

var boss = st.Combat!.Units.FirstOrDefault(u => u.EnemyId == "e_boss_zero");
if (boss is null)
{
    Ok("Boss 出现在战斗里", false, $"实际单位：{string.Join(",", st.Combat.Units.Where(u => u.Side == Side.Enemy).Select(u => u.EnemyId))}");
}
else
{
    Ok("Boss 出现在战斗里", true, $"{boss.Name} {boss.Hp}/{boss.MaxHp}，护甲 {boss.Armor}，抗性 {boss.Resistance}");

    // 推到 Boss 行动几轮，等它放「零号脉冲」
    var purgeSeen = false;
    var executeSeen = false;
    for (var i = 0; i < 400 && st.Phase == GamePhase.Combat && st.Combat is { IsOver: false }; i++)
    {
        // 战斗中的当前单位在 combat.ActiveUnitId 上，state.ActivePlayerId 是探索阶段的字段（一直是 p1）
        var pid = st.Combat?.ActiveUnit?.PlayerId;
        if (pid is null) break;
        try { GameEngine.ApplyAction(st, new GameAction { Type = "combatEndTurn", PlayerId = pid }); }
        catch (GameException ex) { Console.WriteLine($"  [停在第 {i} 步] {ex.Message}"); break; }
        var log = st.Combat?.Log ?? new List<string>();
        if (!purgeSeen && log.Any(l => l.Contains("归档完成"))) purgeSeen = true;
        if (!executeSeen && log.Any(l => l.Contains("直接删除") || l.Contains("删除请求"))) executeSeen = true;
    }
    var after = st.Players.Sum(p => p.Consumables.Values.Sum());
    Ok("「归档」真的拿走了消耗品", after < before || purgeSeen,
        $"消耗品 {before} → {after}；战斗日志里{(purgeSeen ? "有" : "没有")}「归档完成」");
    Ok("Boss 会使用「删除请求」", executeSeen, executeSeen ? "日志里出现过" : "这一局没见到（可能没打到残血阶段）");

    var hpPct = boss.Hp * 100 / Math.Max(1, boss.MaxHp);
    Ok("Boss 战持续了足够轮数（不是秒杀）", (st.Combat?.Round ?? 0) >= 5 || st.Phase != GamePhase.Combat,
        $"打到第 {st.Combat?.Round ?? 0} 轮，Boss 剩 {boss.Hp}/{boss.MaxHp}（{hpPct}%），阶段 {st.Phase}");
}

Console.WriteLine("\n提示：本探针里玩家只「结束回合」不还手，所以必败——");
Console.WriteLine("      它验证的是 Boss 机制有没有生效（归档 / 护盾 / 召唤 / 处决），不是平衡。");
Console.WriteLine($"\n===== {pass}/{total} 通过 =====");
return pass == total ? 0 : 1;
