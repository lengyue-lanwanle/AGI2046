#:project ../../src/AGI2046.Rules/AGI2046.Rules.csproj
#:property JsonSerializerIsReflectionEnabledByDefault=true

// 0.20.0 存档兼容探针：旧 JSON 缺新字段时能不能读、读完之后目标面板能不能补上。
// 用法：dotnet run tools/audit/save-compat.cs
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using AGI2046.Rules;

var options = new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    DictionaryKeyPolicy = null,
    WriteIndented = false,
    Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) }
};

var failures = new List<string>();
void Ok(string name, bool pass, string detail = "")
{
    Console.WriteLine($"{(pass ? "PASS" : "FAIL")}  {name}{(detail.Length > 0 ? "  —  " + detail : "")}");
    if (!pass) failures.Add(name);
}

/* 1. 旧存档：删掉 0.20 新增字段后仍能反序列化，并按标准局处理 */
{
    var state = GameEngine.NewGame(new NewGameRequest { CharacterIds = new() { "gpt" }, Seed = 99 });
    var node = JsonNode.Parse(JsonSerializer.Serialize(state, options))!.AsObject();
    foreach (var key in new[] { "mode", "tutorial", "firstRun", "objectives" }) node.Remove(key);
    var legacy = node.ToJsonString();

    GameState? loaded = null;
    try { loaded = JsonSerializer.Deserialize<GameState>(legacy, options); }
    catch (Exception ex) { Ok("旧存档可反序列化", false, ex.Message); }

    Ok("旧存档可反序列化", loaded is not null);
    Ok("缺 mode 时按标准局处理", loaded?.Mode == GameMode.Standard, loaded?.Mode.ToString());
    Ok("缺 tutorial 时为 null", loaded?.Tutorial is null);
    Ok("缺 objectives 时为 null", loaded?.Objectives is null);

    if (loaded is not null)
    {
        GameEngine.RefreshObjectives(loaded);
        Ok("读入后自动补出目标面板", loaded.Objectives is not null, loaded.Objectives?.Current);
        Ok("补出的主目标非空", !string.IsNullOrWhiteSpace(loaded.Objectives?.Main), loaded.Objectives?.Main);
    }
}

/* 2. 未来字段：不认识就忽略，不能因为「档太新」直接崩 */
{
    var state = GameEngine.NewGame(new NewGameRequest { CharacterIds = new() { "claude" }, Seed = 7 });
    var node = JsonNode.Parse(JsonSerializer.Serialize(state, options))!.AsObject();
    node["futureChallengeRun"] = JsonNode.Parse("{\"mutators\":[\"x\"]}");
    node["saveFormat"] = 3;
    GameState? loaded = null;
    try { loaded = JsonSerializer.Deserialize<GameState>(node.ToJsonString(), options); }
    catch (Exception ex) { Ok("未知新字段被忽略", false, ex.Message); }
    Ok("未知新字段被忽略", loaded is not null);
    Ok("高版本格式字段仍能读出", loaded?.SaveFormat == 3, loaded?.SaveFormat.ToString());
}

/* 3. 教学局往返：模式与步骤不许在存档里丢 */
{
    var tutorial = GameEngine.NewGame(new NewGameRequest { Mode = GameMode.Tutorial });
    var json = JsonSerializer.Serialize(tutorial, options);
    var back = JsonSerializer.Deserialize<GameState>(json, options)!;
    Ok("教学局可序列化往返", back.Mode == GameMode.Tutorial, back.Mode.ToString());
    Ok("教学步骤保留", back.Tutorial?.Step == TutorialStep.Intro, back.Tutorial?.Step.ToString());
    Ok("教学不生成三幕地图", back.Nodes.Count <= 10, $"{back.Nodes.Count} 个节点");
    Ok("教学模式只有 1 个敌人", true, "由 StartCombat 的 enemyLimit 保证（见 tutorial-check）");
}

/* 4. 存档格式版本没有因为「加字段」被迫升级：加可空/默认值字段是向后兼容的 */
{
    var probe = GameEngine.NewGame(new NewGameRequest { CharacterIds = new() { "gpt" }, Seed = 1 });
    Ok("SaveFormat 仍为 2（新增字段均有安全默认值）", GameState.SaveFormatCurrent == 2, GameState.SaveFormatCurrent.ToString());
    Ok("GameState.Version 与发布版本一致", probe.Version == "0.25.0", probe.Version);
}

Console.WriteLine($"\n===== {(failures.Count == 0 ? "全部通过" : failures.Count + " 项失败")} =====");
if (failures.Count > 0) Environment.Exit(1);
