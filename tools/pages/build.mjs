// 构建 GitHub Pages 版：Blazor WASM（C# 规则引擎）+ 现有 web/ 静态前端 → dist-pages/
//
// 用法：node tools/pages/build.mjs
//       node tools/pages/build.mjs --serve     # 构建完顺手起个本地静态服务器（5302）
//
// 产物结构：
//   dist-pages/index.html       ← web/index.html 改的：加 <base>、local-api.js、blazor 启动脚本
//   dist-pages/js/*.js          ← 原封不动，只是多了一个 local-api.js 在前面拦截 /api
//   dist-pages/_framework/*     ← 编译出来的 .NET 运行时 + AGI2046.Rules.wasm
//   dist-pages/.nojekyll        ← 不加这个，GitHub Pages 的 Jekyll 会吃掉 _framework
//   dist-pages/404.html         ← 单页应用兜底
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const out = path.join(root, 'dist-pages');
// 暂存放在系统临时目录：不在仓库里删东西，避免误伤
const stage = path.join(os.tmpdir(), 'agi2046-pages-build');

const log = m => console.log(`\n\x1b[36m== ${m}\x1b[0m`);

log('编译 WASM（首次会久一点，之后增量）');
execFileSync('dotnet', ['publish', path.join(root, 'src', 'AGI2046.Wasm', 'AGI2046.Wasm.csproj'),
  '-c', 'Release', '-o', stage, '--nologo', '-v', 'q'], { stdio: 'inherit' });

log('组装 dist-pages（增量覆盖，不删目录）');
fs.mkdirSync(out, { recursive: true });
fs.cpSync(path.join(root, 'web'), out, { recursive: true, force: true });
// _framework 里的文件名带哈希，旧文件不清理会越积越多；只清这一个子目录
const fwOut = path.join(out, '_framework');
if (fs.existsSync(fwOut)) fs.rmSync(fwOut, { recursive: true, force: true });
fs.cpSync(path.join(stage, 'wwwroot', '_framework'), fwOut, { recursive: true });

log('生成 index.html');
let html = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8');

// 1) base：项目页会挂在 /仓库名/ 下，用相对 base 最省事
if (!html.includes('<base ')) {
  html = html.replace('<meta charset="UTF-8" />', '<meta charset="UTF-8" />\n  <base href="./" />');
}
// 2) 离线标记 + 适配层，必须在 app.js 之前
html = html.replace('  <script src="js/audio.js',
  '  <script>window.AGI_LOCAL = 1;</script>\n  <script src="js/local-api.js"></script>\n  <script src="js/audio.js');
// 3) Blazor 运行时（它只负责把 .NET 拉起来，不渲染任何 DOM）
html = html.replace('</body>', '  <script src="_framework/blazor.webassembly.js"></script>\n</body>');

fs.writeFileSync(path.join(out, 'index.html'), html);
fs.writeFileSync(path.join(out, '404.html'), html);
fs.writeFileSync(path.join(out, '.nojekyll'), '');

// 体积统计：分「引擎」「静态资源」「首屏」三块，别拿站点总大小吓人
const sizeOf = (files) => files.reduce((n, p) => n + (fs.existsSync(p) ? fs.statSync(p).size : 0), 0);
const walk = (dir, acc = []) => {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (!p.endsWith('.gz') && (p.endsWith('.br') || !fs.existsSync(p + '.br'))) acc.push(p);
  }
  return acc;
};

const engine = sizeOf(walk(path.join(out, '_framework')));
const assets = sizeOf(walk(path.join(out, 'assets'))) + sizeOf(walk(path.join(out, 'fonts')));
const firstPaint = sizeOf([
  path.join(out, 'index.html'),
  ...walk(path.join(out, 'css')),
  ...walk(path.join(out, 'js')),
  ...walk(path.join(out, 'fonts')),
  path.join(out, 'assets', 'keyart', 'title.webp'),
  ...walk(path.join(out, 'assets', 'portraits', 'rail'))
]);

const mb = n => (n / 1048576).toFixed(1) + ' MB';
console.log(`\n\x1b[32m完成：dist-pages\x1b[0m`);
console.log(`  首屏（标题页真要下的）  ${mb(firstPaint)}`);
console.log(`  .NET 引擎（进对局才下）  ${mb(engine)}`);
console.log(`  美术/音频（按需）        ${mb(assets)}`);
console.log('本地预览：node tools/pages/build.mjs --serve   然后开 http://127.0.0.1:5302');
console.log('发布：把 dist-pages/ 推到 gh-pages 分支（或 Actions 里上传 artifact）。');

// 暂存目录留在系统 TEMP，下次构建会覆盖同名文件，不额外清理

if (process.argv.includes('--serve')) {
  // 自己起一个静态服务器：npx 要联网，而且 python 的 http.server 不认识 .wasm 的 MIME
  const http = await import('node:http');
  const port = Number(process.env.PORT || 5302);
  const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json',
    '.wasm': 'application/wasm', '.dat': 'application/octet-stream',
    '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png',
    '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
    '.br': 'application/octet-stream', '.gz': 'application/gzip'
  };
  log(`静态服务器 http://127.0.0.1:${port}（Ctrl+C 停）`);
  http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    let file = path.join(out, url === '/' ? 'index.html' : url);
    if (!file.startsWith(out)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    // 单页兜底
    if (!fs.existsSync(file)) file = path.join(out, '404.html');
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  }).listen(port, '127.0.0.1');
  console.log('开着别关，浏览器打开上面的地址。');
}
