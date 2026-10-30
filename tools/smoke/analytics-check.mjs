// 0.21 失败复盘 / 评级 / 解锁：真实 HTTP 流程
// 用法：node tools/smoke/analytics-check.mjs   （服务需在 5178）
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
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data: j };
};

/* 1. 用「追踪加速」变异快速输一局，拿到真实终局数据 */
const started = await post('/api/new', {
  characterIds: ['gpt', 'claude'],
  seed: 90210,
  mode: 'challenge',
  challenge: { seed: 90210, mutatorIds: ['tracking_fast'], difficulty: 'normal' }
});
ok('挑战局能开', started.ok && !!started.data.sessionId, started.data.error || String(started.status));
const sid = started.data.sessionId;
let state = started.data;

for (let i = 0; i < 240 && state.phase !== 'defeat' && state.phase !== 'victory'; i++) {
  const p = (state.players || []).find(x => x.id === state.activePlayerId) || state.players?.[0];
  const r = await post('/api/action', {
    sessionId: sid,
    action: { type: 'endTurn', playerId: p?.id },
    expectedRevision: state.revision
  });
  if (!r.ok) break;
  state = r.data;
}

ok('能走到终局', state.phase === 'defeat' || state.phase === 'victory', `phase=${state.phase}`);

/* 2. 复盘字段 */
const review = state.review || {};
ok('终局带复盘', !!state.review, JSON.stringify(review).slice(0, 60));
ok('复盘写明失败阶段', !!review.failureStage, review.failureStage);
ok('复盘写明原因', !!review.reason, review.reason);
ok('复盘指出关键原因', !!review.keyCause, review.keyCause);
ok('复盘有最后动作记录', Array.isArray(review.lastActions) && review.lastActions.length > 0,
  String(review.lastActions?.length));
ok('复盘有建议', !!review.suggestion, review.suggestion);
// 变异在复盘里用中文名展示（UI 直接可读），接受 id 或名字
ok('复盘记了本局变异',
  Array.isArray(review.mutators) && review.mutators.length > 0 &&
  review.mutators.some(m => /tracking_fast|追踪加速/.test(m)),
  JSON.stringify(review.mutators));
ok('复盘不带敏感信息', !/token|Bearer|C:\\\\|data[\\/\\\\]sessions|sessionId/i.test(JSON.stringify(review)),
  JSON.stringify(review).slice(0, 80));

/* 3. 评级 */
const rating = state.rating || {};
ok('终局有评级', !!state.rating, JSON.stringify(rating).slice(0, 40));
ok('评级是 A/B/C/S 之一', ['S', 'A', 'B', 'C'].includes(rating.grade), String(rating.grade));
ok('评级有分数', typeof rating.score === 'number', String(rating.score));
ok('评级有维度', Array.isArray(rating.dimensions) && rating.dimensions.length >= 2,
  String(rating.dimensions?.length));
ok('维度都有标签和分数', (rating.dimensions || []).every(d => d.label && typeof d.score === 'number'),
  JSON.stringify((rating.dimensions || [])[0] || {}));

/* 4. 解锁写进档案 */
const profile = await (await fetch(BASE + '/api/profile')).json();
ok('档案记录解锁', Array.isArray(profile.unlockedIds), JSON.stringify(profile.unlockedIds));
ok('档案记录战绩摘要', typeof profile.runs === 'number' && typeof profile.bestGrade === 'string',
  JSON.stringify({ runs: profile.runs, bestGrade: profile.bestGrade }));

/* 5. 重复读状态不会重复发奖 / 重复写复盘 */
const again = await (await fetch(`${BASE}/api/state?sessionId=${sid}`)).json();
ok('重复读状态复盘不变', again.review?.reason === review.reason, `${again.review?.reason} vs ${review.reason}`);
ok('重复读状态评级不变', again.rating?.grade === rating.grade, `${again.rating?.grade} vs ${rating.grade}`);

const pass = results.filter(r => r.pass).length;
console.log(`\n===== ${pass}/${results.length} passed =====`);
process.exit(pass === results.length ? 0 : 1);
