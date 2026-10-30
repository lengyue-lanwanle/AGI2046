// 造一局带群体技角色的战斗（疾风 mistral_2 / qwen_2 都是 TargetType.AllEnemies）
//   node tools/smoke/aoe-prepare.mjs
// 输出 sessionId 到 tools/smoke/.aoe-sid，供 tools/e2e/aoe-ui.mjs 用真实存档验证
import fs from 'node:fs';
import path from 'node:path';

const base = process.env.APP_URL || 'http://localhost:5178';
const SID_FILE = path.resolve('tools/smoke/.aoe-sid');
const CHARS = (process.env.CHARS || 'mistral,qwen').split(',');

const post = async (p, b) => {
  const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
  return { status: r.status, data: await r.json() };
};

let g = (await post('/api/new', { characterIds: CHARS, seed: Number(process.env.SEED || 8071) })).data;
if (!g?.sessionId) { console.error('建局失败', g); process.exit(1); }
const sid = g.sessionId;

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

// 优先普通战斗节点（2 人队 = 2 个敌人），这样群体技有多目标可验证；
// 找不到才退回小型战斗（1 个敌人，只能验证单目标路径）。
const target = g.nodes.find(n => n.type === 'combat' && n.layer <= 4)
  || g.nodes.find(n => (n.type === 'combat' || n.type === 'skirmish') && n.layer <= 4);
console.log('[prepare] target', target.id, target.type);

for (let i = 0; i < 260; i++) {
  const p = g.players.find(x => x.id === g.activePlayerId);
  if (p.nodeId === target.id) break;
  if (p.ap <= 0) { g = (await post('/api/action', { sessionId: sid, action: { type: 'endTurn', playerId: p.id } })).data; continue; }
  const step = pathTo(p.nodeId, target.id)[0];
  g = (await post('/api/action', { sessionId: sid, action: { type: 'move', playerId: p.id, nodeId: step } })).data;
}
while (g.activePlayerId !== 'p1' || g.players[0].ap <= 0) {
  g = (await post('/api/action', { sessionId: sid, action: { type: 'endTurn', playerId: g.activePlayerId } })).data;
}
g = (await post('/api/action', { sessionId: sid, action: { type: 'interact', playerId: 'p1', nodeId: target.id } })).data;

console.log('[prepare] phase', g.phase, '| combat', !!g.combat, '| round', g.combat?.round,
  '| units', g.combat?.units?.length, '| active', g.combat?.activeUnitId);
const me = g.combat?.units?.find(u => u.side === 'player' && u.isActive);
console.log('[prepare] 主动单位', me?.name, me?.skillIds, '| 敌方', g.combat?.units?.filter(u => u.side === 'enemy').map(u => `${u.name}@${u.col},${u.row}`).join(' '));

fs.writeFileSync(SID_FILE, sid);
console.log('[prepare] sessionId', sid);
