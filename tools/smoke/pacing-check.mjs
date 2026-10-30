// 0.20.0 新手首局节奏：前两层只出看得懂的节点，且不改变任何节点配额
// 用法：node tools/smoke/pacing-check.mjs
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
const make = async (firstRun, seed) =>
  (await post('/api/new', { characterIds: ['gpt'], seed, firstRun })).data;

const SEED = 515151;
const run = await make(true, SEED);
const std = await make(false, SEED);
const run2 = await make(true, SEED);

const counts = g => {
  const by = {};
  for (const n of g.nodes) by[n.type] = (by[n.type] || 0) + 1;
  return by;
};
const signature = g => g.nodes.map(n => `${n.id}:${n.type}`).sort().join('|');
const layer = (g, l) => g.nodes.filter(n => n.layer === l);

/* ── 1. 配额完全不变 ─────────────────────────────────────────── */
{
  const a = counts(run), b = counts(std);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const diff = [...keys].filter(k => (a[k] || 0) !== (b[k] || 0));
  ok('首局与标准局节点配额一致', diff.length === 0, diff.map(k => `${k}:${a[k] || 0}/${b[k] || 0}`).join(' '));
  ok('首局仍是 95 个节点', run.nodes.length === 95, String(run.nodes.length));
  const shards = run.nodes.filter(n => n.type === 'keyElite').map(n => n.layer).sort((x, y) => x - y);
  ok('碎片层位不变（6/12/15）', JSON.stringify(shards) === '[6,12,15]', shards.join(','));
  const echo = run.nodes.filter(n => n.type === 'echo').map(n => n.layer).sort((x, y) => x - y);
  ok('残响层位不变（4/13）', JSON.stringify(echo) === '[4,13]', echo.join(','));
}

/* ── 2. 第一层只教「进战斗」 ─────────────────────────────────── */
{
  const l1 = layer(run, 1);
  ok('第一层只有小战斗/普通战斗', l1.length > 0 && l1.every(n => n.type === 'skirmish' || n.type === 'combat'),
    l1.map(n => n.type).join(','));
  const l2 = layer(run, 2).filter(n => !['shop', 'blank'].includes(n.type));
  ok('第二层无陷阱/精英', l2.every(n => !['trap', 'elite', 'keyElite'].includes(n.type)), l2.map(n => n.type).join(','));
  const earlyEvent = run.nodes.some(n => n.type === 'event' && n.layer <= 3);
  ok('前三层至少一个事件', earlyEvent, run.nodes.filter(n => n.type === 'event').slice(0, 3).map(n => n.layer).join(','));
  ok('首局不带精英在开局层', !run.nodes.some(n => ['elite', 'keyElite'].includes(n.type) && n.layer <= 2));
}

/* ── 3. 同 seed + 同 firstRun 完全一致 ───────────────────────── */
{
  ok('同 seed 首局地图可复现', signature(run) === signature(run2), `${signature(run).length} / ${signature(run2).length}`);
  ok('标准局与首局仍有差异', signature(run) !== signature(std), '首局是重排，不是同一张图');
}

/* ── 4. 标记可被状态读到（前端据此弹首次解释）────────────────── */
{
  ok('首局标记为 firstRun', run.firstRun === true, String(run.firstRun));
  ok('标准局不标记 firstRun', std.firstRun === false, String(std.firstRun));
}

const failed = results.filter(r => !r.pass);
console.log(`\n===== ${results.length - failed.length}/${results.length} 通过 =====`);
if (failed.length) {
  console.log('失败项：');
  for (const f of failed) console.log(' -', f.name, f.detail);
  process.exit(1);
}
