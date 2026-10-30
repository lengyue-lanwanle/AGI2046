// 战场背景 + NIKKE 字效巡检：截图 + 真实流程断言。
// 用法：node tools/ui/fx-shots.mjs [输出目录]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = process.env.APP || 'http://127.0.0.1:5178';
const APP_URL = APP + (APP.includes('?') ? '&' : '?') + 'bot=1';   // 自动化跳过 VN 剧情
const OUT = process.argv[2] || 'tools/ui/fx';
const PORT = Number(process.env.CDP_PORT || 9387);
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function post(url, body) {
  const res = await fetch(APP + url, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {})
  });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

async function makeCombatSession() {
  let g = (await post('/api/new', { characterIds: ['gpt', 'claude', 'mistral', 'deepseek'], seed: 4242 })).data;
  const sid = g.sessionId;
  const act = async (a) => {
    const r = await post('/api/action', { sessionId: sid, action: a });
    if (r.ok) g = r.data;
    return r;
  };
  for (let guard = 0; guard < 60; guard++) {
    if (g.phase === 'combat') return sid;
    const p = g.players.find(x => x.id === g.activePlayerId);
    if (!p) break;
    const here = g.nodes.find(n => n.id === p.nodeId);
    if (here && !here.cleared && ['combat', 'skirmish', 'elite', 'keyElite'].includes(here.type)) {
      await act({ type: 'interact', playerId: p.id, nodeId: here.id });
      if (g.phase === 'combat') return sid;
    }
    const nb = (here?.neighbors || []).map(id => g.nodes.find(n => n.id === id)).filter(Boolean);
    const want = nb.find(n => ['combat', 'skirmish', 'elite', 'keyElite'].includes(n.type) && !n.cleared)
      || nb.find(n => !n.cleared && n.type !== 'trap') || nb[0];
    if (!want) break;
    const mv = await act({ type: 'move', playerId: p.id, nodeId: want.id });
    if (!mv.ok) await act({ type: 'endTurn', playerId: p.id });
  }
  return sid;
}

const sid = await makeCombatSession();
const browser = spawn(process.env.EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(os.tmpdir(), 'agi-fx-' + Date.now())}`,
  '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
  '--window-size=1600,1000', 'about:blank'
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

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
await send('Page.navigate', { url: APP_URL });
await sleep(1800);
await ev(`localStorage.setItem('agi2046.sessionId', ${JSON.stringify(sid)}); 1`);
await send('Page.reload');
await sleep(2500);
await ev(`document.querySelector('#btn-resume')?.click(); 1`);
await sleep(2200);
for (let i = 0; i < 3; i++) {
  const x = await ev(`(()=>{const b=document.querySelector('[data-act="story-continue"]'); if(b){b.click();return 1} return 0})()`);
  if (!x) break;
  await sleep(700);
}
await sleep(800);

await shot('01-combat-backdrop');

// 换精英背景，检查边缘/比例
await ev(`window.Battle3D?.setBackdrop('assets/battle/bg/neon-elite.webp'); 1`);
await sleep(700);
await shot('02-elite-backdrop');

// DANGER
await ev(`window.Fx?.hazard({ level: 'elite', sub: '精英单位 · 镜面守卫' }); 1`);
await sleep(330);
await shot('03-danger');

// MISSION COMPLETE
await sleep(1200);
await ev(`window.Fx?.victory({ rank: 'S', title: '精英信号清除', rewards: ['记忆 120', '合金 4', 'ROUND 3'] }); 1`);
await sleep(520);
await shot('04-victory');

// PHASE II
await sleep(1700);
await ev(`window.Fx?.phase(2, { title: '协议覆写', sub: '镜面执政官' }); 1`);
await sleep(360);
await shot('04b-phase');

// FULL BURST
await sleep(1200);
await ev(`window.Fx?.burst({ name: '破晓终焉', portrait: 'assets/portraits/gpt1.webp', color: '#8affc1' }); 1`);
await sleep(320);
await shot('04c-burst');

// 帮助弹窗里的特效开关
await sleep(1000);
await ev(`document.querySelector('#btn-help')?.click(); 1`);
await sleep(500);
await shot('04d-help-fx');
await ev(`document.querySelector('[data-act="modal-close"]')?.click(); 1`);
await sleep(300);

// 手机
await sleep(500);
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await sleep(500);
await ev(`window.Fx?.hazard({ level: 'elite', sub: '精英单位 · 镜面守卫' }); 1`);
await sleep(330);
await shot('05-danger-mobile');
await sleep(1200);
await ev(`window.Fx?.victory({ rank: 'A', title: '精英信号清除', rewards: ['记忆 120', '合金 4', 'ROUND 5'] }); 1`);
await sleep(520);
await shot('06-victory-mobile');

// 断言：字效层存在、可关闭、最终清空
const hasLayer = await ev(`!!document.getElementById('fx-layer')`);
const ptr = await ev(`getComputedStyle(document.getElementById('fx-layer')).pointerEvents`);
const off = await ev(`(()=>{Fx.setMode('off'); const n=Fx.hazard({level:'elite'}); Fx.setMode('full'); return n===null})()`);
await sleep(1800);
const cleared = await ev(`document.querySelectorAll('#fx-layer .fx').length`);
const ok = (n, c, d = '') => console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? '  —  ' + d : ''}`);
ok('字效层已挂载', hasLayer);
ok('字效层不拦截点击', ptr === 'none', ptr);
ok('关闭后不再生成', off);
ok('播放结束自动清空', cleared === 0, String(cleared));
ok('控制台无异常', errors.length === 0, JSON.stringify(errors));

await send('Browser.close').catch(() => {});
spawn('taskkill', ['/F', '/T', '/PID', String(browser.pid)], { stdio: 'ignore' });
console.log('输出目录：', path.resolve(OUT));
