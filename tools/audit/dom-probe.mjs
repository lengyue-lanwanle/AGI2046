// 打开当前对局，检查战斗 DOM 是否可点（unit-token / hex-cell / skill-card），并截图
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = 'http://127.0.0.1:5178';
const SID = process.argv[2];
const OUT = 'C:/Users/Mayn/WorkBuddy/2026-10-25-18-18-20/audit/shots';
fs.mkdirSync(OUT, { recursive: true });
const PORT = 9333;
const browser = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(os.tmpdir(), 'agi-audit-' + Date.now())}`,
  '--no-first-run', '--disable-gpu', '--window-size=1440,960', 'about:blank'
], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let wsUrl = null;
for (let i = 0; i < 100 && !wsUrl; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    wsUrl = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl)?.webSocketDebuggerUrl;
  } catch { }
  if (!wsUrl) await sleep(150);
}
const ws = await new Promise((res, rej) => { const s = new WebSocket(wsUrl); s.onopen = () => res(s); s.onerror = rej; });
let seq = 0; const pending = new Map();
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
};
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { error: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
  return { value: r.result?.value };
};

await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.enable');
await send('Page.navigate', { url: APP });
await sleep(1200);
await ev(`localStorage.setItem('agi2046.sessionId', ${JSON.stringify(SID)}); location.reload();`);
await sleep(2500);
// 标题页 → 继续行动
console.log('resume click:', JSON.stringify(await ev(`(()=>{const b=document.querySelector('#btn-resume'); if(!b) return 'no-btn'; b.click(); return b.textContent.trim();})()`)));
await sleep(2500);

const info = await ev(`(() => {
  const q = s => document.querySelectorAll(s).length;
  const vis = s => Array.from(document.querySelectorAll(s)).filter(e => e.offsetParent !== null).length;
  return {
    phase: window.__last?.phase || document.querySelector('#combat-panel') ? 'combat-ui' : '?',
    unitTokens: q('.unit-token'),
    targetable: q('.unit-token.targetable-unit'),
    hexCells: q('.hex-cell'),
    reachable: q('.hex-cell.reachable'),
    skillCards: q('.skill-card'),
    enabledSkillCards: q('.skill-card:not(.disabled)'),
    basic: q('#btn-basic'),
    endCombat: q('#btn-end-combat'),
    canvas: q('canvas'),
    combatPanelVisible: vis('#combat-panel'),
    bodyClass: document.body.className,
    msg: document.querySelector('#log-body')?.innerText?.slice(0, 120) || '',
    title: document.title
  };
})()`);
console.log('DOM:', JSON.stringify(info.value ?? info.error, null, 1));

const shot = async name => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
};
await shot('live-combat.png');
console.log('截图:', path.join(OUT, 'live-combat.png'));
await send('Browser.close').catch(() => { });
spawn('taskkill', ['/F', '/T', '/PID', String(browser.pid)], { stdio: 'ignore' });
