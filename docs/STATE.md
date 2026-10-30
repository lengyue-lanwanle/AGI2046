# 当前状态快照 / Handoff（下个会话先读这一页）

> **历史文档，仅作背景。**
> 当前实现状态、验收数字与已知限制一律以 [`HANDOFF.md`](../HANDOFF.md) 和 [`README.md`](../README.md) 为准；
> 本文描述的是当时的计划或审计快照，其中的版本号、文件路径和行为可能已经变化。

> ⚠️ **本页是 0.12 的快照；0.19.1 的当前状态请看 [`HANDOFF.md`](../HANDOFF.md)。**
> **0.19.1 起 Unity 版已整份移除，本页里所有 Unity 相关的路径与命令都只作历史记录，不要照跑。**
>
> **0.19.0（故事上线 + Boss 二阶段）**：13 场 VN（120 句 / 6 背景 / 情绪与镜头 / 联机跟随）、
> 剧情档案、首领二阶段三条真规则。见 [`PLAN-0.18.md`](PLAN-0.18.md) 第 13.6 节。
>
> **0.18.0（战场有地点 + 战斗有节奏）**：第一幕 4 张战场背景挂在棋盘后方；
> `ENGAGE` / `DANGER` / `MISSION COMPLETE` / `SIGNAL LOST` / `PHASE II` / `FULL BURST` 字效上线；
> M0 故事圣经（客星、三 Boss、13 场、16 页 voice sheet）已交。见 [`PLAN-0.18.md`](PLAN-0.18.md)。
>
> **0.17.0（过场演出 + 主视觉）**：四个瞬间（换屏 / 进战斗 / 换人 / 换轮）各有独立演出；
> 标题、三幕、三首领 7 张主视觉；道具换 SVG 图标。实现与时间预算见 [`TRANSITIONS.md`](TRANSITIONS.md)。
>
> **0.17.0 验收基线**：`DataAudit 85/85`；aoe 17/17、spectate 13/13、awaken 9/9、room 23/23、segment 6/6；
> 真机 `browser-e2e` 4 人 **471 秒**通关三幕（`failures: []`、`consoleErrors: []`）。
>
> ⚠️ **以下是 0.12 的快照。0.13.0 / 0.13.1 的改动见 [`docs/AUDIT-2026-10-25.md`](AUDIT-2026-10-25.md) §9 与 [`docs/PLAN-0.13.md`](PLAN-0.13.md)**：
> 战斗轮计入时钟、撤离检定、敌方意图预告、技能卡伤害预览、剩余 AP 折算治疗、失败记录、联机鉴权收紧；
> **0.13.1 修掉了少人局的时钟歧视**（时钟从「每轮 -1」改成「每 4 个玩家回合 -1」，2 人队不再被赶路时钟判死）。
> 下面提到的「已知待办」有一部分已经过时了。
>
> **0.15.1（UI v2）**：整份样式表重写，设计依据见 [`docs/UI-V2.md`](UI-V2.md)。
>
> **当前可复现的验收基线**：`DataAudit 85/85`；15 个套件全绿；真机 `browser-e2e` 2 人 286 秒通关三幕。

> 时间：2026-10-24 15:58
> 分支：`main`，最新提交 `de3a403`
> 服务：`http://localhost:5178`（`dotnet run --project src/AGI2046.Server`），前端 `?v=108`
> 细节：`docs/ART-SOURCES.md`（素材许可）。~~`docs/HANDOFF-UNITY.md`~~ 已随 Unity 版删除（0.19.1）。

---

## 一、技术线

**Web + Three.js 唯一主线（Unity 版已于 0.19.1 移除）。**

| 层 | 位置 | 说明 |
|---|---|---|
| 规则层 | `src/AGI2046.Rules`（C#） | 单一真相源，UI 只能通过 `GameEngine`/API 改状态 |
| 服务端 | `src/AGI2046.Server`（Minimal API） | `dotnet run`，端口 5178；存档在 `Data/` |
| 前端 | `web/`（原生 HTML/CSS/JS，无构建） | `app.js` 单文件 + `style.css` |
| 战斗 3D | `web/js/battle3d.js` | Three.js 0.149（`web/vendor/three.min.js`） |
| 地图氛围 | `web/js/map3d.js` | 雨丝 + 光点，DOM 地图不动 |
| ~~Unity~~ | ~~`unity/AGI2046Unity/`~~ | 已删除（0.19.1）；需要时从 git 历史取回 |

## 二、本会话完成的批次

| 批次 | 内容 | 提交 |
|---|---|---|
| 8 | 程序化美术第一期（Pillow 生成 33 张资产） | `e0badb4` |
| 9 | 转向 Web + Three.js，3D 战斗棋盘原型 | `5417d73` |
| 10 | 地图蜿蜒化（坐标抖动）+ 曲线连线 + 缩放拖拽 | `768b1a8` |
| 11 | 3D 战斗增强：名字血条 / 行动环 / 受击 / 射程 / 地图雨幕 | `5d11a96` |
| 12 | 素材接入：game-icons 图标、Kenney 打击音、Poly Haven 地面、OpenGameArt BGM | `165b182` |
| 13 | 施法前冲 + 落点地环（事件驱动、音画同步） | `9215e83` |
| — | 状态快照 | `1f07d8e` |
| — | 兼容/修复：操作提示 + 指针光标 | `4118e9f` |
| — | **修复 3D 点击与索敌**（两轮：单位拾取传参、屏幕空间拾取） | `80eb441`、`0c4f51c` |
| 14 | UI 字号两轮放大 | `d0a3174`、`701ba24` |
| 15 | 战斗地板改赛博玻璃（多轮迭代） | `a7849b8`、`198c35f`、`35be3aa` |
| 16 | **玻璃砖 + 电路板底板**（当前形态） | `a56181e`、`773ea0a` |
| — | 状态快照（交接） | `f99f371` |
| 17 | **范围技落点修正 + 相机自适应 + 敌人立绘 + 电路板加密** | `ee1566c` |
| 18 | **专注战斗模式**（战斗中收起左右侧栏，战场 502 → 1078）+ 落点环边界检查 | `a140c89` |
| 19 | **联机观战**（只读界面 + 回放对方动作） | `e63664a` |
| 20 | 专注战斗的观战细化：打击帧 / 飘字 / 震屏 | `63ca370` |
| 21 | **演出队列 + 飘字池化 + 伤害分段 + 赛博骰子** | `de3a403` |

## 三、本会话踩过的坑（重要）

1. **3D 拾取不能用 raycast 兜底**：真实战斗面板尺寸下射线坐标错位，最终改成「把格子/单位投影到屏幕、取最近且在阈值内」的屏幕空间匹配（`pickAt`）。
2. **`unitObjects` 存的是包装对象**（`{group, body, plate…}`），`intersectObjects` 收到非 `Object3D` 会抛 `layers.test` 异常，**整个 pointerdown 中断**——改成传 `entry.group`。
3. **战斗存档可能停在敌方回合中途**：`app.js` 读状态/轮询房间时，服务端会 `CombatEngine.Resume` 把敌方回合补完并 `Revision++`；否则玩家点不动。
4. **`index.html` 里每个 `<script>` 的 `?v=` 必须统一**：`battle3d.js?v=1` 曾让浏览器一直跑旧脚本，改了代码看不到效果。现在 `bump-web-version.mjs` 统一处理 5 处。
5. **叙事卡 modal 会吃掉点击**：`story-body` 覆盖在战斗上时，点击目标是它而不是 canvas。进入战斗先关叙事卡。
6. **半透明层会抢 Sprite 的渲染顺序**：立绘/名字牌要 `renderOrder 12/13` + `depthTest: false`。
7. **`TargetType.Area` 是个空壳**：枚举里有、`CombatEngine` 有分支，但**没有任何技能用它**。真实群体技全走 `TargetType.AllEnemies` / `AllAllies`。前端判定要按 camelCase 的 `allEnemies`，别再写 `'area'`。
8. **3D 相机不能写死机位**：右侧技能面板吃掉 300px，画布是竖长条；固定 `(0, 8.6, 7.8)` 会把棋盘两侧裁掉、玩家单位直接出框。现在 `fitCamera()` 按棋盘四角投影迭代拉远并竖直居中。
9. **`lastAction` 只留最后一条是个坑**：一次 action 会连带跑敌方回合，玩家技能的表现会被敌人动作覆盖（飘字张冠李戴、伤害数字对不上）。现在服务端给 `lastActions` 列表，前端按 seq 逐条回放，播放游标 `S.playedSeq` 进新战斗时用 `syncCastCursor` 对齐。
10. **联机的叙事卡是全局共享的**：`state.PendingBeat` 只有一份，观战者真去 `ackBeat` 会把房主那张序章卡也清掉；而战斗中 `ackBeat` 又会被服务端「还没有轮到你」拒掉（`Program.cs` 的回合守卫拦所有动作）。所以观战者只本地关（`S.dismissedBeats`），不发请求。
11. **观战端拿不到动作细节**：`CombatState` 只有 `LastRoll`/`LastPlayerRoll`，没有「谁对谁放了什么」。为此加了 `LastActions`（seq / casterId / skillId / 目标格 / 受影响格 / 是否远程 / 判定次数 / 逐目标伤害），`ExecuteSkill` 里写入，前端按 seq 回放。
12. **headless 视口默认很小**（约 500×320），会把叙事卡裁一半、让人误判布局：CDP 里先 `Emulation.setDeviceMetricsOverride` 定死 1440×900，量 canvas 尺寸才发现问题。

## 四、当前视觉规范

- **字号**：节点名 15px/700、技能名 15px/700、日志 14px、按钮 15px/600、资源 13/15px；溢出处用滚动（`party-list`、`intel-panel`、`combat-side`、`hex-stage`）。
- **地图**：曲线连线、节点坐标三层抖动、默认 1.24 倍缩放、可拖拽；玩家标记 `#map-token` 0.46s 过渡滑动。
- **战斗**：玻璃砖（`MeshPhysicalMaterial`，metalness .42 / roughness .1 / opacity .28–.42，`depthWrite:false`）+ 每块 `EdgesGeometry` 青色棱边；下方 0.1 处贴**程序生成电路板**（`makeCircuitTexture`：蓝紫渐变 + 180 条折线 + 70 条打底暗线 + 95 个焊盘 + 芯片框）。
- **相机**：不再用固定机位，`fitCamera()` 按棋盘包围盒四角投影迭代拉远（四角限定 NDC ±0.9/±0.88）再竖直居中；`resize()` 时重算，宽窄画布都保证棋盘完整。
- **单位**：玩家用 `portraits3d/<id>.png`（回退 `portraits/<id>.webp`）；敌人按 `u.color` 色相取 `portraits3d/enemy_{yellow,green,blue,red}.png`，都没有才退回八面体色块。
- **动画**：地图标记滑动；3D 单位换格 0.34s 插值 + 0.3 格跳跃弧线；贴身攻击 0.26s 前冲，远程/群体/自身增益改为 0.3s 原地抬手；落点环单体一格、群体逐目标（青=单体、金=范围），都会跳过棋盘外的格子。
- **演出节奏**：结算完成 → 0.22s 打击帧（抖动 + 飘字 + 震屏）→ 落点环；伤害按判定次数拆段（每段 0.14s）。飘字走对象池，玩家头顶 2.15 / 敌人 1.8。
- **掷骰**：先摆空位，每颗乱数滚 0.24s 再定格（间隔 0.14s），全亮后才出结算文字。
- **布局**：**专注战斗**——战斗中 `.game-layout` 加 `focus-combat`，隐藏 `party-panel` + `intel-panel`，战场 502 → 1078px；战斗面板右上角「展开侧栏 / 专注战斗」随时切换，偏好记在 `S.focusCombat`，退出战斗自动还原。

## 四½、怎么和朋友联机（公网，不是只有局域网）

**双击项目根目录的 `启动联机.bat`** 即可（内部就是 `node tools/online.mjs`）。

命令行等价写法：

```powershell
cd D:\AGI2046
node tools/online.mjs          # Cloudflare Quick Tunnel
node tools/online.mjs serveo   # 兜底：ssh 反向隧道
```

> `启动联机.bat` 本身只写 ASCII：cmd 解析含中文的 UTF-8 bat 会错位（`'�' is not
> recognized`），所以中文提示全部由 `online.mjs` 打印，bat 只做检查 + 转交。

终端会打印 `https://xxx.trycloudflare.com`，同时写进 `data/tunnel.json`；
服务端通过 `/api/meta`、`/api/health` 的 `publicUrl` 把它交给前端，
所以房间界面的「复制邀请」自动就是公网地址 + 房间码。

注意：
- 免费 quick tunnel 的**地址每次启动都会变**，换地址要重新发给朋友；也没有 uptime 保证。
- 要固定地址得用 Cloudflare 命名隧道（需账号+域名）或自己的公网服务器。
- 隧道进程要一直开着；关掉窗口就断。
- 同一 WiFi 下也可以直接用局域网地址（`http://<本机IP>:5178`），更快。

## 五、如何验收 / 继续

```powershell
# 服务端
node tools/e2e/systems-check.mjs     # 32/32
node tools/e2e/room-check.mjs        # 33/33

# Web 战斗（造局 → CDP 跑完整一局）
node tools/smoke/aoe-prepare.mjs     # 建「疾风 + 两个相邻敌人」的战斗存档
node tools/e2e/aoe-ui.mjs            # 17/17，含专注战斗宽度、范围技落点、战斗胜利结算

# 联机观战
node tools/e2e/spectate-check.mjs    # 13/13，造房间 → p1 单独开战 → p2 只读 + 回放
node tools/e2e/segment-check.mjs     # 6/6，骰子逐颗揭示 + 分段飘字
node tools/e2e/room-shot.mjs <code> <token> <playerId>   # 以某个成员身份截图
```

**用 CDP 直接驱动浏览器验证 UI**：

```powershell
# 启动带调试端口的浏览器（独立 profile）
msedge --remote-debugging-port=9222 --user-data-dir=D:\工作区\edge-cdp http://localhost:5178/?v=108
# 然后用 node + WebSocket 连 http://127.0.0.1:9222/json/list
# 常用：Runtime.evaluate 写 localStorage 存档 id → Page.reload → 点 #btn-resume → Page.captureScreenshot
```

> 现成模板见 `tools/e2e/aoe-ui.mjs`：**先 `Emulation.setDeviceMetricsOverride` 定死 1440×900**，否则 headless 视口只有 500×320，截图会骗人。战斗内点格子直接派发 `battle3d-pick` 事件（等价真实点击），点技能卡用 `.skill-card[data-skill-id=...]`。

## 六、待办（按优先级）

1. **观战还能做什么**：现在观战只能看和点属性。可选加：观战者给场上队友打气/发弹幕、按 `Tab` 切队友视角、轮询从 1.5s 缩到 1s 让动作更跟手。
2. **BGM / 打击音听感**：`playBgmTrack` 增益 0.075；Kenney `impactGeneric` 偏闷，可换 `impactMetal`。
3. **专注战斗下的侧栏取舍**：隐藏左右侧栏后，战斗中看不到队友血量和任务进度条（3D 战场上只有名字血条）。若嫌信息不够，可考虑做成「侧栏半透明浮层」而不是整列隐藏。
4. **敌人立绘质感**：现在 `enemy_*.png` 是程序生成的方块脸，贴上去像小卡片，可能值得重画或加底座/投影。
5. **地图未揭示节点雾化 + 路径光点**（用户提过，未做）。
6. **战斗结算浮层残留**：胜利弹窗弹出时，底下的 `ATTACK //` 命中详情还留在画面上，结束时应清掉。
7. **玻璃砖亮度 / 透明度**待用户主观确认（现在是 opacity .28–.42）。
8. ~~Unity 版若恢复~~：该分支已删除（0.19.1），这条不再适用。

## 七、素材与许可

见 `docs/ART-SOURCES.md`：game-icons（CC BY 3.0，作者 lorc/delapouite）、Kenney Impact Sounds（CC0）、OpenGameArt「Residual World」（CC0，SRG774）、Poly Haven `brushed_concrete_04`（CC0，目前未用于战场）。

## 八、注意

- 战场视觉是本会话反复迭代最多的部分（玻璃 → 地板/灯带 → 回退 → 玻璃砖 → 电路板），**改动前先读第五节「当前视觉规范」**，避免再走回头路。
- 所有服务端修复都跑过 `systems-check` / `room-check`。~~改规则层记得跑 `tools/sync-rules-to-unity.mjs`~~——该脚本已随 Unity 版删除（0.19.1）。
