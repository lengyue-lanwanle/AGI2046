// 支线 UI 验证：真实浏览器打开任务卡、接受、看 INTEL 面板，并检查控制台报错
// 用法：node tools/e2e/quest-ui.mjs   （需要服务端已启动在 5178）
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = process.env.APP_URL || 'http://localhost:5178';
const APP_URL = APP + (APP.includes('?') ? '&' : '?') + 'bot=1';   // 自动化跳过 VN 剧情
const PORT = Number(process.env.CDP_PORT || 9224);
const OUT = path.resolve('tools/e2e/out');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —  ' + detail : ''}`);
};

/* ── 1. 用 API 把一名角色送到第 4 层残响 ─────────────────────────── */
const post = async (p, b) => {
  const r = await fetch(APP + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
  return { ok: r.ok, data: await r.json() };
};

let g = (await post('/api/new', { characterIds: ['gpt'], seed: 12345 })).data;
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

const echo = g.nodes.find(n => n.type === 'echo' && n.layer === 4);
const target = echo.id;
for (let i = 0; i < 200; i++) {
  const p = g.players.find(x => x.id === g.activePlayerId);
  if (p.nodeId === target) break;
  if (p.ap <= 0) { await act({ type: 'endTurn', playerId: p.id }); continue; }
  const step = pathTo(p.nodeId, target)[0];
  if (!step) break;
  await act({ type: 'move', playerId: p.id, nodeId: step });
}
while (g.players[0].ap <= 0) await act({ type: 'endTurn', playerId: g.activePlayerId });
ok('准备：角色停在第 4 层残响', g.players[0].nodeId === target, target);

/* ── 2. 真浏览器 ──────────────────────────────────────────────────── */
const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
];
const browserPath = BROWSERS.find(p => fs.existsSync(p));
if (!browserPath) throw new Error('找不到 Edge/Chrome');

const profileDir = path.join(os.tmpdir(), `agi-quest-ui-${Date.now()}`);
const browser = spawn(browserPath, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profileDir}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  '--window-size=1440,960', 'about:blank'
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function findTarget() {
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* 还没起来 */ }
    await sleep(120);
  }
  throw new Error('CDP 未就绪');
}

const wsUrl = await findTarget();
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
  if (msg.method === 'Runtime.exceptionThrown') {
    consoleErrors.push(msg.params.exceptionDetails?.exception?.description || 'exception');
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    consoleErrors.push((msg.params.args || []).map(a => a.value ?? a.description ?? '').join(' '));
  }
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
  const file = path.join(OUT, `${name}.png`);
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  console.log(`[shot] ${file}`);
  return file;
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

// 注入存档并刷新，走真实「继续行动」路径
await evaluate(`localStorage.setItem('agi2046.sessionId', ${JSON.stringify(sid)})`);
await send('Page.reload');
await sleep(1200);
for (let i = 0; i < 60; i++) {
  const has = await evaluate(`!document.querySelector('#btn-resume').classList.contains('hidden')`).catch(() => false);
  if (has) break;
  await sleep(200);
}
ok('标题页出现「继续行动」', await evaluate(`!document.querySelector('#btn-resume').classList.contains('hidden')`));
await evaluate(`document.querySelector('#btn-resume').click()`);
await sleep(800);
ok('进入游戏界面', await evaluate(`document.querySelector('#game-screen').classList.contains('active')`));

// 先点掉开场的剧情卡，否则会挡住地图交互
for (let i = 0; i < 6; i++) {
  const has = await evaluate(`!!document.querySelector('[data-act="story-continue"]')`).catch(() => false);
  if (!has) break;
  await evaluate(`document.querySelector('[data-act="story-continue"]').click()`);
  await sleep(500);
}
ok('开场剧情卡已关闭', !(await evaluate(`!!document.querySelector('[data-act="story-continue"]')`)));

// 地图上应有残响节点且开局可见
const echoVisible = await evaluate(`!!document.querySelector('.map-node.echo:not(.unrevealed)')`);
ok('地图渲染出残响节点', echoVisible);

// 点当前节点 → 任务卡
await evaluate(`document.querySelector('.map-node[data-node-id="${target}"]').click()`);
await sleep(900);
const cardTitle = await evaluate(`document.querySelector('#modal-root .quest-card .story-title')?.textContent || ''`);
ok('互动后弹出任务卡', !!cardTitle, cardTitle);
await shot('10-quest-card');

// 接受 → INTEL 面板出现进度
await evaluate(`document.querySelector('[data-act="quest-accept"]').click()`);
await sleep(900);
const inPanel = await evaluate(`(() => {
  const box = document.querySelector('#quest-box');
  return box && !box.classList.contains('hidden') ? box.innerText.replace(/\\s+/g, ' ').trim() : '';
})()`);
ok('接受后 INTEL 面板显示支线', !!inPanel, inPanel.slice(0, 80));
await shot('11-quest-intel');

ok('控制台无报错', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));

ws.close();
browser.kill();
await fetch(`${APP}/api/session/${sid}`, { method: 'DELETE' }).catch(() => {});

const passed = results.filter(r => r.pass).length;
console.log(`\n${passed}/${results.length} 通过`);
process.exit(passed === results.length ? 0 : 1);
