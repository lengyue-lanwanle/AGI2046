/* ═══════════════════════════════════════════════════════════════════
   零号协议 2046 — VN 舞台（R2）
   设计口径见 docs/PLAN-VN.md / docs/PLAN-0.18.md 第 6 节：
   - 全屏 DOM 舞台，不用 WebGL；文字/按钮留在 DOM，可访问、可翻译；
   - 最多 3 人同屏，非说话人压暗，说话人微推近；
   - 说话人 = 立绘 + 呼吸 + 差分（有差分图就换图，没有就用程序化情绪层）；
   - AUTO / 记录 / 跳过；系统开「减少动态」时取消逐字与位移。
   谁在说话、说什么，全部来自 story.js；这里只管演。
   ═══════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const layer = document.getElementById('vn-layer');
  if (!layer || !window.STORY) return;

  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };

  const EMO_CLASS = new Set(['calm', 'smile', 'serious', 'angry', 'worry', 'surprise']);

  const state = {
    scene: null,
    line: 0,
    open: false,
    typing: false,
    typeTimer: null,
    auto: false,
    autoTimer: null,
    log: [],
    root: null,
    nodes: {},
    onEnd: null,
    onLine: null,
    readOnly: false,
    ended: false
  };

  /* ── 舞台构建 ───────────────────────────────────────────── */
  function buildScene(scene) {
    const root = el('div', 'vn');
    root.dataset.scene = scene.id;

    const stage = el('div', 'vn-scene');
    const bg = el('div', 'vn-bg');
    const bgAlt = el('div', 'vn-bg vn-bg-alt');
    const grade = el('div', 'vn-grade');
    const figures = el('div', 'vn-figures');
    stage.append(bg, bgAlt, grade, figures);

    const top = el('div', 'vn-top');
    top.innerHTML = `
      <div class="vn-chapter"><span class="vn-dot"></span>${esc(scene.chapter || '')}</div>
      <div class="vn-title">${esc(scene.title || '')}${scene.subtitle ? `<em>${esc(scene.subtitle)}</em>` : ''}</div>`;

    const tools = el('div', 'vn-tools');
    tools.innerHTML = `
      <button class="vn-tool" data-vn="auto" title="自动播放（A）">AUTO</button>
      <button class="vn-tool" data-vn="log" title="对话记录（L）">记录</button>
      <button class="vn-tool" data-vn="skip" title="跳过本场（Esc）">跳过</button>`;

    const box = el('div', 'vn-box');
    box.innerHTML = `
      <div class="vn-name"><span></span></div>
      <div class="vn-text"></div>
      <div class="vn-next" aria-hidden="true">▼</div>`;
    const choices = el('div', 'vn-choices hidden');

    const logPanel = el('div', 'vn-log hidden');
    logPanel.innerHTML = `<div class="vn-log-head"><b>对话记录</b><button class="vn-log-close" data-vn="log-close">关闭</button></div><div class="vn-log-body"></div>`;

    root.append(stage, top, tools, box, choices, logPanel);
    layer.append(root);

    state.root = root;
    state.nodes = { root, stage, bg, bgAlt, grade, figures, top, tools, box, choices, logPanel, text: box.querySelector('.vn-text'), name: box.querySelector('.vn-name span'), next: box.querySelector('.vn-next') };
    renderCast(scene);
    setBg(scene.bg);
  }

  function bgUrl(key) {
    const map = window.STORY.BG;
    return map[key] || key || '';
  }

  function setBg(key, instant) {
    const url = bgUrl(key);
    const { bg, bgAlt, root } = state.nodes;
    if (!url) return;
    // 交叉淡入：新图放 alt 层，加载完成后交换
    const img = new Image();
    img.onload = () => {
      if (!state.open) return;
      if (instant || !bg.style.backgroundImage) {
        bg.style.backgroundImage = `url('${url}')`;
        bgAlt.style.backgroundImage = '';
        return;
      }
      bgAlt.style.backgroundImage = `url('${url}')`;
      bgAlt.classList.add('in');
      setTimeout(() => {
        bg.style.backgroundImage = `url('${url}')`;
        bgAlt.classList.remove('in');
        bgAlt.style.backgroundImage = '';
      }, 320);
    };
    img.onerror = () => {
      // 缺图退回该幕的主视觉，再缺就留纯色——不让一场戏因为一张图黑屏
      const fb = (window.STORY.BG.fallback || {})[key];
      if (fb && bg.style.backgroundImage.indexOf(fb) === -1) setBg(fb, instant);
    };
    img.src = url;
    root.dataset.bg = key;
  }

  function renderCast(scene) {
    const figures = state.nodes.figures;
    figures.innerHTML = '';
    const cast = (scene.cast || []).slice(0, 3);
    figures.dataset.count = String(cast.length);
    figures.classList.toggle('has-plate', cast.some(id => window.STORY.speaker(id).plate));
    cast.forEach((id, i) => {
      const info = window.STORY.speaker(id);
      const node = el('div', 'vn-char');
      node.dataset.who = id;
      node.dataset.emo = 'calm';
      // 每个角色不同的呼吸相位，避免三个人一起「齐步呼吸」
      node.style.setProperty('--phase', `${(hash(id) % 100) / 100 * -3.2}s`);
      node.style.setProperty('--slot', String(i));
      node.style.setProperty('--tilt', `${((hash(id) % 5) - 2) * 0.35}deg`);
      if (info.plate) {
        node.classList.add('plate');
        node.innerHTML = `<div class="vn-plate"><img src="${esc(info.portrait)}" alt="${esc(info.name)}" draggable="false" /></div>`;
      } else if (info.portrait) {
        node.innerHTML = `<div class="vn-fig"><img src="${esc(info.portrait)}" alt="${esc(info.name)}" draggable="false" /></div>
          <div class="vn-emo" aria-hidden="true"></div>`;
      } else {
        node.classList.add('glyph');
        node.innerHTML = `<div class="vn-glyph" style="--c:${esc(info.color || '#5ed8ff')}">${esc((info.name || '?').slice(0, 1))}</div>`;
      }
      node.style.setProperty('--c', info.color || '#5ed8ff');
      figures.append(node);
    });
  }

  /* ── 说话人 ─────────────────────────────────────────────── */
  function focusSpeaker(whoId, emo) {
    const { figures, stage } = state.nodes;
    const chars = [...figures.querySelectorAll('.vn-char')];
    let focus = null;
    chars.forEach((n) => {
      const on = n.dataset.who === whoId;
      n.classList.toggle('speaking', on);
      n.classList.toggle('muted', !on && !!whoId);
      if (on) focus = n;
    });
    if (focus && emo && EMO_CLASS.has(emo)) {
      focus.dataset.emo = emo;
      applyDiff(focus, whoId, emo);
    } else if (focus) {
      focus.dataset.emo = 'calm';
      applyDiff(focus, whoId, 'calm');
    }
    const n = chars.length;
    stage.dataset.count = String(n);
    stage.dataset.focus = focus ? focus.style.getPropertyValue('--slot') : '-1';
    stage.classList.toggle('narration', !whoId);
  }

  // 有真差分图就换 <img>，没有就用程序化情绪层（CSS 控制 .vn-emo 与滤镜）
  const diffCache = new Set();
  function applyDiff(node, whoId, emo) {
    const img = node.querySelector('.vn-fig img');
    if (!img) return;
    const base = window.STORY.speaker(whoId).portrait || '';
    if (!base || emo === 'calm') { img.src = base; return; }
    // 只有 STORY.DIFF 里登记过的角色才去试差分文件；否则 16 人 × 5 表情会打一堆 404
    const registered = window.STORY.DIFF && window.STORY.DIFF[whoId];
    if (!registered || !registered.includes(emo)) { img.src = base; return; }
    const guess = base.replace(/\.webp$/, `-${emo}.webp`);
    if (diffCache.has(guess)) { img.src = guess; return; }
    const probe = new Image();
    probe.onload = () => { diffCache.add(guess); if (node.dataset.emo === emo) img.src = guess; };
    probe.src = guess;
  }

  /* ── 逐字 ───────────────────────────────────────────────── */
  function typeText(text, done) {
    const node = state.nodes.text;
    node.textContent = '';
    state.typing = true;
    state.nodes.next.classList.remove('on');
    if (reduced()) {
      node.textContent = text;
      state.typing = false;
      state.nodes.next.classList.add('on');
      done && done();
      return;
    }
    let i = 0;
    const step = () => {
      if (!state.typing) return;
      // 标点后稍作停顿，读起来有呼吸
      const ch = text[i - 1] || '';
      const delay = /[，。！？…—]/.test(ch) ? 76 : (/[、；：]/.test(ch) ? 52 : 20);
      node.textContent = text.slice(0, ++i);
      if (i >= text.length) {
        state.typing = false;
        state.nodes.next.classList.add('on');
        done && done();
        return;
      }
      state.typeTimer = setTimeout(step, delay);
    };
    step();
  }

  function finishTyping() {
    clearTimeout(state.typeTimer);
    state.typing = false;
    const line = currentLine();
    if (line) state.nodes.text.textContent = line.text || '';
    state.nodes.next.classList.add('on');
  }

  const currentLine = () => state.scene?.lines?.[state.line] || null;

  /* ── 渲染一行 ───────────────────────────────────────────── */
  function renderLine(idx) {
    const scene = state.scene;
    if (!scene) return;
    const line = scene.lines[idx];
    if (!line) return finishScene();

    // 中途换景 / 换镜头 / 特效
    if (line.bg) setBg(line.bg);
    if (line.cam) state.nodes.stage.dataset.cam = line.cam;
    if (line.fx) playFx(line.fx);

    if (line.choice) return renderChoice(line.choice);

    const info = line.who ? window.STORY.speaker(line.who) : null;
    const nameNode = state.nodes.box.querySelector('.vn-name');
    if (line.who && info && info.name) {
      nameNode.classList.add('on');
      nameNode.querySelector('span').textContent = info.name;
      nameNode.style.setProperty('--c', info.color || '#5ed8ff');
      state.nodes.box.classList.toggle('boss', !!info.plate);
    } else {
      nameNode.classList.remove('on');
      state.nodes.box.classList.remove('boss');
    }
    state.nodes.box.classList.toggle('narration', !line.who);

    focusSpeaker(line.who || null, line.emo || 'calm');
    state.nodes.stage.dataset.cam = line.cam || pickCam(line.who);

    const text = line.text || '';
    typeText(text, () => {
      if (state.onLine) state.onLine(idx, line);
      scheduleAuto(text);
    });
    state.log.push({ who: info && info.name ? info.name : '', text, color: info?.color || '' });
    if (state.log.length > 400) state.log.shift();
  }

  function pickCam(whoId) {
    if (!whoId) return 'wide';
    return 'near';
  }

  function renderChoice(list) {
    const box = state.nodes.choices;
    box.innerHTML = `<div class="vn-choice-head">选择</div>` + list.map((c, i) =>
      `<button class="vn-choice" data-choice="${i}">
         <b>${esc(c.text)}</b>${c.hint ? `<em>${esc(c.hint)}</em>` : ''}
       </button>`).join('');
    box.classList.remove('hidden');
    state.nodes.next.classList.remove('on');
    box.querySelectorAll('[data-choice]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const c = list[Number(btn.dataset.choice)];
        box.classList.add('hidden');
        state.log.push({ who: '', text: `→ ${c.text}`, color: '#ffc857' });
        if (c.then) {
          const next = window.STORY.get(c.then);
          if (next) {
            // 直接接下一场：不触发本场的 onEnd，否则结算面板会抢在结局前弹出
            const keepEnd = state.onEnd;
            const keepLine = state.onLine;
            const keepRead = state.readOnly;
            close(true);
            setTimeout(() => play(c.then, { onEnd: keepEnd, onLine: keepLine, readOnly: keepRead }), 80);
            return;
          }
        }
        advance();
      });
    });
  }

  function scheduleAuto(text) {
    clearTimeout(state.autoTimer);
    if (!state.auto || state.readOnly) return;
    const wait = 900 + Math.min(2600, String(text).length * 46);
    state.autoTimer = setTimeout(() => {
      if (state.auto && !state.typing && state.open) advance();
    }, wait);
  }

  /* ── 推进 ───────────────────────────────────────────────── */
  function advance() {
    if (!state.open) return;
    if (state.typing) return finishTyping();
    const line = currentLine();
    if (line && line.choice) return;
    state.line++;
    if (state.line >= (state.scene?.lines?.length || 0)) return finishScene();
    renderLine(state.line);
  }

  function finishScene() {
    if (state.ended) return;
    state.ended = true;
    const scene = state.scene;
    if (scene) window.STORY.markSeen(scene.id);
    const cb = state.onEnd;
    const ending = scene?.ending || state.pendingEnding || null;
    close();
    if (cb) cb({ id: scene?.id, ending });
  }

  function endScene(ending) {
    state.pendingEnding = ending || state.pendingEnding;
    finishScene();
  }

  /* ── 特效 ───────────────────────────────────────────────── */
  function playFx(kind) {
    if (reduced()) {
      if (kind === 'flash') {
        const f = el('div', 'vn-flash');
        state.nodes.stage.append(f);
        setTimeout(() => f.remove(), 260);
      }
      return;
    }
    const stage = state.nodes.stage;
    if (kind === 'shake') {
      stage.classList.remove('shake');
      void stage.offsetWidth;
      stage.classList.add('shake');
      setTimeout(() => stage.classList.remove('shake'), 420);
    } else if (kind === 'flash') {
      const f = el('div', 'vn-flash');
      stage.append(f);
      setTimeout(() => f.remove(), 320);
    } else if (kind === 'glitch') {
      stage.classList.remove('glitch');
      void stage.offsetWidth;
      stage.classList.add('glitch');
      setTimeout(() => stage.classList.remove('glitch'), 480);
    }
  }

  /* ── 生命周期 ───────────────────────────────────────────── */
  function play(idOrScene, opts = {}) {
    const scene = typeof idOrScene === 'string' ? window.STORY.get(idOrScene) : idOrScene;
    if (!scene) { opts.onEnd && opts.onEnd({ id: null, ending: null }); return false; }
    if (state.open) close(true);

    state.scene = scene;
    state.line = 0;
    state.log = [];
    state.ended = false;
    state.pendingEnding = null;
    state.open = true;
    state.onEnd = opts.onEnd || null;
    state.onLine = opts.onLine || null;
    state.readOnly = !!opts.readOnly;
    state.auto = !!opts.auto;

    document.body.classList.add('vn-open');
    layer.setAttribute('aria-hidden', 'false');
    buildScene(scene);
    state.nodes.root.classList.add('in');
    state.nodes.tools.querySelector('[data-vn="auto"]').classList.toggle('on', state.auto);
    if (state.readOnly) state.nodes.root.classList.add('readonly');

    renderLine(0);
    return true;
  }

  function close(immediate) {
    if (!state.open && !state.root) return;
    clearTimeout(state.typeTimer);
    clearTimeout(state.autoTimer);
    state.typing = false;
    state.open = false;
    document.body.classList.remove('vn-open');
    layer.setAttribute('aria-hidden', 'true');
    const root = state.nodes.root;
    if (root) {
      root.classList.remove('in');
      if (immediate || reduced()) root.remove();
      else setTimeout(() => root.remove(), 260);
    }
    state.nodes = {};
    state.root = null;
  }

  /* ── 事件 ───────────────────────────────────────────────── */
  layer.addEventListener('click', (e) => {
    const tool = e.target.closest('[data-vn]');
    if (tool) {
      const act = tool.dataset.vn;
      if (act === 'auto') {
        state.auto = !state.auto;
        tool.classList.toggle('on', state.auto);
        if (state.auto && !state.typing) advance();
        else clearTimeout(state.autoTimer);
      } else if (act === 'log') {
        openLog();
      } else if (act === 'log-close') {
        state.nodes.logPanel.classList.add('hidden');
      } else if (act === 'skip') {
        finishScene();
      }
      e.stopPropagation();
      return;
    }
    if (e.target.closest('.vn-choice')) return;
    if (state.readOnly) return;
    if (state.nodes.logPanel && !state.nodes.logPanel.classList.contains('hidden')) {
      state.nodes.logPanel.classList.add('hidden');
      return;
    }
    advance();
  });

  function openLog() {
    const panel = state.nodes.logPanel;
    if (!panel) return;
    panel.querySelector('.vn-log-body').innerHTML = state.log.map(l =>
      `<div class="vn-log-row${l.who ? '' : ' narr'}">${l.who ? `<b style="color:${esc(l.color || '#5ed8ff')}">${esc(l.who)}</b>` : ''}<span>${esc(l.text)}</span></div>`
    ).join('') || '<div class="vn-log-row narr"><span>还没有对话。</span></div>';
    panel.classList.remove('hidden');
    panel.querySelector('.vn-log-body').scrollTop = 1e6;
  }

  document.addEventListener('keydown', (e) => {
    if (!state.open) return;
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'enter' || k === 'arrowright') { e.preventDefault(); advance(); }
    else if (k === 'a') { state.auto = !state.auto; state.nodes.tools?.querySelector('[data-vn="auto"]')?.classList.toggle('on', state.auto); }
    else if (k === 'l') openLog();
    else if (k === 'escape') finishScene();
    else if (k === 'arrowup' || k === 'arrowdown') { e.preventDefault(); openLog(); }
  });

  /* ── 战中 bark：窄条，一条一句，不锁输入 ─────────────────── */
  let barkTimer = null;
  function bark({ who, text, duration }) {
    const info = window.STORY.speaker(who);
    let bar = document.querySelector('.vn-bark');
    if (!bar) {
      bar = el('div', 'vn-bark');
      document.body.append(bar);
    }
    bar.innerHTML = `<b style="--c:${esc(info.color || '#5ed8ff')}">${esc(info.name || '')}</b><span>${esc(text)}</span>`;
    bar.classList.remove('out');
    bar.classList.add('in');
    clearTimeout(barkTimer);
    barkTimer = setTimeout(() => {
      bar.classList.remove('in');
      bar.classList.add('out');
      setTimeout(() => bar.remove(), 320);
    }, duration || Math.max(2600, Math.min(5600, String(text).length * 140)));
  }

  window.VN = {
    play,
    close,
    isOpen: () => state.open,
    skip: () => finishScene(),
    bark,
    line: () => state.line,
    sceneId: () => state.scene?.id || null,
    readOnly: () => state.readOnly,
    // 联机跟随：宿主推进到第 n 行时，跟随者直接跳过去
    gotoLine(n) {
      if (!state.open || !state.scene) return;
      const max = state.scene.lines.length - 1;
      const target = Math.max(0, Math.min(max, n | 0));
      if (target <= state.line) return;
      clearTimeout(state.typeTimer);
      state.typing = false;
      state.line = target;
      renderLine(target);
    }
  };
})();
