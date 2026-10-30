// 0.21 挑战选择 + 终局复盘/评级（真实浏览器）
// 用法：node tools/ui/challenge-flow.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = process.env.APP || 'http://127.0.0.1:5178';
const OUT = process.env.OUT || 'tools/ui/challenge';
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —  ' + detail : ''}`);
};

const PORT = Number(process.env.CDP_PORT || 9405);
const browser = spawn('C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(os.tmpdir(), 'agi-ch-' + Date.now())}`,
  '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--window-size=1440,900', 'about:blank'
], { stdio: 'ignore' });
let wsUrl = null;
for (let i = 0; i < 120 && !wsUrl; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    wsUrl = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl)?.webSocketDebuggerUrl;
  } catch { /* 还没起来 */ }
  if (!wsUrl) await sleep(150);
}
const ws = await new Promise((res, rej) => { const s = new WebSocket(wsUrl); s.onopen = () => res(s); s.onerror = rej; });
let id = 0; const pending = new Map(); const errs = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails?.exception?.description || 'err');
};
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async x => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
  return r.exceptionDetails ? ('ERR ' + (r.exceptionDetails.exception?.description || '')) : r.result?.value;
};
const shot = async n => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, n + '.png'), Buffer.from(r.data, 'base64'));
};
const visible = async sel => ev(`(()=>{const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return false; const s=getComputedStyle(el); return !el.classList.contains('hidden') && s.display!=='none';})()`);
const text = async sel => ev(`(document.querySelector(${JSON.stringify(sel)})?.textContent || '').trim()`);
const click = async sel => ev(`(()=>{const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return 'missing'; el.click(); return 'ok';})()`);

await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: APP + '?bot=1' });
await sleep(2400);

/* ── 1. 挑战选择 ─────────────────────────────────────────── */
ok('标题页有挑战入口', await visible('#btn-challenge'), await text('#challenge-badge'));
await click('#btn-challenge');
await sleep(700);
ok('挑战弹层打开', await visible('.ch-grid'));
ok('变异卡片 16 条', (await ev(`document.querySelectorAll('.mut-card').length`)) === 16,
  String(await ev(`document.querySelectorAll('.mut-card').length`)));
ok('每条都写风险/奖励/策略',
  (await ev(`document.querySelectorAll('.mc-line.risk').length`)) === 16 &&
  (await ev(`document.querySelectorAll('.mc-line.reward').length`)) === 16);
ok('默认不是零变异', (await text('.ch-summary')).includes('已选 0 条'), await text('.ch-summary'));
await shot('01-challenge-modal');

// 选一条变异
await ev(`(()=>{const c=[...document.querySelectorAll('.mut-card')].find(x=>x.textContent.includes('追踪加速')); c?.click(); return 1})()`);
await sleep(500);
ok('选变异后汇总更新', (await text('.ch-summary')).includes('已选 1 条'), await text('.ch-summary'));
ok('倍率随变异提高', /×1\.[2-9]/.test(await text('.ch-summary')), await text('.ch-summary'));
await shot('02-challenge-selected');

/* ── 2. 选队伍并开局 ─────────────────────────────────────── */
await click('[data-act="challenge-start"]');
await sleep(700);
ok('进入选人且按钮写着挑战', (await text('#btn-create')).includes('挑战'), await text('#btn-create'));
await ev(`(()=>{const cards=[...document.querySelectorAll('.char-card')]; cards[0]?.click(); cards[1]?.click(); return 1})()`);
await sleep(400);
await click('#btn-create');
await sleep(2400);
ok('挑战局已开始', await visible('#goal-strip'), await text('#goal-main'));
ok('局内显示挑战倍率', (await text('.gs-kicker')).includes('CHALLENGE'), await text('.gs-kicker'));
await shot('03-challenge-game');

/* ── 3. 打开目标面板，确认变异列在里面 ─────────────────── */
await click('.gs-main');
await sleep(600);
ok('目标面板列出本局变异', (await text('.goal-mutators')).includes('追踪加速'), await text('.goal-mutators'));
await click('[data-act="modal-close"]');
await sleep(300);

/* ── 4. 把追踪耗光 → 复盘 ───────────────────────────────── */
{
  const finished = await ev(`(async()=>{
    let rev = window.__agi.state()?.revision ?? 0;
    let sid = window.__agi.state()?.sessionId;
    for (let i=0;i<220;i++){
      const g = window.__agi.state();
      if (!g || g.phase==='defeat') break;
      const p = g.players.find(x=>x.id===g.activePlayerId) || g.players[0];
      const r = await fetch('/api/action',{method:'POST',headers:{'content-type':'application/json'},
        body: JSON.stringify({sessionId:sid,action:{type:'endTurn',playerId:p.id},expectedRevision:rev})});
      if (!r.ok) break;
      rev++;
    }
    // 拉一次最新状态，让页面自己进入终局
    await window.__agi.refresh();
    return window.__agi.state()?.phase;
  })()`);
  ok('追踪耗尽后判负', finished === 'defeat', String(finished));
}
await sleep(1200);
for (let i = 0; i < 3; i++) {
  const b = await click('[data-act="story-continue"]');
  if (b !== 'ok') break;
  await sleep(500);
}
ok('终局显示评级', await visible('.end-grade'), await text('.eg-head'));
ok('终局显示复盘', await visible('.end-review'), await text('.er-row'));
ok('复盘有下局建议', (await text('.er-suggest')).length > 8, await text('.er-suggest'));
ok('复盘有最高伤害/撤退数据', (await text('.er-grid')).includes('撤退'), await text('.er-grid'));
const box = await ev(`(()=>{const m=document.querySelector('#modal-root .modal'); const b=m?.querySelector('.modal-body'); if(!m) return null; const r=m.getBoundingClientRect(); return {top:Math.round(r.top),bottom:Math.round(r.bottom),h:Math.round(r.height),vh:innerHeight,scroll:b?.scrollHeight,client:b?.clientHeight};})()`);
ok('终局弹窗不超出视口', !!box && box.top >= 0 && box.bottom <= box.vh + 1, JSON.stringify(box));
ok('长复盘可在弹窗内滚动', !!box && box.scroll > box.client, JSON.stringify(box));
await shot('04-failure-review');

ok('控制台无异常', errs.length === 0, JSON.stringify(errs.slice(0, 3)));

const failed = results.filter(r => !r.pass);
console.log(`\n===== ${results.length - failed.length}/${results.length} 通过 =====`);
await send('Browser.close').catch(() => {});
spawn('taskkill', ['/F', '/T', '/PID', String(browser.pid)], { stdio: 'ignore' });
if (failed.length) {
  console.log('失败项：');
  for (const f of failed) console.log(' -', f.name, f.detail);
  process.exit(1);
}
