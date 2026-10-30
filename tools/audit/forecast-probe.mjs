// 验证「技能卡伤害预估 → 敌人名牌受击值」这条链路：
// 逐个选中技能，读每个敌人的 forecast，确认它跟着技能变（而不是永远等于普攻）。
// 用法：node tools/audit/forecast-probe.mjs <sessionId>
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = process.env.APP || 'http://127.0.0.1:5178';
const SID = process.argv[2];
const PORT = 9352;
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!SID) { console.error('用法: node tools/audit/forecast-probe.mjs <sessionId>'); process.exit(2); }

const browser = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(os.tmpdir(), 'agi-fc-' + Date.now())}`,
  '--no-first-run', '--disable-gpu', '--window-size=1440,900', 'about:blank'
], { stdio: 'ignore' });

let ws = null;
for (let i = 0; i < 120 && !ws; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    ws = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl)?.webSocketDebuggerUrl;
  } catch { /* 浏览器还没起来 */ }
  if (!ws) await sleep(150);
}
const sock = new WebSocket(ws);
await new Promise(r => { sock.onopen = r; });
let seq = 0;
const pending = new Map();
sock.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const { res } = pending.get(m.id); pending.delete(m.id); res(m.result); }
};
const send = (method, params = {}) => new Promise(res => {
  const id = ++seq; pending.set(id, { res }); sock.send(JSON.stringify({ id, method, params }));
});
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result?.value;
};

await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: APP });
await sleep(1400);
await ev(`localStorage.setItem('agi2046.sessionId','${SID}');location.reload()`);
await sleep(2400);
await ev(`document.querySelector('#btn-resume')?.click()`);
await sleep(2000);
await ev(`document.querySelector('[data-act="story-continue"]')?.click()`);
await sleep(800);

const result = await ev(`(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rows = [];
  const act0 = window.__agi?.activeUnit();
  // 每轮都要重新查 DOM：点技能会 renderCombat() 重建整块 innerHTML，
  // 上一轮拿到的节点会脱离文档树，点它不会冒泡到 document（探针自己的坑）。
  const ids = [...document.querySelectorAll('.skill-card')].map(c => c.getAttribute('data-skill-id'));
  rows.push({ id: '(状态)', name: '',
    nowSkill: 'focus=' + (act0?.focus ?? '?') + '/' + (act0?.maxFocus ?? '?') + ' ult=' + (act0?.ultimateUsed ? 'used' : 'ok'),
    enemies: [] });
  for (const id of ids) {
    const card = document.querySelector('.skill-card[data-skill-id="' + id + '"]');
    if (!card) { rows.push({ id, skipped: '节点消失' }); continue; }
    if (card.classList.contains('disabled')) { rows.push({ id, skipped: 'disabled' }); continue; }
    card.click();
    await sleep(220);
    const c = window.__agi?.state()?.combat;
    if (!c) return { error: '没有战斗' };
    const enemies = c.units.filter(u => u.side === 'enemy' && u.hp > 0)
      .map(u => ({ name: u.name, armor: u.armor, res: u.resistance, forecast: u.forecast?.total ?? null,
                   raw: u.forecast?.raw ?? null, mit: u.forecast?.mitigation ?? null }));
    rows.push({
      id, name: card.querySelector('.sc-name')?.textContent || '',
      nowSkill: window.__agi?.combatSkill?.() ?? null,
      dice: card.querySelector('.sc-meta')?.textContent || '',
      enemies
    });
  }
  return { rows };
})()`);

if (result?.error) {
  console.log('失败：', result.error);
  process.exitCode = 1;
} else {
  for (const row of result.rows) {
    if (row.skipped) { console.log(`  ${row.id.padEnd(14)} （${row.skipped}）`); continue; }
    if (!row.enemies || !row.enemies.length) { console.log(`  ${row.id.padEnd(14)} ${row.nowSkill}`); continue; }
    const parts = row.enemies.map(e =>
      `${e.name} 甲${e.armor}/抗${e.res} 原始${e.raw}-${e.mit}=${e.forecast ?? '—'}`);
    console.log(`  ${String(row.id).padEnd(14)} ${String(row.name).padEnd(8)} 选中=${String(row.nowSkill).padEnd(12)} → ${parts.join(' | ')}`);
  }
  const totals = new Set();
  for (const row of result.rows) if (row.enemies) for (const e of row.enemies) totals.add(e.forecast);
  console.log(`\n不同技能的预估伤害取值：${[...totals].map(v => v ?? 'null').join(' / ')}`);
  console.log(totals.size > 1 ? 'PASS  预估会随技能变化' : 'WARN  所有技能预估相同（可能都等价，也可能是链路坏了）');
}

await send('Browser.close').catch(() => {});
spawn('taskkill', ['/F', '/T', '/PID', String(browser.pid)], { stdio: 'ignore' });
