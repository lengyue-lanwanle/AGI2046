# AGENTS.md

面向 AI 编码助手（以及人类贡献者）的项目速览。当前状态一律以 `HANDOFF.md` 与 `README.md` 为准。

## 技术栈与结构

- **.NET 10**：`src/AGI2046.Rules`（纯规则库，不依赖 ASP.NET/浏览器）+ `src/AGI2046.Server`（ASP.NET Core Minimal API + 静态文件 + 联机房间）。
- **前端**：`web/` 原生 HTML/CSS/JS，**零构建**。核心在 `web/js/app.js`（状态机）、`battle3d.js`（Three.js 战场）、`map3d.js`（地图）。
- **运行**：`dotnet run --project src/AGI2046.Server/AGI2046.Server.csproj` → `http://localhost:5178`。端口读 `AGI2046_PORT`，数据目录读 `AGI2046_DATA`。

## 关键约束（改动前必读）

1. **规则与 HTTP 分离**：浏览器只提交动作，规则结果在服务端计算。不要在前端写规则判定。
2. **单实例有状态应用**：对局在内存 `ConcurrentDictionary`，存档落盘 `data/sessions/`。不能水平扩展。
3. **版本号一致性**：`Models.cs` / `Program.cs` / `web/index.html` / `README.md` / `HANDOFF.md` / `web/data/archive.json` 六处版本号必须一致，`node tools/release/check.mjs` 校验。
4. **静态资源缓存**：改前端资源后跑 `node tools/bump-web-version.mjs` 升 `?v=`，否则用户拿到旧缓存。
5. **存档兼容**：`GameState` 新增字段必须给安全默认值，旧档要能反序列化并推进（见 `tools/audit/save-migrate.cs`）。
6. **许可证**：CC BY-NC 4.0，非商业。不要引入 GPL/商业授权不兼容的依赖或素材。

## 验证脚本（`tools/`）

- 端到端：`tools/e2e/*.mjs`（真实 HTTP/浏览器）
- 冒烟：`tools/smoke/*.mjs`
- 规则探针：`tools/audit/*.cs`（`dotnet run` 单文件运行）
- 发布前：`node tools/release/prep.mjs` + `node tools/release/check.mjs`
- 部署：`node tools/deploy/pack.mjs` 打 18MB 包，`node tools/deploy/deploy.mjs root@<IP> [域名]` 一条命令上线

## 联机

房间在内存 + `data/rooms/`，HTTP 轮询（无 WebSocket）。房主建房拿 6 位房间码，公网走 Cloudflare Tunnel（`node tools/tunnel.mjs`）或云服务器部署（见 `docs/DEPLOY.md`）。
