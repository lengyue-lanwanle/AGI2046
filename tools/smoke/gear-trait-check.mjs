// 0.24 构筑化装备：跑规则层探针（8 个方向 + 最多 3 条生效）
import { spawnSync } from 'node:child_process';

const r = spawnSync('dotnet', ['run', 'tools/audit/gear-probe.cs'], {
  cwd: process.cwd(), encoding: 'utf8', timeout: 300000
});
const out = `${r.stdout || ''}${r.stderr || ''}`;
const fails = out.split('\n').filter(l => l.startsWith('FAIL'));
const line = out.split('\n').find(l => l.includes('passed')) || '';
if (line) console.log(line.trim());
for (const f of fails) console.log(f);
// 规则层探针有的输出「N passed, 0 failed」，有的输出「全部通过」：两种都认
const ok = fails.length === 0 && (r.status === 0 || /0 failed|全部通过/.test(line));
console.log(ok ? 'PASS  装备特性（8 方向 / 最多 3 条）' : 'FAIL  装备特性探针未通过');
process.exit(ok ? 0 : 1);
