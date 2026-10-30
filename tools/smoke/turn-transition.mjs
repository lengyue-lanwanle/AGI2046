// 单人热座：换人时应出现过场动画
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = process.env.APP_URL || 'http://localhost:5178';
const APP_URL = APP + (APP.includes('?') ? '&' : '?') + 'bot=1';   // 自动化跳过 VN 剧情
const OUT = path.resolve('tools/e2e/out');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —  ' + detail : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const post = async (p, b) => {
  const r = await fetch(APP + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
  return { status: r.status, data: await r.json() };
};

const g = (await post('/api/new', { characterIds: ['gpt', 'claude'], seed: 12345 })).data;
const sid = g.sessionId;

const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
];
const browserPath = BROWSERS.find(p => fs.existsSync(p));
const PORT = 9400 + Math.floor(Math.random() * 100);
const profileDir = path.join(os.tmpdir(), `agi-turn-${Date.now()}`);
const browser = spawn(browserPath, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1440,960', 'about:blank'
], { stdio: 'ignore' });

let wsUrl = null;
for (let i = 0; i < 100 && !wsUrl; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    wsUrl = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl)?.webSocketDebuggerUrl;
  } catch { /* 等待 */ }
  if (!wsUrl) await sleep(120);
}
const ws = await new Promise((resolve, reject) => {
  const s = new WebSocket(wsUrl);
  s.onopen = () => resolve(s);
  s.onerror = e => reject(new Error('WS 失败: ' + e.message));
});
let msgSeq = 0;
const pending = new Map();
const consoleErrors = [];
ws.onmessage = ev => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    return;
  }
  if (msg.method === 'Runtime.exceptionThrown') consoleErrors.push(msg.params.exceptionDetails?.exception?.description || 'exception');
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error')
    consoleErrors.push((msg.params.args || []).map(a => a.value ?? a.description ?? '').join(' '));
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++msgSeq;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression, awaitPromise = false) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error('页面异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const waitFor = async (expression, timeout = 8000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if (await evaluate(expression).catch(() => false)) return true;
    await sleep(120);
  }
  return false;
};
const shot = async name => {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  console.log(`[shot] ${path.join(OUT, `${name}.png`)}`);
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: APP_URL });
await waitFor(`document.readyState === 'complete' && !!document.querySelector('#btn-start')`, 15000);
await evaluate(`localStorage.setItem('agi2046.sessionId', ${JSON.stringify(sid)})`);
await send('Page.reload');
await sleep(1400);
await waitFor(`!document.querySelector('#btn-resume').classList.contains('hidden')`, 10000);
await evaluate(`document.querySelector('#btn-resume').click()`);
await sleep(900);

for (let i = 0; i < 6; i++) {
  const has = await evaluate(`!!document.querySelector('[data-act="story-continue"]')`).catch(() => false);
  if (!has) break;
  await evaluate(`document.querySelector('[data-act="story-continue"]').click()`);
  await sleep(400);
}
ok('单人局进入探索界面', await evaluate(`document.querySelector('#game-screen').classList.contains('active')`));

const before = await evaluate(`document.querySelector('#active-card .ac-name')?.textContent || ''`);
await evaluate(`document.querySelector('[data-act="end-turn"]').click()`);
// 0.18 起换人过场由 cinematics.js 负责（.cine-turn），旧样式只作兜底
const saw = await waitFor(`!!document.querySelector('.cine-turn, .turn-transition')`, 6000);
ok('换人时出现过场动画', saw);
const text = await evaluate(`document.querySelector('.cine-turn .ct-name, .turn-transition .tt-name')?.textContent || ''`);
ok('过场显示的是下一位角色', !!text && text !== before, `${before} → ${text}`);
const kicker = await evaluate(`document.querySelector('.cine-turn .ct-kicker, .turn-transition .tt-kicker')?.textContent || ''`);
ok('热座过场用 NEXT EXECUTOR 文案', kicker === 'NEXT EXECUTOR', kicker);
if (saw) await shot('26-turn-transition-solo');

ok('控制台无报错', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));

ws.close();
browser.kill();
await fetch(`${APP}/api/session/${sid}`, { method: 'DELETE' });
const passed = results.filter(r => r.pass).length;
console.log(`\n${passed}/${results.length} 通过`);
process.exit(passed === results.length ? 0 : 1);
