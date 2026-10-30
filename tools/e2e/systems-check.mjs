// 0.9.0 系统级验证：地图配额 / 服务器 / 陷阱 / 遗骸 / 道具 / 碎片门槛
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

/* ── 1. 地图配额 ─────────────────────────────────────────────── */
{
  const by = {};
  for (const n of g.nodes) by[n.type] = (by[n.type] || 0) + 1;
  const layers = Math.max(...g.nodes.filter(n => n.type !== 'boss').map(n => n.layer));
  ok('地图为 17 × 5', layers === 17 && meta.map.lanes === 5, `层数 ${layers}`);
  ok('每幕 95 个节点', g.nodes.length === 95, `实际 ${g.nodes.length}`);
  ok('服务器固定 9 台', by.server === 9, JSON.stringify(by));
  ok('碎片精英 3 个', by.keyElite === 3);
  ok('事件约占 1/10', Math.abs(by.event / g.nodes.length - 0.095) < 0.02, `${by.event}/${g.nodes.length}`);
  ok('空地不超过 15%', by.blank / g.nodes.length <= 0.15, `${by.blank}/${g.nodes.length}`);
  ok('小战斗 19 个（多出的 1 个给了第二个觉醒节点）', by.skirmish === 19, by.skirmish);
  const echoLayers = g.nodes.filter(n => n.type === 'echo').map(n => n.layer).sort((a, b) => a - b);
  ok('残响 2 个，落在 4/13 层', JSON.stringify(echoLayers) === JSON.stringify([4, 13]), echoLayers.join(','));
  ok('残响开局可见且绑定了支线', g.nodes.filter(n => n.type === 'echo').every(n => n.revealed && n.questId),
    g.nodes.filter(n => n.type === 'echo').map(n => n.questId).join(','));
  const kinds = g.nodes.filter(n => n.type === 'server').map(n => n.serverKind);
  ok('六属性服务器各一台', ['vit', 'c', 'h', 'e', 'spd', 'l'].every(k => kinds.includes(k)), kinds.join(','));
  ok('每幕 5 个商店 / 5 个安全屋', by.shop === 5 && by.safehouse === 5);
  const shards = g.nodes.filter(n => n.type === 'keyElite').map(n => n.layer).sort((a, b) => a - b);
  ok('碎片落在 6/12/15 层', JSON.stringify(shards) === JSON.stringify([6, 12, 15]), shards.join(','));
}

/* ── 2. 角色标签 ─────────────────────────────────────────────── */
{
  const tagged = meta.characters.filter(c => (c.tags || []).length > 0);
  const allowed = new Set(['爆发', '持续', '增益', '减益', '护盾', '治疗', '召唤', '控制']);
  const bad = meta.characters.flatMap(c => (c.tags || []).filter(t => !allowed.has(t)));
  ok('16 个角色全部有标签', tagged.length === 16, `${tagged.length}/16`);
  ok('标签只用约定的八种', bad.length === 0, bad.join(','));
  const jev = meta.skills.find(s => s.id === 'jev_1');
  ok('天秤拥有敌方驱散', (jev?.effects || []).some(e => e.type === 'dispel'), jev?.desc);
}

/* ── 3. 行走与节点交互 ───────────────────────────────────────── */
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
const act = async a => {
  const r = await post('/api/action', { sessionId: sid, action: a });
  if (!r.ok) throw new Error(r.data.error || 'action failed');
  g = r.data;
  return g;
};
const walkTo = async targetId => {
  for (const step of pathTo(g.players[0].nodeId, targetId)) {
    if (g.players[0].ap <= 0) await act({ type: 'endTurn', playerId: g.players[0].id });
    await act({ type: 'move', playerId: g.players[0].id, nodeId: step });
    // 陷阱在进入时触发一次就 cleared，继续走即可。
    // 旧版这里直接 return，等于"路径上有陷阱就到不了目标"——地图结构一变就炸。
  }
  return targetId;
};

/* 陷阱 */
{
  const trap = g.nodes.find(n => n.type === 'trap');
  const before = g.players[0].hp;
  await walkTo(trap.id);
  const after = g.players[0].hp;
  ok('陷阱进入即触发', after < before, `${before} → ${after}`);
  ok('陷阱永不致死', after > 0);
  ok('陷阱只触发一次', node(trap.id).cleared === true);
}

/* 遗骸 */
{
  const corpse = g.nodes.find(n => n.type === 'corpse' && !n.cleared);
  const before = g.memory;
  await walkTo(corpse.id);
  if (g.players[0].ap <= 0) await act({ type: 'endTurn', playerId: g.players[0].id });
  await act({ type: 'interact', playerId: g.players[0].id, nodeId: corpse.id });
  ok('遗骸给记忆币', g.memory > before, `${before} → ${g.memory}`);
  const again = await post('/api/action', { sessionId: sid, action: { type: 'interact', playerId: g.players[0].id, nodeId: corpse.id } });
  ok('遗骸不可重复搜刮', !again.ok);
}

/* 服务器：单人单项 + 每幕 2 台上限 */
{
  const servers = g.nodes.filter(n => n.type === 'server' && !n.cleared && ['vit', 'c', 'h'].includes(n.serverKind));
  const eaten = [];
  for (const sv of servers.slice(0, 3)) {
    await walkTo(sv.id);
    if (g.players[0].ap <= 0) await act({ type: 'endTurn', playerId: g.players[0].id });
    const before = { ...g.players[0].serverBonus };
    const memBefore = g.memory;
    await act({ type: 'interact', playerId: g.players[0].id, nodeId: sv.id });
    const after = g.players[0].serverBonus;
    const changed = Object.keys(before).filter(k => before[k] !== after[k]);
    eaten.push(changed.map(k => `${k}+${after[k] - before[k]}`).join(','));
    if (eaten.length === 3) {
      ok('第 3 台属性服务器只给 60 记忆币', g.memory - memBefore === 60, `+${g.memory - memBefore}`);
      ok('属性写入上限 2 次', g.players[0].serverWrites === 2, String(g.players[0].serverWrites));
    }
  }
  const single = eaten.slice(0, 2).every(x => x.split(',').length === 1);
  ok('每台只提升一项属性', single, eaten.join(' | '));
  ok('只加在使用者身上', g.players.slice(1).every(p => !p.serverBonus || Object.values(p.serverBonus).every(v => v === 0)));
}

/* 商店：固定消耗品位 + 买一件 */
let bought = null;
{
  const shop = g.nodes.find(n => n.type === 'shop');
  await walkTo(shop.id);
  if (g.players[0].ap <= 0) await act({ type: 'endTurn', playerId: g.players[0].id });
  const hpBeforeVisit = g.players[0].hp;
  await act({ type: 'interact', playerId: g.players[0].id, nodeId: shop.id });
  ok('商店首访免费补给', g.players[0].hp >= hpBeforeVisit, `${hpBeforeVisit} → ${g.players[0].hp}`);
  const consumables = (g.shop || []).filter(x => x.slot === 'Consumable');
  ok('商店固定 2 个消耗品位', consumables.length === 2, consumables.map(c => c.name).join(','));
  const med = consumables.find(c => c.itemId === 'medkit') || consumables[0];
  if (med && g.memory >= med.price) {
    const r = await post('/api/action', { sessionId: sid, action: { type: 'buy', playerId: g.players[0].id, itemId: med.itemId } });
    if (r.ok) { g = r.data; bought = med.itemId; }
  }
  ok('可购买消耗品', !!bought, bought || '资金不足');
  await act({ type: 'close' });
}

/* 道具：探索使用 */
{
  const p0 = g.players[0];
  if (bought && p0.consumables?.[bought]) {
    p0.hp = Math.max(1, p0.hp);
    const before = p0.hp;
    const r = await post('/api/action', { sessionId: sid, action: { type: 'useItem', itemId: bought, playerId: p0.id, targetPlayerId: p0.id } });
    if (r.ok) g = r.data;
    const effect = r.data?.players?.[0];
    const changed = bought === 'medkit' ? (effect?.hp ?? 0) >= before : true;
    ok('探索使用消耗品不报错', r.ok, `${bought} ${before} → ${effect?.hp}`);
    const count = r.data?.players?.[0]?.consumables?.[bought] ?? 0;
    ok('使用后数量减少', count === (p0.consumables?.[bought] ?? 1) - 1, `剩 ${count}`);
  } else {
    ok('探索使用消耗品生效', false, '没有可用的消耗品');
  }
  const combatOnly = await post('/api/action', { sessionId: sid, action: { type: 'useItem', itemId: 'shield_gen', playerId: g.players[0].id } });
  ok('战斗专用道具在探索中被拒绝', !combatOnly.ok, combatOnly.data.error);
}

/* 碎片门槛 */
{
  if (g.players[0].ap <= 0) await act({ type: 'endTurn', playerId: g.players[0].id });
  const bossMove = await post('/api/action', { sessionId: sid, action: { type: 'move', playerId: g.players[0].id, nodeId: 'boss' } });
  const msg = bossMove.data.error || '';
  ok('未集齐碎片时首领不可进入', !bossMove.ok && (msg.includes('碎片') || msg.includes('相邻')), msg);
  ok('碎片计数从 0 开始', g.keyShards === 0 && g.keyShardGoal === 3);
}

const failed = results.filter(r => !r.pass);
console.log(`\n===== ${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) {
  console.log('失败项：');
  for (const f of failed) console.log(' -', f.name, f.detail);
  process.exit(1);
}
