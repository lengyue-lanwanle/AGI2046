// 战斗中途重启服务端的恢复探测
//   node tools/smoke/battle-resume.mjs prepare   → 建局、走到战斗节点、进入战斗、记录 sessionId
//   node tools/smoke/battle-resume.mjs verify    → 重启后读取状态并继续推进一个战斗动作
import fs from 'node:fs';
import path from 'node:path';

const base = 'http://localhost:5178';
const SID_FILE = path.resolve('tools/smoke/.battle-sid');
const phase = process.argv[2] || 'prepare';

const post = async (p, b) => {
  const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
  return { status: r.status, data: await r.json() };
};
const get = async p => (await fetch(base + p)).json();

if (phase === 'prepare') {
  let g = (await post('/api/new', { characterIds: ['gpt', 'claude'], seed: 12345 })).data;
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
  const target = g.nodes.find(n => (n.type === 'combat' || n.type === 'skirmish') && n.layer <= 3);

  for (let i = 0; i < 200; i++) {
    const p = g.players.find(x => x.id === g.activePlayerId);
    if (p.nodeId === target.id) break;
    if (p.ap <= 0) { g = (await post('/api/action', { sessionId: sid, action: { type: 'endTurn', playerId: p.id } })).data; continue; }
    const step = pathTo(p.nodeId, target.id)[0];
    g = (await post('/api/action', { sessionId: sid, action: { type: 'move', playerId: p.id, nodeId: step } })).data;
  }
  while (g.activePlayerId !== 'p1' || g.players[0].ap <= 0)
    g = (await post('/api/action', { sessionId: sid, action: { type: 'endTurn', playerId: g.activePlayerId } })).data;

  g = (await post('/api/action', { sessionId: sid, action: { type: 'interact', playerId: 'p1', nodeId: target.id } })).data;
  console.log('[prepare] target', target.id, target.type, '| phase', g.phase, '| combat', !!g.combat,
    '| round', g.combat?.round, '| units', g.combat?.units?.length, '| activeUnit', g.combat?.activeUnitId);
  fs.writeFileSync(SID_FILE, sid);
  console.log('[prepare] sessionId', sid);
} else {
  const sid = fs.readFileSync(SID_FILE, 'utf8').trim();
  const state = await get('/api/state?sessionId=' + sid + '&_=' + Date.now());
  console.log('[verify] phase', state.phase, '| combat', !!state.combat,
    '| round', state.combat?.round, '| units', state.combat?.units?.length,
    '| activeUnit', state.combat?.activeUnitId, '| turnOrder', (state.combat?.turnOrder || []).length,
    '| reachable', JSON.stringify(state.combat?.units?.find(u => u.isActive)?.reachable?.length ?? null));
  const u = state.combat?.units?.find(x => x.id === state.combat?.activeUnitId);
  console.log('[verify] 当前单位', u?.id, 'side', u?.side, 'hp', u?.hp, '/', u?.maxHp);
  const r = await post('/api/action', { sessionId: sid, action: { type: 'combatEndTurn', playerId: u?.playerId } });
  console.log('[verify] 继续一个战斗动作:', r.status, r.data?.error || ('phase=' + r.data.phase + ' active=' + (r.data.combat?.activeUnitId)));
  await fetch(base + '/api/session/' + sid, { method: 'DELETE' });
  fs.unlinkSync(SID_FILE);
}
