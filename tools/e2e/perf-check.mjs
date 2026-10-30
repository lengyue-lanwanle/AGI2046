// 首屏性能探针：新开无缓存浏览器 → 打开首页 → 输出耗时与按类型汇总的下载量
// 用法: node tools/e2e/perf-check.mjs [场景]
//   场景: title(默认) | select | battle
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = process.env.APP_URL || 'http://127.0.0.1:5178';
const SCENE = process.argv[2] || 'title';
const PORT = Number(process.env.CDP_PORT || 9251);
const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
];
const browserPath = BROWSERS.find(p => fs.existsSync(p));
if (!browserPath) throw new Error('找不到 Edge/Chrome');

const profileDir = path.join(os.tmpdir(), `agi-perf-${Date.now()}`);
const proc = spawn(browserPath, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1440,900',
  'about:blank'
], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let wsUrl = null;
for (let i = 0; i < 120 && !wsUrl; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    wsUrl = list.find(t => t.type === 'page')?.webSocketDebuggerUrl;
  } catch { /* 等浏览器 */ }
  if (!wsUrl) await sleep(150);
}
const ws = await new Promise((res, rej) => { const s = new WebSocket(wsUrl); s.onopen = () => res(s); s.onerror = rej; });
let seq = 0; const pending = new Map();
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
};
const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expression, awaitPromise = false) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: APP + '/?bot=1' });
await sleep(6000);

if (SCENE === 'select') {
  await ev(`document.querySelector('#btn-start')?.click()`);
  await sleep(4000);
} else if (SCENE === 'battle') {
  await ev(`document.querySelector('#btn-start')?.click()`);
  await sleep(1200);
  await ev(`document.querySelectorAll('[data-act="select-char"][aria-pressed="true"]').forEach(b => b.click())`);
  for (const id of ['wenxin', 'claude', 'gemini', 'gpt']) {
    await ev(`document.querySelector('[data-act="select-char"][data-char-id="${id}"]')?.click()`);
  }
  await sleep(400);
  await ev(`document.querySelector('#btn-create')?.click()`);
  await sleep(3000);
  for (let i = 0; i < 6; i++) {
    await ev(`document.querySelector('[data-act="story-continue"]')?.click()`);
    await sleep(500);
  }
  const target = await ev(`(() => { const b = Array.from(document.querySelectorAll('[data-act="node"]')).find(n => /战斗/.test(n.querySelector('.node-type')?.textContent || '')); return b ? b.dataset.nodeId : ''; })()`);
  for (let i = 0; i < 12; i++) {
    await ev(`document.querySelector('[data-act="node"][data-node-id="${target}"]')?.click()`);
    await sleep(900);
    await ev(`document.querySelector('[data-act="story-continue"]')?.click()`);
    if (await ev(`!!document.querySelector('[data-act="hex"]')`)) break;
    await ev(`document.querySelector('[data-act="end-turn"]')?.click()`);
    await sleep(600);
  }
  await sleep(4000);
}

const data = await ev(`(() => {
  const nav = performance.getEntriesByType('navigation')[0] || {};
  const res = performance.getEntriesByType('resource');
  const byType = {};
  let total = 0, encoded = 0;
  for (const r of res) {
    const t = r.initiatorType || 'other';
    const key = /\.(woff2?|ttf)$/.test(r.name) ? 'font' : t;
    byType[key] = byType[key] || { n: 0, bytes: 0, transfer: 0 };
    byType[key].n++;
    byType[key].bytes += r.decodedBodySize || 0;
    byType[key].transfer += r.transferSize || 0;
    total += r.decodedBodySize || 0;
    encoded += r.transferSize || 0;
  }
  const paints = {};
  for (const p of performance.getEntriesByType('paint')) paints[p.name] = Math.round(p.startTime);
  const big = res.map(r => ({ n: r.name.replace(location.origin, ''), kb: Math.round((r.decodedBodySize || 0) / 1024), ms: Math.round(r.duration) }))
    .sort((a, b) => b.kb - a.kb).slice(0, 10);
  return {
    domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0),
    load: Math.round(nav.loadEventEnd || 0),
    fcp: paints['first-contentful-paint'] || 0,
    requests: res.length,
    decodedKB: Math.round(total / 1024),
    transferKB: Math.round(encoded / 1024),
    byType, big
  };
})()`);

console.log(`\n=== ${SCENE} ===`);
console.log(`FCP ${data.fcp}ms · DCL ${data.domContentLoaded}ms · load ${data.load}ms`);
console.log(`请求 ${data.requests} 个 · 解压后 ${data.decodedKB}KB · 实际传输 ${data.transferKB}KB`);
console.log('\n按类型：');
for (const [k, v] of Object.entries(data.byType).sort((a, b) => b[1].transfer - a[1].transfer)) {
  console.log(`  ${k.padEnd(12)} ${String(v.n).padStart(3)} 个  ${String(Math.round(v.transfer / 1024)).padStart(5)}KB 传输 / ${String(Math.round(v.bytes / 1024)).padStart(5)}KB 原始`);
}
console.log('\n最大的 10 个：');
for (const b of data.big) console.log(`  ${String(b.kb).padStart(5)}KB  ${String(b.ms).padStart(4)}ms  ${b.n}`);

ws.close();
proc.kill();
