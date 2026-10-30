// 0.20.0 教学与目标面板规则验证（HTTP 真实接口，不碰游戏代码）
// 用法：node tools/smoke/tutorial-check.mjs
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

const STEPS = ['intro', 'move', 'attack', 'skill', 'enemyIntent', 'endTurn', 'resource', 'retreat', 'complete'];

/* ── 1. 创建教学局 ───────────────────────────────────────────── */
let t = (await post('/api/tutorial/new', {})).data;
ok('教学入口可用', !!t.sessionId, t.error || t.sessionId);
ok('教学模式标记为 tutorial', t.mode === 'tutorial', String(t.mode));
ok('初始步骤是 intro', t.tutorial?.step === 'intro', String(t.tutorial?.step));
ok('教学固定 2 名角色', t.players?.length === 2, String(t.players?.length));
ok('教学不生成三幕地图', (t.nodes || []).length <= 10, `${(t.nodes || []).length} 个节点`);
ok('教学不进入正式幕', t.act === 1 && (t.actName || '').includes('训练') && t.purgeMax <= 20, `${t.actName} / 追踪 ${t.purgeMax}`);
ok('教学步骤清单可读', JSON.stringify(t.tutorial?.steps) === JSON.stringify(STEPS), JSON.stringify(t.tutorial?.steps));
ok('第一步有可见目标', !!t.tutorial?.goal?.title && !!t.tutorial?.goal?.detail, JSON.stringify(t.tutorial?.goal || {}));
const tSid = t.sessionId;

/* ── 2. 非法动作被挡 ─────────────────────────────────────────── */
{
  const bad = await post('/api/action', { sessionId: tSid, action: { type: 'combatEndTurn' } });
  ok('未进入战斗时不能结束战斗回合', !bad.ok, bad.data.error);
  const skip = await post('/api/action', { sessionId: tSid, action: { type: 'interact' } });
  ok('未移动前不能直接结算', !skip.ok && /移动|相邻|先/.test(skip.data.error || ''), skip.data.error);
}

/* ── 3. 逐步推进 ─────────────────────────────────────────────── */
const act = async a => {
  const r = await post('/api/action', { sessionId: tSid, action: a });
  if (r.ok) t = r.data;
  return r;
};
const nodeOf = id => (t.nodes || []).find(n => n.id === id);
const here = () => t.players.find(p => p.id === t.activePlayerId) || t.players[0];

{
  const next = await act({ type: 'tutorialNext' });
  ok('intro 可以跳过进入下一步', next.ok && t.tutorial.step === 'move', next.data.error || t.tutorial?.step);
  const p = here();
  const target = (nodeOf(p.nodeId)?.neighbors || []).map(nodeOf).find(Boolean);
  const move = await act({ type: 'move', playerId: p.id, nodeId: target.id });
  ok('移动到训练节点', move.ok, move.data.error || target?.id);
  if (t.phase !== 'combat') {
    const fight = await act({ type: 'interact', playerId: p.id, nodeId: target.id });
    if (t.players[0].ap <= 0) await act({ type: 'endTurn', playerId: p.id });
    ok('进入教学战斗', fight.ok && t.phase === 'combat', fight.data.error || t.phase);
  }
  ok('进入战斗后步骤为 attack', t.tutorial.step === 'attack', t.tutorial.step);
  ok('教学只有 1 个敌人', (t.combat?.units || []).filter(u => u.side === 'enemy').length === 1,
    String((t.combat?.units || []).filter(u => u.side === 'enemy').length));
}

const playerUnit = () => t.combat?.units.find(u => u.id === t.combat.activeUnitId && u.side === 'player');
const enemyUnit = () => t.combat?.units.find(u => u.side === 'enemy');
const hexDist = (a, b) => {
  const cube = (col, row) => {
    const x = col - (row - (row & 1)) / 2;
    const z = row;
    return [x, -x - z, z];
  };
  const [ax, ay, az] = cube(a.col, a.row);
  const [bx, by, bz] = cube(b.col, b.row);
  return (Math.abs(ax - bx) + Math.abs(ay - by) + Math.abs(az - bz)) / 2;
};
/** 够不到就先走一步（移动不结束回合），够得到就打。 */
const approach = async () => {
  const u = playerUnit();
  const e = enemyUnit();
  if (!u || !e) return false;
  if (hexDist(u, e) <= (u.weaponRange || 1)) return false;
  const reach = (t.combat.reachable || []).slice().sort((a, b) => hexDist(a, e) - hexDist(b, e))[0];
  if (!reach) return false;
  const r = await act({ type: 'combatMove', playerId: u.playerId, col: reach.col, row: reach.row });
  return r.ok;
};
const basicAttack = async () => {
  const u = playerUnit();
  if (!u) return act({ type: 'combatEndTurn' });
  if (await approach()) return { ok: true };
  return act({ type: 'combatAction', playerId: u.playerId, skillId: 'basic', targetUnitId: enemyUnit()?.id });
};

/* 未普攻前不能直接放技能 */
{
  const u = playerUnit() || t.combat?.units.find(x => x.side === 'player');
  const skillId = (u?.skillIds || []).find(id => !id.endsWith('_u'));
  const early = await post('/api/action', {
    sessionId: tSid,
    action: { type: 'combatAction', playerId: u?.playerId, skillId, targetUnitId: enemyUnit()?.id }
  });
  ok('未普攻前不能跳到技能', !early.ok || t.tutorial.step === 'skill', early.data.error || '已被允许');
}

/* 普攻 */
{
  let guard = 0;
  while (t.tutorial?.step === 'attack' && guard++ < 20) {
    if (!playerUnit()) { await act({ type: 'combatEndTurn' }); continue; }
    const r = await basicAttack();
    if (!r.ok) await act({ type: 'combatEndTurn' });
  }
  ok('普攻后进入技能步骤', t.tutorial?.step === 'skill', t.tutorial?.step);
}

/* 技能 */
{
  let guard = 0;
  while (t.tutorial?.step === 'skill' && guard++ < 20) {
    const u = playerUnit();
    if (!u) { await act({ type: 'combatEndTurn' }); continue; }
    const skillId = (u.skillIds || []).find(id => !id.endsWith('_u'));
    const targetId = skillId === 'claude_1' ? u.id : (enemyUnit()?.id || u.id);
    // 治疗/护盾类技能不需要贴近；伤害技能先走到射程内
    if (skillId !== 'claude_1') await approach();
    const r = await act({ type: 'combatAction', playerId: u.playerId, skillId, targetUnitId: targetId });
    if (!r.ok) await act({ type: 'combatEndTurn' });
  }
  ok('技能后进入查看意图步骤', t.tutorial?.step === 'enemyIntent', t.tutorial?.step);
}

/* 查看敌方意图 */
{
  const r = await act({ type: 'tutorialInspect' });
  ok('查看敌方意图被记录', r.ok && t.tutorial?.step === 'endTurn', r.data.error || t.tutorial?.step);
}

/* 结束回合 */
{
  let guard = 0;
  while (t.tutorial?.step === 'endTurn' && guard++ < 8) {
    const r = await act({ type: 'combatEndTurn', playerId: playerUnit()?.playerId });
    if (!r.ok) break;
  }
  ok('结束回合后进入资源步骤', t.tutorial?.step === 'resource', t.tutorial?.step);
}

/* 使用资源 */
{
  const u = playerUnit() || t.combat?.units.find(x => x.side === 'player');
  const mine = t.players.find(p => p.id === u?.playerId) || here();
  const itemId = Object.keys(mine.consumables || {})[0];
  const r = itemId ? await act({ type: 'combatItem', playerId: mine.id, itemId, targetUnitId: u?.id }) : { ok: false };
  ok('战斗中使用资源后进入撤退讲解', r.ok && t.tutorial?.step === 'retreat', r.data?.error || `${itemId} → ${t.tutorial?.step}`);
}

/* 撤退讲解 → 完成 */
{
  const r = await act({ type: 'tutorialNext' });
  ok('撤退讲解可确认', r.ok && t.tutorial?.step === 'complete', r.data.error || t.tutorial?.step);
  const info = t.tutorial?.goal || {};
  ok('完成步骤给出明确目标', !!info.title && !!(info.detail || info.hint), JSON.stringify(info));
}

/* 打完教学战斗并进安全屋 */
{
  let guard = 0;
  while (t.phase === 'combat' && guard++ < 40) {
    if (t.combat?.isOver) { await act({ type: 'closeCombat' }); break; }
    if (!playerUnit()) { await act({ type: 'combatEndTurn' }); continue; }
    const r = await basicAttack();
    if (!r.ok) await act({ type: 'combatEndTurn' });
  }
  ok('教学战斗可通关', t.phase === 'exploration' || t.combat?.isOver, `${t.phase} / ${t.combat?.result}`);
  if (t.phase === 'combat' && t.combat?.isOver) await act({ type: 'closeCombat' });
  const safe = (t.nodes || []).find(n => n.type === 'safehouse');
  const p = here();
  let path = [safe?.id];
  if (p.nodeId !== safe?.id) {
    const adj = new Map((t.nodes || []).map(n => [n.id, n.neighbors]));
    const prev = new Map([[p.nodeId, null]]);
    const q = [p.nodeId];
    while (q.length) {
      const cur = q.shift();
      if (cur === safe.id) break;
      for (const nb of adj.get(cur) || []) if (!prev.has(nb)) { prev.set(nb, cur); q.push(nb); }
    }
    path = [];
    let cur = safe.id;
    while (cur !== p.nodeId) { path.push(cur); cur = prev.get(cur); }
    path.reverse();
  }
  for (const step of path) {
    if (here().ap <= 0) await act({ type: 'endTurn', playerId: here().id });
    await act({ type: 'move', playerId: here().id, nodeId: step });
  }
  if (here().ap <= 0) await act({ type: 'endTurn', playerId: here().id });
  await act({ type: 'interact', playerId: here().id, nodeId: safe.id });
  ok('进入安全屋先展示补给界面', t.phase === 'safehouse' && t.tutorial?.completed !== true,
    `${t.phase} / completed=${t.tutorial?.completed}`);
  const beforeHp = t.players.find(p => p.id === t.activePlayerId)?.hp ?? 0;
  await act({ type: 'rest', playerId: here().id });
  await act({ type: 'close' });
  ok('休息后教学完成', t.tutorial?.completed === true,
    JSON.stringify({ completed: t.tutorial?.completed, step: t.tutorial?.step, hp: `${beforeHp} → ${here().hp}` }));
  ok('教学完成不改成正式三幕', t.act === 1 && (t.nodes || []).length <= 10, t.actName);
}

/* ── 4. 档案与标准局隔离 ─────────────────────────────────────── */
{
  const prof = await get('/api/profile');
  ok('教学完成写入档案', prof.data?.tutorialCompleted === true, JSON.stringify(prof.data));
  const fresh = await post('/api/new', { characterIds: ['gpt'], seed: 777 });
  ok('标准局不带教学模式', fresh.data.mode === 'standard' && !fresh.data.tutorial, `${fresh.data.mode} / ${fresh.data.tutorial?.step}`);
  ok('标准局仍有三幕地图', (fresh.data.nodes || []).length > 50, String((fresh.data.nodes || []).length));
  const old = await post('/api/state?sessionId=' + t.sessionId);
  ok('教学局不被当成正式局记录', !old.data?.defeatedBy, old.data?.defeatedBy || 'ok');
}

/* ── 6. 教学失败可重试 ───────────────────────────────────────── */
{
  const again = await post('/api/tutorial/new', {});
  ok('教学可重新开局', again.ok && again.data.sessionId !== tSid, again.data.error || 'ok');
  const second = again.data;
  const r = await post('/api/action', { sessionId: second.sessionId, action: { type: 'tutorialSkip' } });
  ok('教学允许跳过', r.ok && (r.data.tutorial?.skipped === true || r.data.tutorial?.completed === true || r.data.phase === 'exploration'),
    r.data.error || JSON.stringify(r.data.tutorial));
}

/* ── 7. 追踪归零 = 教学失败，但不删正式存档 ─────────────────── */
{
  const g2 = (await post('/api/tutorial/new', {})).data;
  let st = g2;
  await post('/api/action', { sessionId: g2.sessionId, action: { type: 'tutorialNext' } });
  for (let i = 0; i < 90 && st.phase !== 'defeat'; i++) {
    const p = st.players.find(x => x.id === st.activePlayerId);
    const r = await post('/api/action', { sessionId: g2.sessionId, action: { type: 'endTurn', playerId: p.id } });
    if (r.ok) st = r.data;
    else break;
  }
  ok('追踪归零时教学判负', st.phase === 'defeat' && st.tutorial?.failed === true,
    `${st.phase} / failed=${st.tutorial?.failed} / purge=${st.purge}`);
  const runs = await get('/api/runs?limit=20');
  ok('教学失败不进「最近行动」', !(runs.data?.runs || []).some(r => r.sessionId === g2.sessionId),
    `${(runs.data?.runs || []).length} 条记录`);
  const retry = await post('/api/tutorial/new', {});
  ok('失败后可原地重试', retry.ok && retry.data.tutorial?.failed === false, retry.data.error || 'ok');
}

const failed = results.filter(r => !r.pass);
console.log(`\n===== ${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) {
  console.log('失败项：');
  for (const f of failed) console.log(' -', f.name, f.detail);
  process.exit(1);
}
