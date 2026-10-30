// 0.20.0 「当前目标面板」规则验证：主目标唯一、近期目标≤3、风险与推荐可读、目标切换留痕
// 用法：node tools/smoke/objective-check.mjs
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

let g = (await post('/api/new', { characterIds: ['gpt', 'claude'], seed: 424242, firstRun: false })).data;
const sid = g.sessionId;
const act = async a => {
  const r = await post('/api/action', { sessionId: sid, action: a });
  if (r.ok) g = r.data;
  return r;
};

/* ── 1. 结构 ─────────────────────────────────────────────────── */
{
  const o = g.objectives || {};
  ok('标准局有目标面板', !!g.objectives, Object.keys(o).join(','));
  ok('主目标唯一且非空', typeof o.main === 'string' && o.main.length > 4, o.main);
  ok('当前目标非空', typeof o.current === 'string' && o.current.length > 2, o.current);
  ok('近期目标 1–3 条', Array.isArray(o.near) && o.near.length >= 1 && o.near.length <= 3,
    `${(o.near || []).length} 条`);
  ok('近期目标带进度', (o.near || []).every(x => typeof x.progress === 'number' && typeof x.target === 'number'),
    JSON.stringify((o.near || []).map(x => `${x.title} ${x.progress}/${x.target}`)));
  ok('失败条件明确', Array.isArray(o.failure) && o.failure.some(x => /追踪/.test(x)) && o.failure.some(x => /倒下/.test(x)),
    (o.failure || []).join(' / '));
  ok('风险含电子追踪数值', /电子追踪\s*\d+\s*\/\s*\d+/.test(o.risk || ''), o.risk);
  ok('推荐动作可读', typeof o.recommended === 'string' && o.recommended.length > 4, o.recommended);
  ok('支线不挤进主目标面板', !(o.near || []).some(x => /quest/i.test(x.id || '')), (o.near || []).map(x => x.id).join(','));
}

/* ── 2. 目标切换写入行动记录 ─────────────────────────────────── */
const node = id => g.nodes.find(n => n.id === id);
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
const here = () => g.players.find(p => p.id === g.activePlayerId) || g.players[0];
{
  const fight = g.nodes.find(n => ['skirmish', 'combat'].includes(n.type) && !n.cleared);
  for (const step of pathTo(here().nodeId, fight.id)) {
    if (here().ap <= 0) await act({ type: 'endTurn', playerId: here().id });
    await act({ type: 'move', playerId: here().id, nodeId: step });
  }
  if (here().ap <= 0) await act({ type: 'endTurn', playerId: here().id });
  await act({ type: 'interact', playerId: here().id, nodeId: fight.id });
  ok('进入战斗后当前目标切到清场', /清除|敌对/.test(g.objectives?.current || ''), g.objectives?.current);
  const goalLogs = (g.log || []).filter(l => l.kind === 'goal');
  ok('目标切换写入行动记录', goalLogs.length >= 1, goalLogs.slice(-2).map(l => l.text).join(' | '));
  ok('目标面板随战斗更新', (g.objectives?.near || []).length >= 1 && !!g.objectives?.recommended, g.objectives?.recommended);
}

/* ── 3. 旧字段兼容：老存档读进来仍有面板 ─────────────────────── */
{
  const r = await fetch(base + '/api/state?sessionId=' + sid, { cache: 'no-store' });
  const s = await r.json();
  ok('读状态不因新字段报错', r.ok && s.sessionId === sid && !!s.objectives, r.status + ' ' + (s.error || 'ok'));
}

/* ── 4. 教学不重复渲染目标面板 ───────────────────────────────── */
{
  const t = (await post('/api/tutorial/new', {})).data;
  ok('教学用步骤条而不是目标面板', t.mode === 'tutorial' && !t.objectives, `${t.mode} / ${t.objectives}`);
}

const failed = results.filter(r => !r.pass);
console.log(`\n===== ${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) {
  console.log('失败项：');
  for (const f of failed) console.log(' -', f.name, f.detail);
  process.exit(1);
}
