// 0.23 事件后果 / 关系 / 章节回顾：跑规则层探针，断言全通过
// 规则细节在 tools/audit/memory-probe.cs；这里只负责「一条命令能验」。
import { spawnSync } from 'node:child_process';

const r = spawnSync('dotnet', ['run', 'tools/audit/memory-probe.cs'], {
  cwd: process.cwd(), encoding: 'utf8', timeout: 300000
});
const out = `${r.stdout || ''}${r.stderr || ''}`;
const fails = out.split('\n').filter(l => l.startsWith('FAIL'));
const line = out.split('\n').find(l => l.includes('passed')) || '';
if (line) console.log(line.trim());
for (const f of fails) console.log(f);
console.log(fails.length === 0 && /0 failed/.test(line)
  ? 'PASS  事件后果 / 关系 / 章节回顾'
  : 'FAIL  事件后果探针未通过');
process.exit(fails.length === 0 && (r.status === 0 || /0 failed|全部通过/.test(line)) ? 0 : 1);
