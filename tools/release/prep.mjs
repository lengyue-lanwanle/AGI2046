// 发布前数据整理：把测试存档 / 测试房间移出运行目录
// 用法：node tools/release/prep.mjs                 （移动，不删除）
//       node tools/release/prep.mjs --force         （服务在跑也继续）
//       node tools/release/prep.mjs --reset-profile （连本地档案一起归档）
//       node tools/release/prep.mjs --reset-history （连「最近行动」一起归档）
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DATA = path.join(ROOT, 'data');
const FORCE = process.argv.includes('--force');
const RESET_PROFILE = process.argv.includes('--reset-profile');
const RESET_HISTORY = process.argv.includes('--reset-history');

const alive = await (async () => {
  try {
    const r = await fetch('http://127.0.0.1:5178/api/health', { signal: AbortSignal.timeout(800) });
    return r.ok;
  } catch { return false; }
})();

if (alive && !FORCE) {
  console.error('服务还在跑：先停掉（Ctrl+C 或关掉窗口）再整理，避免它把旧会话又写回来。');
  console.error('如果你确定要继续，加 --force。');
  process.exit(2);
}
if (alive && FORCE) {
  console.warn('注意：服务仍在运行，它内存里的会话在下次保存时可能重新写回 data/sessions。');
}

const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const dest = path.join(DATA, '_test-archive', stamp);

function moveAll(dir, label) {
  if (!fs.existsSync(dir)) return 0;
  const files = fs.readdirSync(dir).filter(f => fs.statSync(path.join(dir, f)).isFile());
  if (!files.length) return 0;
  const target = path.join(dest, label);
  fs.mkdirSync(target, { recursive: true });
  for (const f of files) fs.renameSync(path.join(dir, f), path.join(target, f));
  return files.length;
}

const sessions = moveAll(path.join(DATA, 'sessions'), 'sessions');
const rooms = moveAll(path.join(DATA, 'rooms'), 'rooms');
let profile = 0;
if (RESET_PROFILE) {
  const p = path.join(DATA, 'profile.json');
  if (fs.existsSync(p)) {
    fs.mkdirSync(dest, { recursive: true });
    fs.renameSync(p, path.join(dest, 'profile.json'));
    profile = 1;
  }
}

let history = 0;
if (RESET_HISTORY) {
  const h = path.join(DATA, 'runs.jsonl');
  if (fs.existsSync(h)) {
    fs.mkdirSync(dest, { recursive: true });
    fs.renameSync(h, path.join(dest, 'runs.jsonl'));
    history = 1;
  }
}

console.log(`已归档到 data/_test-archive/${stamp}/`);
console.log(`  存档 ${sessions} 个 · 房间 ${rooms} 个` +
  `${RESET_PROFILE ? ` · 档案 ${profile} 个` : ''}${RESET_HISTORY ? ` · 战绩 ${history} 份` : ''}`);
if (!sessions && !rooms && !profile) console.log('运行目录本来就是干净的。');
if (!RESET_HISTORY) console.log('提示：data/runs.jsonl（最近行动）保留；要一起清就加 --reset-history。');
