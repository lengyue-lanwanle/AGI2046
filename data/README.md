# data/ —— 运行时数据（不进 git）

| 路径 | 内容 | 能否删 |
| --- | --- | --- |
| `sessions/` | 每一局的完整存档（JSON）。服务启动时扫描加载。 | 可以。删了等于丢档；`tools/release/prep.mjs` 会把它们移到 `_test-archive/`。 |
| `rooms/` | 联机房间大厅与座位。过期的会自动清理。 | 可以。发布前运行 prep 脚本归档。 |
| `runs.jsonl` | 每局结束追加一行（标题页「最近行动」用）。不含完整存档，只有结果摘要。 | 可以，但会丢战绩。 |
| `profile.json` | 跨局档案：教学是否看过、解锁、最佳评级、场次。 | 可以。删了等于新玩家。 |
| `tunnel.json` | 内网穿透的临时地址缓存。 | 可以。 |
| `_test-archive/` | 测试产生、被归档出来的旧存档。 | 可以整个删掉。 |

**发布前**：停服务 → `node tools/release/prep.mjs` → 确认 `sessions/`、`rooms/` 为空。
**别把 `data/` 提交进 git**：`.gitignore` 已经忽略 `sessions/`、`rooms/`、`profile.json`、`runs.jsonl`。
