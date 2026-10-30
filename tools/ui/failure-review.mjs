// 0.21 失败复盘界面：评级 / 原因 / 最后动作 / 建议 / 解锁
// 用法：node tools/ui/failure-review.mjs [--mobile]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = process.env.APP || 'http://127.0.0.1:5178';
const MOBILE = process.argv.includes('--mobile');
const OUT = process.env.OUT || path.join('tools/ui/review', MOBILE ? 'mobile' : 'desktop');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const results = [];
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —  ' + detail : ''}`);
};

/* 1. 浏览器里开一局挑战（追踪加速），一路结束回合直到输 */
const post = async (p, body) => {
  const r = await fetch(APP + p, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {})
  });
  return { ok: r.ok, data: await r.json().catch(() => ({})) };
};

const PORT = Number(process.env.CDP_PORT || (MOBILE ? 9384 : 9383));
const width = MOBILE ? 390 : 1440;
const height = MOBILE ? 844 : 900;
const browser = spawn('C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(os.tmpdir(), 'agi-review-' + Date.now())}`,
  '--no-first-run', '--disable-gpu', '--hide-scrollbars', `--window-size=${width},${height}`, 'about:blank'
], { stdio: 'ignore' });

let wsUrl = null;
for (let i = 0; i < 120 && !wsUrl; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    wsUrl = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl)?.webSocketDebuggerUrl;
  } catch { }
  if (!wsUrl) await sleep(150);
}
const ws = await new Promise((res, rej) => { const s = new WebSocket(wsUrl); s.onopen = () => res(s); s.onerror = rej; });
let id = 0;
const pending = new Map();
const errs = [];
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
const shot = async name => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
};
const text = sel => ev(`(document.querySelector(${JSON.stringify(sel)})?.textContent || '').trim()`);
const count = sel => ev(`document.querySelectorAll(${JSON.stringify(sel)}).length`);

await send('Runtime.enable');
await send('Page.enable');
if (MOBILE) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
}
await send('Page.navigate', { url: APP + '?bot=1' });
await sleep(2400);

/* 2. 开挑战局（走界面，保证页面持有会话） */
{
  await ev(`document.querySelector('#btn-challenge')?.click(); 1`);
  await sleep(700);
  // 勾「追踪加速」，再确认
  await ev(`(()=>{const c=[...document.querySelectorAll('.mut-card')].find(x=>x.textContent.includes('追踪加速')); c?.click(); return 1})()`);
  await sleep(250);
  await ev(`document.querySelector('[data-act="challenge-start"]')?.click(); 1`);
  await sleep(900);
  await ev(`(()=>{const cards=[...document.querySelectorAll('.char-card')]; cards[0]?.click(); cards[1]?.click(); return 1})()`);
  await sleep(400);
  await ev(`document.querySelector('#btn-create')?.click(); 1`);
  await sleep(2800);
  for (let i = 0; i < 4; i++) {
    const r = await ev(`(()=>{const b=document.querySelector('[data-act="story-continue"]'); if(!b) return 0; b.click(); return 1})()`);
    if (!r) break;
    await sleep(400);
  }
  ok('进入挑战局', (await count('.map-node')) > 10, String(await count('.map-node')));
}

/* 2b. 页面内推进到失败（不重载，沿用同一会话） */
{
  const phase = await ev(`(async()=>{
    for (let i=0;i<240;i++){
      const g = window.__agi.state();
      if (!g) return 'no-state';
      if (g.phase === 'defeat' || g.phase === 'victory') return g.phase;
      const p = g.players.find(x=>x.id===g.activePlayerId) || g.players[0];
      const r = await fetch('/api/action',{method:'POST',headers:{'content-type':'application/json'},
        body: JSON.stringify({sessionId:g.sessionId,action:{type:'endTurn',playerId:p.id},expectedRevision:g.revision})});
      if (!r.ok) return 'http:'+r.status;
      const next = await r.json();
      // 把服务端状态塞回页面，保持 revision 前进
      window.__agi.adopt(next);
    }
    return 'timeout';
  })()`);
  ok('推进到终局', phase === 'defeat' || phase === 'victory', String(phase));
  await ev(`window.__agi.refresh(false)`);
  await sleep(900);
  for (let i = 0; i < 3; i++) {
    const r = await ev(`(()=>{const b=document.querySelector('[data-act="story-continue"]'); if(!b) return 0; b.click(); return 1})()`);
    if (!r) break;
    await sleep(400);
  }
}

/* 3. 终局弹层 */
{
  ok('终局弹层出现', (await count('.end-panel')) === 1, String(await count('.end-panel')));
  ok('标题写失败', (await text('.end-panel h2')).includes('信号'), await text('.end-panel h2'));

  const grade = await text('.eg-head b');
  ok('显示评级', ['S', 'A', 'B', 'C'].includes(grade), grade);
  ok('评级有维度条', (await count('.eg-dim')) >= 2, String(await count('.eg-dim')));

  const review = await text('.end-review');
  ok('复盘写了原因', review.includes('电子追踪') || review.includes('归零'), review.slice(0, 40));
  ok('复盘有最后动作', (await count('.er-row')) >= 2, String(await count('.er-row')));
  ok('复盘有建议', (await count('.er-suggest')) === 1, String(await count('.er-suggest')));
  ok('复盘不泄露路径', !/C:\\\\|data[\\/\\\\]sessions|Bearer/i.test(review), review.slice(0, 40));
  await shot('01-failure-review');
}

/* 4. 布局与操作 */
{
  const vp = await ev(`({w:innerWidth, sw:document.documentElement.scrollWidth})`);
  ok('复盘页无横向溢出', vp.sw <= vp.w + 1, JSON.stringify(vp));
  const actions = await count('.modal-foot [data-act="play-again"], .modal-foot [data-act="to-title"]');
  ok('有再来一局 / 回标题', actions === 2, String(actions));
  // 内容可以长，但弹层本身必须在视口内，且正文自己滚动（按钮永远可见）
  const box = await ev(`(()=>{const el=document.querySelector('.modal'); if(!el) return null;
    const r=el.getBoundingClientRect(); const body=document.querySelector('.modal-body');
    return {h:Math.round(r.height), vh:innerHeight, scrollable: !!body && body.scrollHeight > body.clientHeight};})()`);
  ok('弹层不超出视口', box && box.h <= box.vh, JSON.stringify(box));
  ok('长内容在正文里滚动', box && box.scrollable === true, JSON.stringify(box));
}

ok('控制台无异常', errs.length === 0, JSON.stringify(errs.slice(0, 3)));

const pass = results.filter(r => r.pass).length;
console.log(`\n===== ${pass}/${results.length} passed =====`);
await send('Browser.close').catch(() => { });
spawn('taskkill', ['/F', '/T', '/PID', String(browser.pid)], { stdio: 'ignore' });
process.exit(pass === results.length ? 0 : 1);
