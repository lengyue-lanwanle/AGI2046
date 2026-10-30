// 觉醒探针：验证 0.15 的「每人各能觉醒一次 + 觉醒共鸣」。
//   dotnet run tools/audit/AwakenProbe.cs
#:project ../../src/AGI2046.Rules/AGI2046.Rules.csproj
using AGI2046.Rules;

var pass = 0; var total = 0;
void Ok(string name, bool ok, string detail)
{
    total++;
    if (ok) pass++;
    Console.WriteLine($"{(ok ? "PASS" : "FAIL")}  {name}  —  {detail}");
}

var st = GameEngine.NewGame(new NewGameRequest { CharacterIds = new() { "gpt", "claude" }, Seed = 12345 });
var nodes = st.Nodes.Where(n => n.Type == NodeType.Awakening).ToList();
Ok("地图上有至少 2 个觉醒节点（2 人队要能各觉醒一次）", nodes.Count >= 2, $"共 {nodes.Count} 个");
if (nodes.Count < 2)
{
    Console.WriteLine($"\n===== {pass}/{total} 通过 =====");
    return 1;
}

var armorBefore = st.Players.Select(p => p.Armor).ToList();
var hpBefore = st.Players.Select(p => p.MaxHp).ToList();

static void AwakenAt(GameState st, string playerId, string nodeId)
{
    st.ActivePlayerId = playerId;
    var p = st.Player(playerId)!;
    p.Ap = 3;
    p.NodeId = nodeId;
    GameEngine.ApplyAction(st, new GameAction { Type = "interact", PlayerId = playerId, NodeId = nodeId });
}

// ── 1. 第一个人觉醒 ─────────────────────────────────────────────
AwakenAt(st, "p1", nodes[0].Id);
var p1 = st.Player("p1")!;
Ok("第一个人觉醒成功", p1.Awakened, $"{p1.Name} Awakened={p1.Awakened}");
Ok("觉醒共鸣 1 层（自己也吃）", p1.AwakenResonance == 1, $"Resonance={p1.AwakenResonance}");
Ok("全队护甲 +1", st.Players[0].Armor == armorBefore[0] + 1, $"{armorBefore[0]} → {st.Players[0].Armor}");
Ok("全队最大生命 +5", st.Players[0].MaxHp == hpBefore[0] + 5, $"{hpBefore[0]} → {st.Players[0].MaxHp}");

// ── 2. 同一个节点不能再被第二个人取走 ───────────────────────────
AwakenAt(st, "p2", nodes[0].Id);
var p2 = st.Player("p2")!;
Ok("同一节点不能重复觉醒（回声已被取走）", !p2.Awakened, $"{p2.Name} Awakened={p2.Awakened}");

// ── 3. 第二个人在另一个节点觉醒 ─────────────────────────────────
AwakenAt(st, "p2", nodes[1].Id);
Ok("第二个人在另一个节点也能觉醒", p2.Awakened, $"{p2.Name} Awakened={p2.Awakened}");
Ok("两人都觉醒后共鸣升到 2 层", st.Players.All(x => x.AwakenResonance == 2),
    string.Join(" / ", st.Players.Select(x => $"{x.Name}={x.AwakenResonance}")));
Ok("全队护甲 +2", st.Players[0].Armor == armorBefore[0] + 2, $"{armorBefore[0]} → {st.Players[0].Armor}");
Ok("全队最大生命 +10", st.Players[0].MaxHp == hpBefore[0] + 10, $"{hpBefore[0]} → {st.Players[0].MaxHp}");

// ── 4. 已经觉醒过的人不会再吃一次 ───────────────────────────────
// 注意：这里不能复用 AwakenAt —— 它会把 AP 重置成 3，就测不出"有没有被扣"了
st.ActivePlayerId = "p1";
p1.Ap = 3;
p1.NodeId = nodes[1].Id;
var apBefore = p1.Ap;
GameEngine.ApplyAction(st, new GameAction { Type = "interact", PlayerId = "p1", NodeId = nodes[1].Id });
Ok("已觉醒的角色重复交互不消耗 AP", p1.Ap == apBefore, $"AP {apBefore} → {p1.Ap}");

// ── 5. 觉醒技真的换上了 ─────────────────────────────────────────
var hasAwakenedSkill = p1.SkillIds.Any(id => id.EndsWith("_awakened"));
Ok("觉醒后技能换成觉醒版", hasAwakenedSkill, string.Join(",", p1.SkillIds));

Console.WriteLine($"\n===== {pass}/{total} 通过 =====");
return pass == total ? 0 : 1;
