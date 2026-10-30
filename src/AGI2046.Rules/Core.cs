namespace AGI2046.Rules;

public static class Dice
{
    public static int D100(Random rng) => rng.Next(1, 101);
    public static int D10(Random rng) => rng.Next(1, 11);
    public static int Roll(Random rng, int sides) => rng.Next(1, sides + 1);
    public static int StatBonus(int stat) => (stat - 50) / 5;      // -10 .. +9
    public static int DamageBonus(int stat) => (stat - 50) / 10;   // -5 .. +4
    public static int ClampPct(int value) => Math.Clamp(value, 5, 95);
}

public static class Stable
{
    /// <summary>
    /// 稳定的字符串哈希：.NET 的 string.GetHashCode() 每个进程都会加盐，
    /// 用它做随机种子会导致同一个种子每次开出的地图/商店都不一样。
    /// </summary>
    public static int Hash(string? value)
    {
        unchecked
        {
            var hash = 23;
            foreach (var ch in value ?? string.Empty) hash = hash * 31 + ch;
            return hash;
        }
    }
}

public static class Hex
{
    public static readonly (int dc, int dr)[] OddRNeighbors =
    {
        (1, 0), (-1, 0), (0, -1), (-1, -1), (0, 1), (-1, 1)
    };

    public static IEnumerable<(int col, int row)> Neighbors(int col, int row, int width, int height)
    {
        var parity = row & 1;
        var candidates = new (int dc, int dr)[]
        {
            (1, 0), (-1, 0),
            (parity, -1), (parity - 1, -1),
            (parity, 1), (parity - 1, 1)
        };
        foreach (var (dc, dr) in candidates)
        {
            var nc = col + dc;
            var nr = row + dr;
            if (nc >= 0 && nc < width && nr >= 0 && nr < height)
                yield return (nc, nr);
        }
    }

    // Odd-r offset -> cube, for true hex distance.
    public static int Distance(int col1, int row1, int col2, int row2)
    {
        var a = OffsetToCube(col1, row1);
        var b = OffsetToCube(col2, row2);
        return (Math.Abs(a.x - b.x) + Math.Abs(a.y - b.y) + Math.Abs(a.z - b.z)) / 2;
    }

    private static (int x, int y, int z) OffsetToCube(int col, int row)
    {
        var x = col - (row - (row & 1)) / 2;
        var z = row;
        return (x, -x - z, z);
    }

    public static List<HexPos> Reachable(int startCol, int startRow, int movement, int width, int height,
        HashSet<string> blocked, int maxNodes = 200)
    {
        var result = new List<HexPos>();
        var visited = new HashSet<string> { $"{startCol},{startRow}" };
        var queue = new Queue<(int col, int row, int steps)>();
        queue.Enqueue((startCol, startRow, 0));
        while (queue.Count > 0 && visited.Count < maxNodes)
        {
            var (col, row, steps) = queue.Dequeue();
            if (steps >= movement) continue;
            foreach (var (nc, nr) in Neighbors(col, row, width, height))
            {
                var key = $"{nc},{nr}";
                if (!visited.Add(key)) continue;
                if (blocked.Contains(key)) continue;
                result.Add(new HexPos(nc, nr));
                queue.Enqueue((nc, nr, steps + 1));
            }
        }
        return result;
    }

    public static List<(int col, int row)> Path(int startCol, int startRow, int targetCol, int targetRow,
        int width, int height, HashSet<string> blocked)
    {
        var start = $"{startCol},{startRow}";
        var target = $"{targetCol},{targetRow}";
        var prev = new Dictionary<string, string?>();
        var queue = new Queue<(int, int)>();
        prev[start] = null;
        queue.Enqueue((startCol, startRow));
        while (queue.Count > 0)
        {
            var (col, row) = queue.Dequeue();
            if (col == targetCol && row == targetRow) break;
            foreach (var (nc, nr) in Neighbors(col, row, width, height))
            {
                var key = $"{nc},{nr}";
                if (prev.ContainsKey(key)) continue;
                if (blocked.Contains(key)) continue;
                prev[key] = $"{col},{row}";
                queue.Enqueue((nc, nr));
            }
        }
        if (!prev.ContainsKey(target)) return new();
        var path = new List<(int, int)>();
        string? cur = target;
        while (cur is not null && cur != start)
        {
            var parts = cur.Split(',');
            path.Add((int.Parse(parts[0]), int.Parse(parts[1])));
            cur = prev.TryGetValue(cur, out var p) ? p : null;
        }
        path.Reverse();
        return path;
    }
}

public static class Text
{
    public static string Pct(int value) => $"{value}%";
    public static string Signed(int value) => value >= 0 ? $"+{value}" : value.ToString();
    public static string DiceFace(int value) => value switch
    {
        1 => "⚀", 2 => "⚁", 3 => "⚂", 4 => "⚃", 5 => "⚄", 6 => "⚅",
        _ => value.ToString()
    };
}
