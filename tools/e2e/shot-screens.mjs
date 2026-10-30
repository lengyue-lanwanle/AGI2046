// 截标题页 / 选人页：改完加载链路后确认字体、立绘、布局没坏
// 用法: node tools/e2e/shot-screens.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = process.env.APP_URL || 'http://127.0.0.1:5178';
const PORT = Number(process.env.CDP_PORT || 9261);
const OUT = path.resolve('tools/e2e/out');
fs.mkdirSync(OUT, { recursive: true });
const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
];
const browserPath = BROWSERS.find(p => fs.existsSync(p));
const profileDir = path.join(os.tmpdir(), `agi-shot-${Date.now()}`);
const proc = spawn(browserPath, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`,
  '--no-first-run', '--disable-gpu', '--window-size=1440,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let wsUrl = null;
for (let i = 0; i < 120 && !wsUrl; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    wsUrl = list.find(t => t.type === 'page')?.webSocketDebuggerUrl;
  } catch { /* 等浏览器 */ }
  if (!wsUrl) await sleep(150);
}
const ws = await new Promise((res, rej) => { const s = new WebSocket(wsUrl); s.onopen = () => res(s); s.onerror = rej; });
let seq = 0; const pending = new Map();
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
};
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;
const shot = async name => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
  console.log('shot', name);
};

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: APP + '/?bot=1' });
await sleep(4000);
console.log('字体状态', await ev(`document.fonts.status`));
console.log('已加载字体', await ev(`Array.from(document.fonts).filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight).join(', ')`));
await shot('load-title.png');

await ev(`document.querySelector('#btn-start')?.click()`);
await sleep(2500);
await shot('load-select.png');
console.log('选人卡图片', await ev(`document.querySelectorAll('.char-card img').length`));

ws.close();
proc.kill();
