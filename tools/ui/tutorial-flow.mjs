// 0.20.0 教学 / 目标条 / 术语的真实浏览器流程
// 用法：node tools/ui/tutorial-flow.mjs            （桌面 1440×900）
//       node tools/ui/tutorial-flow.mjs --mobile   （390×844）
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = process.env.APP || 'http://127.0.0.1:5178';
const MOBILE = process.argv.includes('--mobile');
const OUT = process.env.OUT || path.join('tools/ui/tutorial', MOBILE ? 'mobile' : 'desktop');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const results = [];
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —  ' + detail : ''}`);
};

const PORT = Number(process.env.CDP_PORT || (MOBILE ? 9397 : 9396));
const width = MOBILE ? 390 : 1440;
const height = MOBILE ? 844 : 900;
const browser = spawn('C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(os.tmpdir(), 'agi-tut-' + Date.now())}`,
  '--no-first-run', '--disable-gpu', '--hide-scrollbars', `--window-size=${width},${height}`, 'about:blank'
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
const click = async sel => ev(`(()=>{const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return 'missing'; el.click(); return 'ok';})()`);
const text = async sel => ev(`(document.querySelector(${JSON.stringify(sel)})?.textContent || '').trim()`);
const visible = async sel => ev(`(()=>{const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return false; const s=getComputedStyle(el); return !el.classList.contains('hidden') && s.display!=='none' && s.visibility!=='hidden';})()`);
const overflow = async () => ev(`({w:innerWidth, sw:document.documentElement.scrollWidth})`);

await send('Runtime.enable');
await send('Page.enable');
if (MOBILE) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
}
await send('Page.navigate', { url: APP + '?bot=1' });
await sleep(2400);

/* ── 1. 标题页入口 ──────────────────────────────────────────── */
ok('标题页有教学入口', await visible('#btn-tutorial'), await text('#tutorial-badge'));
await shot('01-title');

/* ── 2. 教学第一步 ──────────────────────────────────────────── */
await click('#btn-tutorial');
await sleep(1400);
ok('教学条出现', await visible('#tutorial-bar'));
ok('第一步讲清目标', (await text('#tutorial-title')).length > 4, await text('#tutorial-title'));
ok('步骤计数正确', /教学\s*1\s*\/\s*9/.test(await text('#tutorial-count')), await text('#tutorial-count'));
ok('教学里不显示目标条', !(await visible('#goal-strip')));
ok('教学有跳过入口', await visible('#btn-tutorial-skip'));
let vp = await overflow();
ok('教学首屏无横向溢出', vp.sw <= vp.w + 1, JSON.stringify(vp));
await shot('02-tutorial-intro');

/* ── 3. 下一步：移动到训练靶机 ──────────────────────────────── */
await click('#btn-tutorial-next');
await sleep(900);
ok('进入移动步骤', (await text('#tutorial-step')).includes('移动'), await text('#tutorial-step'));
ok('地图高亮相邻节点', (await ev(`document.body.dataset.tut`)) === 'node', await ev(`document.body.dataset.tut`));
const adjCount = await ev(`document.querySelectorAll('.map-node.adjacent').length`);
ok('至少一个可走节点', adjCount > 0, String(adjCount));
await shot('03-tutorial-move');

await click('.map-node.adjacent');
await sleep(1000);
await click('.map-node.current');
await sleep(1500);
ok('进入教学战斗', await visible('#combat-wrap'), await text('#combat-title'));
ok('战斗步骤切到普通攻击', (await text('#tutorial-step')).includes('普通攻击'), await text('#tutorial-step'));
ok('普通攻击被高亮', (await ev(`document.body.dataset.tut`)) === 'basic', await ev(`document.body.dataset.tut`));
ok('教学只有 1 个敌人', (await ev(`document.querySelectorAll('.turn-token.enemy').length`)) === 1,
  String(await ev(`document.querySelectorAll('.turn-token.enemy').length`)));
await shot('04-tutorial-combat');

/* ── 4. 跳过 → 完成卡 → 标准模式 ────────────────────────────── */
await click('#btn-tutorial-skip');
await sleep(900);
const doneVisible = await visible('.tut-done-card');
ok('跳过教学给出完成卡', doneVisible, await text('.tut-done-card b'));
await shot('05-tutorial-done');
await click('[data-act="tutorial-finish"]');
await sleep(1200);
ok('进入标准模式选人', await visible('#select-screen'), await text('#select-screen .select-title h2'));
await shot('06-select');

/* ── 5. 术语表 ─────────────────────────────────────────────── */
await click('#btn-select-back');
await sleep(700);
await click('#btn-title-glossary');
await sleep(600);
const cards = await ev(`document.querySelectorAll('.gloss-card').length`);
ok('术语表可打开', cards >= 15, `${cards} 条`);
await shot('07-glossary-all');
await ev(`document.querySelector('.gloss-card')?.click(); 1`);
await sleep(500);
ok('点术语出解释', (await text('.gloss-detail')).length > 20, (await text('.gloss-short')).slice(0, 24));
await shot('08-glossary-term');
await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); 1`);
await sleep(400);
ok('ESC 关闭术语卡', (await ev(`document.querySelectorAll('.glossary-overlay').length`)) === 0);

/* ── 6. 标准局目标条 ───────────────────────────────────────── */
await click('#btn-start');
await sleep(800);
await click('[data-act="select-char"]');
await sleep(400);
await click('#btn-create');
await sleep(2200);
ok('标准局显示目标条', await visible('#goal-strip'), await text('#goal-main'));
ok('目标条有当前目标', (await text('#goal-current')).length > 4, await text('#goal-current'));
ok('目标条可点开完整面板', await click('.gs-main') === 'ok');
await sleep(600);
ok('目标面板打开', await visible('.goal-panel'), await text('.goal-main h2'));
await shot('09-goal-modal');
await ev(`document.querySelector('[data-act="modal-close"]')?.click(); 1`);
await sleep(400);
vp = await overflow();
ok('目标条无横向溢出', vp.sw <= vp.w + 1, JSON.stringify(vp));
await shot('10-goal-strip');

/* ── 7. 游戏内术语一键可查 ─────────────────────────────────── */
{
  await ev(`document.querySelector('.ac-stat .term')?.click(); 1`);
  await sleep(500);
  ok('游戏内术语点开即解释', await visible('.gloss-detail'), (await text('.gloss-short')).slice(0, 20));
  await shot('11-inline-term');
  await ev(`document.querySelector('.glossary-overlay .va-close')?.click(); 1`);
  await sleep(300);
}

/* ── 8. 首局解释的触发条件与渲染 ───────────────────────────── */
{
  // 教学局会把内存里的 explainSeen 填满，先刷新一次回到干净的标题页
  await send('Page.reload');
  await sleep(2200);
  const fake = {
    firstRun: true, mode: 'standard', phase: 'exploration', activePlayerId: 'p1',
    players: [{ id: 'p1', nodeId: 'n1' }], quests: [],
    nodes: [
      { id: 'n1', type: 'start', neighbors: ['n2'], cleared: true },
      { id: 'n2', type: 'server', revealed: true, cleared: false }
    ]
  };
  ok('首局靠近服务器才会解释', (await ev(`window.__agi.explainKey(${JSON.stringify(fake)})`)) === 'server');
  const notFirst = { ...fake, firstRun: false };
  ok('非首局不解释', (await ev(`window.__agi.explainKey(${JSON.stringify(notFirst)})`)) === null);
  await ev(`window.__agi.openExplain('server'); 1`);
  await sleep(500);
  ok('解释卡可打开且带术语入口', (await text('.modal-head h3')).includes('废弃服务器') ||
    (await text('.modal-head h3')).includes('服务器'), await text('.modal-head h3'));
  await shot('12-explain');
  await ev(`document.querySelector('.modal-foot [data-act="modal-close"]')?.click(); 1`);
  await sleep(300);
}

ok('控制台无异常', errs.length === 0, JSON.stringify(errs.slice(0, 3)));

const failed = results.filter(r => !r.pass);
console.log(`\n===== ${results.length - failed.length}/${results.length} 通过（${MOBILE ? '390×844' : '1440×900'}） =====`);
await send('Browser.close').catch(() => {});
spawn('taskkill', ['/F', '/T', '/PID', String(browser.pid)], { stdio: 'ignore' });
if (failed.length) {
  console.log('失败项：');
  for (const f of failed) console.log(' -', f.name, f.detail);
  process.exit(1);
}
