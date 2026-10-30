// UI 度量：把关键元素的计算样式读出来，用数字说明"小/挤/低对比"到底有多严重
// 用法：node tools/ui/measure.mjs [sessionId]
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const APP = process.env.APP || 'http://127.0.0.1:5178';
const APP_URL = APP + (APP.includes('?') ? '&' : '?') + 'bot=1';   // 自动化跳过 VN 剧情
const SID = process.argv[2] || '';
const PORT = Number(process.env.CDP_PORT || 9378);
const W = Number(process.env.W || 1600), H = Number(process.env.H || 1000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(os.tmpdir(), 'agi-m-' + Date.now())}`,
  '--no-first-run', '--disable-gpu', '--hide-scrollbars', `--window-size=${W},${H}`, 'about:blank'
], { stdio: 'ignore' });
let wsUrl = null;
for (let i = 0; i < 140 && !wsUrl; i++) {
  try {
    const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    wsUrl = l.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)?.webSocketDebuggerUrl;
  } catch { }
  if (!wsUrl) await sleep(150);
}
const ws = await new Promise((res, rej) => { const s = new WebSocket(wsUrl); s.onopen = () => res(s); s.onerror = rej; });
let seq = 0; const pend = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
};
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (x) => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { __err: r.exceptionDetails.exception?.description };
  return r.result?.value;
};

await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.enable');
await send('Page.navigate', { url: APP_URL });
await sleep(2200);
if (SID) {
  await ev(`localStorage.setItem('agi2046.sessionId', ${JSON.stringify(SID)}); location.reload();`);
  await sleep(2400);
  await ev(`document.querySelector('#btn-resume')?.click()`);
  await sleep(2200);
  await ev(`document.querySelector('[data-act="story-continue"]')?.click()`);
  await sleep(600);
}

const report = await ev(`(() => {
  const rows = [];
  const seen = new Set();
  const push = (label, el) => {
    if (!el) { rows.push({ label, missing: true }); return; }
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    rows.push({
      label,
      sel: el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : el.tagName.toLowerCase(),
      font: parseFloat(cs.fontSize),
      line: Math.round(parseFloat(cs.lineHeight) || 0),
      weight: cs.fontWeight,
      color: cs.color,
      w: Math.round(r.width), h: Math.round(r.height),
      minH: cs.minHeight
    });
  };

  // 一个选择器取第一个可见元素
  const vis = (s) => Array.from(document.querySelectorAll(s)).find((e) => e.offsetParent !== null) || null;

  const targets = [
    ['topbar 阶段名', '#act-name'],
    ['topbar 资源数字', '.resource b'],
    ['topbar 资源标签', '.res-label'],
    ['队伍卡姓名', '.party-card .pc-name'],
    ['队伍卡小字', '.party-card .pc-sub'],
    ['地图图例', '.legend-node'],
    ['地图图例文字', '.map-legend span'],
    ['地图节点标题', '.map-node .mn-title'],
    ['地图节点类型', '.map-node .mn-type'],
    ['右侧目标正文', '#objective-text'],
    ['行动记录条目', '.log-list li'],
    ['技能卡名称', '.skill-card .sc-name'],
    ['技能卡描述', '.skill-card .sc-desc'],
    ['技能卡 meta', '.skill-card .sc-meta'],
    ['技能卡伤害行', '.skill-card .sc-dmg'],
    ['战斗动作按钮', '#btn-end-combat'],
    ['当前单位卡', '.active-unit-card'],
    ['战斗记录', '.combat-log li'],
    ['弹窗正文', '.modal-body p']
  ];
  for (const [label, sel] of targets) push(label, vis(sel));

  // 对比度：正文色 vs 面板底色
  const body = getComputedStyle(document.body);

  return {
    viewport: [innerWidth, innerHeight],
    dpr: devicePixelRatio,
    bodyFont: body.fontSize,
    rows,
    counts: {
      totalNodes: document.querySelectorAll('*').length,
      buttons: document.querySelectorAll('button').length,
      smallFontElements: Array.from(document.querySelectorAll('*')).filter((e) => {
        if (!e.offsetParent) return false;
        if (!e.textContent || !e.textContent.trim()) return false;
        const hasTextChild = Array.from(e.children).some((c) => c.textContent && c.textContent.trim());
        if (hasTextChild) return false;
        return parseFloat(getComputedStyle(e).fontSize) < 11;
      }).length
    }
  };
})()`);

console.log(JSON.stringify(report, null, 1));
await send('Browser.close').catch(() => {});
spawn('taskkill', ['/F', '/T', '/PID', String(browser.pid)], { stdio: 'ignore' });
