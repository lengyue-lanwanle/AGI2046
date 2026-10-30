/* 零号协议 2046 —— NIKKE 式战斗字效层
 *
 * 只做「节奏」，不做信息：DANGER / WARNING / MISSION COMPLETE / PHASE II / FULL BURST。
 * 所有层 pointer-events:none，不写状态，不阻塞操作；可整体关闭。
 *
 * 用法：
 *   Fx.hazard({ level: 'normal'|'elite', title, sub })
 *   Fx.victory({ rank: 'S', title, rewards: ['记忆 +120'], compact: true })
 *   Fx.defeat({ reason })
 *   Fx.phase(2, { title: '协议覆写' })
 *   Fx.burst({ name, portrait, color })
 *   Fx.setMode('full'|'simple'|'off')
 */
(function () {
  const KEY = 'agi2046.fx';
  const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function mode() {
    try { return localStorage.getItem(KEY) || 'full'; } catch { return 'full'; }
  }

  function setMode(next) {
    const v = ['full', 'simple', 'off'].includes(next) ? next : 'full';
    try { localStorage.setItem(KEY, v); } catch { /* 忽略 */ }
    return v;
  }

  function host() {
    let el = document.getElementById('fx-layer');
    if (!el) {
      el = document.createElement('div');
      el.id = 'fx-layer';
      el.className = 'fx-layer';
      document.body.appendChild(el);
    }
    return el;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function clear() {
    const h = host();
    [...h.children].forEach(n => {
      clearTimeout(n._timer);
      n.remove();
    });
  }

  function play(html, cls, hold, opts = {}) {
    if (mode() === 'off' && !opts.force) return null;
    clear();
    const node = document.createElement('div');
    node.className = 'fx ' + cls + (reduced() ? ' no-motion' : '');
    node.innerHTML = html;
    host().appendChild(node);
    requestAnimationFrame(() => node.classList.add('in'));
    const ms = mode() === 'simple' ? Math.max(320, Math.round(hold * 0.55)) : hold;
    node._timer = setTimeout(() => {
      node.classList.add('out');
      setTimeout(() => node.remove(), 320);
    }, ms);
    return node;
  }

  const RANK_LABEL = { S: 'PERFECT', A: 'CLEAN', B: 'SURVIVED', C: 'COSTLY' };

  window.Fx = {
    mode,
    setMode,
    clear,

    /** 进战斗：普通一条窄带，精英全屏 DANGER */
    hazard(info = {}) {
      const level = info.level === 'elite' ? 'elite' : 'normal';
      if (level === 'elite') {
        window.Sound?.sfx?.('alarm');
        return play(`
          <div class="fx-band top"></div>
          <div class="fx-band bottom"></div>
          <div class="fx-siren"></div>
          <div class="fx-danger" data-text="DANGER">DANGER</div>
          <div class="fx-sub">${esc(info.sub || 'ELITE HOSTILE')}</div>
        `, 'fx-hazard elite', 1200);
      }
      return play(`
        <div class="fx-band top slim"></div>
        <div class="fx-mini">ENGAGE<em>${esc(info.sub || info.title || '')}</em></div>
      `, 'fx-hazard normal', 620);
    },

    /** 胜利：普通只给窄条 CLEAR；精英/Boss 给印章 + 评级 */
    victory(info = {}) {
      if (info.compact) {
        return play(`<div class="fx-clear">CLEAR<em>${esc(info.title || '战斗结束')}</em></div>`,
          'fx-result clear', 600);
      }
      const rank = ['S', 'A', 'B', 'C'].includes(info.rank) ? info.rank : 'B';
      window.Sound?.sfx?.('stamp');
      if (rank === 'S' || rank === 'A') setTimeout(() => window.Sound?.sfx?.('rank'), 180);
      const rewards = (info.rewards || []).map(r => `<span>${esc(r)}</span>`).join('');
      return play(`
        <div class="fx-flash"></div>
        <div class="fx-stamp">
          <div class="fx-stamp-kicker">MISSION COMPLETE</div>
          <div class="fx-stamp-title">${esc(info.title || '区域清除')}</div>
          <div class="fx-rank ${rank}">${rank}<em>${RANK_LABEL[rank]}</em></div>
          ${rewards ? `<div class="fx-rewards">${rewards}</div>` : ''}
        </div>
      `, 'fx-result victory', 1600);
    },

    defeat(info = {}) {
      window.Sound?.sfx?.('defeat');
      return play(`
        <div class="fx-result-bg"></div>
        <div class="fx-stamp lost">
          <div class="fx-stamp-kicker">SIGNAL LOST</div>
          <div class="fx-stamp-title">${esc(info.title || '任务失败')}</div>
          <div class="fx-stamp-sub">${esc(info.reason || '')}</div>
        </div>
      `, 'fx-result defeat', 1800);
    },

    phase(n, info = {}) {
      window.Sound?.sfx?.('alarm');
      const roman = ['I', 'II', 'III', 'IV'][Math.max(0, Math.min(3, (n || 2) - 1))];
      return play(`
        <div class="fx-band top"></div>
        <div class="fx-band bottom"></div>
        <div class="fx-phase">
          <span>PHASE ${roman}</span>
          <b>${esc(info.title || '协议覆写')}</b>
          ${info.sub ? `<em>${esc(info.sub)}</em>` : ''}
        </div>
      `, 'fx-phase-wrap', 1200);
    },

    burst(info = {}) {
      if (!info.name) return null;
      window.Sound?.sfx?.('riser');
      return play(`
        <div class="fx-burst">
          ${info.portrait ? `<img src="${esc(info.portrait)}" alt="" />` : ''}
          <div class="fx-burst-text">
            <span>FULL BURST</span>
            <b style="color:${esc(info.color || '#5ed8ff')}">${esc(info.name)}</b>
          </div>
        </div>
      `, 'fx-burst-wrap', 900);
    },

    /** 通用印章：AWAKENED / CLEAR 等 */
    stamp(info = {}) {
      return play(`
        <div class="fx-stamp ${esc(info.tone || '')}">
          <div class="fx-stamp-kicker">${esc(info.kicker || '')}</div>
          <div class="fx-stamp-title">${esc(info.title || '')}</div>
        </div>
      `, 'fx-result stamp-only', info.duration || 1000);
    }
  };
})();
