// 真实流程：从探索点进战斗，验证 DANGER/ENGAGE 与战场背景真的挂上。
// 用法：node tools/ui/flow-check.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = process.env.APP || 'http://127.0.0.1:5178';
const APP_URL = APP + (APP.includes('?') ? '&' : '?') + 'bot=1';   // 自动化跳过 VN 剧情
const OUT = process.argv[2] || 'tools/ui/fx';
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const post = async (p, b) => {
  const r = await fetch(APP + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b ?? {}) });
  return { ok: r.ok, data: await r.json().catch(() => ({})) };
};

// 找一个相邻有战斗节点的探索局
let g = (await post('/api/new', { characterIds: ['gpt', 'claude', 'mistral', 'deepseek'], seed: 9017 })).data;
const sid = g.sessionId;
const act = async a => { const r = await post('/api/action', { sessionId: sid, action: a }); if (r.ok) g = r.data; return r; };
let target = null;
for (let guard = 0; guard < 40; guard++) {
  const p = g.players.find(x => x.id === g.activePlayerId);
  if (!p) break;
  const here = g.nodes.find(n => n.id === p.nodeId);
  const nb = (here?.neighbors || []).map(id => g.nodes.find(n => n.id === id)).filter(Boolean);
  const fight = nb.find(n => ['combat', 'skirmish', 'elite'].includes(n.type) && !n.cleared);
  if (fight) { target = fight; break; }
  const want = nb.find(n => !n.cleared && n.type !== 'trap') || nb[0];
  if (!want) break;
  await act({ type: 'move', playerId: p.id, nodeId: want.id });
}
if (!target) { console.error('找不到相邻战斗节点'); process.exit(1); }
console.log('target', target.id, target.type, target.district);

const PORT = Number(process.env.CDP_PORT || 9389);
const browser = spawn('C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(os.tmpdir(), 'agi-flow-' + Date.now())}`,
  '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--window-size=1440,900', 'about:blank'
], { stdio: 'ignore' });
let wsUrl = null;
for (let i = 0; i < 120 && !wsUrl; i++) {
  try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); wsUrl = l.find(t => t.type === 'page' && t.webSocketDebuggerUrl)?.webSocketDebuggerUrl; } catch {}
  if (!wsUrl) await sleep(150);
}
const ws = await new Promise((res, rej) => { const s = new WebSocket(wsUrl); s.onopen = () => res(s); s.onerror = rej; });
let id = 0; const pend = new Map(); const errs = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
  else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails?.exception?.description || 'err');
};
const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); return r.exceptionDetails ? ('ERR ' + (r.exceptionDetails.exception?.description || '')) : r.result?.value; };
const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, n + '.png'), Buffer.from(r.data, 'base64')); };
const ok = (n, c, d = '') => console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? '  —  ' + d : ''}`);

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
await send('Page.navigate', { url: APP_URL }); await sleep(2000);
await ev(`localStorage.setItem('agi2046.sessionId', ${JSON.stringify(sid)}); 1`);
await send('Page.reload'); await sleep(2400);
await ev(`document.querySelector('#btn-resume')?.click(); 1`); await sleep(2200);
for (let i = 0; i < 4; i++) { const x = await ev(`(()=>{const b=document.querySelector('[data-act="story-continue"]'); if(b){b.click();return 1} return 0})()`); if (!x) break; await sleep(700); }
await sleep(600);

await ev(`window.__fxLog = []; new MutationObserver(ms => {
  for (const m of ms) for (const n of m.addedNodes) {
    if (n.nodeType === 1 && n.classList && n.classList.contains('fx')) window.__fxLog.push(n.className);
  }
}).observe(document.getElementById('fx-layer'), { childList: true }); 1`);

// 第一次点 = 移动；第二次点 = 就地交互进战斗
await ev(`document.querySelector('[data-node-id="${target.id}"]')?.click()`);
await sleep(1500);
await ev(`document.querySelector('[data-node-id="${target.id}"]')?.click()`);
await sleep(450);
await shot('07-real-encounter');
const log = await ev(`window.__fxLog || []`);
const dbg = await ev(`window.Battle3D?._debug?.()`);
ok('真实进战斗触发了字效', Array.isArray(log) && log.some(c => /fx-hazard/.test(c)), JSON.stringify(log));
ok('战场背景已加载', !!dbg?.hasBackdrop, JSON.stringify(dbg));
ok('背景 URL 是当前节点', !!dbg?.backdrop, dbg?.backdrop);
ok('控制台无异常', errs.length === 0, JSON.stringify(errs));
console.log('输出目录：', path.resolve(OUT));
await send('Browser.close').catch(() => {});
spawn('taskkill', ['/F', '/T', '/PID', String(browser.pid)], { stdio: 'ignore' });
