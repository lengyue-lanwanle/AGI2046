# 手机布局（≤720px）

> **历史文档，仅作背景。**
> 当前实现状态、验收数字与已知限制一律以 [`HANDOFF.md`](../HANDOFF.md) 和 [`README.md`](../README.md) 为准；
> 本文描述的是当时的计划或审计快照，其中的版本号、文件路径和行为可能已经变化。

> 版本：0.17.1
> 触发：用户只能用手机，桌面版在 390×844 上不是「不好看」，是**玩不了**。
> 巡检：`W=390 H=844 node tools/ui/shots.mjs tools/ui/mobile`

---

## 1. 桌面版塞进手机后坏在哪

| 症状 | 根因 |
|---|---|
| 战斗只剩右侧操作栏，3D 棋盘完全不见 | `.hex-stage` 的高度靠子元素撑；3D 层是 `position:absolute`，不占流 → 高度 0 |
| 地图前面先出现队伍栏 | DOM 是 party → stage → intel，单列后顺序照搬 |
| 顶栏碎成三行，图标掉到第二屏 | `min-height:66px` + 桌面间距 + 4 个图标 + 资源标签 |
| 选人页只能看到前两排，滚不动 | `#select-screen { height:100vh; overflow:hidden }` |
| 地图看不到自己在哪，也不能缩放 | 初始 `scale 1.24`，只绑了 `wheel`；当前节点常在视口外 |
| 提示条盖住地图标题 | toast 固定 `top:78px`，正好压住 `.map-header` |

---

## 2. 断点与顺序

媒体查询统一放在 `style.css` 第 19 节（`max-width: 720px`），只做三件事：

1. **让主舞台先出现**：`.game-layout` 改 `flex-column`，`stage:1 / party:2 / intel:3`。
2. **给 3D 明确高度**：`.hex-stage { height:46vh; min-height:300px }`，地图 `56vh / 360px`。
3. **让点击目标够大**：按钮 40px、弹窗按钮 40px、地图节点 110px。

桌面（>720px）一行未改；`721–900px` 仍走原来的平板规则。

---

## 3. 每个界面

### 标题
CTA 独占一行（`min-width:0; width:100%`），次级入口两列，「操作说明」单独一行；
最近行动列表限高 `24vh` 自己滚。

### 选人
`#select-screen` 改成 `height:auto; overflow:visible`；
卡片 `repeat(2, 1fr)`、238px 高，隐藏模型名与两行简介，保留「名字 / 角色 / 技能标签 / 六属性」。

### 地图
- 节点 110px、名称 12px（6 字以内完整显示），隐藏副标题与键盘提示。
- `- / + / ◎` 三个按钮（桌面 `display:none`）：
  - `window.MapView.zoomBy(±1)`：以视口中心缩放，范围 0.7–2.2；
  - `window.MapView.centerOn(nodeEl)`：读取节点与视口 `getBoundingClientRect` 的差值，
    直接平移 `transform`，然后夹到边界内。
- **自动居中**：`renderMap()` 里当前角色 `nodeId` 变化且 `max-width:900px` 时调用；
  桌面不抢镜头（玩家可能正拖去看后面的路）。
- 页面本身可滚（`scrollHeight 1376 > 844`），地图区域 `touch-action:none` 专门给拖拽。

### 战斗
- 棋盘 `46vh`，3D 画布可见；操作栏在下方，页面滚动查看技能。
- 顶栏两行：第一行 `◈ ROUND n` + 右侧 `42/42`；第二行资源 + 图标。
- 隐藏「展开侧栏」（手机没有侧栏可展开）。
- 操作按钮 2 列，「结束回合」跨两列；战斗日志压到 108px。

### 弹窗 / 过场
弹窗满宽、`max-height:92vh`，按钮 40px；过场卡片宽 88vw，首领主视觉与幕间文字按 `vw` 缩放。

---

## 4. 验证

```bash
# 390×844 截图（标题/选人/地图/战斗/背包/帮助）
W=390 H=844 node tools/ui/shots.mjs tools/ui/mobile

# 交互断言（缩放 / 当前节点可见 / 无横向溢出 / 控制台异常）
node tools/ui/mobile-check.mjs
```

实测：

```text
PASS  缩放按钮改变比例  —  scale(1.24) → scale(1.4632)
PASS  当前节点在视口内  —  {"x":27,"y":259,"w":136,"inView":true}
PASS  定位按钮把节点拉回画面  —  {"x":29,"y":279,"w":161,"inView":true}
PASS  页面无横向溢出  —  {"w":390,"h":844,"sw":390,"sh":1376}
PASS  控制台无异常  —  []
```

桌面 1600×1000 截图与 0.17.0 一致；地图缩放按钮在桌面不显示。

---

## 5. 已知限制

1. **没有双指捏合**：只做了按钮缩放。要加的话在 `initMapZoom` 里监听两指距离，
   注意和 `pointerdown` 拖拽互斥。
2. **横屏未适配**：720×390 会命中手机断点，但纵向空间只剩 390，棋盘 46vh≈180 太低。
   如需横屏，加 `@media (max-height: 480px)` 把棋盘改成 `60vh` 并隐藏部分卡面。
3. **低端机性能未测**：3D 棋盘 + 900 雨点 + 22 张立绘；目前 `pixelRatio` 上限 2，
   在手机上可能吃到 1.5–2 倍分辨率。
4. **没有 PWA / 添加到主屏幕**：`theme-color` 与 favicon 有，但缺 manifest 和 192/512 图标。
5. **安全区**：未处理 iOS `env(safe-area-inset-bottom)`，全面屏底部可能贴边。
