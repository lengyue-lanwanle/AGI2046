// 「看不到开场 CG」回归：模拟老玩家（序章已读、CG 未看）续玩，
// 以及标题页「开场动画」按钮、?cg=intro 深链三条路径。
// 用法：node tools/ui/cg-replay.mjs [输出目录]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = process.env.APP || 'http://127.0.0.1:5178';
const OUT = process.argv[2] || 'tools/ui/cg-replay';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const r = await fetch(APP + '/api/new', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ characterIds: ['gpt', 'claude'], seed: 5150 })
});
const game = await r.json();
const sid = game.sessionId;

const PORT = Number(process.env.CDP_PORT || (9500 + Math.floor(Math.random() * 400)));
const browser = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(os.tmpdir(), 'agi-cgreplay-' + Date.now())}`,
  '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--window-size=1440,900',
  '--autoplay-policy=no-user-gesture-required', 'about:blank'
], { stdio: 'ignore' });

let wsUrl = null;
for (let i = 0; i < 120 && !wsUrl; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    wsUrl = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)?.webSocketDebuggerUrl;
  } catch {}
  if (!wsUrl) await sleep(150);
}
const ws = await new Promise((res, rej) => { const s = new WebSocket(wsUrl); s.onopen = () => res(s); s.onerror = rej; });

let seq = 0; const pending = new Map(); const errors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description || 'err');
};
const send = (method, params = {}) => new Promise((res) => { const i = ++seq; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (x) => {
  const res = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
  return res.exceptionDetails ? 'ERR ' + (res.exceptionDetails.exception?.description || '') : res.result?.value;
};
const shot = async (n) => {
  const res = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, n + '.png'), Buffer.from(res.data, 'base64'));
};
let fail = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —  ' + detail : ''}`);
};

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });

// ── 1. 老玩家：序章已读、CG 没看过 → 继续行动时必须先播 CG ─────────
await send('Page.navigate', { url: APP });
await sleep(2200);
await ev(`localStorage.setItem('agi2046.sessionId', ${JSON.stringify(sid)});
          localStorage.setItem('agi2046.seenScenes', JSON.stringify({ prologue: 1 }));
          localStorage.removeItem('agi2046.seenCG'); 1`);
await send('Page.reload');
await sleep(2400);
await ev(`document.querySelector('#btn-resume')?.click(); 1`);
await sleep(1600);

const resumed = await ev(`(() => ({
  hasCg: !!document.querySelector('.cg'),
  status: window.CG?.status?.() || null,
  ready: document.querySelector('.cg-video')?.readyState ?? -1,
  vnOpen: !!document.querySelector('.vn')
}))()`);
ok('序章已读的人也能看到开场 CG', resumed.hasCg === true, JSON.stringify(resumed));
ok('CG 已解码（readyState ≥ 2）', resumed.ready >= 2, 'readyState=' + resumed.ready);
ok('CG 播完后不该自动弹序章（序章已读）', resumed.vnOpen === false);
await shot('01-old-player-cg');

// 跳过 → 回到游戏，不再叠 VN
await ev(`document.querySelector('.cg-skip')?.click(); 1`);
await sleep(900);
const afterSkip = await ev(`({ cg: !!document.querySelector('.cg'), vn: !!document.querySelector('.vn') })`);
ok('跳过 CG 后干净回到游戏', afterSkip.cg === false && afterSkip.vn === false, JSON.stringify(afterSkip));

// ── 2. 标题页按钮：想重看就能重看 ─────────────────────────────────
await send('Page.navigate', { url: APP });
await sleep(2200);
ok('标题页有「开场动画」入口', await ev(`!!document.querySelector('#btn-title-cg')`));
await ev(`document.querySelector('#btn-title-cg')?.click(); 1`);
await sleep(1400);
const byButton = await ev(`(() => ({ hasCg: !!document.querySelector('.cg'), ready: document.querySelector('.cg-video')?.readyState ?? -1 }))()`);
ok('点按钮强制播放（已看过也放）', byButton.hasCg === true && byButton.ready >= 2, JSON.stringify(byButton));
await shot('02-title-replay');
await ev(`document.querySelector('.cg-skip')?.click(); 1`);
await sleep(600);

// ── 3. 深链 ?cg=intro ────────────────────────────────────────────
await send('Page.navigate', { url: APP + '?cg=intro' });
await sleep(2600);
const byLink = await ev(`(() => ({ hasCg: !!document.querySelector('.cg'), ready: document.querySelector('.cg-video')?.readyState ?? -1 }))()`);
ok('?cg=intro 直接播放', byLink.hasCg === true && byLink.ready >= 2, JSON.stringify(byLink));
await shot('03-deeplink');
await ev(`document.querySelector('.cg-skip')?.click(); 1`);
await sleep(500);

// ── 4. 剧情档案里的 CG 行 ────────────────────────────────────────
await ev(`document.querySelector('#btn-story-archive')?.click(); 1`);
await sleep(500);
const archiveRow = await ev(`(() => {
  const row = document.querySelector('[data-cg="intro"]');
  return row ? row.textContent.replace(/\\s+/g, ' ').trim() : '';
})()`);
ok('剧情档案列出开场动画', /开场动画/.test(archiveRow), archiveRow);
await shot('04-archive');

// ── 5. 自动播放被浏览器拦下（iOS 低电量常见）→ 必须给「点击播放」，不能静默吞掉
await send('Page.navigate', { url: APP });
await sleep(2000);
await ev(`(() => {
  const orig = HTMLMediaElement.prototype.play;
  let first = true;
  HTMLMediaElement.prototype.play = function () {
    if (first) { first = false; return Promise.reject(new DOMException('blocked', 'NotAllowedError')); }
    return orig.apply(this, arguments);
  };
  window.CG.forget('intro');
  return 1;
})()`);
await ev(`document.querySelector('#btn-title-cg')?.click(); 1`);
await sleep(1500);
const blocked = await ev(`({ tap: !!document.querySelector('.cg.tap'), status: window.CG?.status?.() })`);
ok('被拦自动播放时给出「点击播放」', blocked.tap === true, JSON.stringify(blocked));
await shot('05-blocked-tap');
await ev(`document.querySelector('.cg-tap')?.click(); 1`);
await sleep(1600);
const afterTap = await ev(`(() => {
  const v = document.querySelector('.cg-video');
  return { tapping: !!document.querySelector('.cg.tap'), paused: v ? v.paused : null, t: v ? +v.currentTime.toFixed(2) : -1 };
})()`);
ok('点一下就开始播', afterTap.tapping === false && afterTap.paused === false && afterTap.t > 0.3, JSON.stringify(afterTap));
const notSeen = await ev(`(() => { const v = document.querySelector('.cg-video'); return v ? v.readyState : -1; })()`);
ok('被拦那次没有被记成「已看过」', notSeen >= 2, 'readyState=' + notSeen);

ok('控制台无异常', errors.length === 0, JSON.stringify(errors));

console.log(`\n输出目录：${path.resolve(OUT)}`);
await send('Browser.close').catch(() => {});
spawn('taskkill', ['/F', '/T', '/PID', String(browser.pid)], { stdio: 'ignore' });
process.exit(fail ? 1 : 0);
