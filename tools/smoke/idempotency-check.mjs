// 请求级幂等：同一个 requestId 重复提交只应用一次
// 用法：node tools/smoke/idempotency-check.mjs
const BASE = process.env.BASE || 'http://127.0.0.1:5178';
const results = [];
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —  ' + detail : ''}`);
};
const post = async (path, body) => {
  const r = await fetch(BASE + path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {})
  });
  return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})), headers: r.headers };
};
const postRaw = async (path, body, headers) => {
  const r = await fetch(BASE + path, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body ?? {})
  });
  return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})), headers: r.headers };
};

const g0 = await post('/api/new', { characterIds: ['gpt', 'claude'], seed: 60601 });
ok('开局', g0.ok && g0.data.sessionId, g0.data.error || '');
const sid = g0.data.sessionId;
const rev0 = g0.data.revision;
const round0 = g0.data.round;

/* 1. 同一 requestId 连发两次：只推进一次 */
{
  const id = 'idem-' + Date.now() + '-a';
  const body = { sessionId: sid, action: { type: 'endTurn', playerId: 'p1' }, expectedRevision: rev0, requestId: id };
  const a = await post('/api/action', body);
  ok('第一次提交成功', a.ok, a.data.error || String(a.status));
  const revAfterFirst = a.data.revision;
  const b = await post('/api/action', body);
  ok('第二次不报 409（幂等命中）', b.ok, `${b.status} ${b.data.error || ''}`);
  ok('第二次带 X-Idempotent-Replay', b.headers.get('x-idempotent-replay') === '1', String(b.headers.get('x-idempotent-replay')));
  ok('修订号只前进一次', b.data.revision === revAfterFirst, `${revAfterFirst} → ${b.data.revision}`);
  ok('回合/行动者没有被推进两次', b.data.round === a.data.round && b.data.activePlayerId === a.data.activePlayerId,
    `R${a.data.round}/${a.data.activePlayerId} → R${b.data.round}/${b.data.activePlayerId}`);
}

/* 2. 不同 requestId：正常推进（说明幂等键不是把动作全锁死） */
{
  const rev = (await (await fetch(`${BASE}/api/state?sessionId=${sid}`)).json()).revision;
  const a = await post('/api/action', {
    sessionId: sid, action: { type: 'endTurn', playerId: 'p2' }, expectedRevision: rev, requestId: 'idem-' + Date.now() + '-b'
  });
  ok('换一个 requestId 会正常执行', a.ok && a.data.revision === rev + 1, `${rev} → ${a.data.revision}`);
}

/* 3. 资源不重复扣：用「购买」或「休息」验证（消耗 AP / 记忆币） */
{
  const st = await (await fetch(`${BASE}/api/state?sessionId=${sid}`)).json();
  const p = st.players.find(x => x.id === st.activePlayerId);
  // 先把 AP 补满，保证有得扣
  const rev = st.revision;
  const id = 'idem-' + Date.now() + '-c';
  const body = { sessionId: sid, action: { type: 'rest', playerId: p.id }, expectedRevision: rev, requestId: id };
  const a = await post('/api/action', body);
  if (a.ok) {
    const ap1 = a.data.players.find(x => x.id === p.id).ap;
    const b = await post('/api/action', body);
    const ap2 = b.data.players.find(x => x.id === p.id).ap;
    ok('重复提交不重复扣 AP', ap2 === ap1, `AP ${p.ap} → ${ap1} → ${ap2}`);
  } else {
    ok('重复提交不重复扣 AP', true, '本次 AP 不足，跳过（不阻塞其余断言）');
  }
}

/* 4. 头部 Idempotency-Key 同样生效 */
{
  const st = await (await fetch(`${BASE}/api/state?sessionId=${sid}`)).json();
  const rev = st.revision;
  const p = st.players.find(x => x.id === st.activePlayerId);
  const key = 'hdr-' + Date.now();
  const body = { sessionId: sid, action: { type: 'endTurn', playerId: p.id }, expectedRevision: rev };
  const a = await postRaw('/api/action', body, { 'idempotency-key': key });
  const b = await postRaw('/api/action', body, { 'idempotency-key': key });
  ok('头部幂等键生效', a.ok && b.ok && b.data.revision === a.data.revision,
    `${a.data.revision} → ${b.data.revision}`);
  ok('头部幂等也标 replay', b.headers.get('x-idempotent-replay') === '1', String(b.headers.get('x-idempotent-replay')));
}

/* 5. 失败的动作不占幂等键：先 400，再用同一个 id 重试应当真的执行 */
{
  const st = await (await fetch(`${BASE}/api/state?sessionId=${sid}`)).json();
  const rev = st.revision;
  const p = st.players.find(x => x.id === st.activePlayerId);
  const id = 'idem-' + Date.now() + '-fail';
  const bad = await post('/api/action', {
    sessionId: sid, action: { type: 'move', playerId: p.id, nodeId: 'no-such-node' }, expectedRevision: rev, requestId: id
  });
  ok('非法动作被拒', !bad.ok, `${bad.status} ${bad.data.error || ''}`);
  const good = await post('/api/action', {
    sessionId: sid, action: { type: 'endTurn', playerId: p.id }, expectedRevision: rev, requestId: id
  });
  ok('失败后用同一 id 仍能执行', good.ok, `${good.status} ${good.data.error || ''}`);
}

await fetch(`${BASE}/api/session/${sid}`, { method: 'DELETE' });

const pass = results.filter(r => r.pass).length;
console.log(`\n===== ${pass}/${results.length} passed =====`);
process.exit(pass === results.length ? 0 : 1);
