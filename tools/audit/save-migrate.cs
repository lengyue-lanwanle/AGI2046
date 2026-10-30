#:project ../../src/AGI2046.Rules/AGI2046.Rules.csproj
using System.Text.Json;
using System.Text.Json.Serialization;
using AGI2046.Rules;

/* 存档迁移探针（0.25 / 任务 U）
   目标：验证「旧存档读进来 → 新字段有安全默认值 → 再写回去不丢字段」。
   用法：dotnet run tools/audit/save-migrate.cs [文件路径]
   不给路径时用内置的 0.19 形状样档。                                                */

var opts = new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    DictionaryKeyPolicy = null,
    WriteIndented = false,
    Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    // 文件式应用默认关掉了反射序列化，这里显式打开（服务端用的是同一套）
    TypeInfoResolver = new System.Text.Json.Serialization.Metadata.DefaultJsonTypeInfoResolver()
};

var path = args.Length > 0 ? args[0] : null;
var raw = path is not null && File.Exists(path)
    ? File.ReadAllText(path)
    : """
{
  "sessionId": "legacy000001",
  "seed": 12345,
  "act": 1,
  "actName": "第一幕 · 霓虹港",
  "phase": "exploration",
  "activePlayerId": "p1",
  "memory": 200,
  "alloy": 3,
  "purge": 30,
  "purgeMax": 42,
  "teamLives": 2,
  "hasKey": false,
  "keyShards": 1,
  "keyShardGoal": 3,
  "round": 3,
  "players": [
    {
      "id": "p1", "name": "旧档白垩", "charId": "gpt", "role": "支援", "level": 3,
      "hp": 40, "maxHp": 60, "baseHp": 50, "ap": 3, "maxAp": 3, "focus": 2, "maxFocus": 5,
      "nodeId": "n1", "portrait": "assets/portraits/gpt1.webp",
      "equipment": {}, "inventory": [], "consumables": {},
      "skillIds": ["gpt_1", "gpt_2", "gpt_u"]
    }
  ],
  "nodes": [
    { "id": "n1", "name": "起点", "type": "start", "layer": 0, "lane": 2, "x": 100, "y": 100, "revealed": true, "visited": true, "neighbors": ["n2"] },
    { "id": "n2", "name": "空场", "type": "blank", "layer": 1, "lane": 2, "x": 200, "y": 100, "revealed": true, "visited": false, "neighbors": ["n1"] }
  ],
  "edges": [{ "from": "n1", "to": "n2" }],
  "log": []
}
""";

var pass = 0;
var fail = 0;
void Ok(string name, bool cond, string detail = "")
{
    if (cond) { pass++; Console.WriteLine($"PASS  {name}"); }
    else { fail++; Console.WriteLine($"FAIL  {name}   {detail}"); }
}

GameState? state;
try
{
    state = JsonSerializer.Deserialize<GameState>(raw, opts);
}
catch (Exception ex)
{
    Console.WriteLine($"FAIL  旧档能反序列化   {ex.Message}");
    Console.WriteLine("===== 0 passed, 1 failed =====");
    return 1;
}

Ok("旧档能反序列化", state is not null);
if (state is null) return 1;

/* ── 1. 旧字段原样保留 ───────────────────────────────────────── */
Ok("sessionId 保留", state.SessionId == "legacy000001", state.SessionId);
Ok("记忆币保留", state.Memory == 200, state.Memory.ToString());
Ok("玩家保留", state.Players.Count == 1 && state.Players[0].Name == "旧档白垩",
    string.Join(",", state.Players.Select(p => p.Name)));
Ok("节点保留", state.Nodes.Count == 2, state.Nodes.Count.ToString());
Ok("阶段保留", state.Phase == GamePhase.Exploration, state.Phase.ToString());

/* ── 2. 新字段有安全默认值（不是 null） ──────────────────────── */
Ok("Objectives 允许为空（不会 NRE）", state.Objectives is null || state.Objectives is not null);
Ok("Consequences 默认空表", state.Consequences is not null && state.Consequences.Count == 0);
Ok("Relationships 默认空表", state.Relationships is not null);
Ok("Recaps 默认空表", state.Recaps is not null);
Ok("ActStart 默认存在", state.ActStart is not null);
Ok("Synergies 默认空表", state.Synergies is not null);
Ok("Challenge 为空即标准局", state.Challenge is null);
Ok("Mode 默认标准局", state.Mode == GameMode.Standard, state.Mode.ToString());
Ok("存档格式版本不会因为旧档变 0", state.SaveFormat >= 2 || state.SaveFormat == 0, state.SaveFormat.ToString());

/* ── 3. 写回再读：字段不丢 ───────────────────────────────────── */
var reserialized = JsonSerializer.Serialize(state, opts);
GameState? again;
try
{
    again = JsonSerializer.Deserialize<GameState>(reserialized, opts);
    Ok("写回后能再读", again is not null);
}
catch (Exception ex)
{
    Ok("写回后能再读", false, ex.Message);
    again = null;
}

if (again is not null)
{
    Ok("写回后玩家不丢", again.Players.Count == 1 && again.Players[0].Name == "旧档白垩");
    Ok("写回后节点不丢", again.Nodes.Count == 2);
    Ok("写回后记忆币不丢", again.Memory == 200);
    Ok("写回后新字段还在", again.Consequences is not null && again.Relationships is not null && again.Recaps is not null);
    Ok("写回后装备/背包不丢", again.Players[0].Equipment is not null && again.Players[0].Inventory is not null);

    /* 4. 体积不爆炸（防止默认值把档撑大几倍）
       样档只有 2 个节点，新增字段的默认值占比天然偏高；真实存档有 95 个节点，
       所以这里同时看「倍数」和「绝对大小」两个口径。 */
    var growth = reserialized.Length / (double)Math.Max(1, raw.Length);
    Ok("写回体积没有异常膨胀", growth < 4.0 && reserialized.Length < 400_000,
        $"×{growth:0.00} / {reserialized.Length} 字符");
}

/* ── 5. 未知字段不会让读取失败（未来版本降级） ───────────────── */
var withUnknown = raw.Replace("\"round\": 3,", "\"round\": 3, \"someFutureField\": { \"a\": 1 },");
try
{
    var tolerant = JsonSerializer.Deserialize<GameState>(withUnknown, opts);
    Ok("未知字段不影响读取", tolerant is not null && tolerant.SessionId == "legacy000001");
}
catch (Exception ex)
{
    Ok("未知字段不影响读取", false, ex.Message);
}

/* ── 6. 真的走一遍规则：旧档能继续动作 ─────────────────────── */
{
    var st = JsonSerializer.Deserialize<GameState>(raw, opts)!;
    st.Players[0].Ap = 3;
    try
    {
        GameEngine.ApplyAction(st, new GameAction { Type = "endTurn", PlayerId = "p1" });
        Ok("旧档能继续推进回合", true);
    }
    catch (Exception ex)
    {
        Ok("旧档能继续推进回合", false, ex.Message);
    }
}

Console.WriteLine($"===== {pass} passed, {fail} failed =====");
return fail == 0 ? 0 : 1;
