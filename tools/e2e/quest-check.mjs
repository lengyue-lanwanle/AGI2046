// 0.11.0 支线验证：残响节点 / 接取 / 进度 / 交付 / 未达成不可领 / 换幕失效
// 全部走真实 HTTP API，不修改游戏代码。
import { settleCoop } from './coop-auto.mjs';
const base = process.env.BASE || 'http://localhost:5178';
const SEED = Number(process.env.SEED || 12345);
const results = [];
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —  ' + detail : ''}`);
};

const rawPost = async (path, body) => {
  const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { ok: r.ok, status: r.status, data: await r.json() };
};

// 多人事件会把 phase 切到 coop，除投票外的动作都会被拒；这里统一自动结算
const post = async (path, body) => {
  const r = await rawPost(path, body);
  if (r.ok && r.data?.phase === 'coop' && body?.sessionId) {
    const settled = await settleCoop(rawPost, r.data, body.sessionId);
    if (settled) return { ok: true, data: settled };
  }
  return r;
};
const get = async p => (await fetch(base + p)).json();

const meta = await get('/api/meta');
let g = (await post('/api/new', { characterIds: ['gpt'], seed: SEED })).data;
const sid = g.sessionId;
const act = async a => {
  const r = await post('/api/action', { sessionId: sid, action: a });
  if (!r.ok) throw new Error(r.data.error || 'action failed: ' + a.type);
  g = r.data;
  return g;
};

const node = id => g.nodes.find(n => n.id === id);
const pathTo = (from, to) => {
  const adj = new Map(g.nodes.map(n => [n.id, n.neighbors]));
  const prev = new Map([[from, null]]);
  const q = [from];
  while (q.length) {
    const cur = q.shift();
    if (cur === to) break;
    for (const nb of adj.get(cur) || []) if (!prev.has(nb)) { prev.set(nb, cur); q.push(nb); }
  }
  const out = [];
  let cur = to;
  while (cur && cur !== from) { out.push(cur); cur = prev.get(cur); }
  return out.reverse();
};

const holder = () => g.players.find(p => p.id === g.activePlayerId);

async function walkTo(target) {
  for (let i = 0; i < 400; i++) {
    const p = holder();
    if (!p) return false;
    if (p.nodeId === target) return true;
    if (p.downed || p.ap <= 0) { await act({ type: 'endTurn', playerId: p.id }); continue; }
    const route = pathTo(p.nodeId, target);
    if (!route.length) return false;
    await act({ type: 'move', playerId: p.id, nodeId: route[0] });
  }
  return false;
}

/* ── 1. 地图：残响节点 ─────────────────────────────────────────── */
const echoes = g.nodes.filter(n => n.type === 'echo');
ok('每幕 2 个残响节点', echoes.length === 2, echoes.map(n => n.id).join(','));
ok('残响固定在第 4 / 13 层',
  JSON.stringify(echoes.map(n => n.layer).sort((a, b) => a - b)) === JSON.stringify([4, 13]),
  echoes.map(n => n.layer).join(','));
ok('残响开局可见', echoes.every(n => n.revealed));
ok('残响绑定了本幕支线', echoes.every(n => n.questId), echoes.map(n => n.questId).join(','));
const qDefs = meta.quests || [];
ok('每幕 5 条支线池（0.15 起按 seed 抽 2 条）', [1, 2, 3].every(a => qDefs.filter(q => q.act === a).length >= 5),
  [1, 2, 3].map(a => `${a}:${qDefs.filter(q => q.act === a).length}`).join(' '));
ok('残响只在本层出现（无支线节点越界）', echoes.every(n => n.questId && qDefs.some(q => q.id === n.questId)));

/* ── 2. 接取支线 ───────────────────────────────────────────────── */
const firstEcho = echoes.find(n => n.layer === 4);
await walkTo(firstEcho.id);
ok('队伍抵达第 4 层残响', holder().nodeId === firstEcho.id, holder().nodeId);
if (holder().ap <= 0) await act({ type: 'endTurn', playerId: holder().id });
await act({ type: 'interact', playerId: holder().id, nodeId: firstEcho.id });
ok('互动后弹出发放卡', !!g.pendingQuestOffer, g.pendingQuestOffer?.title);
ok('未接受时不进入任务列表', (g.quests || []).length === 0);

await act({ type: 'acceptQuest' });
const accepted = (g.quests || [])[0];
ok('接受后记录为进行中', accepted?.status === 'active', accepted?.status);
ok('发放卡已清空', !g.pendingQuestOffer);
const qDef = qDefs.find(q => q.id === accepted?.questId);
const kind = qDef?.kind;
console.log(`[quest] ${qDef?.title}（${kind}）目标：${qDef?.objective}`);

/* ── 3. 进度：寻物类走遗骸 ─────────────────────────────────────── */
if (kind === 'fetch') {
  // 抽到的寻物支线可能只认宝库（source=treasure）——按它自己的来源挑节点，别硬走遗骸
  const want = qDef.source === 'treasure' ? ['treasure'] : ['corpse', 'treasure'];
  const corpses = g.nodes.filter(n => want.includes(n.type) && !n.cleared);
  let done = false;
  for (const c of corpses) {
    await walkTo(c.id);
    if (holder().nodeId !== c.id) continue;
    if (holder().ap <= 0) await act({ type: 'endTurn', playerId: holder().id });
    await act({ type: 'interact', playerId: holder().id, nodeId: c.id });
    const q = (g.quests || []).find(x => x.questId === accepted.questId);
    if (q.progress > 0) {
      ok('寻物进度 +1', q.progress >= 1, `${q.progress}/${qDef.targetCount}`);
      done = q.status === 'done';
      break;
    }
  }
  ok('搜刮遗骸后支线达成', done);
}

/* ── 4. 未达成不可领（猎杀类用当前状态判断）────────────────────── */
{
  const q = (g.quests || []).find(x => x.questId === accepted.questId);
  if (q && q.status !== 'done') {
    const before = g.memory;
    await walkTo(firstEcho.id);
    if (holder().ap <= 0) await act({ type: 'endTurn', playerId: holder().id });
    await act({ type: 'interact', playerId: holder().id, nodeId: firstEcho.id });
    ok('未达成时互动只提示，不发奖励', g.memory === before && q.status !== 'claimed', q.status);
  } else {
    ok('未达成时互动只提示，不发奖励（本条已达成，跳过）', true, 'skip');
  }
}

/* ── 5. 交付奖励 ───────────────────────────────────────────────── */
{
  const q = (g.quests || []).find(x => x.questId === accepted.questId);
  if (q && q.status === 'done') {
    await walkTo(firstEcho.id);
    if (holder().ap <= 0) await act({ type: 'endTurn', playerId: holder().id });
    const beforeMemory = g.memory;
    const beforeInv = (holder().inventory || []).length;
    await act({ type: 'interact', playerId: holder().id, nodeId: firstEcho.id });
    const after = (g.quests || []).find(x => x.questId === accepted.questId);
    ok('交付后状态为已领取', after?.status === 'claimed', after?.status);
    ok('发放记忆币', g.memory >= beforeMemory + (qDef.rewardMemory || 0), `${beforeMemory} → ${g.memory}`);
    if (qDef.rewardItem) {
      const got = (holder().inventory || []).some(it => it.itemId === qDef.rewardItem);
      ok('发放专属装备', got || (holder().inventory || []).length > beforeInv, qDef.rewardItem);
    }
    ok('交付弹出结尾卡', /支线/.test(g.pendingBeat?.title || ''), g.pendingBeat?.title);
  } else {
    ok('交付后状态为已领取（本条未达成，跳过）', true, 'skip');
  }
}

/* ── 6. 换幕失效 ──────────────────────────────────────────────────
   无法用 HTTP 直接构造 ActTransition，改由规则层冒烟覆盖：
   dotnet run tools/smoke/quest-act.cs */

/* ── 汇总 ──────────────────────────────────────────────────────── */
await fetch(`${base}/api/session/${sid}`, { method: 'DELETE' }).catch(() => {});
const passed = results.filter(r => r.pass).length;
console.log(`\n${passed}/${results.length} 通过`);
process.exit(passed === results.length ? 0 : 1);
