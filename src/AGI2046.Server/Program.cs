using System.Collections.Concurrent;
using System.IO.Compression;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using AGI2046.Rules;
using AGI2046.Server;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.Extensions.FileProviders;

// Windows 控制台默认是 GBK，中文日志会变成乱码。显式切到 UTF-8（失败也不影响运行）。
try { Console.OutputEncoding = Encoding.UTF8; } catch { /* 某些终端不支持 */ }

var builder = WebApplication.CreateBuilder(args);
// 双栈监听：Windows 上 localhost 可能先解析到 ::1，只绑 0.0.0.0 会让自动化测试和本机浏览器
// 在 IPv6 优先的环境里「连不上自己」。绑 [::] 同时接受 IPv4 映射地址，局域网/隧道不受影响。
var port = int.TryParse(Environment.GetEnvironmentVariable("AGI2046_PORT"), out var p) ? p : 5178;
builder.WebHost.UseUrls($"http://[::]:{port}");

// 前端是零构建的：1.2MB 的 JS/CSS 原样发出去，首屏要等它跑完。
// Kestrel 默认不压缩，这里开 Brotli（不支持时退 Gzip）：文本资源通常只剩 1/4。
builder.Services.AddResponseCompression(o =>
{
    o.EnableForHttps = true;   // 隧道回源是 http，但直连 https 的部署也要生效
    o.Providers.Add<BrotliCompressionProvider>();
    o.Providers.Add<GzipCompressionProvider>();
    // 图片/音频本来就压缩过，再压一遍只是白烧 CPU
    o.MimeTypes = new[]
    {
        "text/html", "text/css", "text/javascript", "text/plain", "text/xml",
        "application/javascript", "application/json", "application/xml",
        "image/svg+xml", "application/manifest+json"
    };
});
// 资源带 immutable 头，压缩只算一次；这里换 Optimal，app.js 从 94KB 降到 60KB 左右
builder.Services.Configure<BrotliCompressionProviderOptions>(o => o.Level = CompressionLevel.Optimal);
builder.Services.Configure<GzipCompressionProviderOptions>(o => o.Level = CompressionLevel.Optimal);

// 启动前先自己探一次端口：Kestrel 失败会先打一整页栈，再轮到我们的提示。
// 先探一次，端口被占时只留一行人和四条命令。
if (!PortAvailable(port))
{
    Console.Error.WriteLine();
    Console.Error.WriteLine($"端口 {port} 已经被占用——通常是上一次的服务窗口还开着。");
    Console.Error.WriteLine($"  · 先用浏览器打开 http://127.0.0.1:{port}/api/health 看看是不是已经在跑；");
    Console.Error.WriteLine($"  · Windows 查占用：netstat -ano | findstr :{port}   然后 taskkill /PID <PID> /F");
    Console.Error.WriteLine($"  · macOS / Linux：lsof -i :{port} 然后 kill <PID>");
    Console.Error.WriteLine($"  · 想换端口：先设置环境变量 AGI2046_PORT（例如 {port + 2}）再启动。");
    Console.Error.WriteLine();
    Environment.Exit(2);
}


// 请求体绑定走的是 Http.Json 选项，不是下面那份 Results.Json 用的 options。
// 0.21 的 mode / difficulty 是枚举，没有这个转换器会直接 400 且响应体为空。
builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
});

var jsonOptions = new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    DictionaryKeyPolicy = null,
    WriteIndented = false,
    Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) }
};

var app = builder.Build();

var webRoot = Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, "..", "..", "web"));
if (!Directory.Exists(webRoot))
    webRoot = Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, "web"));
var fileProvider = new PhysicalFileProvider(webRoot);

// 根路径直接改写到 index.html，而不是用 UseDefaultFiles 的 302。
// UseDefaultFiles 重定向时会**丢掉查询串**，导致 ?bot=1 / ?cg=intro / ?story=off 全部失效——
// 这不是小事：自动化测试靠 bot=1 跳过剧情，深链靠 cg=intro 直接放开场。
app.Use(async (ctx, next) =>
{
    if (ctx.Request.Path == "/")
    {
        ctx.Request.Path = "/index.html";
    }
    await next();
});
app.UseResponseCompression();
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = fileProvider,
    OnPrepareResponse = ctx =>
    {
        var headers = ctx.Context.Response.Headers;
        var name = ctx.File.Name;
        var versioned = ctx.Context.Request.Query.ContainsKey("v");
        if (name.EndsWith(".html", StringComparison.OrdinalIgnoreCase))
        {
            // 入口页永远回源：?v= 变了要立刻生效
            headers.CacheControl = "no-cache";
        }
        else if (versioned)
        {
            // index.html 里所有 ?v= 的引用都靠 bump-web-version.mjs 升级，可以放心长缓存
            headers.CacheControl = "public,max-age=31536000,immutable";
        }
        else
        {
            // 图片/音频没有版本号：缓存一天。换图时想立刻生效，加个 ?v= 或改名。
            headers.CacheControl = "public,max-age=86400";
        }
    }
});

// 数据目录不能靠 cwd 猜：`dotnet run` 和直接跑 dll 的 ContentRoot 不一样，
// 之前就出现过从项目根启动、把存档写进 D:\data（别的程序的目录）的事故。
// 现在优先读 AGI2046_DATA，否则从内容根往上找带 src/AGI2046.Rules 的项目根。
var dataRoot = ResolveDataRoot(builder.Environment.ContentRootPath);
var saveDir = Path.Combine(dataRoot, "sessions");
Directory.CreateDirectory(saveDir);

static string ResolveDataRoot(string contentRoot)
{
    var env = Environment.GetEnvironmentVariable("AGI2046_DATA");
    if (!string.IsNullOrWhiteSpace(env)) return Path.GetFullPath(env);
    var dir = new DirectoryInfo(contentRoot);
    while (dir is not null)
    {
        var marker = Path.Combine(dir.FullName, "src", "AGI2046.Rules", "AGI2046.Rules.csproj");
        if (File.Exists(marker)) return Path.GetFullPath(Path.Combine(dir.FullName, "data"));
        dir = dir.Parent;
    }
    return Path.GetFullPath(Path.Combine(contentRoot, "..", "..", "data"));
}

var store = new SessionStore(saveDir, jsonOptions);
var runLog = new RunLog(Path.Combine(dataRoot, "runs.jsonl"), jsonOptions);
var profile = new ProfileStore(Path.Combine(dataRoot, "profile.json"), jsonOptions);
var sessions = new ConcurrentDictionary<string, GameSession>();
var loadReport = store.LoadAll();
foreach (var restored in loadReport.Loaded)
{
    sessions[restored.SessionId] = new GameSession(restored);
    app.Logger.LogInformation("restored session {Id} (act {Act}, phase {Phase}, format {Format})",
        restored.SessionId, restored.Act, restored.Phase, restored.SaveFormat);
}
foreach (var note in loadReport.Upgraded)
    app.Logger.LogWarning("存档已升级到格式 {Format}：{File}", GameState.SaveFormatCurrent, note);
foreach (var note in loadReport.Quarantined)
    app.Logger.LogWarning("存档已隔离（无法加载，可到 data/sessions/quarantine 手工恢复）：{File}", note);
// 保留 200 份而不是 30：自动化测试每跑一轮都会开几十局新档，
// 30 份的上限会把玩家真正在玩的那一局一起清掉（0.20 之前就发生过）。
store.Prune(keep: 200);

/* ── 联机房间 ─────────────────────────────────────────────────────── */
var roomDir = Path.Combine(dataRoot, "rooms");
var roomStore = new RoomStore(roomDir, jsonOptions);
var rooms = new ConcurrentDictionary<string, Room>(StringComparer.OrdinalIgnoreCase);
// 联机剧情游标：只存内存，不进存档。房主每推进一句上报一次，其他人轮询跟随。
// 为什么不塞进 GameState：游标每句都变，塞进去会让 revision 一直跳，存档也被无意义地写盘。
var storyCues = new ConcurrentDictionary<string, StoryCue>(StringComparer.OrdinalIgnoreCase);
foreach (var restored in roomStore.LoadAll())
{
    rooms[restored.Code] = restored;
    app.Logger.LogInformation("restored room {Code} (phase {Phase}, seats {Seats})",
        restored.Code, restored.Phase, restored.Seats.Count);
}
roomStore.Prune(keep: 20);

RoomView ViewOf(Room room)
{
    var revision = 0;
    if (room.SessionId is not null && sessions.TryGetValue(room.SessionId, out var bound))
        revision = bound.State.Revision;
    return new RoomView(
        room.Code,
        room.Phase,
        room.SessionId,
        revision,
        room.AllReady,
        room.SeatCount,
        Room.MaxSeats,
        room.HostSeat?.PlayerId,
        room.Seats.Select(x => new RoomSeatView(
            x.PlayerId, x.CharacterId, x.Name, x.Occupied, room.IsOnline(x), x.IsHost, x.Ready)).ToList());
}

/// <summary>这一局是不是某个联机房间在打。是的话，所有接口都必须带房间凭证。</summary>
Room? RoomOfSession(string? sessionId)
{
    if (string.IsNullOrWhiteSpace(sessionId)) return null;
    return rooms.Values.FirstOrDefault(r => string.Equals(r.SessionId, sessionId, StringComparison.Ordinal));
}

string NewRoomCode()
{
    const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    for (var attempt = 0; attempt < 200; attempt++)
    {
        // 6 位：公网可访问时不能被枚举（32^6 ≈ 10 亿）
        var code = string.Concat(Enumerable.Range(0, 6).Select(_ => alphabet[Random.Shared.Next(alphabet.Length)]));
        if (!rooms.ContainsKey(code)) return code;
    }
    throw new GameException("房间码暂时耗尽，请稍后再试。");
}

/* 公网访问限速：隧道会把所有人变成同一个出口 IP，所以按连接来源 + 窗口计数 */
var rateBuckets = new ConcurrentDictionary<string, (DateTime Start, int Count)>();

bool TooMany(string bucket, string client, int limit, TimeSpan window)
{
    var key = $"{bucket}|{client}";
    var now = DateTime.UtcNow;
    var entry = rateBuckets.AddOrUpdate(
        key,
        _ => (now, 1),
        (_, old) => (now - old.Start) > window ? (now, 1) : (old.Start, old.Count + 1));
    return entry.Count > limit;
}

string ClientOf(HttpContext http)
{
    var cf = http.Request.Headers["CF-Connecting-IP"].FirstOrDefault();
    if (!string.IsNullOrWhiteSpace(cf)) return cf!;
    var xff = http.Request.Headers["X-Forwarded-For"].FirstOrDefault();
    if (!string.IsNullOrWhiteSpace(xff)) return xff!.Split(',')[0].Trim();
    return http.Connection.RemoteIpAddress?.ToString() ?? "unknown";
}

/* 隧道地址（可选）：tools/tunnel.mjs 会写入 data/tunnel.json */
var tunnelFile = Path.Combine(dataRoot, "tunnel.json");
string? PublicUrl()
{
    try
    {
        if (!File.Exists(tunnelFile)) return null;
        using var doc = JsonDocument.Parse(File.ReadAllText(tunnelFile));
        return doc.RootElement.TryGetProperty("url", out var url) ? url.GetString() : null;
    }
    catch
    {
        return null;
    }
}

app.MapGet("/api/health", () => Results.Json(new
{
    ok = true,
    version = "0.25.0",
    saveFormat = GameState.SaveFormatCurrent,
    lastSaveError = store.LastError,
    publicUrl = PublicUrl(),
    tutorialCompleted = profile.Data.TutorialCompleted,
    time = DateTimeOffset.UtcNow
}, jsonOptions));

/* ── 玩家档案（0.20）────────────────────────────────────────────────
   只存「看过教学没有」这类跨局状态。正式存档在 data/sessions/，两者互不影响。
   放服务端而不是 localStorage：换浏览器、清缓存后不该重新被当成新玩家。
   ─────────────────────────────────────────────────────────────────── */
app.MapGet("/api/profile", () => Results.Json(new
{
    tutorialCompleted = profile.Data.TutorialCompleted,
    tutorialCompletedAt = profile.Data.TutorialCompletedAt,
    firstRun = !profile.Data.TutorialCompleted,
    unlockedIds = profile.Data.UnlockedIds,
    bestGrade = profile.Data.BestGrade,
    bestScore = profile.Data.BestScore,
    runs = profile.Data.Runs,
    victories = profile.Data.Victories
}, jsonOptions));

app.MapPost("/api/profile/tutorial-complete", () =>
{
    profile.MarkTutorialCompleted();
    return Results.Json(new { ok = true, tutorialCompleted = true }, jsonOptions);
});

app.MapGet("/api/whoami", (HttpContext http) => Results.Json(new
{
    client = ClientOf(http),
    remote = http.Connection.RemoteIpAddress?.ToString(),
    forwardedFor = http.Request.Headers["X-Forwarded-For"].FirstOrDefault(),
    host = http.Request.Host.Value,
    scheme = http.Request.Scheme
}, jsonOptions));

app.MapPost("/api/room/create", (HttpContext http, RoomCreateRequest request) =>
{
    if (TooMany("room-create", ClientOf(http), 10, TimeSpan.FromHours(1)))
        return Results.Json(new ApiError { Error = "建房太频繁了，休息一下再试。" }, jsonOptions, statusCode: 429);

    var hostToken = Guid.NewGuid().ToString("N");
    var room = new Room
    {
        Code = NewRoomCode(),
        Seed = request.Seed != 0 ? request.Seed : Environment.TickCount,
        Phase = "lobby"
    };
    // 房主只负责建房和开局；角色由每个人进房后自己选
    var hostSeat = room.AcquireSeat()!;
    hostSeat.Token = hostToken;
    hostSeat.IsHost = true;
    hostSeat.Name = string.IsNullOrWhiteSpace(request.HostName) ? "房主" : request.HostName!.Trim();
    hostSeat.LastSeenUtc = DateTime.UtcNow;

    rooms[room.Code] = room;
    roomStore.Save(room);
    roomStore.Prune(keep: 20);
    return Results.Json(new RoomCreateResult(room.Code, hostToken, hostSeat.PlayerId, ViewOf(room)), jsonOptions);
});

app.MapGet("/api/room/{code}", (HttpContext http, string code) =>
{
    if (TooMany("room-lookup", ClientOf(http), 20, TimeSpan.FromMinutes(1)))
        return Results.Json(new ApiError { Error = "查询太频繁了，请稍后再试。" }, jsonOptions, statusCode: 429);
    if (!rooms.TryGetValue(code.ToUpperInvariant(), out var room))
        return Results.Json(new ApiError { Error = "房间不存在。" }, jsonOptions, statusCode: 404);
    lock (room.Sync) return Results.Json(new { room = ViewOf(room) }, jsonOptions);
});

app.MapPost("/api/room/{code}/join", (HttpContext http, string code, RoomJoinRequest request) =>
{
    if (TooMany("room-join", ClientOf(http), 30, TimeSpan.FromMinutes(1)))
        return Results.Json(new ApiError { Error = "尝试太频繁了，请一分钟后再试。" }, jsonOptions, statusCode: 429);
    if (!rooms.TryGetValue(code.ToUpperInvariant(), out var room))
        return Results.Json(new ApiError { Error = "房间不存在。" }, jsonOptions, statusCode: 404);
    lock (room.Sync)
    {
        // 带旧 token = 重连，直接放行
        var existing = room.SeatByToken(request.Token);
        if (existing is not null)
        {
            if (!string.IsNullOrWhiteSpace(request.Name)) existing.Name = request.Name!.Trim();
            existing.LastSeenUtc = DateTime.UtcNow;
            roomStore.Save(room);
            return Results.Json(new RoomJoinResult(room.Code, existing.Token!, existing.PlayerId, ViewOf(room)), jsonOptions);
        }

        if (room.Phase != "lobby")
            return Results.Json(new ApiError { Error = "对局已经开始，不能再加入。" }, jsonOptions, statusCode: 400);
        var seat = room.AcquireSeat();
        if (seat is null)
            return Results.Json(new ApiError { Error = $"房间满了（最多 {Room.MaxSeats} 人）。" }, jsonOptions, statusCode: 409);
        seat.Token = Guid.NewGuid().ToString("N");
        seat.Name = string.IsNullOrWhiteSpace(request.Name) ? seat.PlayerId : request.Name!.Trim();
        seat.LastSeenUtc = DateTime.UtcNow;
        roomStore.Save(room);
        return Results.Json(new RoomJoinResult(room.Code, seat.Token, seat.PlayerId, ViewOf(room)), jsonOptions);
    }
});

app.MapPost("/api/room/{code}/character", (string code, RoomCharacterRequest request) =>
{
    if (!rooms.TryGetValue(code.ToUpperInvariant(), out var room))
        return Results.Json(new ApiError { Error = "房间不存在。" }, jsonOptions, statusCode: 404);
    lock (room.Sync)
    {
        if (room.Phase != "lobby")
            return Results.Json(new ApiError { Error = "对局已经开始，不能再换角色。" }, jsonOptions, statusCode: 400);
        var seat = room.SeatByToken(request.Token);
        if (seat is null)
            return Results.Json(new ApiError { Error = "你不是这个房间的成员。" }, jsonOptions, statusCode: 403);
        var characterId = request.CharacterId?.Trim() ?? "";
        if (!GameData.Characters.ContainsKey(characterId))
            return Results.Json(new ApiError { Error = "没有这个角色。" }, jsonOptions, statusCode: 400);
        if (room.OccupiedSeats.Any(s => !ReferenceEquals(s, seat) && s.CharacterId == characterId))
            return Results.Json(new ApiError { Error = "这个角色已经被别人选了，换一个吧。" }, jsonOptions, statusCode: 409);
        seat.CharacterId = characterId;
        seat.LastSeenUtc = DateTime.UtcNow;
        roomStore.Save(room);
        return Results.Json(new { ok = true, room = ViewOf(room) }, jsonOptions);
    }
});

app.MapPost("/api/room/{code}/kick", (string code, RoomKickRequest request) =>
{
    if (!rooms.TryGetValue(code.ToUpperInvariant(), out var room))
        return Results.Json(new ApiError { Error = "房间不存在。" }, jsonOptions, statusCode: 404);
    lock (room.Sync)
    {
        var host = room.SeatByToken(request.Token);
        if (host is null)
            return Results.Json(new ApiError { Error = "你不是这个房间的成员。" }, jsonOptions, statusCode: 403);
        if (!host.IsHost)
            return Results.Json(new ApiError { Error = "只有房主能踢人。" }, jsonOptions, statusCode: 403);
        var target = room.Seats.FirstOrDefault(s => s.PlayerId == request.PlayerId);
        if (target is null || !target.Occupied)
            return Results.Json(new ApiError { Error = "这个位置已经没人了。" }, jsonOptions, statusCode: 400);
        if (ReferenceEquals(target, host))
            return Results.Json(new ApiError { Error = "不能踢自己。" }, jsonOptions, statusCode: 400);

        var kickedName = target.Name ?? target.PlayerId;
        if (room.Phase == "lobby")
        {
            room.Vacate(target);           // 大厅：位置清空，可以补人
        }
        else
        {
            target.Token = null;           // 对局中：断开操作权，角色留在队伍里（房主可跳过他的回合）
            target.Name = $"{kickedName}（已移出）";
            target.LastSeenUtc = default;
        }
        roomStore.Save(room);
        return Results.Json(new { ok = true, kicked = request.PlayerId, room = ViewOf(room) }, jsonOptions);
    }
});

app.MapPost("/api/room/{code}/start", (string code, RoomTokenRequest request) =>
{
    if (!rooms.TryGetValue(code.ToUpperInvariant(), out var room))
        return Results.Json(new ApiError { Error = "房间不存在。" }, jsonOptions, statusCode: 404);
    lock (room.Sync)
    {
        if (room.Phase != "lobby")
            return Results.Json(new ApiError { Error = "对局已经开始。" }, jsonOptions, statusCode: 400);
        var seat = room.SeatByToken(request.Token);
        if (seat is null)
            return Results.Json(new ApiError { Error = "你不是这个房间的成员。" }, jsonOptions, statusCode: 403);
        if (!seat.IsHost)
            return Results.Json(new ApiError { Error = "只有房主能开始。" }, jsonOptions, statusCode: 403);
        if (!room.AllReady)
            return Results.Json(new ApiError { Error = "还有玩家没选角色。" }, jsonOptions, statusCode: 400);

        var tokenMap = room.CompactSeats();
        var characterIds = room.Seats.Select(s => s.CharacterId!).ToList();
        var state = GameEngine.NewGame(new NewGameRequest
        {
            CharacterIds = characterIds,
            Seed = room.Seed
        });
        var session = new GameSession(state);
        sessions[state.SessionId] = session;
        store.Save(state);
        room.SessionId = state.SessionId;
        room.Phase = "playing";
        foreach (var s in room.Seats) s.LastSeenUtc = DateTime.UtcNow;
        roomStore.Save(room);
        var myPlayerId = tokenMap.TryGetValue(seat.Token ?? "", out var mapped) ? mapped : seat.PlayerId;
        return Results.Json(new
        {
            ok = true,
            room = ViewOf(room),
            state = (object)state,
            myPlayerId
        }, jsonOptions);
    }
});

app.MapPost("/api/room/{code}/leave", (string code, RoomTokenRequest request) =>
{
    if (!rooms.TryGetValue(code.ToUpperInvariant(), out var room))
        return Results.Json(new { ok = true }, jsonOptions);
    lock (room.Sync)
    {
        var seat = room.SeatByToken(request.Token);
        if (seat is null) return Results.Json(new { ok = true }, jsonOptions);
        var wasHost = seat.IsHost;
        if (room.Phase == "lobby")
        {
            room.Vacate(seat);   // 大厅里离开：座位清空，留给后来的人
        }
        else
        {
            seat.Token = null;   // 对局中离开：保留角色，只标记离线
            seat.LastSeenUtc = default;
            seat.IsHost = false;
        }

        if (!room.Seats.Any(s => s.Occupied))
        {
            rooms.TryRemove(room.Code, out _);
            roomStore.Delete(room.Code);
            return Results.Json(new { ok = true, disbanded = true }, jsonOptions);
        }
        if (wasHost)
        {
            var next = room.Seats.FirstOrDefault(s => s.Occupied);
            if (next is not null) next.IsHost = true;
        }
        roomStore.Save(room);
        return Results.Json(new { ok = true, room = ViewOf(room) }, jsonOptions);
    }
});

app.MapGet("/api/room/{code}/state", (string code, string? token, int? since) =>
{
    if (!rooms.TryGetValue(code.ToUpperInvariant(), out var room))
        return Results.Json(new ApiError { Error = "房间不存在。" }, jsonOptions, statusCode: 404);
    lock (room.Sync)
    {
        var seat = room.SeatByToken(token);
        if (seat is null)
            return Results.Json(new ApiError { Error = "你已经不在这个房间里了。" }, jsonOptions, statusCode: 403);
        seat.LastSeenUtc = DateTime.UtcNow;

        if (room.Phase != "playing" || room.SessionId is null)
            return Results.Json(new { room = ViewOf(room), state = (object?)null, myPlayerId = seat.PlayerId, revision = 0 }, jsonOptions);
        if (!sessions.TryGetValue(room.SessionId, out var bound))
            return Results.Json(new { room = ViewOf(room), state = (object?)null, gone = true, myPlayerId = seat.PlayerId }, jsonOptions);

        // 存档里可能停在敌方回合中途：轮询/刷新时把没跑完的敌方回合补完
        CombatEngine.Resume(bound.State);
        CoopEngine.CheckTimeout(bound.State);

        // 修订号没变就不传状态，省带宽
        if (since is int known && known == bound.State.Revision)
            return Results.StatusCode(204);

        return Results.Json(new
        {
            room = ViewOf(room),
            state = bound.State,
            myPlayerId = seat.PlayerId,
            revision = bound.State.Revision
        }, jsonOptions);
    }
});

app.MapPost("/api/room/{code}/cue", (string code, RoomCueRequest request) =>
{
    if (!rooms.TryGetValue(code.ToUpperInvariant(), out var room))
        return Results.Json(new ApiError { Error = "房间不存在。" }, jsonOptions, statusCode: 404);
    lock (room.Sync)
    {
        var seat = room.SeatByToken(request.Token);
        if (seat is null)
            return Results.Json(new ApiError { Error = "你已经不在这个房间里了。" }, jsonOptions, statusCode: 403);
        if (string.IsNullOrWhiteSpace(request.SceneId))
            return Results.Json(new ApiError { Error = "缺少场景。" }, jsonOptions, statusCode: 400);
        var cue = new StoryCue
        {
            SceneId = request.SceneId!,
            Line = Math.Max(0, request.Line),
            By = seat.PlayerId ?? "",
            At = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        };
        storyCues[code.ToUpperInvariant()] = cue;
        return Results.Json(new { ok = true, cue }, jsonOptions);
    }
});

app.MapGet("/api/room/{code}/cue", (string code) =>
    Results.Json(new
    {
        cue = storyCues.TryGetValue(code.ToUpperInvariant(), out var c) ? c : null
    }, jsonOptions));

app.MapGet("/api/runs", (int? limit) =>
    Results.Json(new { runs = runLog.Recent(Math.Clamp(limit ?? 8, 1, 50)) }, jsonOptions));

app.MapGet("/api/meta", () =>
{
    var meta = new
    {
        version = "0.25.0",
        title = "零号协议 2046",
        subtitle = "A CO-OP CYBERPUNK TACTICAL RPG",
        acts = GameData.Acts.Values.OrderBy(a => a.Act).ToList(),
        characters = GameData.Characters.Values.OrderBy(c => c.Id).ToList(),
        skills = GameData.Skills.Values.ToList(),
        gearTraits = GameData.Traits.Values.ToList(),
        gearTraitLimit = GearTraits.MaxActive,
        bossPreview = BossMechanics.Preview.Select(b => new { act = b.Act, bossId = b.BossId, name = b.Name, title = b.Title, hint = b.Hint, phase2 = b.Phase2 }).ToList(),
        gear = GameData.Gear.Values.ToList(),
        gearSets = GameData.GearSets.Values.ToList(),
        enemies = GameData.Enemies.Values.ToList(),
        events = GameData.Events.Values.ToList(),
        consumables = GameData.Consumables.Values.ToList(),
        quests = GameData.Quests.Values.OrderBy(q => q.Id, StringComparer.Ordinal).ToList(),
        publicUrl = PublicUrl(),
        enemyGroups = GameData.EnemyGroups,
        map = new { layers = MapProfile.Layers, lanes = MapProfile.Lanes, purgeMax = MapProfile.PurgeMax,
                    canvasWidth = MapProfile.CanvasWidth, canvasHeight = MapProfile.CanvasHeight },
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
        tutorialCompleted = profile.Data.TutorialCompleted
    };
    return Results.Json(meta, jsonOptions);
});

app.MapPost("/api/new", (HttpContext http, NewGameRequest request) =>
{
    // 60/分钟：正常人开不到这么快，但连续跑测试套件时 30 会误伤（0.25.1 实测）。
    if (TooMany("session-new", ClientOf(http), 60, TimeSpan.FromMinutes(1)))
        return Results.Json(new ApiError { Error = "开局太频繁了，请稍后再试。" }, jsonOptions, statusCode: 429);
    try
    {
        if (request.Mode == GameMode.Challenge)
        {
            // 挑战局：先按档案里的解锁列表校验变异，再交给规则层
            if (request.Challenge is null)
                return Results.Json(new ApiError { Error = "缺少挑战配置。" }, jsonOptions, statusCode: 400);
            var seed = request.Challenge.Seed != 0 ? request.Challenge.Seed : Environment.TickCount;
            request.PreparedChallenge = ChallengeEngine.BuildRun(request.Challenge, profile.UnlockedSet(), seed);
            request.FirstRun = false;
        }
        else
        {
            request.Mode = GameMode.Standard;
            request.FirstRun ??= !profile.Data.TutorialCompleted;
        }
        var state = GameEngine.NewGame(request);
        var session = new GameSession(state);
        sessions[state.SessionId] = session;
        store.Save(state);
        store.Prune(keep: 200);   // 同启动时：别让高频开局把玩家正在玩的档挤掉
        return Json(state, jsonOptions);
    }
    catch (GameException ex)
    {
        return Results.Json(new ApiError { Error = ex.Message }, jsonOptions, statusCode: 400);
    }
    catch (Exception ex)
    {
        app.Logger.LogError(ex, "new game failed");
        return Results.Json(new ApiError { Error = "开局失败。", Detail = ex.Message }, jsonOptions, statusCode: 500);
    }
});

/* ── 教学模式（0.20）─────────────────────────────────────────────────
   教学局**不落盘**：它是消耗品，失败/重启都可以重来，不该占正式存档位。
   它在 sessions 字典里正常参与 /api/action，只是不写 data/sessions/。
   ─────────────────────────────────────────────────────────────────── */
app.MapPost("/api/tutorial/new", (HttpContext http) =>
{
    if (TooMany("tutorial-new", ClientOf(http), 60, TimeSpan.FromMinutes(1)))
        return Results.Json(new ApiError { Error = "重开太频繁了，稍等一下。" }, jsonOptions, statusCode: 429);
    try
    {
        var state = GameEngine.NewGame(new NewGameRequest { Mode = GameMode.Tutorial });
        sessions[state.SessionId] = new GameSession(state);
        return Json(state, jsonOptions);
    }
    catch (GameException ex)
    {
        return Results.Json(new ApiError { Error = ex.Message }, jsonOptions, statusCode: 400);
    }
});

app.MapPost("/api/action", (HttpContext http, ActionRequest request) =>
{
    if (string.IsNullOrWhiteSpace(request.SessionId) || !sessions.TryGetValue(request.SessionId, out var session))
        return Results.Json(new ApiError { Error = "会话不存在或已过期。" }, jsonOptions, statusCode: 404);

    // 联机：房间成员身份 + 只能操作自己的角色
    Room? room = null;
    RoomSeat? seat = null;
    if (!string.IsNullOrWhiteSpace(request.RoomCode))
    {
        if (!rooms.TryGetValue(request.RoomCode!.ToUpperInvariant(), out room))
            return Results.Json(new ApiError { Error = "房间不存在。" }, jsonOptions, statusCode: 404);
        seat = room.SeatByToken(request.Token);
        if (seat is null)
            return Results.Json(new ApiError { Error = "你不是这个房间的成员。" }, jsonOptions, statusCode: 403);
        if (!string.Equals(room.SessionId, request.SessionId, StringComparison.Ordinal))
            return Results.Json(new ApiError { Error = "房间与对局不匹配。" }, jsonOptions, statusCode: 403);
        seat.LastSeenUtc = DateTime.UtcNow;
    }
    else if (RoomOfSession(request.SessionId) is not null)
    {
        // 这一局是房间里打的：sessionId 下发给每个成员，光凭它不能操作。
        // （旧版只看 roomCode，客人把 roomCode 去掉就能替房主结束回合。）
        return Results.Json(new ApiError { Error = "这是联机对局，请带上房间凭证（房间码 + 座位 token）。" }, jsonOptions, statusCode: 403);
    }

    lock (session.Sync)
    {
        try
        {
            // 请求级幂等：同一个 requestId 只应用一次。重试拿到的是当前状态，不是「再执行一次」。
            // 先于修订号判断，否则重试会因为 revision 前进而拿到 409。
            var requestId = string.IsNullOrWhiteSpace(request.RequestId)
                ? http.Request.Headers["Idempotency-Key"].FirstOrDefault()
                : request.RequestId;
            if (session.WasApplied(requestId))
            {
                http.Response.Headers["X-Idempotent-Replay"] = "1";
                http.Response.Headers["X-State-Revision"] = session.State.Revision.ToString();
                return Json(session.State, jsonOptions);
            }

            // 修订号保护：避免多标签/重试把回合推进两次（旧状态覆盖新状态）
            if (request.ExpectedRevision is int expected && expected != session.State.Revision)
            {
                http.Response.Headers["X-State-Revision"] = session.State.Revision.ToString();
                return Results.Json(new ApiError
                {
                    Error = "状态已经变了，请刷新后再操作。",
                    Detail = $"expected revision {expected}, current {session.State.Revision}"
                }, jsonOptions, statusCode: 409);
            }

            if (seat is not null)
            {
                if (request.Action?.Type == "forceSkip")
                {
                    if (!seat.IsHost)
                        return Results.Json(new ApiError { Error = "只有房主能跳过当前回合。" }, jsonOptions, statusCode: 403);
                    // 战斗中跳过的是“当前战斗单位的回合”，探索中才是推进轮次
                    if (session.State.Phase == GamePhase.Combat)
                        CombatEngine.SkipActiveUnitTurn(session.State);
                    else
                        GameEngine.AdvanceExplorationTurn(session.State);
                    session.State.Revision++;
                    session.Remember(requestId, session.State.Revision);
                    if (!store.Save(session.State)) http.Response.Headers["X-Save-Status"] = "failed";
                    http.Response.Headers["X-State-Revision"] = session.State.Revision.ToString();
                    if (session.State.Phase is GamePhase.Victory or GamePhase.Defeat)
                    {
                        // 教学局不写「最近行动」，也不进档案：它不计分、不算场次
                        if (session.State.Mode != GameMode.Tutorial)
                        {
                            runLog.Record(session.State);
                            profile.MergeRun(session.State);
                        }
                        if (room is not null) { room.Phase = "finished"; roomStore.Save(room); }
                    }
                    return Json(session.State, jsonOptions);
                }
                if (!string.IsNullOrWhiteSpace(request.Action?.PlayerId) &&
                    request.Action!.PlayerId != seat.PlayerId)
                    return Results.Json(new ApiError { Error = "不能操作其他玩家的角色。" }, jsonOptions, statusCode: 403);
                if (session.State.Phase == GamePhase.Combat && session.State.Combat is { } combat)
                {
                    var activeUnit = combat.Units.FirstOrDefault(u => u.Id == combat.ActiveUnitId);
                    if (activeUnit is { Side: Side.Player } && activeUnit.PlayerId != seat.PlayerId)
                        return Results.Json(new ApiError { Error = "还没有轮到你。" }, jsonOptions, statusCode: 403);
                }
            }

            GameEngine.ApplyAction(session.State, request.Action ?? new GameAction());
            session.Remember(requestId, session.State.Revision);
            // 教学局不写盘：它不该占正式存档位，服务端重启后重开一局即可
            var saved = session.State.Mode == GameMode.Tutorial || store.Save(session.State);
            if (!saved) http.Response.Headers["X-Save-Status"] = "failed";
            http.Response.Headers["X-State-Revision"] = session.State.Revision.ToString();

            // 教学完成（或跳过）即记档：标题页不再把它当成新玩家，但入口一直保留
            if (session.State.Mode == GameMode.Tutorial && session.State.Tutorial?.Completed == true &&
                !profile.Data.TutorialCompleted)
                profile.MarkTutorialCompleted();

            if (session.State.Phase is GamePhase.Victory or GamePhase.Defeat)
            {
                // 教学失败/通关都不该出现在标题页「最近行动」里，也不该计入场次
                if (session.State.Mode != GameMode.Tutorial)
                {
                    runLog.Record(session.State);
                    profile.MergeRun(session.State);
                }
                if (room is not null) { room.Phase = "finished"; roomStore.Save(room); }
            }
            return Json(session.State, jsonOptions);
        }
        catch (GameException ex)
        {
            return Results.Json(new ApiError { Error = ex.Message }, jsonOptions, statusCode: 400);
        }
        catch (Exception ex)
        {
            app.Logger.LogError(ex, "action failed: {Type}", request.Action?.Type);
            return Results.Json(new ApiError { Error = "行动执行失败。", Detail = ex.Message }, jsonOptions, statusCode: 500);
        }
    }
});

app.MapGet("/api/state", (string sessionId, string? token) =>
{
    if (string.IsNullOrWhiteSpace(sessionId) || !sessions.TryGetValue(sessionId, out var session))
        return Results.Json(new ApiError { Error = "会话不存在或已过期。" }, jsonOptions, statusCode: 404);
    // 联机对局：必须带座位 token（sessionId 是公开的，不能当凭证）
    var owner = RoomOfSession(sessionId);
    if (owner is not null && owner.SeatByToken(token) is null)
        return Results.Json(new ApiError { Error = "这是联机对局，缺少有效的座位凭证。" }, jsonOptions, statusCode: 403);
    lock (session.Sync)
    {
        // 存档里可能停在敌方回合中途：读状态时把没跑完的敌方回合补完，避免玩家「点不动」
        CombatEngine.Resume(session.State);
        CoopEngine.CheckTimeout(session.State);
        return Json(session.State, jsonOptions);
    }
});


app.MapDelete("/api/session/{id}", (string id, string? token) =>
{
    // 联机对局：sessionId 会下发给每个房间成员，删档必须拿座位 token 证明身份
    var owner = RoomOfSession(id);
    if (owner is not null && owner.SeatByToken(token) is null)
        return Results.Json(new ApiError { Error = "这是联机对局，缺少有效的座位凭证。" }, jsonOptions, statusCode: 403);
    sessions.TryRemove(id, out _);
    store.Delete(id);
    return Results.Json(new { ok = true }, jsonOptions);
});

try
{
    app.Run();
}
catch (Exception ex)
{
    // 端口被占用是最常见的启动失败：默认的 Kestrel 异常栈对玩家毫无信息量。
    // Kestrel 抛的可能是 IOException / AddressInUseException / 带内层的 AggregateException，
    // 所以按消息链判断，而不是只认某一种类型。
    var chain = new List<string>();
    for (var e = ex; e is not null; e = e.InnerException) chain.Add(e.Message + " " + e.GetType().Name);
    var text = string.Join(" | ", chain);
    if (text.Contains("address already in use", StringComparison.OrdinalIgnoreCase) ||
        text.Contains("AddressAlreadyInUse", StringComparison.OrdinalIgnoreCase))
    {
        Console.Error.WriteLine();
        Console.Error.WriteLine($"端口 {port} 已经被占用——通常是上一次的服务窗口还开着。");
        Console.Error.WriteLine($"  · 先用浏览器打开 http://127.0.0.1:{port}/api/health 看看是不是已经在跑；");
        Console.Error.WriteLine($"  · Windows 查占用：netstat -ano | findstr :{port}   然后 taskkill /PID <PID> /F");
        Console.Error.WriteLine($"  · macOS / Linux：lsof -i :{port} 然后 kill <PID>");
        Console.Error.WriteLine($"  · 想换端口：先设置环境变量 AGI2046_PORT（例如 {port + 2}）再启动。");
        Console.Error.WriteLine();
        Environment.Exit(2);
    }
    Console.Error.WriteLine("服务启动失败：" + ex.Message);
    if (Environment.GetEnvironmentVariable("AGI2046_DEBUG") == "1") Console.Error.WriteLine(ex);
    Environment.Exit(1);
}

return 0;   // 正常关闭（Ctrl+C）

/// <summary>端口是否可用：按双栈方式试绑一次，和 Kestrel 的绑定方式保持一致。</summary>
static bool PortAvailable(int port)
{
    try
    {
        var listener = new System.Net.Sockets.TcpListener(System.Net.IPAddress.IPv6Any, port);
        listener.Server.DualMode = true;
        listener.Start();
        listener.Stop();
        return true;
    }
    catch
    {
        return false;
    }
}

static IResult Json(GameState state, JsonSerializerOptions options)
    => Results.Text(JsonSerializer.Serialize(state, options), "application/json; charset=utf-8");

sealed class GameSession
{
    public GameSession(GameState state) => State = state;
    public object Sync { get; } = new();
    public GameState State { get; }

    /// <summary>
    /// 请求级幂等表：requestId → 应用后的修订号。只保留最近 64 个，
    /// 足够覆盖「网络抖动重试 / 双击 / 切标签页再点一次」，又不会无限涨内存。
    /// </summary>
    private readonly Dictionary<string, int> _seen = new(StringComparer.Ordinal);
    private readonly Queue<string> _order = new();
    private const int MaxKeys = 64;

    public bool WasApplied(string? requestId) =>
        !string.IsNullOrWhiteSpace(requestId) && _seen.ContainsKey(requestId!);

    public void Remember(string? requestId, int revision)
    {
        if (string.IsNullOrWhiteSpace(requestId)) return;
        if (_seen.ContainsKey(requestId!)) return;
        _seen[requestId!] = revision;
        _order.Enqueue(requestId!);
        while (_order.Count > MaxKeys)
        {
            var old = _order.Dequeue();
            _seen.Remove(old);
        }
    }
}

/// <summary>启动加载结果：成功恢复、被隔离、被自动升级的存档。</summary>
sealed record LoadReport(List<GameState> Loaded, List<string> Quarantined, List<string> Upgraded);

/// <summary>把进行中的对局按会话落盘，服务端重启后仍可续玩。</summary>
sealed class SessionStore
{
    private readonly string _dir;
    private readonly JsonSerializerOptions _options;

    public SessionStore(string dir, JsonSerializerOptions options)
    {
        _dir = dir;
        _options = options;
    }

    private string PathFor(string id) => Path.Combine(_dir, $"{id}.json");

    /// <summary>最近一次写盘失败的原因；成功后置空，供 /api/health 观测。</summary>
    public string? LastError { get; private set; }

    /// <summary>读取所有存档。读不出来或格式不兼容的移到 quarantine 目录，而不是静默消失。</summary>
    public LoadReport LoadAll()
    {
        var loaded = new List<GameState>();
        var quarantined = new List<string>();
        var upgraded = new List<string>();
        foreach (var file in Directory.EnumerateFiles(_dir, "*.json"))
        {
            try
            {
                var state = JsonSerializer.Deserialize<GameState>(File.ReadAllText(file), _options);
                if (state is null || string.IsNullOrWhiteSpace(state.SessionId))
                {
                    Quarantine(file);
                    quarantined.Add($"{Path.GetFileName(file)}（缺少 SessionId）");
                    continue;
                }
                if (state.SaveFormat > GameState.SaveFormatCurrent)
                {
                    Quarantine(file);
                    quarantined.Add($"{Path.GetFileName(file)}（存档格式 {state.SaveFormat} 高于当前 {GameState.SaveFormatCurrent}）");
                    continue;
                }
                if (state.SaveFormat < GameState.SaveFormatCurrent)
                {
                    state.SaveFormat = GameState.SaveFormatCurrent;
                    upgraded.Add(Path.GetFileName(file));
                }
                CombatEngine.Resume(state);
                loaded.Add(state);
            }
            catch (Exception ex)
            {
                Quarantine(file);
                quarantined.Add($"{Path.GetFileName(file)}（{ex.Message}）");
            }
        }
        return new LoadReport(loaded, quarantined, upgraded);
    }

    private void Quarantine(string file)
    {
        try
        {
            var dir = Path.Combine(_dir, "quarantine");
            Directory.CreateDirectory(dir);
            var target = Path.Combine(dir,
                $"{Path.GetFileNameWithoutExtension(file)}.{DateTime.UtcNow:yyyyMMddHHmmss}.json");
            File.Move(file, target, overwrite: true);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[session] 隔离失败 {Path.GetFileName(file)}: {ex.Message}");
        }
    }

    public bool Save(GameState state)
    {
        if (string.IsNullOrWhiteSpace(state.SessionId)) return false;
        var path = PathFor(state.SessionId);
        var tmp = path + ".tmp";
        try
        {
            File.WriteAllText(tmp, JsonSerializer.Serialize(state, _options));
            File.Move(tmp, path, overwrite: true);
            LastError = null;
            return true;
        }
        catch (Exception ex)
        {
            LastError = $"{state.SessionId}: {ex.Message}";
            Console.Error.WriteLine($"[session] 保存失败 {LastError}");
            return false;
        }
    }

    public void Delete(string id)
    {
        try
        {
            var path = PathFor(id);
            if (File.Exists(path)) File.Delete(path);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[session] 删除失败 {id}: {ex.Message}");
        }
    }

    /// <summary>只保留最近若干个存档，避免长期运行堆积。</summary>
    public void Prune(int keep)
    {
        try
        {
            var files = new DirectoryInfo(_dir).GetFiles("*.json")
                .OrderByDescending(f => f.LastWriteTimeUtc)
                .Skip(keep)
                .ToList();
            foreach (var f in files) f.Delete();
            if (files.Count > 0)
                Console.WriteLine($"[session] 清理旧存档 {files.Count} 个");
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[session] 清理失败: {ex.Message}");
        }
    }
}

/// <summary>每一局结束（通关或失败）都记一行，标题页显示"最近行动"。
/// 用意：失败不该只等于删档——至少留下"上次死在哪"。</summary>
sealed class RunLog
{
    private readonly string _path;
    private readonly JsonSerializerOptions _options;
    private readonly object _sync = new();
    private readonly HashSet<string> _recorded = new(StringComparer.Ordinal);

    public RunLog(string path, JsonSerializerOptions options)
    {
        _path = path;
        _options = options;
    }

    public void Record(GameState state)
    {
        if (string.IsNullOrWhiteSpace(state.SessionId)) return;
        lock (_sync)
        {
            if (!_recorded.Add(state.SessionId)) return;
            var record = new
            {
                at = DateTimeOffset.UtcNow,
                sessionId = state.SessionId,
                // 0.21 起标题页要区分「标准局 / 挑战局」，并显示评级
                mode = state.Mode.ToString(),
                challengeKind = state.Challenge?.Kind,
                grade = state.Rating?.Grade,
                score = state.Rating?.Score,
                victory = state.Phase == GamePhase.Victory,
                act = state.Act,
                actName = state.ActName,
                defeatedBy = state.DefeatedBy,
                rounds = state.Round,
                purgeLeft = state.Purge,
                memory = state.Memory,
                teamLives = state.TeamLives,
                questClaims = state.QuestClaims,
                awakened = state.Players.FirstOrDefault(p => p.Awakened)?.Name,
                players = state.Players.Select(p => new { name = p.Name, character = p.CharacterId, level = p.Level }).ToList()
            };
            try
            {
                File.AppendAllText(_path, JsonSerializer.Serialize(record, _options) + "\n");
                Trim();
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[runs] 写入失败: {ex.Message}");
            }
        }
    }

    public List<JsonElement> Recent(int limit)
    {
        lock (_sync)
        {
            var result = new List<JsonElement>();
            if (!File.Exists(_path)) return result;
            try
            {
                var lines = File.ReadAllLines(_path).Where(l => l.Trim().Length > 0).ToList();
                foreach (var line in lines.Skip(Math.Max(0, lines.Count - limit)).Reverse())
                {
                    using var doc = JsonDocument.Parse(line);
                    result.Add(doc.RootElement.Clone());
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[runs] 读取失败: {ex.Message}");
            }
            return result;
        }
    }

    /// <summary>只留最近 200 条，避免文件无限长。</summary>
    private void Trim()
    {
        try
        {
            var lines = File.ReadAllLines(_path);
            if (lines.Length <= 200) return;
            File.WriteAllLines(_path, lines.Skip(lines.Length - 200));
        }
        catch { /* 忽略 */ }
    }
}

/// <summary>
/// 跨局玩家档案（0.20）：只记「教学看过没有」「解锁了什么」这类不参与规则判定的状态。
/// 单独一个文件，和 data/sessions/ 的正式存档完全分开；
/// 文件缺失/损坏时按新玩家处理，绝不因为档案坏了让人开不了局。
/// </summary>
sealed class ProfileStore
{
    private readonly string _path;
    private readonly JsonSerializerOptions _options;
    private readonly object _sync = new();

    public ProfileStore(string path, JsonSerializerOptions options)
    {
        _path = path;
        _options = options;
        Data = Load();
    }

    public ProfileData Data { get; private set; }

    /// <summary>已解锁的变异 id 集合（挑战校验用）。没有档案时是空集。</summary>
    public IReadOnlySet<string> UnlockedSet() =>
        new HashSet<string>(Data.UnlockedIds ?? new List<string>(), StringComparer.OrdinalIgnoreCase);

    private ProfileData Load()
    {
        try
        {
            if (!File.Exists(_path)) return new ProfileData();
            return JsonSerializer.Deserialize<ProfileData>(File.ReadAllText(_path), _options) ?? new ProfileData();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[profile] 读取失败，按新玩家处理: {ex.Message}");
            return new ProfileData();
        }
    }

    public void MarkTutorialCompleted()
    {
        lock (_sync)
        {
            if (Data.TutorialCompleted) return;
            Data.TutorialCompleted = true;
            Data.TutorialCompletedAt = DateTimeOffset.UtcNow;
            Save();
        }
    }

    /// <summary>每局结束合并一次：场次、胜利数、最佳评级、解锁。只增不减。</summary>
    public void MergeRun(GameState state)
    {
        if (state is null) return;
        lock (_sync)
        {
            Data.Runs++;
            if (state.Phase == GamePhase.Victory) Data.Victories++;
            var rating = state.Rating;
            if (rating is not null)
            {
                Data.BestScore = Math.Max(Data.BestScore, rating.Score);
                if (GradeRank(rating.Grade) > GradeRank(Data.BestGrade)) Data.BestGrade = rating.Grade;
                foreach (var id in rating.UnlockedIds ?? new List<string>())
                    if (!Data.UnlockedIds.Contains(id)) Data.UnlockedIds.Add(id);
            }
            Save();
        }
    }

    private static int GradeRank(string? grade) => grade switch
    {
        "S" => 5, "A" => 4, "B" => 3, "C" => 2, "D" => 1, _ => 0
    };

    private void Save()
    {
        try
        {
            var tmp = _path + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(Data, _options));
            File.Move(tmp, _path, overwrite: true);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[profile] 保存失败: {ex.Message}");
        }
    }
}

sealed class ProfileData
{
    public bool TutorialCompleted { get; set; }
    public DateTimeOffset? TutorialCompletedAt { get; set; }
    public List<string> UnlockedIds { get; set; } = new();
    public string BestGrade { get; set; } = "—";
    public int BestScore { get; set; }
    public int Runs { get; set; }
    public int Victories { get; set; }
}
