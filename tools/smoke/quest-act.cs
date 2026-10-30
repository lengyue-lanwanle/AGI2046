#:project ../../src/AGI2046.Rules/AGI2046.Rules.csproj

// 规则层冒烟：支线在换幕时的清理行为（无法通过 HTTP 直接构造 ActTransition）
// 用法：dotnet run tools/smoke/quest-act.cs
using AGI2046.Rules;

var pass = 0;
var total = 0;
void Ok(string name, bool cond, string detail = "")
{
    total++;
    if (cond) pass++;
    Console.WriteLine($"{(cond ? "PASS" : "FAIL")}  {name}{(string.IsNullOrEmpty(detail) ? "" : "  —  " + detail)}");
}

var state = GameEngine.NewGame(new NewGameRequest { CharacterIds = new() { "gpt" }, Seed = 12345 });
Ok("第一幕有 2 个残响", state.Nodes.Count(n => n.Type == NodeType.Echo) == 2);

state.Quests.Add(new QuestState { QuestId = "q1_relay", Status = "active", Progress = 0, Act = 1 });
state.Quests.Add(new QuestState { QuestId = "q1_sweep", Status = "claimed", Progress = 3, Act = 1 });
state.PendingQuestOffer = GameData.QuestForAct(1, 1);
state.QuestClaims = 1;

state.Phase = GamePhase.ActTransition;
GameEngine.AdvanceAct(state);

Ok("换幕后未领取的支线被清空", state.Quests.All(q => q.Status == "claimed"),
    string.Join(",", state.Quests.Select(q => q.QuestId + ":" + q.Status)));
Ok("已领取的记录保留", state.Quests.Any(q => q.QuestId == "q1_sweep"));
Ok("待回答的发放卡被清空", state.PendingQuestOffer is null);
Ok("已进入第二幕", state.Act == 2, state.ActName);
Ok("累计领取数保留", state.QuestClaims == 1, state.QuestClaims.ToString());
Ok("第二幕残响绑定第二幕支线",
    state.Nodes.Where(n => n.Type == NodeType.Echo).All(n => GameData.Quest(n.QuestId ?? "")?.Act == 2),
    string.Join(",", state.Nodes.Where(n => n.Type == NodeType.Echo).Select(n => n.QuestId)));

// 支线不影响主线：不接任何支线时，换幕后节点结构仍完整
Ok("第二幕仍有 95 个节点", state.Nodes.Count == 95, state.Nodes.Count.ToString());

Console.WriteLine();
Console.WriteLine($"{pass}/{total} 通过");
return pass == total ? 0 : 1;
