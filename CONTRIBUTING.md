# 贡献指南

感谢你对《零号协议 2046》的兴趣。这是一个单人主导的独立项目，但欢迎任何形式的参与。

## 先了解

- 技术栈：**C# / .NET 10**（`src/AGI2046.Server` 服务端 + `src/AGI2046.Rules` 纯规则库）+ 原生 **HTML/CSS/JS**（`web/`，零构建）。
- 架构边界：规则层不依赖 HTTP，浏览器只持有 `GameState` 快照，通过 `/api/action` 提交动作。改规则优先改 `AGI2046.Rules`。
- 当前状态一律以 [`HANDOFF.md`](HANDOFF.md) 与 [`README.md`](README.md) 为准，`docs/` 里的历史文档仅作背景。

## 怎么跑

```bash
dotnet run --project src/AGI2046.Server/AGI2046.Server.csproj
# 打开 http://localhost:5178
```

前端无构建步骤。改完 `web/js/*.js` / `web/css/style.css` 后跑 `node tools/bump-web-version.mjs` 升缓存版本。

## 提交规范

- 一个 PR 做一件事，说明「为什么」而不只是「改了什么」。
- 涉及规则改动，附带能复现的验证命令（`tools/` 下有大量端到端与冒烟脚本）。
- 改 `README.md` / `HANDOFF.md` 时同步更新版本号（`tools/release/check.mjs` 会校验一致性）。
- 提交前跑一遍 `dotnet build src/AGI2046.Server/AGI2046.Server.csproj`，确保 0 警告 0 错误。

## 许可

本项目采用 **CC BY-NC 4.0（署名-非商业性使用）**。你提交的代码默认以同一许可发布。若你贡献了美术/音频等素材，请确认你拥有相应权利。

## 联系

在 Issues 里提问即可。欢迎讨论设计取舍、联机玩法、平衡性等任何话题。
