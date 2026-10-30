// 0.10.0 觉醒验证：全局唯一、专属武器、技能强化
import { settleCoop } from './coop-auto.mjs';
const base = 'http://localhost:5178';
const rawPost = async (path, body) => {
  const r = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { ok: r.ok, data: await r.json() };
};

// 多人事件会把 phase 切到 coop，除投票外的动作都会被拒；这里统一自动结算
const post = async (path, body) => {
  const r = await rawPost(path, body);
  if (r.ok && r.data?.phase === 'coop' && body?.sessionId) {
    const settled = await settleCoop(rawPost, r.data, body.sessionId);
    if (settled) return { ok: true, data: settled };
  }
  return r;
};
const results = [];
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —  ' + detail : ''}`);
};

const meta = await (await fetch(base + '/api/meta')).json();
let g = (await post('/api/new', { characterIds: ['claude', 'deepseek'], seed: 12345 })).data;
const sid = g.sessionId;
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
const act = async a => {
  const r = await post('/api/action', { sessionId: sid, action: a });
  if (!r.ok) throw new Error(r.data.error || 'action failed');
  g = r.data;
  return g;
};

const awakenNode = g.nodes.find(n => n.type === 'awakening');
console.log('[map] awakening node', awakenNode.id, '@L' + awakenNode.layer + ' lane' + awakenNode.lane);
ok('每幕 2 个找回自我节点（0.15 起每人各能觉醒一次）', g.nodes.filter(n => n.type === 'awakening').length === 2);
const awakenLayers = g.nodes.filter(n => n.type === 'awakening').map(n => n.layer).sort((a, b) => a - b);
ok('两个节点落在固定层位（7 / 9 层）', JSON.stringify(awakenLayers) === JSON.stringify([7, 9]), awakenLayers.join(','));

// 把两名角色都走到节点
const moveAll = async target => {
  for (let i = 0; i < 260; i++) {
    if (g.players.every(p => p.nodeId === target || p.downed)) return true;
    const p = g.players.find(x => x.id === g.activePlayerId);
    if (!p || p.downed) { await act({ type: 'endTurn', playerId: g.activePlayerId }); continue; }
    if (p.nodeId === target) { await act({ type: 'endTurn', playerId: p.id }); continue; }
    if (p.ap <= 0) { await act({ type: 'endTurn', playerId: p.id }); continue; }
    const route = pathTo(p.nodeId, target);
    const step = route[0];
    if (!step) { await act({ type: 'endTurn', playerId: p.id }); continue; }
    await act({ type: 'move', playerId: p.id, nodeId: step });
  }
  return false;
};
const arrived = await moveAll(awakenNode.id);
ok('队伍抵达觉醒节点', arrived, 'purge ' + g.purge + '/' + g.purgeMax);

const before = g.players[0];
const beforeSkills = [...before.skillIds];

const first = g.players.find(p => p.nodeId === awakenNode.id);
if (g.activePlayerId !== first.id) await act({ type: 'endTurn', playerId: g.activePlayerId });

await act({ type: 'interact', playerId: first.id, nodeId: awakenNode.id });
const awakened = g.players.find(p => p.id === first.id);
const weapon = awakened.equipment?.Weapon;
ok('第一个角色完成觉醒', awakened.awakened === true);
ok('获得专属武器', !!weapon && weapon.itemId.startsWith('aw_'), weapon ? weapon.name : 'none');
ok('技能全部换成觉醒版', awakened.skillIds.every(id => id.endsWith('_awakened')), awakened.skillIds.join(','));
const skillMap = new Map(meta.skills.map(x => [x.id, x]));
const baseSkill = skillMap.get('claude_2');
const awakeSkill = skillMap.get('claude_2_awakened');
ok('技能数值提升', awakeSkill.dice > baseSkill.dice && awakeSkill.damagePerDie > baseSkill.damagePerDie,
  `骰 ${baseSkill.dice}→${awakeSkill.dice}，伤害 ${baseSkill.damagePerDie}→${awakeSkill.damagePerDie}`);
ok('技能数量不变', awakened.skillIds.length === beforeSkills.length, `${beforeSkills.length} → ${awakened.skillIds.length}`);
ok('弹出觉醒剧情卡', g.pendingBeat?.title === '找回自我', g.pendingBeat?.subtitle);
ok('全局记录已占用', g.awakenedPlayerId === first.id, g.awakenedPlayerId);

// 0.15 起：稀缺的是「回声」，不是「名额」——同一节点只能被取走一次，但每个角色都能各自觉醒。
// 所以第二个角色在**同一个节点**上会被拒（节点已清空），换个节点就能觉醒（那条路径由 AwakenProbe 覆盖）。
const second = g.players.find(p => p.id !== first.id);
for (let i = 0; i < 8 && g.activePlayerId !== second.id; i++) await act({ type: 'endTurn', playerId: g.activePlayerId });
const again = await post('/api/action', { sessionId: sid, action: { type: 'interact', playerId: second.id, nodeId: awakenNode.id } });
const msg = again.data.error || again.data.message || '';
ok('第二个角色在同一节点被拒（回声已被取走）',
  again.ok && (msg.includes('已经被取走') || msg.includes('已经')) && !again.data.players.find(p => p.id === second.id).awakened,
  msg);
ok('AwakenedPlayerId 仍记录第一个觉醒者', again.data.awakenedPlayerId === first.id, again.data.awakenedPlayerId);
console.log('\n===== ' + results.filter(r => r.pass).length + '/' + results.length + ' 通过 =====');
if (results.some(r => !r.pass)) process.exit(1);
