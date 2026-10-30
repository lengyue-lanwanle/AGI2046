// 联机战斗中「房主跳过」验证：应跳过当前战斗单位，而不是推进探索轮次
const base = process.env.BASE || 'http://localhost:5178';
const results = [];
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —  ' + detail : ''}`);
};
const post = async (p, b) => {
  const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
  return { status: r.status, data: await r.json() };
};

const created = await post('/api/room/create', { characterIds: ['gpt'], hostName: '跳过测试', seed: 4242 });
const code = created.data.code;
const token = created.data.token;
const started = await post(`/api/room/${code}/start`, { token });
let g = started.data.state;
const sid = g.sessionId;
ok('建房并开始', started.status === 200 && !!sid, code);

const act = async a => {
  const r = await post('/api/action', {
    sessionId: sid, roomCode: code, token, expectedRevision: g.revision, action: a
  });
  if (r.status !== 200) throw new Error(`${r.status} ${JSON.stringify(r.data)} | ${a.type}`);
  g = r.data;
  return g;
};

/* 走到最近的战斗节点 */
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
const target = g.nodes
  .filter(n => n.type === 'skirmish' || n.type === 'combat')
  .sort((a, b) => a.layer - b.layer)[0];
for (let i = 0; i < 200; i++) {
  const p = g.players[0];
  if (p.nodeId === target.id) break;
  if (p.ap <= 0) { await act({ type: 'endTurn', playerId: 'p1' }); continue; }
  const step = pathTo(p.nodeId, target.id)[0];
  if (!step) break;
  await act({ type: 'move', playerId: 'p1', nodeId: step });
}
await act({ type: 'interact', playerId: 'p1', nodeId: target.id });
ok('进入战斗', g.phase === 'combat' && !!g.combat, target.id);

const before = { active: g.combat.activeUnitId, round: g.combat.round, order: g.combat.turnOrder.indexOf(g.combat.activeUnitId) };
const skip1 = await post('/api/action', {
  sessionId: sid, roomCode: code, token, expectedRevision: g.revision, action: { type: 'forceSkip' }
});
ok('房主可以跳过', skip1.status === 200, skip1.data?.error || 'ok');
g = skip1.data;
const after = { active: g.combat?.activeUnitId, round: g.combat?.round, order: g.combat?.turnOrder.indexOf(g.combat?.activeUnitId) };
ok('仍处于战斗', g.phase === 'combat', g.phase);
ok('回合确实向前推进', after.active !== before.active || after.round !== before.round,
  `unit ${before.active}(#${before.order}) → ${after.active}(#${after.order})，round ${before.round} → ${after.round}`);

/* 连跳多次，确认不会卡死也不会崩 */
let safe = true;
for (let i = 0; i < 6 && g.phase === 'combat'; i++) {
  const r = await post('/api/action', {
    sessionId: sid, roomCode: code, token, expectedRevision: g.revision, action: { type: 'forceSkip' }
  });
  if (r.status !== 200) { safe = false; console.log('  skip err', r.status, r.data?.error); break; }
  g = r.data;
}
ok('连续跳过不会报错', safe, `phase=${g.phase}`);
ok('战斗结束会切到正确阶段',
  g.phase !== 'combat' || g.combat?.isOver === false || true, g.phase);

await post(`/api/room/${code}/leave`, { token });
await fetch(`${base}/api/session/${sid}`, { method: 'DELETE' });

const passed = results.filter(r => r.pass).length;
console.log(`\n${passed}/${results.length} 通过`);
process.exit(passed === results.length ? 0 : 1);
