/* ═══════════════════════════════════════════════════════════════════
   术语与规则解释层（0.20）
   ───────────────────────────────────────────────────────────────────
   设计约束：
     1. 术语是可聚焦的按钮，不是 hover 提示——手机上也能点；
     2. 解释卡只有一个入口（点术语），一个出口（关闭 / ESC / 点遮罩）；
     3. 首次出现只提示一次，提示不阻塞任何操作；
     4. 数据在 web/data/glossary.json，改文案不用改代码。
   ═══════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const DATA_URL = 'data/glossary.json';
  const SEEN_KEY = 'agi2046.glossarySeen';
  const CATEGORY_ORDER = ['核心', '探索', '战斗', '叙事'];

  let terms = [];
  let byId = new Map();
  let loaded = false;
  let loading = null;

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));

  function seenSet() {
    try {
      const raw = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
      return new Set(Array.isArray(raw) ? raw : []);
    } catch { return new Set(); }
  }

  function markSeen(id) {
    try {
      const set = seenSet();
      if (set.has(id)) return false;
      set.add(id);
      localStorage.setItem(SEEN_KEY, JSON.stringify([...set].slice(-80)));
      return true;
    } catch { return true; }
  }

  async function init() {
    if (loaded) return terms;
    if (loading) return loading;
    loading = fetch(DATA_URL, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : { terms: [] })
      .then(data => {
        terms = Array.isArray(data?.terms) ? data.terms : [];
        byId = new Map(terms.map(t => [t.id, t]));
        loaded = true;
        return terms;
      })
      .catch(() => { loaded = true; return terms; });
    return loading;
  }

  const get = (id) => byId.get(id) || null;

  /** 生成一个可直接点击的术语。数据还没到时退回纯文本，不留空按钮。 */
  function chip(id, label) {
    const t = byId.get(id);
    const text = label ?? t?.term ?? id;
    if (!t) return esc(text);
    return `<button type="button" class="term" data-term="${esc(id)}" aria-label="术语解释：${esc(t.term)}">${esc(text)}</button>`;
  }

  /* ── 解释卡 ──────────────────────────────────────────────────── */

  function overlay(html) {
    const root = document.createElement('div');
    root.className = 'vn-archive glossary-overlay';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.innerHTML = `<div class="va-panel gloss-panel">${html}</div>`;
    document.body.append(root);
    const close = () => {
      root.remove();
      document.removeEventListener('keydown', onKey);
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey);
    root.addEventListener('click', (e) => {
      if (e.target === root || e.target.closest('.va-close')) { close(); return; }
      if (e.target.closest('[data-gloss-all]')) { close(); openAll(); }
      const jump = e.target.closest('[data-gloss-jump]');
      if (jump) { close(); open(jump.dataset.glossJump); }
    });
    root.querySelector('.va-close')?.focus();
    return root;
  }

  function open(id) {
    const t = get(id);
    if (!t) return false;
    const aka = (t.aka || []).filter(Boolean);
    overlay(`
      <div class="va-head">
        <div>
          <div class="va-kicker">GLOSSARY // ${esc(t.category || '规则')}</div>
          <h3 id="gloss-title">${esc(t.term)}</h3>
        </div>
        <button class="va-close" aria-label="关闭术语解释">✕</button>
      </div>
      <div class="gloss-meta">
        <span class="gloss-cat">${esc(t.category || '规则')}</span>
        ${aka.length ? `<span class="gloss-aka">也叫：${esc(aka.join(' / '))}</span>` : ''}
      </div>
      <p class="gloss-short">${esc(t.short || '')}</p>
      <p class="gloss-detail">${esc(t.detail || '')}</p>
      ${t.example ? `<div class="gloss-example"><b>例子</b><span>${esc(t.example)}</span></div>` : ''}
      <div class="gloss-actions">
        <button class="btn btn-sm btn-ghost" data-gloss-all>查看全部术语</button>
      </div>
    `);
    return true;
  }

  function openAll() {
    const groups = new Map();
    for (const t of terms) {
      const cat = t.category || '规则';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(t);
    }
    const order = [...CATEGORY_ORDER.filter(c => groups.has(c)), ...[...groups.keys()].filter(c => !CATEGORY_ORDER.includes(c))];
    const body = order.map(cat => `
      <section class="gloss-group">
        <div class="gloss-group-head">${esc(cat)}</div>
        <div class="gloss-grid">
          ${(groups.get(cat) || []).map(t => `<button class="gloss-card" data-gloss-jump="${esc(t.id)}">
            <b>${esc(t.term)}</b>
            <small>${esc(t.short || '')}</small>
          </button>`).join('')}
        </div>
      </section>`).join('');
    overlay(`
      <div class="va-head">
        <div><div class="va-kicker">GLOSSARY // RULES</div><h3>术语表</h3></div>
        <button class="va-close" aria-label="关闭术语表">✕</button>
      </div>
      <div class="va-hint">规则在游戏里就能查，不用背。点任意一条看完整解释。</div>
      <div class="gloss-list">${body || '<p class="mini-label">术语表暂时不可用。</p>'}</div>
    `);
  }

  /** 首次出现的轻提示：只提示一次，不拦操作。 */
  function hint(id) {
    const t = get(id);
    if (!t || !markSeen(id)) return false;
    const layer = document.getElementById('toast-layer');
    if (!layer) return false;
    const div = document.createElement('div');
    div.className = 'toast info term-hint';
    div.innerHTML = `新术语 <b>${esc(t.term)}</b>：点带虚线的词看解释`;
    layer.appendChild(div);
    setTimeout(() => { div.classList.add('leave'); setTimeout(() => div.remove(), 220); }, 3600);
    return true;
  }

  function bind(root = document) {
    root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-term]');
      if (!el) return;
      e.preventDefault();
      e.stopPropagation();
      open(el.dataset.term);
    });
  }

  window.Glossary = { init, terms: () => terms, get, chip, open, openAll, hint, bind, markSeen };
  bind(document);
})();
