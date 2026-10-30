// 联机鉴权越权验证：房间成员能否绕过 roomCode 直接驱动别人的角色
const base = 'http://127.0.0.1:5178';
const post = async (p, b) => {
  const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
  let data = null; try { data = await r.json(); } catch { }
  return { status: r.status, ok: r.ok, data };
};
const get = async p => {
  const r = await fetch(base + p);
  let data = null; try { data = await r.json(); } catch { }
  return { status: r.status, ok: r.ok, data };
};

const room = (await post('/api/room/create', { hostName: 'host' })).data;
const code = room.code, hostToken = room.token;
console.log('房间', code);

const guest = (await post(`/api/room/${code}/join`, { name: 'guest' })).data;
await post(`/api/room/${code}/character`, { token: hostToken, characterId: 'gpt' });
await post(`/api/room/${code}/character`, { token: guest.token, characterId: 'claude' });
const started = (await post(`/api/room/${code}/start`, { token: hostToken })).data;
const sid = started.state.sessionId;
const myPid = started.myPlayerId;
console.log('sessionId', sid, 'host player', myPid);

// 1) 客人凭 sessionId、不带 roomCode，直接操作房主的角色 p1
const bypass = await post('/api/action', {
  sessionId: sid,
  action: { type: 'endTurn', playerId: 'p1' }
});
console.log('A. 客人不带 roomCode 操作 p1 →', bypass.status, JSON.stringify(bypass.data?.error ?? bypass.data?.message ?? ('p1.ap=' + (bypass.data?.players?.[0]?.ap))));

// 2) 任何人凭 sessionId 读全量状态（没有 token）
const read = await get(`/api/state?sessionId=${sid}`);
console.log('B. 无凭证读状态 →', read.status, '节点数', read.data?.nodes?.length);

// 3) 房间状态里有 sessionId 吗（给上面两条提供入口）
const view = await get(`/api/room/${code}/state?token=${guest.token}`);
console.log('C. 房间轮询返回 sessionId →', view.data?.room?.sessionId ?? view.data?.state?.sessionId);

// 4) 用别人的 token 操作别人的角色（应被拒，作对照）
const cross = await post('/api/action', {
  sessionId: sid, roomCode: code, token: guest.token,
  action: { type: 'endTurn', playerId: 'p1' }
});
console.log('D. 带 roomCode 越权 →', cross.status, cross.data?.error);

// 5) 未鉴权删除对局
const del = await fetch(`${base}/api/session/${sid}`, { method: 'DELETE' }).then(r => r.status).catch(e => 'ERR');
console.log('E. 无凭证 DELETE /api/session/{id} →', del);
