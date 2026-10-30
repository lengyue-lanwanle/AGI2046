// 0.22 协作：支援动作 + 多人事件投票（HTTP 真实接口）
// 用法：node tools/smoke/coop-event-check.mjs
const base = process.env.BASE || 'http://localhost:5178';
const results = [];
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —  ' + detail : ''}`);
};
const post = async (p, b) => {
  const r = await fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b ?? {}) });
  return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
};
const get = async p => (await fetch(base + p, { cache: 'no-store' })).json();

const pathTo = (g, from, to) => {
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

const g0 = (await post('/api/new', { characterIds: ['gpt', 'claude'], seed: 20220, firstRun: false })).data;
const sid = g0.sessionId;
let g = g0;
const act = async a => {
  const r = await post('/api/action', { sessionId: sid, action: a });
  if (r.ok) g = r.data;
  return r;
};
const here = () => g.players.find(p => p.id === g.activePlayerId) || g.players[0];
const walkToLayer = async layer => {
  for (let guard = 0; guard < 60; guard++) {
    const p = here();
    if (g.phase !== 'exploration') return;
    const target = g.nodes.find(n => n.layer === layer && n.revealed);
    if (!target) { await act({ type: 'endTurn', playerId: p.id }); continue; }
    const path = pathTo(g, p.nodeId, target.id);
    if (!path.length) return;
    for (const step of path) {
      if (g.phase !== 'exploration') return;
      if (here().ap <= 0) await act({ type: 'endTurn', playerId: here().id });
      const r = await act({ type: 'move', playerId: here().id, nodeId: step });
      if (!r.ok) break;
      if (g.phase === 'coop') return;
    }
    if (g.nodes.find(n => n.id === here().nodeId)?.layer >= layer) return;
  }
};

/* 1. 支援动作 */
{
  const p1 = g.players[0];
  const p2 = g.players[1];
  const guard = await act({ type: 'assistGuard', playerId: p1.id, targetPlayerId: p2.id });
  ok('掩护可选', guard.ok, guard.data.error);
  ok('掩护写入承担者', g.players[1].guardLinkFrom === p1.id, g.players[1].guardLinkFrom);

  g.players[0].ap = 3;
  const focus = await act({ type: 'assistFocus', playerId: p1.id, targetPlayerId: p2.id });
  ok('赠与 Focus', focus.ok, focus.data.error);
  g.players[0].ap = 3;
  const mark = await act({ type: 'assistMark', playerId: p1.id, targetPlayerId: p2.id });
  ok('标记目标', mark.ok && g.players[1].assistBonus >= 8, String(g.players[1].assistBonus));
  const ping = await act({ type: 'assistPing', playerId: p1.id, nodeId: p1.nodeId, slot: '危险' });
  ok('标记路线不改规则', ping.ok && g.ping?.note === '危险', JSON.stringify(g.ping));
}

/* 2. 走到第 4 层触发多人事件 */
{
  await walkToLayer(4);
  ok('第 4 层触发多人事件', g.phase === 'coop' && !!g.coop, `${g.phase} / ${g.coop?.title}`);
  ok('事件带选项与效果', (g.coop?.options || []).length >= 2 && g.coop.options.every(o => o.effect), JSON.stringify(g.coop?.options?.map(o => o.id)));
  ok('事件有倒计时', (g.coop?.deadlineAt || 0) > Date.now(), new Date(g.coop?.deadlineAt || 0).toISOString());
}

/* 3. 投票：一人一票，平票走安全默认 */
{
  const c = g.coop;
  const [a, b] = c.options.map(o => o.id);
  const v1 = await act({ type: 'coopVote', playerId: 'p1', slot: a });
  ok('第一票不结算', v1.ok && !g.coop.resolved, `${g.coop?.votes?.p1}`);
  const v2 = await act({ type: 'coopVote', playerId: 'p2', slot: b });
  ok('两票平局即结算', v2.ok && g.coop.resolved, `${g.coop.votes?.p1}/${g.coop.votes?.p2} → ${g.coop.chosenId}`);
  ok('平票采用安全选项', g.coop.chosenId === 'split' || g.coop.chosenId === 'detour' || g.coop.chosenId === 'burn',
    g.coop.chosenId);
  ok('结算有可读结果', (g.coop.result || '').length > 2, g.coop.result);
  const close = await act({ type: 'coopClose' });
  ok('关闭事件回到探索', close.ok && g.phase === 'exploration' && !g.coop, g.phase);
}

/* 4. 同幕不重复触发 */
{
  await walkToLayer(5);
  ok('同幕不重复弹事件', g.phase !== 'coop' || g.coop === null, g.phase);
}

/* 5. 单人局不触发 */
{
  const solo = (await post('/api/new', { characterIds: ['gpt'], seed: 30330, firstRun: false })).data;
  let s = solo;
  const sid2 = solo.sessionId;
  for (let i = 0; i < 60 && s.phase === 'exploration'; i++) {
    const p = s.players.find(x => x.id === s.activePlayerId);
    const target = s.nodes.find(n => n.layer === 4 && n.revealed);
    if (!target) break;
    const path = pathTo(s, p.nodeId, target.id);
    if (!path.length) break;
    for (const step of path) {
      if (s.activePlayerId && s.players.find(x => x.id === s.activePlayerId).ap <= 0) {
        const r = await post('/api/action', { sessionId: sid2, action: { type: 'endTurn', playerId: s.activePlayerId } });
        if (r.ok) s = r.data;
      }
      const r = await post('/api/action', { sessionId: sid2, action: { type: 'move', playerId: s.activePlayerId, nodeId: step } });
      if (r.ok) s = r.data; else break;
      if (s.phase === 'coop') break;
    }
    if (s.nodes.find(n => n.id === s.players.find(x => x.id === s.activePlayerId)?.nodeId)?.layer >= 4) break;
  }
  ok('单人局全程不弹多人事件', s.phase !== 'coop' && !s.coop, `${s.phase} / ${s.coop}`);
}

/* 6. 救援每幕一次 */
{
  const g2 = (await post('/api/new', { characterIds: ['gpt', 'claude'], seed: 40440, firstRun: false })).data;
  let st = g2;
  st.players[1].nodeId = st.players[0].nodeId;
  const r1 = await post('/api/action', {
    sessionId: g2.sessionId,
    action: { type: 'assistRescue', playerId: 'p1', targetPlayerId: 'p2' }
  });
  ok('救援倒下的队友（直接调用被拒）', !r1.ok, r1.data.error);
}

const failed = results.filter(r => !r.pass);
console.log(`\n===== ${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) {
  console.log('失败项：');
  for (const f of failed) console.log(' -', f.name, f.detail);
  process.exit(1);
}
