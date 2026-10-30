// 0.23「有记忆」：情报档案 + 事件后果 + 关系 的真实浏览器流程
// 用法：node tools/ui/archive-flow.mjs            （桌面 1440×900）
//       node tools/ui/archive-flow.mjs --mobile   （390×844）
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = process.env.APP || 'http://127.0.0.1:5178';
const MOBILE = process.argv.includes('--mobile');
const OUT = process.env.OUT || path.join('tools/ui/archive', MOBILE ? 'mobile' : 'desktop');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const results = [];
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —  ' + detail : ''}`);
};

const PORT = Number(process.env.CDP_PORT || (MOBILE ? 9399 : 9398));
const width = MOBILE ? 390 : 1440;
const height = MOBILE ? 844 : 900;
const browser = spawn('C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(os.tmpdir(), 'agi-arc-' + Date.now())}`,
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
const count = async sel => ev(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
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
{
  const has = await count('#btn-title-archive');
  ok('标题页有情报档案入口', has === 1, String(has));
  await click('#btn-title-archive');
  await sleep(600);
  ok('档案能打开', (await count('.ar-panel')) === 1, String(await count('.ar-panel')));
  ok('默认在世界观分区', (await text('.ar-tab.on')) .includes('世界观'), await text('.ar-tab.on'));
  ok('时间线有内容', (await count('.ar-tl-row')) >= 3, String(await count('.ar-tl-row')));
  await shot('01-archive-timeline');
}

/* ── 2. 分区切换：9 个分区都能打开且不空 ─────────────────────── */
{
  const tabs = await ev(`[...document.querySelectorAll('.ar-tab')].map(b=>b.dataset.archiveTab)`);
  ok('分区数量 = 9', Array.isArray(tabs) && tabs.length === 9, JSON.stringify(tabs));
  for (const t of (tabs || [])) {
    const r = await ev(`(()=>{const b=document.querySelector('[data-archive-tab="${t}"]'); if(!b) return 'missing'; b.click(); return 'ok';})()`);
    await sleep(180);
    const body = await text('.ar-body');
    ok(`分区「${t}」有内容`, r === 'ok' && body.length > 10, body.slice(0, 24));
  }
}

/* ── 3. 未发现内容必须是未知态，不泄露答案 ──────────────────── */
{
  await ev(`document.querySelector('[data-archive-tab="enemies"]').click()`);
  await sleep(250);
  const unknown = await count('.ar-card.unknown');
  const total = await count('.ar-card');
  ok('新玩家敌人图鉴全是未知', unknown === total && total > 0, `${unknown}/${total}`);
  const body = await text('.ar-body');
  ok('未知卡不写具体机制', !body.includes('召唤礼宾') && !body.includes('分摊'), body.slice(0, 40));

  await ev(`document.querySelector('[data-archive-tab="bosses"]').click()`);
  await sleep(200);
  const bossBody = await text('.ar-body');
  ok('未遭遇的首领不泄露机制', !bossBody.includes('三阶段') && !bossBody.includes('分摊给'), bossBody.slice(0, 40));
}

/* ── 4. 后果为空时有解释，而不是空白 ────────────────────────── */
{
  await ev(`document.querySelector('[data-archive-tab="marks"]').click()`);
  await sleep(200);
  ok('无后果时给解释', (await count('.ar-empty')) === 1, await text('.ar-body'));
  await ev(`document.querySelector('[data-archive-tab="bonds"]').click()`);
  await sleep(200);
  ok('无关系时给解释', (await count('.ar-empty')) === 1, await text('.ar-body'));
}

/* ── 5. 关闭与键盘 ──────────────────────────────────────────── */
{
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  await sleep(250);
  ok('ESC 能关闭档案', (await count('.ar-panel')) === 0, String(await count('.ar-panel')));
}

/* ── 6. 开局后：局内入口存在 ─────────────────────────────────── */
{
  await click('#btn-start');
  await sleep(900);
  await ev(`(()=>{const cards=[...document.querySelectorAll('.char-card')]; cards[0]?.click(); cards[1]?.click(); return 1})()`);
  await sleep(400);
  await click('#btn-create');
  await sleep(2800);
  ok('进入对局', (await count('.map-node')) > 0, String(await count('.map-node')));
  // 关掉开场剧情，否则截图会被剧情卡挡住
  for (let i = 0; i < 4; i++) {
    const r = await click('[data-act="story-continue"]');
    if (r !== 'ok') break;
    await sleep(400);
  }
  await sleep(300);
  const hasBtn = await count('#btn-archive');
  ok('局内有档案按钮', hasBtn === 1, String(hasBtn));
  const hidden = await ev(`document.querySelector('#consequence-box')?.classList.contains('hidden')`);
  ok('无后果时情报栏不占位', hidden === true, String(hidden));
}

/* ── 7. 有后果 / 有关系时的界面（只改本地副本） ──────────────── */
{
  await ev(`window.__agi.preview({consequences:[
      {id:'market_debt',title:'拍卖人的账单',desc:'本幕黑市价格 +15%',kind:'shop',expiresAct:2,source:'拍卖会',why:'你赊了账。'},
      {id:'trace_noise',title:'追踪噪音',desc:'本幕敌人命中 −5',kind:'enemy',expiresAct:2,source:'信号塔',why:'你放了假广播。'}
    ],relationships:[
      {a:'p1',b:'p2',points:6,level:2,note:'支援动作'}
    ]})`);
  await sleep(300);
  const rows = await count('.cons-row');
  ok('情报栏列出后果与关系', rows === 3, String(rows));
  const consText = await text('.consequence-list');
  ok('后果写明到期幕', consText.includes('第 2 幕'), consText.slice(0, 40));
  await shot('02-intel-consequences');

  await click('#btn-archive');
  await sleep(700);
  ok('局内能打开档案', (await count('.ar-panel')) === 1, String(await count('.ar-panel')));

  await ev(`document.querySelector('[data-archive-tab="marks"]').click()`);
  await sleep(250);
  const marks = await text('.ar-body');
  ok('后果面板显示原因', marks.includes('你赊了账') && marks.includes('拍卖会'), marks.slice(0, 50));

  await ev(`document.querySelector('[data-archive-tab="bonds"]').click()`);
  await sleep(250);
  const bonds = await text('.ar-body');
  ok('关系面板显示等级与效果', bonds.includes('Lv.2') && bonds.includes('命中'), bonds.slice(0, 50));
  await shot('03-archive-bonds');

  await ev(`document.querySelector('[data-archive-tab="run"]').click()`);
  await sleep(250);
  const runBody = await text('.ar-body');
  ok('本局分区有数据', runBody.includes('电子追踪') && runBody.includes('战斗'), runBody.slice(0, 40));
  await shot('04-archive-run');
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  await sleep(250);

  // 键盘 L 也能开
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'l',bubbles:true}))`);
  await sleep(500);
  ok('L 键打开档案', (await count('.ar-panel')) === 1, String(await count('.ar-panel')));
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  await sleep(200);
}

/* ── 8. 移动端不横向溢出 ───────────────────────────────────── */
{
  await click('#btn-archive');
  await sleep(600);
  const vp = await overflow();
  ok('档案无横向溢出', vp.sw <= vp.w + 1, JSON.stringify(vp));
  const panelW = await ev(`(()=>{const el=document.querySelector('.ar-panel'); if(!el) return 0; return Math.round(el.getBoundingClientRect().width);})()`);
  ok('档案面板不超屏宽', panelW <= vp.w + 1, `${panelW} / ${vp.w}`);
  await shot('05-archive-mobile');
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  await sleep(150);
}

ok('控制台无异常', errs.length === 0, JSON.stringify(errs.slice(0, 3)));

const pass = results.filter(r => r.pass).length;
console.log(`\n===== ${pass}/${results.length} passed =====`);
await send('Browser.close').catch(() => { });
spawn('taskkill', ['/F', '/T', '/PID', String(browser.pid)], { stdio: 'ignore' });
process.exit(pass === results.length ? 0 : 1);
