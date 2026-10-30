// 联机观战验证：p1 单独开战，p2 的界面只读、有观战标识，且能回放 p1 的动作
import { spawn } from 'node:child_process';
import { killBrowser } from './kill-browser.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const base = process.env.BASE || 'http://localhost:5178';
const PORT = Number(process.env.CDP_PORT || 9241);
const OUT = path.resolve('tools/e2e/out');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —  ' + detail : ''}`);
};
const post = async (p, b) => {
  const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
  let data = null;
  try { data = await r.json(); } catch { /* 204 */ }
  return { status: r.status, data };
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── 1. 造房间并让 p1 单独开战 ───────────────────────────────── */
const created = await post('/api/room/create', { hostName: '房主', seed: 4242 });
const code = created.data.code;
const t1 = created.data.token;
const joined = await post(`/api/room/${code}/join`, { name: '队友' });
const t2 = joined.data.token;
await post(`/api/room/${code}/character`, { token: t1, characterId: 'gpt' });
await post(`/api/room/${code}/character`, { token: t2, characterId: 'claude' });
const started = await post(`/api/room/${code}/start`, { token: t1 });
const sid = started.data.state.sessionId;
let g = started.data.state;

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

const target = g.nodes.find(n => (n.type === 'combat' || n.type === 'skirmish') && n.layer <= 3);
for (let i = 0; i < 60; i++) {
  const p = g.players.find(x => x.id === 'p1');
  if (p.nodeId === target.id) break;
  if (p.ap <= 0) { g = (await post('/api/action', { sessionId: sid, roomCode: code, token: t1, action: { type: 'endTurn', playerId: 'p1' } })).data; continue; }
  const step = pathTo(p.nodeId, target.id)[0];
  g = (await post('/api/action', { sessionId: sid, roomCode: code, token: t1, action: { type: 'move', playerId: 'p1', nodeId: step } })).data;
}
for (let i = 0; i < 12 && g.activePlayerId !== 'p1'; i++) {
  g = (await post('/api/action', { sessionId: sid, roomCode: code, token: g.activePlayerId === 'p1' ? t1 : t2, action: { type: 'endTurn', playerId: g.activePlayerId } })).data;
}
g = (await post('/api/action', { sessionId: sid, roomCode: code, token: t1, action: { type: 'interact', playerId: 'p1', nodeId: target.id } })).data;
ok('p1 单独开战', g.phase === 'combat', `phase=${g.phase} units=${g.combat?.units?.length}`);

/* ── 2. 以 p2 身份打开页面 ───────────────────────────────────── */
const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
];
const browserPath = BROWSERS.find(p => fs.existsSync(p));
const profileDir = path.join(os.tmpdir(), `agi-spectate-${Date.now()}`);
const browser = spawn(browserPath, ['--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profileDir}`, '--no-first-run', '--disable-gpu', '--window-size=1440,900', 'about:blank'],
  { stdio: 'ignore' });

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
await send('Page.navigate', { url: `${base}/?v=93` });
await sleep(1800);
await ev(`localStorage.setItem('agi2046.room', ${JSON.stringify(JSON.stringify({ code, token: t2, playerId: 'p2' }))}); 1`);
await send('Page.reload');
await sleep(3000);

for (let i = 0; i < 4; i++) {
  const st = await ev(`(() => { const b = document.querySelector('[data-act="story-continue"]'); if (b) { b.click(); return 'story'; } return 'none'; })()`);
  if (st.value === 'none') break;
  await sleep(900);
}
await sleep(2200);

// 监听观战端收到的回放事件
await ev(`window.__casts = []; window.__dice = []; window.__toasts = [];
  window.addEventListener('battle3d-cast', e => window.__casts.push(e.detail));
  window.addEventListener('battle3d-pick', e => window.__picks = (window.__picks || 0) + 1);
  1`);

const ui = await ev(`(() => ({
  combat: !!document.querySelector('.combat-wrap') && !document.querySelector('.combat-wrap').classList.contains('hidden'),
  spectating: document.querySelector('.combat-wrap')?.classList.contains('is-spectating'),
  badge: document.querySelector('#spectate-badge')?.classList.contains('hidden') === false,
  badgeText: document.querySelector('#spectate-badge')?.textContent?.trim() || '',
  hint: document.querySelector('#combat-hint')?.textContent?.trim() || '',
  cards: document.querySelectorAll('.skill-card').length,
  cardsDisabled: document.querySelectorAll('.skill-card.disabled').length,
  btnDisabled: ['#btn-basic', '#btn-end-combat'].map(s => document.querySelector(s)?.disabled),
  hasCanvas: !!document.querySelector('#battle3d') && getComputedStyle(document.querySelector('#battle3d')).display !== 'none'
}))()`);
console.log('观战端 UI:', JSON.stringify(ui, null, 1));

ok('p2 处于观战状态', ui?.spectating === true);
ok('显示观战徽标', ui?.badge === true, ui?.badgeText);
ok('提示改为观战文案', /观战/.test(ui?.hint || ''), ui?.hint);
ok('技能卡全部禁用', ui?.cards > 0 && ui?.cardsDisabled === ui?.cards, `${ui?.cardsDisabled}/${ui?.cards}`);
ok('操作按钮禁用', (ui?.btnDisabled || []).every(Boolean), JSON.stringify(ui?.btnDisabled));
ok('仍能看到 3D 战场', ui?.hasCanvas === true);

await shot('30-spectate-idle.png');

// 观战端点击战场不应发请求
const beforeRev = (await (await fetch(`${base}/api/room/${code}/state?token=${t2}`)).json()).state.revision;
await ev(`window.dispatchEvent(new CustomEvent('battle3d-pick', { detail: { kind: 'hex', col: 1, row: 0 } })); 1`);
await sleep(1200);
const afterRev = (await (await fetch(`${base}/api/room/${code}/state?token=${t2}`)).json()).state.revision;
ok('观战时点战场不会改动状态', beforeRev === afterRev, `rev ${beforeRev} → ${afterRev}`);

/* ── 3. p1 放一个技能，观战端应该回放 ───────────────────────── */
const act = await post('/api/action', {
  sessionId: sid, roomCode: code, token: t1,
  action: { type: 'combatAction', playerId: 'p1', skillId: 'gpt_2' }
});
ok('p1 施放群体增益', act.status === 200, act.status === 200 ? `rev=${act.data.revision}` : act.data?.error);
const la = (act.data?.combat?.lastActions || []).slice(-1)[0];
ok('服务端记录了动作轨迹', !!la && la.seq > 0, JSON.stringify(la)?.slice(0, 160));

await sleep(1200);
const dbgMid = await ev(`JSON.stringify({ d: window.Battle3D?._debug?.(), casts: (window.__casts||[]).length })`);
console.log('  观战端中途状态:', dbgMid);
await sleep(2600);   // 等轮询（1.5s）把状态推给观战端
const replay = await ev(`JSON.stringify({ casts: window.__casts, dice: !!document.querySelector('.dice-panel, .dice-overlay, #dice') })`);
let rp = {};
try { rp = JSON.parse(replay || '{}'); } catch { /* 忽略 */ }
ok('观战端收到了动作回放', (rp.casts || []).length > 0, JSON.stringify(rp.casts?.[0] || {}).slice(0, 160));
// 直接对施法者断言：gpt_2 是群体增益，lastActions 的最后一条不一定是它
ok('回放的施法者就是 p1 的单位', (rp.casts?.[0]?.casterId || '') === 'u_p1', `caster=${rp.casts?.[0]?.casterId}`);

await shot('31-spectate-replay.png');
ok('无运行时异常', errors.length === 0, errors.slice(0, 2).join(' | '));

await killBrowser(browser, profileDir, send);
try { ws.close(); } catch { /* 已断开 */ }
await post(`/api/room/${code}/leave`, { token: t2 });
await post(`/api/room/${code}/leave`, { token: t1 });

const pass = results.filter(r => r.pass).length;
console.log(`\n===== ${pass}/${results.length} 通过 =====`);
process.exit(pass === results.length ? 0 : 1);
