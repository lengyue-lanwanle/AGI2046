// 一键公网隧道：把本机 5178 暴露到公网，并把地址写进 data/tunnel.json
// 用法：node tools/tunnel.mjs                 （默认 Cloudflare Quick Tunnel，无中转警告页）
//       node tools/tunnel.mjs serveo          （ssh 反向隧道，零依赖兜底）
//       node tools/tunnel.mjs localhost.run
// 停止：Ctrl+C，会清理 data/tunnel.json
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PORT = process.env.PORT || 5178;
const PROVIDER = process.argv[2] || process.env.TUNNEL || 'cloudflare';

const CLOUDFLARED_LOCAL = path.resolve('tools/bin/cloudflared.exe');

const TARGETS = {
  cloudflare: {
    label: 'Cloudflare Quick Tunnel',
    bin: fs.existsSync(CLOUDFLARED_LOCAL) ? CLOUDFLARED_LOCAL : 'cloudflared',
    args: ['tunnel', '--url', `http://localhost:${PORT}`, '--no-autoupdate'],
    pattern: /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i
  },
  serveo: {
    label: 'serveo.net（ssh）',
    bin: 'ssh',
    args: ['-T', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ServerAliveInterval=30', '-o', 'ExitOnForwardFailure=yes', '-R', `80:localhost:${PORT}`, 'serveo.net'],
    pattern: /https:\/\/[a-z0-9-]+\.serveousercontent\.com/i
  },
  'localhost.run': {
    label: 'localhost.run（ssh）',
    bin: 'ssh',
    args: ['-T', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ServerAliveInterval=30', '-o', 'ExitOnForwardFailure=yes', '-R', `80:localhost:${PORT}`, 'nokey@localhost.run'],
    pattern: /https:\/\/[a-z0-9-]+\.lhr\.life/i
  }
};

const target = TARGETS[PROVIDER];
if (!target) {
  console.error(`未知隧道服务：${PROVIDER}（可选：${Object.keys(TARGETS).join(' / ')}）`);
  process.exit(1);
}

const outFile = path.resolve('data/tunnel.json');
fs.mkdirSync(path.dirname(outFile), { recursive: true });

console.log(`[tunnel] ${target.label} → localhost:${PORT}`);

const child = spawn(target.bin, target.args, { stdio: ['ignore', 'pipe', 'pipe'] });

let announced = null;

function handleChunk(buf) {
  const text = buf.toString();
  process.stdout.write(text);
  if (announced) return;
  const match = text.match(target.pattern);
  if (!match) return;
  announced = match[0];
  const info = { url: announced, provider: PROVIDER, port: Number(PORT), startedAt: new Date().toISOString() };
  fs.writeFileSync(outFile, JSON.stringify(info, null, 2));
  console.log('\n──────────────────────────────────────────────');
  console.log(`[tunnel] 公网地址： ${announced}`);
  console.log('[tunnel] 已写入 data/tunnel.json，服务端会通过 /api/health 和 /api/meta 返回它');
  console.log('[tunnel] 把这个地址 + 房间码发给朋友即可');
  console.log('──────────────────────────────────────────────\n');
}

child.stdout.on('data', handleChunk);
child.stderr.on('data', handleChunk);

function cleanup() {
  try { fs.unlinkSync(outFile); } catch { /* 忽略 */ }
  try { child.kill(); } catch { /* 忽略 */ }
  console.log('\n[tunnel] 已关闭');
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
child.on('exit', code => {
  try { fs.unlinkSync(outFile); } catch { /* 忽略 */ }
  console.error(`[tunnel] 隧道进程退出（code ${code}）。可改用 node tools/tunnel.mjs serveo`);
  process.exit(code ?? 1);
});
