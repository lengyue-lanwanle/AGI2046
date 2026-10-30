// UI 巡检：把每个主要界面都截一张图，用于设计评审（不修改任何游戏状态，除了自己造的测试局）
//
// 用法：node tools/ui/shots.mjs [输出目录]
//   默认输出到 tools/ui/out/
//
// 覆盖：标题 / 选人 / 选人已选 / 地图 / 战斗 / 事件弹窗 / 安全屋 / 背包 / 幕间
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = process.env.APP || 'http://127.0.0.1:5178';
const APP_URL = APP + (APP.includes('?') ? '&' : '?') + 'bot=1';   // 自动化跳过 VN 剧情
const OUT = process.argv[2] || 'tools/ui/out';
const PORT = Number(process.env.CDP_PORT || 9377);
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 造两个测试局：一个在探索（地图），一个在战斗 ───────────────────
async function post(url, body) {
  const res = await fetch(APP + url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {})
  });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
}

const CHARS = ['gpt', 'claude', 'mistral', 'deepseek'];

async function makeExploreSession() {
  const r = await post('/api/new', { characterIds: CHARS, seed: Number(process.env.SEED || 4242) });
  if (!r.ok) throw new Error('建局失败: ' + JSON.stringify(r.data));
  return r.data.sessionId;
}

async function makeCombatSession() {
  // 和 smoke/aoe-prepare 同样的思路：一路走到第一个可打的节点
  const r = await post('/api/new', { characterIds: CHARS, seed: Number(process.env.SEED || 4242) });
  if (!r.ok) throw new Error('建局失败: ' + JSON.stringify(r.data));
  const sid = r.data.sessionId;
  let g = r.data;
  const act = async (a) => {
    const x = await post('/api/action', { sessionId: sid, action: a });
    if (x.ok) g = x.data;
    return x;
  };
  for (let guard = 0; guard < 60; guard++) {
    if (g.phase === 'combat') return sid;
    const p = g.players.find((x) => x.id === g.activePlayerId);
    if (!p) break;
    const here = g.nodes.find((n) => n.id === p.nodeId);
    if (here && !here.cleared && ['combat', 'skirmish', 'elite', 'keyElite'].includes(here.type)) {
      await act({ type: 'interact', playerId: p.id, nodeId: here.id });
      if (g.phase === 'combat') return sid;
    }
    // 找相邻未访问节点，优先战斗类
    const nb = (here?.neighbors || []).map((id) => g.nodes.find((n) => n.id === id)).filter(Boolean);
    const want = nb.find((n) => ['combat', 'skirmish', 'elite', 'keyElite'].includes(n.type) && !n.cleared)
      || nb.find((n) => !n.cleared && n.type !== 'trap')
      || nb[0];
    if (!want) break;
    const mv = await act({ type: 'move', playerId: p.id, nodeId: want.id });
    if (!mv.ok) await act({ type: 'endTurn', playerId: p.id });
  }
  return sid;
}

const exploreSid = await makeExploreSession();
const combatSid = await makeCombatSession();
console.log('explore session:', exploreSid);
console.log('combat session:', combatSid);

// ── 浏览器 ────────────────────────────────────────────────────────
const browser = spawn(process.env.EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(os.tmpdir(), 'agi-ui-' + Date.now())}`,
  '--no-first-run', '--disable-gpu', '--hide-scrollbars',
  '--force-device-scale-factor=1',
  `--window-size=${process.env.W || 1600},${process.env.H || 1000}`,
  'about:blank'
], { stdio: 'ignore' });

let wsUrl = null;
for (let i = 0; i < 140 && !wsUrl; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    wsUrl = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)?.webSocketDebuggerUrl;
  } catch { /* 还没起来 */ }
  if (!wsUrl) await sleep(150);
}
if (!wsUrl) throw new Error('连不上浏览器调试端口');
const ws = await new Promise((res, rej) => { const s = new WebSocket(wsUrl); s.onopen = () => res(s); s.onerror = rej; });
let seq = 0; const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id); pending.delete(m.id);
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
  }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params }));
});
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { error: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
  return r.result?.value;
};
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
  console.log('  shot', name);
};

const W = Number(process.env.W || 1600), H = Number(process.env.H || 1000);
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.enable');
await send('Page.navigate', { url: APP_URL });
await sleep(1200);
// 等 meta 加载完（标题页立绘墙、最近行动都依赖它），别截到半成品
for (let i = 0; i < 60; i++) {
  const ready = await ev(`/ONLINE|OFFLINE/.test(document.querySelector('#server-status')?.textContent || '')`);
  if (ready) break;
  await sleep(120);
}
await sleep(900);

// 1) 标题页
await shot('01-title');

// 2) 选人页（点「接入协议」）
await ev(`document.querySelector('#btn-start')?.click()`);
await sleep(900);
await shot('02-select');

// 3) 选满 4 人
for (let i = 0; i < 4; i++) {
  await ev(`document.querySelectorAll('#character-grid .char-card:not(.selected)')[${0}]?.click()`);
  await sleep(220);
}
await sleep(500);
await shot('03-select-picked');

// 4) 地图（探索局）
await ev(`localStorage.setItem('agi2046.sessionId', ${JSON.stringify(exploreSid)}); location.reload();`);
await sleep(2600);
await ev(`document.querySelector('#btn-resume')?.click()`);
await sleep(2400);
await ev(`document.querySelector('[data-act="story-continue"]')?.click()`);
await sleep(700);
await shot('04-map');

// 4.5) 图例弹出层
await ev(`document.querySelector('.legend-pop summary')?.click()`);
await sleep(450);
await shot('04b-map-legend');
await ev(`document.querySelector('.legend-pop summary')?.click()`);
await sleep(250);

// 5) 背包
await ev(`document.querySelector('#btn-inventory')?.click()`);
await sleep(800);
await shot('05-inventory');
await ev(`document.querySelector('[data-act="modal-close"]')?.click()`);
await sleep(500);

// 6) 战斗
await ev(`localStorage.setItem('agi2046.sessionId', ${JSON.stringify(combatSid)}); location.reload();`);
await sleep(2600);
await ev(`document.querySelector('#btn-resume')?.click()`);
await sleep(2600);
await ev(`document.querySelector('[data-act="story-continue"]')?.click()`);
await sleep(800);
await shot('06-combat');

// 7) 选中一个技能（看伤害预览状态）
await ev(`(() => {
  const c = document.querySelector('.skill-card:not(.disabled):not([data-skill-id="basic"])')
         || document.querySelector('.skill-card:not(.disabled)');
  c?.click();
})()`);
await sleep(700);
await shot('07-combat-skill');

// 8) 道具弹窗
await ev(`document.querySelector('#btn-item')?.click()`);
await sleep(800);
await shot('08-combat-items');
await ev(`document.querySelector('[data-act="modal-close"]')?.click()`);
await sleep(400);

// 9) 结算/事件类弹窗：直接开操作说明，代表"信息型弹窗"的排版
await ev(`document.querySelector('#btn-help')?.click()`);
await sleep(700);
await shot('09-help');

console.log('\n完成。输出目录：', path.resolve(OUT));
await send('Browser.close').catch(() => {});
spawn('taskkill', ['/F', '/T', '/PID', String(browser.pid)], { stdio: 'ignore' });
