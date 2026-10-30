// 本地版健壮性探测：输入边界 / 幂等 / 性能
const base = 'http://localhost:5178';
const post = async (p, b) => {
  const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
  return { status: r.status, data: await r.json() };
};
const get = async p => (await fetch(base + p)).json();

const g = (await post('/api/new', { characterIds: ['gpt'], seed: 12345 })).data;
const sid = g.sessionId;
const show = (label, r) => console.log(label.padEnd(26), r.status, '|', r.data?.error || r.data?.detail || '(ok)');

show('未知行为类型', await post('/api/action', { sessionId: sid, action: { type: 'bogus' } }));
show('空 action', await post('/api/action', { sessionId: sid, action: {} }));
show('不存在的行为角色', await post('/api/action', { sessionId: sid, action: { type: 'move', playerId: 'p9', nodeId: 'n10' } }));
show('非相邻移动', await post('/api/action', { sessionId: sid, action: { type: 'move', playerId: 'p1', nodeId: 'n174' } }));
show('越权交互（不在该节点）', await post('/api/action', { sessionId: sid, action: { type: 'interact', playerId: 'p1', nodeId: 'n140' } }));
show('不存在的会话', await post('/api/action', { sessionId: 'nope', action: { type: 'endTurn', playerId: 'p1' } }));
show('超长 sessionId', await post('/api/action', { sessionId: 'x'.repeat(4000), action: { type: 'endTurn' } }));
show('5 人开局', await post('/api/new', { characterIds: ['gpt', 'claude', 'gemini', 'wenxin', 'deepseek'], seed: 1 }));

const dup = await post('/api/new', { characterIds: ['gpt', 'gpt'], seed: 1 });
show('重复角色去重', dup);
console.log('  重复角色实际人数:', dup.data?.players?.length);

const r0 = (await get('/api/state?sessionId=' + sid)).round;
await post('/api/action', { sessionId: sid, action: { type: 'endTurn', playerId: 'p1' } });
await post('/api/action', { sessionId: sid, action: { type: 'endTurn', playerId: 'p1' } });
const r1 = (await get('/api/state?sessionId=' + sid)).round;
console.log('连发两次 endTurn：'.padEnd(26), `round ${r0} → ${r1}（无幂等键，重复提交会推进两轮）`);

const t0 = Date.now();
for (let i = 0; i < 12; i++) await post('/api/action', { sessionId: sid, action: { type: 'endTurn', playerId: 'p1' } });
console.log('12 次 endTurn 总耗时：'.padEnd(26), (Date.now() - t0) + ' ms');

await fetch(base + '/api/session/' + sid, { method: 'DELETE' });
await fetch(base + '/api/session/' + dup.data.sessionId, { method: 'DELETE' });
