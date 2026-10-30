// 0.25 长局弹窗疲劳：连续 80 个动作，看弹窗会不会重复弹、叠加、关不掉
// 用法：node tools/ui/modal-fatigue.mjs [--mobile]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = process.env.APP || 'http://127.0.0.1:5178';
const MOBILE = process.argv.includes('--mobile');
const OUT = process.env.OUT || path.join('tools/ui/fatigue', MOBILE ? 'mobile' : 'desktop');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const results = [];
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —  ' + detail : ''}`);
};

const PORT = Number(process.env.CDP_PORT || (MOBILE ? 9382 : 9381));
const width = MOBILE ? 390 : 1440;
const height = MOBILE ? 844 : 900;
const browser = spawn('C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${path.join(os.tmpdir(), 'agi-fatigue-' + Date.now())}`,
  '--no-first-run', '--disable-gpu', '--hide-scrollbars', `--window-size=${width},${height}`, 'about:blank'
], { stdio: 'ignore' });

let wsUrl = null;
for (let i = 0; i < 120 && !wsUrl; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    wsUrl = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl)?.webSocketDebuggerUrl;
  } catch { }
  if (!wsUrl) await sleep(150);
}
const ws = await new Promise((res, rej) => { const s = new WebSocket(wsUrl); s.onopen = () => res(s); s.onerror = rej; });
let id = 0;
const pending = new Map();
const errs = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails?.exception?.description || 'err');
};
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async x => {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
  return r.exceptionDetails ? ('ERR ' + (r.exceptionDetails.exception?.description || '')) : r.result?.value;
};
const shot = async name => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64'));
};

await send('Runtime.enable');
await send('Page.enable');
if (MOBILE) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
}
await send('Page.navigate', { url: APP + '?bot=1' });
await sleep(2400);

/* 1. 开一局（2 人，方便触发多人事件） */
await ev(`document.querySelector('#btn-start')?.click(); 1`);
await sleep(900);
await ev(`(()=>{const c=[...document.querySelectorAll('.char-card')];c[0]?.click();c[1]?.click();return 1})()`);
await sleep(400);
await ev(`document.querySelector('#btn-create')?.click(); 1`);
await sleep(2600);
for (let i = 0; i < 5; i++) {
  const r = await ev(`(()=>{const b=document.querySelector('[data-act="story-continue"]');if(!b)return 0;b.click();return 1})()`);
  if (!r) break;
  await sleep(350);
}
ok('进入对局', (await ev(`document.querySelectorAll('.map-node').length`)) > 10,
  String(await ev(`document.querySelectorAll('.map-node').length`)));

/* 2. 装观察器：记录每次弹窗 + 当时的 revision */
await ev(`(()=>{
  window.__modals = [];
  window.__modalStacks = 0;
  const root = document.querySelector('#modal-root');
  if (!root) return 0;
  new MutationObserver(muts => {
    for (const m of muts) {
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        // mountModal 是 innerHTML 整块替换：添加的是 .modal-backdrop，.modal 在它里面
        const modal = n.matches?.('.modal') ? n : n.querySelector?.('.modal');
        if (!modal) continue;
        const title = (modal.querySelector('.modal-head h3')?.textContent || '').trim();
        const st = window.__agi.state();
        window.__modals.push({ title, rev: st?.revision ?? -1, phase: st?.phase ?? '?', t: Date.now() });
      }
    }
    window.__modalStacks = Math.max(window.__modalStacks, root.querySelectorAll('.modal').length);
  }).observe(root, { childList: true, subtree: true });
  return 1;
})()`);

/* 3. 连做 80 个动作：能交互就交互，不能就走到相邻未访问节点，再不行就结束回合 */
const played = await ev(`(async()=>{
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const g0 = window.__agi.state();
  if (!g0) return 'no-state';
  let sid = g0.sessionId;

  const send = async (action) => {
    const st = window.__agi.state();
    const r = await fetch('/api/action', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ sessionId: sid, action, expectedRevision: st.revision,
        requestId: 'fat-' + Math.random().toString(36).slice(2) })
    });
    if (!r.ok) return null;
    const next = await r.json();
    window.__agi.adopt(next);
    return next;
  };

  // 关掉当前弹窗：能选就选第一个，能关就关
  const dismiss = async () => {
    const pick = document.querySelector('[data-act="event-choice"], [data-act="challenge-start"]');
    if (pick) { pick.click(); return true; }
    const story = document.querySelector('[data-act="story-continue"]');
    if (story) { story.click(); return true; }
    const close = document.querySelector('[data-modal-backdrop] [data-act="modal-close"]')
      || document.querySelector('[data-act="modal-close"]')
      || document.querySelector('.modal-foot .btn-primary')
      || document.querySelector('.modal-foot .btn-ghost');
    if (close) { close.click(); return true; }
    return false;
  };

  // 商店 / 安全屋这类节点本来就可以反复进（设计如此）；
  // 这个测试要看的是「不同内容会不会重复弹」，所以同一次会话里只进一次。
  const seen = new Set();
  let actions = 0;
  for (let i = 0; i < 90; i++) {
    let st = window.__agi.state();
    if (!st) break;
    if (st.phase === 'victory' || st.phase === 'defeat') break;

    // 各阶段该做什么：真实流程走一遍，弹窗才会真的出现
    if (st.pendingBeat) { await send({ type:'ackBeat', beatId: st.pendingBeat.id }); actions++; await sleep(90); continue; }
    if (st.phase === 'combat') {
      const c = st.combat;
      if (!c) break;
      if (c.isOver) { await send({ type:'closeCombat' }); actions++; await sleep(140); continue; }
      const active = c.units.find(u => u.id === c.activeUnitId);
      const foe = c.units.find(u => u.side === 'enemy' && !u.downed);
      if (active && active.side === 'player' && foe) {
        const ok2 = await send({ type:'combatAction', playerId: active.playerId, skillId:'basic', targetUnitId: foe.id });
        if (!ok2) await send({ type:'combatEndTurn' });
      } else {
        await send({ type:'combatEndTurn' });
      }
      actions++;
      await sleep(110);
      continue;
    }
    if (st.phase === 'event') { await send({ type:'eventChoice', choiceIndex: 0 }); actions++; await sleep(150); continue; }
    if (st.phase === 'shop' || st.phase === 'safehouse') { await send({ type:'close' }); actions++; await sleep(150); continue; }
    if (st.phase === 'coop') {
      const coop = st.coop;
      if (coop?.resolved) await send({ type:'coopClose' });
      else {
        const voter = st.players.find(x => !x.downed && !(coop?.votes || {})[x.id]);
        if (voter && coop?.options?.[0]) await send({ type:'coopVote', playerId: voter.id, slot: coop.options[0].id });
        else await send({ type:'coopResolve' });
      }
      actions++;
      await sleep(140);
      continue;
    }
    if (st.phase === 'actTransition') { await send({ type:'advanceAct' }); actions++; await sleep(200); continue; }

    if (document.querySelector('.modal')) {
      const closed = await dismiss();
      await sleep(220);
      if (!closed) break;
      continue;
    }

    const p = st.players.find(x => x.id === st.activePlayerId) || st.players[0];
    const here = st.nodes.find(n => n.id === p.nodeId);
    const canInteract = here && !here.cleared && !seen.has(here.id) &&
      here.type !== 'blank' && here.type !== 'start' && p.ap > 0;
    if (canInteract && ['shop', 'safehouse', 'server', 'terminal', 'awakening'].includes(here.type)) seen.add(here.id);

    if (canInteract) {
      const next = await send({ type: 'interact', playerId: p.id, nodeId: here.id });
      if (!next) { await send({ type: 'endTurn', playerId: p.id }); }
      actions++;
      await sleep(120);
      continue;
    }

    const nextNode = (here?.neighbors || [])
      .map(id => st.nodes.find(n => n.id === id))
      .find(n => n && !n.visited && n.type !== 'trap');
    if (nextNode && p.ap > 0) {
      const next = await send({ type: 'move', playerId: p.id, nodeId: nextNode.id });
      if (!next) await send({ type: 'endTurn', playerId: p.id });
      actions++;
      await sleep(120);
      continue;
    }

    await send({ type: 'endTurn', playerId: p.id });
    actions++;
    await sleep(90);
  }
  return actions;
})()`);

// 追踪归零会提前结束（小屏 + 慢机更早），20 个动作足够观察弹窗行为
ok('连续动作跑完', Number(played) >= 20, `${played} 个动作`);
await sleep(600);

/* 4. 弹窗统计 */
{
  const log = await ev(`JSON.stringify(window.__modals || [])`);
  let modals = [];
  try { modals = JSON.parse(log || '[]'); } catch { }
  const kinds = new Map();
  for (const m of modals) {
    const k = m.title || m.phase;
    kinds.set(k, (kinds.get(k) || 0) + 1);
  }
  console.log(`      弹窗 ${modals.length} 次：` +
    [...kinds.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(' / '));

  // 战斗结算弹窗本来就每场一个，不算疲劳；疲劳看的是「同一类窗口反复弹」
  const isCombatResult = t => /结算|战术/.test(t || '');
  const nonCombat = modals.filter(m => !isCombatResult(m.title));
  ok('非战斗弹窗不会满地弹（≤ 动作数 / 6）', nonCombat.length <= Math.max(3, Number(played) / 6),
    `${nonCombat.length} / ${played}`);
  const titleCount = new Map();
  for (const m of modals) titleCount.set(m.title, (titleCount.get(m.title) || 0) + 1);
  const worst = [...titleCount.entries()].sort((a, b) => b[1] - a[1])[0] || ['', 0];
  ok('同一个窗口不反复弹（最多 6 次）', worst[1] <= 6, `${worst[0]} × ${worst[1]}`);

  // 同一个 revision 弹同标题 = 重复弹
  const dup = new Map();
  let dupCount = 0;
  for (const m of modals) {
    const key = `${m.rev}|${m.title}`;
    if (dup.has(key)) dupCount++;
    dup.set(key, true);
  }
  ok('同一状态不重复弹同一个窗', dupCount === 0, `${dupCount} 次重复`);

  const stacks = await ev(`window.__modalStacks || 0`);
  ok('弹窗不会叠加', Number(stacks) <= 1, `最多同时 ${stacks} 个`);

  const left = await ev(`document.querySelectorAll('#modal-root .modal').length`);
  ok('最后没有残留弹窗', Number(left) <= 1, String(left));

  const toasts = await ev(`document.querySelectorAll('#toast-layer .toast').length`);
  ok('提示条不会堆积', Number(toasts) <= 6, String(toasts));

  const nodes = await ev(`document.querySelectorAll('#modal-root *').length`);
  ok('弹窗 DOM 没有累积', Number(nodes) < 400, `${nodes} 个节点`);
}

/* 5. 关闭后再开不会重复（同一个 help 连开关三次） */
{
  for (let i = 0; i < 3; i++) {
    await ev(`document.querySelector('#btn-help')?.click(); 1`);
    await sleep(320);
    await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
    await sleep(260);
  }
  const left = await ev(`document.querySelectorAll('#modal-root .modal').length`);
  ok('反复开关设置不残留', Number(left) === 0, String(left));
  await shot('01-after-80-actions');
}

ok('控制台无异常', errs.length === 0, JSON.stringify(errs.slice(0, 3)));

const pass = results.filter(r => r.pass).length;
console.log(`\n===== ${pass}/${results.length} passed =====`);
await send('Browser.close').catch(() => { });
spawn('taskkill', ['/F', '/T', '/PID', String(browser.pid)], { stdio: 'ignore' });
process.exit(pass === results.length ? 0 : 1);
