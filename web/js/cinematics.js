/* 零号协议 2046 —— 过场与回合演出层
 *
 * 目标只有一个：让「换屏 / 进战斗 / 换人 / 换轮」这四个瞬间**看得出来**，
 * 而不是画面直接跳一下。所有元素 pointer-events:none，绝不拦截操作。
 *
 * 用法（app.js 里调用，全部可空安全）：
 *   Cine.screen('game-screen')                     // 换屏：黑场 + 上浮
 *   Cine.encounter({ title, subtitle, art, boss, enemies })
 *   Cine.act({ index, name, art, subtitle })       // 幕间：整幅主视觉
 *   Cine.turn({ name, portrait, round, ap, full }) // 走格子：换人 / 换轮
 *   Cine.combatTurn({ name, portrait, side, round, mine })
 *   Cine.round(n)                                  // 战斗轮次分隔
 *   Cine.travel()                                  // 地图移动：速度线
 */
(function () {
  const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let layer = null;

  function host() {
    if (layer && layer.isConnected) return layer;
    layer = document.getElementById('cine-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'cine-layer';
      layer.className = 'cine-layer';
      document.body.appendChild(layer);
    }
    return layer;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  /** 挂一个层：in 由下一帧触发，hold 后 out，再移除。返回节点方便提前结束。
   *  系统开了「减少动态效果」时不放动画，但**信息仍然要给**：
   *  静态卡片照常出现，只是不位移、不缩放。过场是信息，不是装饰。 */
  function play(html, cls, hold, opts = {}) {
    const node = document.createElement('div');
    node.className = 'cine ' + cls + (reduced() ? ' no-motion' : '');
    node.innerHTML = html;
    host().appendChild(node);
    requestAnimationFrame(() => node.classList.add('in'));
    const timer = setTimeout(() => {
      node.classList.add('out');
      setTimeout(() => node.remove(), 420);
    }, hold);
    node._timer = timer;
    return node;
  }

  /** 清场：进新场景时把上一条过场收掉，避免叠在一起 */
  function clear() {
    const h = host();
    [...h.children].forEach(n => {
      clearTimeout(n._timer);
      n.remove();
    });
  }

  const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

  /** 只收掉某一类过场：离开战斗时用，别把幕间大图一起清掉 */
  function dismiss(selector) {
    if (!layer) return;
    [...layer.querySelectorAll(selector)].forEach(n => {
      clearTimeout(n._timer);
      n.remove();
    });
  }

  const API = {
    clear,
    dismiss,

    /* ── 换屏 ─────────────────────────────────────────────────────── */
    screen(id) {
      if (reduced()) return;   // 整屏黑场属于纯装饰，减少动态时直接跳过
      const node = document.createElement('div');
      node.className = 'cine cine-screen';
      node.dataset.screen = id;
      node.innerHTML = '<div class="cs-veil"></div><div class="cs-scan"></div>';
      host().appendChild(node);
      setTimeout(() => node.remove(), 700);
    },

    /* ── 进战斗 ───────────────────────────────────────────────────── */
    encounter(info = {}) {
      const boss = !!info.boss;
      const enemies = (info.enemies || []).filter(Boolean).slice(0, 5);
      if (boss) {
        const chips = enemies.map(n => `<span>${esc(n)}</span>`).join('');
        play(`
          <div class="ce-art" style="background-image:url('${esc(info.art || 'assets/keyart/boss1.webp')}')"></div>
          <div class="ce-veil"></div>
          <div class="ce-bar top"></div>
          <div class="ce-bar bottom"></div>
          <div class="ce-body">
            <div class="ce-kicker"><i></i>BOSS ENCOUNTER</div>
            <h2 class="ce-title">${esc(info.title || '首领')}</h2>
            <p class="ce-sub">${esc(info.subtitle || '')}</p>
            ${chips ? `<div class="ce-chips">${chips}</div>` : ''}
          </div>
        `, 'cine-encounter boss', 2400);
      } else {
        const chips = enemies.map(n => `<span>${esc(n)}</span>`).join('');
        play(`
          <div class="ce-minor">
            <span class="cem-kicker">ENCOUNTER</span>
            <b class="cem-title">${esc(info.title || '遭遇')}</b>
            ${chips ? `<div class="ce-chips">${chips}</div>` : ''}
          </div>
        `, 'cine-encounter minor', 1250);
      }
    },

    /* ── 幕间 ─────────────────────────────────────────────────────── */
    act(info = {}) {
      const n = Math.max(1, Math.min(3, info.index || 1));
      play(`
        <div class="ca-art" style="background-image:url('${esc(info.art || `assets/keyart/act${n}.webp`)}')"></div>
        <div class="ca-veil"></div>
        <div class="ca-num">${String(n).padStart(2, '0')}</div>
        <div class="ca-body">
          <span class="ca-kicker">ACT ${ROMAN[n - 1]} // PROTOCOL SHIFT</span>
          <h2>${esc(info.name || `第 ${n} 幕`)}</h2>
          <p>${esc(info.subtitle || '')}</p>
        </div>
      `, 'cine-act', 2500);
    },

    /* ── 走格子：换人 / 换轮 ──────────────────────────────────────── */
    turn(info = {}) {
      const full = !!info.full;
      const portrait = info.portrait
        ? `<img src="${esc(info.portrait)}" alt="" />`
        : '<span class="ct-fallback">◇</span>';
      const sub = [
        info.round ? `第 ${info.round} 轮` : '',
        info.ap != null ? `AP ${info.ap}` : '',
        info.subtitle || ''
      ].filter(Boolean).join(' · ');
      play(`
        <div class="ct-card">
          ${portrait}
          <div class="ct-text">
            <span class="ct-kicker">${esc(info.kicker || (full ? 'NEW ROUND' : 'NEXT EXECUTOR'))}</span>
            <b class="ct-name">${esc(info.name || '')}</b>
            <span class="ct-sub">${esc(sub)}</span>
          </div>
        </div>
      `, 'cine-turn' + (full ? ' full' : ' brief'), full ? 1500 : 1150);
    },

    /* ── 战斗：换单位 ─────────────────────────────────────────────── */
    combatTurn(info = {}) {
      const side = info.side === 'enemy' ? 'enemy' : 'player';
      const mine = !!info.mine;
      const portrait = info.portrait
        ? `<img src="${esc(info.portrait)}" alt="" />`
        : `<span class="cct-fallback">${side === 'enemy' ? '✹' : '◇'}</span>`;
      const kicker = mine ? 'YOUR TURN' : side === 'enemy' ? 'ENEMY PHASE' : 'ALLY TURN';
      play(`
        <div class="cct-line"></div>
        <div class="cct-card">
          <div class="cct-portrait">${portrait}</div>
          <div class="cct-text">
            <span class="cct-kicker">${kicker}</span>
            <b class="cct-name">${esc(info.name || '')}</b>
            <span class="cct-sub">${esc(side === 'enemy' ? '敌方行动' : mine ? '轮到你了' : '队友行动中')}${info.round ? ` · 第 ${info.round} 轮` : ''}</span>
          </div>
        </div>
      `, `cine-combat-turn ${side}${mine ? ' mine' : ''}`, mine ? 1400 : 1050);
    },

    /* ── 战斗：新轮次 ─────────────────────────────────────────────── */
    round(n) {
      play(`<i></i><span>ROUND <b>${esc(n)}</b></span><i></i>`, 'cine-round', 950);
    },

    /* ── 地图移动 ─────────────────────────────────────────────────── */
    travel() {
      if (reduced()) return;
      const wrap = document.getElementById('map-wrap');
      if (!wrap) return;
      wrap.classList.remove('is-traveling');
      void wrap.offsetWidth;
      wrap.classList.add('is-traveling');
      clearTimeout(API.travel._t);
      API.travel._t = setTimeout(() => wrap.classList.remove('is-traveling'), 520);
      if (!host().querySelector('.cine-travel')) {
        const node = document.createElement('div');
        node.className = 'cine cine-travel';
        node.innerHTML = '<i></i><i></i><i></i>';
        host().appendChild(node);
        setTimeout(() => node.remove(), 620);
      }
    }
  };

  window.Cine = API;
})();
