// 把 web/index.html 里的 ?v= 缓存版本统一升一级
// 用法：node tools/bump-web-version.mjs
import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('web/index.html');
const html = fs.readFileSync(file, 'utf8');
const versions = [...html.matchAll(/\?v=(\d+)/g)].map(m => Number(m[1]));
if (!versions.length) {
  console.error('index.html 里没有找到 ?v= 版本号');
  process.exit(1);
}
const next = Math.max(...versions) + 1;
const updated = html.replace(/\?v=\d+/g, `?v=${next}`);
fs.writeFileSync(file, updated);
console.log(`?v= → ${next}（共 ${versions.length} 处）`);
