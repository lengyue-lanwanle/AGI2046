// 过场演出巡检：换屏 / 进战斗 / 换人 / 换轮 / 幕间，各截一帧。
// 用法：node tools/ui/cine-shots.mjs [输出目录]
// 除了看画面，还会挂一个 MutationObserver 记录真实流程里到底有没有触发过场。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = process.env.APP || 'http://127.0.0.1:5178';
const APP_URL = APP + (APP.includes('?') ? '&' : '?') + 'bot=1';   // 自动化跳过 VN 剧情
const OUT = process.argv[2] || 'tools/ui/cine';
const PORT = Number(process.env.CDP_PORT || 9381);
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(url, body) {
  const res = await fetch(APP + url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {})
  });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
}

// 造一局走到战斗的存档，同时把「进战斗前」的状态留给浏览器点击
async function makeCombatSession() {
  const r = await post('/api/new', { characterIds: ['gpt', 'claude', 'mistral', 'deepseek'], seed: 4242 });
  const sid = r.data.sessionId;
  let g = r.data;
  const act = async (a) => { const x = await post('/api/action', { sessionId: sid, action: a }); if (x.ok) g = x.data; return x; };
  for (let guard = 0; guard < 60; guard++) {
    if (g.phase === 'combat') return { sid, ready: true };
    const p = g.players.find(x => x.id === g.activePlayerId);
    if (!p) break;
    const here = g.nodes.find(n => n.id === p.nodeId);
    if (here && !here.cleared && ['combat', 'skirmish', 'elite', 'keyElite'].includes(here.type)) {
      await act({ type: 'interact', playerId: p.id, nodeId: here.id });
      if (g.phase === 'combat') return { sid, ready: true };
    }
    const nb = (here?.neighbors || []).map(id => g.nodes.find(n => n.id === id)).filter(Boolean);
    const want = nb.find(n => ['combat', 'skirmish', 'elite', 'keyElite'].includes(n.type) && !n.cleared)
      || nb.find(n => !n.cleared && n.type !== 'trap') || nb[0];
    if (!want) break;
    const mv = await act({ type: 'move', playerId: p.id, nodeId: want.id });
    if (!mv.ok) await act({ type: 'endTurn', playerId: p.id });
  }
  return { sid, ready: g.phase === 'combat' };
}

// 探索局：停在「相邻有战斗节点」的位置，留给浏览器真实点击
async function makeExploreSession() {
  const r = await post('/api/new', { characterIds: ['gpt', 'claude', 'mistral', 'deepseek'], seed: 9017 });
  let sid = r.data.sessionId;
  let g = r.data;
  const act = async (a) => { const x = await post('/api/action', { sessionId: sid, action: a }); if (x.ok) g = x.data; return x; };
  for (let guard = 0; guard < 40; guard++) {
    const p = g.players.find(x => x.id === g.activePlayerId);
    if (!p) break;
    const here = g.nodes.find(n => n.id === p.nodeId);
    const nb = (here?.neighbors || []).map(id => g.nodes.find(n => n.id === id)).filter(Boolean);
    const fight = nb.find(n => ['combat', 'skirmish'].includes(n.type) && !n.cleared);
    if (fight) return { sid, nodeId: fight.id };
    const want = nb.find(n => !n.cleared && n.type !== 'trap') || nb[0];
    if (!want) break;
    await act({ type: 'move', playerId: p.id, nodeId: want.id });
  }
  return { sid, nodeId: null };
}

const combat = await makeCombatSession();
const explore = await makeExploreSession();
console.log('combat session:', combat.sid, 'ready:', combat.ready, '| explore node:', explore.nodeId);

const browser = spawn(process.env.EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(os.tmpdir(), 'agi-cine-' + Date.now())}`,
  '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
  `--window-size=${process.env.W || 1600},${process.env.H || 1000}`, 'about:blank'
], { stdio: 'ignore' });

let wsUrl = null;
for (let i = 0; i < 140 && !wsUrl; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    wsUrl = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl)?.webSocketDebuggerUrl;
  } catch { /* 等浏览器 */ }
  if (!wsUrl) await sleep(150);
}
if (!wsUrl) throw new Error('连不上浏览器调试端口');
const ws = await new Promise((res, rej) => { const s = new WebSocket(wsUrl); s.onopen = () => res(s); s.onerror = rej; });
let seq = 0; const pending = new Map(); const errors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id); pending.delete(m.id);
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
  } else if (m.method === 'Runtime.exceptionThrown') {
    errors.push(m.params.exceptionDetails?.exception?.description || 'exception');
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
// 无头浏览器默认报 prefers-reduced-motion: reduce，会把所有演出按「无动画」跳过。
// 巡检时显式要求 no-preference，才能看到真实的动画首帧。
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: APP_URL });
await sleep(1800);
for (let i = 0; i < 60; i++) {
  const ready = await ev(`/ONLINE|OFFLINE/.test(document.querySelector('#server-status')?.textContent || '')`);
  if (ready) break;
  await sleep(120);
}
await sleep(800);
await shot('01-title');

// 直接触发各类过场，检查版式（不依赖随机地图）
await ev(`window.Cine.encounter({ boss: true, title: '拍卖人', subtitle: '第一幕 · 霓虹港 · 首领战 · 敌方 4 单位', art: 'assets/keyart/boss1.webp', enemies: ['拍卖人', '镜面守卫', '审计官', '引座员'] })`);
await sleep(800);
await shot('02-encounter-boss');
await sleep(2300);

await ev(`window.Cine.act({ index: 2, name: '镜海穹顶', art: 'assets/keyart/act2.webp', subtitle: '拍卖人倒在自己的拍卖台上。下一站是穹顶——那里每一面镜子都记得你的名字。' })`);
await sleep(1100);
await shot('03-act');
await sleep(2000);

// 弹窗打开时过场必须让位（否则横幅会压在幕间/结算卡上）
await ev(`window.Cine.combatTurn({ name: '白垩', side: 'player', mine: true }); document.querySelector('#btn-title-help')?.click(); 1`);
await sleep(450);
const modalCleared = await ev(`document.querySelectorAll('#cine-layer .cine').length`);
console.log(modalCleared === 0 ? 'PASS  弹窗打开时过场让位' : `FAIL  过场仍压在弹窗上（${modalCleared} 层）`);
await ev(`document.querySelector('[data-act="modal-close"]')?.click(); 1`);
await sleep(350);

await ev(`window.Cine.turn({ full: true, kicker: 'NEW ROUND', name: '白垩', portrait: 'assets/portraits/gpt1.webp', round: 4, ap: 3, subtitle: '行动中' })`);
await sleep(700);
await shot('04-turn-full');
await sleep(1200);

// 进战斗局，检查战斗里的换人 / 换轮
await ev(`localStorage.setItem('agi2046.sessionId', ${JSON.stringify(combat.sid)}); location.reload();`);
await sleep(2600);
await ev(`document.querySelector('#btn-resume')?.click()`);
await sleep(2400);
await ev(`document.querySelector('[data-act="story-continue"]')?.click()`);
await sleep(900);
await ev(`window.Cine.combatTurn({ name: '黑客幽灵', side: 'enemy', round: 2 })`);
await sleep(600);
await shot('05-combat-turn-enemy');
await sleep(1100);
await ev(`window.Cine.combatTurn({ name: '白垩', side: 'player', round: 2, mine: true })`);
await sleep(600);
await shot('06-combat-turn-mine');
await sleep(1100);
await ev(`window.Cine.round(3)`);
await sleep(350);
await shot('07-combat-round');

// 真实流程：探索局里点相邻战斗节点，看有没有真的触发「遭遇」过场
let realFlow = { ok: false, log: [] };
if (explore.sid) {
  await ev(`localStorage.setItem('agi2046.sessionId', ${JSON.stringify(explore.sid)}); location.reload();`);
  await sleep(2600);
  await ev(`document.querySelector('#btn-resume')?.click()`);
  await sleep(2400);
  await ev(`document.querySelector('[data-act="story-continue"]')?.click()`);
  await sleep(900);
  await ev(`window.__cineLog = []; window.__cineObs = new MutationObserver(ms => {
    for (const m of ms) for (const n of m.addedNodes) {
      if (n.nodeType === 1 && n.classList && n.classList.contains('cine')) window.__cineLog.push(n.className);
      if (n.nodeType === 1 && n.classList && n.classList.contains('fx')) window.__cineLog.push('fx ' + n.className);
    }
  });
  window.__cineObs.observe(document.getElementById('cine-layer'), { childList: true });
  window.__cineObs.observe(document.getElementById('fx-layer'), { childList: true });
  window.__screenLog = []; new MutationObserver(() => {
    window.__screenLog.push(document.querySelector('.screen.active')?.id);
  }).observe(document.getElementById('app'), { childList: true, subtree: true });`);
  if (explore.nodeId) {
    // 第一次点 = 移动过去；第二次点 = 就地交互，进入战斗
    await ev(`document.querySelector('[data-node-id="${explore.nodeId}"]')?.click()`);
    await sleep(1400);
    await ev(`document.querySelector('[data-node-id="${explore.nodeId}"]')?.click()`);
    await sleep(450);
    await shot('08-entering-combat');
    await sleep(1800);
    console.log('  map message:', await ev(`document.querySelector('#map-message')?.textContent`));
  }
  realFlow.log = await ev(`window.__cineLog || []`);
  realFlow.ok = Array.isArray(realFlow.log) && realFlow.log.some(c => /encounter|fx-hazard/.test(c));
}

console.log('\n真实流程触发的过场：', JSON.stringify(realFlow));
console.log('控制台异常：', JSON.stringify(errors));
console.log('输出目录：', path.resolve(OUT));
await send('Browser.close').catch(() => {});
spawn('taskkill', ['/F', '/T', '/PID', String(browser.pid)], { stdio: 'ignore' });
