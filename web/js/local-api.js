/* 单机版（GitHub Pages）本地 API 适配层。
 *
 * 作用：把 app.js 里那 8 个 /api/* 的 fetch 拦下来，转给浏览器里的 C# 规则引擎
 *      （window.agiBridge，由 src/AGI2046.Wasm 编译的 WASM 提供），存档写 localStorage。
 *
 * 只在 index.html 里设了 window.AGI_LOCAL 时生效——服务端版本加载同一份文件也不会被劫持。
 */
(function () {
  if (!window.AGI_LOCAL) return;

  const KEY = {
    profile: 'agi2046.pages.profile',
    sessions: 'agi2046.pages.sessions',
    runs: 'agi2046.pages.runs'
  };
  const MAX_SAVES = 3;            // localStorage 5MB，一局 ~58KB，留点余量
  const nativeFetch = window.fetch.bind(window);

  const read = (k, def) => {
    try { return JSON.parse(localStorage.getItem(k) ?? 'null') ?? def; } catch { return def; }
  };
  const write = (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; }
  };

  function profile() {
    return read(KEY.profile, {
      tutorialCompleted: false, tutorialCompletedAt: null, firstRun: true,
      unlockedIds: [], bestGrade: null, bestScore: 0, runs: 0, victories: 0
    });
  }

  function saveState(state) {
    if (!state?.sessionId) return;
    const all = read(KEY.sessions, {});
    all[state.sessionId] = state;
    const ids = Object.keys(all);
    if (ids.length > MAX_SAVES) {
      // 丢掉最旧的（对象插入顺序就是写入顺序）
      for (const id of ids.slice(0, ids.length - MAX_SAVES)) delete all[id];
    }
    if (!write(KEY.sessions, all)) console.warn('[local-api] 存档写入失败（localStorage 满了？）');
  }

  const loadState = id => read(KEY.sessions, {})[id] || null;
  function dropState(id) {
    const all = read(KEY.sessions, {});
    delete all[id];
    write(KEY.sessions, all);
  }

  /* ── 等 WASM 起来 ──────────────────────────────────────────────── */
  const ready = new Promise((resolve, reject) => {
    const t0 = Date.now();
    (function poll() {
      if (window.agiBridge && window.agiBridge.ready) return resolve(window.agiBridge);
      if (Date.now() - t0 > 60000) return reject(new Error('引擎加载超时'));
      setTimeout(poll, 120);
    })();
  });

  const reply = (body, status = 200, headers = {}) => new Response(
    typeof body === 'string' ? body : JSON.stringify(body),
    { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } }
  );

  const fail = (message, status = 400) => reply({ error: message }, status);

  /* ── 路由 ──────────────────────────────────────────────────────── */
  async function handle(url, pathname, init) {
    const bridge = await ready;
    const method = (init?.method || 'GET').toUpperCase();
    const body = init?.body ? JSON.parse(init.body) : {};

    // /api/meta
    if (pathname === '/api/meta' && method === 'GET') {
      return reply(await bridge.meta(profile().tutorialCompleted));
    }

    // /api/profile
    if (pathname === '/api/profile' && method === 'GET') return reply(profile());
    if (pathname === '/api/profile/tutorial-complete' && method === 'POST') {
      const p = profile();
      p.tutorialCompleted = true;
      p.tutorialCompletedAt = new Date().toISOString();
      p.firstRun = false;
      write(KEY.profile, p);
      return reply({ ok: true, tutorialCompleted: true });
    }

    // /api/runs：单机版没有行动记录，给空数组（标题页那段会自动隐藏）
    if (pathname === '/api/runs') return reply({ runs: read(KEY.runs, []) });

    // /api/new
    if (pathname === '/api/new' && method === 'POST') {
      const r = JSON.parse(await bridge.newGame(JSON.stringify(body)));
      if (!r.ok) return fail(r.error || '开局失败。');
      saveState(r.state);
      return reply(r.state);
    }

    // /api/tutorial/new（教学局不占存档位）
    if (pathname === '/api/tutorial/new' && method === 'POST') {
      const r = JSON.parse(await bridge.tutorialNew());
      if (!r.ok) return fail(r.error || '教学局开不起来。');
      return reply(r.state);
    }

    // /api/action
    if (pathname === '/api/action' && method === 'POST') {
      const r = JSON.parse(await bridge.act(JSON.stringify(body.action ?? {})));
      if (!r.ok) return fail(r.error || '行动失败。');
      saveState(r.state);
      return reply(r.state, 200, { 'x-state-revision': String(r.state.revision ?? 0) });
    }

    // /api/state?sessionId=
    if (pathname === '/api/state' && method === 'GET') {
      const id = new URL(url, location.origin).searchParams.get('sessionId');
      const state = loadState(id);
      if (!state) return fail('会话不存在或已过期。', 404);
      if (state.phase === 'victory' || state.phase === 'defeat') return fail('这条存档已经结束。', 404);
      await bridge.restore(JSON.stringify(state));
      return reply(state);
    }

    // DELETE /api/session/{id}
    if (pathname.startsWith('/api/session/') && method === 'DELETE') {
      const id = decodeURIComponent(pathname.split('/').pop());
      dropState(id);
      await bridge.drop();
      return reply({ ok: true });
    }

    // 联机在单机版里没有：明确告诉用户，而不是静默失败
    if (pathname.startsWith('/api/room/')) {
      return fail('离线版没有联机房间。要和朋友一起玩，请用腾讯云那台。', 503);
    }

    return fail('这个接口在离线版里没有实现：' + pathname, 501);
  }

  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input?.url || String(input));
    let pathname;
    try { pathname = new URL(url, location.origin).pathname; } catch { return nativeFetch(input, init); }

    // /api 之外（_framework、图片、字体）一律走原生 fetch
    if (!pathname.startsWith('/api/')) return nativeFetch(input, init);

    return handle(url, pathname, init).catch(err => {
      console.error('[local-api]', pathname, err);
      return reply({ error: String(err?.message || err) }, 500);
    });
  };

  /* ── 离线版该藏起来的东西 ──────────────────────────────────────── */
  window.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = `
      #btn-room-create, #btn-room-join, #btn-room-start, #btn-assist, #btn-challenge { display: none !important; }
      .title-footer::after {
        content: ' · OFFLINE BUILD（单机版，存档只在这台设备）';
        color: #ffd166;
      }`;
    document.head.appendChild(style);
  });

  console.info('[local-api] 离线版适配层已启用');
})();
