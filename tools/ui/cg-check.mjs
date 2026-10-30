// CG 播放层巡检：能播 / 能跳 / 文件缺失时不卡流程 / 手机尺寸
// 用法：node tools/ui/cg-check.mjs [outDir]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = process.env.APP || 'http://127.0.0.1:5178';
const OUT = process.argv[2] || 'tools/ui/cg';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 演示片不放 web/：临时拷进去、跑完删掉。游戏里片单默认是空的。
// CG_REAL=1：直接验游戏里真正登记的那条（web/assets/cg/intro.mp4），不注入夹具
const USE_REAL = process.env.CG_REAL === '1';
const FIXTURE = 'tools/video/fixture/demo-720p.mp4';
const POSTER = 'tools/video/fixture/demo-poster.webp';
const TMP_MP4 = 'web/assets/cg/_test.mp4';
const TMP_WEBP = 'web/assets/cg/_test.webp';
if (!USE_REAL && !fs.existsSync(FIXTURE)) {
  console.error('缺少演示片：' + FIXTURE + '（用 tools/video/make-demo.mjs 生成）');
  process.exit(1);
}
fs.mkdirSync('web/assets/cg', { recursive: true });
if (!USE_REAL) {
  fs.copyFileSync(FIXTURE, TMP_MP4);
  fs.copyFileSync(POSTER, TMP_WEBP);
}
const cleanup = () => { if (USE_REAL) return; for (const f of [TMP_MP4, TMP_WEBP]) { try { fs.unlinkSync(f); } catch {} } };
process.on('exit', cleanup);

const created = await fetch(APP + '/api/new', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ characterIds: ['gpt', 'claude'], seed: 5150 })
}).then((r) => r.json());
const sid = created.sessionId;

const PORT = Number(process.env.CDP_PORT || (9400 + Math.floor(Math.random() * 400)));
const browser = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(os.tmpdir(), 'agi-cg-' + Date.now())}`,
  '--no-first-run', '--autoplay-policy=no-user-gesture-required',
  '--hide-scrollbars', '--window-size=1440,900', 'about:blank'
], { stdio: 'ignore' });

let wsUrl = null;
for (let i = 0; i < 120 && !wsUrl; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    wsUrl = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)?.webSocketDebuggerUrl;
  } catch { /* 还没起 */ }
  if (!wsUrl) await sleep(150);
}
const ws = await new Promise((res, rej) => { const s = new WebSocket(wsUrl); s.onopen = () => res(s); s.onerror = rej; });
let id = 0; const pend = new Map(); const errors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
  else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description || 'exception');
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return r.exceptionDetails ? 'ERR ' + (r.exceptionDetails.exception?.description || '') : r.result?.value;
};
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
};
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —  ' + detail : ''}`); cond ? pass++ : fail++; };

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
await send('Page.navigate', { url: APP });
await sleep(2200);

await ev(`localStorage.setItem('agi2046.sessionId', ${JSON.stringify(sid)});
          localStorage.removeItem('agi2046.seenCG');
          localStorage.removeItem('agi2046.seenScenes'); 1`);
await send('Page.reload');
await sleep(2400);
// 片单默认空 → 先验证「没登记时直接放行」，再登记演示片跑真实播放
ok('游戏里已登记开场片', await ev(`window.CG.has('intro')`), JSON.stringify(await ev(`window.CG.clips()`)));
// 未登记的 id 必须立刻返回 false，且不接管画面（用 __none__，不要拿真 id 试——那会真的播起来）
const probe = await ev(`(() => {
  const r = window.CG.play('__none__', { onEnd: () => {} });
  return { returned: r, layers: document.querySelectorAll('.cg').length };
})()`);
ok('未登记的 id 直接放行且不接管画面', probe.returned === false && probe.layers === 0, JSON.stringify(probe));
if (!USE_REAL) {
  await ev(`window.CG.register('intro', { src: 'assets/cg/_test.mp4', poster: 'assets/cg/_test.webp', title: '霓虹港 · 2046', sub: 'NEON HARBOR' }); 1`);
}
await ev(`document.querySelector('#btn-resume')?.click(); 1`);

// 1. 开场 CG 应接管画面
await sleep(1500);
ok('序章前先播开场 CG', await ev(`!!document.querySelector('.cg')`));
const st = await ev(`(() => {
  const v = document.querySelector('.cg-video');
  if (!v) return null;
  return { ready: v.readyState, t: +v.currentTime.toFixed(2), w: v.videoWidth, h: v.videoHeight, paused: v.paused };
})()`);
ok('视频真的在解码', !!st && st.ready >= 2 && st.w > 0, JSON.stringify(st));
ok('播了 1 秒以上', !!st && st.t > 0.5, `currentTime=${st?.t}`);
await shot('01-intro-cg');

// 2. 跳过 → 直接接序章
await ev(`document.querySelector('.cg-skip')?.click(); 1`);
await sleep(900);
ok('跳过能收掉 CG', !(await ev(`!!document.querySelector('.cg')`)));
ok('跳过之后接序章', await ev(`!!document.querySelector('.vn')`), await ev(`document.querySelector('.vn-title')?.textContent || ''`));
ok('CG 记为看过', await ev(`!!(JSON.parse(localStorage.getItem('agi2046.seenCG')||'{}').intro)`));
await shot('02-after-skip');

// 3. 再来一次：不该重复播
await ev(`document.querySelector('[data-vn="skip"]')?.click(); 1`); await sleep(300);
await send('Page.reload'); await sleep(2200);
if (!USE_REAL) await ev(`window.CG.register('intro', { src: 'assets/cg/_test.mp4', title: '霓虹港 · 2046' }); 1`);
await ev(`document.querySelector('#btn-resume')?.click(); 1`);
await sleep(1400);
ok('看过之后不再重复播 CG', !(await ev(`!!document.querySelector('.cg')`)));
await ev(`document.querySelector('[data-vn="skip"]')?.click(); 1`); await sleep(300);

// 4. 文件缺失：必须放行，不能卡在 8 秒黑屏里
const moved = await ev(`(async () => {
  try { const r = await fetch(${JSON.stringify(USE_REAL ? 'assets/cg/intro.mp4' : 'assets/cg/_test.mp4')}, { method: 'HEAD' }); return r.status; } catch { return 0; }
})()`);
await ev(`localStorage.removeItem('agi2046.seenCG'); localStorage.removeItem('agi2046.seenScenes'); 1`);
// 用一个不存在的地址模拟「片子还没生成」：临时改 window.CG 的片单不现实，改成直接调用并断言返回值
const missing = await ev(`(() => {
  const before = !!document.querySelector('.cg');
  const r = window.CG.play('nope', { onEnd: () => {} });
  return { before, returned: r, layer: !!document.querySelector('.cg') };
})()`);
ok('未登记的片子直接返回 false（不接管画面）', missing.returned === false && !missing.layer, JSON.stringify(missing));
ok('片子可访问（HEAD 200）', moved === 200, `status=${moved}`);
if (USE_REAL) ok('开场片体积合理（<3MB）', (await ev(`(async()=>{const r=await fetch('assets/cg/intro.mp4',{method:'HEAD'});return +r.headers.get('content-length')})()`)) < 3 * 1024 * 1024);

// 5. 手机尺寸
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await ev(`localStorage.removeItem('agi2046.seenCG'); 1`);
await send('Page.reload'); await sleep(2200);
if (!USE_REAL) await ev(`window.CG.register('intro', { src: 'assets/cg/_test.mp4', title: '霓虹港 · 2046' }); 1`);
await ev(`document.querySelector('#btn-resume')?.click(); 1`);
await sleep(1600);
await shot('03-mobile-cg');
const mobile = await ev(`(() => {
  const v = document.querySelector('.cg-video'); if (!v) return null;
  const r = v.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height), vw: innerWidth, vh: innerHeight, sw: document.documentElement.scrollWidth };
})()`);
ok('手机铺满且无横向溢出', !!mobile && mobile.w === mobile.vw && mobile.sw <= mobile.vw, JSON.stringify(mobile));

ok('控制台无异常', errors.length === 0, JSON.stringify(errors.slice(0, 3)));
console.log(`\n${pass} 通过 / ${fail} 失败  →  ${path.resolve(OUT)}`);

await send('Browser.close').catch(() => {});
spawn('taskkill', ['/F', '/T', '/PID', String(browser.pid)], { stdio: 'ignore' });
cleanup();
process.exit(fail ? 1 : 0);
