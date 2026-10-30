// 0.24 三个差异化 Boss：跑规则层探针（拍卖 / 学习 / 协议覆写）
import { spawnSync } from 'node:child_process';

const r = spawnSync('dotnet', ['run', 'tools/audit/boss-probe.cs'], {
  cwd: process.cwd(), encoding: 'utf8', timeout: 300000
});
const out = `${r.stdout || ''}${r.stderr || ''}`;
const fails = out.split('\n').filter(l => l.startsWith('FAIL'));
const line = out.split('\n').find(l => l.includes('passed')) || '';
if (line) console.log(line.trim());
for (const f of fails) console.log(f);
// 规则层探针有的输出「N passed, 0 failed」，有的输出「全部通过」：两种都认
const ok = fails.length === 0 && (r.status === 0 || /0 failed|全部通过/.test(line));
console.log(ok ? 'PASS  首领机制（拍卖 / 学习 / 协议覆写）' : 'FAIL  首领机制探针未通过');
process.exit(ok ? 0 : 1);
