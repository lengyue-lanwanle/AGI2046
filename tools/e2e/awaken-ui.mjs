// 觉醒节点 UI 验证：觉醒后地图上该节点应置灰并标注「回声已被取走」，再点不消耗 AP、不报错
// 用法：node tools/e2e/awaken-ui.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = process.env.APP_URL || 'http://localhost:5178';
const APP_URL = APP + (APP.includes('?') ? '&' : '?') + 'bot=1';   // 自动化跳过 VN 剧情
const PORT = Number(process.env.CDP_PORT || 9226);
const OUT = path.resolve('tools/e2e/out');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —  ' + detail : ''}`);
};

const post = async (p, b) => {
  const r = await fetch(APP + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
  return { ok: r.ok, data: await r.json() };
};
let g = (await post('/api/new', { characterIds: ['gpt', 'claude'], seed: 12345 })).data;
const sid = g.sessionId;
const act = async a => {
  const r = await post('/api/action', { sessionId: sid, action: a });
  if (!r.ok) throw new Error(r.data.error || 'action failed');
  g = r.data;
  return g;
};
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

const awaken = g.nodes.find(n => n.type === 'awakening');
ok('觉醒节点开局可见（API）', awaken.revealed === true, `${awaken.id} revealed=${awaken.revealed}`);

for (let i = 0; i < 300; i++) {
  const p = g.players.find(x => x.id === g.activePlayerId);
  if (p.nodeId === awaken.id) break;
  if (p.downed || p.ap <= 0) { await act({ type: 'endTurn', playerId: p.id }); continue; }
  const step = pathTo(p.nodeId, awaken.id)[0];
  if (!step) break;
  await act({ type: 'move', playerId: p.id, nodeId: step });
}
const holder = () => g.players.find(x => x.id === g.activePlayerId);
while (holder().ap <= 0 || g.activePlayerId !== 'p1') {
  await act({ type: 'endTurn', playerId: g.activePlayerId });
}
ok('p1 抵达觉醒节点', g.players[0].nodeId === awaken.id, g.players[0].nodeId);
await act({ type: 'interact', playerId: 'p1', nodeId: awaken.id });
ok('p1 完成觉醒', g.awakenedPlayerId === 'p1', g.awakenedPlayerId);
ok('节点已清除', g.nodes.find(n => n.id === awaken.id).cleared === true);

/* ── 浏览器 ───────────────────────────────────────────────────────── */
const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
];
const browserPath = BROWSERS.find(p => fs.existsSync(p));
const profileDir = path.join(os.tmpdir(), `agi-awaken-ui-${Date.now()}`);
const browser = spawn(browserPath, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1440,960', 'about:blank'
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
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
  if (r.exceptionDetails) throw new Error('页面脚本异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
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
for (let i = 0; i < 120; i++) {
  const ready = await evaluate(`document.readyState === 'complete' && !!document.querySelector('#btn-start')`).catch(() => false);
  if (ready) break;
  await sleep(120);
}
await evaluate(`localStorage.setItem('agi2046.sessionId', ${JSON.stringify(sid)})`);
await send('Page.reload');
await sleep(1400);
for (let i = 0; i < 60; i++) {
  const has = await evaluate(`!document.querySelector('#btn-resume').classList.contains('hidden')`).catch(() => false);
  if (has) break;
  await sleep(200);
}
await evaluate(`document.querySelector('#btn-resume').click()`);
await sleep(900);
for (let i = 0; i < 6; i++) {
  const has = await evaluate(`!!document.querySelector('[data-act="story-continue"]')`).catch(() => false);
  if (!has) break;
  await evaluate(`document.querySelector('[data-act="story-continue"]').click()`);
  await sleep(500);
}

const spent = await evaluate(`(() => {
  const el = document.querySelector('.map-node.awakening.spent');
  if (!el) return null;
  return { sub: el.querySelector('.node-sub')?.textContent || '', badge: el.querySelector('.node-badge')?.textContent || '' };
})()`);
ok('地图上觉醒节点已置灰（spent）', !!spent, spent ? spent.sub : 'not found');
ok('副标题标注「回声已被取走」', (spent?.sub || '').includes('回声已被取走'), spent?.sub || '');
await shot('12-awaken-spent');

// 再点一次：应只弹提示，不消耗 AP
// AP 现在显示在属性格里（#active-card .ac-stat），不再挤在角色行里
const readAp = () => evaluate(`(() => {
  const cells = [...document.querySelectorAll('#active-card .ac-stat')];
  const cell = cells.find(c => (c.querySelector('span')?.textContent || '').trim() === 'AP');
  const n = Number((cell?.querySelector('b')?.textContent || '').trim());
  return Number.isFinite(n) ? n : null;
})()`);
const apBefore = await readAp();
await evaluate(`document.querySelector('.map-node[data-node-id="${awaken.id}"]').click()`);
await sleep(700);
const apAfter = await readAp();
const toastText = await evaluate(`document.querySelector('#toast-layer')?.innerText?.replace(/\\s+/g, ' ').trim() || ''`);
ok('重复点击不消耗 AP', apBefore !== null && apBefore === apAfter, `${apBefore} → ${apAfter}`);
ok('给出温和提示而非报错', /回声|找回/.test(toastText), toastText.slice(0, 40));
ok('控制台无报错', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));

ws.close();
browser.kill();
await fetch(`${APP}/api/session/${sid}`, { method: 'DELETE' }).catch(() => {});
const passed = results.filter(r => r.pass).length;
console.log(`\n${passed}/${results.length} 通过`);
process.exit(passed === results.length ? 0 : 1);
