/* ═══════════════════════════════════════════════════════════════════
   情报档案（0.23 / 任务 O）
   ───────────────────────────────────────────────────────────────────
   设计约束：
     1. 档案只解释规则和数据，不替代游戏内提示——局内该说的话仍然在局内说；
     2. 未发现的内容显示成「未记录」，不泄露答案，也不假装有内容；
     3. 所有条目都能回答「我为什么会看到这条」：来源、到期幕、触发条件；
     4. 数据在 web/data/archive.json，改文案不用改代码。
   ═══════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const DATA_URL = 'data/archive.json';

  const SECTIONS = [
    { id: 'timeline', label: '世界观', kicker: 'TIMELINE' },
    { id: 'chars', label: '角色', kicker: 'PERSONNEL' },
    { id: 'enemies', label: '敌人', kicker: 'THREATS' },
    { id: 'bosses', label: '首领', kicker: 'BOSS FILES' },
    { id: 'events', label: '事件', kicker: 'ENCOUNTERS' },
    { id: 'marks', label: '后果', kicker: 'CONSEQUENCES' },
    { id: 'bonds', label: '关系', kicker: 'BONDS' },
    { id: 'endings', label: '结局', kicker: 'OUTCOMES' },
    { id: 'run', label: '本局', kicker: 'THIS RUN' }
  ];

  const trim = (v, n) => {
    const t = String(v ?? '').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n) + '…' : t;
  };

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));

  let data = null;
  let loading = null;
  let ctx = { state: () => null, meta: () => null };
  let current = 'timeline';
  let root = null;

  function configure(provider) { ctx = { ...ctx, ...provider }; }

  async function load() {
    if (data) return data;
    if (loading) return loading;
    loading = fetch(DATA_URL, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : {})
      .then(j => { data = j || {}; return data; })
      .catch(() => { data = {}; return data; });
    return loading;
  }

  /* ── 取数助手 ─────────────────────────────────────────────────── */

  const g = () => ctx.state() || null;
  const meta = () => ctx.meta() || null;

  const charName = (id) => {
    const c = (meta()?.characters || []).find(x => x.id === id);
    return c?.name || data?.characters?.[id]?.name || id;
  };
  const enemyName = (id) => (meta()?.enemies || []).find(x => x.id === id)?.name || id;
  const eventById = (id) => (meta()?.events || []).find(x => x.id === id) || null;

  const seenEnemies = () => new Set(g()?.stats?.seenEnemies || []);
  const seenEvents = () => new Set(g()?.stats?.seenEvents || []);
  const party = () => new Set((g()?.players || []).map(p => p.id));

  /* ── 各分区渲染 ───────────────────────────────────────────────── */

  function timelineSection() {
    const rows = (data?.timeline || []).map(t => `
      <div class="ar-tl-row">
        <div class="ar-tl-when">${esc(t.when)}</div>
        <div class="ar-tl-body"><b>${esc(t.title)}</b><p>${esc(t.text)}</p></div>
      </div>`).join('');
    return `<div class="ar-tl">${rows || '<p class="mini-label">时间线暂时不可用。</p>'}</div>`;
  }

  function charsSection() {
    const inParty = party();
    const bonds = g()?.relationships || [];
    const relCount = new Map();
    for (const r of bonds) {
      relCount.set(r.a, (relCount.get(r.a) || 0) + r.level);
      relCount.set(r.b, (relCount.get(r.b) || 0) + r.level);
    }
    const all = (meta()?.characters || []).map(c => c.id);
    const cards = all.map(id => {
      const d = data?.characters?.[id] || {};
      const known = inParty.has(id) || relCount.has(id);
      const name = d.name || charName(id);
      if (!known) {
        return `<div class="ar-card unknown">
          <div class="ar-card-head"><b>未知编号</b><span class="ar-tag">未接触</span></div>
          <p>${esc(id.toUpperCase())} · 档案未解锁。在队伍里带上这名角色，或与 TA 建立关系后解锁。</p>
        </div>`;
      }
      return `<div class="ar-card">
        <div class="ar-card-head"><b>${esc(name)}</b><span class="ar-tag">${inParty.has(id) ? '本局同行' : '已接触'}</span></div>
        <div class="ar-code">${esc(id.toUpperCase())}</div>
        <p>${esc(d.dossier || (meta()?.characters || []).find(c => c.id === id)?.tagline || '')}</p>
        ${d.hook ? `<div class="ar-hook">${esc(d.hook)}</div>` : ''}
      </div>`;
    }).join('');
    return `<div class="ar-grid">${cards || '<p class="mini-label">角色档案暂时不可用。</p>'}</div>`;
  }

  function enemiesSection() {
    const seen = seenEnemies();
    const ids = Object.keys(data?.enemies || {});
    const cards = ids.map(id => {
      const d = data.enemies[id];
      const known = seen.has(id);
      if (!known) {
        return `<div class="ar-card unknown">
          <div class="ar-card-head"><b>未记录目标</b><span class="ar-tag">未遭遇</span></div>
          <p>打一场就知道它是什么了。</p>
        </div>`;
      }
      const def = (meta()?.enemies || []).find(e => e.id === id);
      return `<div class="ar-card">
        <div class="ar-card-head"><b>${esc(def?.name || enemyName(id))}</b><span class="ar-tag">已记录</span></div>
        ${def ? `<div class="ar-code">HP ${def.hp} · 护甲 ${def.armor} · 抗性 ${def.resistance} · 闪避 ${def.evasion}% · 速度 ${def.speed}</div>` : ''}
        <p>${esc(d.note || '')}</p>
        ${d.counter ? `<div class="ar-hook">对策：${esc(d.counter)}</div>` : ''}
      </div>`;
    }).join('');
    const unknown = ids.length - seen.size;
    return `<div class="ar-note">已记录 ${Math.min(ids.length, [...seen].filter(id => data.enemies[id]).length)} / ${ids.length} 种目标。</div>
      <div class="ar-grid">${cards}</div>`;
  }

  function bossesSection() {
    const seen = seenEnemies();
    const reached = g()?.act || 1;
    const cards = (data?.bosses || []).map(b => {
      const known = seen.has(b.enemyId) || reached > b.act;
      if (!known) {
        return `<div class="ar-card unknown">
          <div class="ar-card-head"><b>第 ${b.act} 幕首领</b><span class="ar-tag">未遭遇</span></div>
          <p>推进到第 ${b.act} 幕才能确认它的机制。</p>
        </div>`;
      }
      return `<div class="ar-card wide">
        <div class="ar-card-head"><b>${esc(b.name)}</b><span class="ar-tag">第 ${b.act} 幕</span></div>
        <p>${esc(b.mechanic)}</p>
        <div class="ar-list">${(b.counters || []).map(c => `<div class="ar-li">${esc(c)}</div>`).join('')}</div>
      </div>`;
    }).join('');
    return `<div class="ar-grid">${cards}</div>`;
  }

  function eventsSection() {
    const seen = seenEvents();
    const ids = Object.keys(NarrativeEventIds());
    const cards = ids.map(id => {
      const ev = eventById(id) || {};
      const known = seen.has(id);
      const cons = (g()?.consequences || []).filter(c => c.source === ev.title);
      if (!known) {
        return `<div class="ar-card unknown">
          <div class="ar-card-head"><b>未触发的遭遇</b><span class="ar-tag">未知</span></div>
          <p>这类节点在地图上标着「?」。走进去才知道是什么。</p>
        </div>`;
      }
      return `<div class="ar-card">
        <div class="ar-card-head"><b>${esc(ev.title || id)}</b><span class="ar-tag">已触发</span></div>
        <p>${esc(ev.subtitle || trim(ev.text, 78))}</p>
        ${cons.length ? `<div class="ar-hook">留下的后果：${cons.map(c => esc(c.title)).join('、')}</div>` : ''}
      </div>`;
    }).join('');
    return `<div class="ar-note">已触发 ${[...seen].filter(id => eventById(id)).length} / ${ids.length} 个事件。</div>
      <div class="ar-grid">${cards}</div>`;
  }

  /** 事件 id 列表：优先用 meta，其次用 archive 里的后果表来源。 */
  function NarrativeEventIds() {
    const map = {};
    for (const id of (data?.eventIds || [])) map[id] = true;
    for (const ev of (meta()?.events || [])) if (ev?.id) map[ev.id] = true;
    return map;
  }

  function marksSection() {
    const list = g()?.consequences || [];
    if (!list.length) {
      return `<div class="ar-empty">本局还没有留下后果。<br /><span>事件里的选择会改写后面的价格、敌人和自己的属性，并且都有到期时间。</span></div>`;
    }
    const rows = list.map(c => `
      <div class="ar-mark">
        <div class="ar-card-head"><b>${esc(c.title)}</b><span class="ar-tag">到第 ${c.expiresAct} 幕</span></div>
        <p>${esc(c.desc)}</p>
        <div class="ar-why"><b>为什么</b><span>${esc(c.why || '')}${c.source ? `（来自「${esc(c.source)}」）` : ''}</span></div>
      </div>`).join('');
    return `<div class="ar-note">最多同时追踪 5 条，到期自动解除——没有会永久锁死内容的后果。</div>
      <div class="ar-marks">${rows}</div>`;
  }

  function bondsSection() {
    const rels = (g()?.relationships || []).filter(r => r.level > 0).sort((a, b) => b.level - a.level || b.points - a.points);
    if (!rels.length) {
      return `<div class="ar-empty">还没有建立关系。<br /><span>支援队友、战斗协同、一起做多人决定、同行同一节点，都会推进关系。</span></div>`;
    }
    const rows = rels.map(r => {
      const lv = Math.min(3, r.level);
      const effect = ['支援开始有回报', '同场 +3 命中', '同场 +3 命中、+1 护甲'][lv - 1] || '';
      return `<div class="ar-bond">
        <div class="ar-card-head"><b>${esc(charName(r.a))} / ${esc(charName(r.b))}</b><span class="ar-tag">Lv.${lv}</span></div>
        <div class="ar-bond-bar">${[1, 2, 3].map(i => `<i class="${i <= lv ? 'on' : ''}"></i>`).join('')}</div>
        <p>${esc(r.note || '')}${effect ? ` · ${esc(effect)}` : ''}</p>
      </div>`;
    }).join('');
    return `<div class="ar-note">关系不给永久数值，只影响同场作战的小加成；换队也不会丢。</div>
      <div class="ar-marks">${rows}</div>`;
  }

  function endingsSection() {
    const st = g();
    const cards = (data?.endings || []).map(e => {
      // 条件只在到达终局后公开，之前只给方向
      const reached = (st?.phase === 'victory') || (st?.endingChoice === e.id);
      const chosen = st?.endingChoice === e.id;
      return `<div class="ar-card ${reached ? '' : 'unknown'}">
        <div class="ar-card-head"><b>${reached ? esc(e.name) : '未达成的结局'}</b><span class="ar-tag">${chosen ? '本局结局' : (reached ? '已解锁' : '未知')}</span></div>
        <p>${reached ? esc(e.text) : esc(e.hint || '走到终局才会知道。')}</p>
        ${reached ? `<div class="ar-hook">达成条件：${esc(e.condition)}</div>` : ''}
      </div>`;
    }).join('');
    return `<div class="ar-grid">${cards}</div>`;
  }

  function runSection() {
    const st = g();
    if (!st) {
      return `<div class="ar-empty">还没有进行中的对局。<br /><span>开局后这里会记录本局的地图认知、战斗数据和遗漏项。</span></div>`;
    }
    const s = st.stats || {};
    const nodes = (s.seenNodes || []);
    const nodeNames = { start: '起点', combat: '战斗', skirmish: '小型战斗', elite: '精英', keyelite: '密钥精英', boss: '首领', event: '事件', shop: '商店', safehouse: '安全屋', terminal: '终端', treasure: '宝藏', trap: '陷阱', corpse: '遗骸', server: '服务器', awakening: '觉醒残响', echo: '回声', key: '密钥', blank: '空地' };
    const rows = [
      ['幕', `${st.act} / 3 · ${st.actName || ''}`],
      ['电子追踪', `${st.purge} / ${st.purgeMax}`],
      ['队伍生命', String(st.teamLives ?? 0)],
      ['战斗', `${s.victories || 0} 胜 / ${s.battles || 0} 场`],
      ['协同触发', String(s.synergyTriggers || 0)],
      ['支援次数', String(s.assists || 0)],
      ['终极技', String(s.ultimatesUsed || 0)],
      ['道具', String(s.itemsUsed || 0)]
    ].map(([k, v]) => `<div class="ar-kv"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');

    const seenNode = nodes.map(n => nodeNames[n] || n).join('、') || '还没有离开起点';
    const recaps = (st.recaps || []).map(r => `<div class="ar-mark">
        <div class="ar-card-head"><b>第 ${r.act} 幕 · ${esc(r.name || '')}</b><span class="ar-tag">已完成</span></div>
        <p>走过 ${r.nodes} 个节点 · ${r.victories}/${r.battles} 场战斗 · ${r.events} 个事件 · ${r.synergies} 次协同</p>
        <div class="ar-why"><b>带走</b><span>追踪 ${r.purgeLeft}/${r.purgeMax} · 生命 ${r.teamLives} · Lv.${r.avgLevel}${(r.consequenceTitles || []).length ? ' · ' + r.consequenceTitles.join('、') : ''}</span></div>
      </div>`).join('');
    return `<div class="ar-kv-grid">${rows}</div>
      ${recaps ? `<div class="ar-note">章节回顾</div><div class="ar-marks">${recaps}</div>` : ''}
      <div class="ar-note">本局到过的节点类型：${esc(seenNode)}</div>
      <div class="ar-note">已记录 ${(s.seenEnemies || []).length} 种敌人、${(s.seenEvents || []).length} 个事件、${(st.relationships || []).filter(r => r.level > 0).length} 段关系。</div>`;
  }

  const RENDER = {
    timeline: timelineSection, chars: charsSection, enemies: enemiesSection, bosses: bossesSection,
    events: eventsSection, marks: marksSection, bonds: bondsSection, endings: endingsSection, run: runSection
  };

  /* ── 弹层 ─────────────────────────────────────────────────────── */

  function render() {
    if (!root) return;
    const sec = SECTIONS.find(s => s.id === current) || SECTIONS[0];
    const nav = SECTIONS.map(s => `<button class="ar-tab${s.id === current ? ' on' : ''}" data-archive-tab="${s.id}">
        <span>${esc(s.label)}</span><small>${esc(s.kicker)}</small>
      </button>`).join('');
    const body = (RENDER[sec.id] || timelineSection)();
    root.innerHTML = `<div class="va-panel ar-panel">
      <div class="va-head">
        <div>
          <div class="va-kicker">ARCHIVE // ${esc(sec.kicker)}</div>
          <h3>情报档案</h3>
        </div>
        <button class="va-close" aria-label="关闭档案" data-archive-close>✕</button>
      </div>
      <div class="ar-nav" role="tablist">${nav}</div>
      <div class="ar-body" role="tabpanel">${body}</div>
      <div class="ar-foot">
        <span>档案只解释规则，不替代局内提示。未记录 = 还没遇到。</span>
        <button class="btn btn-sm btn-ghost" data-archive-glossary>术语表</button>
      </div>
    </div>`;
  }

  function close() {
    if (!root) return;
    root.remove();
    root = null;
    document.removeEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
  }

  async function open(section) {
    if (section) current = section;
    await load();
    close();
    root = document.createElement('div');
    root.className = 'vn-archive archive-overlay';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.addEventListener('click', (e) => {
      if (e.target === root) { close(); return; }
      if (e.target.closest('[data-archive-close]')) { close(); return; }
      const tab = e.target.closest('[data-archive-tab]');
      if (tab) { current = tab.dataset.archiveTab; render(); return; }
      if (e.target.closest('[data-archive-glossary]')) { close(); window.Glossary?.openAll(); }
    });
    document.body.append(root);
    document.addEventListener('keydown', onKey);
    render();
    return true;
  }

  /** 局内/标题页的小徽标：有几条后果、几段关系。 */
  function badge() {
    const c = (g()?.consequences || []).length;
    const r = (g()?.relationships || []).filter(x => x.level > 0).length;
    const parts = [];
    if (c) parts.push(`后果 ${c}`);
    if (r) parts.push(`关系 ${r}`);
    return parts.join(' · ');
  }

  window.Archive = { configure, open, close, badge, load, sections: () => SECTIONS };
})();
