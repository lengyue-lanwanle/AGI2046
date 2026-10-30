using System.Text.Json;
using System.Text.Json.Serialization;
using AGI2046.Rules;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using Microsoft.JSInterop;

// 单机版（GitHub Pages）：不起 Blazor 组件树，只把规则引擎挂到 window.agiBridge 上，
// 由 web/js/local-api.js 把 /api/* 的 fetch 转进来。
var builder = WebAssemblyHostBuilder.CreateDefault(args);
var app = builder.Build();

var js = app.Services.GetRequiredService<IJSRuntime>();
await js.InvokeVoidAsync("agiBridge.attach", DotNetObjectReference.Create(new Bridge()));

await app.RunAsync();

/// <summary>
/// 浏览器里的「本地服务器」。方法名与 app.js 的 8 个接口一一对应，
/// 返回的 JSON 形状必须和服务端 <c>Program.cs</c> 完全一致，否则前端解析不了。
/// </summary>
public sealed class Bridge
{
    private static readonly JsonSerializerOptions Opt = new(JsonSerializerDefaults.Web)
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DictionaryKeyPolicy = null,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    private GameState? _state;

    private string StateJson() => JsonSerializer.Serialize(_state, Opt);

    private static string Ok(string? stateJson = null) =>
        stateJson is null ? "{\"ok\":true}" : $"{{\"ok\":true,\"state\":{stateJson}}}";

    private static string Fail(string message, string? type = null) =>
        JsonSerializer.Serialize(new { ok = false, error = message, type }, Opt);

    [JSInvokable]
    public string Ping() => "pong";

    /// <summary>/api/meta：字段顺序无所谓，名字和嵌套必须与服务端一致。</summary>
    [JSInvokable]
    public string Meta(bool tutorialCompleted)
    {
        var meta = new
        {
            version = "0.25.0-pages",
            title = "零号协议 2046",
            subtitle = "A CO-OP CYBERPUNK TACTICAL RPG",
            offline = true,
            acts = GameData.Acts.Values.OrderBy(a => a.Act).ToList(),
            characters = GameData.Characters.Values.OrderBy(c => c.Id).ToList(),
            skills = GameData.Skills.Values.ToList(),
            gearTraits = GameData.Traits.Values.ToList(),
            gearTraitLimit = GearTraits.MaxActive,
            bossPreview = BossMechanics.Preview.Select(b => new
            {
                act = b.Act, bossId = b.BossId, name = b.Name, title = b.Title, hint = b.Hint, phase2 = b.Phase2
            }).ToList(),
            gear = GameData.Gear.Values.ToList(),
            gearSets = GameData.GearSets.Values.ToList(),
            enemies = GameData.Enemies.Values.ToList(),
            events = GameData.Events.Values.ToList(),
            consumables = GameData.Consumables.Values.ToList(),
            quests = GameData.Quests.Values.OrderBy(q => q.Id, StringComparer.Ordinal).ToList(),
            publicUrl = (string?)null,          // 单机版没有公网地址，前端会退回 location.origin
            enemyGroups = GameData.EnemyGroups,
            map = new
            {
                layers = MapProfile.Layers, lanes = MapProfile.Lanes, purgeMax = MapProfile.PurgeMax,
                canvasWidth = MapProfile.CanvasWidth, canvasHeight = MapProfile.CanvasHeight
            },
            startingMemory = 120,
            maxPlayers = 4,
            mutators = GameData.Mutators,
            unlocks = Unlocks.Catalog,
            dailySeed = GameData.DailySeed(DateTimeOffset.UtcNow),
            tutorial = new
            {
                steps = GameData.TutorialOrder,
                team = GameData.TutorialTeam,
                purgeMax = 12
            },
            tutorialCompleted
        };
        return JsonSerializer.Serialize(meta, Opt);
    }

    /// <summary>/api/new</summary>
    [JSInvokable]
    public string NewGame(string requestJson)
    {
        try
        {
            var request = JsonSerializer.Deserialize<NewGameRequest>(requestJson, Opt)
                          ?? new NewGameRequest { CharacterIds = { "gpt" }, Seed = 1 };
            request.Mode = GameMode.Standard;
            request.FirstRun ??= false;
            _state = GameEngine.NewGame(request);
            return Ok(StateJson());
        }
        catch (GameException ex) { return Fail(ex.Message, nameof(GameException)); }
        catch (Exception ex) { return Fail(ex.Message, ex.GetType().Name); }
    }

    /// <summary>/api/tutorial/new：教学局，不落盘（单机版本来也没盘）</summary>
    [JSInvokable]
    public string TutorialNew()
    {
        try
        {
            _state = GameEngine.NewGame(new NewGameRequest { Mode = GameMode.Tutorial });
            return Ok(StateJson());
        }
        catch (Exception ex) { return Fail(ex.Message, ex.GetType().Name); }
    }

    /// <summary>/api/action</summary>
    [JSInvokable]
    public string Act(string actionJson)
    {
        if (_state is null) return Fail("会话不存在或已过期。");
        try
        {
            var action = JsonSerializer.Deserialize<GameAction>(actionJson, Opt);
            if (action is null) return Fail("行动参数不对。");
            _state = GameEngine.ApplyAction(_state, action);
            return Ok(StateJson());
        }
        catch (GameException ex) { return Fail(ex.Message, nameof(GameException)); }
        catch (Exception ex) { return Fail(ex.Message, ex.GetType().Name); }
    }

    /// <summary>刷新页面后把 localStorage 里的存档塞回来（替代 /api/state）。</summary>
    [JSInvokable]
    public string Restore(string stateJson)
    {
        try
        {
            var state = JsonSerializer.Deserialize<GameState>(stateJson, Opt);
            if (state is null) return Fail("存档读不出来。");
            _state = state;
            CombatEngine.Resume(_state);
            CoopEngine.CheckTimeout(_state);
            return Ok();
        }
        catch (Exception ex) { return Fail(ex.Message, ex.GetType().Name); }
    }

    /// <summary>把内存里的状态原样吐出来（前端用它写 localStorage）。</summary>
    [JSInvokable]
    public string Dump() => _state is null ? Fail("没有进行中的对局。") : StateJson();

    [JSInvokable]
    public string Drop()
    {
        _state = null;
        return Ok();
    }
}
