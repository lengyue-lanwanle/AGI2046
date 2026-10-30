/* ═══════════════════════════════════════════════════════════════════
   零号协议 2046 — CG 播放层（预渲染视频）
   为什么是「整屏不透明」而不是透明叠加：
     Safari/iOS 不播 WebM 的 alpha，Chrome 不认 HEVC 的 alpha。想要全平台透明视频，
     只能逐帧导出 PNG 序列走 canvas——5 秒 720p 就是几十 MB，不划算。
     所以视频只做整屏过场，文字与按钮仍然用 DOM 盖在上面（中文排版、跳过、可访问性都在 DOM 里）。
   失败策略：任何一步出问题（没文件 / 解码失败 / 8 秒还没 canplay）都直接放行，
     让调用方继续走原来的流程。视频是加分项，不能变成卡住游戏的门。
   ═══════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  /* 片单：加一条 = 放一个 mp4 到 assets/cg/ 并在这里登记。
     poster 用首帧导出的 webp，视频还没到时至少有一张静帧，不会白屏。
     留空 = 整套逻辑静默跳过，游戏照常走原来的流程。 */
  const CLIPS = {
    // 开场：雨夜霓虹港推镜，5 秒，720p / 850KB。
    // 生成时左上角有「AI生成」水印，prep.py 用 --crop 48,0,0,0 裁掉了。
    intro: { src: 'assets/cg/intro.mp4', poster: 'assets/cg/intro.webp', title: '霓虹港 · 2046', sub: 'NEON HARBOR' },
  };

  const SEEN_KEY = 'agi2046.seenCG';
  const host = () => document.getElementById('cg-layer');
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = () => !!(navigator.connection && navigator.connection.saveData);

  /* 诊断：为什么没播。手机上「看不到 CG」九成是这里给出的原因之一
     （reduce-motion / save-data / seen / 解码失败），不要靠猜。 */
  let last = null;

  function seen(id) {
    try { return !!JSON.parse(localStorage.getItem(SEEN_KEY) || '{}')[id]; } catch { return false; }
  }
  function markSeen(id) {
    try {
      const m = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}');
      m[id] = 1;
      localStorage.setItem(SEEN_KEY, JSON.stringify(m));
    } catch { /* 隐私模式忽略 */ }
  }

  /**
   * 播一条 CG。
   * @returns true  = 已接管画面，调用方要等 onEnd
   *          false = 没播（没登记 / 减少动态 / 省流量 / 已看过），调用方直接继续
   */
  function play(id, opts = {}) {
    const clip = CLIPS[id];
    const box = host();
    const deny = (why) => { last = { id, played: false, why, at: Date.now() }; return false; };
    if (!clip) return deny('no-clip');
    if (!box) return deny('no-host');
    // force = 用户自己点的「播放开场」，那是明确意图，无障碍与省流量设置不再拦
    if (!opts.force && reduced()) return deny('reduced-motion');
    if (!opts.force && saveData()) return deny('save-data');
    if (!opts.force && seen(id)) return deny('seen');

    last = { id, played: true, why: '', at: Date.now() };
    let closed = false;
    let ready = false;

    const root = document.createElement('div');
    root.className = 'cg';
    root.dataset.clip = id;
    root.innerHTML = `
      <video class="cg-video" muted playsinline preload="auto"
             ${clip.poster ? `poster="${clip.poster}"` : ''}></video>
      <div class="cg-grade"></div>
      ${clip.title ? `<div class="cg-title"><span>${clip.sub || ''}</span><b>${clip.title}</b></div>` : ''}
      <button class="cg-skip" type="button">跳过 <em>ESC</em></button>
      <button class="cg-tap" type="button">▶ 点击播放</button>
      <div class="cg-loading"><i></i></div>`;

    const video = root.querySelector('video');
    const bar = root.querySelector('.cg-skip');
    let guard = null;
    let needsTap = false;

    function unbind() {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVis);
      clearTimeout(guard);
    }

    function finish(why) {
      if (closed) return;
      closed = true;
      unbind();
      try { video.pause(); } catch { /* 可能已经结束 */ }
      // 释放解码器：手机上同时挂着几个 video 会抢硬件解码器
      video.removeAttribute('src');
      video.load();
      root.classList.add('out');
      setTimeout(() => root.remove(), 320);
      last = { id, played: true, why, at: Date.now() };
      // 只有「真的放完」或「用户主动跳过」才算看过。
      // 解码失败 / 超时 / iOS 低电量模式拦截自动播放，都不该把这条片子永久吞掉。
      if (why === 'ended' || why === 'skip') markSeen(id);
      if (opts.onEnd) opts.onEnd(why);
    }

    // 兜底：8 秒还没能播就放弃（弱网下别让玩家盯着黑屏）
    guard = setTimeout(() => { if (!ready) finish('timeout'); }, 8000);

    // iOS 低电量模式会直接拒掉自动播放（即使 muted + playsinline）。
    // 这时不要静默跳过：露出海报和「点击播放」，把决定权交给用户。
    function needsGesture() {
      needsTap = true;
      root.classList.add('tap');
      bar.classList.remove('armed');
    }

    video.addEventListener('canplay', () => {
      ready = true;
      root.classList.add('ready');
      video.play().catch(needsGesture);
    }, { once: true });
    video.addEventListener('ended', () => finish('ended'), { once: true });
    video.addEventListener('error', () => finish('error'), { once: true });

    root.addEventListener('click', (e) => {
      if (e.target.closest('.cg-skip')) { e.stopPropagation(); finish('skip'); return; }
      // 被浏览器拦了自动播放：这一下是「播放」，不是「跳过」
      if (needsTap) {
        needsTap = false;
        root.classList.remove('tap');
        video.play().then(() => { clearTimeout(guard); }).catch(() => { needsTap = true; root.classList.add('tap'); });
        return;
      }
      // 点画面：第一次显示「再点一次跳过」，第二次才真跳，避免误触
      if (root.dataset.armed === '1') finish('skip');
      else { root.dataset.armed = '1'; bar.classList.add('armed'); }
    });

    function onKey(e) {
      if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        finish('skip');
      }
    }
    function onVis() {
      if (document.hidden) video.pause();
      else video.play().catch(() => {});
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVis);

    video.src = clip.src;
    box.append(root);
    requestAnimationFrame(() => root.classList.add('in'));
    return true;
  }

  window.CG = {
    play,
    has: (id) => !!CLIPS[id],
    seen,
    clips: () => Object.keys(CLIPS),
    /** 上一次 play 的结果：{ id, played, why } —— 排查「为什么没播」用 */
    status: () => last,
    /** 清掉已看标记（设置里想重看时用；不传 id 就全清） */
    forget(id) {
      try {
        if (id) {
          const m = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}');
          delete m[id];
          localStorage.setItem(SEEN_KEY, JSON.stringify(m));
        } else localStorage.removeItem(SEEN_KEY);
      } catch { /* 隐私模式忽略 */ }
    },
    /** 运行时登记一条片子（本地试片 / A-B 用）。传 null 取消登记。 */
    register(id, clip) {
      if (clip) CLIPS[id] = clip;
      else delete CLIPS[id];
    }
  };
})();
