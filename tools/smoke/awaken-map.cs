#:project ../../src/AGI2046.Rules/AGI2046.Rules.csproj

// 地图布局冒烟：三幕的觉醒/残响/固定地标位置与可见性
// 用法：dotnet run tools/smoke/awaken-map.cs
using AGI2046.Rules;

var pass = 0;
var total = 0;
void Ok(string name, bool cond, string detail = "")
{
    total++;
    if (cond) pass++;
    Console.WriteLine($"{(cond ? "PASS" : "FAIL")}  {name}{(string.IsNullOrEmpty(detail) ? "" : "  —  " + detail)}");
}

for (var act = 1; act <= 3; act++)
{
    var (nodes, _) = MapGenerator.Generate(12345, act);
    var grid = nodes.Where(n => n.Id.StartsWith("n")).ToList();
    var awaken = nodes.Where(n => n.Type == NodeType.Awakening).ToList();
    var echo = nodes.Where(n => n.Type == NodeType.Echo).ToList();
    var laneShift = (act - 1) * 2 % MapProfile.Lanes;

    Ok($"act{act} 觉醒节点 1 个", awaken.Count == 1, string.Join(",", awaken.Select(n => n.Id)));
    Ok($"act{act} 觉醒固定第 9 层", awaken.All(n => n.Layer == 9), string.Join(",", awaken.Select(n => n.Layer)));
    Ok($"act{act} 觉醒道位随幕轮换（期望 {(3 + laneShift) % 5}）",
        awaken.All(n => n.Lane == (3 + laneShift) % 5), string.Join(",", awaken.Select(n => n.Lane)));
    Ok($"act{act} 觉醒开局可见", awaken.All(n => n.Revealed), string.Join(",", awaken.Select(n => n.Revealed)));
    Ok($"act{act} 残响节点 2 个", echo.Count == 2, string.Join(",", echo.Select(n => n.Id)));
    Ok($"act{act} 残响开局可见", echo.All(n => n.Revealed));
    Ok($"act{act} 觉醒与残响不同格",
        awaken.All(a => echo.All(e => !(e.Layer == a.Layer && e.Lane == a.Lane))));

    // 固定地标数量：任一格被两种固定类型抢走，这里就会少一个
    var by = grid.GroupBy(n => n.Type).ToDictionary(g => g.Key, g => g.Count());
    int C(NodeType t) => by.TryGetValue(t, out var c) ? c : 0;
    Ok($"act{act} 服务器 9 台", C(NodeType.Server) == 9, C(NodeType.Server).ToString());
    Ok($"act{act} 商店 5 / 安全屋 5", C(NodeType.Shop) == 5 && C(NodeType.Safehouse) == 5,
        $"{C(NodeType.Shop)}/{C(NodeType.Safehouse)}");
    Ok($"act{act} 宝库 3 / 碎片看守 3 / 精英 1 / 终端 1",
        C(NodeType.Treasure) == 3 && C(NodeType.KeyElite) == 3 && C(NodeType.Elite) == 1 && C(NodeType.Terminal) == 1,
        $"{C(NodeType.Treasure)}/{C(NodeType.KeyElite)}/{C(NodeType.Elite)}/{C(NodeType.Terminal)}");
    Ok($"act{act} 网格无同格重叠", grid.GroupBy(n => (n.Layer, n.Lane)).All(g => g.Count() == 1));
    Ok($"act{act} 节点总数 95", nodes.Count == 95, nodes.Count.ToString());

    var names = nodes.Where(n => n.Type == NodeType.Awakening).Select(n => n.Name).ToList();
    Console.WriteLine($"      觉醒节点：{awaken.FirstOrDefault()?.Id} · {string.Join(",", names)} · {awaken.FirstOrDefault()?.District}");
}

Console.WriteLine();
Console.WriteLine($"{pass}/{total} 通过");
return pass == total ? 0 : 1;
