// 一键联机：起服务（如果没起）+ 起公网隧道，把地址打出来。
// 用法：node tools/online.mjs            （Cloudflare Quick Tunnel，默认）
//       node tools/online.mjs serveo     （ssh 反向隧道兜底）
// 停止：Ctrl+C，会把这次起的服务和隧道一起关掉。
import { spawn } from 'node:child_process';
import net from 'node:net';

const PORT = Number(process.env.PORT || 5178);
const PROVIDER = process.argv[2] || process.env.TUNNEL || '';
const children = [];

function probePort() {
  return new Promise(resolve => {
    const sock = net.connect({ port: PORT, host: '127.0.0.1' });
    const done = ok => { try { sock.destroy(); } catch { /* 忽略 */ } resolve(ok); };
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
    setTimeout(() => done(false), 900);
  });
}

async function waitHealthy(ms = 45000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (r.ok) return true;
    } catch { /* 还没起来 */ }
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

function shutdown() {
  for (const c of children) {
    try { c.kill(); } catch { /* 忽略 */ }
  }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('============================================================');
console.log('  零号协议 2046  /  联机启动器');
console.log('============================================================');
console.log('');
console.log('  地址出来后，把「地址 + 房间码」发给朋友即可。');
console.log('  停止：按 Ctrl+C，或直接关闭本窗口。');
console.log('  这个窗口要一直开着，关了就断了。');
console.log('');

const already = await probePort();
if (already) {
  console.log(`[online] 端口 ${PORT} 已有服务在跑，直接复用`);
} else {
  console.log(`[online] 启动服务端（端口 ${PORT}），首次编译可能要半分钟…`);
  const server = spawn('dotnet', ['run', '--project', 'src/AGI2046.Server', '--urls', `http://localhost:${PORT}`], {
    stdio: ['ignore', 'ignore', 'inherit']
  });
  children.push(server);
  const ok = await waitHealthy();
  if (!ok) {
    console.error('[online] 服务端没起来，先单独跑一次 `dotnet run --project src/AGI2046.Server` 看报错');
    shutdown();
  }
  console.log('[online] 服务端就绪');
}

console.log('[online] 开公网隧道…');
const args = ['tools/tunnel.mjs'];
if (PROVIDER) args.push(PROVIDER);
const tunnel = spawn('node', args, { stdio: 'inherit' });
children.push(tunnel);

tunnel.on('exit', code => {
  console.log(`[online] 隧道退出（code ${code}）`);
  shutdown();
});
