// 多人事件自动结算：给 e2e 脚本用
// 0.22 起，2 人以上队伍进入第 4 层可能触发投票，此时除投票外的动作都会被拒。
// 这些脚本测的不是投票本身（那由 coop-event-check 覆盖），所以这里统一「全员投第一个选项 + 结算」。
export async function settleCoop(post, state, sid) {
  let guard = 0;
  let cur = state;
  while (cur?.phase === 'coop' && guard++ < 12) {
    const coop = cur.coop;
    if (!coop) break;
    if (coop.resolved) {
      const r = await post('/api/action', { sessionId: sid, action: { type: 'coopClose' } });
      if (!r.ok) break;
      cur = r.data;
      continue;
    }
    const option = coop.options?.[0]?.id;
    const voter = (cur.players || []).find(p => !p.downed && !(coop.votes || {})[p.id]);
    if (!option || !voter) {
      const r = await post('/api/action', { sessionId: sid, action: { type: 'coopResolve' } });
      if (!r.ok) break;
      cur = r.data;
      continue;
    }
    const r = await post('/api/action', {
      sessionId: sid, action: { type: 'coopVote', playerId: voter.id, slot: option }
    });
    if (!r.ok) break;
    cur = r.data;
  }
  return cur;
}
