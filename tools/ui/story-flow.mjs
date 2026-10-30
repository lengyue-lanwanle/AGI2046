// 剧情真实流程：新开局 → 序章自动播 → 跳过 → 能继续操作
// 用法：node tools/ui/story-flow.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = process.env.APP || 'http://127.0.0.1:5178';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = async (p, b) => {
  const r = await fetch(APP + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b ?? {}) });
  return { ok: r.ok, data: await r.json().catch(() => ({})) };
};

const created = await post('/api/new', { characterIds: ['gpt', 'claude', 'deepseek', 'jev'], seed: 777 });
if (!created.ok) { console.error('开局失败', created.data); process.exit(1); }
const sid = created.data.sessionId;

// 固定端口会让并发/残留实例互相串台（连到上一轮的页面），改成随机端口
const PORT = Number(process.env.CDP_PORT || (9400 + Math.floor(Math.random() * 400)));
const browser = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(os.tmpdir(), 'agi-story-' + Date.now())}`,
  '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--window-size=1440,900', 'about:blank'
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
  fs.mkdirSync('tools/ui/vn', { recursive: true });
  fs.writeFileSync(path.join('tools/ui/vn', name + '.png'), Buffer.from(r.data, 'base64'));
};
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —  ' + detail : ''}`); cond ? pass++ : fail++; };

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
await send('Page.navigate', { url: APP });
await sleep(2200);

// 全新浏览器：先清掉已读记录，再看续玩是否自动播序章
// 这条测试只关心序章：先把开场 CG 标成已看，免得先等 5 秒视频
await ev(`localStorage.removeItem('agi2046.seenScenes');
          localStorage.setItem('agi2046.seenCG', JSON.stringify({ intro: 1 }));
          localStorage.setItem('agi2046.sessionId', ${JSON.stringify(sid)}); 1`);
await send('Page.reload');
await sleep(2400);
await ev(`document.querySelector('#btn-resume')?.click(); 1`);
await sleep(1800);
ok('续玩自动播序章', await ev(`!!document.querySelector('.vn')`), await ev(`document.querySelector('.vn-title')?.textContent || ''`));
await shot('10-auto-prologue');

// 读完一整场：逐句点完
let guard = 0;
while (guard++ < 40 && await ev(`!!document.querySelector('.vn-box')`)) {
  await ev(`document.querySelector('.vn-box')?.click(); 1`);
  await sleep(90);
}
await sleep(500);
ok('读完序章后舞台关闭', !(await ev(`!!document.querySelector('.vn')`)));
ok('序章已记为已读', await ev(`JSON.parse(localStorage.getItem('agi2046.seenScenes')||'{}').prologue === 1`));
ok('关闭后地图可点', await ev(`!!document.querySelector('.map-node')`));

// 刷新后不再重复播
await send('Page.reload');
await sleep(2400);
await ev(`document.querySelector('#btn-resume')?.click(); 1`);
await sleep(1600);
ok('再次进入不重复播序章', !(await ev(`!!document.querySelector('.vn')`)));

// 剧情档案里点开一场，Esc 能跳过
await ev(`document.querySelector('#btn-story-archive')?.click(); 1`);
await sleep(400);
await ev(`document.querySelector('[data-scene="interlude1"]')?.click(); 1`);
await sleep(900);
ok('档案能直接播幕间', (await ev(`document.querySelector('.vn-title')?.textContent || ''`)).includes('幕间一'));
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await sleep(500);
ok('Esc 跳过整场', !(await ev(`!!document.querySelector('.vn')`)));

ok('控制台无异常', errors.length === 0, JSON.stringify(errors.slice(0, 3)));
console.log(`\n${pass} 通过 / ${fail} 失败`);

await send('Browser.close').catch(() => {});
spawn('taskkill', ['/F', '/T', '/PID', String(browser.pid)], { stdio: 'ignore' });
process.exit(fail ? 1 : 0);
