// 浏览器端到端验证：真实 UI 创建 4 人队伍 → 真实游玩 → 击败当前幕首领 → 点击幕间按钮 → 进入下一幕
// 依赖：Edge/Chrome（Chromium）+ Node 22 内置 WebSocket，无第三方包。
// 用法： node tools/e2e/browser-e2e.mjs
//   PARTY=4  MAX_STEPS=1500  HEADLESS=1
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = process.env.APP_URL || 'http://localhost:5178';
const APP_URL = APP + (APP.includes('?') ? '&' : '?') + 'bot=1';   // 自动化跳过 VN 剧情
const PARTY = Number(process.env.PARTY || 4);
const MAX_STEPS = Number(process.env.MAX_STEPS || 1500);
const HEADLESS = process.env.HEADLESS !== '0';
const PORT = Number(process.env.CDP_PORT || 9223);
const OUT = path.resolve('tools/e2e/out');
fs.mkdirSync(OUT, { recursive: true });

const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
];
const browserPath = BROWSERS.find(p => fs.existsSync(p));
if (!browserPath) throw new Error('找不到 Edge/Chrome 可执行文件');

const profileDir = path.join(os.tmpdir(), `agi-e2e-profile-${Date.now()}`);
const args = [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profileDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--disable-features=Translate,MediaRouter',
  '--window-size=1440,960',
  'about:blank'
];
if (HEADLESS) args.unshift('--headless=new');
const browser = spawn(browserPath, args, { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function findTarget() {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* 浏览器还没起来 */ }
    await sleep(120);
  }
  throw new Error('CDP 未就绪');
}

const wsUrl = await findTarget();
const ws = await new Promise((resolve, reject) => {
  const s = new WebSocket(wsUrl);
  s.onopen = () => resolve(s);
  s.onerror = e => reject(new Error('WS 连接失败: ' + e.message));
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
  if (msg.method === 'Runtime.exceptionThrown') {
    consoleErrors.push(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text || 'exception');
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    consoleErrors.push((msg.params.args || []).map(a => a.value ?? a.description ?? '').join(' '));
  }
};

function send(method, params = {}) {
  const id = ++msgSeq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression, awaitPromise = false) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) {
    throw new Error('页面脚本异常: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  }
  return r.result.value;
}

async function screenshot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const file = path.join(OUT, `${name}.png`);
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  console.log(`[shot] ${file}`);
}

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: APP_URL });

for (let i = 0; i < 120; i++) {
  const ready = await evaluate(`document.readyState === 'complete' && !!document.querySelector('#btn-start')`).catch(() => false);
  if (ready) break;
  await sleep(120);
}

// ── 注入状态钩子 + 驱动 ────────────────────────────────────────────────
await evaluate(`(() => {
  window.__seq = 0;
  window.__last = null;
  if (!window.__hooks) {
    window.__hooks = true;
    const orig = window.fetch;
    window.fetch = async function (input, init) {
      // 固定种子，方便复现（前端写死 seed: 0，这里改成可复现的种子）
      try {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        if (window.__seed && url.includes('/api/new') && init && typeof init.body === 'string') {
          const payload = JSON.parse(init.body);
          payload.seed = window.__seed;
          init = { ...init, body: JSON.stringify(payload) };
        }
      } catch (e) { /* 保持原样 */ }
      const res = await orig.call(this, input, init);
      try {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        if (url.includes('/api/new') || url.includes('/api/action')) {
          res.clone().json().then(j => { if (j && j.sessionId) { window.__last = j; window.__seq++; } }).catch(() => {});
        }
      } catch (e) { /* 忽略 hook 自身异常 */ }
      return res;
    };
  }
  return true;
})()`);

await evaluate(String.raw`(() => {
  const D = window.__drv = window.__drv || {};
  D.sleep = ms => new Promise(r => setTimeout(r, ms));
  D.settle = async (seq0, ms = 6000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (window.__seq > seq0) { await D.sleep(220); return true; }
      await D.sleep(50);
    }
    await D.sleep(150);
    return false;
  };
  D.adj = g => {
    const m = new Map(g.nodes.map(n => [n.id, []]));
    for (const e of g.edges) { m.get(e.from)?.push(e.to); m.get(e.to)?.push(e.from); }
    return m;
  };
  D.dist = (g, target) => {
    const adj = D.adj(g), dist = new Map([[target, 0]]), q = [target];
    while (q.length) {
      const cur = q.shift();
      for (const nb of adj.get(cur) || []) if (!dist.has(nb)) { dist.set(nb, dist.get(cur) + 1); q.push(nb); }
    }
    return dist;
  };
  // 加权距离：绕开精英节点（1 级队伍硬闯「首领前厅」会团灭）；没密钥时首领节点不可通行
  D.cost = (n, allowBoss) => (!n ? 1 :
    n.type === 'elite' ? 8 :
    n.type === 'keyElite' ? 0 :
    n.type === 'boss' ? (allowBoss ? 0 : 999) :
    n.type === 'trap' ? 9 :
    n.type === 'combat' ? 1.6 :
    n.type === 'skirmish' ? 1.3 : 1);
  D.wdist = (g, target) => {
    const byId = new Map(g.nodes.map(n => [n.id, n]));
    const adj = D.adj(g), dist = new Map([[target, 0]]), pq = [[target, 0]];
    while (pq.length) {
      pq.sort((a, b) => a[1] - b[1]);
      const [cur, d] = pq.shift();
      if (d > (dist.get(cur) ?? Infinity)) continue;
      for (const nb of adj.get(cur) || []) {
        const nd = d + (nb === target ? 0 : D.cost(byId.get(nb), g.hasKey));
        if (nd < (dist.get(nb) ?? Infinity)) { dist.set(nb, nd); pq.push([nb, nd]); }
      }
    }
    return dist;
  };
  D.stepToward = (g, from, to) => {
    const adj = D.adj(g), dist = D.wdist(g, to);
    let best = null, bestD = Infinity;
    for (const nb of adj.get(from) || []) {
      const d = dist.has(nb) ? dist.get(nb) : Infinity;
      if (d < bestD) { bestD = d; best = nb; }
    }
    return best;
  };
  D.revealedStep = (g, from, to) => {
    const byId = new Map(g.nodes.map(n => [n.id, n]));
    const want = D.stepToward(g, from, to);
    if (want && byId.get(want)?.revealed) return want;
    const adj = D.adj(g), dist = D.wdist(g, to);
    let best = null, bestD = Infinity;
    for (const nb of adj.get(from) || []) {
      if (!byId.get(nb)?.revealed) continue;
      const d = dist.has(nb) ? dist.get(nb) : Infinity;
      if (d < bestD) { bestD = d; best = nb; }
    }
    return best;
  };
  D.hexDist = (a, b) => {
    const cube = (col, row) => { const x = col - (row - (row & 1)) / 2; const z = row; return [x, -x - z, z]; };
    const [ax, ay, az] = cube(a.col, a.row), [bx, by, bz] = cube(b.col, b.row);
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz));
  };

  // 装备评分：与规则层 bot 的 ItemPower 保持一致
  D.itemPower = i => {
    const rank = { '神话': 5, '传说': 4, '史诗': 3, '稀有': 2 }[i.rarity] || 1;
    const st = i.stats || {};
    const stats = (st.vit || 0) + (st.c || 0) + (st.h || 0) + (st.e || 0) + (st.spd || 0) + (st.l || 0);
    return rank * 1000 + (i.level || 0) * 80 + (i.price || 0) + (i.dice || 0) * 35 +
      (i.damagePerDie || 0) * 30 + (i.hp || 0) + (i.armor || 0) * 5 + (i.resistance || 0) * 5 +
      (i.evasion || 0) * 2 + (i.focus || 0) * 50 + (i.accuracyBonus || 0) * 2 +
      (i.damageBonus || 0) * 30 + (i.movement || 0) * 20 + stats * 3;
  };

  // 战利品自动换装：只走规则层已有的 equip 行动，不碰 UI 弹窗
  D.autoEquip = async () => {
    const g = window.__last;
    if (!g || !g.players) return 0;
    let equipped = 0;
    const slots = ['Weapon', 'Armor', 'Helmet', 'Trinket', 'Cyberware'];
    for (const p of g.players) {
      const inv = p.inventory || [];
      const eq = p.equipment || {};
      for (const slot of slots) {
        const cands = inv.filter(i => i.slot === slot);
        if (!cands.length) continue;
        cands.sort((a, b) => D.itemPower(b) - D.itemPower(a));
        const best = cands[0];
        const cur = eq[slot];
        if (cur && D.itemPower(best) <= D.itemPower(cur)) continue;
        try {
          const res = await fetch('/api/action', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId: g.sessionId, action: { type: 'equip', playerId: p.id, itemId: best.instanceId, slot } })
          });
          if (!res.ok) continue;
          const s = await res.json();
          if (s && s.sessionId) { window.__last = s; window.__seq++; equipped++; }
        } catch (e) { /* 换装失败不阻断流程 */ }
      }
    }
    return equipped;
  };
  // 安全屋强化：留足复活用的记忆币，只做稳赚的 +0 → +n
  D.autoUpgrade = async () => {
    let g = window.__last;
    if (!g || g.phase !== 'safehouse') return 0;
    let n = 0;
    for (const slot of ['Weapon', 'Armor', 'Helmet', 'Trinket', 'Cyberware']) {
      for (const p of g.players) {
        const item = (p.equipment || {})[slot];
        if (!item || item.level >= 5) continue;
        const costMemory = 35 + item.level * 30;
        const costAlloy = 1 + Math.floor(item.level / 3);
        if (g.memory - costMemory < 100 || g.alloy < costAlloy) continue;
        try {
          const res = await fetch('/api/action', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId: g.sessionId, action: { type: 'upgrade', playerId: p.id, slot } })
          });
          if (!res.ok) continue;
          const s = await res.json();
          if (s && s.sessionId) { window.__last = s; window.__seq++; g = s; n++; }
        } catch (e) { /* 强化失败不阻断 */ }
      }
    }
    return n;
  };

  D.info = () => {
    const g = window.__last || {};
    return {
      phase: g.phase, act: g.act, round: g.round, purge: g.purge, message: g.message,
      activeId: g.activePlayerId, hasKey: g.hasKey, hasModal: !!document.querySelector('[data-act="advance-act"]'),
      sessionId: g.sessionId,
      party: (g.players || []).length,
      partyNames: (g.players || []).map(p => p.name + (p.level ? ' Lv.' + p.level : ''))
    };
  };

  D.step = async () => {
    const g = window.__last;
    if (!g) return { kind: 'no-state' };
    const q = s => document.querySelector(s);
    const qa = s => Array.from(document.querySelectorAll(s));
    const click = el => { if (!el) return false; try { el.click(); return true; } catch (e) { return false; } };
    const seq0 = window.__seq;
    const after = async (label, extra = {}) => {
      const changed = await D.settle(seq0);
      const s = window.__last || g;
      return { kind: 'act', action: label, changed, phase: s.phase, act: s.act, round: s.round, purge: s.purge, ...extra };
    };

    // 0) 剧情卡：先点掉
    if (q('[data-act="story-continue"]')) {
      click(q('[data-act="story-continue"]'));
      return after('story-continue');
    }

    // 0.5) 支线卡：bot 不接支线，直接走开
    if (q('[data-act="quest-decline"]')) {
      click(q('[data-act="quest-decline"]'));
      return after('quest-decline');
    }

    // 1) 幕间弹窗：不自动点，交给 Node 截图后再点
    if (q('[data-act="advance-act"]')) {
      const modal = q('#modal-root');
      return {
        kind: 'intermission',
        act: g.act,
        actName: g.actName,
        nextActName: g.nextActName,
        nextActObjective: g.nextActObjective,
        modalText: (modal?.innerText || '').replace(/\s+/g, ' ').slice(0, 400)
      };
    }
    // 1.5) 高危节点确认弹窗（精英节点在低等级时会先弹确认）
    if (q('[data-act="danger-confirm"]')) {
      click(q('[data-act="danger-confirm"]'));
      return after('danger-confirm');
    }
    // 2) 结局
    if (g.phase === 'victory' || g.phase === 'defeat') {
      return { kind: g.phase, act: g.act, outcome: g.outcome };
    }

    // 3) 战斗
    if (g.phase === 'combat') {
      const c = g.combat;
      if (!c) return { kind: 'combat-missing' };
      if (c.isOver) {
        if (click(q('[data-act="close-combat"]'))) return after('close-combat', { result: c.result });
        return { kind: 'combat-over-stuck' };
      }
      const active = c.units.find(u => u.id === c.activeUnitId);
      if (!active) return { kind: 'combat-no-active' };
      if (active.side !== 'player') return { kind: 'combat-enemy-turn' };

      // 3D 战斗没有 DOM 单位标记（renderHexGrid 会 hidden）：从状态里挑最近的敌人，
      // 再派发 battle3d-pick —— 和真实点击走同一条链路。
      const pickOf = byAbsHp => {
        const c0 = g.combat;
        const a = c0.units.find(u => u.id === c0.activeUnitId);
        if (!a) return null;
        // 只从"当前技能真的能打到"的目标里挑（和玩家点得到的范围一致）
        const allowed = window.__agi ? window.__agi.targetable() : [];
        if (!allowed.length) return null;
        const list = c0.units.filter(u => u.side === 'enemy' && !u.downed && allowed.includes(u.id))
          .map(u => ({ u, d: D.hexDist(a, u) }))
          .sort((x, y) => x.d - y.d || (byAbsHp
            ? x.u.hp - y.u.hp
            : (x.u.hp / Math.max(1, x.u.maxHp)) - (y.u.hp / Math.max(1, y.u.maxHp))));
        return list.length ? list[0].u : null;
      };
      const hitBest = async (label, byAbsHp) => {
        const t = pickOf(byAbsHp);
        if (!t) return null;
        window.dispatchEvent(new CustomEvent('battle3d-pick', { detail: { kind: 'unit', unitId: t.id } }));
        return after(label, { unit: t.id, target: t.name + ' ' + t.hp + '/' + t.maxHp });
      };
      const autoDone = () => {
        const s = window.__last || g;
        return { kind: 'act', action: 'skill-auto', changed: true, phase: s.phase, act: s.act, round: s.round, purge: s.purge };
      };

      const allies = c.units.filter(u => u.side === 'player' && !u.downed);
      const wounded = allies
        .map(u => ({ u, r: u.hp / Math.max(1, u.maxHp) }))
        .filter(x => x.r < 0.5)
        .sort((a, b) => a.r - b.r)[0];

      // 已选中技能：直接打
      if (q('.skill-card.selected')) {
        const h = await hitBest('skill-attack', true);
        if (h) return h;
      }

      const cards = qa('.skill-card:not(.disabled)');
      const descOf = el => (el.querySelector('.sc-desc')?.textContent || '');
      const isHeal = el => /恢复|治疗|回复|再生|治愈|护盾/.test(descOf(el));

      // 有人半血以下：先尝试治疗
      if (wounded) {
        const healCard = cards.find(isHeal);
        if (healCard) {
          const seqS = window.__seq;
          click(healCard);
          await D.sleep(160);
          if (window.__seq > seqS) return autoDone();
          const allowed = window.__agi ? window.__agi.targetable() : [];
          const mates = c.units.filter(u => u.side === 'player' && !u.downed && allowed.includes(u.id))
            .sort((a, b) => (a.hp / Math.max(1, a.maxHp)) - (b.hp / Math.max(1, b.maxHp)));
          if (mates.length) {
            const t = mates[0];
            window.dispatchEvent(new CustomEvent('battle3d-pick', { detail: { kind: 'unit', unitId: t.id } }));
            return after('heal', { unit: t.id, target: t.name + ' ' + t.hp + '/' + t.maxHp });
          }
        }
      }

      // 伤害技能：优先骰子多 / 终极技（多目标时）
      const enemyCount = c.units.filter(u => u.side === 'enemy' && u.hp > 0).length;
      const rank = el => {
        const meta = el.querySelector('.sc-meta')?.textContent || '';
        const dice = Number((meta.match(/(\d+)D/) || [])[1] || 0);
        const ult = el.classList.contains('ultimate') ? 1 : 0;
        return dice * 10 + (ult && enemyCount >= 2 ? 8 : 0);
      };
      const pool = cards.filter(el => !isHeal(el)).sort((a, b) => rank(b) - rank(a));
      for (const card of pool.slice(0, 3)) {
        const seqS = window.__seq;
        click(card);
        await D.sleep(150);
        if (window.__seq > seqS) return autoDone();
        const h = await hitBest('skill-attack', true);
        if (h) return h;
      }

      // 退回基础攻击
      const basic = q('#btn-basic');
      if (basic && !basic.classList.contains('selected')) { click(basic); await D.sleep(140); }
      const hb = await hitBest('attack', true);
      if (hb) return hb;
      const reach = c.reachable || [];
      if (reach.length) {
        const enemies = c.units.filter(u => u.side === 'enemy' && !u.downed);
        let best = reach[0], bestD = Infinity;
        for (const h of reach) {
          for (const e of enemies) {
            const d = D.hexDist(h, e);
            if (d < bestD) { bestD = d; best = h; }
          }
        }
        if (best) {
          window.dispatchEvent(new CustomEvent('battle3d-pick', { detail: { kind: 'hex', col: best.col, row: best.row } }));
          return after('combat-move', { to: best.col + ',' + best.row, dist: bestD });
        }
      }
      // 残血又没有治疗手段：防御比硬吃一刀好
      const hpNow = active.hp / Math.max(1, active.maxHp);
      const defendBtn = q('#btn-defend');
      if (hpNow < 0.3 && defendBtn && !defendBtn.disabled) { click(defendBtn); return after('defend'); }
      const end = q('#btn-end-combat');
      if (end && !end.disabled) { click(end); return after('combat-end-turn'); }
      return { kind: 'combat-stuck' };
    }

    // 4) 事件
    if (g.phase === 'event') {
      const choices = qa('.choice-btn:not([disabled])');
      if (choices.length) { click(choices[0]); return after('event-choice'); }
      return { kind: 'event-no-choice', text: (q('#modal-root')?.innerText || '').slice(0, 200) };
    }
    if (g.phase === 'safehouse') {
      const who = g.players.find(x => x.id === g.activePlayerId);
      const restBtn = q('[data-act="rest"]');
      D.rests = D.rests || 0;
      if (restBtn && !restBtn.disabled && who && who.hp < who.maxHp * 0.9 && D.rests < 10) {
        D.rests++;
        click(restBtn);
        return after('safehouse-rest', { hp: who.hp + '/' + who.maxHp });
      }
      D.rests = 0;
      const up = await D.autoUpgrade();
      if (up > 0) {
        const s = window.__last;
        return { kind: 'act', action: 'safehouse-upgrade:' + up, changed: true, phase: s.phase, act: s.act, round: s.round, purge: s.purge };
      }
      if (click(q('[data-act="shop-close"]'))) return after('leave-safehouse');
      return { kind: 'safehouse-stuck' };
    }
    if (g.phase === 'shop') {
      if (click(q('[data-act="shop-close"]'))) return after('leave-shop');
      return { kind: 'shop-stuck' };
    }

    // 5) 探索
    if (g.phase === 'exploration') {
      // 战利品先换上，再继续走图（规则层 bot 也是这么做的）
      if (D.equipStamp !== (g.log || []).length) {
        D.equipStamp = (g.log || []).length;
        const n = await D.autoEquip();
        if (n > 0) {
          const s = window.__last || g;
          return { kind: 'act', action: 'auto-equip:' + n, changed: true, phase: s.phase, act: s.act, round: s.round, purge: s.purge };
        }
      }
      const p = g.players.find(x => x.id === g.activePlayerId);
      if (!p) return { kind: 'no-active-player' };
      if (p.downed) {
        if (click(q('[data-act="end-turn"]'))) return after('end-turn-downed');
        return { kind: 'downed-stuck' };
      }
      const byId = new Map(g.nodes.map(n => [n.id, n]));
      const cur = byId.get(p.nodeId);
      const nearestShard = () => {
        const list = g.nodes.filter(n => n.type === 'keyElite' && !n.cleared);
        if (!list.length) return null;
        const pd = D.wdist(g, p.nodeId);
        list.sort((a, b) => (pd.get(a.id) ?? 999) - (pd.get(b.id) ?? 999));
        return list[0];
      };
      const keyNode = nearestShard();
      const alive = g.players.filter(x => !x.downed);
      const avgLevel = alive.reduce((s, x) => s + (x.level || 1), 0) / Math.max(1, alive.length);
      D.fights = D.fights || 0;
      let goal;
      if (g.hasKey) goal = 'boss';
      else {
        // 低等级硬闯首领会团灭：先顺路清理普通战斗节点练级
        const farms = g.nodes.filter(n => (n.type === 'combat' || n.type === 'skirmish') && !n.cleared);
        const pd = D.wdist(g, p.nodeId);
        farms.sort((a, b) => (pd.get(a.id) ?? 99) - (pd.get(b.id) ?? 99));
        const canFarm = avgLevel < 2 + g.act && D.fights < 2 && farms.length > 0 && g.purge > 5;
        goal = canFarm ? farms[0].id : (keyNode ? keyNode.id : 'boss');
      }
      const distGoal = D.wdist(g, goal);
      const leader = alive.reduce((a, b) => ((distGoal.get(a.nodeId) ?? 99) <= (distGoal.get(b.nodeId) ?? 99) ? a : b));
      const rv = nid => !!byId.get(nid)?.revealed;

      D.wait = D.wait || 0;

      if (p.id !== leader.id) {
        D.wait = 0;
        if (p.ap > 0 && p.nodeId !== leader.nodeId) {
          const nb = D.revealedStep(g, p.nodeId, leader.nodeId);
          if (nb && rv(nb)) {
            const el = q('.map-node[data-node-id="' + nb + '"]');
            if (click(el)) return after('follow:' + nb);
          }
        }
        if (click(q('[data-act="end-turn"]'))) return after('end-turn-follower');
        return { kind: 'follower-stuck' };
      }

      const behind = alive.filter(x => x.id !== p.id && x.nodeId !== p.nodeId);
      if (behind.length) {
        D.wait = (D.wait || 0) + 1;
        if (D.wait < 5) {
          if (click(q('[data-act="end-turn"]'))) return after('leader-wait', { behind: behind.length });
          return { kind: 'wait-stuck' };
        }
        // 兜底：队伍卡了太久，允许队长单独推进
      }
      D.wait = 0;
      const diag = { at: cur?.id, atType: cur?.type, ap: p.ap, goal, hasKey: g.hasKey };

      const interest = ['event', 'combat', 'skirmish', 'elite', 'keyElite', 'terminal', 'treasure', 'server', 'corpse', 'boss'];
      const avgHp = alive.reduce((s, x) => s + x.hp / Math.max(1, x.maxHp), 0) / Math.max(1, alive.length);
      // 安全屋每次只能触发一次，否则会在同一个节点反复进出
      if (avgHp < 0.75 && D.safeAct !== g.act) interest.push('safehouse');
      const canInteract = p.ap > 0 && cur && !cur.cleared && interest.includes(cur.type) &&
        (cur.type !== 'boss' || g.hasKey);
      if (canInteract) {
        if (cur.type === 'safehouse') D.safeAct = g.act;
        if (['combat', 'skirmish', 'elite', 'keyElite', 'boss'].includes(cur.type)) D.fights = (D.fights || 0) + 1;
        if (click(q('.map-node[data-node-id="' + cur.id + '"]'))) return after('interact:' + cur.type, diag);
        return { kind: 'interact-stuck' };
      }

      if (p.ap > 0) {
        const nb = D.revealedStep(g, p.nodeId, goal);
        if (nb && rv(nb)) {
          const el = q('.map-node[data-node-id="' + nb + '"]');
          if (click(el)) {
            const r = await after('move:' + nb, diag);
            return { ...r, action: 'leader-move:' + nb };
          }
          return { kind: 'move-stuck', node: nb };
        }
      }
      if (click(q('[data-act="end-turn"]'))) return after('end-turn');
      return { kind: 'explore-stuck', node: cur?.id, type: cur?.type, ap: p.ap };
    }

    return { kind: 'unknown-phase', phase: g.phase };
  };

  D.confirmAdvance = async () => {
    const before = window.__last;
    const seq0 = window.__seq;
    const btn = document.querySelector('[data-act="advance-act"]');
    if (!btn) return { ok: false, reason: 'no-button' };
    btn.click();
    const changed = await D.settle(seq0, 8000);
    D.fights = 0; D.safeAct = null; D.rests = 0; D.wait = 0;
    const g = window.__last;
    const mapTitle = document.querySelector('#map-title')?.textContent
      || document.querySelector('.panel-title')?.textContent
      || (document.querySelector('#map-panel')?.innerText || '').split('\n')[0];
    return {
      ok: changed,
      changed,
      before: { act: before?.act, actName: before?.actName },
      after: { act: g?.act, actName: g?.actName, phase: g?.phase, purge: g?.purge, round: g?.round, nodeCount: (g?.nodes || []).length, hasKey: g?.hasKey },
      nodeNames: (g?.nodes || []).slice(0, 4).map(n => n.name),
      mapTitle,
      modalGone: !document.querySelector('[data-act="advance-act"]')
    };
  };
  return true;
})()`);

// ── 真实 UI：标题页 → 选角 → 创建 ───────────────────────────────────
const SEED = Number(process.env.SEED || 12345);
await evaluate(`window.__seed = ${SEED}`);
console.log('[seed]', SEED);
await evaluate(`document.querySelector('#btn-start').click()`);
await sleep(400);
// 逐张点击：每次点击后选角面板会重渲染，必须重新查询节点
const charIds = await evaluate(`Array.from(document.querySelectorAll('[data-act="select-char"]')).slice(0, ${PARTY}).map(c => c.dataset.charId)`);
for (const id of charIds) {
  await evaluate(`(document.querySelector('[data-act="select-char"][data-char-id="${id}"]') || {click(){}}).click()`);
  await sleep(200);
}
const selectedCount = await evaluate(`document.querySelectorAll('[data-act="select-char"][aria-pressed="true"]').length`);
console.log('[select]', charIds.length, 'clicked,', selectedCount, 'selected');
if (selectedCount !== Math.min(PARTY, charIds.length)) throw new Error('选角数量不符: ' + selectedCount);
const started = await evaluate(`(async () => {
  const btn = document.querySelector('#btn-create');
  if (!btn) return 'no-create-btn';
  btn.click();
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    if (window.__last && window.__last.phase) return 'ok';
    await new Promise(r => setTimeout(r, 100));
  }
  return 'timeout';
})()`, true);
console.log('[create]', started);
if (started !== 'ok') {
  await screenshot('create-failed');
  throw new Error('创建游戏失败: ' + started);
}
console.log('[state]', JSON.stringify(await evaluate('window.__drv.info()')));
// 先关掉开场剧情卡，再截地图
await evaluate(`document.querySelector('[data-act="story-continue"]')?.click()`);
await sleep(700);
const partyInfo = await evaluate('window.__drv.info()');
if (partyInfo.party !== PARTY) throw new Error(`队伍人数不符：期望 ${PARTY}，实际 ${partyInfo.party}`);
await screenshot('01-act1-map');

// ── 主循环 ───────────────────────────────────────────────────────────
let lastAct = 0, lastPhase = '', stall = 0, failures = [];
const intermissions = [];
const startedAt = Date.now();

for (let i = 0; i < MAX_STEPS; i++) {
  let r;
  try {
    r = await evaluate('window.__drv.step()', true);
  } catch (err) {
    failures.push('step error: ' + err.message);
    break;
  }

  if (process.env.VERBOSE) console.log(`[step ${i}]`, JSON.stringify(r));

  if (r.kind === 'intermission') {
    console.log(`\n[INTERLUDE] act ${r.act} 完成 → ${r.nextActName}`);
    console.log('  modal:', r.modalText.slice(0, 200));
    await screenshot(`0${r.act + 1}-interlude-act${r.act}`);

    // 幕间整备：强化 / 换装两个页签都要能打开、截图留档
    for (const tab of ['forge', 'gear']) {
      const opened = await evaluate(`(() => {
        const b = document.querySelector('[data-act="act-tab"][data-tab="${tab}"]');
        if (!b) return false;
        b.click();
        return true;
      })()`);
      if (!opened) { failures.push(`幕间缺少「${tab}」页签`); continue; }
      await sleep(650);
      await screenshot(`0${r.act + 1}-interlude-${tab}`);
    }
    // 上一轮循环停在「换装」页签，先切回「强化」才能找到升级按钮
    await evaluate(`document.querySelector('[data-act="act-tab"][data-tab="forge"]')?.click()`);
    await sleep(500);
    // 实测一次幕间强化：0.13.1 起幕间也能花记忆币/合金（后端 Upgrade 放开了 ActTransition）
    const memBefore = await evaluate('window.__agi?.state()?.memory ?? -1');
    const clicked = await evaluate(`(() => {
      const b = document.querySelector('.gear-upgrade-row button[data-act="upgrade"]:not([disabled])');
      if (!b) return false;
      b.click();
      return true;
    })()`);
    if (clicked) {
      await sleep(1600);
      const memAfter = await evaluate('window.__agi?.state()?.memory ?? -1');
      if (memAfter >= memBefore) failures.push(`幕间强化没有扣记忆币：${memBefore} → ${memAfter}`);
      else console.log(`  forge: 幕间强化成功，记忆币 ${memBefore} → ${memAfter}`);
    } else {
      console.log('  forge: 当前没有可强化的槽位（钱或合金不够），跳过');
    }
    await evaluate(`document.querySelector('[data-act="act-tab"][data-tab="info"]')?.click()`);
    await sleep(400);

    const v = await evaluate('window.__drv.confirmAdvance()', true);
    console.log('  advance:', JSON.stringify(v));
    intermissions.push({ from: r, to: v });
    await sleep(600);
    // 换幕后会紧跟着一张剧情卡：先留档，再点掉，然后截地图
    const nextCard = await evaluate(`(() => {
      const card = document.querySelector('#modal-root .story-card');
      if (!card) return null;
      return card.querySelector('.story-title')?.textContent || 'card';
    })()`);
    if (nextCard) {
      await screenshot(`0${r.act + 1}-act${r.act + 1}-story`);
      await evaluate(`document.querySelector('[data-act="story-continue"]')?.click()`);
      await sleep(700);
    }
    await screenshot(`0${r.act + 1}-act${r.act + 1}-map`);
    if (!v.ok || !v.changed) { failures.push('advance 未生效'); break; }
    if (v.after.act !== r.act + 1) { failures.push(`幕号未 +1：${r.act} → ${v.after.act}`); break; }
    if (v.after.phase !== 'exploration') { failures.push(`进入下一幕后 phase=${v.after.phase}`); break; }
    if (!v.modalGone) { failures.push('幕间弹窗未关闭'); break; }
    lastAct = v.after.act;
    continue;
  }

  if (r.kind === 'victory' || r.kind === 'defeat') {
    console.log(`\n[END] ${r.kind} act=${r.act}`);
    await screenshot(`09-${r.kind}`);
    console.log('  outcome:', (r.outcome || '').replace(/\s+/g, ' ').slice(0, 200));
    break;
  }

  if (r.act && r.act !== lastAct) {
    console.log(`[ACT] -> ${r.act} (round ${r.round}, purge ${r.purge})`);
    lastAct = r.act;
  }
  if (r.phase && r.phase !== lastPhase) {
    console.log(`[PHASE] ${r.phase} ${r.action ? '(' + r.action + ')' : ''}`);
    lastPhase = r.phase;
  }

  const productive = ['act'].includes(r.kind) && r.changed === true;
  stall = productive ? 0 : stall + 1;
  if (i % 25 === 0) {
    console.log(`[i=${i}] act=${r.act} phase=${r.phase} round=${r.round} purge=${r.purge} ${r.action || r.kind}${r.changed === false ? ' (no-change)' : ''}`);
  }
  if (stall > 25) {
    failures.push(`连续 ${stall} 步无状态变化，最后一步：${JSON.stringify(r).slice(0, 300)}`);
    await screenshot('stall');
    break;
  }
}

await sleep(300);
const finalInfo = await evaluate('window.__drv.info()');
console.log('\n===== RESULT =====');
console.log(JSON.stringify({
  party: PARTY,
  elapsedSec: Math.round((Date.now() - startedAt) / 1000),
  finalPhase: finalInfo.phase,
  finalAct: finalInfo.act,
  party: finalInfo.partyNames,
  intermissions: intermissions.map(x => ({ act: x.from.act, next: x.from.nextActName, ok: x.to.ok, actAfter: x.to.after?.act, phaseAfter: x.to.after?.phase, nodeNames: x.to.nodeNames })),
  consoleErrors,
  failures
}, null, 2));

ws.close();
browser.kill();
await sleep(1200);
try {
  const sid = finalInfo?.sessionId;
  if (sid) await fetch(`${APP}/api/session/${sid}`, { method: 'DELETE' });
} catch { /* 清理失败不影响结论 */ }
try {
  fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
} catch (err) {
  console.log('[cleanup] 临时浏览器配置目录未删除（不影响结论）:', profileDir);
}
process.exit(failures.length ? 1 : 0);
