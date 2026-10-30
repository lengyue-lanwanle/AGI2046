// 打一个「拿到服务器上就能 docker build」的包，不依赖 git 远端。
// 用法：node tools/deploy/pack.mjs
// 产物：dist/agi2046-deploy-<时间戳>.tar.gz
//
// 只装部署真正需要的东西：src/、web/、Dockerfile、.dockerignore、deploy/、tools/deploy/。
// 不带 .git（114MB 历史）、data/（存档）、bin/obj（本机编译产物）、docs/（20M 截图）。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive: true });

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
const outName = `agi2046-deploy-${stamp}.tar.gz`;
const out = path.join(dist, outName);
const relOut = path.join('dist', outName);   // tar 用相对路径：Windows 上绝对路径会被当成 主机:文件

const include = [
  'src',
  'web',
  'deploy',
  'Dockerfile',
  '.dockerignore',
  'fly.toml',
  path.join('tools', 'deploy')
];

// 显式排除：本机编译产物和运行期数据绝不能进包
const exclude = [
  '*/bin/*', '*/obj/*', 'bin', 'obj',
  'data', '*.log', '.git', 'node_modules'
];

const args = ['-czf', relOut, ...exclude.flatMap(p => ['--exclude', p]), ...include];
console.log('打包：', include.join(' '));
execFileSync('tar', args, { cwd: root, stdio: 'inherit' });

const mb = (fs.statSync(out).size / 1024 / 1024).toFixed(1);
console.log(`\n完成：dist/${outName}  (${mb} MB)`);
console.log(`
传到服务器（把 <IP> 换成你的）：

  scp "dist/${outName}" root@<IP>:/tmp/
  ssh root@<IP> 'mkdir -p /srv/agi2046 && tar -xzf /tmp/${outName} -C /srv/agi2046'
  ssh root@<IP> 'cd /srv/agi2046/deploy && echo "DOMAIN=:80" > .env && docker compose up -d --build'

更新时重复上面三步即可（记得先备份 /data 卷）。
`);
