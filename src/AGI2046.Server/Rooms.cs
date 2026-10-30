using System.Text.Json;
using System.Text.Json.Serialization;

namespace AGI2046.Server;

/// <summary>联机房间里的一个座位 = 一个玩家。characterId 由玩家自己选，选之前为 null。</summary>
sealed class RoomSeat
{
    public string PlayerId { get; set; } = "";
    /// <summary>玩家自己选的角色；为空表示还没选。</summary>
    public string? CharacterId { get; set; }
    public string? Name { get; set; }
    public string? Token { get; set; }
    public bool IsHost { get; set; }
    public DateTime LastSeenUtc { get; set; }

    [JsonIgnore]
    public bool Occupied => !string.IsNullOrWhiteSpace(Token);

    [JsonIgnore]
    public bool Ready => Occupied && !string.IsNullOrWhiteSpace(CharacterId);
}

/// <summary>房间：大厅阶段玩家各自加入、各自选角色；开始后绑定一个对局 session。</summary>
sealed class Room
{
    public const int MaxSeats = 4;

    public string Code { get; set; } = "";
    /// <summary>lobby / playing / finished。</summary>
    public string Phase { get; set; } = "lobby";
    public string? SessionId { get; set; }
    public int Seed { get; set; }
    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;
    public List<RoomSeat> Seats { get; set; } = new();

    [JsonIgnore]
    public object Sync { get; } = new();

    public bool IsOnline(RoomSeat seat) =>
        seat.Occupied && (DateTime.UtcNow - seat.LastSeenUtc).TotalSeconds < 20;

    public RoomSeat? SeatByToken(string? token) =>
        string.IsNullOrWhiteSpace(token) ? null : Seats.FirstOrDefault(s => s.Token == token);

    public RoomSeat? HostSeat => Seats.FirstOrDefault(s => s.IsHost);

    public IEnumerable<RoomSeat> OccupiedSeats => Seats.Where(s => s.Occupied);

    public IEnumerable<string> TakenCharacters =>
        OccupiedSeats.Select(s => s.CharacterId).Where(c => !string.IsNullOrWhiteSpace(c))!;

    /// <summary>至少一人，且每个已加入的玩家都选好角色，才能开局。</summary>
    public bool AllReady => OccupiedSeats.Any() && OccupiedSeats.All(s => s.Ready);

    public int SeatCount => Seats.Count;

    /// <summary>找一个空座位（有人离开留下的），没有就新建，直到满员。</summary>
    public RoomSeat? AcquireSeat()
    {
        var free = Seats.FirstOrDefault(s => !s.Occupied);
        if (free is not null) return free;
        if (Seats.Count >= MaxSeats) return null;
        var seat = new RoomSeat { PlayerId = $"p{Seats.Count + 1}" };
        Seats.Add(seat);
        return seat;
    }

    /// <summary>开局前把空座位剔掉并重排 p1..pN，返回 token → 新 PlayerId 的映射。</summary>
    public Dictionary<string, string> CompactSeats()
    {
        var map = new Dictionary<string, string>();
        var kept = new List<RoomSeat>();
        foreach (var seat in OccupiedSeats)
        {
            var newId = $"p{kept.Count + 1}";
            map[seat.Token!] = newId;
            seat.PlayerId = newId;
            kept.Add(seat);
        }
        Seats = kept;
        return map;
    }

    /// <summary>玩家离开：清空座位但保留位置，方便再来人。</summary>
    public void Vacate(RoomSeat seat)
    {
        seat.Token = null;
        seat.Name = null;
        seat.CharacterId = null;
        seat.LastSeenUtc = default;
        seat.IsHost = false;
    }
}

/// <summary>房间落盘：与对局存档分开存放，重启后可直接恢复大厅与进行中的房间。</summary>
sealed class RoomStore
{
    private readonly string _dir;
    private readonly JsonSerializerOptions _options;

    public RoomStore(string dir, JsonSerializerOptions options)
    {
        _dir = dir;
        _options = options;
        Directory.CreateDirectory(_dir);
    }

    private string PathFor(string code) => Path.Combine(_dir, $"{code}.json");

    public IEnumerable<Room> LoadAll()
    {
        foreach (var file in Directory.EnumerateFiles(_dir, "*.json"))
        {
            Room? room = null;
            try
            {
                room = JsonSerializer.Deserialize<Room>(File.ReadAllText(file), _options);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[room] 读取失败 {Path.GetFileName(file)}: {ex.Message}");
            }
            if (room is not null && !string.IsNullOrWhiteSpace(room.Code))
                yield return room;
        }
    }

    public bool Save(Room room)
    {
        if (string.IsNullOrWhiteSpace(room.Code)) return false;
        var path = PathFor(room.Code);
        var tmp = path + ".tmp";
        try
        {
            File.WriteAllText(tmp, JsonSerializer.Serialize(room, _options));
            File.Move(tmp, path, overwrite: true);
            return true;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[room] 保存失败 {room.Code}: {ex.Message}");
            return false;
        }
    }

    public void Delete(string code)
    {
        try
        {
            var path = PathFor(code);
            if (File.Exists(path)) File.Delete(path);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[room] 删除失败 {code}: {ex.Message}");
        }
    }

    /// <summary>只保留最近的房间，避免长期运行堆积。</summary>
    public void Prune(int keep)
    {
        try
        {
            var files = new DirectoryInfo(_dir).GetFiles("*.json")
                .OrderByDescending(f => f.LastWriteTimeUtc)
                .Skip(keep)
                .ToList();
            foreach (var f in files) f.Delete();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[room] 清理失败: {ex.Message}");
        }
    }
}

/// <summary>发给前端的房间视图（不含 token）。</summary>
sealed record RoomSeatView(
    string PlayerId,
    string? CharacterId,
    string? Name,
    bool Occupied,
    bool Online,
    bool IsHost,
    bool Ready);

sealed record RoomView(
    string Code,
    string Phase,
    string? SessionId,
    int Revision,
    bool AllReady,
    int SeatCount,
    int MaxSeats,
    string? HostPlayerId,
    List<RoomSeatView> Seats);

/* ── 请求 / 响应 ─────────────────────────────────────────────────── */

/// <summary>建房只要一个名字，角色由每个人自己选。</summary>
sealed record RoomCreateRequest(string? HostName, int Seed);

/// <summary>加入：把座位交给服务端分配（有空位就坐空位，没有就新建）。</summary>
sealed record RoomJoinRequest(string? Name, string? Token);

sealed record RoomTokenRequest(string? Token);

/// <summary>联机剧情游标上报。Line 是当前句号，客户端据此跟读。</summary>
sealed record RoomCueRequest(string? Token, string? SceneId, int Line);

sealed record RoomCharacterRequest(string? Token, string? CharacterId);

/// <summary>房主踢人：token 是房主的，playerId 是被踢的座位。</summary>
sealed record RoomKickRequest(string? Token, string? PlayerId);

sealed record RoomCreateResult(string Code, string Token, string PlayerId, RoomView Room);

sealed record RoomJoinResult(string Code, string Token, string PlayerId, RoomView Room);
