// 以某个房间成员的身份打开页面并截图（观战视角实测用）
// 用法: node tools/e2e/room-shot.mjs <code> <token> <playerId> <outName>
import { spawn } from 'node:child_process';
import { killBrowser } from './kill-browser.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = process.env.APP_URL || 'http://localhost:5178';
const APP_URL = APP + (APP.includes('?') ? '&' : '?') + 'bot=1';   // 自动化跳过 VN 剧情
const [code, token, playerId, outName = 'spectator.png'] = process.argv.slice(2);
if (!code || !token) { console.error('用法: node tools/e2e/room-shot.mjs <code> <token> <playerId> [outName]'); process.exit(1); }
const PORT = Number(process.env.CDP_PORT || 9237);
const OUT = path.resolve('tools/e2e/out');
fs.mkdirSync(OUT, { recursive: true });

const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
];
const browserPath = BROWSERS.find(p => fs.existsSync(p));
const profileDir = path.join(os.tmpdir(), `agi-roomshot-${Date.now()}`);
const browser = spawn(browserPath, ['--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profileDir}`, '--no-first-run', '--disable-gpu', '--window-size=1440,900', 'about:blank'],
  { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let wsUrl = null;
for (let i = 0; i < 100 && !wsUrl; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    wsUrl = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl)?.webSocketDebuggerUrl;
  } catch { /* 等 */ }
  if (!wsUrl) await sleep(150);
}
const ws = await new Promise((res, rej) => { const s = new WebSocket(wsUrl); s.onopen = () => res(s); s.onerror = rej; });
let seq = 0; const pending = new Map(); const errors = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
  else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description || 'exception');
};
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return r.exceptionDetails ? { error: r.exceptionDetails.exception?.description } : r.result?.value;
};

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `${APP}/?v=93` });
await sleep(1800);
await ev(`localStorage.setItem('agi2046.room', ${JSON.stringify(JSON.stringify({ code, token, playerId }))}); 1`);
await send('Page.reload');
await sleep(3000);

// 叙事卡会挡住界面
for (let i = 0; i < 4; i++) {
  const st = await ev(`(() => { const b = document.querySelector('[data-act="story-continue"]'); if (b) { b.click(); return 'story'; } return 'none'; })()`);
  if (st.value === 'none') break;
  await sleep(900);
}
await sleep(2000);

const seen = await ev(`(() => ({
  phase: document.querySelector('.combat-wrap') && !document.querySelector('.combat-wrap').classList.contains('hidden') ? 'combat-panel' : 'map',
  title: document.querySelector('#combat-title')?.textContent || '',
  hasCanvas: !!document.querySelector('#battle3d') && getComputedStyle(document.querySelector('#battle3d')).display !== 'none',
  skillCards: document.querySelectorAll('.skill-card').length,
  skillDisabled: document.querySelectorAll('.skill-card.disabled').length,
  activeCard: document.querySelector('#active-unit-card')?.innerText?.slice(0, 80) || '',
  hint: document.querySelector('#combat-hint')?.textContent || ''
}))()`);
console.log('观战端界面:', JSON.stringify(seen, null, 1));

const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(path.join(OUT, outName), Buffer.from(shot.data, 'base64'));
console.log('截图:', path.join(OUT, outName), '| 异常:', errors.length ? errors[0] : '无');

await killBrowser(browser, profileDir, send);
try { ws.close(); } catch { /* 已断开 */ }
