// 立绘验证：选一支包含指定角色的队伍 → 进入首个战斗节点 → 截图
// 用法: node tools/e2e/portrait-shot.mjs [角色id,逗号分隔] [输出名]
// 例:   node tools/e2e/portrait-shot.mjs wenxin,claude,gemini,gpt wenxin-battle.png
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = process.env.APP_URL || 'http://127.0.0.1:5178';
const APP_URL = APP + (APP.includes('?') ? '&' : '?') + 'bot=1';
const WANT = (process.argv[2] || 'wenxin').split(',').filter(Boolean);
const OUT_NAME = process.argv[3] || 'portrait-shot.png';
const PORT = Number(process.env.CDP_PORT || 9241);
const OUT = path.resolve('tools/e2e/out');
fs.mkdirSync(OUT, { recursive: true });

const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
];
const browserPath = BROWSERS.find(p => fs.existsSync(p));
if (!browserPath) throw new Error('找不到 Edge/Chrome');

const profileDir = path.join(os.tmpdir(), `agi-portrait-${Date.now()}`);
const proc = spawn(browserPath, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  '--window-size=1440,900', 'about:blank'
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));

let wsUrl = null;
for (let i = 0; i < 120 && !wsUrl; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    wsUrl = list.find(t => t.type === 'page')?.webSocketDebuggerUrl;
  } catch { /* 等待浏览器 */ }
  if (!wsUrl) await sleep(150);
}
if (!wsUrl) throw new Error('浏览器没起来');

const ws = await new Promise((res, rej) => { const s = new WebSocket(wsUrl); s.onopen = () => res(s); s.onerror = rej; });
let seq = 0; const pending = new Map(); const errors = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
  else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description || 'exception');
};
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expression, awaitPromise = false) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const shot = async name => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
  console.log('shot ->', path.join(OUT, name));
};
const waitFor = async (expr, ms = 15000, label = expr) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await ev(`!!(${expr})`)) return true;
    await sleep(150);
  }
  console.log('timeout waiting for', label);
  return false;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: APP_URL });
await sleep(2500);

// 首次运行会弹教学，跳过
if (await ev(`!!document.querySelector('[data-act="tutorial-finish"]')`)) {
  await ev(`document.querySelector('[data-act="tutorial-finish"]').click()`);
  await sleep(1200);
}

// 标题页 → 选人页
if (await ev(`!!document.querySelector('#btn-start')`)) {
  await ev(`document.querySelector('#btn-start').click()`);
  await sleep(1200);
}

if (!await waitFor(`document.querySelector('[data-act="select-char"]')`, 12000, '选人页')) {
  await shot('portrait-fail.png');
  throw new Error('没进选人页');
}

// 先全部取消选中，再点需要的角色（避免默认选中被点掉）
await ev(`document.querySelectorAll('[data-act="select-char"][aria-pressed="true"]').forEach(b => b.click())`);
await sleep(300);
const clicked = [];
for (const id of WANT) {
  const ok = await ev(`(() => { const b = document.querySelector('[data-act="select-char"][data-char-id="${id}"]'); if (!b) return false; b.click(); return true; })()`);
  clicked.push(`${id}:${ok ? 'ok' : 'missing'}`);
}
console.log('clicked', clicked.join(' '));
await sleep(400);
const picked = await ev(`Array.from(document.querySelectorAll('[data-act="select-char"][aria-pressed="true"]')).map(b => b.dataset.charId)`);
console.log('selected', JSON.stringify(picked));

await ev(`document.querySelector('#btn-create').click()`);
await waitFor(`document.querySelector('[data-act="node"]')`, 20000, '地图');

// 序章弹窗 / 幕间弹窗：点主按钮推进
const dismissModals = async (rounds = 8) => {
  for (let i = 0; i < rounds; i++) {
    const hit = await ev(`(() => {
      const b = document.querySelector('[data-act="story-continue"],[data-act="modal-close"].btn-primary,[data-act="boss-go"]');
      if (b && b.offsetParent) { b.click(); return b.dataset.act; }
      return '';
    })()`);
    if (!hit) return;
    console.log('modal', hit);
    await sleep(900);
  }
};
await dismissModals();

// 走到一个战斗节点并开打：点击 → 若是移动则换人再点，直到进入战斗
const NODES = await ev(`Array.from(document.querySelectorAll('[data-act="node"]')).map(n => n.dataset.nodeId + ':' + (n.querySelector('.node-type')?.textContent || '?') + ':' + n.className)`);
console.log('nodes', JSON.stringify(NODES));
const TARGET = await ev(`(() => {
  const b = Array.from(document.querySelectorAll('[data-act="node"]'))
    .find(n => /战斗/.test(n.querySelector('.node-type')?.textContent || '') && !n.disabled);
  return b ? b.dataset.nodeId : '';
})()`);
console.log('target node', TARGET);
for (let i = 0; i < 30; i++) {
  if (await ev(`!!document.querySelector('[data-act="hex"]')`)) { console.log('in combat'); break; }
  const exists = await ev(`(() => { const b = document.querySelector('[data-act="node"][data-node-id="${TARGET}"]'); if (!b) return false; b.click(); return true; })()`);
  await sleep(1100);
  await dismissModals(3);
  if (await ev(`!!document.querySelector('[data-act="hex"]')`)) { console.log('in combat'); break; }
  if (!exists) break;
  // 换下一个行动者再试（同一节点对当前行动者可能是「不相邻」）
  const ended = await ev(`(() => { const b = document.querySelector('[data-act="end-turn"]'); if (b && !b.disabled) { b.click(); return true; } return false; })()`);
  if (!ended) await sleep(600);
  await sleep(700);
  await dismissModals(2);
}

await sleep(3500);
await shot(OUT_NAME);
console.log('errors', errors.length ? errors.slice(0, 3) : 'none');
ws.close();
proc.kill();
