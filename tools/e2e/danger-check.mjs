// 危险提示验证：把角色走到精英节点 → 浏览器续玩 → 点击当前节点 → 应弹出二次确认
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = process.env.APP_URL || 'http://localhost:5178';
const APP_URL = APP + (APP.includes('?') ? '&' : '?') + 'bot=1';   // 自动化跳过 VN 剧情
const PORT = 9225;
const OUT = path.resolve('tools/e2e/out');
const browserPath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profile = path.join(os.tmpdir(), 'agi-danger-' + Date.now());
const proc = spawn(browserPath, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--window-size=1440,900', 'about:blank'
], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let wsUrl = null;
for (let i = 0; i < 80 && !wsUrl; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    wsUrl = list.find(t => t.type === 'page')?.webSocketDebuggerUrl;
  } catch { /* 等待 */ }
  if (!wsUrl) await sleep(150);
}
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
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, name), Buffer.from(data, 'base64'));
};

const post = (url, body) => fetch(APP + url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());

// 1) 开一局，沿真实邻接关系走到精英节点（17 层长图里精英在第 10 层，不能写死路径）
const meta = await (await fetch(APP + '/api/meta')).json();
let g = await post('/api/new', { characterIds: meta.characters.slice(0, 4).map(c => c.id), seed: 12345 });
const elite = g.nodes.find(n => n.type === 'elite');
const pathTo = (from, to) => {
  const adj = new Map(g.nodes.map(n => [n.id, n.neighbors]));
  const prev = new Map([[from, null]]);
  const q = [from];
  while (q.length) {
    const cur = q.shift();
    if (cur === to) break;
    for (const nb of adj.get(cur) || []) if (!prev.has(nb)) { prev.set(nb, cur); q.push(nb); }
  }
  const out = [];
  let cur = to;
  while (cur && cur !== from) { out.push(cur); cur = prev.get(cur); }
  return out.reverse();
};
const route = pathTo(g.players[0].nodeId, elite.id);
const ensureP1 = async () => {
  for (let i = 0; i < 8 && (g.activePlayerId !== 'p1' || g.players[0].ap <= 0); i++) {
    g = await post('/api/action', { sessionId: g.sessionId, action: { type: 'endTurn', playerId: g.activePlayerId } });
    if (g.error) throw new Error('结束回合失败: ' + JSON.stringify(g));
  }
};
for (const step of route) {
  await ensureP1();
  g = await post('/api/action', { sessionId: g.sessionId, action: { type: 'move', playerId: 'p1', nodeId: step } });
  if (g.error) throw new Error('移动失败: ' + JSON.stringify(g));
}
console.log('[prepare]', g.sessionId, 'p1@', g.players[0].nodeId, 'type', elite.type, 'name', elite.name, 'act', g.act);

// 走完 3 AP 后结束一轮，让 p1 重新获得 AP，仍站在精英节点上
for (let i = 0; i < 4; i++) {
  const active = g.activePlayerId;
  g = await post('/api/action', { sessionId: g.sessionId, action: { type: 'endTurn', playerId: active } });
  if (g.error) throw new Error('结束回合失败: ' + JSON.stringify(g));
}
console.log('[prepare-after-turn]', 'active', g.activePlayerId, 'p1.ap', g.players[0].ap, 'round', g.round);

// 2) 浏览器续玩
await send('Page.enable');
await send('Runtime.enable');
await send('Page.bringToFront');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: APP_URL });
await sleep(1500);
await ev(`localStorage.setItem('agi2046.sessionId', '${g.sessionId}')`);
await send('Page.reload');
await sleep(2000);
await ev(`document.querySelector('#btn-resume').click()`);
await sleep(900);
// 先关掉开场剧情卡，否则会挡住地图点击
await ev(`document.querySelector('[data-act="story-continue"]')?.click()`);
await sleep(500);

// 3) 点击当前节点（精英）→ 应弹出高危确认
await ev(`document.querySelector('.map-node[data-node-id="${elite.id}"]').click()`);
await sleep(700);
const modal = await ev(`(() => {
  const m = document.querySelector('#modal-root .modal');
  if (!m) return null;
  const confirm = document.querySelector('[data-act="danger-confirm"]');
  return {
    title: m.querySelector('.modal-title, h2, .mh-title')?.innerText || m.innerText.split('\\n')[0],
    text: m.innerText.replace(/\\s+/g, ' ').slice(0, 220),
    hasConfirm: !!confirm,
    phase: window.__last?.phase
  };
})()`);
console.log('[danger-modal]', JSON.stringify(modal));
await shot('demo-danger-modal.png');

// 4) 点「先绕行」应关闭弹窗且不进入战斗
let afterCancel = null;
if (modal?.hasConfirm) {
  await ev(`document.querySelector('[data-act="modal-close"]').click()`);
  await sleep(300);
  afterCancel = await ev(`({
    modal: !!document.querySelector('#modal-root .modal'),
    combatHidden: document.querySelector('#combat-wrap')?.classList.contains('hidden'),
    mapVisible: !document.querySelector('#map-wrap')?.classList.contains('hidden'),
    message: document.querySelector('#map-message')?.textContent
  })`);
  console.log('[cancel]', JSON.stringify(afterCancel));
}

const ok = !!modal?.hasConfirm && afterCancel?.modal === false && afterCancel?.combatHidden === true && afterCancel?.mapVisible === true && errors.length === 0;
console.log('\n===== RESULT =====');
console.log(JSON.stringify({ ok, modal, afterCancel, consoleErrors: errors }, null, 2));

await fetch(APP + '/api/session/' + g.sessionId, { method: 'DELETE' }).catch(() => {});
ws.close(); proc.kill(); await sleep(600); process.exit(ok ? 0 : 1);
