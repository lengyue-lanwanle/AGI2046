// 线上自检：部署完跑一次，把「看起来能开」变成 7 条硬指标。
// 用法：node tools/deploy/check.mjs https://game.example.com
//       node tools/deploy/check.mjs http://1.2.3.4
// 退出码：0 全过 / 1 有失败（可直接塞进 CI 或 uptime 检查）

const base = (process.argv[2] || '').replace(/\/$/, '');
if (!base) {
  console.error('用法: node tools/deploy/check.mjs https://game.example.com');
  process.exit(2);
}

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? '  — ' + detail : ''}`);
};

async function head(path) {
  const r = await fetch(base + path, { method: 'GET', redirect: 'manual' });
  return r;
}

async function main() {
  console.log(`\n检查 ${base}\n`);

  // 1. 健康检查：ok:true 且 version 有值
  try {
    const r = await fetch(base + '/api/health');
    const j = await r.json();
    record('health', r.ok && j.ok === true, `version ${j.version} · lastSaveError ${j.lastSaveError ?? 'null'}`);
  } catch (e) {
    record('health', false, String(e.message || e));
  }

  // 2. meta 有 16 个角色（服务端数据没缺）
  try {
    const j = await (await fetch(base + '/api/meta')).json();
    record('meta', Array.isArray(j.characters) && j.characters.length >= 16,
      `${j.characters?.length ?? 0} 名角色 · ${j.skills?.length ?? 0} 个技能`);
  } catch (e) {
    record('meta', false, String(e.message || e));
  }

  // 3. 入口页必须是 no-cache（否则 ?v= 升级不生效）
  try {
    const r = await head('/');
    const cc = r.headers.get('cache-control') || '';
    record('index no-cache', /no-cache|no-store/.test(cc), cc || '(无 Cache-Control)');
  } catch (e) {
    record('index no-cache', false, String(e.message || e));
  }

  // 4. 带 ?v= 的静态资源必须是 immutable 长缓存
  try {
    const html = await (await head('/')).text();
    const m = /js\/app\.js\?v=(\d+)/.exec(html);
    if (!m) throw new Error('index.html 里没找到 js/app.js?v=');
    const r = await head(`/js/app.js?v=${m[1]}`);
    const cc = r.headers.get('cache-control') || '';
    record('versioned immutable', /immutable/.test(cc), `v=${m[1]} · ${cc || '(无 Cache-Control)'}`);
  } catch (e) {
    record('versioned immutable', false, String(e.message || e));
  }

  // 5. 文本资源要压缩（Brotli 优先，Gzip 也算过）
  try {
    const r = await fetch(base + '/js/app.js', { headers: { 'accept-encoding': 'br, gzip' } });
    const enc = r.headers.get('content-encoding') || '';
    const len = Number(r.headers.get('content-length') || 0);
    record('compression', /br|gzip/.test(enc), enc ? `${enc} · ${len ? Math.round(len / 1024) + 'KB' : 'chunked'}` : '(没压缩)');
  } catch (e) {
    record('compression', false, String(e.message || e));
  }

  // 6. 字体和 WebP 的 MIME 必须对（类型错的话浏览器会静默不加载）
  try {
    const font = await head('/fonts/noto-sans-sc.woff2');
    const webp = await head('/assets/portraits3d/claude.webp');
    const ft = font.headers.get('content-type') || '';
    const wt = webp.headers.get('content-type') || '';
    record('mime', font.ok && /woff2/.test(ft) && webp.ok && /webp/.test(wt), `${ft} / ${wt}`);
  } catch (e) {
    record('mime', false, String(e.message || e));
  }

  // 7. 能建房（联机主链路；只建不玩，不落存档）
  try {
    const r = await fetch(base + '/api/room/create', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    });
    const j = await r.json();
    record('room create', r.ok && /^[A-Z0-9]{6}$/.test(j.code || ''), j.code ? `房间码 ${j.code}` : JSON.stringify(j).slice(0, 80));
  } catch (e) {
    record('room create', false, String(e.message || e));
  }

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} 通过${failed.length ? '，失败：' + failed.map(f => f.name).join(', ') : ''}\n`);
  process.exit(failed.length ? 1 : 0);
}

main();
