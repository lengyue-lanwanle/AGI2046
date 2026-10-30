// 分段演出验证：一次多段判定应该跳多个伤害数字，骰子逐颗揭示
//   先 node tools/smoke/aoe-prepare.mjs，再跑这个
import { spawn } from 'node:child_process';
import { killBrowser } from './kill-browser.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = process.env.APP_URL || 'http://localhost:5178';
const APP_URL = APP + (APP.includes('?') ? '&' : '?') + 'bot=1';   // 自动化跳过 VN 剧情
const PORT = Number(process.env.CDP_PORT || 9251);
const OUT = path.resolve('tools/e2e/out');
const SID_FILE = path.resolve('tools/smoke/.aoe-sid');
const SID = process.env.SID || (fs.existsSync(SID_FILE) ? fs.readFileSync(SID_FILE, 'utf8').trim() : '');
if (!SID) { console.error('缺少 sessionId'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —  ' + detail : ''}`);
};

const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
];
const browserPath = BROWSERS.find(p => fs.existsSync(p));
const profileDir = path.join(os.tmpdir(), `agi-seg-${Date.now()}`);
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
const shot = async name => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
};

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `${APP}/?v=102` });
await sleep(1800);
await ev(`localStorage.setItem('agi2046.sessionId', ${JSON.stringify(SID)}); 1`);
await send('Page.reload');
await sleep(2500);
await ev(`document.querySelector('#btn-resume')?.click(); 1`);
await sleep(2600);
for (let i = 0; i < 4; i++) {
  const st = await ev(`(() => { const b = document.querySelector('[data-act="story-continue"]'); if (b) { b.click(); return 1; } return 0; })()`);
  if (!st) break;
  await sleep(900);
}
await sleep(1200);

// 记录骰子面板的揭示过程
await ev(`window.__diceFrames = []; window.__diceWatch = setInterval(() => {
  const cells = [...document.querySelectorAll('#dice-layer .die[data-reveal]')];
  if (!cells.length) return;
  window.__diceFrames.push(cells.map(c => c.classList.contains('pending') ? 'pending' : c.textContent).join(','));
}, 60); 1`);

// 群体技有射程，先靠过去（和 aoe-ui 一样）
const apiState = async () => (await fetch(`${APP}/api/state?sessionId=${SID}`)).json();
const hexDist = (c1, r1, c2, r2) => {
  const x1 = c1 - (r1 - (r1 & 1)) / 2, z1 = r1, y1 = -x1 - z1;
  const x2 = c2 - (r2 - (r2 & 1)) / 2, z2 = r2, y2 = -x2 - z2;
  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2), Math.abs(z1 - z2));
};
const nearestEnemy = st => {
  const act = st.combat.units.find(u => u.id === st.combat.activeUnitId);
  let best = null;
  let bestD = 99;
  for (const u of st.combat.units) {
    if (u.side !== 'enemy' || u.downed) continue;
    const d = hexDist(act.col, act.row, u.col, u.row);
    if (d < bestD) { bestD = d; best = u; }
  }
  return best;
};

let inRange = false;
for (let step = 0; step < 10 && !inRange; step++) {
  const st = await apiState();
  if (!st.combat) break;
  const act = st.combat.units.find(u => u.id === st.combat.activeUnitId);
  if (!act || act.side !== 'player') { await sleep(2200); continue; }
  const foe = nearestEnemy(st);
  // 敌人已经全部倒下（但结算还没回来）时不必再靠近，等一轮就行
  if (!foe) { await sleep(1800); continue; }
  const dist = hexDist(act.col, act.row, foe.col, foe.row);
  if (dist <= 5) { inRange = true; break; }
  const reach = (st.combat.reachable || []).filter(h =>
    !st.combat.units.some(u => !u.downed && u.col === h.col && u.row === h.row));
  if (!reach.length) { await sleep(2200); continue; }
  reach.sort((a, b) => hexDist(a.col, a.row, foe.col, foe.row) - hexDist(b.col, b.row, foe.col, foe.row));
  await ev(`window.dispatchEvent(new CustomEvent('battle3d-pick', { detail: { kind: 'hex', col: ${reach[0].col}, row: ${reach[0].row} } })); 1`);
  await sleep(1600);
  await sleep(1800);
}
ok('进入群体技射程', inRange, '');
await sleep(600);

const pick = await ev(`(() => {
  for (const id of ['mistral_u', 'mistral_2', 'basic']) {
    const c = document.querySelector('.skill-card[data-skill-id="' + id + '"]');
    if (c && !c.classList.contains('disabled')) return id;
  }
  return null;
})()`);
ok('找到可施放技能', !!pick, String(pick));
await shot('40-before.png');

if (pick) {
  await ev(`document.querySelector('.skill-card[data-skill-id="${pick}"]')?.click(); 1`);
  // 连续抓几帧，看飘字是不是一段一段出现
  await sleep(320); await shot('41-hit-1.png');
  await sleep(150); await shot('42-hit-2.png');
  await sleep(150); await shot('43-hit-3.png');
  await sleep(900); await shot('44-dice.png');
}

// 群体技：骰子面板必须说明「每个目标各掷一次」，否则玩家会以为一次骰子打全场
const group = await ev(`(() => {
  const g = document.querySelector('.dice-group');
  if (!g) return null;
  return { rows: g.querySelectorAll('.dg-row').length, head: (g.querySelector('.dg-head')?.textContent || '').trim() };
})()`);
ok('群体技显示每目标结算', !!group && group.rows >= 2, JSON.stringify(group));
ok('群体面板写明独立掷骰', !!group && /独立掷/.test(group.head || ''), group?.head || '');
await shot('44b-dice-group.png');

const frames = await ev(`JSON.stringify((window.__diceFrames || []).slice(0, 14))`);
let diceFrames = [];
try { diceFrames = JSON.parse(frames || '[]'); } catch { /* 忽略 */ }
console.log('骰子揭示帧:', JSON.stringify(diceFrames));
const allPendingFirst = diceFrames[0] && /pending/.test(diceFrames[0]);
const settledLast = diceFrames[diceFrames.length - 1] && !/pending/.test(diceFrames[diceFrames.length - 1]);
ok('骰子先全部占位再定格', allPendingFirst === true, diceFrames[0]);
ok('骰子最终全部揭示', settledLast === true, diceFrames[diceFrames.length - 1]);
ok('揭示过程有中间态（逐颗）', diceFrames.length >= 3, `${diceFrames.length} 帧`);

const la = await ev(`(() => {
  const g = window.__lastState || null; return JSON.stringify(!!g);
})()`);
void la;
ok('无运行时异常', errors.length === 0, errors.slice(0, 2).join(' | '));

await ev(`clearInterval(window.__diceWatch); 1`);
await killBrowser(browser, profileDir, send);
try { ws.close(); } catch { /* 已断开 */ }
const pass = results.filter(r => r.pass).length;
console.log(`\n===== ${pass}/${results.length} 通过 =====`);
process.exit(pass === results.length ? 0 : 1);
