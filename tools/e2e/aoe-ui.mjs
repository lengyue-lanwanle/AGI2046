// 范围技 + 一局推进的 UI 验证
//   先 node tools/smoke/aoe-prepare.mjs 造局，再 node tools/e2e/aoe-ui.mjs
// 验证点：群体技（TargetType.AllEnemies）的 area/targets/原地抬手；施法后敌方回合能正常跑完
import { spawn } from 'node:child_process';
import { killBrowser } from './kill-browser.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = process.env.APP_URL || 'http://localhost:5178';
const APP_URL = APP + (APP.includes('?') ? '&' : '?') + 'bot=1';   // 自动化跳过 VN 剧情
const PORT = Number(process.env.CDP_PORT || 9231);
const OUT = path.resolve('tools/e2e/out');
const SID_FILE = path.resolve('tools/smoke/.aoe-sid');
const SID = process.env.SID || (fs.existsSync(SID_FILE) ? fs.readFileSync(SID_FILE, 'utf8').trim() : '');
if (!SID) { console.error('缺少 sessionId：先跑 node tools/smoke/aoe-prepare.mjs'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —  ' + detail : ''}`);
};

const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
];
const browserPath = BROWSERS.find(p => fs.existsSync(p));
const profileDir = path.join(os.tmpdir(), `agi-aoe-${Date.now()}`);
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
  if (!wsUrl) await sleep(150);
}
if (!wsUrl) { console.log('无法连接 CDP'); process.exit(1); }

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
    errors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text || 'exception');
  }
};
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq;
  pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params }));
});
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { error: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
  return { value: r.result?.value };
};
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64'));
};
const apiState = async () => (await fetch(`${APP}/api/state?sessionId=${SID}`)).json();

await send('Runtime.enable');
await send('Page.enable');
// headless 默认视口很小，会把叙事卡裁掉一半，必须先定死尺寸
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `${APP}/?v=88` });
await sleep(2000);
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

await ev(`localStorage.setItem('agi2046.sessionId', ${JSON.stringify(SID)}); 1`);
await send('Page.reload');
await sleep(2500);

const resume = await ev(`(() => { const b = document.querySelector('#btn-resume'); return b && !b.classList.contains('hidden') ? 'visible' : 'hidden'; })()`);
ok('续玩按钮可见', resume.value === 'visible', String(resume.value ?? resume.error));

await ev(`window.__casts = []; window.addEventListener('battle3d-cast', e => window.__casts.push(e.detail)); 1`);
await ev(`document.querySelector('#btn-resume')?.click(); 1`);
await sleep(2600);

// 叙事卡（序章/幕间）会盖住 3D 战场并吃掉点击，按真人路径点「继续 →」关掉
const dismissStory = async (label) => {
  for (let i = 0; i < 4; i++) {
    const st = await ev(`(() => {
      const b = document.querySelector('[data-act="story-continue"]');
      if (b) { b.click(); return 'story'; }
      const act = document.querySelector('#modal-root [data-act="close-modal"]');
      if (act) { act.click(); return 'modal'; }
      return 'none';
    })()`);
    if (st.value === 'none') return;
    if (label) console.log(`  (关掉 ${st.value} 卡：${label})`);
    await sleep(900);
  }
};
await dismissStory('进入战斗后');

const before = await apiState();
ok('进入战斗', !!before.combat, `round=${before.combat?.round}`);
const enemiesBefore = (before.combat?.units || []).filter(u => u.side === 'enemy');
const hexDist = (c1, r1, c2, r2) => {
  const x1 = c1 - (r1 - (r1 & 1)) / 2, z1 = r1, y1 = -x1 - z1;
  const x2 = c2 - (r2 - (r2 & 1)) / 2, z2 = r2, y2 = -x2 - z2;
  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2), Math.abs(z1 - z2));
};
const nearestEnemyDist = (st, u) => Math.min(...(st.combat.units || [])
  .filter(x => x.side === 'enemy' && !x.downed)
  .map(x => hexDist(u.col, u.row, x.col, x.row)), 99);
const nearestEnemyPos = (st) => {
  const act = st.combat.units.find(u => u.id === st.combat.activeUnitId) || { col: 0, row: 0 };
  let best = [0, 0];
  let bd = 99;
  for (const u of st.combat.units) {
    if (u.side !== 'enemy' || u.downed) continue;
    const dd = hexDist(act.col, act.row, u.col, u.row);
    if (dd < bd) { bd = dd; best = [u.col, u.row]; }
  }
  return best;
};

await dismissStory('战斗开始');

// 专注战斗：进战斗自动收起左右侧栏，战场应占满舞台宽度
const battleW = async () => {
  const r = await ev(`Math.round(document.getElementById('battle3d').getBoundingClientRect().width)`);
  return r.value;
};
const focusW = await battleW();
ok('专注战斗：战场占满宽度', focusW > 900, `canvas=${focusW}px`);
await ev(`document.querySelector('#btn-focus')?.click(); 1`);
await sleep(900);
const normalW = await battleW();
ok('可手动展开侧栏', normalW < focusW - 200, `展开后 canvas=${normalW}px（专注时 ${focusW}px）`);
await ev(`document.querySelector('#btn-focus')?.click(); 1`);
await sleep(900);
const backW = await battleW();
ok('可切回专注', backW > 900, `canvas=${backW}px`);

await shot('20-battle-before.png');

// 群体技有射程：先靠过去，等敌方回合自然结算，再施放
let castSkill = null;
for (let step = 0; step < 10 && !castSkill; step++) {
  await dismissStory();
  const st = await apiState();
  if (!st.combat) break;
  const act = st.combat.units.find(u => u.id === st.combat.activeUnitId);
  if (!act || act.side !== 'player') { await sleep(2500); continue; }
  const dist = nearestEnemyDist(st, act);
  const usable = (act.skillIds || []).filter(id => {
    if (id === 'mistral_u') return dist <= 5 && !act.ultimateUsed;
    if (id === 'mistral_2') return dist <= 1;
    if (id === 'qwen_2' || id === 'grok_2') return dist <= 5;
    return false;
  });
  if (usable.length) {
    castSkill = usable[0];
    break;
  }
  // 还没进射程：走到离敌人最近的可达格
  const reach = (st.combat.reachable || []).filter(h => {
    return !(st.combat.units || []).some(u => !u.downed && u.col === h.col && u.row === h.row);
  });
  if (!reach.length) { await sleep(2500); continue; }
  reach.sort((a, b) => hexDist(a.col, a.row, ...nearestEnemyPos(st)) - hexDist(b.col, b.row, ...nearestEnemyPos(st)));
  const next = reach[0];
  await ev(`window.dispatchEvent(new CustomEvent('battle3d-pick', { detail: { kind: 'hex', col: ${next.col}, row: ${next.row} } })); 1`);
  await sleep(1600);
  await sleep(2200); // 让敌方回合跑完
}

ok('进入射程并选定群体技', !!castSkill, `skill=${castSkill}`);
const midState = await apiState();
const activeNow = midState.combat?.units?.find(u => u.id === midState.combat?.activeUnitId);
const enemiesInRange = (midState.combat?.units || []).filter(u => u.side === 'enemy' && !u.downed);

if (castSkill) {
  const cardOk = await ev(`(() => {
    const c = document.querySelector('.skill-card[data-skill-id="${castSkill}"]');
    if (!c) return 'missing';
    if (c.classList.contains('disabled')) return 'disabled';
    c.click();
    return 'clicked';
  })()`);
  ok('技能卡可点并按群体技施放', cardOk.value === 'clicked', `card=${cardOk.value}`);
  await sleep(400);
  await shot('21-aoe-cast.png');
  await sleep(1400);
  await shot('22-aoe-after.png');
}

const castsRaw = await ev(`JSON.stringify(window.__casts || [])`);
let detail = [];
try { detail = JSON.parse(castsRaw.value || '[]'); } catch { /* 忽略 */ }
const d = detail[0] || {};
ok('施法事件已派发', detail.length > 0, JSON.stringify(d).slice(0, 220));
ok('area 命中群体技（>0）', (d.area || 0) > 0, `area=${d.area} skill=${d.skillId}`);
ok('落点不在施法者脚下', !(d.targetCol === d.casterCol && d.targetRow === d.casterRow),
  `caster=(${d.casterCol},${d.casterRow}) target=(${d.targetCol},${d.targetRow})`);
ok('群体技原地抬手（不前冲）', d.ranged === true, `ranged=${d.ranged}`);
ok('targets 覆盖射程内敌人', Array.isArray(d.targets) && d.targets.length >= 1 && d.targets.length <= enemiesInRange.length,
  `targets=${JSON.stringify(d.targets)} 射程内敌人=${enemiesInRange.length}`);


// 施法后：敌方回合应该自动跑完，回合推进
await sleep(4500);
const after = await apiState();
const hpLost = enemiesBefore.some(e => {
  const now = after.combat?.units?.find(u => u.id === e.id);
  return now && now.hp < e.hp;
});
ok('群体技对多个敌人造成伤害', hpLost,
  enemiesBefore.map(e => {
    const now = after.combat?.units?.find(u => u.id === e.id);
    return `${e.name} ${e.hp}→${now?.hp}`;
  }).join(' '));
ok('回合继续推进（敌方回合已结算）', (after.combat?.round || 0) >= (before.combat?.round || 0),
  `round ${before.combat?.round}→${after.combat?.round} active=${after.combat?.activeUnitId}`);

const logText = await ev(`(document.querySelector('#combat-log')?.innerText || '').slice(0, 600)`);
ok('战斗日志有结算内容', /伤害|命中|未命中|回合/.test(logText.value || ''), (logText.value || '').replace(/\n/g, ' ').slice(0, 180));
ok('无运行时异常', errors.length === 0, errors.slice(0, 2).join(' | '));

// 继续把这局打完：贴身用「法棍旋风」（AllEnemies 1 格），验证战斗能正常收尾
let steps = 0;
let ended = null;
for (; steps < 18; steps++) {
  await dismissStory();
  const st = await apiState();
  if (st.phase !== 'combat' || !st.combat) { ended = st; break; }
  if (st.combat.isOver) { ended = st; break; }
  const act = st.combat.units.find(u => u.id === st.combat.activeUnitId);
  if (!act || act.side !== 'player' || act.downed) { await sleep(1600); continue; }
  const dist = nearestEnemyDist(st, act);
  const canUseSkill = (act.skillIds || []).includes('mistral_2') && !(act.cooldowns || {}).mistral_2 && !act.acted;
  if (dist <= 1 && canUseSkill) {
    await ev(`document.querySelector('.skill-card[data-skill-id="mistral_2"]')?.click(); 1`);
    await sleep(1500);
  } else if (!act.moved) {
    const reach = (st.combat.reachable || []).filter(h =>
      !(st.combat.units || []).some(u => !u.downed && u.col === h.col && u.row === h.row));
    if (reach.length) {
      const [tc, tr] = nearestEnemyPos(st);
      reach.sort((a, b) => hexDist(a.col, a.row, tc, tr) - hexDist(b.col, b.row, tc, tr));
      await ev(`window.dispatchEvent(new CustomEvent('battle3d-pick', { detail: { kind: 'hex', col: ${reach[0].col}, row: ${reach[0].row} } })); 1`);
      await sleep(1200);
    } else {
      await ev(`document.querySelector('#btn-end-combat')?.click(); 1`);
      await sleep(1500);
    }
  } else {
    await ev(`document.querySelector('#btn-end-combat')?.click(); 1`);
    await sleep(1500);
  }
}
const finalState = await apiState();
const enemiesLeft = (finalState.combat?.units || []).filter(u => u.side === 'enemy' && !u.downed).length;
ok('这一局能打完（战斗结算 / 敌人清空）', !!ended || enemiesLeft === 0,
  `phase=${finalState.phase} isOver=${finalState.combat?.isOver} 余敌=${enemiesLeft} 步数=${steps}`);

await shot('23-battle-end.png');
await killBrowser(browser, profileDir, send);
try { ws.close(); } catch { /* 已断开 */ }
const pass = results.filter(r => r.pass).length;
console.log(`\n===== ${pass}/${results.length} 通过 =====`);
console.log('截图目录：', OUT);
process.exit(pass === results.length ? 0 : 1);
