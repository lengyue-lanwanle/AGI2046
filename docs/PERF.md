# 加载性能：从 3.4MB 到 1.7MB

> 0.25.1 实测。所有数字来自 `node tools/e2e/perf-check.mjs <title|select|battle>`：
> 新开一个无缓存的无头浏览器，读 `PerformanceResourceTiming` 汇总，
> 不掺服务端缓存，也不掺「第二次打开」。

## 0. 结论先看

| 场景 | 之前 | 现在 | 变化 |
|---|---|---|---|
| 标题页 | 1370KB · 14 请求 | **1024KB** · 27 请求 | 体积 −25%，且 three.js 不再阻塞 |
| 选人页 | 3447KB · FCP 412ms | **1662KB** · FCP 152ms | 体积 −52%，首屏 −63% |
| 战斗页（含前两屏） | 6067KB | **5329KB** | 立绘少下 800KB |

单看「进战斗要等的东西」：4 张战斗立绘从 **1024KB → 190KB**。

## 1. 之前慢在哪（先量，再改）

第一次量标题页，14 个请求 1370KB，其中：

| 资源 | 大小 | 问题 |
|---|---|---|
| `vendor/three.min.js` | 594KB | 标题页根本用不到，却挡在所有东西前面 |
| `js/app.js` | 216KB | 没有压缩 |
| `css/style.css` | 200KB | 没有压缩 |
| `keyart/title.webp` | 203KB | 首屏主视觉，应该更早开始下 |
| `fonts.googleapis.com` 的 CSS | 332KB | 第三方、阻塞渲染、断网就掉字 |
| 16 张选人立绘 | 1.9MB | 600×1100 原图直接铺在 200px 的卡上 |

两条根因：**Kestrel 默认不压缩**，**没有缓存策略**（只有一个 ETag，每次重新协商）。

## 2. 改了什么

### 2.1 服务端：压缩 + 缓存（`Program.cs`）

```csharp
builder.Services.AddResponseCompression(o => {
    o.EnableForHttps = true;
    o.Providers.Add<BrotliCompressionProvider>();
    o.Providers.Add<GzipCompressionProvider>();
    o.MimeTypes = new[] { "text/html", "text/css", "text/javascript", "application/json", ... };
});
```

压缩等级用 `Optimal` 而不是 `Fastest`——资源带 `immutable` 头，压缩只算一次：

| 文件 | 原始 | Fastest | Optimal |
|---|---|---|---|
| `app.js` | 216KB | 94KB | **68KB** |
| `style.css` | 200KB | 67KB | **44KB** |
| `/api/meta` | 203KB | 75KB | **39KB** |

缓存策略按「有没有版本号」分三档：

| 请求 | 头 | 理由 |
|---|---|---|
| `*.html` | `no-cache` | 入口页必须回源，否则 `?v=` 升级不生效 |
| `?v=` 结尾 | `public,max-age=31536000,immutable` | 版本号由 `bump-web-version.mjs` 统一升，可以放心长缓存 |
| 其他（图片/音频/字体） | `public,max-age=86400` | 没有版本号，别缓存太久；要立刻生效就加 `?v=` |

### 2.2 Three.js 改成按需加载（`app.js: ensure3D`）

标题页没有任何 3D，`three.min.js` 594KB 之前是白等的。
现在从 `index.html` 摘掉，进对局时（`showScreen('game-screen')`）按 `three → battle3d` 顺序动态注入：

```js
threePromise = load('vendor/three.min.js' + q).then(() => load('js/battle3d.js' + q));
```

版本号直接抄 `app.js` 自己那行 `<script src="js/app.js?v=…">`，`bump-web-version` 一改全跟着变。
加载失败不影响开局：`Battle3D.render` 本来就是用 `if (window.Battle3D && …)` 兜底的，
没有 3D 就退回 DOM 六角格。

顺带删掉了 `js/map3d.js`——它只在 `#map3d` 上建了个 WebGL 上下文，全仓没有任何调用点。

### 2.3 字体自托管（`tools/art/subset-fonts.py`）

原来 `fonts.googleapis.com` 那份 CSS 有 332KB：Noto Sans SC 每个字重都会展开成上百个
`unicode-range` 分片。而且这是本地联机游戏，**队友的机器可能没有外网**——一断网就全站掉字。

改成按「本站真正会渲染的字符」切子集：

1. 扫 `web/**`（html/js/css，剥掉注释）和 `src/**/*.cs`（技能、道具、剧情文案都在里面）；
2. 1704 个字符（汉字 1592）→ Noto Sans SC 变量字体 `wght 100–900` 一个文件 **489KB**；
3. Chakra Petch 只取拉丁子集，两个字重各 9KB。

不 preload、`font-display: swap`：先出系统字，字体到了再换，不挡首屏。
改了文案重跑一次脚本即可，命令写在脚本头部。

### 2.4 立绘分层：缩略图 + WebP

**2D 立绘**（600×1100，单张 ~120KB）在标题墙和选人卡上只有 40–200px 宽，
按用途切了两档（`app.js: pthumb(url, 'rail'|'thumb')`）：

| 用途 | 文件 | 单张 | 合计 |
|---|---|---|---|
| 标题立绘墙（8 列 × 40px） | `portraits/rail/*.webp` 160px | 14KB | 233KB（只下 8 张 ≈ 116KB） |
| 选人卡（196–260px） | `portraits/thumb/*.webp` 320px | 40KB | 633KB |
| VN / 大招 cut-in | `portraits/*.webp` 原图 | 120KB | 按需 |

**战斗立绘**（`portraits3d/*.png`，3.57MB / 20 张）转 WebP q88：**763KB**，小了 4.7 倍。
加载顺序变成 `webp → png → 2D 大图`，任何一层缺失都能退，不会出现隐形单位。

### 2.5 首屏预加载

```html
<link rel="preload" as="image" href="assets/keyart/title.webp" fetchpriority="high" />
```

只 preload 这一张（LCP 主视觉）。字体和 three.js 都**不** preload：
它们不挡首屏，抢带宽反而拖慢更大的图。

## 3. 怎么复跑

```bash
dotnet build src/AGI2046.Server/AGI2046.Server.csproj
dotnet run --project src/AGI2046.Server/AGI2046.Server.csproj --no-build
node tools/e2e/perf-check.mjs title     # 首屏
node tools/e2e/perf-check.mjs select    # 进选人页
node tools/e2e/perf-check.mjs battle    # 一路打进战斗
```

输出包含 FCP / DCL / load、按 `initiatorType` 汇总的传输量、最大的 10 个资源。
改完加载链路先跑这个，别靠手感。

## 4. 还没做（按性价比）

| 项 | 现状 | 能省 |
|---|---|---|
| **BGM 重编码** | 两首各 1.24MB（128kbps），进战斗时下载 | 改 96kbps 约省 600KB；但会影响听感，需要试听 |
| **`/api/meta` 拆分** | 203KB（压缩 39KB）一次给全 | 标题页只要 characters，其余可延后 |
| **CSS 拆包** | 44KB 压缩，一个文件 | 首屏关键样式内联，其余延后 |
| **战场背景** | 单张 200–290KB，按场景取 | 已按需，暂不动 |
| **Service Worker** | 没有 | 二次打开可做到 0 请求（本地服务端已够快，优先级低） |

## 5. 一个容易踩的坑

`index.html` 里的 `?v=` 必须跟着 `bump-web-version.mjs` 走。
所有「长缓存 + immutable」都建立在这个前提上——手改了 `web/js/*.js` 却没升版本，
玩家就会一直用旧脚本，且**看不出是缓存问题**。改完前端跑一次：

```bash
node tools/bump-web-version.mjs
```
