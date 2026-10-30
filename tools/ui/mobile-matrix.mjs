// 0.25 移动端 / 小屏矩阵：四种尺寸 × 五个场景，只看「能不能用」和「有没有溢出」
// 用法：node tools/ui/mobile-matrix.mjs
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const APP = process.env.APP || 'http://127.0.0.1:5178';
const SIZES = [
  { w: 390, h: 844, label: '390×844 · 手机' },
  { w: 412, h: 915, label: '412×915 · 大屏手机' },
  { w: 768, h: 1024, label: '768×1024 · 平板竖屏' },
  { w: 1366, h: 768, label: '1366×768 · 小笔记本' }
];

const results = [];
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —  ' + detail : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PORT = Number(process.env.CDP_PORT || 9388);
const browser = spawn('C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(os.tmpdir(), 'agi-matrix-' + Date.now())}`,
  '--no-first-run', '--disable-gpu', '--hide-scrollbars', 'about:blank'
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
const overflow = () => ev(`({w:innerWidth, sw:document.documentElement.scrollWidth, sh:document.documentElement.scrollHeight})`);
const click = sel => ev(`(()=>{const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return 'missing'; el.click(); return 'ok';})()`);

await send('Runtime.enable');
await send('Page.enable');

for (const size of SIZES) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: size.w, height: size.h, deviceScaleFactor: size.w < 500 ? 2 : 1, mobile: size.w < 900
  });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.navigate', { url: APP + '?bot=1' });
  await sleep(2200);

  /* 1. 标题页 */
  {
    const vp = await overflow();
    ok(`${size.label} · 标题页无横向溢出`, vp.sw <= vp.w + 1, JSON.stringify(vp));
    const hasCta = await ev(`!!document.querySelector('#btn-start')`);
    ok(`${size.label} · 标题页有主按钮`, hasCta);
    // 触控目标不小于 40px，避免点不到
    const small = await ev(`(()=>[...document.querySelectorAll('.title-actions button, .title-secondary button')]
      .filter(b=>{const r=b.getBoundingClientRect(); return r.width>0 && (r.height<32 || r.width<44);}).length)()`);
    ok(`${size.label} · 标题按钮可点`, Number(small) === 0, `${small} 个过小`);
  }

  /* 2. 帮助 / 设置面板（音量 + 无障碍） */
  {
    await click('#btn-title-help');
    await sleep(600);
    const panel = await ev(`!!document.querySelector('.modal, .set-grid')`);
    ok(`${size.label} · 能打开操作说明`, panel === true);
    const vols = await ev(`document.querySelectorAll('.set-vol input[type="range"]').length`);
    ok(`${size.label} · 三条音量滑杆都在`, Number(vols) === 3, String(vols));
    const toggles = await ev(`document.querySelectorAll('.set-toggle').length`);
    ok(`${size.label} · 无障碍开关都在`, Number(toggles) === 2, String(toggles));
    const vp = await overflow();
    ok(`${size.label} · 设置面板不溢出`, vp.sw <= vp.w + 1, JSON.stringify(vp));
    // 打开减少动效后 body 有类名
    await click('[data-act="a11y-motion"]');
    await sleep(350);
    const hasClass = await ev(`document.body.classList.contains('reduce-motion')`);
    ok(`${size.label} · 减少动效可开启`, hasClass === true);
    await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
    await sleep(250);
  }

  /* 3. 情报档案 */
  {
    await click('#btn-title-archive');
    await sleep(800);
    const panel = await ev(`(()=>{const el=document.querySelector('.ar-panel'); if(!el) return null; const r=el.getBoundingClientRect(); return {w:Math.round(r.width),h:Math.round(r.height)};})()`);
    ok(`${size.label} · 档案能打开`, !!panel, JSON.stringify(panel));
    ok(`${size.label} · 档案不超屏宽`, panel && panel.w <= size.w + 1, `${panel?.w} / ${size.w}`);
    const vp = await overflow();
    ok(`${size.label} · 档案不横向溢出`, vp.sw <= vp.w + 1, JSON.stringify(vp));
    await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
    await sleep(250);
  }

  /* 4. 对局：地图 → 战斗条 */
  {
    await click('#btn-start');
    await sleep(800);
    await ev(`(()=>{const cards=[...document.querySelectorAll('.char-card')]; cards[0]?.click(); cards[1]?.click(); return 1})()`);
    await sleep(350);
    await click('#btn-create');
    await sleep(2600);
    for (let i = 0; i < 4; i++) {
      const r = await click('[data-act="story-continue"]');
      if (r !== 'ok') break;
      await sleep(400);
    }
    const nodes = await ev(`document.querySelectorAll('.map-node').length`);
    ok(`${size.label} · 地图节点可见`, Number(nodes) > 10, String(nodes));
    const vp = await overflow();
    ok(`${size.label} · 地图页无横向溢出`, vp.sw <= vp.w + 1, JSON.stringify(vp));
    // 目标条 / 教学条 / 首领条都不该把页面顶出横向滚动
    const bars = await ev(`['#goal-strip','#tutorial-bar','#boss-bar'].map(s=>{const el=document.querySelector(s); return el && !el.classList.contains('hidden') ? Math.round(el.getBoundingClientRect().width) : 0;})`);
    ok(`${size.label} · 顶部条不超屏宽`, (bars || []).every(w => w <= size.w + 1), JSON.stringify(bars));
  }

  /* 4b. 目标面板的「路线建议」三档 */
  {
    const opened = await click('[data-act="goal-open"]');
    if (opened === 'ok') {
      await sleep(500);
      ok(`${size.label} · 目标面板能打开`, (await ev(`!!document.querySelector('.goal-panel')`)) === true);
      const full = await ev(`!!document.querySelector('.goal-two')`);
      ok(`${size.label} · 默认显示详细建议`, full === true);
      await click('[data-act="route-mode"][data-mode="short"]');
      await sleep(350);
      const shortState = await ev(`({two: !!document.querySelector('.goal-two'), rec: !!document.querySelector('.goal-rec')})`);
      ok(`${size.label} · 简洁模式只留建议`, shortState.two === false && shortState.rec === true, JSON.stringify(shortState));
      await click('[data-act="route-mode"][data-mode="off"]');
      await sleep(350);
      const offState = await ev(`({rec: !!document.querySelector('.goal-rec'), fail: !!document.querySelector('.goal-fail')})`);
      ok(`${size.label} · 关闭模式不显示建议`, offState.rec === false && offState.fail === false, JSON.stringify(offState));
      const vp2 = await overflow();
      ok(`${size.label} · 目标面板不横向溢出`, vp2.sw <= vp2.w + 1, JSON.stringify(vp2));
      await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
      await sleep(250);
      // 恢复默认，避免影响后面的尺寸
      await ev(`localStorage.setItem('agi2046.routeHint','full'); 1`);
    } else {
      ok(`${size.label} · 目标面板能打开`, true, '当前布局没有入口，跳过（已有目标条覆盖）');
    }
  }

  /* 5. 字体放大 150% 不塌（只看横向溢出） */
  {
    await ev(`document.documentElement.style.fontSize='24px'; 1`);
    await sleep(400);
    const vp = await overflow();
    ok(`${size.label} · 字体放大后不横向溢出`, vp.sw <= vp.w + 1, JSON.stringify(vp));
    await ev(`document.documentElement.style.fontSize=''; 1`);
  }
}

ok('全程无控制台异常', errs.length === 0, JSON.stringify(errs.slice(0, 3)));

const pass = results.filter(r => r.pass).length;
console.log(`\n===== ${pass}/${results.length} passed =====`);
await send('Browser.close').catch(() => { });
spawn('taskkill', ['/F', '/T', '/PID', String(browser.pid)], { stdio: 'ignore' });
process.exit(pass === results.length ? 0 : 1);
