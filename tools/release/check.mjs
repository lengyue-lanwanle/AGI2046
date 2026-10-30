// 发布前一致性检查：版本号、缓存版本、数据目录、历史文档横幅
// 用法：node tools/release/check.mjs            （有服务在跑也能查，只是数据目录会非空）
//       node tools/release/check.mjs --allow-data  （允许 data/sessions 非空，用于开发中）
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ALLOW_DATA = process.argv.includes('--allow-data');
const results = [];
const ok = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —  ' + detail : ''}`);
};
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* 1. 版本号一致 */
const modelVer = (read('src/AGI2046.Rules/Models.cs').match(/public string Version \{ get; set; \} = "([^"]+)"/) || [])[1];
const progVer = [...read('src/AGI2046.Server/Program.cs').matchAll(/version = "([^"]+)"/g)].map(m => m[1]);
const indexVer = (read('web/index.html').match(/BUILD ([\d.]+) ·/) || [])[1];
const readmeVer = (read('README.md').match(/当前版本：`([^`]+)`/) || [])[1];
const handoffVer = (read('HANDOFF.md').match(/交接（([\d.]+)）/) || [])[1];
const archiveVer = JSON.parse(read('web/data/archive.json')).version;

const versions = { modelVer, progVer, indexVer, readmeVer, handoffVer, archiveVer };
const flat = [modelVer, ...progVer, indexVer, readmeVer, handoffVer, archiveVer].filter(Boolean);
const unique = [...new Set(flat)];
ok('版本号全项目一致', unique.length === 1, `${unique.join(' / ')}`);
ok('health 与 meta 同版本', progVer.length >= 2 && new Set(progVer).size === 1, progVer.join(' / '));
ok('版本号格式 x.y.z', unique.every(v => /^\d+\.\d+\.\d+$/.test(v)), unique.join(','));
ok('web/data/archive.json 版本跟上', archiveVer === modelVer, `${archiveVer} vs ${modelVer}`);

/* 2. 静态资源缓存版本只有一个 */
const qs = [...read('web/index.html').matchAll(/\?v=(\d+)/g)].map(m => m[1]);
const qUnique = [...new Set(qs)];
ok('静态资源 ?v= 只有一个值', qUnique.length === 1, qUnique.join(','));
ok('静态资源都有 ?v=', qs.length >= 10, `${qs.length} 处`);

/* 3. 历史文档横幅 */
const bannerExempt = new Set(['PLAN-0.25.md', 'DEPLOY.md', 'PERF.md']);
const docs = fs.readdirSync(path.join(ROOT, 'docs')).filter(f => f.endsWith('.md') && !bannerExempt.has(f));
const missing = docs.filter(f => !fs.readFileSync(path.join(ROOT, 'docs', f), 'utf8').includes('历史文档，仅作背景'));
ok('历史文档都标了「以 HANDOFF 为准」', missing.length === 0, missing.join(', '));

/* 4. 数据目录 */
const count = dir => {
  const p = path.join(ROOT, 'data', dir);
  if (!fs.existsSync(p)) return 0;
  return fs.readdirSync(p).filter(f => fs.statSync(path.join(p, f)).isFile()).length;
};
const sessions = count('sessions');
const rooms = count('rooms');
const profile = fs.existsSync(path.join(ROOT, 'data', 'profile.json'));
if (ALLOW_DATA) {
  console.log(`      （开发模式）data/sessions ${sessions} · data/rooms ${rooms} · profile ${profile ? '有' : '无'}`);
} else {
  ok('data/sessions 已清空', sessions === 0, `${sessions} 个存档`);
  ok('data/rooms 已清空', rooms === 0, `${rooms} 个房间`);
  ok('没有残留测试档案', profile === false, profile ? 'data/profile.json 还在' : '');
}

/* 5. 关键文件在 */
for (const f of [
  'README.md', 'HANDOFF.md', 'data/README.md', 'docs/PLAN-0.25.md',
  'tools/release/prep.mjs', 'tools/smoke/idempotency-check.mjs',
  'tools/audit/bot-clear.cs', 'tools/ui/modal-fatigue.mjs'
]) ok(`文件存在：${f}`, fs.existsSync(path.join(ROOT, f)));

const pass = results.filter(r => r.pass).length;
console.log(`\n===== ${pass}/${results.length} passed =====`);
process.exit(pass === results.length ? 0 : 1);
