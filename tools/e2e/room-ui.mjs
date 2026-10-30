// 联机 UI 双客户端验证：建房 → 加入 → 开始 → 轮流行动 → 越权被拦
// 用法：node tools/e2e/room-ui.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = process.env.APP_URL || 'http://localhost:5178';
const APP_URL = APP + (APP.includes('?') ? '&' : '?') + 'bot=1';   // 自动化跳过 VN 剧情
const OUT = path.resolve('tools/e2e/out');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —  ' + detail : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
];
const browserPath = BROWSERS.find(p => fs.existsSync(p));
if (!browserPath) throw new Error('找不到 Edge/Chrome');

async function portInUse(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(400) });
    return true;
  } catch {
    return false;
  }
}

async function pickFreePort(start) {
  for (let p = start; p < start + 40; p++) {
    if (!(await portInUse(p))) return p;
  }
  throw new Error('找不到空闲的 CDP 端口，可能有残留浏览器实例');
}

async function makeClient(label, port) {
  const profile = path.join(os.tmpdir(), `agi-room-${label}-${Date.now()}`);
  const proc = spawn(browserPath, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1440,960', 'about:blank'
  ], { stdio: 'ignore' });

  let wsUrl = null;
  for (let i = 0; i < 120 && !wsUrl; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      wsUrl = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl)?.webSocketDebuggerUrl;
    } catch { /* 等待 */ }
    if (!wsUrl) await sleep(120);
  }
  const ws = await new Promise((resolve, reject) => {
    const s = new WebSocket(wsUrl);
    s.onopen = () => resolve(s);
    s.onerror = e => reject(new Error(label + ' WS 失败: ' + e.message));
  });

  let seq = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails?.exception?.description || 'exception');
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error')
      errors.push((msg.params.args || []).map(a => a.value ?? a.description ?? '').join(' '));
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression, awaitPromise = false) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(label + ' 页面异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };
  const waitFor = async (expression, timeout = 10000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (await evaluate(expression).catch(() => false)) return true;
      await sleep(160);
    }
    return false;
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
  await waitFor(`document.readyState === 'complete' && !!document.querySelector('#btn-start')`);

  return {
    evaluate, waitFor, shot, errors,
    close: async () => {
      try { await send('Browser.close'); } catch { /* 已退出 */ }
      try { ws.close(); } catch { /* 忽略 */ }
      try { proc.kill(); } catch { /* 忽略 */ }
    }
  };
}

const PORT_BASE = Number(process.env.CDP_PORT || (9300 + Math.floor(Math.random() * 100)));
const hostPort = await pickFreePort(PORT_BASE);
const guestPort = await pickFreePort(hostPort + 1);
const host = await makeClient('host', hostPort);
const guest = await makeClient('guest', guestPort);

try {
  /* 1. 房主建房：不选角色，直接进大厅，然后自己挑一个 */
  await host.evaluate(`document.querySelector('#btn-room-create').click()`);
  ok('进入房间大厅', await host.waitFor(`document.querySelector('#room-screen').classList.contains('active')`, 12000));
  const code = await host.evaluate(`document.querySelector('#room-code').textContent`);
  ok('拿到房间码', /^[A-Z0-9]{6}$/.test(code || ''), code);
  ok('房主入座但还没选角色', await host.evaluate(`(() => {
    const seat = document.querySelector('#room-seats .room-seat.taken');
    return !!seat && !seat.classList.contains('ready');
  })()`));
  ok('自动弹出角色选择', await host.waitFor(`!!document.querySelector('.char-pick:not([disabled])')`, 6000));
  await sleep(600);
  await host.shot('20-room-char-picker');
  await host.evaluate(`document.querySelectorAll('.char-pick:not([disabled])')[0].click()`);
  ok('房主选好角色', await host.waitFor(`document.querySelectorAll('#room-seats .room-seat.ready').length === 1`, 6000));
  await host.shot('20-room-host-lobby');

  /* 2. 客人加入：输码即入座，再自己挑角色 */
  await guest.evaluate(`document.querySelector('#btn-room-join').click()`);
  ok('打开加入弹窗', await guest.waitFor(`!!document.querySelector('#join-code-input')`));
  await guest.evaluate(`(() => {
    const input = document.querySelector('#join-code-input');
    input.value = ${JSON.stringify(code)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#join-name-input').value = '二号机';
    document.querySelector('[data-act="join-submit"]').click();
  })()`);
  ok('客人直接进入大厅', await guest.waitFor(`document.querySelector('#room-screen').classList.contains('active')`, 10000));
  ok('客人也弹出角色选择', await guest.waitFor(`!!document.querySelector('.char-pick:not([disabled])')`, 6000));
  await guest.shot('21-room-char-picker-guest');
  await guest.evaluate(`document.querySelectorAll('.char-pick:not([disabled])')[0].click()`);
  ok('客人也选好角色', await guest.waitFor(`document.querySelectorAll('#room-seats .room-seat.ready').length === 2`, 8000));
  await host.waitFor(`document.querySelectorAll('#room-seats .room-seat.taken').length === 2`, 6000);
  ok('房主看到客人加入', await host.evaluate(`document.querySelectorAll('#room-seats .room-seat.taken').length === 2`));
  await host.waitFor(`document.querySelectorAll('#room-seats .room-seat.ready').length === 2`, 8000);
  ok('两边角色不重样', await host.evaluate(`(() => {
    const ids = Array.from(document.querySelectorAll('#room-seats .room-seat.ready b')).map(b => b.textContent);
    return ids.length === 2 && new Set(ids).size === 2;
  })()`));
  ok('房主能看到「踢出」按钮', await host.evaluate(`!!document.querySelector('#room-seats [data-act="kick"]')`));
  ok('客人端看不到「踢出」按钮', await guest.evaluate(`!document.querySelector('#room-seats [data-act="kick"]')`));
  await guest.shot('22-room-guest-lobby');

  /* 3. 开始 */
  ok('房主开始按钮可用', await host.waitFor(`!document.querySelector('#btn-room-start').disabled`, 6000));
  await host.evaluate(`document.querySelector('#btn-room-start').click()`);
  ok('房主进入对局', await host.waitFor(`document.querySelector('#game-screen').classList.contains('active')`, 12000));
  ok('客人自动进入对局', await guest.waitFor(`document.querySelector('#game-screen').classList.contains('active')`, 15000));
  await host.shot('23-room-host-game');
  await guest.shot('24-room-guest-game');

  // 两边各自关掉开局的剧情卡，否则过场会被弹窗挡住（这也是真实玩家会做的事）
  for (const client of [host, guest]) {
    for (let i = 0; i < 4; i++) {
      const has = await client.evaluate(`!!document.querySelector('[data-act="story-continue"]')`).catch(() => false);
      if (!has) break;
      await client.evaluate(`document.querySelector('[data-act="story-continue"]').click()`);
      await sleep(400);
    }
  }

  /* 4. 行动权 */
  ok('客人看到「等待 … 行动」', await guest.waitFor(`!!document.querySelector('#room-actions .room-wait')`, 6000),
    await guest.evaluate(`document.querySelector('#room-actions .room-wait')?.textContent || ''`));
  ok('客人没有「跳过」按钮（非房主）',
    await guest.evaluate(`!document.querySelector('[data-act="force-skip"]')`));

  const guestMoved = await guest.evaluate(`(() => {
    const btn = document.querySelector('.map-node[data-node-id="n10"]');
    if (!btn) return 'no-node';
    btn.click();
    return 'clicked';
  })()`);
  await sleep(800);
  const guestToast = await guest.evaluate(`document.querySelector('#toast-layer')?.innerText?.replace(/\\s+/g, ' ') || ''`);
  ok('客人点击移动被拦截', /还没轮到你/.test(guestToast), guestToast.slice(0, 40) + ' · ' + guestMoved);

  /* 5. 轮到客人 + 回合过场 */
  await host.evaluate(`document.querySelector('[data-act="end-turn"]')?.click()`);
  ok('客人等到自己的回合', await guest.waitFor(`!document.querySelector('#room-actions .room-wait')`, 12000));
  const sawTransition = await guest.waitFor(`!!document.querySelector('.cine-turn, .turn-transition')`, 5000);
  ok('客人看到回合切换过场', sawTransition);
  if (sawTransition) await guest.shot('25-turn-transition');

  /* 6. 清理 */
  await fetch(`${APP}/api/room/${code}/leave`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'x' })
  }).catch(() => {});
} catch (err) {
  console.error('[error]', err.message);
  results.push({ name: '运行异常', pass: false, detail: err.message });
} finally {
  ok('房主控制台无报错', host.errors.length === 0, host.errors.slice(0, 2).join(' | '));
  ok('客人控制台无报错', guest.errors.length === 0, guest.errors.slice(0, 2).join(' | '));
  await host.close();
  await guest.close();
  await sleep(600);
}

const passed = results.filter(r => r.pass).length;
console.log(`\n${passed}/${results.length} 通过`);
process.exit(passed === results.length ? 0 : 1);
