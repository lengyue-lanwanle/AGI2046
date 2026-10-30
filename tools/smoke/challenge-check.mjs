// 0.21 挑战模式 HTTP 验证：目录 / 确定性 / 变异生效 / 复盘与解锁
// 用法：node tools/smoke/challenge-check.mjs
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
const get = async p => {
  const r = await fetch(base + p, { cache: 'no-store' });
  return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
};

/* 1. 目录 */
const meta = (await get('/api/meta')).data;
{
  ok('变异目录有 16 条', (meta.mutators || []).length === 16, String((meta.mutators || []).length));
  ok('每条都有风险/奖励/策略', (meta.mutators || []).every(m => m.risk && m.reward && m.strategy));
  ok('4 条是解锁变异', (meta.mutators || []).filter(m => m.unlockId).length === 4);
  ok('解锁目录 10 条', (meta.unlocks || []).length === 10, String((meta.unlocks || []).length));
  ok('每日种子是 6 位', /^\d{6}$/.test(String(meta.dailySeed)), String(meta.dailySeed));
}

/* 2. 标准局不受影响 */
{
  const std = (await post('/api/new', { characterIds: ['gpt'], seed: 111, firstRun: false })).data;
  ok('不传挑战 = 标准局', std.mode === 'standard' && !std.challenge, `${std.mode}/${std.challenge}`);
}

/* 3. 挑战局 */
const CH = { seed: 4242, mutatorIds: ['tracking_fast', 'no_safehouse'], difficulty: 'normal', challengeId: 'smoke' };
const c1 = (await post('/api/new', { characterIds: ['gpt', 'claude'], seed: 4242, mode: 'challenge', challenge: CH })).data;
{
  ok('挑战局可开局', !!c1.sessionId && c1.mode === 'challenge', c1.error || c1.mode);
  ok('变异被记录', JSON.stringify(c1.challenge?.mutatorIds) === JSON.stringify(CH.mutatorIds), JSON.stringify(c1.challenge?.mutatorIds));
  ok('评分倍率 > 1', (c1.challenge?.scoreMultiplier || 0) > 1, String(c1.challenge?.scoreMultiplier));
  ok('无安全屋变异生效', c1.nodes.filter(n => n.type === 'safehouse').length === 3,
    String(c1.nodes.filter(n => n.type === 'safehouse').length));
  ok('开局预告变异', (c1.log || []).some(l => l.text.includes('挑战协议已加载')), (c1.log || []).slice(-1)[0]?.text);
}
const c2 = (await post('/api/new', { characterIds: ['gpt', 'claude'], seed: 4242, mode: 'challenge', challenge: CH })).data;
{
  const sig = g => g.nodes.map(n => `${n.id}:${n.type}:${n.enemyGroup || ''}`).sort().join('|');
  ok('同 seed 同变异地图一致', sig(c1) === sig(c2));
  const other = (await post('/api/new', {
    characterIds: ['gpt', 'claude'], seed: 4333, mode: 'challenge',
    challenge: { ...CH, seed: 4333 }
  })).data;
  ok('不同 seed 地图不同', sig(c1) !== sig(other));
}

/* 4. 校验与人数上限 */
{
  const locked = await post('/api/new', {
    characterIds: ['gpt'], mode: 'challenge',
    challenge: { seed: 5, mutatorIds: ['ironman'] }
  });
  ok('未解锁变异被拒绝', !locked.ok && /解锁/.test(locked.data.error || ''), locked.data.error);
  const bogus = await post('/api/new', { characterIds: ['gpt'], mode: 'challenge', challenge: { seed: 5, mutatorIds: ['nope'] } });
  ok('未知变异被拒绝', !bogus.ok, bogus.data.error);
  const four = await post('/api/new', {
    characterIds: ['gpt', 'claude', 'gemini', 'wenxin'], mode: 'challenge',
    challenge: { seed: 5, mutatorIds: ['few'] }
  });
  ok('少数派：4 人被拒', !four.ok && /3 名/.test(four.data.error || ''), four.data.error);
}

/* 5. 追踪加速：3 个玩家回合走 1 格 */
{
  const g = (await post('/api/new', {
    characterIds: ['gpt', 'claude'], seed: 99, mode: 'challenge',
    challenge: { seed: 99, mutatorIds: ['tracking_fast'] }
  })).data;
  let st = g;
  for (let i = 0; i < 3; i++) {
    const p = st.players.find(x => x.id === st.activePlayerId);
    const r = await post('/api/action', { sessionId: g.sessionId, action: { type: 'endTurn', playerId: p.id } });
    if (r.ok) st = r.data;
  }
  ok('追踪加速：3 回合 −1', st.purge === st.purgeMax - 1, `${st.purge}/${st.purgeMax}`);
}

/* 6. 失败 → 复盘 → 评级 → 解锁 */
{
  const g = (await post('/api/new', {
    characterIds: ['gpt', 'claude'], seed: 777, mode: 'challenge',
    challenge: { seed: 777, mutatorIds: ['tracking_fast', 'glass'] }
  })).data;
  let st = g;
  for (let i = 0; i < 150 && st.phase !== 'defeat'; i++) {
    const p = st.players.find(x => x.id === st.activePlayerId);
    const r = await post('/api/action', { sessionId: g.sessionId, action: { type: 'endTurn', playerId: p.id } });
    if (r.ok) st = r.data; else break;
  }
  ok('追踪归零判负', st.phase === 'defeat', `${st.phase} / ${st.purge}`);
  ok('失败生成复盘', !!st.review, st.review?.reason);
  ok('复盘写明失败阶段', (st.review?.failureStage || '').length > 0, st.review?.failureStage);
  ok('复盘给出建议', (st.review?.suggestion || '').length > 8, st.review?.suggestion);
  ok('复盘不超过 10 条行动', (st.review?.lastActions || []).length <= 10, String((st.review?.lastActions || []).length));
  ok('失败也有评级', ['S', 'A', 'B', 'C'].includes(st.rating?.grade), `${st.rating?.grade} ${st.rating?.score}`);
  ok('评级有 7 个维度', (st.rating?.dimensions || []).length === 7);
  ok('挑战结果写回', st.challenge?.result === 'defeat' && !!st.challenge?.completedAt, st.challenge?.result);

  const runs = (await get('/api/runs?limit=10')).data.runs || [];
  const mine = runs.find(r => r.sessionId === g.sessionId);
  ok('最近行动记录挑战局', !!mine && mine.mode === 'Challenge', mine?.mode);
  ok('最近行动记录评级', !!mine?.grade, `${mine?.grade} ${mine?.score}`);

  const prof = (await get('/api/profile')).data;
  ok('档案累计局数', prof.runs >= 1, String(prof.runs));
  ok('两条变异可解锁猎杀协议', (prof.unlockedIds || []).includes('unlock_elite_hunt'),
    JSON.stringify(prof.unlockedIds));

  const unlocked = await post('/api/new', {
    characterIds: ['gpt'], mode: 'challenge',
    challenge: { seed: 8, mutatorIds: ['elite_hunt'] }
  });
  ok('解锁后可选用新变异', unlocked.ok, unlocked.data.error);
}

/* 7. 旧存档字段兼容：挑战字段缺失不影响标准局 */
{
  const s = (await post('/api/new', { characterIds: ['gpt'], seed: 1234 })).data;
  ok('标准局没有挑战字段', s.challenge === null || s.challenge === undefined, String(s.challenge));
  const st = (await get('/api/state?sessionId=' + s.sessionId)).data;
  ok('读状态不报错', st.sessionId === s.sessionId && !!st.objectives);
}

const failed = results.filter(r => !r.pass);
console.log(`\n===== ${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) {
  console.log('失败项：');
  for (const f of failed) console.log(' -', f.name, f.detail);
  process.exit(1);
}
