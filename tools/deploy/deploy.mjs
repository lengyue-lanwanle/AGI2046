// 一条命令发布：本地打包 → scp 上传 → 服务器解压并启动 → 远程验收。
//
// 用法：
//   node tools/deploy/deploy.mjs root@1.2.3.4                  # 无域名，用 IP:80
//   node tools/deploy/deploy.mjs root@1.2.3.4 game.xxx.com     # 有域名，自动 HTTPS
//
// 前提：本机有 ssh / scp（Windows 10+ 自带 OpenSSH，无需额外安装），
//       服务器上 Docker 已装好（deploy/vps-setup.sh 干这事）。
// 交互式跑：ssh 如果要输密码，会正常提示你。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [target, domain] = process.argv.slice(2);
if (!target || !target.includes('@')) {
  console.error('用法: node tools/deploy/deploy.mjs root@<IP> [域名]');
  process.exit(2);
}
const host = target.split('@').pop();
const root = path.resolve(import.meta.dirname, '..', '..');
const domainArg = domain || ':80';
const url = domain ? `https://${domain}` : `http://${host}`;

const step = (n, msg) => console.log(`\n\x1b[36m== ${n}. ${msg}\x1b[0m`);
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit' });

step(1, '本地打包');
run(process.execPath, [path.join(root, 'tools', 'deploy', 'pack.mjs')]);

const newest = fs.readdirSync(path.join(root, 'dist'))
  .filter(f => f.startsWith('agi2046-deploy-') && f.endsWith('.tar.gz'))
  .map(f => ({ f, t: fs.statSync(path.join(root, 'dist', f)).mtimeMs }))
  .sort((a, b) => b.t - a.t)[0];
if (!newest) { console.error('dist/ 里没有包'); process.exit(1); }
const local = path.join(root, 'dist', newest.f);
console.log(`使用 ${newest.f} (${(fs.statSync(local).size / 1048576).toFixed(1)} MB)`);

step(2, `上传到 ${target}:/tmp/`);
run('scp', [local, `${target}:/tmp/`]);

step(3, `服务器上解压 + 启动（DOMAIN=${domainArg}）`);
const remote = [
  'mkdir -p /srv/agi2046',
  `tar -xzf /tmp/${newest.f} -C /srv/agi2046`,
  `bash /srv/agi2046/deploy/bootstrap.sh ${domainArg}`
].join(' && ');
run('ssh', [target, remote]);

step(4, `远程验收 ${url}`);
try {
  run(process.execPath, [path.join(root, 'tools', 'deploy', 'check.mjs'), url]);
} catch {
  console.error('\n验收没过。先看这两个：');
  console.error(`  ssh ${target} 'cd /srv/agi2046/deploy && docker compose ps'`);
  console.error(`  ssh ${target} 'cd /srv/agi2046/deploy && docker compose logs --tail=60 caddy'`);
  process.exit(1);
}

console.log(`\n\x1b[32m上线完成：${url}\x1b[0m`);
console.log('把地址和房间码发给朋友即可。');
