# 用 Three.js 做开场 / 幕间动画 —— 方案

> **历史文档，仅作背景。**
> 当前实现状态、验收数字与已知限制一律以 [`HANDOFF.md`](../HANDOFF.md) 和 [`README.md`](../README.md) 为准；
> 本文描述的是当时的计划或审计快照，其中的版本号、文件路径和行为可能已经变化。

> 目标版本：0.18.0（可选，独立于玩法）
> 现状：`web/vendor/three.min.js`（r149 核心）+ `battle3d.js`（战场）+ `map3d.js`（地图雨幕）
> 结论先说：**能做，而且这套工程已经具备全部前置条件**；但要把它当「实时演出」而不是「动画电影」来做。

---

## 1. 能不能做：能，但先划清边界

Three.js 适合做**有空间感、能跟 UI 无缝衔接**的演出；
不适合做「20 秒、多角色、有面部表情」的过场——那是预渲染视频的活。

| 方案 | 观感上限 | 体积 | 与 UI 衔接 | 手机风险 | 适合 |
|---|---|---|---|---|---|
| **Three.js 实时 2.5D** | 中高（视差/粒子/光） | 复用现有 key art，+0–1.5MB | 最好（同一画布、可停在任意帧） | 中（WebGL/发热） | 开场、幕间、转场 |
| CSS/DOM（现状） | 中（平面） | 0 | 好 | 低 | 已经够用的换人/换轮 |
| 预渲染视频 | 最高 | 5–20MB/条 | 差（黑边、不能交互） | 高（解码/自动播放限制） | 真正的 CG 片头 |

**建议：混合。** 开场与幕间用 Three.js 做 5–8 秒的「空间转场」，
文字与按钮仍然留在 DOM（排版、可访问性、翻译都不该进 WebGL）。
不做视频：包体会从 1MB 级跳到 20MB 级，手机首屏等不起。

---

## 2. 两个场景的分镜

### 2.1 开场「接入协议」——7.5 秒，可跳过，只播一次

不新建美术：直接用 `assets/keyart/title.webp` 当远景绘景，剩下的靠几何与粒子。

| 时间 | 画面 | 技术 |
|---|---|---|
| 0.0–0.8 | 全黑，一条青色扫描线从上往下拉开 | 全屏 quad + GLSL 噪声擦除 |
| 0.8–3.2 | 镜头从雨幕里缓慢推进霓虹港，画面轻微横移 | 背景 plane + 相机 dolly（位移 ≤ 0.6 单位，避免平面穿帮） |
| 1.2–4.5 | 雨丝、悬浮尘埃、两道体积光从楼缝里打下 | `Points` 雨（移动端 400 / 桌面 900）+ 加色锥体 |
| 2.2–5.2 | 两条全息锦鲤从画面右侧游过，尾部拖光 | `CatmullRomCurve3` + `TubeGeometry`，加色材质，沿曲线采样 |
| 4.0–5.6 | 轨道电梯的光柱脉冲一次，粒子向上流动 | 竖直光柱 + 向上速度的粒子 |
| 5.2–6.8 | 标题从画面中心「解离」出现，背景压暗 20% | DOM 标题 + CSS clip/opacity；Three 层只做压暗与暗角 |
| 6.8–7.5 | 相机进入极慢呼吸，直接成为标题页背景 | 不切场景：DOM 显示标题页，canvas 继续跑 idle 循环 |

交互：

- 任意点击 / `ESC` / 空格 → 0.3 秒淡出，直接进标题页；写 `localStorage['agi2046.introSeen']=1`。
- 第二次打开不再播，只保留 idle 呼吸（可关）。
- `prefers-reduced-motion` → 不播动画，直接显示 `title.webp` 静态图 + 标题淡入。

### 2.2 幕间 I→II「镜海」——5 秒

| 时间 | 画面 |
|---|---|
| 0.0–0.6 | 上一幕的战场/地图被压暗，镜面碎片从镜头前飞过 |
| 0.6–3.0 | 48 片镜片（InstancedMesh 薄板）从四周聚拢，拼成一圈拱门；每片略微反射环境色 |
| 2.4–4.0 | 拱门中心亮起，`act2.webp` 作为「门后的世界」在门洞里淡入 |
| 3.6–5.0 | 相机穿过拱门，画面被径向白光洗掉，露出第二幕地图 |
| 全程 | DOM 叠加：`ACT II / 镜海穹顶`，2.2 秒时从下往上 12px 淡入 |

### 2.3 幕间 II→III「轨道」——5 秒

| 时间 | 画面 |
|---|---|
| 0.0–0.8 | 黑场，垂直光条从下往上掠过（电梯井） |
| 0.8–3.2 | 镜头沿电梯井上升，星点与线框环掠过；下方地球弧光 |
| 2.6–4.2 | `act3.webp` 在顶部展开，红色警示条闪一次（≤1Hz） |
| 4.2–5.0 | 白光过曝 → 第三幕地图 |

### 2.4 结局（可选，P3）

`boss3.webp` + 主脑解体的碎片向外飘散 + 相机缓慢后拉；
文字仍由现有结算弹窗承担，动画只做背景。

---

## 3. 技术设计

### 3.1 新文件：`web/js/cine3d.js`（单文件，约 600 行）

```js
window.Cine3D = {
  supported(),                       // WebGL + 非 reduce + 内存充足
  preload(sceneId),                  // 标题页空闲时预载纹理
  play(sceneId, { onDone, debugT }), // 返回 Promise；可被 stop()
  stop(),                            // 跳过：淡出 + 释放
  isActive(),
  setDebugTime(t)                    // 截图/回归用：冻结在某一帧
};
```

内部结构：

```
Cine3D
├─ Stage         renderer / scene / camera / resize / RAF / visibility
├─ Timeline      t（秒）→ 关键帧，ease，支持 seek，不引入 GSAP
├─ Assets        TextureLoader + 缓存 + dispose
├─ FX            rain / dust / lightShaft / shardRing / koi / stars
├─ Shaders       wipe（噪声擦除）/ vignette+grain / dissolve
└─ Scenes        intro / act2 / act3 / victory，每个 { build, update(t), dispose }
```

**不引入新依赖**：核心 r149 自带 `ShaderMaterial`、`InstancedMesh`、`TubeGeometry`、
`CatmullRomCurve3`、`Points`，足够；不引 GLTFLoader / EffectComposer。

### 3.2 渲染与生命周期（手机上的关键）

- 独立 `<canvas id="cine3d">`，**不复用** battle3d 的 renderer（一个 canvas 只能绑一个上下文）。
- `pixelRatio = min(1.5, devicePixelRatio)`；移动端关掉全屏后处理，粒子数减半。
- 播放结束 / 跳过 / 页面隐藏 → `stop()`：取消 RAF、`renderer.dispose()`、`forceContextLoss()`、
  移除 canvas，并 `scene.traverse` 释放 geometry/material/texture。
  iOS Safari 同时活跃的 WebGL 上下文有限（战场 + 地图 + 演出），**必须释放**。
- 首帧之前先显示现有 key art 静态图（`title-keyart`），纹理 ready 后再 crossfade，
  避免「黑屏等加载」。
- 兜底：`WebGLRenderingContext` 不存在、上下文创建失败、`prefers-reduced-motion`、
  低内存（`navigator.deviceMemory < 2`）→ 直接走现有 `Cine` DOM 版本。

### 3.3 与现有 `Cine` 的关系

`cinematics.js` 继续负责**文字与信息**，`cine3d.js` 只负责**背景空间**：

```js
// Cine.intro()
async function intro() {
  if (!Cine3D.supported()) return;              // 标题页照常
  document.body.classList.add('intro-playing'); // 标题 DOM 先隐藏
  await Cine3D.play('intro', { onDone: revealTitle });
  document.body.classList.remove('intro-playing');
}

// Cine.act()：优先 3D，失败/降级回现有 DOM 卡片
async function act(info) {
  if (Cine3D.supported() && await Cine3D.play(`act${info.index}`, { skippable: true })) return;
  playDomActCard(info);
}
```

触发点：

- 开场：`boot()` 里 meta 就绪后、用户还没点「接入协议」之前自动播；首访一次。
- 幕间：沿用现有 `advanceAct` 成功后的 `Cine.act()`，把 DOM 卡替换成 3D 场景；
  幕间弹窗仍在**点击前**出现，点击「进入下一幕」后才播，避免动画压住配装界面。
- 不碰 `combatTurn / round / turn`：那些是信息，不是演出。

### 3.4 分镜脚本就是数据

每个场景导出一个数组，便于调时间与做截图回归：

```js
const INTRO = [
  { at: 0.0,  do: 'wipe',   args: { from: 0, to: 1 } },
  { at: 0.8,  do: 'camera', args: { from: [0, 0.2, 6.2], to: [0, 0.1, 5.4], ease: 'inOut' } },
  { at: 1.2,  do: 'rain',   args: { count: 900, speed: 1.2 } },
  { at: 2.2,  do: 'koi',    args: { lane: 0.62, duration: 3.0 } },
  { at: 5.2,  do: 'title',  args: { mode: 'reveal' } },
  { at: 7.5,  do: 'idle' }
];
```

好处：改节奏不用改渲染代码；`debugT` 可以定格任意一帧做视觉回归。

---

## 4. 素材

**P1 不需要新图**：`title.webp` / `act2.webp` / `act3.webp` / `boss3.webp` 已经够。

可选增强（P3，只有确实觉得「平」才做）：

| 素材 | 数量 | 用途 | 成本 |
|---|---|---|---|
| 前景剪影层（电缆 / 栏杆 / 雨棚） | 2 张 | 开场近景视差，立刻有纵深 | 生成 + 品红底抠图（已有 `keyout.py`） |
| 锦鲤剪影 | 1 张 | 比纯几何更像「生物」 | 同上 |
| 镜片法线/噪声贴图 | 1 张 512 | 镜面碎片的高光变化 | 程序生成，不需要 AI |

单张 key art 的做法（P1）靠**相机位移 ≤ 0.6 单位 + 前景粒子 + 暗角**掩盖平面感；
镜头一旦大幅横移就会露馅，这是这条路线最重要的约束。

---

## 5. 实施阶段

### P0 可行性验证（先做，不写正式场景）

- `cine3d-spike.js`：一个旋转的测试立方体 + 雨，跑 3 秒。
- 验证：无头 Edge（SwiftShader）能出画面；手机 390×844 能跑；
  播放结束能彻底释放上下文；`--disable-webgl` 时能降级。
- 通过标准：桌面 ≥55fps、手机 ≥30fps；`renderer.info.memory` 归零。

### P1 开场 v1

- 扫描线 → 推镜 → 雨/尘埃 → 光柱 → 标题解离 → idle。
- 跳过（点击/ESC）、首访一次、减少动态降级。
- **验收**：7.5 秒内可跳过；跳过到标题 ≤300ms；无控制台异常；
  刷新第二次不再播；手机发热可接受（连续loop 3 分钟不崩）。

### P2 幕间 v1

- `act2`（镜片拱门）、`act3`（电梯井）两套；共用 shard/light 组件。
- 接进 `advanceAct` 流程，DOM 版保留兜底。
- **验收**：从点「进入下一幕」到能操作地图 ≤5.5 秒；跳过立即回地图；
  与现有幕间弹窗不重叠。

### P3 打磨

- 前景剪影层 / 锦鲤贴图（如需要）；单 pass 暗角+颗粒+色差；
- 程序化 riser 音效接 `Sound`（与画面同帧）；
- 结局背景；移动端粒子/后处理分档。

### P4 硬化

- `tools/ui/cine3d-check.mjs`：`?cine3d=intro&t=2.5` 定格截图 ×4 帧，
  断言 canvas 非纯色（像素方差）、跳过可用、上下文释放、降级路径可用；
- 文档：`docs/CINE3D.md`（分镜表 + 调参入口）；
- 版本 0.18.0，`?v=` 统一。

---

## 6. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| 单张绘景做视差「像一张纸在动」 | 观感廉价 | 限制相机位移；前景粒子/光柱制造层次；必要时才加剪影层 |
| iOS WebGL 上下文上限 | 战场/地图黑屏 | 演出结束强制 dispose + `forceContextLoss`；同时只允许一个 cine 上下文 |
| 手机发热/掉帧 | 首屏卡顿 | dpr≤1.5、粒子减半、关后处理、超过 8 秒自动降级为静态 |
| 首访动画挡住想直接玩的人 | 流失 | 7.5 秒上限、任意点击跳过、第二次不播 |
| 纹理加载慢 | 黑屏 | 先显示静态 key art，纹理 ready 后 crossfade；`preload` 在 meta 就绪后空闲加载 |
| 动画与幕间弹窗叠加 | 信息打架 | 只在弹窗关闭、`advanceAct` 成功后播；`mountModal` 会 `Cine.clear()` |
| 无头/低端设备没有 WebGL | 开场直接黑 | `supported()` 检查 + 现有 DOM 兜底；`?cine3d=0` 强制关闭 |

---

## 7. 我建议的取舍

1. **先做开场，不急着做幕间。** 开场是「第一次打开」的第一印象，收益最大；
   幕间一年只看两次，5 秒的 3D 拱门不一定比现在的整幅 key art 更值。
2. **不做人物动画。** 没有骨骼、没有面部，硬做会立刻掉进恐怖谷；
   用「环境在动、人在画外」的悬疑感，反而贴合这个故事的调性。
3. **文字永远留在 DOM。** WebGL 里排版中文的代价（字体加载、换行、可访问性）远大于收益。
4. **先量再堆。** P0 的帧率与上下文数据不过关，就直接停在 DOM 版，
   不要用「再优化一下」把整个 0.18 拖进去。

---

## 8. 需要你拍板的三件事

1. 开场是**每次打开都播**（可跳过），还是**只播一次**？我建议只播一次 + 标题页 idle 呼吸。
2. 幕间要不要也升级？我建议先只做开场，幕间保留现在的整幅主视觉。
3. 要不要为开场额外生成前景剪影层？我建议 P1 先不做，等看到实机再决定。
