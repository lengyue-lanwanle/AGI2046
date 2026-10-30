// 存档续玩验证：写入 localStorage → 刷新 → 点「继续行动」→ 进度与刷新前一致
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = process.env.APP_URL || 'http://localhost:5178';
const APP_URL = APP + (APP.includes('?') ? '&' : '?') + 'bot=1';   // 自动化跳过 VN 剧情
const PORT = Number(process.env.CDP_PORT || 9224);
const OUT = path.resolve('tools/e2e/out');
fs.mkdirSync(OUT, { recursive: true });
const browserPath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const profile = path.join(os.tmpdir(), 'agi-resume-' + Date.now());
const proc = spawn(browserPath, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--window-size=1440,900', 'about:blank'
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let wsUrl = null;
for (let i = 0; i < 80 && !wsUrl; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    wsUrl = list.find(t => t.type === 'page')?.webSocketDebuggerUrl;
  } catch { /* 等待 */ }
  if (!wsUrl) await sleep(150);
}
const ws = await new Promise((res, rej) => {
  const s = new WebSocket(wsUrl);
  s.onopen = () => res(s);
  s.onerror = rej;
});
let seq = 0;
const pending = new Map();
const errors = [];
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
  } else if (m.method === 'Runtime.exceptionThrown') {
    errors.push(m.params.exceptionDetails?.exception?.description || 'exception');
  }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq;
  pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params }));
});
const ev = async (expr, awaitPromise = false) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const shot = async name => {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, name), Buffer.from(data, 'base64'));
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

// 1) 先用真实接口开一局，拿到 sessionId
const meta = await (await fetch(APP + '/api/meta')).json();
const created = await (await fetch(APP + '/api/new', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ characterIds: meta.characters.slice(0, 3).map(c => c.id), seed: 777 })
})).json();
const sid = created.sessionId;
const target = created.nodes.find(n => n.id === created.nodes.find(x => x.id === 'start').neighbors[0]);
const moved = await (await fetch(APP + '/api/action', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ sessionId: sid, action: { type: 'move', playerId: created.activePlayerId, nodeId: target.id } })
})).json();
console.log('[prepare]', sid, moved.phase, 'act', moved.act, 'round', moved.round, moved.players[0].name, '@', moved.players[0].nodeId);

// 2) 浏览器写入存档并刷新
await send('Page.navigate', { url: APP_URL });
await sleep(1500);
await ev(`localStorage.setItem('agi2046.sessionId', '${sid}')`);
await send('Page.reload');
await sleep(2000);

const resumeBtn = await ev(`(() => {
  const b = document.querySelector('#btn-resume');
  if (!b || b.classList.contains('hidden')) return null;
  return { text: b.innerText.replace(/\\s+/g, ' ').trim(), sub: document.querySelector('#resume-sub')?.textContent };
})()`);
console.log('[resume-button]', JSON.stringify(resumeBtn));
await shot('demo-resume-title.png');

// 3) 点击继续
await ev(`document.querySelector('#btn-resume').click()`);
await sleep(1200);
const story = await ev(`(() => {
  const m = document.querySelector('#modal-root .story-card');
  return m ? m.innerText.replace(/\\s+/g, ' ').slice(0, 80) : null;
})()`);
console.log('[story-card]', JSON.stringify(story));
if (story) {
  await shot('demo-story-prologue.png');
  await ev(`document.querySelector('[data-act="story-continue"]')?.click()`);
  await sleep(600);
}
const inGame = await ev(`(() => {
  const screen = document.querySelector('.screen.active')?.id;
  const act = document.querySelector('#act-name')?.textContent;
  const round = document.querySelector('#round-value')?.textContent;
  const purge = document.querySelector('#purge-value')?.textContent;
  const active = document.querySelector('.active-card')?.innerText?.replace(/\\s+/g,' ').slice(0, 40);
  return { screen, act, round, purge, active, modal: !!document.querySelector('#modal-root .modal') };
})()`);
console.log('[after-resume]', JSON.stringify(inGame));
await shot('demo-resume-game.png');

// 4) 刷新再进，确认仍能恢复（服务端会话未丢）
await send('Page.reload');
await sleep(1800);
const again = await ev(`(() => {
  const b = document.querySelector('#btn-resume');
  return { visible: !!b && !b.classList.contains('hidden'), sub: document.querySelector('#resume-sub')?.textContent };
})()`);
console.log('[reload-again]', JSON.stringify(again));

const ok = !!resumeBtn && inGame.screen === 'game-screen'
  && inGame.act === moved.actName && again.visible && errors.length === 0;
console.log('\n===== RESULT =====');
console.log(JSON.stringify({ ok, sid, resumeBtn, inGame, again, consoleErrors: errors }, null, 2));

// 清理这局测试存档
await fetch(APP + '/api/session/' + sid, { method: 'DELETE' }).catch(() => {});
ws.close();
proc.kill();
await sleep(800);
process.exit(ok ? 0 : 1);
