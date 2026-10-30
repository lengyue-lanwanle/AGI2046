# UI v2「NEON TERMINAL」— 重做记录与设计依据

> **历史文档，仅作背景。**
> 当前实现状态、验收数字与已知限制一律以 [`HANDOFF.md`](../HANDOFF.md) 和 [`README.md`](../README.md) 为准；
> 本文描述的是当时的计划或审计快照，其中的版本号、文件路径和行为可能已经变化。

> 版本：0.15 → 0.15.1（纯前端，不动规则层）
> 范围：`web/css/style.css`（整份重写）、`web/index.html`（结构）、`web/js/app.js`（渲染层）、
> `web/assets/icons/ui-*.svg`（6 个线性图标）
> 验证：`DataAudit 85/85`、15 个既有套件全绿、真机 2 人 **286 秒通关三幕**（`failures: []`、`consoleErrors: []`）

---

## 0. 一句话结论

老 UI 的问题不是"不好看"，是**没有系统**：字号有 7/8/9/10/11/12/13/14/15 九种，同一个类名被三批"可读性上调"补丁反复覆盖，
还有 3 个 CSS 变量（`--mono` / `--dim` / `--gold`）根本没定义。这次不是"调参"，是把整套东西按一份规格重写，
并且把"能不能看清"变成可测量的指标。

---

## 1. 先量，再改

改之前的实测（1600×1000，地图界面）：

| 指标 | 改前 | 改后 |
|---|---|---|
| 小于 11px 的文本元素 | **311 个** | **0 个** |
| 字号种类（去重） | 9 种（7/8/9/10/11/12/13/14/15） | 7 级阶梯（11/12/13/14/17/21/30） |
| 未定义的 CSS 变量 | 3 个（`--mono` `--dim` `--gold`），波及 20+ 处声明 | 0 |
| 同名选择器重复定义 | 三批补丁重复覆盖 `.btn` `.log-entry` `.skill-card` 等 | 0（每类只写一次） |
| 地图头部常驻图例 | 15 项，占掉整行 | 收进「图例」弹层 |
| 战斗侧栏 4 张技能卡所需高度 | 454px（容器只有 395px → 第 4 张被切） | 4 张全显示，不滚动 |
| 标题页立绘墙 | meta 未就绪时永久空白（竞态） | 加载完成后再渲染 |

**体检脚本**：`tools/ui/shots.mjs`（九屏截图）、`tools/ui/measure.mjs`（字号/布局度量）。

### 1.1 老 UI 的四个具体病

1. **字号失控**。`style.css` 末尾有三段注释都叫"可读性上调"，同一批选择器被写了三遍（9px → 11px → 15px），
   结果是 `.log-entry` 14px、`.log-entry .lr` 10px、`.skill-card .sc-meta` 7px 共存——同一张卡里差一倍。
2. **信息层级倒挂**。技能卡上"伤害 18"是 10px，装饰性的 eyebrow 反而是 11px；玩家最需要的数字最小。
3. **重复信息占面积**。四张队伍卡每张都把武器名、护甲名各写一遍（还都一样），把真正的血量挤到第二行。
4. **失效的组件**。`.save-pill { font-family: var(--mono) }` 因为变量没定义整条声明被丢弃；
   `.modal-actions`（道具袋的底部按钮）根本没有样式，所以"关闭"是裸的。

---

## 2. 参考了哪些游戏，抄了什么

### 2.1 For The King —— 反面教材，最有价值

评测里对它的 UI 批评非常具体：

> "the overall experience is marred by a user interface that struggles to convey even the most basic information"
> "primary and secondary actions are denoted by inconspicuous symbols"
> "the UI is very small. This can cause a lot of eye-strain"

来源：[For the King 2 PC Review](https://retro-gamer.net/2023/11/10/for-the-king-2-pc-review)、
[Phenixx Gaming 评测](https://web.phenixxgaming.com/?post_type=post&p=3181)

**抄的是"不要做什么"**：本作原来四个顶栏按钮就是 `▤ ♪ ? ⟲` 四个不起眼符号，技能卡靠 7px 的小字标注射程/冷却。
这次全部换成**图形 + 文字**并列：顶栏改线性图标（仍带 tooltip），技能卡把"射程/命中/期望"写成 11px 的完整短句。

### 2.2 Slay the Spire —— 信息传递四字诀

一篇拆解把它总结为「快、准、狠、齐」：

- **快**：能量消耗、效果、敌人意图、血量一眼可读；
- **准**：文案不产生二义性（"2 次 75% 伤害"这种就属于不准）；
- **狠**：只给该给的，不把信息一股脑塞给玩家；
- **齐**：颜色 + 图标双编码（黄=词条、绿=增益、红=减益），图标形状随危险度变化。

来源：[由《Slay the Spire》浅谈信息传递](https://game.3loumao.org/187843805)、
[Slay the Spire Visual Design Analysis](https://halabaojia.com/collection/20260112-slay-the-spire-visual-design-analysis)

**落到本作**：
- 颜色语义固定：青=系统/己方、粉=敌方/危险、琥珀=资源、绿=可行/增益、紫=谜团；
- 不用颜色单独承载信息（可访问性）：时钟同时用**填充长度 + 刻度 + 数字**，点数用**形状**（AP 方块 / Focus 圆点）；
- 伤害数字放大到 17px 等宽，参数退到 11px——**数字优先于形容词**。

### 2.3 Darkest Dungeon —— 克制

> "The interface visualises position, torch level, stress, bleed and blight with admirable restraint and no information overload."
> 压力用**白色小方块**表示（不是只靠颜色），敌人靠**剪影**就能读出威胁。

来源：[Darkest Dungeon Review](https://gamegeeker.com/games/darkest-dungeon-262060/review)、
[Stress 指示器说明](https://www.gameslearningsociety.org/wiki/how-do-you-tell-stress-in-darkest-dungeon)

**落到本作**：未揭示节点从"128px 的未知信号卡片"改成 **44px 的暗色圆点**——地图上 40 多个"未知信号"框是纯噪声。

### 2.4 排版通用标准（用来定硬指标）

> 正文最小 16pt、行高 1.4–1.6、全大写要限量（可读性下降 10–15%）、对比度 ≥4.5:1（正文）/3:1（大字）、
> 避免纯黑纯白、HUD 关键数字 ≥28px。

来源：[Game UI Design: Complete Interface Guide 2025](https://generalistprogrammer.com/tutorials/game-ui-design-complete-interface-guide-2025)、
[Game Accessibility](https://generalistprogrammer.com/game-accessibility)

**落到本作**：正文 13px、元信息 12px、**任何文本不低于 11px**（可被 `measure.mjs` 验证）、
标题用浅白 `#e9f3ff` 而不是纯白、正文用 `#9db2c8` 而不是纯灰。

---

## 3. 设计系统

### 3.1 令牌（`style.css` 第 1 节）

| 类别 | 值 | 说明 |
|---|---|---|
| 表面 | `--surface-1/2/3`、`--field` | 只有 4 级，不再出现 12 种透明度黑 |
| 描边 | `--line` / `--line-strong` / `--line-hot` | 三级，强调态才用第三级 |
| 文字 | `--text #e9f3ff` / `--muted #9db2c8` / `--faint #64788e` | 三级，正文对比度 ~7:1 |
| 语义 | cyan / pink / lime / amber / violet / red | 一色一义，不复用 |
| 字号 | 11 / 12 / 13 / 14 / 17 / 21 / 30 | 7 级阶梯 |
| 间距 | 4 / 8 / 12 / 16 / 24 / 32 | 6 级 |
| 圆角 | 2 / 6 / 10 | 3 级 |
| 动效 | 120 / 180 / 240ms，统一 `cubic-bezier(.2,.8,.2,1)` | 有 `prefers-reduced-motion` 兜底 |

兼容层：保留旧变量名 `--mono` / `--dim` / `--gold`（指向新值），因为 JS 内联样式里仍在用。

### 3.2 排版规则

- **数字永远大于标签**：`.ac-hp-num` 17px vs `.ac-hp-label` 11px；`.sc-dmg b` 17px vs `.sc-meta` 11px。
- 等宽字体只用于数字和技术标签，用 `font-variant-numeric: tabular-nums` 保证跳动时不抖动。
- 中文正文行高 1.55–1.75；叙事文本 1.95–2.05。
- 全大写只出现在 eyebrow / mini-label（≤ 4 个词）。

### 3.3 布局

- 三栏 268 / auto / 324（原来是 252 / auto / 300）。
- 面板统一：1px 描边 + 10px 圆角 + 顶部 1px 高光，标题栏左侧 2px 青条。
- **一屏只有一个主行动**：标题页「接入协议 / 继续行动」独占一行且放大，联机入口降为次级行，说明降为文字链接。

---

## 4. 逐屏改了什么

### 4.1 顶栏：把时钟当主角

```
◈ 零号协议 2046 │ 第一幕 · 霓虹港  ROUND 1    电子追踪 42/42 ▓▓▓▓▓▓▓▓    记忆 120  合金 4  生命 3  [图标×4]
```

- 电子追踪从"一个和记忆/合金并列的资源小盒"升级成独立区块：`标签 + 分数 + 进度条`。
- 进度条是**连续填充 + 每 5 点一条刻度缝**（用 `repeating-linear-gradient`，不是 42 个 DOM 节点）。
- 三档告警用**颜色 + 脉冲**双编码：≤40% 琥珀、≤15% 粉色并呼吸。
- 四个图标按钮换成 24×24 线性图标（`ui-bag / ui-sound / ui-help / ui-restart`），保留 tooltip 与快捷键提示；
  战斗操作栏同理（`ui-attack / ui-item / ui-defend / ui-retreat / ui-end`）。共 11 个自绘 SVG。

### 4.2 队伍卡：删掉重复，把血条变成主角

改前每张卡：头像 + 名字 + 角色 + Lv/ONLINE + 血条 + "HP 40/40" + AP 点 + Focus 点 + **武器名 + 护甲名**。
改后：

```
[头像] 白垩 [行动中]
       支援  Lv.1
       ███████████ 40/40
       AP ▮▮▮   F ●●●●
       [协助 +10] [已觉醒]
```

- 武器/护甲移出卡片（背包里有），只在有异常状态时出现状态 chip。
- HP 数字与血条同排（省一行），行动者用左侧 2px 青色高亮条 + "行动中" chip 双标记。
- 卡高从 130px 降到 104px，四张卡不再需要滚动。

### 4.3 右侧情报栏

- 当前单位卡：**HP 变成 17px 大数字**，下面 3×2 属性格（护甲/抗性/闪避/Focus/移动）。
- 行动记录改成时间线：左侧 4px 圆点按类型着色（战斗粉 / 战利品绿 / 危险红 / 轮次青），圆点+颜色双编码。

### 4.4 地图

- **图例收进 `<details>` 弹层**（默认不占位），头部只留标题 + 图例按钮。
- **未揭示节点缩成 44px 暗圆点**，不再显示"未知信号 / UNRESOLVED"两行字——40 个这样的框是纯噪声。
- 相邻节点：绿色描边常驻，"前往"只在 hover 出现（原来每个节点都挂 MOVE 角标）。
- 当前节点：青色描边 + 玩家头像**浮在卡片上方 54px**（原来压在名字上）。
- 节点角标从 `CLEARED / SPENT / LOCKED` 缩短为 `✓ / 已取 / 锁`，并移到右上角，给底部头像让位。
- 当前节点的行动者头像不再重复显示（地图上已有圆形标记）。

### 4.5 战斗

- **技能卡重排**：图标 + 名称 + 消耗/状态；描述 2 行；底部一行「**18** 伤害 · 3×6 · 命中 70% · 期望 13 · 射程 4」。
  数字 17px、参数 11px，一眼能看到"打多少"。
- 4 张卡从 454px 压到 383px，配合新的操作栏（1 行 4 键 + 1 行主按钮）不再被裁切。
- 操作栏：普攻/道具/防御/撤离 一行四键（**线性图标 + 文字**），结束回合独占一行并高亮——它是最常按的。
  图标从 `⚔ ▤ ◈ ⇤ ⏭` 这些符号字形换成 24×24 stroke SVG：符号字形在不同机器的字体回退里长相不一致
  （`⚔` 在测试机上被渲染成 `×`），而 SVG 掩码上色后与文字同色同粗细。
- 3D 棋盘压暗：底板 `opacity 0.95 → 0.7` 并乘 `#5f7386` 色调，棱边 `0.5 → 0.32`，再叠一层 CSS 暗角。
  **底板是背景，不该比单位和名牌还亮。**

### 4.6 弹窗

- 宽度分三级：默认 780、`wide` 1000（背包/商店/安全屋/幕间/帮助）、`narrow` 560（确认/道具袋/危险提示）。
  （原来全部 `wide`，一个"关闭"确认框也占 1000px。）
- **右上角统一关闭按钮**（`×`）；没有 `modal-head` 的剧情卡用浮动关闭按钮。
- 剧情卡补回内边距（之前文字贴边）。
- 背包空态从一行灰字改成带图标的占位块，并给右栏 `min-height`，避免"左边满右边空"的失衡。
- 属性格 11px 标签 + 13px 数值，行高 1.4。

### 4.7 标题页

- 立绘墙修好竞态：meta 加载完成后再渲染（之前 `LINK: CHECKING…` 时是 8 根空柱子）。
- 主次分明：主 CTA 286×76、17px 标题 + 渐变底 + 发光边；联机入口降为普通按钮；操作说明降为文字链接。
- 最近行动列表：胜负标签、日期、队伍、死因四段对齐。

### 4.8 键盘与可访问性

- `:focus-visible` 统一 2px 青色描边 + 2px 偏移（之前完全没有焦点样式）。
- 新增 `I` 开道具袋、`H` / `?` 开操作说明（输入框内不抢键），帮助弹窗里写明全部快捷键。
- 颜色不作为唯一信息载体：点数用形状、时钟用长度+数字、日志用圆点+颜色。
- `prefers-reduced-motion` 下所有动画降到 0.001ms。

---

## 5. 怎么验证的

```bash
# 1) 九屏截图（标题/选人/地图/图例/背包/战斗/选技能/道具/说明）
node tools/ui/shots.mjs tools/ui/after

# 2) 字号与布局度量（应输出 0 个 <11px 文本）
node tools/ui/measure.mjs <sessionId>

# 3) 回归
dotnet run tools/audit/DataAudit.cs          # 85/85
node tools/e2e/systems-check.mjs             # 32/32
node tools/e2e/room-check.mjs                # 33/33
node tools/e2e/quest-check.mjs               # 18/18
node tools/e2e/awaken-check.mjs              # 12/12
node tools/e2e/aoe-ui.mjs                    # 17/17
node tools/e2e/segment-check.mjs             # 6/6
node tools/e2e/room-ui.mjs                   # 23/23
node tools/e2e/spectate-check.mjs            # 13/13
node tools/e2e/quest-ui.mjs                  # 8/8
node tools/e2e/awaken-ui.mjs                 # 9/9
node tools/e2e/story-check.mjs               # ok
node tools/e2e/resume-check.mjs              # ok
node tools/e2e/danger-check.mjs              # ok
PARTY=2 MAX_STEPS=1600 HEADLESS=1 node tools/e2e/browser-e2e.mjs   # 286 秒通关三幕
```

对比截图在 `docs/ui-shots/`：

| 改前 | 改后 |
|---|---|
| `before-title.png` | `title.png` |
| `before-map.png` | `map.png`（另见 `legend.png` 的图例弹层） |
| `before-combat.png` | `combat.png` |
| — | `select.png` / `inventory.png` |

### 5.1 一个被测试挡下来的改动

改完 `#active-card` 结构后，`awaken-ui` 的"重复点击不消耗 AP"失败：
它从 `.ac-role` 的文本里正则抠 `AP (\d+)`，而我把 AP 挪进了属性格。这是**测试依赖了展示细节**，
改测试比改 UI 合理——现在它读 `.ac-stat` 里标签为 `AP` 的那格。

---

## 6. 已知取舍

| 项 | 为什么先这样 |
|---|---|
| 3D 棋盘没有重做 | 只压暗了底板与棱边、加了暗角。真正的镜头/构图属于 3D 场景设计，应该单独一批做，混在 UI 重构里没法验证 |
| 队伍卡不再显示武器/护甲 | 四张卡显示同样的装备名是噪声；需要时在背包里看，且背包已有换装 diff |
| 未揭示节点不可点击 | 沿用原逻辑（`pointer-events: none`）。视觉上更安静，但也少了一点"探索感"——如果以后要做"靠近即揭示"再改 |
| 场景音效未接 UI 音 | `Sound.sfx` 已存在，本轮只保证按钮点击有反馈，没做 hover 音 |
| 没有做 UI 缩放设置 | 需要一套 rem 化改造；当前在 1280×720 到 1920×1080 之间已验证不破版 |
