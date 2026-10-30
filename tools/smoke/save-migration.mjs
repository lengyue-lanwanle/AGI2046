// 0.25 存档迁移：跑规则层探针（旧档 → 新字段默认值 → 写回不丢）
// 迁移细节在 tools/audit/save-migrate.cs；这里负责「一条命令能验」。
import { spawnSync } from 'node:child_process';

const args = ['run', 'tools/audit/save-migrate.cs', ...process.argv.slice(2)];
const r = spawnSync('dotnet', args, { cwd: process.cwd(), encoding: 'utf8', timeout: 300000 });
const out = `${r.stdout || ''}${r.stderr || ''}`;
const fails = out.split('\n').filter(l => l.startsWith('FAIL'));
const line = out.split('\n').find(l => l.includes('passed')) || '';
if (line) console.log(line.trim());
for (const f of fails) console.log(f);
const ok = fails.length === 0 && /0 failed/.test(line);
console.log(ok ? 'PASS  存档迁移（旧档可读 / 写回不丢字段）' : 'FAIL  存档迁移探针未通过');
process.exit(ok ? 0 : 1);
