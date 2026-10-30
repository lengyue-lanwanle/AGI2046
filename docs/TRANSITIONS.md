# 过场演出：让四个瞬间看得出来

> **历史文档，仅作背景。**
> 当前实现状态、验收数字与已知限制一律以 [`HANDOFF.md`](../HANDOFF.md) 和 [`README.md`](../README.md) 为准；
> 本文描述的是当时的计划或审计快照，其中的版本号、文件路径和行为可能已经变化。

> 版本：0.17.0
> 文件：`web/js/cinematics.js`（约 190 行）、`web/css/style.css` 第 18 节
> 巡检：`node tools/ui/cine-shots.mjs`（8 张截图 + 1 条真实流程断言）

---

## 1. 要解决的不是「加动画」，是「看不出发生了什么」

上一版的问题不是画面不好看，而是**状态变了，画面没变**：

| 瞬间 | 之前 | 玩家的感受 |
|---|---|---|
| 标题 → 选人 → 对局 | `display:none` 直接切 | 像换了个网页 |
| 地图 → 战斗 | 地图 `hidden`、战斗 `hidden` 移除 | 战场「啪」地出现，不知道敌人从哪来 |
| 探索换人 | 1.6 秒全屏卡，每回合都弹 | 第一次新鲜，第四次嫌烦，而且联机时挡住队友 |
| 战斗换单位 | 行动顺序条高亮换一下 | 敌人回合、队友回合、自己的回合几乎分不出 |
| 战斗换轮 | 右上角 `ROUND` 数字 +1 | 数字太小，没人看 |
| 幕间 | 弹窗 + 白闪 | 三幕结构没有「到了另一个地方」的重量 |

所以这一版定的目标是 **四个瞬间必须可感知**：换屏、进战斗、换人、换轮。
其它地方一律不动——过场多了和没有一样。

---

## 2. 三条硬约束

1. **不拦截操作**：所有演出层 `pointer-events:none`，`z-index` 在弹窗之下。演出永远不能变成「等它播完」。
2. **尊重系统设置**：`prefers-reduced-motion: reduce` 时 JS 直接不挂层、CSS 全局把动画压到 0.001ms。演出是增强，不是功能。
3. **不改变状态**：演出只读 `state`，不写 `S.game`，不触发请求。测试与联机轮询都当它不存在。

> 巡检时的一个坑：无头 Chromium 默认上报 `prefers-reduced-motion: reduce`，
> 于是所有过场都被「正确地」跳过，截出来全是静态图。
> `cine-shots.mjs` 里用 `Emulation.setEmulatedMedia` 显式改成 `no-preference` 才看到真实首帧。

---

## 3. 七个演出单元

| API | 触发点 | 时长 | 画面 |
|---|---|---|---|
| `Cine.screen(id)` | `showScreen()` 目标变化 | 640ms | 黑场径向渐变 + 一道青色扫描线，压住 `display` 切换的硬跳 |
| `Cine.encounter({boss:false})` | 探索 → 战斗（普通） | 1250ms | 居中横条：`ENCOUNTER` + 节点名 + 敌人名单 |
| `Cine.encounter({boss:true})` | 探索 → 战斗（首领） | 2400ms | 7vh 黑边 + 首领主视觉（右侧、遮罩渐隐）+ 名字/幕数/敌方单位数 |
| `Cine.act({index,name,art})` | `advanceAct` 成功 | 2500ms | 整幅幕间主视觉 + 21vw 的幕数水印 + 幕名 + 下一幕目标 |
| `Cine.turn({full:true})` | 探索**换轮** | 1500ms | 居中大卡：头像 126px、第 N 轮、AP，底部一条走完的进度线 |
| `Cine.turn({full:false})` | 探索**换人** | 1150ms | 左上角小卡：头像 54px + 名字 + 轮次/AP，不挡地图中心 |
| `Cine.combatTurn({side,mine})` | 战斗中 `activeUnitId` 变化 | 1050–1400ms | 战场底部横幅：阵营色左边框、`YOUR TURN`/`ENEMY PHASE`、名字、第 N 轮 |
| `Cine.round(n)` | 战斗中 `round` 变化 | 950ms | 横贯画面的 96px 分隔带，`ROUND n` |
| `Cine.travel()` | 探索 `move` 成功 | 520ms | 地图轻微推近 + 三条斜向速度线 |

### 为什么换人分两档

探索阶段「换轮」和「换人」的信息量完全不同：

- 换轮 = 所有人 AP 重置、追踪时钟可能 −1、战术节奏重排 → 值得一次全屏；
- 换人 = 只是下一个队友动 → 左上角一张卡就够。

之前不分档，每回合都全屏 1.6 秒，四人局里平均每 8 秒挡一次屏幕。
现在 1 轮只打断 1 次，其余 3 次是轻提示。

### 为什么战斗横幅放底部

先试过顶部 84px：正好压住「TACTICAL ENCOUNTER / 战斗名」和行动顺序条，
而且和敌人名牌同一水平线，读起来像两个叠在一起的标签。
移到 20vh 又压住棋盘上半的敌人。最终放 `bottom: 13vh`（操作提示上方），
视线在「看棋盘」和「看横幅」之间不用来回跳，也不会盖住任何单位。

---

## 4. 接入点

`web/js/app.js` 只有四处新增，全部可空安全（`window.Cine?` / `if (!cine) return`）：

```js
// 1) 换屏
function showScreen(id) {
  const prev = document.querySelector('.screen.active')?.id;
  ...
  if (prev && prev !== id) window.Cine?.screen(id);
}

// 2) 相位变化（进战斗 / 进下一幕 / 移动）
function cuePhaseCinematics(before, next, action) { ... }
// applyAction() 成功、renderAll() 之后调用

// 3) 探索换人 / 换轮
if (data.phase !== 'combat' &&
    (before.activePlayerId !== data.activePlayerId || before.round !== data.round)) {
  showTurnTransition(data, before);
}

// 4) 战斗换单位 / 换轮：放在渲染里，联机轮询与观战也能看到
function trackCombatFlow(c) { ... }
```

`trackCombatFlow` 放在 `renderCombat()` 而不是动作回调里，是因为战斗中「谁在行动」可能由
**服务端的敌方回合结算**、**队友的操作**、**房主跳过**改变，回调覆盖不全。

首次进入战斗时不弹 `combatTurn`——进战斗的 `encounter` 已经交代了战场，再弹一次是噪音。
离开战斗时清空游标（`S.cineCombatUnit = undefined`），下一场重新开始。

---

## 5. 时间预算

单人一局约 60–75 分钟，过场不能超过总时长的 3%：

| 场景 | 次数（4 人一局） | 单次 | 合计 |
|---|---|---|---|
| 换屏 | ~6 | 0.64s | 4s |
| 进战斗 | ~35 | 1.25s | 44s |
| 首领战 | 3 | 2.4s | 7s |
| 幕间 | 2 | 2.5s | 5s |
| 探索换轮 | ~60 | 1.5s | 90s |
| 探索换人 | ~180 | 1.15s | 207s |
| 战斗换单位 | ~300 | 1.1s | 330s |
| 换轮（战斗） | ~80 | 0.95s | 76s |
| **合计** | | | **≈ 12.7 分钟（17%）** |

换人和战斗换单位是大头，但这两类**不遮挡操作**（小卡/底部横幅），玩家可以边看边点，
实际感知的等待远小于表面时长。真正阻塞视线的只有换屏、首领战、幕间，合计 16 秒。

---

## 6. 验证

```bash
node tools/ui/cine-shots.mjs tools/ui/cine
```

产出 8 张截图（标题 / 首领遭遇 / 幕间 / 换轮大卡 / 敌方回合 / 我方回合 / 轮次分隔 / 真实进战斗），
并用 `MutationObserver` 断言真实点击流程里确实插入了 `cine-travel` 与 `cine-encounter`：

```json
{"ok":true,"log":["cine cine-travel","cine cine-encounter minor"]}
```

回归：

- `room-ui.mjs` 的「客人看到回合切换过场」选择器改为 `.cine-turn, .turn-transition`（旧版兜底仍保留）；
- `aoe-ui` 17/17、`spectate` 13/13、`awaken-ui` 9/9 未受影响（演出层不参与状态）。
