# 零号协议 2046 — 交接（0.25.0）

> 写于 2026-10-27（0.25.0 收尾）。**下个会话先读这一页**，再看 `docs/TRANSITIONS.md`（过场）与 `docs/ART.md`（美术管线）。
> 当前服务：`http://127.0.0.1:5178`，`/api/health` 返回 `0.25.0`。
>
> **0.25 的主题是「可以交付」**：0.20 教学与可理解 → 0.21 挑战/复盘/评级 → 0.22 协同/支援/多人事件 →
> 0.23 后果/关系/档案 → 0.24 三个差异化首领 + 构筑化装备 → 0.25 无障碍/移动端/性能/存档迁移。
> 本文件的 §3.4–§3.9 是这六个切片的实现记录；**当前状态一律以本页与 README 为准**，历史文档只作背景。
>
> **0.18 之后的整体计划看 [`docs/PLAN-0.18.md`](docs/PLAN-0.18.md)**：
> 天外来敌 / 16 AI 群像 + 鲸落·宪章锚点、16×6 差分、VN 舞台、联机全流程、
> 15 张战场背景、NIKKE 式 DANGER 字效；人物只做 L0，不做 Live2D。
>
> **产品化路线**：0.20 → 0.25 的执行计划已归档到 [`docs/PLAN-0.25.md`](docs/PLAN-0.25.md)（原 `.routercode/plans/` 副本）。

---

## 3.10 0.25.1：发布前审计的必改项

> 这一节是「外部审计清单」的落地记录。审计结论：**没有新的高严重度运行时缺陷**，
> 重点在幂等、真实通关、存档/版本卫生、长局体验和发布文档一致性。

### 3.10.1 请求级幂等（必改 2）

`/api/action` 现在接受 `requestId`（body）或 `Idempotency-Key`（header）：

- 同一个 key 只应用一次；重复请求返回**当前状态**并带 `X-Idempotent-Replay: 1`，不再 409；
- 每个会话保留最近 64 个 key（`GameSession._seen` + `_order`），覆盖重试/双击/切标签页；
- **失败的动作不占 key**：先 400，再用同一个 id 重试会真的执行；
- 前端每次逻辑动作生成一个 `requestId`，网络层失败时**用同一个 id 重试一次**（4xx/5xx 不重试）。
- 验证：`tools/smoke/idempotency-check.mjs` **12/12**（含「不重复扣 AP」）。

### 3.10.2 真实三档通关（必改 3）

`tools/audit/bot-clear.cs`：会吃道具、留终极技、残血撤退、安全屋休息/升级、商店补针的机器人。
两个种子各跑一遍：

| 队伍 | seed 2046 | seed 777 |
| --- | --- | --- |
| 1 人 | 通关 · 动作 278 · 追踪 39/42 | 通关 · 278 · 39/42 |
| 2 人 | 通关 · 479 · 37/42 | 通关 · 458 · 36/42 |
| 4 人 | 通关 · 737 · 33/42 | 通关 · 756 · 35/42 |

**这条不是「游戏简单」**：机器人会跳过大部分普通战斗（12–16 场）、直奔碎片与首领。
它证明的是「一条完整路径存在」。`BotSim.cs`（笨机器人）仍是诊断工具，多人首领战会输，**不是回归门槛**。

### 3.10.3 群体骰子（必改 4）

`segment-check.mjs` 复跑 8/8。结论：**规则层本来就是每个目标独立掷骰**
（`ExecuteSkill` 对 `AllEnemies` 逐个调用 `ResolveAttack`，`tools/audit/aoe-probe.cs` 7/7 验证）。

真正的问题是**展示**：`combat.lastRoll` 只保存最后一个目标的骰子，玩家会以为「一次骰子打全场」。
0.25.1 在骰子面板加了「群体判定 · N 个目标 · 每个目标独立掷 M 骰」+ 每目标命中/伤害明细，
同名敌人加 ①② 序号；顺带修了详情里「14 伤害 · 伤害 14」的重复。

### 3.10.4 数据与版本卫生（必改 1 / 5）

- `HANDOFF.md` 顶部版本修到 `0.25.0`（之前只改了正文，标题还停在 0.20.0）；
- `tools/release/prep.mjs`：把 `data/sessions`、`data/rooms` 移到 `data/_test-archive/<时间戳>/`（不删除）；
- `tools/release/check.mjs`：版本号全项目一致、`?v=` 唯一、历史文档有横幅、运行目录干净；
- `data/README.md` 说明每个子目录能不能删；`.gitignore` 补 `.workbuddy/`、`.routercode/`、`data/_test-archive/`；
- 计划原文归档到 `docs/PLAN-0.25.md`（`.routercode/` 已忽略）；
- 23 份历史文档顶部统一加「历史文档，仅作背景；当前状态以 HANDOFF/README 为准」。

### 3.10.5 长局体验与平衡（应改）

- **弹窗疲劳**：`tools/ui/modal-fatigue.mjs` 跑 20–60 个连续动作，断言「非战斗弹窗 ≤ 动作/6」「同一窗口最多 6 次」
  「不叠加 / 不残留 / DOM 不累积」，桌面与 390×844 各 11/11。
- **角色平衡**：`tools/audit/balance-roster.cs`（2 人队 vs 第二幕精英 2v3，每人 12 场）
  15 名角色胜率 83–100%，平均 7.1–10.3 轮；最快/最慢 ≤2 倍、最慢 ≤ 平均 1.5 倍。
- **装备特性**：同一角色只换一件对应武器的前提下，+16.7%（护盾反击、Focus 循环）到 0%，没有陷阱也没有必选。
- **变异**：`balance-challenge.cs` 46/46；**协同**：`balance-synergy.cs` 10/10。
- **教学撤退**：这一步改成「看一眼撤离按钮（不用真的撤）」，真撤了也会推进，不再暗示「必须撤退」。
- **零变异挑战**：`ChallengeRun.Kind = custom_seed`，UI 与复盘都写明「规则等同标准局，只固定种子」。
- **目标面板**：路线建议支持 详细 / 简洁 / 关闭 三档，存本地；`mobile-matrix` 四尺寸验证。
- **端口占用**：启动前自检端口，只打四行命令提示（不再甩 Kestrel 栈）；支持 `AGI2046_PORT`。
- **README**：`Demo 版` → `完整试玩版`，页脚 `DEMO BUILD` → `PLAYTEST BUILD`。
- 顺带修：教学局不再写「最近行动」、不计入档案场次；`/api/new` 限流 30→60 次/分（连续跑测试会误伤）。

### 3.10.6 仍然已知的问题

- 多人（2/4 人）首领战对「笨机器人」偏难；人类玩家可用道具/撤退/配装弥补，但这是下一步要调的地方。
- 装备特性在「满血碾压」的基准里会出现 0 增益（天花板效应），需要更高难度的基准才能测出差异。

## 3.9 0.25.0：交付前的最后一轮打磨

### 3.9.1 无障碍（任务 R）

- **减少动效**：`body.reduce-motion` 关掉动画/转场/字效；同时尊重系统 `prefers-reduced-motion`。
- **色盲友好**：`body.cb` 把「绿=好 / 红=危险」换成「蓝 / 橙」，并在回合条补「敌 / 我」文字、血条补「低」标记。
- **音量分三条**：`Sound.setVolume('sfx'|'ambient'|'ui', 0..1)`，各自 GainNode，互不影响，存 localStorage。
- **键盘战斗**：方向键 / WASD 走到该方向最近可达格，`Enter` / 空格打血最少的目标。
- **按钮命名**：`web/index.html` 全部按钮都有可读 `aria-label` 或可见文本；设置面板在 `H` 操作说明里。

### 3.9.2 移动端矩阵（任务 S）

`tools/ui/mobile-matrix.mjs`：390×844 / 412×915 / 768×1024 / 1366×768 四种尺寸，
每种跑「标题页 → 设置（三滑杆 + 两开关）→ 情报档案 → 对局地图 → 字体放大 150%」，
断言无横向溢出、触控目标不过小、顶部条不超屏宽。**61/61 通过**。

### 3.9.3 性能与资源（任务 T）

- 低性能设备（≤4 核 / ≤4GB / 小屏高 DPI）自动：像素比 1、关抗锯齿、关阴影。
- `Battle3D` 退出战斗时 `disposeBoard()` 遍历释放几何/材质/贴图，避免残留。
- 静态资源统一 `?v=250`（`tools/bump-web-version.mjs` 可再升）。

### 3.9.4 版本与存档迁移（任务 U）

- 版本统一 `0.25.0`：`GameState.Version` / `/api/health` / `/api/meta` / 标题页 / `README` / 本文件。
- `tools/audit/save-migrate.cs` + `tools/smoke/save-migration.mjs`：
  0.19 形状的旧档能反序列化、新字段有安全默认值、写回再读不丢字段、未知字段不影响读取、旧档能继续推进回合。**24/24**。

## 3.8 0.24.0：三个首领与构筑化装备

### 3.8.1 首领机制（任务 P）

文件：`src/AGI2046.Rules/BossMechanics.cs`（新增）、`CombatEngine.cs`、`Models.cs`。

| 首领 | 一阶段 | 二阶段 | 玩家对策 |
| --- | --- | --- | --- |
| 拍卖人 | 每 2 轮开价（赊账 40 记忆 / 抵押 1 队伍生命 / 买断沉默 25） | 清仓：从台下回收生命（最多 3 次，拆掉「记忆盲盒」即断） | 接受换短期收益，拒绝则它伤害 +2/次；胜利奖励按成交/拒绝缩放 |
| 镜面执政官 | 记录你最近用的伤害类型，同类型叠到 3 层 | 分摊：分裂镜像，镜像优先咬血最少的人 | 换伤害类型重新从 1 层学；「防御」直接降 1 层。抗性上限 +4 |
| 主脑 | 每 3 轮关 2 格（踩上 -3 HP，不可进入） | 挂 3 个 9HP 协议节点，5 轮内拆完；没拆完每个 -2 追踪 | 躲红格、优先拆节点；拆完主脑护甲 -3 |

战前预告：`BossMechanics.Preview` → `/api/meta.bossPreview` → 点首领节点先弹「战前」说明；
战斗内 `#boss-bar` 常驻显示机制名 / 一句话 / 当前状态 / 交易按钮。

### 3.8.2 装备特性（任务 Q）

`GameData.Traits` 8 条，挂在 8 件装备上（`GearDef.TraitId`）。同一角色**最多 3 条生效**，
按 Weapon→Armor→Helmet→Trinket→Cyberware 取前 3，其余在 UI 显示「待机」。

| 特性 | 触发 | 效果 | 限制 |
| --- | --- | --- | --- |
| 护盾反击 | 受击 | 反弹 3 | 有护盾，每轮一次 |
| Focus 循环 | 终极技后 | 返还 2 Focus | 每场一次 |
| 标记集火 | 攻击 | +3 伤害 | 目标被标记/暴露 |
| 低生命爆发 | 攻击 | +3 伤害 | 自己 ≤35% |
| 召唤占位 | 开战 | 10HP 无人机 3 回合 | 每场一次 |
| 消耗品强化 | 用道具 | 治疗/护盾 +50% | — |
| 速度连动 | 移动后 | 队友下回合 +1 移动 | 2 格内，每轮一次 |
| 风险撤退 | 撤退 | 成功率 +20% | 失败全队 -2 HP |

### 3.8.3 平衡回归

- `tools/audit/balance-challenge.cs`：1000 局短战（1–4 人 × 三幕 × 标准/变异），胜率/轮数/僵局分档断言，46/46。
- `tools/audit/balance-synergy.cs`：500 局裸打 vs 500 局满关系对照，验证协同有收益但不白送，10/10。
- 注意：`tools/audit/BotSim.cs` 是「笨机器人跑完整局」的诊断工具（会输在首领战，属预期），不是回归门槛。

## 3.7 0.23.0：事件后果、关系、情报档案

- `ConsequenceEngine.cs`：8 个事件各留一条后果，字段含 `Source / Why / ExpiresAct`；最多 5 条、超出回滚最旧。
- `RelationshipEngine.cs`：支援/协同/同行/共同决定/见证觉醒推进；Lv1 有故事、Lv2 +3 命中、Lv3 +1 护甲（同场）。
- `web/data/archive.json` + `web/js/archive.js`：9 个分区，未发现显示「未记录」；局内 `L` 键或情报栏「情报档案」打开。
- `GameEngine.AdvanceAct` 里 `BuildRecap()` 定格本幕数字，幕间弹层与档案「本局」页共用。

## 3.6 0.22.0：协同、支援、多人事件

- `SynergyEngine.cs` 8 类协同；`assistGuard/Focus/Mark/Rescue/Ping` 5 个支援动作。
- `CoopEngine.cs` + `GameData.CoopEvents.cs`：每幕一次、全员投票、多数决、超时安全默认、掉线不阻塞。
- 修了一个时序 bug：踩到陷阱的那一格若同时触发投票，陷阱会被跳过且永远不再结算（现在先结算陷阱再投票）。

## 3.5 0.21.0：挑战、变异、复盘、评级

- `ChallengeEngine.cs` + `GameData.Challenges.cs`：12 + 4 变异、固定种子、难度倍率。
- `RunAnalytics.cs`：`RunReview`（失败阶段/原因/关键判断/最后 10 动作/未用资源/建议）与 `RunRating`（7 维，S/A/B/C）。
- `ProfileStore` 记录解锁与最佳评级；解锁只给情报/称号/外观，不给永久数值。

## 3.4 0.20.0：让新玩家知道「现在该做什么」

**这一版不增加内容，只降低第一次进入的门槛。**

### 3.8.1 教学：一张训练场 + 九步步骤机

- `src/AGI2046.Rules/TutorialEngine.cs`：独立教学引擎。固定队伍（白垩 + 宪章）、固定 3 节点训练场
  （入口 → 训练靶机 → 训练安全屋）、固定 1 个软目标（`e_tut_drone`，18 HP）。
- 九步：`Intro → Move → Attack → Skill → EnemyIntent → EndTurn → Resource → Retreat → Complete`。
  动作前 `Validate` 挡跳步（提示只写「先做什么」），动作后 `After` 按结果推进；打太快会自动跳过剩余战斗步骤，不会卡死。
- 教学局**不写 `data/sessions/`**（`/api/action` 对 Tutorial 跳过落盘），刷新即回标题；失败可重试；
  跳过也记一次 `tutorialCompleted`，但入口永远保留（标题页「新手教学 · 已完成 · 可重看」）。
- 完成/跳过 → `POST /api/profile/tutorial-complete` 写 `data/profile.json`（跨局档案，和正式存档分开）。
- 文案集中在 `GameData.Tutorial.cs`（每步 title / detail / hint / why / actionLabel / focus），前端只负责显示。

### 3.8.2 目标条与目标面板

- `GameEngine.Objectives.cs`：每次 `ApplyAction` 后重算 `GameState.Objectives`。
  主目标唯一；当前目标随阶段切换（地图/战斗/事件/商店/安全屋/幕间）；近期目标最多 3 条（碎片 / 追踪 / 队伍生命）；
  失败条件、风险（追踪 + 下一处碎片）、推荐动作各一条。
- 目标文本变化会写一条 `kind=goal` 的行动记录（`目标更新：…`）。
- 前端：顶栏下常驻**目标条**（主目标 + 当前 + 风险，风险里的「电子追踪 42/42」本身就是术语入口），
  点开为完整面板；情报栏同步显示同一份主目标 + 当前目标，不再出现两套说法。

### 3.8.3 术语解释层

- `web/data/glossary.json`（15 条）+ `web/js/glossary.js`：术语是可聚焦按钮（不是 hover），点开解释卡，
  ESC / 遮罩 / 关闭都可退出；标题页和帮助页有「完整术语表」。
- 首次出现用 toast 提示一次（`localStorage.agi2046.glossarySeen`），同一时间最多一条，间隔 6 秒。
- 已接入的位置：情报栏的 AP / 护甲 / 抗性 / Focus、目标条的风险、帮助页。

### 3.8.4 新手首局节奏

- `MapGenerator.Generate(seed, act, firstRun)`：`firstRun` 只做**类型交换**，不改变任何节点配额
  （95 节点 / 3 碎片看守 / 9 服务器 / 2 残响全部原样）。第 1 层只出小战斗/普通战斗，第 2 层不出陷阱，第 3 层保证一个事件。
- 服务端 `firstRun` 默认取「档案里有没有完成教学」，客户端也会显式传（`/api/new` 的 `firstRun`）。
- 首次靠近服务器 / 觉醒残响 / 接到支线时各弹一次可关闭的解释（`localStorage.agi2046.explain`）。

### 3.8.5 这版新增的验证

```bash
node tools/smoke/tutorial-check.mjs     # 33 项：步骤机 / 非法动作 / 完成 / 档案 / 隔离 / 重开
node tools/smoke/objective-check.mjs    # 14 项：主目标唯一 / 近期≤3 / 风险 / 记录 / 教学不重复
node tools/smoke/pacing-check.mjs       # 12 项：首局配额不变 / 前两层节奏 / 同 seed 可复现
dotnet run tools/audit/save-compat.cs   # 14 项：旧档缺字段 / 未知新字段 / 教学往返
node tools/ui/tutorial-flow.mjs         # 29 项：真实浏览器（桌面 1440×900）
node tools/ui/tutorial-flow.mjs --mobile# 29 项：真实浏览器（390×844）
```

**注意**：`Program.cs` 现在用 `http://[::]:5178` 双栈监听。Windows 上 `localhost` 可能先解析到 `::1`，
只绑 `0.0.0.0` 会让 `node tools/...`（Node 22 的 fetch）连不上——0.20 之前这批脚本在本机其实跑不通。

---


## 1. 一句话状态

三幕合作战术 Roguelike，**可从头玩到尾**：16 名执行体、7×5 六角战斗、17 层×5 道地图、
三幕 285 节点、觉醒/支线/联机/存档齐全。0.13–0.16 修完了规则与内容层的欠账，
0.17 补上了最后一块「看起来像一款成品」的缺口：**过场演出 + 主视觉 + 道具图标**。

---

## 2. 怎么跑

```powershell
# 构建（0 警告 0 错误）
dotnet build src/AGI2046.Server/AGI2046.Server.csproj

# 启动（重建前先杀掉 5178 的监听进程，否则 DLL 被锁）
dotnet run --project src/AGI2046.Server/AGI2046.Server.csproj --no-build

# 打开
http://127.0.0.1:5178
```

前端无构建步骤。改了 `web/js/*.js` / `web/css/style.css` 之后，
如果不想手动改 `?v=`，跑 `node tools/bump-web-version.mjs`（当前统一 `?v=171`）。

---

## 3. 0.17.0 做了什么（本批次）

### 3.1 四个瞬间必须看得出来

之前的问题不是「动画不够」，是**状态变了而画面没变**。这一版只针对四个瞬间：

| 瞬间 | 现在 |
|---|---|
| 换屏（标题→选人→对局） | 640ms 黑场 + 青色扫描线，压住 `display` 硬切 |
| 进战斗 | 普通遭遇 1.25s 横条；首领 2.4s 整幅主视觉 + 上下黑边 |
| 探索换人 / 换轮 | 换人 = 左上小卡 1.15s；**换轮才** 居中大卡 1.5s（不再每回合挡屏） |
| 战斗换单位 / 换轮 | 底部阵营色横幅 1.05–1.4s；轮次用 96px 横带分隔 |
| 额外 | 地图移动速度线；幕间整幅主视觉 + 幕数水印；进下一幕的 `Cine.act` |

实现：`web/js/cinematics.js`（约 190 行，`window.Cine`）+ `style.css` 第 18 节。
**所有演出层 `pointer-events:none`**，不写状态、不发请求、不阻塞操作。
`prefers-reduced-motion` 下不放动画，但**静态卡片照常出现**（信息不能因无障碍设置消失）。

细节与时间预算见 **`docs/TRANSITIONS.md`**。

### 3.2 主视觉（7 张）

| 文件 | 用途 |
|---|---|
| `web/assets/keyart/title.webp` | 标题页满屏背景（左侧留暗给标题文字） |
| `act1–3.webp` | 幕间过场、幕间弹窗顶部横条 |
| `boss1–3.webp` | 首领战进场（拍卖人 / 镜面执政官 / 零号主脑） |

生成后统一处理：裁底部 6% 水印 → 擦掉标题图左上角被生成器加上的「NEON HARBOR 2046」
→ cover 裁到固定比例 → 暗角 → WebP。7 张共 **969KB**。
管线：`tools/art/keyart.py`（源图在 `tools/art/raw/key-*.png`）。

### 3.3 道具图标

5 种消耗品原来用字形（`✚ ◈ ❖ ▣ ➤`），在部分机器上会缺字形或渲染成方块。
新增 `web/assets/icons/item-*.svg`（24×24 / 1.8 描边 / mask 上色），
`ITEM_ICON` 映射有则用 SVG、无则退回字形。

### 3.4 其它可见改动

- 道具/消耗品图标、幕间插图；
- 换人瞬间队伍卡描边脉冲（屏幕最左侧，不扫视也能察觉）；
- 追踪时钟掉点时数字跳动 + 外框闪一次；
- 战斗行动顺序条：己方当前单位青色、敌方粉色，并加三角指示（不只靠颜色）。

---

## 3.5 0.17.1：手机能用（2026-10-26 凌晨）

用户只能用手机时，桌面版在 390×844 上是**不可玩**的，不是「不好看」：

| 症状 | 原因 | 修法 |
|---|---|---|
| 战斗只剩右侧操作栏，3D 棋盘完全不见 | `.hex-stage` 高度由子元素撑开，3D 层是绝对定位 → 高度 0 | 手机断点给 `height: 46vh; min-height: 300px` |
| 地图前面先出现队伍栏 | DOM 顺序是 party → stage → intel，手机改单列后原样保留 | `display:flex` + `order`：舞台 1 / 队伍 2 / 情报 3 |
| 顶栏碎成三行、图标掉到第二屏 | 66px 固定高度 + 桌面级间距 | 两行：身份+时钟 / 资源+图标；隐藏品牌字、存档 pill、资源标签 |
| 选人页只能看到前两排，无法滚动 | `#select-screen` 固定 `100vh; overflow:hidden` | 手机改成 `height:auto; overflow:visible`，卡片 238px 两列 |
| 地图看不到自己在哪，也无法缩放 | 初始 scale 1.24，只支持滚轮；当前节点在视口外 | 换人/移动自动居中；加 `- / + / ◎` 三个按钮（`window.MapView`） |
| 提示条盖住地图标题 | toast 固定 `top:78px` | 手机移到底部 `bottom:14px` |

新增 `docs/MOBILE.md`。验证：390×844 截图巡检 + CDP 断言 `scale 1.24 → 1.4632`、
当前节点在视口内、`scrollWidth == 390`（无横向溢出）、控制台 0 异常；
桌面 1600×1000 截图与 0.17.0 一致（缩放按钮在桌面不显示）。

**手机访问**（本次会话临时开）：`https://dentists-charms-joining-nova.trycloudflare.com`
（Cloudflare Quick Tunnel，PC 休眠/关机会断；同一 WiFi 可退用 `http://192.168.2.174:5178`）。

---

## 3.7 0.19.0：VN 舞台 + 13 场主线 + Boss 二阶段（M2 + M4 前半）

**这一版把「有游戏、没故事」补上了，并且 Boss 二阶段不再是假横幅。**

### 3.7.1 剧情：13 场真台词

- `web/js/story.js`：13 场主线 + 2 个结局，约 120 句，全部按 `STORY-BIBLE.md` 的 voice sheet 写。
  序章→第一幕请柬→拍卖人战前→落锤之后→幕间一→穹顶→执政官战前→一万片微笑→幕间二→零号轨道→主脑战前→最后一项议程（二选一）→两个结局。
- 触发点：新开局/续玩自动播序章（只看一次）；对首领交互前播战前戏，读完才开打；
  首领胜利后收尾戏叠在结算面板上；换幕时幕间 + 下一幕开场连着播；终局先演选择再弹结算。
- 标题页新增「剧情档案」，13 场随时回看，读完打标记（`localStorage.agi2046.seenScenes`）。

### 3.7.2 舞台：`vn.js` + 6 张专属背景

- 全屏 DOM 舞台：最多 3 人同屏、非说话人压暗、说话人微推近、逐字（标点后有停）、
  AUTO / 记录 / 跳过（Esc）、镜头预设（wide / near / insert / left / right）、
  特效（shake / flash / glitch）、选择支、手机竖屏适配、`prefers-reduced-motion` 时去掉逐字与位移但**保留信息**。
- L0 动画：每个立绘按 id 哈希取不同的呼吸相位（3.2–4.2 秒），避免三个人齐步呼吸。
- 表情：6 种情绪（calm/smile/serious/angry/worry/surprise）。**没有真差分图时**用程序化情绪层
  （轮廓光 + 汗滴/怒筋/惊讶线），有 `portraits/xxx-smile.webp` 时自动换图。见 §3.7.5。
- 6 张 VN 背景（`assets/vn/bg/`）：rain / auction / mirror / lift / core / dawn，1600×900，共 1.14MB，
  管线 `tools/art/vnbg.py`（裁水印 → cover → 底部安全区压暗 → 暗角）。
- Boss 场不用「贴一块立牌」，直接拿整幅 key art 当背景（`bg:'boss1'`），骷髅脸压在队伍头顶——
  实测比立牌干净得多（立牌会露出矩形边）。

### 3.7.3 Boss 二阶段：真规则，不是假横幅

`CombatEngine.TryEnterBossPhase`：首领血量首次 ≤50% 时切换，`CombatState.BossPhase=2` + `BossPhaseName`。

| Boss | 阶段名 | 规则变化 |
|---|---|---|
| 拍卖人 | 清仓 | 召出「记忆盲盒」；**盲盒活着时**每 2 轮回收 4 点，最多 3 次（先清盲盒） |
| 镜面执政官 | 分摊 | 分裂「执政官镜像」（36×0.55 HP）；分身在场时它受到的伤害 −40%（先清分身） |
| 零号主脑 | 上传倒计时 | 护盾清零、护甲/抗性 −3、受伤 +15%（核心暴露）；每 3 轮额外扣 1 点追踪 |

> 第一版是「每 2 轮无条件回 6 点」，实测 4 人自动队打到第 26 轮还在打——
> 那不是难度，是把玩家按在椅子上。现在回收有**前置条件（清盲盒）+ 次数上限（3 次）+ 可清召唤物**，
> 三条合起来才叫机制。
>
> 终局也改过两轮：主脑二阶段一开始「每 2 轮扣 1 追踪」，4 人自动队在第 23 轮被时钟打穿
> （`追踪条到底了`）。现在三处一起放宽：**进首领战 +2 追踪**（线索收束、追丢了）、
> **首领战拖延扣点从每 2 轮改为每 3 轮**、**主脑核心暴露受伤 +15%**。
> 规则改动都写在 `CombatEngine` 注释里，理由是「不要让时钟替玩家做决定」。

客户端 `trackBossPhase` 读服务端 `bossPhase`，放 `PHASE II` 横幅 + 场地压红 + 播 75/50/25% 三句 bark。
探针 `tools/audit/BossPhase.cs`：13/13（含「普通敌人掉血不会误触发」）。

### 3.7.4 联机剧情游标

房主推进时 `POST /api/room/{code}/cue`，其他人每 1.2s 轮询 `GET`，只读跟随（`VN.gotoLine`）。
游标只存内存、不进存档：每句都写进 `GameState` 会让 revision 一直跳、存档反复落盘。
`?bot=1` 或 `?story=off` 时整套剧情关闭（18 个自动化脚本已统一带上）。

### 3.7.5 差分的真实情况（重要）

`ImageGen` 没有 image-to-image，**无法用现有立绘生成同一张脸的差分**。
强行生成 96 张会是 96 个不同的人。所以这一版做的是：

- 6 个情绪**接口与文件名已经定死**（`portraits/{id}-{emo}.webp`），有图就换图；
- 没有图时用程序化情绪层，观感成立但不是「差分」；
- 要真差分，得用支持参考图/ControlNet 的通道重跑，或手工绘制。

### 3.7.6 验收数字（0.19.0）

| 项 | 结果 |
|---|---|
| `vn-shots.mjs` | 20/20（含手机对话框不出屏、选择框在屏内、跳过标记已读） |
| `story-flow.mjs` | 8/8（续玩自动播序章、读完关闭、再次进入不重播、Esc 跳过） |
| `BossPhase.cs` | 14/14（三套阶段规则 + 普通敌人不误触发 + 掉防） |
| DataAudit | 85/85 |
| aoe / segment / awaken / room / mobile | 17/17、6/6、9/9、23/23、5/5 |
| 4 人 `browser-e2e` | **457 秒通关**（`victory`，三幕 + 两次幕间，`failures: []`、`consoleErrors: []`） |

### 3.7.7 CG 播放层（0.19.2）

预渲染视频过场，**只能整屏不透明**（WebM alpha 在 Safari 不播、HEVC alpha 在 Chrome 不播），
文字与跳过键仍在 DOM。

- `web/js/cg.js`：`CG.play(id, {onEnd})`；8 秒没 `canplay` 就放弃；解码失败不记为已看；
  播完释放解码器；跳过键 + ESC + 点画面两次退出；`register()` 可运行时登记（本地试片用）。
- `tools/video/prep.py`：ffmpeg 压 720p / crf28 / faststart / 剥音轨 + 抽 0.6s 首帧当 poster。
  实测：5 秒 720p 从 2.2MB 降到 **446KB**；真实带雨素材预计 1.5–3MB。
- 接线：点「接入协议 / 继续行动」→ 开场 CG → 序章 VN；看完记 `localStorage.agi2046.seenCG`。
- 巡检：`tools/ui/cg-check.mjs` 12 项（解码 / 起播 / 跳过 / 不重复 / 手机铺满 / 无异常）。
- **开场片已上线**：`web/assets/cg/intro.mp4`（1344×720 / 850KB / 5.17s 裁到 5s），
  生成器在左上角打了「AI生成」，用 `--crop 48,0,0,0` 裁掉。
- 完整约束与坑见 [`docs/CG.md`](docs/CG.md)；`CG_REAL=1 node tools/ui/cg-check.mjs` 验真片。
- **0.19.3 修「看不到开场 CG」**：原来 CG 挂在「序章没看过」这个条件里面，序章已读的人永远看不到。
  现在 CG 与序章各自判断；标题页加「开场动画」按钮、剧情档案加 CG 行、`?cg=intro` 深链，
  三条都能强制重看（绕过 seen / reduce-motion / 省流量）。`CG.status()` 给出没播的原因。
- **同批修掉**：`UseDefaultFiles` 的 302 会丢掉查询串，`?bot=1` / `?story=off` / `?cg=intro`
  其实一直没生效；改成 `/` → `/index.html` 的中间件重写，查询串保留。

### 3.7.8 觉醒：16 段「找回自我」

觉醒原本只有一句 toast + 技能替换。现在复用 VN 舞台做 16 段短场（每段 3 句）：
一句旁白 → 该角色在 `STORY-BIBLE` 里的「只剩一句话」→ 一句起身。
台词表在 `story.js` 的 `AWAKEN_LINES`，场景由代码批量生成（`awaken-{charId}`）。
零新美术：`insert` 镜头推近 + `core` 背景 + 该角色自己的颜色。
触发不看动作类型，只比较 `awakened` 从 false → true，所以任何入口都不会漏。

### 3.7.9 顺手修的真 bug

`portraits/jev.webp` 从 0.16 起就是**不透明黑底**（16 张里唯一没抠干净的一张），
以前只在 40px 头像里看不出来，VN 放大到 800px 就成一块黑方块。
已用「纯品红底重生成 + keyout」替换，透明率 70%。

---

## 3.6 0.18.0：战场有地点，战斗有字效（M0 + M1 第一幕）

- **M0 故事圣经**：`docs/STORY-BIBLE.md` —— 客星/归档协议、三个 Boss 档案（各 5 句台词）、
  13 场主线大纲、16 页 voice sheet（想要/害怕/说话习惯/对客星/只剩一句）、写作规则。
- **M1 战场背景**：第一幕 4 张（下城区 / 数据中层 / 拍卖场 / 精英金库），1600×900 WebP，共 853KB；
  `battle3d.js` 把背景 plane 挂在相机前（z=-40），cover 裁切 + 视差 + 暗角，节点按 `district` 选图。
- **M1 战斗字效**：`web/js/fx.js` + `style.css` 第 21 节：
  - 普通战斗 `ENGAGE` 窄条 0.6s；精英 `DANGER` 红黑斜纹 + 警灯 1.2s；
  - 精英/Boss 胜利 `MISSION COMPLETE` 印章 + S/A/B + 奖励 1.6s；普通胜利 `CLEAR` 0.6s；
  - 失败 `SIGNAL LOST` 1.8s；Boss 半血 `PHASE II` 1.2s；终极技 `FULL BURST` 0.9s；
  - 全部 CSS/SVG，pointer-events:none；帮助弹窗可切「完整/简化/关闭」；减少动态时静态印章。
- **巡检**：`tools/ui/fx-shots.mjs`（9 张截图 + 5 项断言）、`tools/ui/flow-check.mjs`（真实进战斗 4 项断言）全过；
  4 人 `browser-e2e` **479 秒**通关（`failures: []` / `consoleErrors: []`）；DataAudit 85/85、room 23/23。
- **已知缺口（0.19 已补）**：第二/三幕战场背景已全部落地；Boss 二阶段已改为真规则；
  FULL BURST 已接终极技，但头像/技能名需要按角色再调一版。

---

## 4. 0.13–0.16 的账（都已落地）

| 版本 | 内容 |
|---|---|
| **0.13.0** | 命中保底 1 伤；`e_heal`/`e_shield_ally` 冷却 3；`dash/retreat/rewind/copy_ally` 补 `.Special` + 启动断言；撤离检定 `d100 ≤ 40+(SPD-50)/2`（失败本回合作废并遭追击）；联机鉴权收紧（房间对局强制 roomCode+token）；服务器属性/敌人 Focus/战斗快照修复；敌人意图预告；技能卡伤害预览；默认全景镜头 |
| **0.13.1** | 时钟从「每轮 −1」改为 `PurgeTicks`：每 4 个玩家回合 −1；普通战前 5 轮、Boss 战前 12 轮免费，之后每 2 轮 −1；2 人普通遭遇 3 敌 → 2 敌；真机 1/2/3/4 人全部通关（196/289/355/465 秒） |
| **0.14.x** | 敌人名牌 `甲 X · 抗 Y · 受 Z`（随选中技能实时重算）；修正 23 处技能文案；技能卡显示命中率与期望伤害；幕间三页签（情报/强化/换装）；背包装备显示属性 diff |
| **0.15.0** | 第三幕 Boss 更正为 `e_boss_zero`（并新增两个压力点）；`purge_item`（零号脉冲每次全队归档 1 件消耗品）；删除请求增加 `execute` 与残血优先处决；觉醒改为**每人一次**、每幕 2 个节点（层 7/9）；觉醒共鸣（每层全队 +1 甲/+1 抗/+5 生命，上限 3）；支线扩到 15 条、按 seed 抽 2 条 |
| **0.15.1** | UI v2：整份 `style.css` 按设计令牌重写（7 级字号 / 6 级间距 / 3 级描边圆角动效）；<11px 文本 311 → 0；时钟独立；地图图例收进 `<details>`；技能卡大数字；弹窗三档宽度；顶栏与战斗按钮换自绘 SVG 图标 |
| **0.16.0** | 22 张专属敌人 chibi 立绘（原来 4 张占位图共用）；16 张角色立绘去底；`battle3d.js` 按 `enemyId` 加载、缺图回退；立绘尺寸/名牌高度/阵营光晕配套调整 |

---

## 5. 关键文件

```text
web/
├─ index.html                 资源版本 ?v=171，标题页主视觉层，cine-layer
├─ css/style.css              设计令牌 + 第 18 节过场演出
├─ js/cinematics.js           ★ 0.17 新增：过场/回合演出层（window.Cine）
├─ js/app.js                  showScreen / cuePhaseCinematics / showTurnTransition / trackCombatFlow
├─ js/battle3d.js             Three.js 战场（立绘、名牌、光晕、点击拾取）
├─ js/map3d.js                地图雨幕背景
├─ assets/keyart/             ★ 0.17 新增：title / act1-3 / boss1-3
├─ assets/icons/item-*.svg    ★ 0.17 新增：5 枚消耗品图标
├─ assets/enemies/*.webp      22 张敌人立绘（0.16）
└─ assets/portraits/*.webp    16 张角色立绘（0.16 去底）

src/
├─ AGI2046.Rules/             纯规则库（战斗/探索/地图/数据）
└─ AGI2046.Server/            Minimal API + 房间 + 存档

tools/
├─ art/keyart.py              主视觉后期（裁水印/擦字/暗角/WebP）
├─ art/keyout*.py             立绘抠图
├─ ui/cine-shots.mjs          ★ 0.17 新增：8 张过场截图 + 真实流程断言
├─ ui/shots.mjs               常规界面巡检（9 张）
└─ e2e/*.mjs                  浏览器回归

docs/
├─ TRANSITIONS.md             ★ 0.17 新增：过场设计、接入点、时间预算
├─ ART.md                     美术管线（0.16 立绘 + 0.17 主视觉）
├─ UI-V2.md                   0.15.1 UI 重写依据
└─ AUDIT-2026-10-25.md        0.13 审计与修复记录
```

---

## 6. 验证

### 6.1 本批次跑过的

| 套件 | 结果 |
|---|---|
| `tools/ui/cine-shots.mjs` | 8 张截图；真实点击流程断言 `cine-travel` + `cine-encounter` 均触发 |
| `tools/e2e/aoe-ui.mjs` | **17/17** |
| `tools/e2e/spectate-check.mjs` | **13/13** |
| `tools/e2e/awaken-ui.mjs` | **9/9** |
| `tools/e2e/room-ui.mjs` | **23/23**（过场断言已改为 `.cine-turn, .turn-transition`） |
| `tools/e2e/segment-check.mjs` | **6/6**（跑前需 `node tools/smoke/aoe-prepare.mjs`，否则用的是过期存档） |
| `dotnet build` | 0 警告 0 错误 |

### 6.2 完整通关

`tools/e2e/browser-e2e.mjs`（4 人、种子 12345）：**471 秒，三幕 + 三次首领 + 两次幕间，终局 `victory`，
全员 Lv.9，`failures: []`，`consoleErrors: []`**。
比 0.16 的 465 秒多 6 秒——过场总时长约 12 分钟里只有 16 秒是真正挡屏幕的，
其余（换人小卡 / 战斗底部横幅）不拦操作，所以自动流程几乎没被拖慢。

顺带修了一个只有跑完整流程才会看到的问题：**战斗横幅会飘到幕间/结算弹窗上**。
现在 `mountModal()` 里调用 `Cine.clear()`（弹窗是阻塞信息，过场让位），
离开战斗时再 `Cine.dismiss('.cine-combat-turn, .cine-round')` 清掉残留。

### 6.3 已知的测试坑

- **无头浏览器默认 `prefers-reduced-motion: reduce`**：会让所有过场按「无动画」处理。
  巡检脚本必须 `Emulation.setEmulatedMedia` 改成 `no-preference`，否则截出来永远是静态图。
- **多个浏览器测试并发会互相挤掉 CDP 连接**（本轮 `browser-e2e` 曾因此中断一次）。
  长测试单独跑；短套件串行跑。
- `segment-check` 依赖 `tools/smoke/.aoe-sid` 里的存档，存档过期会一路 FAIL（不是代码坏了）。

---

## 7. 已知限制

1. **没做真人联机试玩**：过场的 1.1–1.5 秒在双人局里是否嫌慢、首领战 2.4 秒是否太长，需要真人判断。
2. **主视觉是生成图**，不是手绘；风格统一，但放大到 4K 会有笔触噪点。标题图左上角是擦字补的
   （已看不出，但别在那块再叠高对比元素）。
3. **过场没有跳过键**：目前靠时长控制（最长 2.5s），如果试玩觉得烦，优先给 `Cine` 加「点击跳过」。
4. **音频仍是程序化音效**，没有配音/动态混音。headless 无法验证听感。
5. **Unity 版已移除（0.19.1）**：`unity/` 整份删除，只维护 Web 版；需要时从 git 历史取回（见 README §7.5）。
6. **无账号体系**：联机靠 6 位房间码 + 座位 token，知道房间码即可加入。
7. **首屏 7 张主视觉共 969KB**：标题图单独 203KB，可接受；若要更省，可给 `title.webp` 出 960px 版本。

---

## 8. 下一会话建议顺序

1. 起服务，确认 `/api/health` 是 `0.18.0`；跑 `cine-shots.mjs` 与 `fx-shots.mjs` 看过场/字效。
2. 真人（或双浏览器手工）打一局，重点记录：
   - 进战斗横幅是否挡住关键信息；
   - 探索换轮的全屏卡是否打断节奏；
   - 首领进场 2.4 秒是否想跳过。
3. 按手感调 `cinematics.js` 里的 `hold` 时长（集中在各 API 的 `play(..., hold)` 参数），不要改结构。
4. 若要做「跳过」：给 `.cine` 加点击监听（需要临时把 `pointer-events` 打开），只跳过当前层。
5. 回归：`browser-e2e` → `aoe-ui` → `room-ui` → `segment-check`（先 prepare）→ `awaken-ui` → `spectate`。
6. 有余力再补：胜利/失败结算主视觉、Boss 第二阶段演出、道具图标扩展到装备稀有度边框。

---

## 9. 一句话交接

0.17.1 在 0.17.0 之上补了**手机布局**（棋盘高度、舞台优先、两行顶栏、地图缩放/自动居中），
让 390×844 真正能玩；桌面布局未变。

0.17.0 在 0.16（22 张敌人立绘 + 16 张角色去底）之上，补了**过场演出**与**主视觉**：
换屏、进战斗、换人、换轮四个瞬间各有独立演出，首领战有整幅 key art，幕间有三幕场景图；
所有演出 `pointer-events:none`、不写状态、尊重减少动态偏好（静态仍有信息）。
新增 `web/js/cinematics.js`、`tools/art/keyart.py`、`tools/ui/cine-shots.mjs`、`docs/TRANSITIONS.md`。
回归：aoe 17/17、spectate 13/13、awaken 9/9、room 23/23、segment 6/6，构建 0 警告 0 错误。
