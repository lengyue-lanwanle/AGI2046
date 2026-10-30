// VN 舞台巡检：开场 / 角色 / 差表情 / 选择 / 日志 / 跳过 / 手机
// 用法：node tools/ui/vn-shots.mjs [outDir]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = process.env.APP || 'http://127.0.0.1:5178';
const OUT = process.argv[2] || 'tools/ui/vn';
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 固定端口会让并发/残留实例互相串台（连到上一轮的页面），改成随机端口
const PORT = Number(process.env.CDP_PORT || (9400 + Math.floor(Math.random() * 400)));
const browser = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(os.tmpdir(), 'agi-vn-' + Date.now())}`,
  '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--window-size=1440,900', 'about:blank'
], { stdio: 'ignore' });

let wsUrl = null;
for (let i = 0; i < 120 && !wsUrl; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    wsUrl = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)?.webSocketDebuggerUrl;
  } catch { /* 还没起 */ }
  if (!wsUrl) await sleep(150);
}
const ws = await new Promise((res, rej) => { const s = new WebSocket(wsUrl); s.onopen = () => res(s); s.onerror = rej; });
let id = 0; const pend = new Map(); const errors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
  else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description || 'exception');
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return r.exceptionDetails ? 'ERR ' + (r.exceptionDetails.exception?.description || '') : r.result?.value;
};
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
};
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —  ' + detail : ''}`);
  cond ? pass++ : fail++;
};

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
await send('Page.navigate', { url: APP });
await sleep(2400);

// ── 1. 从标题页打开剧情档案，播序章 ────────────────────────────────
await ev(`document.querySelector('#btn-story-archive')?.click(); 1`);
await sleep(500);
const rows = await ev(`document.querySelectorAll('.va-row').length`);
ok('剧情档案列出全部场景', rows >= 13, `${rows} 场`);
await shot('00-archive');

await ev(`document.querySelector('[data-scene="prologue"]')?.click(); 1`);
await sleep(900);
ok('序章已打开', await ev(`!!document.querySelector('.vn')`));
ok('背景已加载', await ev(`/rain/.test(document.querySelector('.vn-bg')?.style.backgroundImage || '')`),
  await ev(`document.querySelector('.vn-bg')?.style.backgroundImage?.slice(0, 60)`));
ok('同屏立绘数量正确', (await ev(`document.querySelectorAll('.vn-char').length`)) === 3);
ok('第一句是旁白（无名字牌）', !(await ev(`document.querySelector('.vn-name')?.classList.contains('on')`)));
await shot('01-prologue-narration');

// 逐字：点一下先补完，再点一下进下一句
await ev(`document.querySelector('.vn-box')?.click(); 1`);
await sleep(140);
await ev(`document.querySelector('.vn-box')?.click(); 1`);
await sleep(160);
await ev(`document.querySelector('.vn-box')?.click(); 1`);
await sleep(700);
const speaker = await ev(`document.querySelector('.vn-name.on span')?.textContent || ''`);
ok('第二句开始出现说话人', speaker.length > 0, `说话人=${speaker}`);
ok('说话人立绘被点亮', await ev(`!!document.querySelector('.vn-char.speaking')`));
await shot('02-prologue-speaker');

// 表情：鲸落那句是 calm，宪章 serious；确认 data-emo 跟着走
await sleep(400);
for (let i = 0; i < 3; i++) { await ev(`document.querySelector('.vn-box')?.click(); 1`); await sleep(120); }
const emos = await ev(`[...document.querySelectorAll('.vn-char')].map(n => n.dataset.who + ':' + n.dataset.emo).join(',')`);
ok('情绪跟着台词切', /worry|serious|calm|smile/.test(emos), emos);
await shot('03-prologue-emo');

// 日志
await ev(`document.querySelector('[data-vn="log"]')?.click(); 1`);
await sleep(300);
const logRows = await ev(`document.querySelectorAll('.vn-log-row').length`);
ok('记录里能看到已读台词', logRows >= 3, `${logRows} 行`);
await shot('04-log');
await ev(`document.querySelector('[data-vn="log-close"]')?.click(); 1`);
await sleep(200);

// 跳过
await ev(`document.querySelector('[data-vn="skip"]')?.click(); 1`);
await sleep(500);
ok('跳过能收掉舞台', !(await ev(`!!document.querySelector('.vn')`)));
ok('跳过标记为已读', await ev(`JSON.parse(localStorage.getItem('agi2046.seenScenes')||'{}').prologue === 1`));

// ── 2. Boss 战前：立牌 + 镜头 ─────────────────────────────────────
await ev(`document.querySelector('#btn-story-archive')?.click(); 1`);
await sleep(400);
await ev(`document.querySelector('[data-scene="boss1_pre"]')?.click(); 1`);
await sleep(900);
ok('Boss 场用整幅主视觉当背景', /boss1/.test(await ev(`document.querySelector('.vn-bg')?.style.backgroundImage || ''`)),
  await ev(`document.querySelector('.vn-bg')?.style.backgroundImage?.slice(0, 50)`));
for (let i = 0; i < 8; i++) {
  if ((await ev(`document.querySelector('.vn-name.on span')?.textContent`)) === '拍卖人') break;
  await ev(`document.querySelector('.vn-box')?.click(); 1`); await sleep(200);
}
ok('Boss 名字牌是拍卖人', (await ev(`document.querySelector('.vn-name.on span')?.textContent`)) === '拍卖人');
ok('Boss 镜头推近', (await ev(`document.querySelector('.vn-scene')?.dataset.cam`)) === 'near');
await shot('05-boss-pre');

// ── 3. 终局二选一 → 结局 ──────────────────────────────────────────
await ev(`document.querySelector('[data-vn="skip"]')?.click(); 1`); await sleep(400);
await ev(`document.querySelector('#btn-story-archive')?.click(); 1`); await sleep(400);
await ev(`document.querySelector('[data-scene="boss3_post"]')?.click(); 1`);
await sleep(800);
// 推进到选择
for (let i = 0; i < 14; i++) {
  if (await ev(`!!document.querySelector('.vn-choice')`)) break;
  await ev(`document.querySelector('.vn-box')?.click(); 1`);
  await sleep(120);
  await ev(`document.querySelector('.vn-box')?.click(); 1`);
  await sleep(120);
}
await sleep(400);
const choices = await ev(`document.querySelectorAll('.vn-choice').length`);
ok('终局给出两个选择', choices === 2, `${choices} 个`);
await shot('06-choice');

await ev(`document.querySelectorAll('.vn-choice')[0]?.click(); 1`);
await sleep(900);
const endingTitle = await ev(`document.querySelector('.vn-title')?.textContent || ''`);
ok('选择后接上结局场景', /结局/.test(endingTitle), endingTitle);
await shot('07-ending');

// Esc 跳过结局
await ev(`document.querySelector('[data-vn="skip"]')?.click(); 1`);
await sleep(500);

// ── 3.5 觉醒短场：16 段都在，能播 ────────────────────────────────
await ev(`document.querySelector('[data-vn="skip"]')?.click(); 1`); await sleep(400);
const awakenCount = await ev(`Object.keys(window.STORY.SCENES).filter(k => k.startsWith('awaken-')).length`);
ok('16 段觉醒短场已生成', awakenCount === 16, `${awakenCount} 段`);
await ev(`window.VN.play('awaken-gpt'); 1`);
await sleep(700);
ok('觉醒场标题带角色名', /白垩/.test(await ev(`document.querySelector('.vn-title')?.textContent || ''`)));
let awakenLine = false;
for (let i = 0; i < 10 && !awakenLine; i++) {
  awakenLine = (await ev(`document.querySelector('.vn-text')?.textContent || ''`)).includes('别断线');
  if (!awakenLine) { await ev(`document.querySelector('.vn-box')?.click(); 1`); await sleep(200); }
}
ok('觉醒那句是「别断线。」', awakenLine);
await shot('07b-awaken');
await ev(`document.querySelector('[data-vn="skip"]')?.click(); 1`); await sleep(400);

// ── 4. 手机竖屏 ───────────────────────────────────────────────────
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await send('Page.reload');
await sleep(2200);
await ev(`document.querySelector('#btn-story-archive')?.click(); 1`);
await sleep(400);
await ev(`document.querySelector('[data-scene="prologue"]')?.click(); 1`);
await sleep(900);
await ev(`document.querySelector('.vn-box')?.click(); 1`); await sleep(150);
await ev(`document.querySelector('.vn-box')?.click(); 1`); await sleep(150);
await ev(`document.querySelector('.vn-box')?.click(); 1`); await sleep(800);
await shot('08-mobile-prologue');

const overflow = await ev(`(() => {
  const box = document.querySelector('.vn-box');
  const r = box.getBoundingClientRect();
  return { w: innerWidth, h: innerHeight, boxTop: Math.round(r.top), boxBottom: Math.round(r.bottom), sw: document.documentElement.scrollWidth };
})()`);
ok('手机对话框不出屏', overflow.boxBottom <= overflow.h + 1 && overflow.boxTop > 0, JSON.stringify(overflow));
ok('手机无横向溢出', overflow.sw <= overflow.w, `scrollWidth=${overflow.sw}`);

// 手机上的选择按钮
await ev(`document.querySelector('[data-vn="skip"]')?.click(); 1`); await sleep(300);
await ev(`document.querySelector('#btn-story-archive')?.click(); 1`); await sleep(400);
await ev(`document.querySelector('[data-scene="boss3_post"]')?.click(); 1`); await sleep(700);
for (let i = 0; i < 14; i++) {
  if (await ev(`!!document.querySelector('.vn-choice')`)) break;
  await ev(`document.querySelector('.vn-box')?.click(); 1`); await sleep(100);
  await ev(`document.querySelector('.vn-box')?.click(); 1`); await sleep(100);
}
await sleep(300);
await shot('09-mobile-choice');
ok('手机选择框在屏内', await ev(`(() => {
  const c = document.querySelector('.vn-choice'); if (!c) return false;
  const r = c.getBoundingClientRect(); return r.top > 0 && r.bottom < innerHeight && r.left >= 0 && r.right <= innerWidth;
})()`));

ok('控制台无异常', errors.length === 0, JSON.stringify(errors.slice(0, 3)));
console.log(`\n${pass} 通过 / ${fail} 失败  →  ${path.resolve(OUT)}`);

await send('Browser.close').catch(() => {});
spawn('taskkill', ['/F', '/T', '/PID', String(browser.pid)], { stdio: 'ignore' });
process.exit(fail ? 1 : 0);
