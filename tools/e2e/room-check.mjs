// 联机房间 API 验证：建房 / 各自加入 / 各自选角色 / 越权 / 轮询 / 房主跳过
const base = process.env.BASE || 'http://localhost:5178';
const results = [];
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —  ' + detail : ''}`);
};
const post = async (p, b) => {
  const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
  let data = null;
  try { data = await r.json(); } catch { /* 204 */ }
  return { status: r.status, data };
};
const get = async p => {
  const r = await fetch(base + p);
  let data = null;
  try { data = await r.json(); } catch { /* 204 */ }
  return { status: r.status, data };
};

/* 1. 建房：不带角色 */
const created = await post('/api/room/create', { hostName: '房主', seed: 12345 });
ok('创建房间', created.status === 200, created.data?.code);
const code = created.data.code;
const hostToken = created.data.token;
ok('房间码 6 位大写', /^[A-Z0-9]{6}$/.test(code || ''), code);
ok('房主已入座但还没选角色', created.data.room.seats[0].occupied && !created.data.room.seats[0].ready);
ok('开局条件未满足', created.data.room.allReady === false);

/* 2. 别人加入 */
const joined = await post(`/api/room/${code}/join`, { name: '二号' });
ok('第二人加入', joined.status === 200 && !!joined.data.token, joined.data?.playerId);
ok('服务端分配座位 p2', joined.data.playerId === 'p2', joined.data.playerId);
const p2Token = joined.data.token;

/* 3. 各自选角色 */
const hostPick = await post(`/api/room/${code}/character`, { token: hostToken, characterId: 'gpt' });
ok('房主自己选角色', hostPick.status === 200 && hostPick.data.room.seats.some(s => s.characterId === 'gpt'));
const guestPick = await post(`/api/room/${code}/character`, { token: p2Token, characterId: 'claude' });
ok('客人自己选角色', guestPick.status === 200, guestPick.data?.room?.seats?.map(s => s.characterId).join(','));
ok('两人都选好后可开局', guestPick.data.room.allReady === true);

const dup = await post(`/api/room/${code}/character`, { token: p2Token, characterId: 'gpt' });
ok('不能抢别人已选的角色', dup.status === 409, dup.data?.error);

const badChar = await post(`/api/room/${code}/character`, { token: p2Token, characterId: 'nobody' });
ok('不存在的角色被拒绝', badChar.status === 400);

/* 4. 第三人加入但不选角色 → 不能开局；房主踢出后恢复 */
const third = await post(`/api/room/${code}/join`, { name: '三号' });
const p3Token = third.data.token;
const p3Id = third.data.playerId;
const blocked = await post(`/api/room/${code}/start`, { token: hostToken });
ok('有人没选角色时不能开局', blocked.status === 400, blocked.data?.error);

const badKick = await post(`/api/room/${code}/kick`, { token: p2Token, playerId: p3Id });
ok('非房主不能踢人', badKick.status === 403, badKick.data?.error);
const selfKick = await post(`/api/room/${code}/kick`, { token: hostToken, playerId: 'p1' });
ok('房主不能踢自己', selfKick.status === 400);
const kicked = await post(`/api/room/${code}/kick`, { token: hostToken, playerId: p3Id });
ok('房主踢出玩家', kicked.status === 200, kicked.data?.kicked);
ok('踢出后位置空出来', kicked.data.room.seats.find(s => s.playerId === p3Id)?.occupied === false);
ok('踢出后回到可开局', kicked.data.room.allReady === true);
const ghost = await get(`/api/room/${code}/state?token=${p3Token}`);
ok('被踢的人再来是 403', ghost.status === 403, ghost.data?.error);

/* 5. 开始 */
const badStart = await post(`/api/room/${code}/start`, { token: p2Token });
ok('非房主不能开始', badStart.status === 403, badStart.data?.error);

const started = await post(`/api/room/${code}/start`, { token: hostToken });
ok('房主开始对局', started.status === 200 && !!started.data?.state, started.data?.state?.sessionId);
const sid = started.data.state.sessionId;
ok('开局角色就是各自选的', started.data.state.players.map(p => p.characterId).join(',') === 'gpt,claude',
  started.data.state.players.map(p => p.characterId).join(','));
ok('房主拿到 p1', started.data.myPlayerId === 'p1', started.data.myPlayerId);
ok('开局后房间进入 playing', started.data.room.phase === 'playing');

/* 6. 行动权 */
const move1 = await post('/api/action', {
  sessionId: sid, roomCode: code, token: hostToken, expectedRevision: 0,
  action: { type: 'move', playerId: 'p1', nodeId: 'n10' }
});
ok('房主操作自己的角色', move1.status === 200 && move1.data.players[0].nodeId === 'n10', move1.data?.message);
const rev1 = move1.data?.revision;

const cross = await post('/api/action', {
  sessionId: sid, roomCode: code, token: p2Token,
  action: { type: 'move', playerId: 'p1', nodeId: 'n11' }
});
ok('不能操作别人的角色', cross.status === 403, cross.data?.error);

const notMyTurn = await post('/api/action', {
  sessionId: sid, roomCode: code, token: p2Token,
  action: { type: 'move', playerId: 'p2', nodeId: 'n10' }
});
ok('没轮到自己不能动', notMyTurn.status === 400, notMyTurn.data?.error);

const stale = await post('/api/action', {
  sessionId: sid, roomCode: code, token: hostToken, expectedRevision: 0,
  action: { type: 'endTurn', playerId: 'p1' }
});
ok('过期修订号返回 409', stale.status === 409, stale.data?.error);

/* 7. 轮询 */
const poll = await get(`/api/room/${code}/state?token=${p2Token}&since=${rev1}`);
ok('状态未变时返回 204', poll.status === 204, String(poll.status));
const poll2 = await get(`/api/room/${code}/state?token=${p2Token}`);
ok('首次拉取返回状态与自己的 playerId', poll2.status === 200 && poll2.data.myPlayerId === 'p2', poll2.data?.myPlayerId);

/* 8. 房主跳过 */
const badSkip = await post('/api/action', {
  sessionId: sid, roomCode: code, token: p2Token, action: { type: 'forceSkip' }
});
ok('非房主不能跳过回合', badSkip.status === 403, badSkip.data?.error);

const skip = await post('/api/action', {
  sessionId: sid, roomCode: code, token: hostToken, action: { type: 'forceSkip' }
});
ok('房主跳过回合', skip.status === 200 && skip.data.activePlayerId === 'p2', skip.data?.activePlayerId);

const p2Now = await post('/api/action', {
  sessionId: sid, roomCode: code, token: p2Token,
  action: { type: 'move', playerId: 'p2', nodeId: 'n10' }
});
ok('轮到 p2 后可以行动', p2Now.status === 200 && p2Now.data.players[1].nodeId === 'n10', p2Now.data?.message);

/* 9. 非成员 */
const outsider = await post('/api/action', {
  sessionId: sid, roomCode: code, token: 'fake-token',
  action: { type: 'endTurn', playerId: 'p1' }
});
ok('伪造 token 被拒绝', outsider.status === 403, outsider.data?.error);

/* 10. 清理 */
await post(`/api/room/${code}/leave`, { token: p2Token });
await post(`/api/room/${code}/leave`, { token: hostToken });
await fetch(`${base}/api/session/${sid}`, { method: 'DELETE' });

const passed = results.filter(r => r.pass).length;
console.log(`\n${passed}/${results.length} 通过`);
process.exit(passed === results.length ? 0 : 1);
