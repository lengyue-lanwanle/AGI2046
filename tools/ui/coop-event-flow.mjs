// 0.22 多人事件（投票）界面流程：选项 / 投票人 / 倒计时 / 结算态
// 用法：node tools/ui/coop-event-flow.mjs [--mobile]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = process.env.APP || 'http://127.0.0.1:5178';
const MOBILE = process.argv.includes('--mobile');
const OUT = process.env.OUT || path.join('tools/ui/coop', MOBILE ? 'mobile' : 'desktop');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const results = [];
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —  ' + detail : ''}`);
};

const PORT = Number(process.env.CDP_PORT || (MOBILE ? 9386 : 9385));
const width = MOBILE ? 390 : 1440;
const height = MOBILE ? 844 : 900;
const browser = spawn('C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(os.tmpdir(), 'agi-coop-' + Date.now())}`,
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

/* 1. 开局（两人队，这样投票栏有两票） */
{
  await ev(`document.querySelector('#btn-start')?.click(); 1`);
  await sleep(900);
  await ev(`(()=>{const cards=[...document.querySelectorAll('.char-card')]; cards[0]?.click(); cards[1]?.click(); return 1})()`);
  await sleep(400);
  await ev(`document.querySelector('#btn-create')?.click(); 1`);
  await sleep(2600);
  for (let i = 0; i < 4; i++) {
    const r = await ev(`(()=>{const b=document.querySelector('[data-act="story-continue"]'); if(!b) return 0; b.click(); return 1})()`);
    if (!r) break;
    await sleep(400);
  }
  ok('进入对局', (await count('.map-node')) > 10, String(await count('.map-node')));
}

/* 2. 注入一个「进行中」的多人事件并渲染 */
{
  await ev(`window.__agi.preview({ phase:'coop', coop:{
      title:'两只终端，一个窗口',
      text:'两条线路同时报警。你们只有一次授权窗口。',
      options:[
        { id:'split', label:'两边都开', desc:'收益平摊，电子追踪 +1。', effect:'memory:50;purge:-1' },
        { id:'focus', label:'只开一条', desc:'拿满收益，但另一条会锁死。', effect:'memory:120' }
      ],
      votes:{}, resolved:false, deadlineAt: Date.now()+60000, chosenId:null, result:null, timedOut:false
    }})`);
  await sleep(200);
  await ev(`window.__agi.openCoop()`);
  await sleep(500);

  ok('弹层打开', (await count('.coop-options')) === 1, String(await count('.coop-options')));
  ok('两个选项都在', (await count('.coop-opt')) === 2, String(await count('.coop-opt')));
  // 投票人按钮数 = 选项数 × 队伍人数（1–4 人都成立）
  const players = await ev(`window.__agi.state()?.players?.length || 0`);
  const voters = await count('.coop-opt .co-voter');
  ok('每个选项都有投票人按钮', Number(voters) === 2 * Number(players),
    `${voters} 个 / ${players} 人`);
  ok('有倒计时', /剩余\s*\d+\s*秒/.test(await text('.coop-timer')), await text('.coop-timer'));
  ok('选项写明效果', (await text('.co-effect')).includes('记忆币'), await text('.co-effect'));
  await shot('01-coop-open');
}

/* 3. 结算态：显示票数与结果 */
{
  await ev(`window.__agi.preview({ phase:'coop', coop:{
      title:'两只终端，一个窗口',
      text:'两条线路同时报警。你们只有一次授权窗口。',
      options:[
        { id:'split', label:'两边都开', desc:'收益平摊。', effect:'memory:50;purge:-1' },
        { id:'focus', label:'只开一条', desc:'拿满收益。', effect:'memory:120' }
      ],
      votes:{ p1:'split', p2:'split' }, resolved:true, chosenId:'split',
      result:'记忆币 +50、电子追踪 +1。', timedOut:false, deadlineAt: Date.now()+60000
    }})`);
  await sleep(200);
  await ev(`window.__agi.openCoop()`);
  await sleep(500);
  ok('结算后显示结果', (await count('.coop-result')) === 1, String(await count('.coop-result')));
  ok('结算后没有投票按钮', (await count('.co-voter')) === 0, String(await count('.co-voter')));
  ok('结果里有收益文案', (await text('.coop-result')).includes('记忆币'), await text('.coop-result'));
  ok('选中的选项被高亮', (await count('.coop-opt.chosen')) === 1, String(await count('.coop-opt.chosen')));
  await shot('02-coop-resolved');
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  await sleep(250);
}

/* 4. 超时态：安全默认选项 */
{
  await ev(`window.__agi.preview({ phase:'coop', coop:{
      title:'分摊风险', text:'谁先上？', options:[
        { id:'a', label:'一起上', desc:'风险平摊。', effect:'hp:-2' },
        { id:'b', label:'分开走', desc:'各走各的。', effect:'memory:40' }
      ],
      votes:{}, resolved:true, chosenId:'b', result:'按安全选项结算。', timedOut:true,
      deadlineAt: Date.now()-1000
    }})`);
  await sleep(200);
  await ev(`window.__agi.openCoop()`);
  await sleep(500);
  ok('超时有明确标注', (await text('.coop-result')).includes('超时'), await text('.coop-result'));
  await shot('03-coop-timeout');
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  await sleep(200);
}

/* 5. 小屏不溢出 */
{
  const vp = await ev(`({w:innerWidth, sw:document.documentElement.scrollWidth})`);
  ok('页面无横向溢出', vp.sw <= vp.w + 1, JSON.stringify(vp));
}

ok('控制台无异常', errs.length === 0, JSON.stringify(errs.slice(0, 3)));

const pass = results.filter(r => r.pass).length;
console.log(`\n===== ${pass}/${results.length} passed =====`);
await send('Browser.close').catch(() => { });
spawn('taskkill', ['/F', '/T', '/PID', String(browser.pid)], { stdio: 'ignore' });
process.exit(pass === results.length ? 0 : 1);
