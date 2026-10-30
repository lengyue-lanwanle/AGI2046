# CG 视频层（0.19.2）

> **历史文档，仅作背景。**
> 当前实现状态、验收数字与已知限制一律以 [`HANDOFF.md`](../HANDOFF.md) 和 [`README.md`](../README.md) 为准；
> 本文描述的是当时的计划或审计快照，其中的版本号、文件路径和行为可能已经变化。

> 结论先说：**能做，而且已经接进游戏了**——但只能做成「整屏不透明过场」，
> 而且需要 ffmpeg 压一道。下面是把这条路走通的全部约束与命令。

---

## 1. 为什么不能做「透明视频叠在棋盘上」

| 方案 | Chrome | Safari / iOS | 结论 |
|---|---|---|---|
| WebM VP9 + alpha (`yuva420p`) | ✅ | ❌ 不认 alpha，整块黑 | 不能用 |
| HEVC + alpha (`hvc1`) | ❌ 不认 alpha，整块黑 | ✅ | 不能用 |
| PNG 序列 → canvas 逐帧 | ✅ | ✅ | 可行但太贵：5s 720p ≈ 30–60MB |
| **整屏 MP4（本文方案）** | ✅ | ✅ | 采用 |

所以视频只承担「画面」，文字、跳过键、字幕一律留在 DOM 上。
好处是中文排版、可访问性、跳过逻辑都还能用 CSS/JS 调；坏处是做不到角色抠像叠进战斗场景。

## 2. 为什么必须过一道 ffmpeg

视频模型给的是 1080p、3–5MB、moov 在文件末尾的片子。直接丢网页会踩三个坑：

1. 手机加载慢；
2. moov 在末尾 → 要下完整个文件才起播；
3. 首帧没解码时是黑屏。

`tools/video/prep.py` 一次解决：

```bash
python tools/video/prep.py <input.mp4> intro          # 默认 crf 28 / 最长 5s
python tools/video/prep.py <input.mp4> intro --crf 31 --max 5   # 更狠的压缩
python tools/video/prep.py <input.mp4> intro --crop 48,0,0,0    # 先裁掉左上角水印
python tools/video/prep.py --demo                     # 造测试夹具（不花积分）
```

它做四件事：

```
-t 5                         裁到 5 秒（模型通常给 5–8 秒，多出来的不要）
scale=-2:720:flags=lanczos   降到 720p，宽度取偶数（H.264 要求）
libx264 -profile high -crf 28 -pix_fmt yuv420p
-movflags +faststart          moov 前置，边下边播
-an                          剥掉音轨：声音仍由游戏自己的 WebAudio 负责
```

再抽 0.6 秒那一帧当 poster（`libwebp -quality 84`），视频没到时先显示静帧，不白屏。

### 实测体积（本机 ffmpeg 3.0.1，5 秒 720p）

| 素材 | 1080p 母版 | 720p crf28 | 720p crf31 |
|---|---|---|---|
| 主视觉推镜（细节中等） | 2.2 MB | **446 KB** | ~310 KB |
| 生成器实拍（雨 / 粒子 / 颗粒） | 3–6 MB | 预计 **1.5–3 MB** | 1–2 MB |
| **实际开场片**（1344×768 → 720p） | 2.0 MB | **850 KB** | — |

编码耗时：5 秒片段约 1 秒，可以忽略。

### 2.1 水印：必须裁，不能盖

本轮用的 `minimax-video-h3` 会在**左上角**打「AI生成」。第一版抽帧就看到了，
所以 `prep.py` 加了 `--crop 上,右,下,左`：先裁再缩放，否则水印会跟着一起被缩进画面。
本次用的是 `--crop 48,0,0,0`（顶部 48px 正好覆盖水印，那块本来就是夜空，裁掉看不出来）。

> 为什么不用 UI 盖住：CG 层是满屏的，任何固定位置的遮挡在别的片子上都会露馅；
> 裁掉是唯一不会留痕的做法。


## 3.1 播放时机与「看不到」的三个原因（0.19.3 修）

开场 CG 的播放入口有三个：

| 入口 | 什么时候 | 会不会被「已看过」拦住 |
|---|---|---|
| 进游戏（新开局 / 继续行动） | 只放一次 | 会（记 `localStorage.agi2046.seenCG`） |
| 标题页「开场动画」 | 想重看随时点 | **不会**（显式意图，`force: true`） |
| 剧情档案里的 `CG` 行 | 想重看随时点 | **不会** |
| `?cg=intro` | 直接开链接 | **不会** |

0.19.2 只有一个入口，而且写成了「序章没看过才放 CG」：

```js
// 旧代码：老玩家永远看不到开场
function maybePrologue() {
  if (!storyReady() || sceneSeen('prologue')) return false;   // ← 这里就返回了
  if (window.CG?.has('intro') && !window.CG.seen('intro')) { ... }
}
```

只要读过序章（哪怕是在装 CG 之前的版本），第一行就 return，CG 那段根本没执行。
现在拆成两个独立判断：

```js
function playOpening() {
  if (maybeIntro(() => maybePrologue())) return true;   // CG：只看 seenCG
  return maybePrologue();                               // 序章：只看 seenScenes
}
```

另外两个会让 CG「静默跳过」的原因，都已经能在 `CG.status()` 里看到：

- `reduced-motion`：系统开了「减少动态效果」（iOS 辅助功能里很常见）；
- `save-data`：浏览器开了省流量模式；
- `no-clip` / `no-host`：片子没登记 / 挂载点缺失。

自动播放仍然尊重这两个设置（省流量时不该偷跑 850KB），但**标题页按钮与深链会绕过它们**——
用户自己点的「播放」，就是明确意图。想确认原因，控制台执行：

```js
CG.status()   // { id:'intro', played:false, why:'reduced-motion' }
```

## 3.2 一个连带修掉的服务端 bug

`UseDefaultFiles` 在 `/` 上会 302 到 `/index.html`，**并且丢掉查询串**。
所以 `?bot=1`、`?story=off`、`?cg=intro` 从来没有真正生效过（自动化测试一直是在「剧情开着」的状态下跑的）。
现在改成中间件把 `/` 重写到 `/index.html`，查询串原样保留：

```csharp
app.Use(async (ctx, next) => {
    if (ctx.Request.Path == "/") ctx.Request.Path = "/index.html";
    await next();
});
```

## 3.05 自动播放被拦时不要「静默结束」

iOS 低电量模式会直接拒掉 `video.play()`（即使 `muted + playsinline`）。
旧实现收到 rejection 就 `finish('blocked')`，而且把这条记成「已看过」——
用户不仅这次看不到，以后也永远看不到。现在的处理：

- 拒绝 → 保留海报，中央出现「▶ 点击播放」；
- 点击后重新 `play()`（用户手势允许播放），并清掉 8 秒的加载兜底计时；
- 只有 `ended` / `skip` 才算看过，`blocked` / `error` / `timeout` 都不记。

回归里用「让 `play()` 第一次 reject」来模拟这件事，不需要真的开低电量模式：

```js
const orig = HTMLMediaElement.prototype.play;
let first = true;
HTMLMediaElement.prototype.play = function () {
  if (first) { first = false; return Promise.reject(new DOMException('blocked', 'NotAllowedError')); }
  return orig.apply(this, arguments);
};
```

## 3. 播放层怎么用

```js
// web/js/cg.js 顶部片单：加一条就能播
const CLIPS = {
  intro: { src: 'assets/cg/intro.mp4', poster: 'assets/cg/intro.webp',
           title: '霓虹港 · 2046', sub: 'NEON HARBOR' },
};
```

**当前已登记 1 条**（0.19.2）：`intro` = 雨夜霓虹港推镜，5 秒，1344×720，850KB。

```js
window.CG.play('intro', { onEnd: () => { /* 接下一段流程 */ } });
// true  = 已接管画面，等 onEnd
// false = 没播（没登记 / 减少动态 / 省流量 / 已看过），调用方直接往下走
```

已经接好的位置：**开场**——点「接入协议 / 继续行动」后，序章 VN 之前播一次。

### 失败策略（重要）

任何一步出问题都直接放行，绝不让视频变成卡住游戏的门：

- 没登记 / `prefers-reduced-motion` / `navigator.connection.saveData` → 返回 false；
- 8 秒内没 `canplay` → 放弃（`timeout`）；
- 解码失败 → 放弃（`error`），并且**不记为已看**，下次还给一次机会；
- 跳过键常驻右上；点画面第一次是「再点一次跳过」，避免误触；ESC / 空格同样跳过；
- 播完 `removeAttribute('src') + load()` 释放解码器（手机上同时挂多个 video 会抢硬件解码）。

### 服务端

ASP.NET 静态文件默认就够：`Content-Type: video/mp4`、`Accept-Ranges: bytes`、
Range 请求返回 `206`，配合 faststart 可以直接边下边播。已用 curl 验证过，不需要额外配置。

## 4. 用在哪些地方（以及不要用在哪）

| 位置 | 合适 | 理由 |
|---|---|---|
| 开场（标题 → 序章） | ✅ | 有用户手势、有 1–2 秒空档可以起播 |
| 幕间（换幕） | ✅ | 一局两次，本来就是「到了另一个地方」的时刻 |
| Boss 登场 | ⚠️ | 现在已有整幅主视觉 + 2.4 秒演出，视频未必更强，先比过再说 |
| 二阶段 / 觉醒 / 大招 | ❌ | 必须反映当前血量与站位；四人局会把队友按在椅子上看片 |
| 角色对话 | ❌ | 正脸一致性撑不过 8 秒，会掉进恐怖谷 |

## 5. 出片之后怎么验收

```bash
node tools/ui/cg-check.mjs                  # 13 项，用夹具（不用真片也能跑）
CG_REAL=1 node tools/ui/cg-check.mjs        # 14 项，验游戏里真正登记的那条
node tools/ui/cg-replay.mjs                 # 12 项：老玩家续玩能播、三个重看入口、被拦自动播放时的兜底
```

测试用 `tools/video/fixture/demo-720p.mp4` 当夹具（主视觉 5 秒推镜，446KB），
**不会**把演示片打进 `web/assets/cg/`：跑之前临时拷 `_test.mp4`，跑完删掉。

## 6. 成本与流程

1. 生成（VideoGen，5 秒约 50–100 积分，1–3 分钟一条，建议静音生成）；
2. `python tools/video/prep.py raw.mp4 intro` → 720p + poster；
3. 在 `cg.js` 的 `CLIPS` 里登记一行；
4. `node tools/ui/cg-check.mjs` 过一遍；
5. 提交 —— 一条 5 秒 720p 大概 0.5–3MB，进仓库可接受。

> 一条片子只做一件事：**一个镜头、一个动作、无对白**。
> 8 秒以上模型的连贯性会崩，30 秒的完整幕间必须拆成 4–6 个镜头分别生成。
