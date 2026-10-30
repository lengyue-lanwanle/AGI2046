// 战斗中重启后的 UI 恢复验证：真实浏览器续玩 → 战斗界面能否渲染并继续操作
// 用法：node tools/smoke/battle-ui.mjs  （先用 battle-resume.mjs prepare 造出战斗存档）
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = 'http://localhost:5178';
const APP_URL = APP + '?bot=1';
const PORT = Number(process.env.CDP_PORT || 9227);
const OUT = path.resolve('tools/e2e/out');
const SID_FILE = path.resolve('tools/smoke/.battle-sid');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —  ' + detail : ''}`);
};

const sid = fs.readFileSync(SID_FILE, 'utf8').trim();

const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
];
const browserPath = BROWSERS.find(p => fs.existsSync(p));
const profileDir = path.join(os.tmpdir(), `agi-battle-ui-${Date.now()}`);
const browser = spawn(browserPath, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1440,960', 'about:blank'
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let wsUrl = null;
for (let i = 0; i < 100 && !wsUrl; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    wsUrl = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl)?.webSocketDebuggerUrl;
  } catch { /* 等待 */ }
  if (!wsUrl) await sleep(120);
}

const ws = await new Promise((resolve, reject) => {
  const s = new WebSocket(wsUrl);
  s.onopen = () => resolve(s);
  s.onerror = e => reject(new Error('WS 失败: ' + e.message));
});
let msgSeq = 0;
const pending = new Map();
const consoleErrors = [];
ws.onmessage = ev => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    return;
  }
  if (msg.method === 'Runtime.exceptionThrown') consoleErrors.push(msg.params.exceptionDetails?.exception?.description || 'exception');
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error')
    consoleErrors.push((msg.params.args || []).map(a => a.value ?? a.description ?? '').join(' '));
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++msgSeq;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression, awaitPromise = false) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error('页面脚本异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const shot = async name => {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  console.log(`[shot] ${path.join(OUT, `${name}.png`)}`);
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: APP_URL });
for (let i = 0; i < 120; i++) {
  const ready = await evaluate(`document.readyState === 'complete' && !!document.querySelector('#btn-start')`).catch(() => false);
  if (ready) break;
  await sleep(120);
}
await evaluate(`localStorage.setItem('agi2046.sessionId', ${JSON.stringify(sid)})`);
await send('Page.reload');
await sleep(1400);
for (let i = 0; i < 60; i++) {
  const has = await evaluate(`!document.querySelector('#btn-resume').classList.contains('hidden')`).catch(() => false);
  if (has) break;
  await sleep(200);
}
ok('标题页可续玩（战斗存档）', await evaluate(`!document.querySelector('#btn-resume').classList.contains('hidden')`));
await evaluate(`document.querySelector('#btn-resume').click()`);
await sleep(900);
for (let i = 0; i < 6; i++) {
  const has = await evaluate(`!!document.querySelector('[data-act="story-continue"]')`).catch(() => false);
  if (!has) break;
  await evaluate(`document.querySelector('[data-act="story-continue"]').click()`);
  await sleep(500);
}

ok('战斗界面已渲染', await evaluate(`!document.querySelector('#combat-wrap').classList.contains('hidden')`));
const info = await evaluate(`({
  hexes: document.querySelectorAll('#hex-grid .hex-cell').length,
  skills: document.querySelectorAll('#skill-list [data-act="skill"]').length,
  units: document.querySelectorAll('#hex-grid [data-act="unit"]').length,
  reachable: document.querySelectorAll('#hex-grid .hex-cell.reachable').length,
  title: document.querySelector('#combat-title')?.textContent || '',
  hint: document.querySelector('#combat-hint')?.textContent || ''
})`);
ok('六边形战场渲染', info.hexes === 35, `${info.hexes} 格`);
ok('可移动格计算正常', info.reachable > 0, `${info.reachable} 格可达`);
ok('技能列表渲染', info.skills > 0, `${info.skills} 个`);
ok('单位棋子渲染', info.units > 0, `${info.units} 个`);
await shot('13-battle-resume');

// 尝试点一个技能并选中目标（不强制要求命中，只要不报错）
const clicked = await evaluate(`(() => {
  const b = document.querySelector('#skill-list [data-act="skill"]');
  if (!b) return false;
  b.click();
  return true;
})()`);
await sleep(400);
ok('点击技能不报错', clicked && consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
await shot('14-battle-skill-selected');

ok('控制台无报错', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

ws.close();
browser.kill();
await fetch(`${APP}/api/session/${sid}`, { method: 'DELETE' }).catch(() => {});
fs.unlinkSync(SID_FILE);
const passed = results.filter(r => r.pass).length;
console.log(`\n${passed}/${results.length} 通过`);
process.exit(passed === results.length ? 0 : 1);
