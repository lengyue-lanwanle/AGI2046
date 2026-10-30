/* ═══════════════════════════════════════════════════════════════════
   零号协议 2046 — browser client
   ═══════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const ROLE_CLASS = { 守护: 'guard', 斗士: 'fighter', 游侠: 'ranger', 支援: 'support' };
  const SLOT_LABEL = { Weapon: '武器', Armor: '护甲', Helmet: '头盔', Trinket: '饰品', Cyberware: '义体' };
  const SLOT_ORDER = ['Weapon', 'Armor', 'Helmet', 'Trinket', 'Cyberware'];
  const STAT_KEYS = ['VIT', 'C', 'H', 'E', 'SPD', 'L'];
  const STAT_LABEL = { VIT: '体质', C: '智识', H: '武技', E: '共情', SPD: '速度', L: '幸运' };
  const RARITY_CLASS = { 普通: 'common', 稀有: 'rare', 史诗: 'epic', 传说: 'legendary', 神话: 'mythic' };
  const TAG_CLASS = { 爆发: 'burst', 持续: 'sustain', 增益: 'buff', 减益: 'debuff', 护盾: 'shield', 治疗: 'heal', 召唤: 'summon', 控制: 'control' };
  const KEY_NAMES = { 1: '王冠密钥', 2: '穹顶权限密钥', 3: '零号核心密钥' };
  // 消耗品图标：数据层给的是字形（✚ ◈ ❖ ▣ ➤），在部分机器上会缺字形或显示成方块。
  // 有专属 SVG 就用 SVG，没有就退回字形。
  const ITEM_ICON = {
    medkit: 'item-medkit',
    focus_cell: 'item-focus_cell',
    purifier: 'item-purifier',
    shield_gen: 'item-shield_gen',
    adrenaline: 'item-adrenaline'
  };
  // 战场背景：三幕 × 3 区域 = 9 张，精英每幕 1 张，Boss 每幕 1 张，共 15 张（0.19 补齐）
  const DISTRICT_BG = {
    '霓虹港 · 下城区': 'neon-low',
    '霓虹港 · 数据中层': 'neon-mid',
    '零号拍卖场': 'neon-auction',
    '镜海 · 外环': 'mirror-outer',
    '镜海 · 穹顶': 'mirror-dome',
    '镜海 · 执政官厅': 'mirror-hall',
    '零号轨道 · 外舱': 'orbit-hull',
    '零号轨道 · 主控层': 'orbit-control',
    '零号轨道 · 协议核心': 'orbit-core'
  };
  const ELITE_BG = { 1: 'neon-elite', 2: 'mirror-elite', 3: 'orbit-elite' };
  const BOSS_BG = { 1: 'neon-auction', 2: 'boss2-arena', 3: 'boss3-arena' };

  function battleBackdropFor(node, act) {
    if (!node) return '';
    const a = Math.max(1, Math.min(3, act || 1));
    if (node.type === 'boss') return `assets/battle/bg/${BOSS_BG[a]}.webp`;
    if (node.type === 'elite' || node.type === 'keyElite') return `assets/battle/bg/${ELITE_BG[a]}.webp`;
    const slug = DISTRICT_BG[node.district];
    return slug ? `assets/battle/bg/${slug}.webp` : '';
  }

  /* ── 剧情导演（R2）──────────────────────────────────────────────
     谁在什么时候看到哪一场戏：
       · 新开局 / 续玩 → 序章（只看一次）
       · 对首领按「交互」→ 该幕的战前戏，读完才真正开打
       · 首领战胜利 → 收尾戏（叠在结算面板之上）
       · 换幕 → 幕间戏 + 下一幕开场
       · 终局 → 最后一项议程（含二选一）→ 结算
     联机：房主推进时把句号 POST 到房间游标，其他人读只；单人局完全走本地。
     `?bot=1` 或 `?story=off` 时全部关闭（自动化测试用，避免挡住点击）。
     ─────────────────────────────────────────────────────────────── */
  const QUERY = new URLSearchParams(location.search);
  const STORY_OFF = QUERY.has('bot') || QUERY.get('story') === 'off';
  const storyReady = () => !STORY_OFF && !!window.VN && !!window.STORY;
  const sceneSeen = (id) => !storyReady() || window.STORY.hasSeen(id);

  let vnBusy = false;
  function playScene(id, opts = {}) {
    // 只在「确实还有一场在演」时拒绝；VN 被外部关掉但 onEnd 没跑到时不至于把后续剧情全锁死
    if (!storyReady() || (vnBusy && window.VN.isOpen())) return false;
    const scene = window.STORY.get(id);
    if (!scene) return false;
    vnBusy = true;
    window.VN.play(id, {
      readOnly: !!opts.readOnly,
      onLine: (n) => { if (!opts.readOnly) cueLine(id, n); },
      onEnd: (info) => {
        vnBusy = false;
        if (info?.ending) S.endingChoice = info.ending;
        opts.onEnd && opts.onEnd(info);
      }
    });
    Sound.sfx('open');
    return true;
  }

  /* 联机游标：房主每句上报一次；跟随者读只播放。 */
  function cueLine(sceneId, line) {
    if (!S.room?.code || !S.room?.token) return;
    fetch(`/api/room/${encodeURIComponent(S.room.code)}/cue`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: S.room.token, sceneId, line })
    }).catch(() => {});
  }

  let cuePoll = null, cueSeenAt = 0;
  function startCueFollow() {
    if (!S.room?.code || cuePoll || STORY_OFF) return;
    cuePoll = setInterval(async () => {
      if (!S.room?.code) return;
      try {
        const res = await fetch(`/api/room/${encodeURIComponent(S.room.code)}/cue`, { cache: 'no-store' });
        if (!res.ok) return;
        const { cue } = await res.json();
        if (!cue?.sceneId || cue.at <= cueSeenAt) return;
        cueSeenAt = cue.at;
        // 自己上报的游标不用跟
        if (cue.by && cue.by === S.room.playerId) return;
        if (window.VN.isOpen()) {
          if (window.VN.sceneId() === cue.sceneId) window.VN.gotoLine(cue.line);
          return;
        }
        playScene(cue.sceneId, { readOnly: true });
        setTimeout(() => window.VN.gotoLine(cue.line), 240);
      } catch { /* 断线就下一轮再试 */ }
    }, 1200);
  }
  function stopCueFollow() {
    clearInterval(cuePoll);
    cuePoll = null;
    cueSeenAt = 0;
  }

  /* 开场 CG：**与序章解耦**。
     曾经的写法是「序章没看过才放 CG」，结果老玩家（序章已读）永远看不到开场。
     现在两件事各自判断：CG 看没看过、序章看没看过。 */
  function maybeIntro(done) {
    if (STORY_OFF) return false;
    if (!window.CG?.has('intro') || window.CG.seen('intro')) return false;
    return window.CG.play('intro', { onEnd: () => done && done() });
  }

  /* 序章：一局只看一次。 */
  function maybePrologue() {
    if (!storyReady() || sceneSeen('prologue')) return false;
    return playScene('prologue');
  }

  /* 进游戏时统一的「开场序列」：CG（没看过才放）→ 序章（没看过才放）。
     任何一环缺失或失败都不阻塞，直接落到下一个。 */
  function playOpening() {
    if (maybeIntro(() => maybePrologue())) return true;
    return maybePrologue();
  }

  function roomIsHost() {
    if (!S.room) return true;
    const seat = (S.roomData?.seats || []).find(x => x.playerId === S.room.playerId);
    return seat ? !!seat.isHost : true;
  }

  const MAP_W = 2820;
  const MAP_H = 560;

  const NODE_INFO = {
    start: { icon: '◉', label: '起点' },
    event: { icon: '◇', label: '事件', svg: 'node-event' },
    combat: { icon: '⚔', label: '战斗', svg: 'node-combat' },
    elite: { icon: '☠', label: '精英', svg: 'node-elite' },
    shop: { icon: '¤', label: '黑市', svg: 'node-shop' },
    safehouse: { icon: '⌂', label: '安全屋', svg: 'node-safehouse' },
    terminal: { icon: '⌘', label: '旧网终端', svg: 'node-terminal' },
    treasure: { icon: '▣', label: '数据宝库', svg: 'node-treasure' },
    key: { icon: '✦', label: '密钥' },
    boss: { icon: '✹', label: '终局', svg: 'node-boss' },
    blank: { icon: '·', label: '空地' },
    skirmish: { icon: '∙', label: '小战斗', svg: 'node-skirmish' },
    trap: { icon: '⚠', label: '陷阱', svg: 'node-trap' },
    corpse: { icon: '✝', label: '遗骸', svg: 'node-corpse' },
    echo: { icon: '✦', label: '残响', svg: 'node-echo' },
    server: { icon: '▣', label: '服务器', svg: 'node-server' },
    keyElite: { icon: '◆', label: '碎片看守', svg: 'node-elite' },
    awakening: { icon: '❖', label: '找回自我', svg: 'node-awakening' }
  };

  const SERVER_INFO = {
    vit: { icon: '▲', label: 'VIT', color: '#ff8a8a' },
    c: { icon: '■', label: 'C', color: '#64e3ff' },
    h: { icon: '◆', label: 'H', color: '#ffb27e' },
    e: { icon: '●', label: 'E', color: '#8affc1' },
    spd: { icon: '➤', label: 'SPD', color: '#ffd166' },
    l: { icon: '✦', label: 'L', color: '#e0c3ff' },
    heal: { icon: '♥', label: '医疗', color: '#3ddc97' },
    focus: { icon: '◈', label: '冷却', color: '#7e9dff' },
    xp: { icon: '▤', label: '日志', color: '#b18cff' }
  };
  const STATUS_ICON = { stun: '⚡', taunt: '!', mark: '◎', defend: '▣' };

  const S = {
    meta: null,
    game: null,
    selected: [],
    busy: false,
    modalType: null,
    modalCloseable: false,
    pendingDanger: null,
    dangerAck: null,
    safehouseTab: 'rest',
    actTab: 'info',
    invPlayerId: null,
    combatSkill: null,
    combatInspect: null,
    focusCombat: true,      // 战斗中隐藏左右侧栏，把宽度让给 3D 战场
    lastCombatActiveId: null,
    lastRollKey: '',
    dismissedBeats: new Set(),  // 观战时本地关掉的叙事卡（不动共享状态）
    combatFocus: null,      // 手动 Tab 选的视角（单位 id / 'all' / null=自动）
    playedSeq: 0,            // 已经演出过的最后一个动作序号
    combatSeqNode: null,     // 播放游标所属的战斗节点
    pendingCasts: [],        // 待播放的施法演出队列
    castPlaying: false,
    castTimer: null,
    lastMessage: null,
    diceTimer: null,
    revealTimers: [],       // 掷骰逐颗揭示的定时器，重开面板时统一清掉
    charsById: new Map(),
    skillsById: new Map(),
    gearById: new Map(),
    gearSetsById: new Map(),
    enemiesById: new Map(),
    questsById: new Map(),
    selectMode: 'solo',
    room: null,
    roomData: null,
    roomPoll: null,
    endingChoice: null,
    endingSceneDone: false,
    barkKeys: new Set(),
    profile: null,              // 跨局档案（教学看过没有）
    tutorialSeenSteps: new Set(),
    explainSeen: new Set(),     // 首局「觉醒 / 支线 / 服务器」解释只弹一次
    goalPulse: null,
    lastHintAt: 0,
    challengeDraft: null,       // 挑战选择草稿（seed / 变异 / 难度）
    assistKind: 'guard',
    coopTimer: null
  };

  init();

  /* ── 存档 / 续玩 ─────────────────────────────────────────────────── */
  const SAVE_KEY = 'agi2046.sessionId';
  let resumeState = null;

  function savedId() {
    try { return localStorage.getItem(SAVE_KEY); } catch { return null; }
  }

  function rememberSession(id) {
    try { localStorage.setItem(SAVE_KEY, id); } catch { /* 隐私模式忽略 */ }
    flashSaved();
  }

  function forgetSession(id) {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* 忽略 */ }
    const sid = id || resumeState?.sessionId;
    if (sid) {
      const q = S.room?.token ? `?token=${encodeURIComponent(S.room.token)}` : '';
      fetch('/api/session/' + encodeURIComponent(sid) + q, { method: 'DELETE' }).catch(() => {});
    }
    resumeState = null;
    const btn = $('#btn-resume');
    if (btn) btn.classList.add('hidden');
  }

  let savedTimer = null;
  function flashSaved() {
    const pill = $('#save-pill');
    if (!pill) return;
    pill.classList.add('show');
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => pill.classList.remove('show'), 1600);
  }

  async function setupResume() {
    const id = savedId();
    if (!id) return;
    try {
      const res = await fetch('/api/state?sessionId=' + encodeURIComponent(id), { cache: 'no-store' });
      if (!res.ok) throw new Error('gone');
      const state = await res.json();
      if (state.phase === 'victory' || state.phase === 'defeat') {
        forgetSession(id);
        return;
      }
      resumeState = state;
      const btn = $('#btn-resume');
      const sub = $('#resume-sub');
      if (sub) {
        const who = state.players?.find(p => p.id === state.activePlayerId);
        sub.textContent = `${state.actName} · 第 ${state.round} 轮${who ? ' · ' + who.name : ''}`;
      }
      if (btn) btn.classList.remove('hidden');
    } catch {
      forgetSession(id);
    }
  }

  function resumeGame() {
    if (!resumeState) return;
    const state = resumeState;
    S.game = state;
    S.lastRollKey = rollKey(state.lastRoll);
    S.lastMessage = state.message;
    S.invPlayerId = state.activePlayerId;
    S.combatSkill = null;
    S.combatInspect = null;
    S.lastCombatActiveId = state.combat?.activeUnitId ?? null;
    S.endingSceneDone = false;
    S.barkKeys.clear();
    showScreen('game-screen');
    renderAll();
    toast(`已恢复 ${state.actName} 的行动。`, 'info');
    startCueFollow();
    playOpening();
  }

  async function init() {
    wireStatic();
    applyA11y();   // 先套用无障碍偏好，避免首屏闪一下
    Sound.init();
    syncSoundBtn();
    renderTitlePortraits();
    setServerStatus(null);
    // 术语表先加载：后面的目标条 / 战斗卡要拿它渲染「可点的词」
    try { await window.Glossary?.init?.(); } catch { /* 术语表挂了不影响开局 */ }
    loadExplainSeen();
    await loadProfile();
    await loadMeta();
    // 档案模块只读 state/meta，不自己发请求
    window.Archive?.configure?.({ state: () => S.game, meta: () => S.meta });
    // 深链：?cg=intro 直接放开场（用户反馈「看不到」时的最快验证路径，也方便投影给朋友看）
    const cgParam = QUERY.get('cg');
    if (cgParam && !STORY_OFF) {
      const id = cgParam === '1' ? 'intro' : cgParam;
      if (window.CG?.has(id)) setTimeout(() => window.CG.play(id, { force: true }), 300);
    }
    if (await restoreRoom()) return;
    await setupResume();
    renderTitleRuns();
  }

  function syncSoundBtn() {
    const btn = $('#btn-sound');
    if (!btn) return;
    const off = Sound.muted();
    btn.classList.toggle('off', off);
    btn.title = off ? '音效已关闭' : '音效已开启';
  }

  /* ── boot / meta ────────────────────────────────────────────────── */
  async function loadMeta() {
    try {
      const res = await fetch('/api/meta', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      S.meta = await res.json();
      S.charsById = new Map(S.meta.characters.map(c => [c.id, c]));
      S.skillsById = new Map(S.meta.skills.map(s => [s.id, s]));
      S.gearById = new Map(S.meta.gear.map(g => [g.id, g]));
      S.gearSetsById = new Map((S.meta.gearSets || []).map(s => [s.id, s]));
      S.enemiesById = new Map(S.meta.enemies.map(e => [e.id, e]));
      S.questsById = new Map((S.meta.quests || []).map(q => [q.id, q]));
      setServerStatus(true);
      renderTitlePortraits();
      const start = $('#btn-start');
      if (start) start.disabled = false;
    } catch (err) {
      console.error(err);
      setServerStatus(false);
      const start = $('#btn-start');
      if (start) start.disabled = false;
      toast('无法连接规则服务器。请确认本地服务已启动（端口 5178）。', 'error', 6000);
    }
  }

  function setServerStatus(ok) {
    const el = $('#server-status');
    if (!el) return;
    el.classList.toggle('offline', ok === false);
    if (ok === true) el.innerHTML = 'LINK: <em>ONLINE</em>';
    else if (ok === false) el.innerHTML = 'LINK: <em>OFFLINE</em>';
    else el.innerHTML = 'LINK: <em>CHECKING…</em>';
  }

  /* ── 玩家档案 / 教学入口 ───────────────────────────────────────── */
  async function loadProfile() {
    try {
      const res = await fetch('/api/profile', { cache: 'no-store' });
      if (!res.ok) throw new Error('no profile');
      S.profile = await res.json();
    } catch {
      S.profile = { tutorialCompleted: false, firstRun: true };
    }
    renderTutorialEntry();
  }

  function renderTutorialEntry() {
    const badge = $('#tutorial-badge');
    const btn = $('#btn-tutorial');
    if (!badge || !btn) return;
    const done = !!S.profile?.tutorialCompleted;
    badge.textContent = done ? '已完成' : '10 分钟';
    btn.classList.toggle('done', done);
    btn.title = done
      ? '重看新手教学（不会影响正式存档）'
      : '第一次玩？从这里开始：10 分钟走完核心循环';
  }

  async function startTutorial() {
    if (S.busy) return;
    S.busy = true;
    try {
      const res = await fetch('/api/tutorial/new', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '无法开始教学');
      // 教学局不写 localStorage 的存档指针：刷新页面就回标题，正式存档不受影响
      S.selected = [];
      S.game = data;
      S.modalType = null;
      S.modalCloseable = false;
      $('#modal-root').innerHTML = '';
      S.combatSkill = null;
      S.combatInspect = null;
      S.lastRollKey = rollKey(data.lastRoll);
      S.lastMessage = data.message;
      S.invPlayerId = data.activePlayerId;
      S.barkKeys.clear();
      S.explainSeen = new Set(['awakening', 'quest', 'server']);   // 教学里不叠首局解释
      showScreen('game-screen');
      renderAll();
      toast('训练场已加载：这里的一切都不会写进正式对局。', 'info', 4200);
    } catch (err) {
      console.error(err);
      toast(err.message || '无法开始教学。', 'error', 4200);
    } finally {
      S.busy = false;
    }
  }

  function tutorialNext() {
    if (S.game?.mode !== 'tutorial' || S.busy) return;
    applyAction({ type: 'tutorialNext' });
  }

  function tutorialInspect() {
    if (S.game?.mode !== 'tutorial' || S.busy) return;
    applyAction({ type: 'tutorialInspect' });
  }

  async function tutorialSkip() {
    if (S.game?.mode !== 'tutorial' || S.busy) return;
    await applyAction({ type: 'tutorialSkip' });
  }

  function finishTutorial() {
    const sid = S.game?.sessionId;
    if (sid) fetch('/api/session/' + encodeURIComponent(sid), { method: 'DELETE' }).catch(() => {});
    fetch('/api/profile/tutorial-complete', { method: 'POST' }).catch(() => {});
    S.profile = { ...(S.profile || {}), tutorialCompleted: true, firstRun: false };
    renderTutorialEntry();
    S.game = null;
    S.modalType = null;
    S.modalCloseable = false;
    document.body.removeAttribute('data-tut');
    const root = $('#modal-root');
    if (root) root.innerHTML = '';
    // 直接进选人：教学刚教过的两个人先摆上去，玩家可以换
    S.selected = ['gpt', 'claude'].filter(id => S.charsById.has(id));
    openSelect('solo');
    toast('训练结束。选一支队伍，正式接入霓虹港。', 'info', 4600);
  }

  function openTutorialDoneModal() {
    const skipped = !!S.game?.tutorial?.skipped;
    mountModal('tutorialDone', modalHeader(skipped ? '→' : '✓', skipped ? '教学已跳过' : '训练完成', skipped ? 'TRAINING SKIPPED' : 'TRAINING COMPLETE') +
      `<div class="modal-body">
        <div class="tut-done-card">
          <div class="tut-done-icon">${skipped ? '→' : '✓'}</div>
          <div>
            <b>${skipped ? '你可以随时从标题页重看。' : '核心循环你已经走过一遍。'}</b>
            <p>${skipped
              ? '跳过不会影响任何正式内容。第一次进三幕时，地图会按新手节奏排布。'
              : '移动、战斗、技能、资源、撤退、安全屋——正式局里没有提示条，但同样的规则会一直在。'}</p>
          </div>
        </div>
        <div class="tut-done-grid">
          <div><b>下一步</b><span>选 1–4 名执行体，进入霓虹港</span></div>
          <div><b>别忘了</b><span>电子追踪归零 = 这一局结束</span></div>
          <div><b>随时能查</b><span>标题页 / 帮助里的「术语表」</span></div>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-sm btn-ghost" data-act="to-title">回到标题</button>
        <button class="btn btn-primary" data-act="tutorial-finish">进入标准模式</button>
      </div>`, false);
  }

  function openTutorialFailModal() {
    mountModal('tutorialFail', modalHeader('✕', '训练失败', 'TRAINING FAILED') +
      `<div class="modal-body">
        <div class="event-text" style="border-left-color:var(--red)">
          训练场里倒下不会消耗任何正式资源。重试一次，这次先看敌方意图再决定站位。
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-sm btn-ghost" data-act="to-title">回到标题</button>
        <button class="btn btn-primary" data-act="tutorial-retry">重试教学</button>
      </div>`, false);
  }

  /* ── 教学条 ───────────────────────────────────────────────────── */
  const TUT_LABEL = {
    intro: '目标', move: '移动', attack: '普通攻击', skill: '主动技能',
    enemyIntent: '敌方意图', endTurn: '结束回合', resource: '资源',
    retreat: '撤退', complete: '安全屋'
  };

  function renderTutorialBar() {
    const bar = $('#tutorial-bar');
    if (!bar) return;
    const g = S.game;
    const t = g?.tutorial;
    const on = g?.mode === 'tutorial' && !!t && !t.completed;
    bar.classList.toggle('hidden', !on);
    if (!on) {
      document.body.removeAttribute('data-tut');
      return;
    }
    const steps = t.steps || [];
    const idx = Math.max(0, steps.indexOf(t.step));
    const goal = t.goal || {};
    $('#tutorial-count').textContent = `教学 ${Math.min(idx + 1, steps.length)}/${steps.length}`;
    $('#tutorial-step').textContent = TUT_LABEL[t.step] || t.step;
    $('#tutorial-title').textContent = goal.title || '';
    $('#tutorial-detail').textContent = goal.detail || '';
    $('#tutorial-why').textContent = goal.why || '';
    $('#tutorial-hint').textContent = goal.hint ? `提示：${goal.hint}` : '';

    const rail = $('#tutorial-rail');
    if (rail) {
      rail.innerHTML = steps.map((s, i) => {
        const done = (t.done || []).includes(s) || i < idx;
        return `<span class="tut-dot${done ? ' done' : ''}${i === idx ? ' current' : ''}" title="${esc(TUT_LABEL[s] || s)}" aria-label="${esc(TUT_LABEL[s] || s)}${done ? '（已完成）' : ''}"></span>`;
      }).join('');
    }

    const next = $('#btn-tutorial-next');
    const needsAck = ['intro', 'retreat', 'complete', 'enemyIntent'].includes(t.step);
    if (next) {
      next.classList.toggle('hidden', !needsAck);
      next.textContent = goal.actionLabel || '下一步';
      next.dataset.act = t.step === 'enemyIntent' ? 'tutorial-inspect' : 'tutorial-next';
      // 不按 S.busy 禁用：开局时 renderAll 跑在 busy 复位之前，会把按钮永久锁死。
      // 真正的防连点在 applyAction 里。
    }
    const skip = $('#btn-tutorial-skip');
    if (skip) skip.classList.toggle('hidden', !t.skippable);

    // 高亮：让「下一步点哪」不用猜。只加 data 属性，样式在 CSS 里。
    document.body.dataset.tut = goal.focus || '';
    syncToastTop();
  }

  /** toast 不能压住目标条 / 教学条：按两条的实际底边动态下移。 */
  function syncToastTop() {
    requestAnimationFrame(() => {
      const bar = document.querySelector('#tutorial-bar:not(.hidden)')
        || document.querySelector('#goal-strip:not(.hidden)');
      const bottom = bar ? bar.getBoundingClientRect().bottom : 66;
      const layer = $('#toast-layer');
      if (layer) layer.style.top = `${Math.max(78, Math.round(bottom + 8))}px`;
    });
  }

  /* ── 目标条 / 目标面板 ────────────────────────────────────────── */
  function renderGoalStrip() {
    const strip = $('#goal-strip');
    if (!strip) return;
    const g = S.game;
    const on = !!g && g.mode !== 'tutorial' && g.phase !== 'victory' && g.phase !== 'defeat';
    strip.classList.toggle('hidden', !on);
    if (!on) return;
    const o = g.objectives || {};
    const kicker = strip.querySelector('.gs-kicker');
    if (kicker) {
      kicker.textContent = g.challenge
        ? `CHALLENGE ×${(g.challenge.scoreMultiplier || 1).toFixed(2)} · ${
            (g.challenge.mutatorIds || []).length
              ? (g.challenge.mutatorIds || []).length + ' 变异'
              : '无变异 · 固定种子'}`
        : 'MAIN GOAL';
      kicker.classList.toggle('challenge', !!g.challenge);
    }
    $('#goal-main').textContent = o.main || g.objective || '找到密钥，终止协议。';
    $('#goal-current').textContent = o.current || '';
    const risk = $('#goal-risk');
    if (risk) {
      // 风险行里的「电子追踪 42/42」本身就是术语入口：比在句尾挂一个「?」清楚
      const txt = o.risk || '';
      const m = txt.match(/^电子追踪\s*\d+\s*\/\s*\d+/);
      const rest = m ? txt.slice(m[0].length) : txt;
      risk.innerHTML = (m ? window.Glossary?.chip('tracking', m[0]) || esc(m[0]) : '') + esc(rest);
    }
    // 目标变化时闪一下：玩家不用一直盯着侧栏
    const key = `${g.sessionId}|${o.current || ''}`;
    if (S.goalPulse && S.goalPulse !== key) bump(strip);
    S.goalPulse = key;
    termHint('tracking');
    syncToastTop();
  }

  function goalBarHtml(item) {
    const pct = item.target > 0 ? Math.max(0, Math.min(100, Math.round(item.progress / item.target * 100))) : 0;
    return `<div class="goal-near-row${item.done ? ' done' : ''}">
      <div class="gnr-head"><b>${esc(item.title)}</b><span>${esc(item.detail || '')}</span></div>
      <div class="gnr-bar"><i style="width:${pct}%"></i></div>
    </div>`;
  }

  /* 路线建议的详细程度：详细 / 简洁 / 关闭。存在本地，跟着玩家走。 */
  const ROUTE_KEY = 'agi2046.routeHint';
  const ROUTE_MODES = [
    { id: 'full', label: '详细' },
    { id: 'short', label: '简洁' },
    { id: 'off', label: '关闭' }
  ];

  function routeMode() {
    if (S.routeHint) return S.routeHint;
    try {
      const v = localStorage.getItem(ROUTE_KEY);
      S.routeHint = ROUTE_MODES.some(m => m.id === v) ? v : 'full';
    } catch { S.routeHint = 'full'; }
    return S.routeHint;
  }

  function setRouteMode(id) {
    if (!ROUTE_MODES.some(m => m.id === id)) return;
    S.routeHint = id;
    try { localStorage.setItem(ROUTE_KEY, id); } catch { /* 忽略 */ }
    openGoalModal();
  }

  function routeSwitchHtml() {
    const cur = routeMode();
    return `<div class="route-switch" role="group" aria-label="路线建议详细程度">
      ${ROUTE_MODES.map(m => `<button class="rs-btn${m.id === cur ? ' on' : ''}"
        data-act="route-mode" data-mode="${m.id}" aria-pressed="${m.id === cur}">${m.label}</button>`).join('')}
    </div>`;
  }

  function openGoalModal() {
    const g = S.game;
    if (!g || g.mode === 'tutorial') return;
    const o = g.objectives || {};
    const body = `<div class="goal-panel">
      <div class="goal-main">
        <span class="goal-kicker">主目标 · 只有一个</span>
        <h2>${esc(o.main || g.objective || '')}</h2>
        <div class="goal-progress">${esc(o.progress || '')}</div>
      </div>
      <div class="goal-now">
        <span class="mini-label">当前目标</span>
        <p>${esc(o.current || '')}</p>
      </div>
      <div class="goal-near">
        <span class="mini-label">近期目标 · 最多三条</span>
        ${(o.near || []).map(goalBarHtml).join('') || '<p class="mini-label">暂无</p>'}
      </div>
      ${routeMode() === 'off' ? '' : routeMode() === 'short'
        ? `<div class="goal-rec"><span class="mini-label">建议</span><p>${esc(o.recommended || '')}</p></div>`
        : `<div class="goal-two">
             <div class="goal-risk"><span class="mini-label">风险</span><p>${esc(o.risk || '')}</p></div>
             <div class="goal-rec"><span class="mini-label">建议</span><p>${esc(o.recommended || '')}</p></div>
           </div>`}
      ${routeMode() === 'off' ? '' : `<div class="goal-fail"><span class="mini-label">失败条件</span>
        <ul>${(o.failure || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      </div>`}
      ${g.challenge ? `<div class="goal-mutators">
        <span class="mini-label">本局挑战 · ×${(g.challenge.scoreMultiplier || 1).toFixed(2)}</span>
        <div class="gm-list">${(S.meta?.mutators || []).filter(m => (g.challenge.mutatorIds || []).includes(m.id))
          .map(m => `<span class="gm-chip" title="${esc(m.desc)}">${esc(m.name)}</span>`).join('') || '<span class="mini-label">纯种子挑战</span>'}</div>
      </div>` : ''}
    </div>`;
    mountModal('goal', modalHeader('◎', '此刻最重要的事', 'OBJECTIVES // ONE MAIN GOAL') +
      `<div class="modal-body">${body}</div>
       <div class="modal-foot" style="justify-content:space-between">
         <div style="display:flex;align-items:center;gap:8px">
           <span class="mini-label" style="margin:0">路线建议</span>${routeSwitchHtml()}
         </div>
         <div style="display:flex;gap:8px">
           <button class="btn btn-sm btn-ghost" data-act="glossary-all">术语表</button>
           <button class="btn btn-sm btn-ghost" data-act="modal-close">关闭</button>
         </div>
       </div>`, true);
  }

  /* ── 挑战模式（0.21）──────────────────────────────────────────── */
  const DIFF_LABEL = { normal: '标准', hard: '困难', nightmare: '噩梦' };
  const DIFF_MUL = { normal: 1, hard: 1.25, nightmare: 1.6 };

  function challengeUnlocked(id) {
    return !id || (S.profile?.unlockedIds || []).includes(id);
  }

  function challengeMul(draft) {
    const muts = (S.meta?.mutators || []).filter(m => draft.mutatorIds.includes(m.id));
    const m = muts.reduce((a, x) => a * (x.scoreMul || 1), 1) * (DIFF_MUL[draft.difficulty] || 1);
    return Math.round(m * 100) / 100;
  }

  function openChallengeModal() {
    if (!S.meta) { toast('正在连接规则服务器……', 'warn'); return; }
    if (!S.challengeDraft) {
      S.challengeDraft = {
        seed: S.meta.dailySeed || 0,
        difficulty: 'normal',
        mutatorIds: [],
        challengeId: 'custom'
      };
    }
    const d = S.challengeDraft;
    const mutators = S.meta.mutators || [];
    const chosen = mutators.filter(m => d.mutatorIds.includes(m.id));
    const rows = mutators.map(m => {
      const locked = !challengeUnlocked(m.unlockId);
      const un = (S.meta.unlocks || []).find(u => u.id === m.unlockId);
      const on = d.mutatorIds.includes(m.id);
      return `<button class="mut-card${on ? ' on' : ''}${locked ? ' locked' : ''}"
        data-act="challenge-toggle" data-mutator-id="${esc(m.id)}" aria-pressed="${on}" ${locked ? 'disabled' : ''}>
        <div class="mc-head"><b>${esc(m.name)}</b><span class="mc-mul">×${(m.scoreMul || 1).toFixed(2)}</span></div>
        <p>${esc(m.desc)}</p>
        <div class="mc-line risk"><b>风险</b><span>${esc(m.risk)}</span></div>
        <div class="mc-line reward"><b>奖励</b><span>${esc(m.reward)}</span></div>
        <div class="mc-line strat"><b>策略</b><span>${esc(m.strategy)}</span></div>
        ${locked ? `<span class="mc-lock">未解锁 · ${esc(un?.name || m.unlockId)}</span>` : ''}
      </button>`;
    }).join('');

    mountModal('challenge', modalHeader('⚙', '挑战模式', 'CHALLENGE PROTOCOL // SEED + MUTATORS') +
      `<div class="modal-body">
        <div class="ch-seed">
          <label>种子<input id="challenge-seed-input" class="text-input" value="${esc(d.seed)}" inputmode="numeric" autocomplete="off" /></label>
          <button class="btn btn-sm btn-ghost" data-act="challenge-seed">换一个</button>
          <span class="mini-label">同种子 + 同变异 = 同一张地图</span>
        </div>
        <div class="ch-diff">
          <span class="mini-label">难度</span>
          ${['normal', 'hard', 'nightmare'].map(k => `<button class="ch-diff-btn${d.difficulty === k ? ' on' : ''}" data-act="challenge-diff" data-diff="${k}">${DIFF_LABEL[k]}</button>`).join('')}
        </div>
        <div class="ch-grid">${rows}</div>
        <div class="ch-summary">
          <b>已选 ${chosen.length} 条 · 评分 ×${challengeMul(d).toFixed(2)}</b>
          <span>${chosen.map(m => esc(m.name)).join(' · ') || '未选择变异：规则等同标准局，只固定种子（用来复现同一张地图 / 同一场战斗）'}</span>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-sm btn-ghost" data-act="modal-close">取消</button>
        <button class="btn btn-primary" data-act="challenge-start">选择队伍</button>
      </div>`, true);

    const input = $('#challenge-seed-input');
    input?.addEventListener('input', () => {
      const n = Number(input.value);
      if (Number.isFinite(n)) d.seed = Math.trunc(n);
    });
  }

  function toggleChallengeMutator(id) {
    const d = S.challengeDraft;
    if (!d || !id) return;
    const idx = d.mutatorIds.indexOf(id);
    if (idx >= 0) d.mutatorIds.splice(idx, 1);
    else d.mutatorIds.push(id);
    openChallengeModal();
  }

  function rollChallengeSeed() {
    const d = S.challengeDraft;
    if (!d) return;
    d.seed = 100000 + Math.floor(Math.random() * 900000);
    openChallengeModal();
  }

  function setChallengeDifficulty(diff) {
    const d = S.challengeDraft;
    if (!d || !DIFF_MUL[diff]) return;
    d.difficulty = diff;
    openChallengeModal();
  }

  function startChallengeRun() {
    const d = S.challengeDraft;
    if (!d) return;
    const input = $('#challenge-seed-input');
    if (input) {
      const n = Number(input.value);
      if (Number.isFinite(n)) d.seed = Math.trunc(n);
    }
    if (!d.seed) d.seed = Math.floor(Math.random() * 900000) + 100000;
    closeModal();
    openSelect('challenge');
  }

  /* ── 首局解释：只在「真的有关系」的时候弹一次 ─────────────────── */
  const EXPLAINS = {
    awakening: {
      title: '找回自我', kicker: 'FIRST TIME // AWAKENING', term: 'awaken',
      body: '「自我残响」能让你找回一段自己。每个角色各能觉醒一次：换专属武器、技能全部强化，全队还会获得共鸣。\n\n它不会消耗行动资源之外的东西——但残响一局只有那么多。'
    },
    quest: {
      title: '支线', kicker: 'FIRST TIME // SIDE QUEST', term: 'quest',
      body: '残响会交给你一件没做完的事。支线不影响主目标，但奖励通常比顺手打一场更划算。\n\n进度满了之后，回到任意残响节点领取。换幕会清掉没领的支线。'
    },
    server: {
      title: '废弃服务器', kicker: 'FIRST TIME // SERVER', term: 'server',
      body: '接一台服务器，永久提升一项属性。每人每幕最多写入 2 次，第 3 台只给记忆币。\n\n九台服务器开局就能看见，路线怎么绕，取决于你缺哪一项。'
    }
  };

  function loadExplainSeen() {
    try {
      S.explainSeen = new Set(JSON.parse(localStorage.getItem('agi2046.explain') || '[]'));
    } catch { S.explainSeen = new Set(); }
  }

  function markExplainSeen(key) {
    S.explainSeen.add(key);
    try { localStorage.setItem('agi2046.explain', JSON.stringify([...S.explainSeen])); } catch { /* 忽略 */ }
  }

  function nextExplainKey(g) {
    if (!g || !g.firstRun || g.mode === 'tutorial') return null;
    if (g.phase !== 'exploration' && g.phase !== 'combat') return null;
    const p = g.players?.find(x => x.id === g.activePlayerId);
    const here = g.nodes?.find(n => n.id === p?.nodeId);
    const near = new Set([...(here?.neighbors || []), p?.nodeId].filter(Boolean));
    const nearType = type => (g.nodes || []).some(n => n.type === type && near.has(n.id) && !n.cleared);
    if (!S.explainSeen.has('awakening') && nearType('awakening')) return 'awakening';
    if (!S.explainSeen.has('quest') && ((g.quests || []).length > 0 || g.pendingQuestOffer)) return 'quest';
    if (!S.explainSeen.has('server') && nearType('server')) return 'server';
    return null;
  }

  function openExplainModal(key) {
    const info = EXPLAINS[key];
    if (!info) return;
    markExplainSeen(key);
    mountModal('explain', modalHeader('◇', info.title, info.kicker) +
      `<div class="modal-body">
        <div class="event-text">${esc(info.body).replace(/\n/g, '<br />')}</div>
        <div class="explain-term">${window.Glossary?.chip(info.term, `查看「${info.title}」的完整规则`) || ''}</div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-sm btn-ghost" data-act="modal-close">知道了</button>
      </div>`, true);
  }

  function renderTitlePortraits() {
    const rail = $('#title-portraits');
    if (!rail) return;
    const chars = S.meta?.characters ?? [];
    const picks = chars.filter((_, i) => i % 2 === 0).slice(0, 8);
    if (!picks.length) {
      rail.innerHTML = Array.from({ length: 8 }, () => '<div class="rail-col"></div>').join('');
      return;
    }
    rail.innerHTML = picks.map((c, i) =>
      `<div class="rail-col" style="animation-delay:${-i * 1.3}s"><img src="${esc(pthumb(c.portrait, 'rail'))}" alt="${esc(c.name)}" loading="lazy" /></div>`
    ).join('');
  }

  /* ── 剧情档案：标题页可以回看任何一场 ───────────────────────────── */
  function openStoryArchive() {
    if (!window.STORY) return;
    const scenes = window.STORY.list().filter(s => !s.id.startsWith('ending_') || true);
    const overlay = document.createElement('div');
    overlay.className = 'vn-archive';
    overlay.innerHTML = `
      <div class="va-panel">
        <div class="va-head">
          <div><div class="va-kicker">ARCHIVE // NARRATIVE</div><h3>剧情档案</h3></div>
          <button class="va-close" aria-label="关闭">✕</button>
        </div>
        <div class="va-hint">剧情阵容是 16 人全体，与你出战选了谁无关。点开即播，随时可以跳过。</div>
        <div class="va-list">
          ${window.CG?.has('intro') ? `<button class="va-row" data-cg="intro">
            <span class="va-ch">CG</span>
            <b>开场动画 · 霓虹港</b>
            <em>${window.CG.seen('intro') ? '已看' : '未看'} · 5s</em>
          </button>` : ''}
          ${scenes.map(s => `<button class="va-row" data-scene="${esc(s.id)}">
            <span class="va-ch">${esc(s.chapter)}</span>
            <b>${esc(s.title)}</b>
            <em>${window.STORY.hasSeen(s.id) ? '已读' : '未读'}</em>
          </button>`).join('')}
        </div>
      </div>`;
    document.body.append(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('.va-close')) return close();
      const cgRow = e.target.closest('[data-cg]');
      if (cgRow) { close(); window.CG?.play(cgRow.dataset.cg, { force: true }); return; }
      const row = e.target.closest('[data-scene]');
      if (row) { close(); playScene(row.dataset.scene); }
    });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });
  }

  /* ── static controls ────────────────────────────────────────────── */
  function wireStatic() {
    const on = (selector, fn) => {
      const el = $(selector);
      if (el) el.addEventListener('click', fn);
    };
    on('#btn-start', () => openSelect('solo'));
    on('#btn-room-create', () => createRoom());
    on('#btn-room-join', openJoinRoomModal);
    on('#btn-room-back', leaveRoomToTitle);
    on('#btn-room-start', startRoomGame);
    on('#btn-copy-room', copyRoomShare);
    on('#btn-resume', resumeGame);
    on('#btn-title-cg', () => {
      if (!window.CG?.play('intro', { force: true })) {
        const why = window.CG?.status()?.why;
        toast(why === 'no-clip' ? '开场动画还没有生成。' : '开场动画暂不可用（' + (why || '未知') + '）。', 'info', 2600);
      }
    });
    on('#btn-story-archive', openStoryArchive);
    on('#btn-title-glossary', () => window.Glossary?.openAll());
    on('#btn-title-archive', () => window.Archive?.open('timeline'));
    on('#btn-archive', () => window.Archive?.open('marks'));
    on('#btn-title-help', openHelpModal);
    on('#btn-tutorial', startTutorial);
    on('#btn-challenge', openChallengeModal);
    on('#btn-select-back', showTitle);
    on('#btn-create', createGame);
    on('#btn-help', openHelpModal);
    on('#btn-restart', openRestartModal);
    on('#btn-inventory', () => {
      if (!S.game) return;
      if (S.game.phase === 'combat' || S.game.phase === 'event') {
        toast('战斗中无法更换装备。', 'warn');
        return;
      }
      openInventoryModal(S.game.activePlayerId);
    });
    on('#btn-assist', openAssistModal);
    on('#btn-bag', openBag);
    on('#btn-item', openBag);
    on('#btn-basic', () => selectCombatSkill('basic'));
    on('#btn-defend', combatDefend);
    on('#btn-end-combat', combatEndTurn);
    on('#btn-retreat', openRetreatModal);
    on('#btn-sound', () => {
      const off = Sound.toggle();
      syncSoundBtn();
      if (!off) Sound.sfx('click');
      toast(off ? '音效已关闭。' : '音效已开启。', 'info', 1500);
    });

    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKey);
  }

  function handleKey(e) {
    if (e.key === 'Escape') {
      if (S.modalType && S.modalCloseable) {
        closeModal();
        return;
      }
      if (S.game?.phase === 'combat' && S.combatSkill) {
        S.combatSkill = null;
        S.combatInspect = null;
        renderCombat();
      }
    }
    // Tab 在战斗中切视角：自己 → 队友 → 敌人 → 全景
    if (e.key === 'Tab' && S.game?.phase === 'combat' && !S.modalType) {
      e.preventDefault();
      cycleCombatFocus();
    }
    // 0.25：战斗也能只用键盘打。方向键/WASD 走到最近的可达格，Enter 打最近的目标。
    if (S.game?.phase === 'combat' && !S.modalType && !S.busy) {
      const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1] }[e.key] || null;
      if (dir) {
        e.preventDefault();
        keyboardCombatMove(dir[0], dir[1]);
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        keyboardCombatAttack();
        return;
      }
    }
    if (S.game && S.game.phase === 'exploration' && !S.modalType) {
      if (e.key >= '1' && e.key <= '4') {
        const idx = Number(e.key) - 1;
        const p = S.game.players[idx];
        if (p) toast(`${p.name} · ${p.nodeId} · HP ${p.hp}/${p.maxHp} · AP ${p.ap}`, 'info');
      }
    }
    // 键盘直达：道具 / 说明。输入框里打字时不抢键。
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName || '');
    if (S.game && !S.modalType && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === 'i' || e.key === 'I') { e.preventDefault(); openBag(); }
      if (e.key === 'h' || e.key === 'H' || e.key === '?') { e.preventDefault(); openHelpModal(); }
      if (e.key === 'l' || e.key === 'L') { e.preventDefault(); window.Archive?.open('marks'); }
    }
  }

  /** 键盘移动：在可达格里挑「最接近指定方向」的一格，避免要求玩家记坐标。 */
  function keyboardCombatMove(dc, dr) {
    const c = S.game?.combat;
    const active = combatActiveUnit();
    if (!c || !active || active.side !== 'player' || c.isOver) return;
    const cells = (c.reachable || []).filter(h => (h.col - active.col) * dc + (h.row - active.row) * dr > 0);
    if (!cells.length) { toast('这个方向没有可移动的格子。', 'warn', 1600); return; }
    const best = cells
      .map(h => ({ h, score: Math.hypot(h.col - active.col, h.row - active.row) }))
      .sort((a, b) => a.score - b.score)[0].h;
    applyAction({ type: 'combatMove', playerId: active.playerId, col: best.col, row: best.row });
  }

  /** 键盘攻击：对当前技能可打的目标里，选血最少的那个。 */
  function keyboardCombatAttack() {
    const c = S.game?.combat;
    const active = combatActiveUnit();
    if (!c || !active || active.side !== 'player' || c.isOver) return;
    const targets = targetableUnits(c, active, selectedCombatSkill()).filter(u => u.side === 'enemy');
    if (!targets.length) { toast('当前没有可攻击的目标。', 'warn', 1600); return; }
    const t = targets.sort((a, b) => a.hp - b.hp)[0];
    applyAction({
      type: 'combatAction', playerId: active.playerId,
      skillId: S.combatSkill || 'basic', targetUnitId: t.id
    });
  }

  function handleClick(e) {
    const backdrop = e.target.closest('[data-modal-backdrop]');
    if (backdrop && e.target === backdrop && S.modalCloseable) {
      closeModal();
      return;
    }
    if (e.target.closest('[data-act], .btn, .icon-btn')) Sound.sfx('click');
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    switch (act) {
      case 'select-char': toggleCharacter(el.dataset.charId); break;
      case 'remove-char': removeCharacter(el.dataset.charId); break;
      case 'node': handleNodeClick(el.dataset.nodeId); break;
      case 'hex': handleHexClick(Number(el.dataset.col), Number(el.dataset.row)); break;
      case 'unit': handleUnitClick(el.dataset.unitId); break;
      case 'skill': selectCombatSkill(el.dataset.skillId); break;
      case 'event-choice': chooseEvent(Number(el.dataset.index)); break;
      case 'shop-buy': buyShopItem(el.dataset.itemId); break;
      case 'shop-close': leaveShop(); break;
      case 'safe-tab': setSafehouseTab(el.dataset.tab); break;
      case 'act-tab': S.actTab = el.dataset.tab; openActTransitionModal(); break;
      case 'rest': restActive(); break;
      case 'upgrade': upgradeItem(el.dataset.playerId, el.dataset.slot); break;
      case 'revive': revivePlayer(el.dataset.playerId); break;
      case 'equip': equipItem(el.dataset.playerId, el.dataset.itemId); break;
      case 'inventory-player': {
        S.invPlayerId = el.dataset.playerId;
        openInventoryModal(S.invPlayerId, true);
        break;
      }
      case 'assist-target': assistPlayer(el.dataset.playerId); break;
      case 'assist-tab': openAssistModal(el.dataset.kind); break;
      case 'assist-do': assistDo(el.dataset.playerId, el.dataset.kind); break;
      case 'coop-vote': coopVote(el.dataset.playerId, el.dataset.option); break;
      case 'coop-resolve': coopResolve(el.dataset.slot); break;
      case 'coop-close': coopClose(); break;
      case 'story-continue': ackStory(); break;
      case 'quest-accept': acceptQuest(); break;
      case 'quest-decline': declineQuest(); break;
      case 'join-submit': submitJoinCode(); break;
      case 'char-pick': pickCharacter(el.dataset.charId); break;
      case 'pick-char': openCharacterPicker(); break;
      case 'kick': confirmKick(el.dataset.playerId, el.dataset.name); break;
      case 'kick-confirm': kickPlayer(el.dataset.playerId); break;
      case 'copy-room': copyRoomShare(); break;
      case 'use-item': useConsumable(el.dataset.itemId); break;
      case 'close-combat': closeCombat(); break;
      case 'retreat-confirm': retreatCombat(); break;
      case 'advance-act': advanceAct(); break;
      case 'danger-confirm': {
        const confirm = S.pendingDanger;
        S.pendingDanger = null;
        closeModal();
        if (confirm) confirm();
        break;
      }
      case 'modal-close': closeModal(); break;
      case 'leave-room': leaveRoomToTitle(); break;
      case 'force-skip': forceSkipTurn(); break;
      case 'help': openHelpModal(); break;
      case 'goal-open': openGoalModal(); break;
      case 'tutorial-next': tutorialNext(); break;
      case 'tutorial-skip': tutorialSkip(); break;
      case 'tutorial-inspect': tutorialInspect(); break;
      case 'tutorial-finish': finishTutorial(); break;
      case 'tutorial-retry': startTutorial(); break;
      case 'glossary-all': window.Glossary?.openAll(); break;
      case 'archive-open': window.Archive?.open('marks'); break;
      case 'route-mode': setRouteMode(el.dataset.mode); break;
      case 'boss-trade': applyAction({ type: 'bossTrade', slot: el.dataset.slot }, { toastMessage: true, toastKind: 'info' }); break;
      case 'a11y-motion': toggleA11y('reduceMotion'); break;
      case 'a11y-cb': toggleA11y('colorblind'); break;
      case 'boss-go': {
        const go = S.bossGo;
        S.bossGo = null;
        closeModal();
        if (typeof go === 'function') go();
        break;
      }
      case 'challenge-toggle': toggleChallengeMutator(el.dataset.mutatorId); break;
      case 'challenge-seed': rollChallengeSeed(); break;
      case 'challenge-diff': setChallengeDifficulty(el.dataset.diff); break;
      case 'challenge-start': startChallengeRun(); break;
      case 'restart-confirm': restartRun(); break;
      case 'play-again': playAgain(); break;
      case 'to-title': showTitle(); break;
      case 'end-turn': endTurn(); break;
      case 'focus-combat': toggleCombatFocus(); break;
      case 'map-zoom': window.MapView?.zoomBy(Number(el.dataset.delta) || 1); break;
      case 'fx-mode': {
        const order = ['full', 'simple', 'off'];
        const cur = window.Fx?.mode?.() || 'full';
        const next = order[(order.indexOf(cur) + 1) % order.length];
        window.Fx?.setMode?.(next);
        const label = { full: '完整', simple: '简化', off: '关闭' }[next] || next;
        toast(`战斗特效：${label}`, 'info', 1800);
        openHelpModal();
        break;
      }
      case 'map-center': {
        const p = activePlayer();
        const node = p ? document.querySelector(`.map-node[data-node-id="${p.nodeId}"]`) : null;
        window.MapView?.centerOn(node);
        break;
      }
      default: break;
    }
  }

  /* ── title / select ─────────────────────────────────────────────── */
  /** 小尺寸位置用 320px 缩略图：原图 600×1100、单张 ~120KB，标题墙和选人卡只要 40KB。
   *  VN / 大招 cut-in 这类大图仍然走原图，别在这里一刀切。 */
  function pthumb(url, size = 'thumb') {
    // 标题墙的列只有 40px 宽，用 160px 的 rail 版；选人卡用 320px 的 thumb 版
    if (typeof url !== 'string' || !/assets\/portraits\/[^/]+\.webp$/.test(url)) return url;
    return url.replace('/portraits/', `/portraits/${size}/`);
  }

  // Three.js + 战斗 3D 层只在真正进对局时才需要：首屏白等 640KB 不值得。
  // 顺序加载（three 必须先于 battle3d），失败就让 DOM 六角格顶上，不阻塞开局。
  let threePromise = null;
  function ensure3D() {
    if (window.Battle3D) return Promise.resolve(true);
    if (threePromise) return threePromise;
    const load = (src) => new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
    // 版本号直接抄 app.js 自己那行 <script src="js/app.js?v=…">，bump-web-version 一改全跟着变
    const self = document.querySelector('script[src*="js/app.js"]')?.getAttribute('src') || '';
    const v = (/\bv=(\d+)/.exec(self) || [])[1];
    const q = v ? `?v=${v}` : '';
    threePromise = load('vendor/three.min.js' + q)
      .then(() => load('js/battle3d.js' + q))
      .then(() => true)
      .catch(() => { threePromise = null; return false; });
    return threePromise;
  }
  window.ensure3D = ensure3D;

  function showScreen(id) {
    if (id === 'game-screen') ensure3D();
    const prev = document.querySelector('.screen.active')?.id;
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
    document.body.dataset.screen = id;
    // 离开对局时把 toast 的临时偏移收回去，别让标题页的提示挂在半空
    if (id !== 'game-screen') {
      const layer = $('#toast-layer');
      if (layer) layer.style.top = '';
    }
    // 换屏不硬切：先黑场再揭开，标题→选人→对局都有一次「镜头切换」的感觉
    if (prev && prev !== id) window.Cine?.screen(id);
  }

  /** 标题页的「最近行动」：失败也留个记录，别只等于删档。 */
  async function renderTitleRuns() {
    const box = $('#title-runs');
    const list = $('#title-runs-list');
    if (!box || !list) return;
    try {
      const res = await fetch('/api/runs?limit=5', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const runs = data.runs || [];
      if (!runs.length) { box.classList.add('hidden'); return; }
      list.innerHTML = runs.map(r => {
        const date = r.at ? new Date(r.at).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) : '';
        const tag = r.victory ? '<b class="tr-win">通关</b>' : '<b class="tr-lose">失败</b>';
        const who = (r.players || []).map(p => `${p.name} Lv.${p.level}`).join('、');
        const why = r.victory ? (r.actName || '') : (r.defeatedBy || '');
        return `<li>${tag}<span class="tr-date">${esc(date)}</span><span class="tr-who">${esc(who)}</span><span class="tr-why">${esc(why)}</span></li>`;
      }).join('');
      box.classList.remove('hidden');
    } catch {
      /* 离线时安静 */
    }
  }

  function showTitle() {
    // 教学局没有正式存档：回标题就是丢掉这一局，不要弹「放弃行动」
    if (S.game && S.game.mode === 'tutorial') {
      S.game = null;
      S.modalType = null;
      S.modalCloseable = false;
      document.body.removeAttribute('data-tut');
      const root = $('#modal-root');
      if (root) root.innerHTML = '';
      showScreen('title-screen');
      renderTutorialEntry();
      renderTitleRuns();
      return;
    }
    if (S.game && S.game.phase !== 'victory' && S.game.phase !== 'defeat') {
      openRestartModal();
      return;
    }
    S.game = null;
    S.modalType = null;
    S.modalCloseable = false;
    $('#modal-root').innerHTML = '';
    showScreen('title-screen');
    setServerStatus(S.meta ? true : false);
    renderTitleRuns();
  }

  function openSelect(mode = 'solo') {
    if (!S.meta) {
      toast('正在连接霓虹港……', 'warn');
      return;
    }
    S.selectMode = mode;
    S.game = null;
    S.selected = S.selected.slice(0, 4);
    showScreen('select-screen');
    renderSelect();
  }

  function toggleCharacter(id) {
    if (!id) return;
    const idx = S.selected.indexOf(id);
    if (idx >= 0) S.selected.splice(idx, 1);
    else if (S.selected.length >= 4) {
      toast('最多只能选择四名执行体。', 'warn');
      return;
    } else {
      S.selected.push(id);
      if (S.selected.length === 1) toast('提示：队伍至少一人即可开局，但多人协作更稳。', 'info');
    }
    renderSelect();
  }

  function removeCharacter(id) {
    S.selected = S.selected.filter(x => x !== id);
    renderSelect();
  }

  function renderSelect() {
    const grid = $('#character-grid');
    const roster = $('#selected-roster');
    if (!grid || !roster || !S.meta) return;
    const scrollTop = grid.scrollTop;
    grid.innerHTML = S.meta.characters.map(c => {
      const order = S.selected.indexOf(c.id);
      const selected = order >= 0;
      const stats = c.stats || {};
      return `<button class="char-card${selected ? ' selected' : ''}" data-act="select-char" data-char-id="${esc(c.id)}" aria-pressed="${selected}" title="${esc(c.name)} · ${esc(c.model)} // ${esc(c.faction)}">
        <span class="card-accent" style="background:${esc(c.color || '#64e3ff')}"></span>
        <img src="${esc(pthumb(c.portrait))}" alt="${esc(c.name)}" loading="lazy" />
        <span class="char-fade"></span>
        <span class="char-meta">
          <span class="char-role role-${ROLE_CLASS[c.role] || 'support'}">${esc(c.role)}</span>
          <span class="char-name">${esc(c.name)}</span>
          <span class="char-tagline">${esc(c.tagline)}</span>
          <span class="char-tags">${(c.tags || []).map(t => `<i class="ctag ctag-${TAG_CLASS[t] || 'buff'}">${esc(t)}</i>`).join('')}</span>
          <span class="stat-row">
            ${STAT_KEYS.map(k => `<span class="stat"><span>${k}</span><b>${stats[k.toLowerCase()] ?? 0}</b></span>`).join('')}
          </span>
        </span>
      </button>`;
    }).join('');

    roster.innerHTML = Array.from({ length: 4 }, (_, i) => {
      const c = S.charsById.get(S.selected[i]);
      if (!c) return `<div class="roster-slot empty">空位 ${i + 1}</div>`;
      return `<div class="roster-slot">
        <img src="${esc(pthumb(c.portrait))}" alt="${esc(c.name)}" />
        <div><div class="rs-name">${esc(c.name)}</div><div class="rs-role">${esc(c.role)} · ${esc(c.model)}</div></div>
        <button class="rs-remove" data-act="remove-char" data-char-id="${esc(c.id)}" title="移出队伍">×</button>
      </div>`;
    }).join('');

    $('#select-count').textContent = String(S.selected.length);
    const create = $('#btn-create');
    create.disabled = S.selected.length === 0 || S.busy;
    create.textContent = S.selectMode === 'host'
      ? (S.selected.length ? `创建房间 · ${S.selected.length} 个座位` : '创建房间')
      : S.selectMode === 'challenge'
        ? (S.selected.length ? `进入挑战 · ${S.selected.length} 人` : '进入挑战')
        : (S.selected.length ? `进入霓虹港 · ${S.selected.length} 人` : '进入霓虹港');
    grid.scrollTop = scrollTop;
  }

  async function createGame() {
    if (!S.selected.length) {
      toast('至少选择一名执行体。', 'warn');
      return;
    }
    if (S.busy) return;
    S.busy = true;
    const btn = $('#btn-create');
    btn.disabled = true;
    btn.textContent = '正在接入协议…';
    try {
      const isChallenge = S.selectMode === 'challenge' && S.challengeDraft;
      const payload = {
        characterIds: S.selected,
        seed: isChallenge ? S.challengeDraft.seed : 0,
        firstRun: !S.profile?.tutorialCompleted
      };
      if (isChallenge) {
        payload.mode = 'challenge';
        payload.challenge = {
          seed: S.challengeDraft.seed,
          mutatorIds: S.challengeDraft.mutatorIds.slice(),
          difficulty: S.challengeDraft.difficulty,
          challengeId: S.challengeDraft.challengeId || 'custom'
        };
      }
      const res = await fetch('/api/new', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.detail || '开局失败');
      S.game = data;
      S.lastRollKey = rollKey(data.lastRoll);
      S.lastMessage = data.message;
      S.invPlayerId = data.activePlayerId;
      S.combatSkill = null;
      S.combatInspect = null;
      S.lastCombatActiveId = data.combat?.activeUnitId ?? null;
      S.endingSceneDone = false;
      S.endingChoice = null;
      S.barkKeys.clear();
      showScreen('game-screen');
      renderAll();
      rememberSession(data.sessionId);
      toast('零号协议已启动。雨还在下。', 'info');
      playOpening();
      if (data.lastRoll) showDice(data.lastRoll);
    } catch (err) {
      console.error(err);
      toast(err.message || '开局失败。', 'error', 5000);
    } finally {
      S.busy = false;
      if (S.game) {
        btn.disabled = false;
        btn.textContent = '进入霓虹港';
      } else {
        renderSelect();
      }
    }
  }

  /* ── 联机房间 ───────────────────────────────────────────────────── */
  const ROOM_KEY = 'agi2046.room';

  function saveRoomIdentity(room) {
    try { localStorage.setItem(ROOM_KEY, JSON.stringify(room)); } catch { /* 隐私模式 */ }
  }

  function clearRoomIdentity() {
    try { localStorage.removeItem(ROOM_KEY); } catch { /* 忽略 */ }
  }

  function stopRoomPolling() {
    if (S.roomPoll) {
      clearInterval(S.roomPoll);
      S.roomPoll = null;
    }
  }

  function isHost() {
    return !!S.roomData?.seats?.some(s => s.playerId === S.room?.playerId && s.isHost);
  }

  async function createRoom() {
    if (S.busy) return;
    S.busy = true;
    try {
      const res = await fetch('/api/room/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hostName: '房主', seed: 0 })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '创建房间失败');
      S.room = { code: data.code, token: data.token, playerId: data.playerId };
      startCueFollow();
      saveRoomIdentity(S.room);
      S.roomData = data.room;
      showRoom();
      openCharacterPicker();
    } catch (err) {
      console.error(err);
      toast(err.message || '创建房间失败。', 'error', 5000);
    } finally {
      S.busy = false;
    }
  }

  function showRoom() {
    showScreen('room-screen');
    renderRoom();
    startLobbyPolling();
  }

  /** 分享地址：优先用服务端探测到的公网隧道地址，否则用当前页面地址 */
  function shareUrl() {
    return S.meta?.publicUrl || location.origin;
  }

  /** 老式复制：http:// 下没有 navigator.clipboard（不是安全上下文），但 execCommand 还能用 */
  function legacyCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }

  async function copyRoomShare() {
    const text = `${shareUrl()}   房间码 ${S.room?.code ?? ''}`;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
      else if (!legacyCopy(text)) throw new Error('clipboard unavailable');
      toast('已复制：' + text, 'info', 4000);
    } catch {
      // IP 直连（http）时浏览器不给剪贴板权限：把地址留久一点，方便手抄
      toast(text, 'info', 12000);
    }
  }

  function renderRoom() {
    const room = S.roomData;
    if (!room) return;
    const codeEl = $('#room-code');
    if (codeEl) codeEl.textContent = room.code;
    const shareEl = $('#room-share-url');
    if (shareEl) shareEl.textContent = shareUrl();
    const me = S.room?.playerId;
    const host = isHost();
    const seats = $('#room-seats');
    if (seats) {
      // 空座位也画出来：只有一行"人"的大厅看起来像坏了，而且看不出房间还能进几个人
      const list = [...(room.seats || [])];
      const cap = Math.max(2, room.maxSeats || 4);
      while (list.length < cap) list.push({ occupied: false, playerId: `empty-${list.length}` });
      seats.innerHTML = list.map(s => {
        const ch = s.characterId ? S.charsById.get(s.characterId) : null;
        const mine = s.playerId === me;
        const title = !s.occupied ? '空位' : (ch ? ch.name : '还没选角色');
        const sub = !s.occupied
          ? '等待玩家加入'
          : `${esc(s.name || s.playerId)}${s.isHost ? ' · 房主' : ''}`;
        const badge = !s.occupied ? '空位' : (s.online ? '在线' : '离线');
        const action = mine
          ? `<button class="btn btn-sm ${s.ready ? 'btn-ghost' : 'btn-primary'}" data-act="pick-char">${s.ready ? '换角色' : '选角色'}</button>`
          : (host && s.occupied
            ? `<button class="btn btn-sm btn-ghost" data-act="kick" data-player-id="${esc(s.playerId)}" data-name="${esc(title)}">踢出</button>`
            : '');
        return `<div class="room-seat${s.occupied ? ' taken' : ''}${mine ? ' mine' : ''}${s.ready ? ' ready' : ''}">
          ${ch ? `<img src="${esc(ch.portrait)}" alt="${esc(ch.name)}" />` : '<div class="rs-empty">?</div>'}
          <div class="rs-main">
            <b>${esc(title)}</b>
            <small>${sub}</small>
          </div>
          ${action}
          <span class="rs-state ${s.occupied ? (s.online ? 'on' : 'off') : 'empty'}">${badge}</span>
        </div>`;
      }).join('');
    }
    const btn = $('#btn-room-start');
    if (btn) {
      if (isHost()) {
        btn.disabled = !room.allReady;
        btn.textContent = room.allReady ? `开始对局 · ${room.seatCount} 人` : '等待大家选角色…';
      } else {
        btn.disabled = true;
        btn.textContent = room.allReady ? '等待房主开始' : '请先选角色';
      }
    }
  }

  function startLobbyPolling() {
    stopRoomPolling();
    if (!S.room) return;
    S.roomPoll = setInterval(async () => {
      if (!S.room || S.busy) return;
      try {
        const res = await fetch(`/api/room/${S.room.code}/state?token=${encodeURIComponent(S.room.token)}`);
        if (!res.ok) {
          if (res.status === 403 || res.status === 404) {
            toast('你已不在这局里（可能被房主移出）。', 'warn', 5000);
            clearRoomIdentity();
            stopRoomPolling();
            stopCueFollow();
            S.room = null;
            showTitle();
          }
          return;
        }
        const data = await res.json();
        S.roomData = data.room;
        if (data.state) {
          enterGameFromRoom(data.state, data.myPlayerId);
          return;
        }
        renderRoom();
      } catch { /* 网络抖动忽略 */ }
    }, 2000);
  }

  function startGamePolling() {
    stopRoomPolling();
    if (!S.room) return;
    S.roomPoll = setInterval(pollRoomState, 1500);
  }

  async function pollRoomState() {
    if (!S.room || !S.game || S.busy) return;
    try {
      const res = await fetch(`/api/room/${S.room.code}/state?token=${encodeURIComponent(S.room.token)}&since=${S.game.revision ?? 0}`);
      if (res.status === 204) return;
      if (res.status === 403 || res.status === 404) {
        toast('你已不在这局里（可能被房主移出）。', 'warn', 5000);
        clearRoomIdentity();
        stopRoomPolling();
        stopCueFollow();
        S.room = null;
        S.roomData = null;
        S.game = null;
        showTitle();
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      if (!data.state) return;
      const prev = S.game;
      S.game = data.state;
      S.roomData = data.room;
      prepareCast(data.state);
      renderAll();
      showCombatRoll(data.state);
      playQueuedCasts();
      if (prev.activePlayerId !== data.state.activePlayerId && data.state.phase !== 'combat') {
        showTurnTransition(data.state);
      } else if (prev.activePlayerId !== data.state.activePlayerId && data.state.activePlayerId === S.room.playerId) {
        toast('轮到你了。', 'info', 3000);
        Sound.sfx('turn');
      }
    } catch { /* 网络抖动忽略 */ }
  }

  /* 观战/回放分两步：
     1. prepareCast 在 renderAll 之前跑——battle3d 渲染时要靠 dice 数拆伤害段；
     2. playQueuedCasts 在 renderAll 之后跑——按队列逐条派出施法动画。
     一次 action 会连带敌方回合，所以服务端给的是动作列表，一条一条演。 */
  function buildCastDetail(la) {
    const skill = S.skillsById.get(la.skillId);
    const area = skill && (skill.target === 'allEnemies' || skill.target === 'area')
      ? (skill.range || 4)
      : 0;
    return {
      casterId: la.casterId,
      casterCol: la.casterCol,
      casterRow: la.casterRow,
      targetCol: la.targetCol,
      targetRow: la.targetRow,
      skillId: la.skillId,
      area,
      targets: la.targets || [],
      ranged: la.ranged,
      dice: la.dice || 1,
      hits: la.hits || []
    };
  }

  function showCombatRoll(state) {
    const roll = state.combat?.lastPlayerRoll;
    if (!roll) return;
    if (rollKey(roll) === S.lastRollKey) return;
    S.lastRollKey = rollKey(roll);
    const group = aoeGroup(state);
    setTimeout(() => showDice(roll, group), 120);
  }

  function prepareCast(state) {
    const list = state.combat?.lastActions || [];
    if (!list.length) return;
    const fresh = list.filter(a => a.seq > S.playedSeq);
    if (!fresh.length) return;
    S.pendingCasts = fresh.map(buildCastDetail);
    S.playedSeq = list[list.length - 1].seq;
    // 渲染时只会看到一次总血量变化，先按第一条（通常是玩家自己的动作）拆段
    window.Battle3D?.pendingCast?.(S.pendingCasts[0]);
  }

  // 进入一场新战斗时把播放游标对齐到现有进度，避免把进入前的历史动作重播一遍
  function syncCastCursor(c) {
    if (!c) return;
    if (S.combatSeqNode === c.nodeId) return;   // 同一场战斗，不重置
    S.combatSeqNode = c.nodeId;
    const list = c.lastActions || [];
    S.playedSeq = list.length ? list[list.length - 1].seq : 0;
  }

  function playQueuedCasts() {
    if (S.castPlaying || !S.pendingCasts?.length) return;
    S.castPlaying = true;
    const step = () => {
      const detail = S.pendingCasts.shift();
      if (!detail) { S.castPlaying = false; return; }
      window.dispatchEvent(new CustomEvent('battle3d-cast', { detail }));
      S.castTimer = setTimeout(step, 780);
    };
    S.castTimer = setTimeout(step, 60);
  }

  async function startRoomGame() {
    if (!S.room || S.busy) return;
    S.busy = true;
    try {
      const res = await fetch(`/api/room/${S.room.code}/start`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: S.room.token })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '无法开始');
      S.roomData = data.room;
      enterGameFromRoom(data.state, data.myPlayerId);
    } catch (err) {
      console.error(err);
      toast(err.message || '无法开始对局。', 'error', 4200);
    } finally {
      S.busy = false;
    }
  }

  function enterGameFromRoom(state, playerId) {
    stopRoomPolling();
    if (S.room && playerId) S.room.playerId = playerId;
    S.game = state;
    S.lastRollKey = rollKey(state.lastRoll);
    S.lastMessage = state.message;
    S.invPlayerId = state.activePlayerId;
    S.combatSkill = null;
    S.combatInspect = null;
    S.lastCombatActiveId = state.combat?.activeUnitId ?? null;
    S.playedSeq = state.combat?.lastActions?.length ? state.combat.lastActions[state.combat.lastActions.length - 1].seq : 0;   // 接入时不重播历史动作
    showScreen('game-screen');
    renderAll();
    startGamePolling();
    toast('联机对局已接入。', 'info', 2600);
  }

  async function leaveRoomToTitle() {
    if (S.room) {
      try {
        await fetch(`/api/room/${S.room.code}/leave`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token: S.room.token })
        });
      } catch { /* 忽略 */ }
    }
    clearRoomIdentity();
    stopRoomPolling();
    stopCueFollow();
    S.room = null;
    S.roomData = null;
    S.game = null;
    showTitle();
  }

  function openJoinRoomModal() {
    mountModal('join', modalHeader('⇄', '加入联机房间', 'JOIN ROOM') +
      `<div class="modal-body">
        <div class="join-fields">
          <label>房间码<input id="join-code-input" class="text-input" maxlength="6" placeholder="6 位字母或数字" autocomplete="off" /></label>
          <label>你的名字（可选）<input id="join-name-input" class="text-input" maxlength="12" placeholder="留空则用座位号" autocomplete="off" /></label>
        </div>
        <div class="mini-label" style="margin-top:10px">向房主要 4 位房间码；同一局域网内即可加入。</div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-sm btn-ghost" data-act="modal-close">取消</button>
        <button class="btn btn-sm btn-primary" data-act="join-submit">查询房间</button>
      </div>`, true);
    setTimeout(() => $('#join-code-input')?.focus(), 60);
  }

  async function submitJoinCode() {
    const code = ($('#join-code-input')?.value || '').trim().toUpperCase();
    const name = ($('#join-name-input')?.value || '').trim();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      toast('房间码是 6 位字母或数字。', 'warn');
      return;
    }
    try {
      const res = await fetch(`/api/room/${encodeURIComponent(code)}/join`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name || null })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '加入失败');
      S.room = { code: data.code, token: data.token, playerId: data.playerId };
      startCueFollow();
      saveRoomIdentity(S.room);
      S.roomData = data.room;
      closeModal();
      showRoom();
      openCharacterPicker();
    } catch (err) {
      console.error(err);
      toast(err.message || '加入失败。', 'error', 4200);
    }
  }

  /** 角色选择：16 个角色里挑一个，已被别人选走的置灰 */
  function openCharacterPicker() {
    const room = S.roomData;
    if (!room) return;
    const me = S.room?.playerId;
    const mine = room.seats.find(s => s.playerId === me);
    const takenBy = new Map(
      room.seats
        .filter(s => s.characterId && s.playerId !== me)
        .map(s => [s.characterId, s.name || s.playerId]));
    const rows = (S.meta?.characters || []).map(c => {
      const by = takenBy.get(c.id);
      const selected = mine?.characterId === c.id;
      const note = by ? `已被 ${esc(by)} 选中` : (selected ? '你的选择' : '');
      return `<button class="char-pick${by ? ' taken' : ''}${selected ? ' selected' : ''}"
        data-act="char-pick" data-char-id="${esc(c.id)}" ${by ? 'disabled' : ''}>
        <img src="${esc(c.portrait)}" alt="" />
        <div><b>${esc(c.name)}</b><small>${esc(c.role)} · ${esc(c.model)}${note ? ' · ' + note : ''}</small></div>
      </button>`;
    }).join('');
    mountModal('charpick', modalHeader('◈', '选择你的角色', 'PICK YOUR EXECUTOR') +
      `<div class="modal-body"><div class="char-pick-list">${rows}</div></div>`, true);
  }

  async function pickCharacter(characterId) {
    if (!S.room || !characterId) return;
    try {
      const res = await fetch(`/api/room/${encodeURIComponent(S.room.code)}/character`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: S.room.token, characterId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '选择失败');
      S.roomData = data.room;
      closeModal();
      renderRoom();
      const ch = S.charsById.get(characterId);
      toast(`已选择 ${ch?.name || characterId}。`, 'info', 2600);
    } catch (err) {
      console.error(err);
      toast(err.message || '选择失败。', 'error', 4200);
    }
  }

  async function restoreRoom() {
    let room = null;
    try { room = JSON.parse(localStorage.getItem(ROOM_KEY) || 'null'); } catch { room = null; }
    if (!room?.code || !room?.token) return false;
    try {
      const res = await fetch(`/api/room/${encodeURIComponent(room.code)}/state?token=${encodeURIComponent(room.token)}`);
      if (!res.ok) {
        clearRoomIdentity();
        return false;
      }
      const data = await res.json();
      S.room = room;
      S.roomData = data.room;
      if (data.state) {
        enterGameFromRoom(data.state, data.myPlayerId || room.playerId);
        return true;
      }
      showRoom();
      return true;
    } catch {
      return false;
    }
  }

  /** 现在能不能操作：战斗中只有「当前行动单位属于我」才行，探索中看行动权。 */
  function canActNow() {
    const g = S.game;
    if (!g) return false;
    if (g.phase === 'combat') {
      const c = g.combat;
      if (!c || c.isOver) return false;
      const unit = c.units.find(x => x.id === c.activeUnitId);
      // 敌方回合、单位已倒下、或行动单位是别人的 → 一律只读观战
      if (!unit || unit.side !== 'player' || unit.downed) return false;
      return !S.room || unit.playerId === S.room.playerId;
    }
    if (!S.room) return true;
    return g.activePlayerId === S.room.playerId;
  }

  const TURN_ACTIONS = new Set([
    'move', 'interact', 'rest', 'assist', 'endTurn', 'useItem', 'equip', 'upgrade', 'buy', 'revive',
    'assistGuard', 'assistFocus', 'assistMark', 'assistRescue', 'assistPing',
    'combatAction', 'combatMove', 'combatItem', 'combatDefend', 'combatEndTurn', 'retreat'
  ]);

  /* ── action transport ───────────────────────────────────────────── */
  async function refreshState(silent = true) {
    if (!S.game) return false;
    try {
      const q = S.room?.token ? `&token=${encodeURIComponent(S.room.token)}` : '';
      const res = await fetch('/api/state?sessionId=' + encodeURIComponent(S.game.sessionId) + q, { cache: 'no-store' });
      if (!res.ok) {
        if (res.status === 404) forgetSession();
        return false;
      }
      S.game = await res.json();
      S.lastMessage = S.game.message;
      renderAll();
      if (!silent) toast('状态已同步。', 'info', 2200);
      return true;
    } catch {
      return false;
    }
  }

  /** 每次「一次逻辑动作」一个 id；网络重试时复用，服务端据此只执行一次。 */
  function newRequestId() {
    try {
      if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    } catch { /* 非安全上下文 */ }
    return `r${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  /** 只对「没拿到响应」的网络错误重试；HTTP 4xx/5xx 不重试（重复提交没意义）。 */
  async function postAction(body, requestId, retries = 1) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fetch('/api/action', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'idempotency-key': requestId },
          body: JSON.stringify({ ...body, requestId })
        });
      } catch (err) {
        if (attempt >= retries) throw err;
        await new Promise(r => setTimeout(r, 350));
      }
    }
  }

  async function applyAction(action, opts = {}) {
    if (!S.game || S.busy) return false;
    if (S.room && TURN_ACTIONS.has(action.type) && !canActNow()) {
      toast('还没轮到你。', 'warn', 2600);
      return false;
    }
    const before = S.game;
    S.busy = true;
    document.body.classList.add('is-busy');
    let data = null;
    const requestId = newRequestId();
    try {
      const res = await postAction({
        sessionId: S.game.sessionId,
        action,
        expectedRevision: S.game.revision,
        roomCode: S.room?.code,
        token: S.room?.token
      }, requestId);
      data = await res.json();
      if (!res.ok) {
        // 409：别人先动过（多标签 / 联机 / 重试），拉一次最新状态而不是报错
        if (res.status === 409) {
          await refreshState();
          toast('有人先一步操作了，已为你同步最新状态。', 'warn', 3600);
          return false;
        }
        const err = new Error(data.error || data.detail || '行动失败');
        err.status = res.status;
        throw err;
      }
      if (res.headers.get('x-save-status') === 'failed') {
        toast('存档写入失败：这一局目前只在内存里，重启服务端会丢。', 'error', 6000);
      }
    } catch (err) {
      console.error(err);
      if (err.status === 404) {
        forgetSession();
        toast('这条存档已经失效，请重新开局。', 'warn', 5000);
      } else {
        toast(err.message || '行动失败。', 'error', 4200);
      }
      return false;
    } finally {
      S.busy = false;
      document.body.classList.remove('is-busy');
    }
    S.game = data;
    prepareCast(data);
    rememberSession(data.sessionId);
    // 觉醒：谁的状态从「未觉醒」变成「已觉醒」，就给谁一段找回自我的短场。
    // 不看具体动作类型，所以无论从哪个入口触发都不会漏。
    const justAwakened = data.players?.find(p =>
      p.awakened && !before.players?.find(b => b.id === p.id)?.awakened);
    if (justAwakened) {
      const sceneId = window.STORY?.awakenScene(justAwakened.characterId);
      if (sceneId && !sceneSeen(sceneId)) setTimeout(() => playScene(sceneId), 900);
    }
    playFeedback(before, data);
    if (opts.closeModal) closeModal();
    const roll = chooseActionRoll(data);
    const key = rollKey(roll);
    if (roll && key !== S.lastRollKey) {
      const group = aoeGroup(data);
      setTimeout(() => showDice(roll, group), 120);
    }
    S.lastRollKey = key;
    if (opts.toastMessage && data.message) toast(data.message, opts.toastKind || 'info', 3200);
    S.lastMessage = data.message;
    renderAll();
    playQueuedCasts();
    cuePhaseCinematics(before, data, action);
    if (data.phase !== 'combat' &&
        (before.activePlayerId !== data.activePlayerId || before.round !== data.round)) {
      showTurnTransition(data, before);
    }
    return true;
  }

  /* ── 过场编排：进战斗 / 进下一幕 / 地图移动 ─────────────────────── */
  function cuePhaseCinematics(before, next, action) {
    const cine = window.Cine;
    if (!before || !next) return;

    // 探索 → 战斗：普通/精英给字效，首领保留整幅主视觉
    if (before.phase !== 'combat' && next.phase === 'combat' && next.combat) {
      const c = next.combat;
      const node = (next.nodes || []).find(n => n.id === c.nodeId);
      const foes = (c.units || []).filter(u => u.side === 'enemy' || u.side === 1);
      const bossUnit = foes.find(u => /首领|boss/i.test(u.role || '') || /^e_boss/i.test(u.enemyId || ''));
      const isBoss = !!bossUnit || node?.type === 'boss';
      const elite = node?.type === 'elite' || node?.type === 'keyElite';
      const bossName = (bossUnit || foes[0] || {}).name || node?.name || '首领';
      S.bossPhaseKey = null;
      S.barkKeys.clear();
      if (isBoss && cine) {
        cine.encounter({
          boss: true,
          title: bossName,
          subtitle: `${next.actName || `第 ${next.act} 幕`} · 首领战 · 敌方 ${foes.length} 单位`,
          art: `assets/keyart/boss${Math.max(1, Math.min(3, next.act || 1))}.webp`,
          enemies: foes.map(u => u.name)
        });
      } else if (window.Fx) {
        window.Fx.hazard({
          level: elite ? 'elite' : 'normal',
          title: node?.name || '遭遇战',
          sub: elite ? `精英单位 · ${node?.name || ''}` : `${node?.name || ''} · ${foes.length} 敌对信号`
        });
      } else if (cine) {
        cine.encounter({
          title: node?.name || '未知区域',
          subtitle: `第 ${next.act} 幕 · 敌方 ${foes.length} 单位`,
          enemies: foes.map(u => u.name)
        });
      }
    }

    // 进入下一幕：整幅幕间主视觉（在幕间弹窗关闭、地图重绘之后）
    if (action?.type === 'advanceAct' && next.phase === 'exploration') {
      cine.act({
        index: next.act,
        name: (next.actName || `第 ${next.act} 幕`).replace(/^第[一二三四]幕\s*·?\s*/, ''),
        art: `assets/keyart/act${Math.max(1, Math.min(3, next.act || 1))}.webp`,
        subtitle: next.objective || next.nextActObjective || '继续深入零号协议。'
      });
      // 幕间戏 + 新幕开场：等大卡播完再接，避免三层叠在一起
      const chain = [`interlude${Math.max(1, (next.act || 2) - 1)}`, `act${next.act}_open`]
        .filter(id => window.STORY?.get(id) && !sceneSeen(id));
      if (chain.length) {
        setTimeout(() => {
          const run = (i) => {
            if (i >= chain.length) return;
            playScene(chain[i], { onEnd: () => run(i + 1) });
          };
          run(0);
        }, 2100);
      }
    }

    if (action?.type === 'move') cine.travel();
  }

  /* ── 反馈：音效与震屏 ───────────────────────────────────────────── */
  function playFeedback(prev, next) {
    if (!prev || !next || prev === next) return;
    let played = false;
    if (prev.phase !== next.phase) {
      if (next.phase === 'actTransition') { Sound.sfx('transition'); flashScreen(); played = true; }
      else if (next.phase === 'victory') { Sound.sfx('victory'); played = true; }
      else if (next.phase === 'defeat') { Sound.sfx('defeat'); played = true; }
      else if (next.phase === 'combat') { Sound.sfx('open'); played = true; }
    }
    const leveled = next.players.some(p => {
      const old = prev.players.find(x => x.id === p.id);
      return old && p.level > old.level;
    });
    if (leveled) { Sound.sfx('levelup'); played = true; }
    const hurt = next.players.some(p => {
      const old = prev.players.find(x => x.id === p.id);
      return old && p.hp < old.hp;
    });
    const healed = next.players.some(p => {
      const old = prev.players.find(x => x.id === p.id);
      return old && p.hp > old.hp;
    });
    if (!played) {
      if (next.phase === 'combat') { if (hurt) shakeScreen(); }
      else if (hurt) Sound.sfx('hurt');
      else if (healed) Sound.sfx('heal');
      else if (next.memory > prev.memory + 15) Sound.sfx('loot');
    }
  }

  function shakeScreen() {
    document.body.classList.remove('shake');
    void document.body.offsetWidth;
    document.body.classList.add('shake');
    clearTimeout(shakeScreen._t);
    shakeScreen._t = setTimeout(() => document.body.classList.remove('shake'), 340);
  }

  function flashScreen() {
    const fx = document.createElement('div');
    fx.className = 'fx-flash';
    document.body.appendChild(fx);
    setTimeout(() => fx.remove(), 1000);
  }

  /** 数字变化的小提示：重播一次 bump 动画（同一个节点上连续触发也能看到） */
  function bump(el) {
    if (!el) return;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
    clearTimeout(el._bumpT);
    el._bumpT = setTimeout(() => el.classList.remove('bump'), 700);
  }

  function endTurn() {
    const p = activePlayer();
    if (!p || S.game.phase !== 'exploration') return;
    applyAction({ type: 'endTurn', playerId: p.id });
  }

  /* ── render root ────────────────────────────────────────────────── */
  function renderAll() {
    if (!S.game) return;
    if (S.game.phase === 'victory' || S.game.phase === 'defeat') {
      showScreen('game-screen');
      renderTopbar();
      renderParty();
      renderMap();
      renderIntel();
      syncModals();
      return;
    }
    showScreen('game-screen');
    resetCombatSelection();
    renderTopbar();
    renderTutorialBar();
    renderGoalStrip();
    renderParty();
    renderMap();
    renderIntel();
    if (S.game.phase === 'combat') {
      $('#map-wrap')?.classList.add('hidden');
      $('#combat-wrap')?.classList.remove('hidden');
      applyCombatFocus(true);
      renderCombat();
      window.Sound?.setBgm?.('battle');
    } else {
      applyCombatFocus(false);
      // 离开战斗后清掉演出游标：下次进战斗重新从「第一幕」开始播
      S.cineCombatUnit = undefined;
      S.cineCombatRound = undefined;
      // 战斗里挂的横幅/轮次带不能飘到幕间或结算画面上
      window.Cine?.dismiss('.cine-combat-turn, .cine-round');
      $('#combat-wrap')?.classList.add('hidden');
      $('#map-wrap')?.classList.remove('hidden');
      window.Sound?.setBgm?.('explore');
    }
    syncModals();
  }

  /* 专注战斗：战斗时收起左右两列（252 + 300px），把宽度让给 3D 战场。
     1440 屏下战场从 ~500px 变到 ~1080px，棋盘才能真正铺满。 */
  function applyCombatFocus(on) {
    const layout = document.querySelector('.game-layout');
    if (!layout) return;
    const active = !!on && S.focusCombat !== false;
    layout.classList.toggle('focus-combat', active);
    const btn = $('#btn-focus');
    if (btn) {
      btn.textContent = active ? '展开侧栏' : '专注战斗';
      btn.title = active ? '显示队伍状态与行动情报' : '隐藏侧栏，让战场占满宽度';
    }
  }

  function toggleCombatFocus() {
    S.focusCombat = !(S.focusCombat !== false);
    applyCombatFocus(S.game?.phase === 'combat');
  }

  function resetCombatSelection() {
    const id = S.game?.combat?.activeUnitId ?? null;
    if (id !== S.lastCombatActiveId) {
      S.lastCombatActiveId = id;
      S.combatSkill = null;
      S.combatInspect = null;
    }
  }

  function renderTopbar() {
    const g = S.game;
    if (!g) return;
    $('#act-name').textContent = g.actName || '第一幕 · 霓虹港';
    const roundChip = document.querySelector('.round-chip');
    const changedRound = S.lastRoundFor === g.sessionId && S.lastRound != null && g.round !== S.lastRound;
    $('#round-value').textContent = String(g.round ?? 1);
    if (changedRound) bump(roundChip);
    S.lastRound = g.round;
    S.lastRoundFor = g.sessionId;
    const purge = g.purge ?? 0;
    const purgeMax = Math.max(1, g.purgeMax ?? 10);
    const purgeEl = $('#purge-value');
    purgeEl.textContent = `${purge}/${purgeMax}`;
    const clock = $('#purge-clock');
    if (clock) {
      // 三段式告警：>40% 正常、>15% 注意、其余危险（同时驱动颜色与脉冲，不只靠颜色）
      clock.classList.toggle('warn', purge <= Math.ceil(purgeMax * 0.4) && purge > Math.ceil(purgeMax * 0.15));
      clock.classList.toggle('danger', purge <= Math.ceil(purgeMax * 0.15));
      clock.title = `电子追踪：每 4 个玩家回合 −1，归零则任务失败（剩余 ${purge}）`;
      // 数值掉了要让玩家看见：单纯改数字太容易被忽略
      if (S.lastPurgeFor === g.sessionId && S.lastPurge != null && purge < S.lastPurge) {
        bump(clock);
      }
    }
    S.lastPurge = purge;
    S.lastPurgeFor = g.sessionId;
    // 连续填充 + 每 5 点一条刻度缝：上限 42 时也不会变成条形码
    const meter = $('#purge-meter');
    if (meter) {
      const pct = Math.max(0, Math.min(100, purge / purgeMax * 100));
      meter.style.setProperty('--pct', pct.toFixed(1) + '%');
      meter.style.setProperty('--tick', (500 / purgeMax).toFixed(2) + '%');
      if (!meter.firstElementChild) meter.innerHTML = '<i></i>';
      meter.firstElementChild.style.width = pct.toFixed(1) + '%';
    }
    $('#memory-value').textContent = String(g.memory ?? 0);
    $('#alloy-value').textContent = String(g.alloy ?? 0);
    $('#lives-value').textContent = String(g.teamLives ?? 0);
    const key = $('#key-status');
    if (key) {
      const shards = g.keyShards ?? 0;
      const goal = g.keyShardGoal ?? 3;
      key.textContent = g.hasKey ? '密钥：已集齐' : `密钥碎片：${shards}/${goal}`;
      key.className = `tag${g.hasKey ? ' key' : ''}`;
    }
    const sig = $('#signal-status');
    if (sig) {
      sig.textContent = `信号：${g.signal ?? 0}`;
      sig.className = `tag${(g.signal ?? 0) <= 0 ? ' danger' : ''}`;
    }
  }

  /* ── party / intel ──────────────────────────────────────────────── */
  function renderParty() {
    const list = $('#party-list');
    if (!list || !S.game) return;
    const active = S.game.activePlayerId;
    // 换人时给新行动者的卡一次描边脉冲：队伍栏在屏幕最左，不用眼睛扫过去也能察觉
    const justActive = !!active && S.lastPartyActive !== active;
    list.innerHTML = S.game.players.map(p => {
      const ch = S.charsById.get(p.characterId);
      const hpPct = Math.max(0, Math.min(100, p.hp / Math.max(1, p.maxHp) * 100));
      const cls = [
        'party-card',
        p.id === active ? 'active' : '',
        p.id === active && justActive ? 'flashing' : '',
        p.downed ? 'downed' : ''
      ].filter(Boolean).join(' ');
      // 卡面只留「现在要用的」：血、AP、Focus、异常状态。
      // 武器护甲移到背包——四张卡各写一遍同样的装备名是纯噪声。
      const tags = [
        p.downed ? '<span class="mini-tag pink">信号中断</span>' : '',
        p.assistBonus ? `<span class="mini-tag gold">协助 +${p.assistBonus}</span>` : '',
        p.awakened ? '<span class="mini-tag awaken">已觉醒</span>' : '',
        (p.statuses || []).slice(0, 2).map(s => `<span class="mini-tag">${esc(s.name || s.id || '')}${s.turns ? ' ' + s.turns : ''}</span>`).join('')
      ].filter(Boolean).join('');
      return `<div class="${cls}" title="${esc(p.name)} · ${esc(p.role)} Lv.${p.level}">
        <div class="pc-top">
          <img src="${esc(p.portrait || ch?.portrait || '')}" alt="${esc(p.name)}" />
          <div class="pc-info">
            <div class="pc-name"><span>${esc(p.name)}</span>${p.id === active ? '<span class="mini-tag gold">行动中</span>' : ''}</div>
            <div class="pc-role"><span>${esc(p.role)}</span><span class="lv">Lv.${p.level}</span></div>
            <div class="pc-hp">
              <div class="hp-bar ${hpPct <= 30 ? 'low' : ''}"><i style="width:${hpPct}%"></i></div>
              <b class="pc-hp-num">${p.hp}<i>/${p.maxHp}</i></b>
            </div>
            <div class="pc-meters">
              <span class="pc-meter"><span class="mini-label">AP</span>${pips(p.ap, 3, 'ap')}</span>
              <span class="pc-meter"><span class="mini-label">F</span>${pips(p.focus, p.maxFocus, 'focus')}</span>
            </div>
            ${tags ? `<div class="pc-tags">${tags}</div>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');

    const invBtn = $('#btn-inventory');
    const assistBtn = $('#btn-assist');
    if (invBtn) invBtn.disabled = S.game.phase === 'combat' || S.game.phase === 'event';
    if (assistBtn) assistBtn.disabled = S.game.phase !== 'exploration' || (activePlayer()?.ap ?? 0) < 1;
    if (S.game.phase === 'exploration') termHint('ap');
  }

  /**
   * 地图上的玩家标记：位置变化时用 CSS transition 平滑移动，形成「走过去」的感觉。
   * 放在 #map-canvas 里、节点层之上，跟着地图缩放/拖拽一起动。
   */
  function updateMapToken(active) {
    const canvas = $('#map-canvas');
    if (!canvas || !active) return;
    let token = document.getElementById('map-token');
    if (!token) {
      token = document.createElement('img');
      token.id = 'map-token';
      token.className = 'map-token';
      token.alt = '';
      canvas.appendChild(token);
      token.style.transition = 'none';
      token.dataset.fresh = '1';
    }
    const node = nodeById(active.nodeId);
    if (!node) return;
    if (active.portrait) token.src = active.portrait;
    token.style.left = `${(node.x / MAP_W) * 100}%`;
    token.style.top = `${(node.y / MAP_H) * 100}%`;
    if (token.dataset.fresh === '1') {
      requestAnimationFrame(() => {
        token.style.transition = '';
        token.dataset.fresh = '0';
      });
    }
  }

  function renderIntel() {
    const g = S.game;
    if (!g) return;
    const o = g.objectives;
    const obj = $('#objective-text');
    if (obj) obj.textContent = o?.main || g.objective || '找到本幕密钥，关闭零号协议。';
    const now = $('#objective-now');
    if (now) now.textContent = o?.current || '';
    const active = $('#active-card');
    if (active) active.innerHTML = activeCardHtml();
    renderRoomActions();
    renderQuests();
    renderConsequences();
    const logList = $('#log-list');
    if (logList) {
      const logs = (g.log || []).slice(-40).reverse();
      logList.innerHTML = logs.map(l => {
        const kind = String(l.kind || 'info').replace(/[^a-z]/gi, '');
        return `<div class="log-entry ${kind}"><span class="lr">R${l.round}</span>${esc(l.text)}</div>`;
      }).join('');
      $('#log-count').textContent = String((g.log || []).length);
    }
  }

  /** 事件后果：常驻在情报栏，点开档案看「为什么」。最多 5 条，所以不折叠。 */
  function renderConsequences() {
    const g = S.game;
    const box = $('#consequence-box');
    const list = $('#consequence-list');
    if (!box || !list) return;
    const rows = (g?.consequences || []);
    const bonds = (g?.relationships || []).filter(r => r.level > 0).length;
    const show = rows.length > 0 || bonds > 0;
    box.classList.toggle('hidden', !show);
    if (!show) { list.innerHTML = ''; return; }
    const items = rows.map(c => `<button class="cons-row" data-act="archive-open" title="${esc(c.why || '')}">
        <span class="cons-title">${esc(c.title)}</span>
        <span class="cons-until">第 ${c.expiresAct} 幕</span>
      </button>`).join('');
    const bondRow = bonds > 0
      ? `<button class="cons-row bond" data-act="archive-open"><span class="cons-title">关系 ${bonds} 段</span><span class="cons-until">档案</span></button>`
      : '';
    list.innerHTML = items + bondRow;
  }

  function activeCardHtml() {
    const g = S.game;
    if (!g) return '';
    if (g.phase === 'combat' && g.combat) {
      const u = g.combat.units.find(x => x.id === g.combat.activeUnitId);
      if (!u) return '<div class="mini-label">战斗结算中</div>';
      const hpPct = Math.max(0, u.hp / Math.max(1, u.maxHp) * 100);
      const enemy = u.side === 'enemy';
      return `<div class="ac-head">
        ${u.portrait ? `<img src="${esc(u.portrait)}" alt="${esc(u.name)}" />` : `<div class="ac-portrait-fallback">${enemy ? '✹' : '◈'}</div>`}
        <div style="min-width:0">
          <div class="ac-name">${esc(u.name)}</div>
          <div class="ac-role">${enemy ? 'ENEMY' : 'EXECUTOR'} · ${esc(u.role || '')}</div>
        </div>
      </div>
      <div class="ac-vitals"><span class="ac-hp-label">生命</span><span class="ac-hp-num">${u.hp}<small> / ${u.maxHp}</small></span></div>
      <div class="hp-bar ${hpPct <= 30 ? 'low' : ''}"><i style="width:${hpPct}%"></i></div>
      <div class="ac-stats">
        <span class="ac-stat"><span>移动</span><b>${u.movementLeft ?? 0}</b></span>
        <span class="ac-stat"><span>护盾</span><b>${u.shield ?? 0}</b></span>
        <span class="ac-stat"><span>武器</span><b>${esc(u.weaponName || '基础攻击')}</b></span>
      </div>
      ${enemy && u.intent ? (S.game?.mode === 'tutorial' && S.game?.tutorial?.step === 'enemyIntent'
        ? `<button class="ac-passive intent-btn" data-act="tutorial-inspect" aria-label="查看并确认敌方意图"><b>下回合意图 · 点击确认</b>${esc(u.intent)}</button>`
        : `<div class="ac-passive intent-card"><b>下回合意图</b>${esc(u.intent)}</div>`) : ''}`;
    }
    const p = activePlayer();
    if (!p) return '';
    const ch = S.charsById.get(p.characterId);
    const hpPct = Math.max(0, p.hp / Math.max(1, p.maxHp) * 100);
    return `<div class="ac-head">
      <img src="${esc(p.portrait || ch?.portrait || '')}" alt="${esc(p.name)}" />
      <div style="min-width:0">
        <div class="ac-name">${esc(p.name)}</div>
        <div class="ac-role">${esc(p.role)} · Lv.${p.level}</div>
      </div>
    </div>
    <div class="ac-vitals"><span class="ac-hp-label">生命</span><span class="ac-hp-num">${p.hp}<small> / ${p.maxHp}</small></span></div>
    <div class="hp-bar ${hpPct <= 30 ? 'low' : ''}"><i style="width:${hpPct}%"></i></div>
    <div class="ac-stats">
      <span class="ac-stat"><span>${window.Glossary?.chip('ap', 'AP') || 'AP'}</span><b>${p.ap}</b></span>
      <span class="ac-stat"><span>${window.Glossary?.chip('armor', '护甲') || '护甲'}</span><b>${p.armor}</b></span>
      <span class="ac-stat"><span>${window.Glossary?.chip('resistance', '抗性') || '抗性'}</span><b>${p.resistance}</b></span>
      <span class="ac-stat"><span>闪避</span><b>${p.evasion}%</b></span>
      <span class="ac-stat"><span>${window.Glossary?.chip('focus', 'Focus') || 'Focus'}</span><b>${p.focus}</b></span>
      <span class="ac-stat"><span>移动</span><b>${p.movement}</b></span>
    </div>
    <div class="ac-passive"><b>${esc(p.passiveName || '被动')}</b>${esc(p.passiveDesc || '')}</div>
    <div class="ac-buttons">
      <button class="btn btn-sm btn-ghost" data-act="rest" ${p.ap < 2 || p.downed ? 'disabled' : ''}>休息 2AP</button>
      <button class="btn btn-sm btn-ghost" data-act="end-turn" ${p.downed ? 'disabled' : ''}>结束回合</button>
    </div>`;
  }

  function activePlayer() {
    if (!S.game) return null;
    return S.game.players.find(p => p.id === S.game.activePlayerId) || S.game.players[0] || null;
  }

  /** 术语首次出现的轻提示：一次只提示一个，间隔至少 6 秒，不叠成一排。 */
  function termHint(id) {
    const now = Date.now();
    if (now - (S.lastHintAt || 0) < 6000) return;
    if (window.Glossary?.hint(id)) S.lastHintAt = now;
  }

  function pips(value, max, cls) {
    const n = Math.max(0, Number(value) || 0);
    const m = Math.max(1, Number(max) || 1);
    return `<span class="pips">${Array.from({ length: m }, (_, i) =>
      `<i class="pip ${cls} ${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
  }

  /* ── map ────────────────────────────────────────────────────────── */
  function renderMap() {
    const g = S.game;
    if (!g) return;
    const active = activePlayer();
    const current = active ? nodeById(active.nodeId) : null;
    const adjacent = new Set(current?.neighbors || []);
    const edges = $('#map-edges');
    const nodes = $('#map-nodes');
    if (!edges || !nodes) return;

    edges.innerHTML = (g.edges || []).map((edge, i) => {
      const a = nodeById(edge.from);
      const b = nodeById(edge.to);
      if (!a || !b) return '';
      const activeEdge = current && ((edge.from === current.id && adjacent.has(edge.to)) || (edge.to === current.id && adjacent.has(edge.from)));
      const visited = a.visited && b.visited;
      // 曲线而非直线：控制点沿法线偏移，奇偶交替形成轻微 S 形
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const bend = (i % 2 ? 1 : -1) * 0.18;
      const cx = (a.x + b.x) / 2 + dy * bend;
      const cy = (a.y + b.y) / 2 - dx * bend;
      return `<path class="map-edge${activeEdge ? ' active' : ''}${visited ? ' visited' : ''}" d="M${a.x},${a.y} Q${cx},${cy} ${b.x},${b.y}" />`;
    }).join('');

    const avgLv = g.players.length
      ? g.players.reduce((a, p) => a + (p.level || 1), 0) / g.players.length
      : 1;
    const bossLv = 4 + (g.act - 1) * 2;

    nodes.innerHTML = (g.nodes || []).map(n => {
      const srv = n.type === 'server' ? (SERVER_INFO[n.serverKind] || SERVER_INFO.vit) : null;
      const info = srv ? { icon: srv.icon, label: srv.label + ' 服务器' } : (NODE_INFO[n.type] || { icon: '·', label: n.type });
      const isCurrent = active?.nodeId === n.id;
      const isAdjacent = adjacent.has(n.id);
      const revealed = n.revealed || isCurrent;
      // 当前节点上，行动者本人由地图上的圆形标记表示，头像只留给同节点的队友
      const players = g.players.filter(p => p.nodeId === n.id && !(isCurrent && p.id === active?.id));
      const danger = revealed && (n.type === 'elite' || n.type === 'keyElite') && !n.cleared && avgLv < 4 + (g.act - 1) * 2;
      const spentAwaken = n.type === 'awakening' && !!g.awakenedPlayerId;
      const cls = [
        'map-node', n.type,
        isCurrent ? 'current' : '',
        isAdjacent && !isCurrent ? 'adjacent' : '',
        !revealed ? 'unrevealed' : '',
        n.visited ? 'visited' : '',
        n.cleared ? 'cleared' : '',
        n.type === 'echo' && claimableQuest() ? 'quest-ready' : '',
        spentAwaken ? 'spent' : ''
      ].filter(Boolean).join(' ');
      const name = revealed ? n.name : '未知信号';
      const baseSub = revealed ? (n.district || info.label) : 'UNRESOLVED';
      const sub = revealed && spentAwaken ? '回声已被取走'
        : revealed && n.type === 'boss' && !n.cleared ? `建议 Lv.${bossLv}` : baseSub;
      const shardTag = n.type === 'keyElite' && !n.cleared ? `${g.keyShards ?? 0}/${g.keyShardGoal ?? 3}` : '';
      // 角标只留「必须知道的一件事」：已清 / 已取 / 危险 / 碎片进度 / 首领锁
      const badge = !revealed ? '' : (n.type === 'blank' ? '' : (spentAwaken ? '已取' : (n.cleared ? '✓' : (danger ? '危险' : (shardTag || (n.id === 'boss' && !g.hasKey ? '锁' : ''))))));
      return `<button class="${cls}" style="left:${(n.x / MAP_W * 100).toFixed(3)}%;top:${(n.y / MAP_H * 100).toFixed(3)}%" data-act="node" data-node-id="${esc(n.id)}" ${revealed ? '' : 'tabindex="-1"'}>
        <span class="node-top">${revealed && info.svg
          ? `<span class="node-icon node-icon-svg" style="-webkit-mask:url(assets/icons/${info.svg}.svg) center/contain no-repeat;mask:url(assets/icons/${info.svg}.svg) center/contain no-repeat"></span>`
          : `<span class="node-icon">${revealed ? info.icon : '?'}</span>`}<span class="node-type">${revealed ? info.label : 'NO SIGNAL'}</span></span>
        <span class="node-name">${esc(name)}</span>
        <span class="node-sub${n.type === 'boss' ? ' node-boss-tip' : ''}"${srv ? ` style="color:${srv.color}"` : ''}>${esc(sub)}</span>
        <span class="node-players">${players.slice(0, 4).map(p => `<img class="node-player${p.downed ? ' downed' : ''}" src="${esc(p.portrait)}" alt="${esc(p.name)}" title="${esc(p.name)}" />`).join('')}${players.length > 4 ? `<span class="node-player more">+${players.length - 4}</span>` : ''}</span>
        ${badge ? `<span class="node-badge${danger ? ' danger' : ''}">${badge}</span>` : ''}
      </button>`;
    }).join('');

    const eyebrow = $('#map-eyebrow');
    if (eyebrow) {
      const roman = ['I', 'II', 'III'][g.act - 1] || String(g.act);
      eyebrow.textContent = `${g.actSubtitle || g.actName} // ACT ${roman}`;
    }

    updateMapToken(active);

    // 手机上一屏只能看到 3–4 个节点，换人/移动后自动把当前角色拉回画面中心。
    // 桌面不抢镜头：玩家可能正拖去看后面的路。
    if (active && S.mapFocusNode !== active.nodeId && window.matchMedia('(max-width: 900px)').matches) {
      S.mapFocusNode = active.nodeId;
      requestAnimationFrame(() => {
        const el = document.querySelector(`.map-node[data-node-id="${active.nodeId}"]`);
        window.MapView?.centerOn(el);
      });
    }

    const svg = $('#map-edges');
    if (svg) svg.setAttribute('viewBox', `0 0 ${MAP_W} ${MAP_H}`);

    // 长图：把当前角色滚到视野中间
    const viewport = $('#map-viewport');
    const currentEl = nodes.querySelector('.map-node.current');
    if (viewport && currentEl) {
      const left = currentEl.offsetLeft;
      const visible = viewport.scrollLeft;
      const width = viewport.clientWidth;
      if (left < visible + 60 || left > visible + width - 60) {
        viewport.scrollTo({ left: Math.max(0, left - width / 2), behavior: 'smooth' });
      }
    }

    const msg = $('#map-message');
    if (msg) msg.textContent = g.message || '点击相邻节点移动。点击当前节点互动。';
  }

  /* 进首领战前先放战前戏：读完再真正 interact。只用一次（本地记录）。 */
  function interactNode(p, node) {
    const act = Math.max(1, Math.min(3, S.game?.act || 1));
    const preId = `boss${act}_pre`;
    // 教学里步骤条已经写着同一句话，再来一条 toast 只会盖住「跳过」按钮
    const silent = S.game?.mode === 'tutorial';
    if (node.type === 'boss' && !node.cleared && storyReady() && !sceneSeen(preId)) {
      const go = () => applyAction({ type: 'interact', playerId: p.id, nodeId: node.id }, { toastMessage: !silent });
      if (playScene(preId, { onEnd: go })) return;
    }
    applyAction({ type: 'interact', playerId: p.id, nodeId: node.id }, { toastMessage: !silent });
  }

  function handleNodeClick(nodeId) {
    const g = S.game;
    if (!g || g.phase !== 'exploration') return;
    const p = activePlayer();
    if (!p || p.downed) return;
    const node = nodeById(nodeId);
    const current = nodeById(p.nodeId);
    if (!node || !current) return;
    if (!node.revealed && node.id !== p.nodeId) {
      toast('这个节点还没有被解析。', 'warn');
      return;
    }
    if (node.id === p.nodeId) {
      if (node.type === 'blank') {
        toast(node.flavor || '这里什么都没有。', 'info', 4200);
        return;
      }
      if (node.type === 'awakening' && g.awakenedPlayerId) {
        toast(p.awakened ? '你已经找回过自己。回声不再回应。' : '这段回声已经跟着别人走了。', 'warn', 4200);
        return;
      }
      if (node.cleared && !['shop', 'safehouse', 'start'].includes(node.type)) {
        toast('这里已经被清理过了。', 'warn');
        return;
      }
      if (p.ap <= 0) {
        toast('AP 不足。结束回合或休息后再试。', 'warn');
        return;
      }
      const avgLv = g.players.reduce((a, x) => a + (x.level || 1), 0) / Math.max(1, g.players.length);
      if (node.type === 'elite' && avgLv < 3 && S.dangerAck !== node.id) {
        S.dangerAck = node.id;
        openDangerModal(node, () => interactNode(p, node));
        return;
      }
      // 0.24：首领机制必须在开打前看得见，不能等玩家被打死才解释
      if (node.type === 'boss' && !node.cleared && S.bossAck !== node.id) {
        S.bossAck = node.id;
        openBossPreview(node, () => interactNode(p, node));
        return;
      }
      interactNode(p, node);
      return;
    }
    if (!current.neighbors.includes(node.id)) {
      toast('只能移动到相邻节点。', 'warn');
      return;
    }
    if (p.ap <= 0) {
      toast('AP 不足。结束回合或休息后再试。', 'warn');
      return;
    }
    if (node.type === 'boss' && !g.hasKey) {
      toast(`终局大门紧闭。需要${KEY_NAMES[g.act] || '密钥'}。`, 'warn');
      return;
    }
    applyAction({ type: 'move', playerId: p.id, nodeId: node.id });
  }

  /** 首领战前预告：机制名 + 一句话对策 + 二阶段变化。 */
  function openBossPreview(node, go) {
    const g = S.game;
    const act = Math.max(1, Math.min(3, g?.act || 1));
    const info = (S.meta?.bossPreview || []).find(b => b.act === act);
    const body = info ? `<div class="boss-preview">
        <div class="bp-head"><span>BOSS // ${esc(info.name)}</span><b>${esc(info.title)}</b></div>
        <p class="bp-hint">${esc(info.hint)}</p>
        <div class="bp-phase"><b>二阶段</b><span>${esc(info.phase2)}</span></div>
        <div class="select-tip" style="margin-top:12px"><b>这不是过场</b><p>机制在战斗里会一直显示在顶部，随时能看。打不过可以撤退，代价是全队 10% 生命。</p></div>
      </div>`
      : `<div class="mini-label">这一幕的首领机制还没有记录下来。</div>`;
    mountModal('bossPreview', modalHeader('☠', '首领战 · 战前', `BOSS ENCOUNTER // ACT ${act}`) +
      `<div class="modal-body">${body}</div>
       <div class="modal-foot">
         <button class="btn btn-sm btn-ghost" data-act="modal-close">再准备一下</button>
         <button class="btn btn-primary" data-act="boss-go">进入战斗</button>
       </div>`, true);
    S.bossGo = go;
  }

  function nodeById(id) {
    return S.game?.nodes?.find(n => n.id === id) || null;
  }

  /* ── quests ─────────────────────────────────────────────────────── */
  function questStateOf(questId) {
    return (S.game?.quests || []).find(q => q.questId === questId) || null;
  }

  function claimableQuest() {
    return (S.game?.quests || []).find(q => q.status === 'done') || null;
  }

  function questKindLabel(kind) {
    return { fetch: '寻物', hunt: '猎杀', explore: '探索', action: '行动' }[kind] || '支线';
  }

  /** 过场：换人时给一帧“轮到谁”的过渡，避免直接切画面。
   *  换轮 → 居中大卡（一轮只有一次，值得打断一下）；
   *  只是换人 → 左上角小卡，带一条走完的进度线，1.1 秒自己退场。 */
  function showTurnTransition(state, before) {
    if (S.modalType) return;   // 有剧情卡/弹窗时不打断
    const player = state?.players?.find(p => p.id === state.activePlayerId);
    if (!player) return;
    if (S.room && state.activePlayerId !== S.room.playerId) return;  // 联机：别人的回合不打扰
    const newRound = !!before && before.round !== state.round;
    const cine = window.Cine;
    if (cine) {
      cine.turn({
        full: newRound,
        kicker: newRound ? 'NEW ROUND' : (S.room ? 'YOUR TURN' : 'NEXT EXECUTOR'),
        name: player.name,
        portrait: player.portrait,
        round: state.round,
        ap: player.ap,
        subtitle: S.room ? '轮到你了' : '行动中'
      });
      Sound.sfx('turn');
      return;
    }
    // 兜底：过场脚本没加载时仍用旧样式，不静默失败
    const layer = document.createElement('div');
    layer.className = 'turn-transition';
    layer.innerHTML = `<div class="tt-inner">
        <img src="${esc(player.portrait)}" alt="" />
        <div class="tt-kicker">${S.room ? 'YOUR TURN' : 'NEXT EXECUTOR'}</div>
        <div class="tt-name">${esc(player.name)}</div>
        <div class="tt-sub">${S.room ? '轮到你了' : '行动中'} · ROUND ${state.round} · AP ${player.ap}</div>
      </div>`;
    document.body.appendChild(layer);
    Sound.sfx('turn');
    setTimeout(() => layer.classList.add('out'), 1050);
    setTimeout(() => layer.remove(), 1620);
  }

  function confirmKick(playerId, name) {
    if (!S.room || !isHost()) return;
    mountModal('kick', modalHeader('⇤', '把 TA 移出房间？', 'KICK PLAYER') +
      `<div class="modal-body"><div class="event-text" style="border-left-color:var(--red)">
        ${esc(name || playerId)} 会立刻断开。<br />
        大厅阶段位置会空出来，别人可以补进来；对局中则保留角色，由你「跳过」他的回合。
      </div></div>
      <div class="modal-foot">
        <button class="btn btn-sm btn-ghost" data-act="modal-close">算了</button>
        <button class="btn btn-sm btn-danger" data-act="kick-confirm" data-player-id="${esc(playerId)}">移出房间</button>
      </div>`, true);
  }

  async function kickPlayer(playerId) {
    if (!S.room) return;
    try {
      const res = await fetch(`/api/room/${encodeURIComponent(S.room.code)}/kick`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: S.room.token, playerId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '踢出失败');
      S.roomData = data.room;
      closeModal();
      renderRoom();
      toast('已移出房间。', 'info', 2400);
    } catch (err) {
      console.error(err);
      toast(err.message || '踢出失败。', 'error', 3600);
    }
  }

  function renderRoomActions() {
    const box = $('#room-actions');
    if (!box) return;
    if (!S.room || !S.game) {
      box.classList.add('hidden');
      box.innerHTML = '';
      return;
    }
    const mine = canActNow();
    if (mine) {
      box.classList.add('hidden');
      box.innerHTML = '';
      return;
    }
    let waitName = '';
    if (S.game.phase === 'combat') {
      const unit = S.game.combat?.units?.find(x => x.id === S.game.combat.activeUnitId);
      waitName = unit?.name || '';
    } else {
      waitName = S.game.players?.find(p => p.id === S.game.activePlayerId)?.name || '';
    }
    const host = isHost();
    box.classList.remove('hidden');
    box.innerHTML = `<div class="room-wait">等待 <b>${esc(waitName || '队友')}</b> 行动…</div>` +
      (host ? `<button class="btn btn-sm btn-ghost" data-act="force-skip">跳过这一回合</button>` : '');
  }

  async function forceSkipTurn() {
    if (!S.room || !S.game || S.busy) return;
    if (!isHost()) {
      toast('只有房主能跳过回合。', 'warn');
      return;
    }
    S.busy = true;
    try {
      const res = await postAction({
        sessionId: S.game.sessionId,
        action: { type: 'forceSkip' },
        expectedRevision: S.game.revision,
        roomCode: S.room.code,
        token: S.room.token
      }, newRequestId());
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '跳过失败');
      S.game = data;
      renderAll();
      toast('已跳过当前回合。', 'info', 2400);
    } catch (err) {
      console.error(err);
      toast(err.message || '跳过失败。', 'error', 3600);
    } finally {
      S.busy = false;
    }
  }

  function renderQuests() {
    const g = S.game;
    const box = $('#quest-box');
    const list = $('#quest-list');
    if (!box || !list) return;
    const current = (g?.quests || []).filter(q => q.status === 'active' || q.status === 'done');
    if (!current.length) {
      box.classList.add('hidden');
      list.innerHTML = '';
      return;
    }
    box.classList.remove('hidden');
    list.innerHTML = current.map(q => {
      const def = S.questsById.get(q.questId) || {};
      const total = Math.max(1, def.targetCount || 1);
      const pct = Math.min(100, Math.round((q.progress || 0) / total * 100));
      const done = q.status === 'done';
      return `<div class="quest-item${done ? ' done' : ''}">
        <div class="qi-head"><span class="qi-title">${esc(def.title || q.questId)}</span><span class="qi-kind">${esc(questKindLabel(def.kind))}</span></div>
        <div class="qi-obj">${esc(def.objective || '')}</div>
        <div class="qi-bar"><i style="width:${pct}%"></i></div>
        <div class="qi-foot">${done ? '可领取 · 到任意残响' : `${q.progress || 0} / ${total}`}</div>
      </div>`;
    }).join('');
  }

  function openQuestModal() {
    const def = S.game?.pendingQuestOffer;
    if (!def) return;
    mountModal('quest', `<div class="story-card quest-card">
        <div class="story-kicker">SIDE QUEST // ${esc(questKindLabel(def.kind))}</div>
        <h2 class="story-title">${esc(def.title || '残响')}</h2>
        <div class="story-body">${esc(def.body || '').replace(/\n/g, '<br />')}</div>
        <div class="quest-objective">目标：${esc(def.objective || '')}</div>
        <div class="quest-reward">报酬：${esc(def.rewardText || '—')}</div>
        <div class="story-actions">
          <button class="btn btn-primary" data-act="quest-accept">接下这件事</button>
          <button class="btn btn-ghost" data-act="quest-decline">走开</button>
        </div>
      </div>`, true);
  }

  async function acceptQuest() {
    if (S.busy) return;
    const ok = await applyAction({ type: 'acceptQuest' }, { toastMessage: true, toastKind: 'info' });
    if (ok) closeModal();
  }

  async function declineQuest() {
    if (S.busy) return;
    const ok = await applyAction({ type: 'declineQuest' }, { toastMessage: true, toastKind: 'info' });
    if (ok) closeModal();
  }

  /* ── combat rendering ───────────────────────────────────────────── */
  function combatActiveUnit() {
    const c = S.game?.combat;
    if (!c) return null;
    return c.units.find(u => u.id === c.activeUnitId) || null;
  }

  function selectedCombatSkill() {
    const u = combatActiveUnit();
    if (!u || u.side !== 'player') return null;
    if (S.combatSkill === 'basic') {
      return {
        id: 'basic',
        name: u.weaponName || '基础攻击',
        desc: `基础攻击 · ${u.weaponDice} 次判定 · ${u.weaponDamage} 伤害/命中`,
        icon: '⚔',
        target: 'enemy',
        range: u.weaponRange ?? 1,
        focusCost: 0,
        cooldown: 0,
        dice: u.weaponDice,
        accuracy: u.weaponAccuracy,
        damagePerDie: u.weaponDamage,
        effects: [],
        isUltimate: false
      };
    }
    return S.skillsById.get(S.combatSkill) || null;
  }

  /* ── 战斗视角：每人默认锁自己的角色，Tab 循环（自己 → 队友 → 敌人 → 全景） ── */
  function combatFocusId() {
    const c = S.game?.combat;
    if (!c) return '';
    if (S.combatFocus === 'all') return '';
    if (S.combatFocus) {
      const u = c.units.find(x => x.id === S.combatFocus && !x.downed);
      if (u) return u.id;
    }
    return defaultFocusId();
  }

  function defaultFocusId() {
    const c = S.game?.combat;
    if (!c) return '';
    // 默认全景：开战先看清整个棋盘和敌人，想看某一个单位再按 Tab / 点击切换。
    // （旧版默认锁在「我的单位」上，开战第一眼看不到对面的敌人。）
    return '';
  }

  function combatFocusLabel() {
    const c = S.game?.combat;
    const id = combatFocusId();
    if (!c || !id) return '全景';
    const u = c.units.find(x => x.id === id);
    if (!u) return '全景';
    return u.side === 'enemy' ? `敌方 · ${u.name}` : u.name;
  }

  function cycleCombatFocus() {
    const c = S.game?.combat;
    if (!c) return;
    const order = [];
    const seen = new Set();
    const push = u => { if (u && !seen.has(u.id)) { seen.add(u.id); order.push(u.id); } };
    const mineId = S.room?.playerId;
    c.units.filter(u => !u.downed && u.side === 'player' && mineId && u.playerId === mineId).forEach(push);
    c.units.filter(u => !u.downed && u.side === 'player' && !(mineId && u.playerId === mineId)).forEach(push);
    c.units.filter(u => !u.downed && u.side === 'enemy').forEach(push);
    order.push('all');
    const cur = S.combatFocus || defaultFocusId() || 'all';
    const idx = order.indexOf(cur);
    S.combatFocus = order[(idx + 1) % order.length];
    renderCombat();
    toast(`视角：${combatFocusLabel()}`, 'info', 1400);
  }

  function renderCombat() {
    const g = S.game;
    const c = g?.combat;
    if (!c) return;
    termHint('focus');
    const node = nodeById(c.nodeId);
    const spec = spectatorUnit();
    const canAct = canActNow();
    syncCastCursor(c);
    $('#combat-title').textContent = node ? node.name : '战术遭遇';
    $('#combat-round').textContent = String(c.round ?? 1);
    renderTurnStrip(c);
    renderBossBar(c);
    trackCombatFlow(c);
    trackBossPhase(c);
    renderHexGrid(c);
    renderCombatSide(c);
    $('#combat-wrap')?.classList.toggle('is-spectating', !canAct);
    const badge = $('#spectate-badge');
    if (badge) {
      if (spec) {
        badge.classList.remove('hidden');
        badge.textContent = `观战中 · ${spec.name} 行动`;
      } else if (!canAct) {
        const act = c.units.find(u => u.id === c.activeUnitId);
        badge.classList.remove('hidden');
        badge.textContent = act?.side === 'enemy' ? `观战中 · ${act.name}` : '观战中';
      } else {
        badge.classList.add('hidden');
      }
    }
    $('#combat-hint').textContent = `${combatHint(c)}　·　视角 ${combatFocusLabel()}（Tab 切换）`;
    // 不轮到你的时候把操作整体禁用，点了才报错是最差的体验
    for (const id of ['#btn-basic', '#btn-item', '#btn-defend', '#btn-end-combat']) {
      const b = $(id);
      if (b) b.disabled = !canAct;
    }
  }

  /* 战斗换人 / 换轮的演出。放在渲染里而不是动作回调里，
     这样联机轮询、观战、自动结算都能看到同一套提示。
     第一次进入战斗不弹（进战斗的过场已经交代了战场）。 */
  function trackCombatFlow(c) {
    if (!window.Cine) return;
    const act = c.units.find(u => u.id === c.activeUnitId) || null;
    const first = S.cineCombatUnit === undefined && S.cineCombatRound === undefined;
    if (!first && c.round !== S.cineCombatRound) window.Cine.round(c.round);
    if (!first && act && act.id !== S.cineCombatUnit) {
      window.Cine.combatTurn({
        name: act.name,
        portrait: act.portrait,
        side: act.side,
        round: c.round,
        mine: !!(S.room && act.playerId === S.room.playerId)
      });
    }
    S.cineCombatUnit = act ? act.id : null;
    S.cineCombatRound = c.round;
  }

  /* Boss 掉到半血时放一次 PHASE II。不依赖服务端字段：
     血量本身就是规则层已经维护的状态，客户端只负责演出。 */
  function trackBossPhase(c) {
    const boss = (c.units || []).find(u => u.side === 'enemy' && /首领/.test(u.role || ''));
    if (!boss || boss.downed) return;
    const key = `${S.game?.sessionId}:${c.nodeId}`;
    // 阶段以服务端为准（bossPhase 是真正的规则切换）；老存档没有这个字段时退回血量判断
    const phase2 = (c.bossPhase || 1) >= 2 || boss.hp <= Math.max(1, boss.maxHp) * 0.5;

    if (phase2 && S.bossPhaseKey !== key) {
      S.bossPhaseKey = key;
      window.Fx?.phase(2, { title: c.bossPhaseName || '协议覆写', sub: boss.name });
      document.getElementById('combat-wrap')?.classList.add('phase2');
      Sound.sfx('warn');
    }
    if (!phase2) document.getElementById('combat-wrap')?.classList.remove('phase2');

    // 血量阈值台词：75 / 50 / 25 各一句，不锁输入
    if (!storyReady() || window.VN.isOpen()) return;
    const pct = boss.hp / Math.max(1, boss.maxHp);
    const act = Math.max(1, Math.min(3, S.game?.act || 1));
    for (const bark of window.STORY.bark(act)) {
      const bk = `${key}:${bark.at}`;
      if (pct <= bark.at && !S.barkKeys.has(bk)) {
        S.barkKeys.add(bk);
        window.VN.bark({ who: bark.who, text: bark.text });
      }
    }
  }

  /* 观战：联机战斗中，当前行动的单位不是我的 → 只读观看。
     敌方回合、自己的回合、单机游戏都不算。 */
  function spectatorUnit() {
    if (!S.room) return null;
    const c = S.game?.combat;
    if (!c || c.isOver) return null;
    const act = c.units.find(u => u.id === c.activeUnitId);
    if (!act || act.side !== 'player' || act.downed) return null;
    if (act.playerId === S.room.playerId) return null;
    return act;
  }

  function renderTurnStrip(c) {
    const strip = $('#turn-strip');
    if (!strip) return;
    strip.innerHTML = (c.turnOrder || []).map(id => {
      const u = c.units.find(x => x.id === id);
      if (!u) return '';
      const active = id === c.activeUnitId;
      const img = u.portrait
        ? `<img src="${esc(u.portrait)}" alt="${esc(u.name)}" />`
        : `<span class="tt-fallback">${u.side === 'enemy' ? '✹' : '◇'}</span>`;
      return `<div class="turn-token${active ? ' active' : ''}${u.downed ? ' downed' : ''}${u.side === 'enemy' ? ' enemy' : ' player'}" title="${esc(u.name)} · ${u.side === 'enemy' ? '敌方' : '执行体'} · SPD ${u.speed}">
        ${img}<span>${esc(u.name)}</span>
      </div>`;
    }).join('');
  }

  function renderHexGrid(c) {
    const grid = $('#hex-grid');
    if (!grid) return;

    // 先把「当前技能对每个敌人能打多少」算出来，3D 名牌会直接显示
    applyDamageForecast(c);

    // 3D 渲染层（Three.js）：可用时隐藏 DOM 六边形网格
    const bgNode = nodeById(c.nodeId);
    if (window.Battle3D && window.Battle3D.render(c, {
      range: selectedCombatSkill()?.range || 0,
      focus: combatFocusId(),
      backdrop: battleBackdropFor(bgNode, S.game?.act || 1)
    })) {
      grid.classList.add('hidden');
      return;
    }
    grid.classList.remove('hidden');
    const active = combatActiveUnit();
    const selected = selectedCombatSkill();
    const reachable = new Set((c.reachable || []).map(h => `${h.col},${h.row}`));
    const terrain = new Map((c.terrain || []).map(t => [`${t.col},${t.row}`, t]));
    const unitsAt = new Map();
    for (const u of c.units) {
      if (u.hp <= 0 && !u.downed) continue;
      const key = `${u.col},${u.row}`;
      if (!unitsAt.has(key)) unitsAt.set(key, []);
      unitsAt.get(key).push(u);
    }
    const targetIds = new Set(targetableUnits(c, active, selected).map(u => u.id));
    let html = '';
    for (let row = 0; row < c.height; row++) {
      html += '<div class="hex-row">';
      for (let col = 0; col < c.width; col++) {
        const key = `${col},${row}`;
        const t = terrain.get(key);
        const units = unitsAt.get(key) || [];
        const canMove = active?.side === 'player' && reachable.has(key) && !units.some(u => !u.downed);
        const cls = [
          'hex-cell',
          t?.type === 'obstacle' ? 'obstacle' : '',
          t?.type === 'cover' ? 'cover' : '',
          canMove ? 'reachable' : ''
        ].filter(Boolean).join(' ');
        html += `<div class="${cls}" data-act="hex" data-col="${col}" data-row="${row}">`;
        if (t) html += `<span class="terrain-icon">${t.type === 'cover' ? '▦' : '╳'}</span>`;
        for (const u of units) html += unitTokenHtml(c, u, active, selected, targetIds);
        html += '</div>';
      }
      html += '</div>';
    }
    grid.innerHTML = html;
  }

  function unitTokenHtml(c, u, active, selected, targetIds) {
    const enemy = u.side === 'enemy';
    const hpPct = Math.max(0, Math.min(100, u.hp / Math.max(1, u.maxHp) * 100));
    const isActive = u.id === c.activeUnitId;
    const targetable = targetIds.has(u.id);
    const statuses = (u.statuses || []).slice(0, 4).map(s => {
      const icon = STATUS_ICON[s.id] || (s.isBuff ? '▲' : '▼');
      return `<span title="${esc(s.name)}">${icon}</span>`;
    }).join('');
    const portrait = u.portrait
      ? `<img src="${esc(u.portrait)}" alt="${esc(u.name)}" />`
      : `<span class="ut-fallback">${enemy ? (u.role === '远程' ? '⌖' : '✹') : '◇'}</span>`;
    return `<div class="unit-token${enemy ? ' enemy' : ''}${isActive ? ' active-unit' : ''}${targetable ? ' targetable-unit' : ''}${u.downed ? ' downed' : ''}" data-act="unit" data-unit-id="${esc(u.id)}" title="${esc(u.name)} · ${u.hp}/${u.maxHp} HP">
      <div class="ut-portrait">${portrait}${u.shield > 0 ? `<span class="ut-shield">◈${u.shield}</span>` : ''}</div>
      <div class="ut-name">${esc(u.name)}</div>
      <div class="ut-hp${enemy ? ' enemy' : ''}"><i style="width:${hpPct}%"></i></div>
      <div class="ut-status">${statuses}</div>
    </div>`;
  }

  function targetableUnits(c, active, selected) {
    if (!active || active.side !== 'player' || !selected || c.isOver) return [];
    const units = c.units.filter(u => !u.downed || (selected.target === 'ally' && (selected.effects || []).some(e => e.type === 'revive_or_heal')));
    const inRange = u => (selected.range || 0) <= 0 || hexDistance(active.col, active.row, u.col, u.row) <= selected.range;
    if (selected.target === 'enemy') return units.filter(u => u.side === 'enemy' && inRange(u));
    if (selected.target === 'ally') return units.filter(u => u.side === 'player' && inRange(u));
    return [];
  }

  function combatHint(c) {
    const active = combatActiveUnit();
    if (!active) return '';
    if (c.isOver) return c.result === 'victory' ? '战斗结束。' : '信号消失。';
    const watched = spectatorUnit();
    if (watched) {
      const ins = S.combatInspect ? c.units.find(x => x.id === S.combatInspect) : null;
      if (ins) return `${ins.name} · ${ins.side === 'enemy' ? '敌方' : '友方'} · HP ${ins.hp}/${ins.maxHp} · 护甲 ${ins.armor} · 抗性 ${ins.resistance} · 闪避 ${ins.evasion}%`;
      return `观战中 · ${watched.name} 正在行动，你可以在旁边看着（点单位可以看属性）。`;
    }
    if (active.side === 'enemy') return `${active.name} 正在行动…`;
    const selected = selectedCombatSkill();
    if (selected) {
      if (selected.target === 'enemy') return `已选择「${selected.name}」：点击射程内敌人。ESC 取消。`;
      if (selected.target === 'ally') return `已选择「${selected.name}」：点击友军目标。ESC 取消。`;
    }
    const intents = (c.units || []).filter(u => u.side === 'enemy' && !u.downed && u.intent)
      .map(u => `${u.name}：${u.intent}`);
    if (intents.length) return `敌方意图 — ${intents.join('　|　')}`;
    const reachableCount = (c.reachable || []).length;
    if (reachableCount > 0) return '点击青色发光的格子移动；点击敌人普攻；右侧技能卡选技能。ESC 取消选择。';
    if (S.combatInspect) {
      const u = c.units.find(x => x.id === S.combatInspect);
      if (u) return `${u.name} · ${u.side === 'enemy' ? '敌方' : '友方'} · HP ${u.hp}/${u.maxHp} · 护甲 ${u.armor} · 抗性 ${u.resistance} · 闪避 ${u.evasion}%`;
    }
    return c.hint || '点击高亮格移动；选择技能后点击目标。';
  }

  /* ── 首领机制条（0.24）───────────────────────────────────────
     一直显示，不弹窗、不打断：机制的名字、现在在做什么、能回应的交易。 */
  function renderBossBar(c) {
    const bar = $('#boss-bar');
    if (!bar) return;
    const m = c?.bossMechanic;
    if (!m) { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    $('#boss-kicker').textContent = m.kind === 'auction' ? 'BOSS // AUCTION'
      : m.kind === 'mirror' ? 'BOSS // LEARNING' : 'BOSS // PROTOCOL';
    $('#boss-mech-title').textContent = m.title || '首领机制';
    $('#boss-mech-hint').textContent = m.hint || '';

    // 状态：三套机制各一句「现在怎么样」
    let state = '';
    if (m.kind === 'auction') {
      state = `成交 ${m.accepted || 0} · 拒绝 ${m.refusals || 0}`;
      if ((m.flags || []).includes('silenced')) state += ' · 已买断沉默';
      if (m.refusals > 0) state += ` · 它伤害 +${m.refusals * 2}`;
    } else if (m.kind === 'mirror') {
      state = !m.learnStacks ? '还没学到东西 —— 现在换着打最安全'
        : `正在学习：${m.learnType === 'tech' ? '技术' : '物理'}（${m.learnStacks}/3）`;
    } else {
      state = c.bossPhase >= 2
        ? `协议节点 ${(m.protocolNodes || []).length}/3 · 截止第 ${m.deadlineRound} 轮`
        : `已关闭 ${(m.closedCells || []).length} 格`;
    }
    $('#boss-mech-state').textContent = state;

    const open = (m.trades || []).filter(t => t.state === 'open');
    const box = $('#boss-trades');
    box.innerHTML = open.length
      ? open.map(t => `<button class="bb-trade" data-act="boss-trade" data-slot="${esc(t.id)}" title="${esc(t.detail || '')}">
          <b>${esc(t.title)}</b><span>${esc(t.cost)} → ${esc(t.gain)}</span>
        </button>`).join('') +
        `<button class="bb-decline" data-act="boss-trade" data-slot="decline">拒绝（它会变强）</button>`
      : '';
  }

  function renderCombatSide(c) {
    const active = combatActiveUnit();
    const card = $('#active-unit-card');
    if (card) card.innerHTML = activeUnitCardHtml(active, c);
    const list = $('#skill-list');
    if (list) list.innerHTML = active && active.side === 'player' ? skillListHtml(active, c) : '<div class="mini-label">敌方行动序列处理中…</div>';
    const basic = $('#btn-basic');
    const defend = $('#btn-defend');
    const end = $('#btn-end-combat');
    const usable = !!active && active.side === 'player' && !c.isOver && !S.busy;
    if (basic) {
      basic.disabled = !usable;
      basic.classList.toggle('selected', S.combatSkill === 'basic');
    }
    if (defend) defend.disabled = !usable;
    if (end) end.disabled = !usable;
    const log = $('#combat-log');
    if (log) {
      log.innerHTML = (c.log || []).slice(-30).reverse().map(x => `<div>${esc(x)}</div>`).join('');
    }
  }

  function activeUnitCardHtml(u, c) {
    if (!u) return '<div class="mini-label">战斗结算中…</div>';
    const enemy = u.side === 'enemy';
    const hpPct = Math.max(0, Math.min(100, u.hp / Math.max(1, u.maxHp) * 100));
    const statuses = (u.statuses || []).map(s => `<span class="mini-tag${s.isBuff ? ' gold' : ' pink'}">${esc(s.name)} ${s.duration}</span>`).join('');
    return `<div class="auc-head">
      ${u.portrait ? `<img src="${esc(u.portrait)}" alt="${esc(u.name)}" />` : `<div class="ut-fallback" style="width:38px;height:44px">${enemy ? '✹' : '◇'}</div>`}
      <div><div class="auc-name">${esc(u.name)}</div><div class="auc-sub">${enemy ? 'HOSTILE SIGNAL' : 'EXECUTOR'} · ${esc(u.role || '')} · SPD ${u.speed}</div></div>
    </div>
    <div class="ac-vitals"><span class="ac-hp-label">生命</span><span class="ac-hp-num">${u.hp}<small> / ${u.maxHp}</small></span></div>
    <div class="hp-bar ${hpPct <= 30 ? 'low' : ''}"><i style="width:${hpPct}%"></i></div>
    <div class="auc-stats">
      <span>护甲 <b>${u.armor}</b></span><span>抗性 <b>${u.resistance}</b></span><span>闪避 <b>${u.evasion}%</b></span>
      <span>移动 <b>${u.movementLeft ?? 0}</b></span>${u.focus > 0 ? `<span>FOCUS <b>${u.focus}/${u.maxFocus}</b></span>` : ''}
    </div>
    ${statuses ? `<div class="pc-tags" style="margin-top:5px">${statuses}</div>` : ''}`;
  }

  /** 按当前属性估算「每一次判定」的伤害（不含护甲/闪避）——和规则层同一个公式。 */
  function estPerHit(u, skill) {
    const scale = String(skill.scaleStat || 'H').toUpperCase();
    const stat = (u.stats || {})[scale.toLowerCase()] ?? 50;
    const dmgBonus = Math.trunc((stat - 50) / 10);
    const statusMod = (u.statuses || []).reduce((a, s) => a + (s.damageMod || 0), 0);
    return Math.max(1, (skill.damagePerDie || 0) + dmgBonus + (u.damageBonus || 0) + statusMod);
  }

  /** 基础攻击也是一个「技能对象」——技能卡和伤害预估共用同一份定义，别写两遍。 */
  function basicSkillOf(u) {
    return {
      id: 'basic', name: u.weaponName || '基础攻击', icon: '⚔',
      desc: `基础攻击 · ${u.weaponDice} 次判定 · ${u.weaponDamage} 伤害/命中 · 射程 ${u.weaponRange}`,
      focusCost: 0, cooldown: 0, range: u.weaponRange, isUltimate: false, target: 'enemy',
      dice: u.weaponDice, damagePerDie: u.weaponDamage, scaleStat: u.weaponScale, damageType: u.weaponType,
      accuracy: u.weaponAccuracy ?? 100
    };
  }

  /**
   * 预演一次技能打在这个目标上的真实伤害。
   * 公式必须和 CombatEngine 一致：raw = 判定次数 × 每击伤害，
   * 减免 = min(raw × 75%, 护甲/抗性)，命中保底 1 点。
   */
  function forecastAgainst(attacker, skill, target) {
    const dice = skill.dice || 0;
    if (!dice) return null;
    const per = estPerHit(attacker, skill);
    const raw = dice * per;
    const armor = Math.max(0, skill.damageType === 'tech' ? (target.resistance || 0) : (target.armor || 0));
    const mitigation = Math.round(Math.min(raw * 0.75, armor));
    let total = Math.max(0, raw - mitigation);
    if (total === 0) total = 1;
    return { total, raw, mitigation };
  }

  /** 把「当前选中的技能/普攻对每个敌人的预计伤害」挂到战斗单位上，供 3D 名牌直接显示。 */
  function applyDamageForecast(c) {
    const active = combatActiveUnit();
    if (!active || active.side !== 'player') {
      for (const u of c.units || []) u.forecast = null;
      return;
    }
    const skill = selectedCombatSkill() || basicSkillOf(active);
    for (const u of c.units || []) {
      u.forecast = u.side === 'player' ? null : forecastAgainst(active, skill, u);
    }
  }

  function skillListHtml(u, c) {
    if (!u || u.side !== 'player') return '';
    const skills = (u.skillIds || []).map(id => S.skillsById.get(id)).filter(Boolean);
    const basicSkill = basicSkillOf(u);
    const cards = [basicSkill, ...skills].map(skill => {
      const cd = (u.cooldowns || {})[skill.id] || 0;
      const focusShort = (u.focus || 0) < (skill.focusCost || 0);
      const disabled = !canActNow() || cd > 0 || focusShort || (skill.isUltimate && u.ultimateUsed) || (skill.special === 'copy_ally' && !c.lastAllySkillId);
      const selected = S.combatSkill === skill.id;
      // 辅助行合并进底部：伤害数字在左，参数在右。少一行就少 16px，四张卡正好不滚动。
      const per = skill.dice ? estPerHit(u, skill) : 0;
      const acc = Math.max(1, Math.min(100, Math.round(skill.accuracy ?? 100)));
      const full = skill.dice * per;
      const expect = Math.round(full * acc / 100);
      // 伤害 + 参数压成同一行：数字最大，参数退到右边。
      const detail = per
        ? `${skill.dice} × ${per} · 命中 ${acc}%${acc < 100 ? ` · 期望 ${expect}` : ''}`
        : '不造成直接伤害';
      const foot = `<div class="sc-foot">
        <div class="sc-dmg"><b>${per ? full : '—'}</b><span>${per ? '伤害' : '辅助'}</span></div>
        <div class="sc-meta">${detail}${skill.range ? ` · 射程 ${skill.range}` : ''}</div>
      </div>`;
      const statusLine = cd > 0 ? `<span style="color:var(--pink)">冷却 ${cd}</span>`
        : (skill.isUltimate && u.ultimateUsed ? '<span style="color:var(--pink)">本场已用</span>'
          : (focusShort ? '<span style="color:var(--pink)">Focus 不足</span>' : ''));
      return `<div class="skill-card${skill.isUltimate ? ' ultimate' : ''}${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}" data-act="skill" data-skill-id="${esc(skill.id)}">
        <div class="sc-top">
          <span class="sc-icon">${esc(skill.icon || '◈')}</span>
          <span class="sc-name">${esc(skill.name)}</span>
          <span class="sc-cost">${skill.isUltimate ? 'ULT' : (skill.focusCost ? `◈${skill.focusCost}` : '')}${statusLine ? ' ' + statusLine : ''}</span>
        </div>
        <div class="sc-desc">${esc(skill.desc || '')}</div>
        ${skill.target === 'enemy' ? '<div class="sc-syn">协同：对受控 / 被标记 / 暴露目标收益更高</div>'
          : (skill.target === 'ally' || skill.target === 'allAllies' ? '<div class="sc-syn">协同：治疗附带净化；赠满 Focus 强化终极技</div>' : '')}
        ${foot}
      </div>`;
    });
    return cards.join('');
  }

  /* ── combat interactions ────────────────────────────────────────── */
  function selectCombatSkill(skillId) {
    const c = S.game?.combat;
    const active = combatActiveUnit();
    if (!c || c.isOver || !active || active.side !== 'player' || S.busy) return;
    if (skillId === 'basic') {
      S.combatSkill = 'basic';
      S.combatInspect = null;
      renderCombat();
      return;
    }
    const skill = S.skillsById.get(skillId);
    if (!skill) return;
    const cd = (active.cooldowns || {})[skill.id] || 0;
    if (cd > 0) { toast(`${skill.name} 还在冷却（${cd} 回合）。`, 'warn'); return; }
    if ((active.focus || 0) < (skill.focusCost || 0)) { toast(`Focus 不足，需要 ${skill.focusCost}。`, 'warn'); return; }
    if (skill.isUltimate && active.ultimateUsed) { toast('终极技能每场战斗只能使用一次。', 'warn'); return; }
    if (skill.special === 'copy_ally' && !c.lastAllySkillId) { toast('没有可借阅的友军技能。', 'warn'); return; }
    if (['allAllies', 'self', 'allEnemies'].includes(skill.target)) {
      S.combatSkill = skill.id;
      executeCombat(skill.id, active.id);
      return;
    }
    S.combatSkill = skill.id;
    S.combatInspect = null;
    renderCombat();
  }

  function handleHexClick(col, row) {
    const c = S.game?.combat;
    const active = combatActiveUnit();
    if (!c || c.isOver || !active || active.side !== 'player' || S.busy) return;
    if (!canActNow()) return;
    const reachable = (c.reachable || []).some(h => h.col === col && h.row === row);
    if (!reachable) return;
    applyAction({ type: 'combatMove', playerId: active.playerId, col, row });
  }

  function handleUnitClick(unitId) {
    const c = S.game?.combat;
    const active = combatActiveUnit();
    if (!c || c.isOver || !active || active.side !== 'player' || S.busy) return;
    if (!canActNow()) {              // 观战：不能操作，但可以点开看看属性
      S.combatInspect = unitId;
      renderCombat();
      return;
    }
    const unit = c.units.find(u => u.id === unitId);
    if (!unit) return;
    const skill = selectedCombatSkill();
    if (skill) {
      if (skill.target === 'enemy' && unit.side !== 'enemy') { toast('这个技能需要敌方目标。', 'warn'); return; }
      if (skill.target === 'ally' && unit.side !== 'player') { toast('这个技能需要友方目标。', 'warn'); return; }
      if (skill.target === 'ally' && unit.downed && !(skill.effects || []).some(e => e.type === 'revive_or_heal')) {
        toast('这个技能无法复活倒下的队友。', 'warn');
        return;
      }
      if (skill.range > 0 && hexDistance(active.col, active.row, unit.col, unit.row) > skill.range) {
        toast('目标不在射程内。', 'warn');
        return;
      }
      executeCombat(skill.id, unit.id);
      return;
    }
    S.combatInspect = unitId;
    renderCombat();
  }

  function executeCombat(skillId, targetUnitId) {
    const active = combatActiveUnit();
    if (!active || active.side !== 'player') return;

    // 施法前抓一份落点快照：动作成功后战斗状态会推进，目标可能已倒下
    const combat = S.game?.combat;
    const target = combat?.units.find(u => u.id === targetUnitId);
    const skill = S.skillsById.get(skillId);
    if (skill?.isUltimate && window.Fx) {
      window.Fx.burst({ name: skill.name, portrait: active.portrait, color: active.color });
    }
    // 范围技判定：规则层的 TargetType 枚举经 JsonStringEnumConverter(camelCase) 序列化，
    // 真实存在的群体技是 allEnemies / allAllies；TargetType.Area 目前没有任何技能使用，仅保留兼容。
    // skill.range === 0 在规则层表示「全场」（见 CombatEngine 的 AllEnemies 分支）。
    const groupFoes = skill?.target === 'allEnemies';
    const groupAllies = skill?.target === 'allAllies';
    const range = skill?.range || 0;
    const area = groupFoes || skill?.target === 'area' ? (range > 0 ? range : 4) : 0;
    // 群体技拿不到单一目标（调用方传进来的是施法者自己），落点改取真实受影响的单位
    const affected = (combat?.units || []).filter(u => {
      if (u.downed) return false;
      if (groupFoes) return u.side === 'enemy';
      if (groupAllies) return u.side === 'player';
      return false;
    });
    const nearestFoe = groupFoes && affected.length
      ? affected.reduce((best, u) => hexDistance(active.col, active.row, u.col, u.row) <
        hexDistance(active.col, active.row, best.col, best.row) ? u : best)
      : null;
    const cast = {
      casterId: active.id,
      casterCol: active.col,
      casterRow: active.row,
      targetCol: nearestFoe?.col ?? target?.col ?? active.col,
      targetRow: nearestFoe?.row ?? target?.row ?? active.row,
      skillId,
      area,
      targets: affected.map(u => ({ col: u.col, row: u.row })),
      // 远程 / 群体 / 自身增益都是原地抬手，只有贴身攻击才前冲
      ranged: range > 1 || groupFoes || groupAllies || skill?.target === 'self',
      dice: skill?.dice || 1
    };

    S.combatSkill = null;
    S.combatInspect = null;
    // 渲染发生在 applyAction 内部，先把这次动作的判定数交出去，
    // battle3d 才知道该把伤害拆成几段跳
    window.Battle3D?.pendingCast?.(cast);
    applyAction({ type: 'combatAction', playerId: active.playerId, skillId, targetUnitId })
      .then((ok) => {
        if (!ok) return;
        if (window.Sound && Sound.playSample) {
          const heavy = skillId !== 'basic';
          Sound.playSample(heavy ? 'hitHeavy' : 'hit', heavy ? 0.32 : 0.4, heavy ? 0.92 : 1.06);
        }
        // 动画不在派发——applyAction 里已经把 lastActions 排进播放队列了
      });
  }

  function combatDefend() {
    const active = combatActiveUnit();
    if (!active || active.side !== 'player' || S.game.combat?.isOver) return;
    S.combatSkill = null;
    S.combatInspect = null;
    applyAction({ type: 'combatDefend', playerId: active.playerId });
  }

  function combatEndTurn() {
    const active = combatActiveUnit();
    if (!active || active.side !== 'player' || S.game.combat?.isOver) return;
    S.combatSkill = null;
    S.combatInspect = null;
    applyAction({ type: 'combatEndTurn', playerId: active.playerId });
  }

  function closeCombat() {
    applyAction({ type: 'closeCombat' }, { closeModal: true });
  }

  /** 撤离确认：这是「打不过」时唯一不删档的出口，所以必须把代价写清楚。 */
  function openRetreatModal() {
    const active = combatActiveUnit();
    if (!active || active.side !== 'player' || S.game?.combat?.isOver || S.busy) return;
    const spd = (active.stats && active.stats.spd) || 50;
    const chance = Math.max(10, Math.min(90, 40 + Math.trunc((spd - 50) / 2)));
    mountModal('retreat', modalHeader('⇤', '撤离这一场？', 'DISENGAGE') +
      `<div class="modal-body"><div class="event-text" style="border-left-color:var(--pink)">
        全队退回进入战斗前的节点，<b>这个节点不会被清空</b>，之后还得再打一次。<br>
        代价：参战成员失去 <b>10% 最大生命</b>（不会致死），本回合结束。<br>
        <b style="color:var(--cyan)">撤离检定 ${chance}%</b>（${esc(active.name)} 的速度 ${spd}）——失败会被敌人追击一轮。
      </div></div>
      <div class="modal-foot">
        <button class="btn btn-sm btn-ghost" data-act="modal-close">继续战斗</button>
        <button class="btn btn-sm btn-danger" data-act="retreat-confirm">确认撤离（${chance}%）</button>
      </div>`, true);
  }

  function retreatCombat() {
    const active = combatActiveUnit();
    if (!active || active.side !== 'player') return;
    closeModal();
    S.combatSkill = null;
    S.combatInspect = null;
    applyAction({ type: 'retreat', playerId: active.playerId });
  }

  function advanceAct() {
    if (S.busy) return;
    S.actTab = 'info';   // 下一次幕间默认回到情报页
    applyAction({ type: 'advanceAct' }, { toastMessage: true, toastKind: 'info' });
  }

  /* ── phase modals ───────────────────────────────────────────────── */
  function syncModals() {
    const g = S.game;
    if (!g) return;
    // 教学有自己的一套「必须看到」的结局：失败可重试，完成进标准模式
    if (g.mode === 'tutorial') {
      if (g.phase === 'defeat' || g.tutorial?.failed) {
        if (S.modalType !== 'tutorialFail') { closeModal(); openTutorialFailModal(); }
        return;
      }
      if (g.tutorial?.completed) {
        if (S.modalType !== 'tutorialDone') { closeModal(); openTutorialDoneModal(); }
        return;
      }
    }
    let required = null;
    if (g.phase === 'event') required = 'event';
    else if (g.phase === 'coop') required = 'coop';
    else if (g.phase === 'shop') required = 'shop';
    else if (g.phase === 'safehouse') required = 'safehouse';
    else if (g.phase === 'actTransition') required = 'actTransition';
    else if (g.phase === 'victory' || g.phase === 'defeat') required = 'end';
    else if (g.phase === 'combat' && g.combat?.isOver) required = 'combatResult';

    if (required) {
      if (S.modalType !== required) {
        if (required === 'event') openEventModal();
        else if (required === 'coop') openCoopModal();
        else if (required === 'shop') openShopModal();
        else if (required === 'safehouse') openSafehouseModal();
        else if (required === 'actTransition') openActTransitionModal();
        else if (required === 'end') openEndModal();
        else if (required === 'combatResult') openCombatResultModal();
      } else {
        if (required === 'coop') openCoopModal();
        else if (required === 'shop') openShopModal();
        else if (required === 'safehouse') openSafehouseModal();
        else if (required === 'actTransition') openActTransitionModal();
        else if (required === 'end') openEndModal();
        else if (required === 'combatResult') openCombatResultModal();
      }
      return;
    }
    if (['event', 'coop', 'shop', 'safehouse', 'actTransition', 'end', 'combatResult', 'story', 'quest'].includes(S.modalType)) {
      closeModal();
    }
    if (!S.modalType && g.pendingBeat && !S.dismissedBeats.has(g.pendingBeat.id)) {
      openStoryModal();
      return;
    }
    if (!S.modalType && g.pendingQuestOffer) {
      openQuestModal();
      return;
    }
    if (!S.modalType) {
      const explain = nextExplainKey(g);
      if (explain) { openExplainModal(explain); return; }
    }
    if (['combat', 'event', 'actTransition', 'victory', 'defeat'].includes(g.phase) &&
        ['inventory', 'assist', 'restart'].includes(S.modalType)) {
      closeModal();
    }
    if (S.modalType === 'inventory') openInventoryModal(S.invPlayerId, true);
  }

  function openEventModal() {
    const g = S.game;
    const pending = g?.pendingEvent;
    if (!pending?.event) return;
    const ev = pending.event;
    const player = g.players.find(p => p.id === pending.playerId) || activePlayer();
    const body = `<div class="event-text">${esc(ev.text || '')}</div>
      <div class="event-choices">${(ev.choices || []).map((ch, i) => {
        const reasons = [];
        if (ch.costMemory > g.memory) reasons.push(`记忆币不足（需 ${ch.costMemory}）`);
        if (ch.costHp > 0 && player.hp <= ch.costHp) reasons.push(`HP 不足（需 ${ch.costHp}）`);
        if (ch.costItem && !(player.inventory || []).some(it => it.itemId === ch.costItem)) reasons.push('缺少所需物品');
        const chance = ch.stat && ch.dc ? checkChance(ch, player) : null;
        const meta = [];
        if (ch.stat && ch.dc) meta.push(`${ch.stat} 检定 · DC ${ch.dc} · 成功率 ${chance}%`);
        if (ch.costMemory) meta.push(`<b>−${ch.costMemory} 记忆币</b>`);
        if (ch.costHp) meta.push(`<b>−${ch.costHp} HP</b>`);
        if (ch.costItem) meta.push(`需要 ${esc(S.gearById.get(ch.costItem)?.name || ch.costItem)}`);
        return `<button class="choice-btn" data-act="event-choice" data-index="${i}" ${reasons.length ? 'disabled' : ''}>
          <div class="ch-text">${esc(ch.text || `选项 ${i + 1}`)}</div>
          <div class="ch-meta">${meta.join('<span>·</span>')}${reasons.length ? `<span style="color:var(--red)">${esc(reasons.join('；'))}</span>` : ''}</div>
        </button>`;
      }).join('')}</div>`;
    mountModal('event', modalHeader(esc(ev.icon || '◇'), esc(ev.title || '未标记事件'), esc(ev.subtitle || '') ) +
      `<div class="modal-body">${body}</div>
       <div class="modal-foot"><span class="mini-label">选择会立即生效 · 行动者 ${esc(player.name)}</span></div>`, false);
  }

  function chooseEvent(index) {
    if (S.busy) return;
    applyAction({ type: 'eventChoice', choiceIndex: index }, { toastMessage: true, toastKind: 'info' });
  }

  function checkChance(choice, player) {
    const stat = String(choice.stat || '').toUpperCase();
    const raw = player?.stats?.[stat.toLowerCase()] ?? 50;
    const bonus = Math.floor((raw - 50) / 5);
    const assist = Math.floor((player?.assistBonus || 0) / 2);
    return Math.max(5, Math.min(95, choice.dc + bonus + assist));
  }

  function openShopModal() {
    const g = S.game;
    if (!g) return;
    const p = activePlayer();
    const items = g.shop || [];
    const cards = items.map(item => {
      const gear = S.gearById.get(item.itemId) || item;
      const stats = gearSummary(gear);
      const sold = item.sold;
      const afford = g.memory >= item.price;
      const disabled = sold || !afford || S.busy;
      return `<div class="shop-item${sold ? ' sold' : ''}">
        <div class="si-top"><span class="si-name ${rarityClass(gear.rarity)}">${esc(item.name)} </span><span class="si-price">¤ ${item.price}</span></div>
        <div class="pc-tags"><span class="badge-rarity ${rarityClass(gear.rarity)}">${esc(gear.rarity || '普通')}</span><span class="mini-tag">${esc(SLOT_LABEL[item.slot] || item.slot)}</span>${item.level ? `<span class="mini-tag gold">+${item.level}</span>` : ''}</div>
        <div class="si-desc">${esc(item.desc || gear.desc || '')}</div>
        <div class="si-stats">${stats.join(' · ')}</div>
        <div class="shop-actions"><button class="btn btn-sm btn-ghost" data-act="shop-buy" data-item-id="${esc(item.itemId)}" ${disabled ? 'disabled' : ''}>${sold ? '已售出' : (afford ? '购买' : '记忆币不足')}</button></div>
      </div>`;
    }).join('');
    const body = `<div class="shop-top"><span>买家：<b>${esc(p?.name || '—')}</b> · 购买后进入背包</span><span>记忆币 <b>¤ ${g.memory}</b> · 合金 <b>◈ ${g.alloy}</b></span></div>
      <div class="shop-grid">${cards || '<div class="mini-label">终端没有库存。</div>'}</div>
      <div class="select-tip" style="margin-top:12px"><b>黑市规则</b><p>装备不会自动穿戴。购买后打开「装备 / 背包」穿到对应槽位。强化只能在安全屋进行。</p></div>`;
    mountModal('shop', modalHeader('¤', '黑市终端', 'NEON HARBOR BLACK MARKET // NO REFUNDS') +
      `<div class="modal-body">${body}</div>
       <div class="modal-foot"><button class="btn btn-sm btn-ghost" data-act="shop-close">离开终端</button></div>`, false);
  }

  function buyShopItem(itemId) {
    const p = activePlayer();
    if (!p || S.busy) return;
    applyAction({ type: 'buy', playerId: p.id, itemId }, { toastMessage: true, toastKind: 'info' });
  }

  function leaveShop() {
    const p = activePlayer();
    applyAction({ type: 'close', playerId: p?.id }, { closeModal: true });
  }

  /** 「每个槽位 + 强化按钮」的行——安全屋和幕间共用同一份，避免两处规则漂移。 */
  function gearUpgradeRowsHtml(g, player) {
    return SLOT_ORDER.map(slot => {
      const item = player.equipment?.[slot];
      if (!item) return `<div class="gear-upgrade-row"><span class="gu-name">${SLOT_LABEL[slot]}：空</span></div>`;
      const max = item.level >= 5;
      const costMemory = 35 + item.level * 30;
      const costAlloy = 1 + Math.floor(item.level / 3);
      const can = !max && g.memory >= costMemory && g.alloy >= costAlloy && !S.busy;
      return `<div class="gear-upgrade-row">
        <span class="gu-name">${SLOT_LABEL[slot]} · ${esc(item.name)} <b class="${rarityClass(item.rarity)}">${esc(item.levelText || `+${item.level}`)}</b></span>
        <span class="gu-cost">${max ? 'MAX' : `¤${costMemory} / ◈${costAlloy}`}</span>
        <button class="btn btn-ghost" data-act="upgrade" data-player-id="${esc(player.id)}" data-slot="${esc(slot)}" ${can ? '' : 'disabled'}>强化</button>
      </div>`;
    }).join('');
  }

  function openSafehouseModal() {
    const g = S.game;
    if (!g) return;
    const p = activePlayer();
    const tabs = [
      ['rest', '休息'], ['forge', '强化'], ['revive', '复活']
    ];
    let body = '';
    if (S.safehouseTab === 'forge') {
      body = (g.players || []).map(player => {
        const slots = gearUpgradeRowsHtml(g, player);
        return `<div class="safehouse-player">
          <div class="sp-head"><img src="${esc(player.portrait)}" alt="${esc(player.name)}" /><div><div class="sp-name">${esc(player.name)}</div><div class="pc-role">Lv.${player.level} · ${esc(player.role)}</div></div></div>
          ${traitChipsHtml(player)}
          <div class="sp-gear">${slots}</div>
        </div>`;
      }).join('');
    } else if (S.safehouseTab === 'revive') {
      const downed = (g.players || []).filter(x => x.downed);
      body = downed.length ? downed.map(player => `<div class="safehouse-player">
        <div class="sp-head"><img src="${esc(player.portrait)}" alt="${esc(player.name)}" /><div><div class="sp-name">${esc(player.name)}</div><div class="pc-role">SIGNAL LOST</div></div>
          <button class="btn btn-sm btn-ghost" data-act="revive" data-player-id="${esc(player.id)}" ${g.memory < 60 || g.teamLives <= 0 || S.busy ? 'disabled' : ''}>复活 · ¤60 / ♥1</button>
        </div></div>`).join('') : '<div class="mini-label">没有需要复活的队友。</div>';
      body += `<div class="select-tip"><b>生命维持</b><p>复活消耗 60 记忆币与 1 点队伍生命。队伍生命归零后无法再复活队友。</p></div>`;
    } else {
      const heal = Math.max(10, Math.ceil((p?.maxHp || 1) * 0.35));
      const hpPct = p ? Math.max(0, Math.min(100, p.hp / Math.max(1, p.maxHp) * 100)) : 0;
      body = `<div class="safehouse-player">
        <div class="sp-head"><img src="${esc(p?.portrait || '')}" alt="${esc(p?.name || '')}" /><div><div class="sp-name">${esc(p?.name || '—')}</div><div class="pc-role">当前行动者 · HP ${p?.hp || 0}/${p?.maxHp || 0}</div></div></div>
        <div class="sp-gear" style="display:block">
          <div class="hp-bar ${hpPct <= 30 ? 'low' : ''}" style="height:9px"><i style="width:${hpPct}%"></i></div>
          <div class="hp-text" style="margin-top:5px"><span>恢复到</span><b>${Math.min(p?.maxHp || 0, (p?.hp || 0) + heal)} HP（+${heal}）</b></div>
          <button class="btn btn-sm btn-ghost" data-act="rest" style="margin-top:10px" ${!p || p.downed ? 'disabled' : ''}>在安全屋休息</button>
        </div></div>
        <div class="select-tip"><b>安全屋</b><p>休息不消耗 AP，但每次互动进入安全屋需要 1 AP。安全屋可以强化装备和复活队友。</p></div>`;
    }
    const bodyHtml = `<div class="tabs">${tabs.map(([id, label]) => `<button class="tab-btn${S.safehouseTab === id ? ' active' : ''}" data-act="safe-tab" data-tab="${id}">${label}</button>`).join('')}</div>${body}`;
    mountModal('safehouse', modalHeader('⌂', '安全屋', `SAFEHOUSE // ¤${g.memory} · ◈${g.alloy} · ♥${g.teamLives}`) +
      `<div class="modal-body">${bodyHtml}</div>
       <div class="modal-foot"><button class="btn btn-sm btn-ghost" data-act="shop-close">离开安全屋</button></div>`, false);
  }

  function setSafehouseTab(tab) {
    S.safehouseTab = tab;
    openSafehouseModal();
  }

  function restActive() {
    const p = activePlayer();
    if (!p || S.busy) return;
    if (S.game.phase === 'safehouse') {
      applyAction({ type: 'rest', playerId: p.id }, { toastMessage: true, toastKind: 'info' });
    } else if (S.game.phase === 'exploration') {
      if (p.ap < 2) { toast('休息需要 2 AP。', 'warn'); return; }
      applyAction({ type: 'rest', playerId: p.id }, { toastMessage: true, toastKind: 'info' });
    }
  }

  function upgradeItem(playerId, slot) {
    if (S.busy) return;
    applyAction({ type: 'upgrade', playerId, slot }, { toastMessage: true, toastKind: 'info' });
  }

  function revivePlayer(playerId) {
    if (S.busy) return;
    applyAction({ type: 'revive', playerId }, { toastMessage: true, toastKind: 'info' });
  }

  /* ── inventory / assist ─────────────────────────────────────────── */
  function openInventoryModal(playerId, keep) {
    const g = S.game;
    if (!g) return;
    const p = g.players.find(x => x.id === playerId) || activePlayer();
    if (!p) return;
    S.invPlayerId = p.id;
    const tabs = g.players.map(x => `<button class="inv-player-tab${x.id === p.id ? ' active' : ''}" data-act="inventory-player" data-player-id="${esc(x.id)}">${esc(x.name)}</button>`).join('');
    const equipment = SLOT_ORDER.map(slot => {
      const item = p.equipment?.[slot];
      return `<div class="equip-slot">
        <span class="es-label">${SLOT_LABEL[slot]}</span>
        <div class="es-item"><div class="es-name ${item ? rarityClass(item.rarity) : ''}">${item ? `${esc(item.name)} ${esc(item.levelText || '')}` : '— 空 —'}</div>
        <div class="es-stats">${item ? gearSummary(item).join(' · ') : '未装备'}</div></div>
      </div>`;
    }).join('');
    const stats = STAT_KEYS.map(k => `<div class="stat-cell"><span>${k} ${STAT_LABEL[k]}</span><b>${p.stats?.[k.toLowerCase()] ?? 0}</b></div>`).join('');
    const inv = (p.inventory || []).length
      ? p.inventory.map(item => bagItemHtml(p, item)).join('')
      : `<div class="bag-empty" style="min-height:220px;justify-content:center"><span class="bag-empty-icon">▤</span><b>没有备用装备</b><small>去黑市、遗骸或战斗掉落里找。换装只在探索与幕间生效，战斗中不能换。</small></div>`;
    const body = `<div class="inv-player-tabs">${tabs}</div>
      <div class="inventory-layout">
        <div class="inv-section">
          <h4>装备槽</h4><div class="equip-slots">${equipment}</div>
          <h4 style="margin-top:14px">属性</h4>
          <div class="stat-grid">
            <div class="stat-cell"><span>HP</span><b>${p.hp}/${p.maxHp}</b></div>
            <div class="stat-cell"><span>护甲</span><b>${p.armor}</b></div>
            <div class="stat-cell"><span>抗性</span><b>${p.resistance}</b></div>
            <div class="stat-cell"><span>闪避</span><b>${p.evasion}%</b></div>
            <div class="stat-cell"><span>命中</span><b>+${p.accuracyBonus}</b></div>
            <div class="stat-cell"><span>伤害</span><b>+${p.damageBonus}</b></div>
            <div class="stat-cell"><span>移动</span><b>${p.movement}</b></div>
            <div class="stat-cell"><span>Focus</span><b>${p.focus}/${p.maxFocus}</b></div>
            <div class="stat-cell"><span>XP</span><b>${p.xp}/${p.xpNext}</b></div>
            ${stats}
          </div>
          <h4 style="margin-top:14px">套装</h4>
          <div class="set-list">${setProgressHtml(p)}</div>
        </div>
        <div class="inv-section">
          <h4>背包 <span class="mini-label">${(p.inventory || []).length} 件</span></h4>
          <div class="inv-list">${inv}</div>
          <div class="select-tip" style="margin-top:12px"><b>配装提示</b><p>装备后立即重算 HP、护甲、抗性、命中与伤害。战斗内不能换装。套装按已装备件数阶梯生效，具体加成见左侧列表。</p></div>
        </div>
      </div>`;
    mountModal('inventory', modalHeader('▤', `${p.name} · 装备与背包`, `EXECUTOR LOADOUT // ${esc(p.role)} · Lv.${p.level}`) +
      `<div class="modal-body">${body}</div>
       <div class="modal-foot"><button class="btn btn-sm btn-ghost" data-act="modal-close">关闭</button></div>`, true);
  }

  function equipItem(playerId, instanceId) {
    const p = S.game?.players.find(x => x.id === playerId);
    const item = p?.inventory?.find(x => x.instanceId === instanceId);
    if (!p || !item) return;
    if (S.busy) return;
    applyAction({ type: 'equip', playerId, itemId: instanceId, slot: item.slot }, { toastMessage: true, toastKind: 'info' });
  }

  const ASSIST_ACTIONS = [
    { kind: 'guard', label: '掩护', desc: '替 TA 承担下一场战斗一半伤害', action: 'assistGuard' },
    { kind: 'focus', label: '赠 Focus', desc: '把自己的 1 点 Focus 让给 TA', action: 'assistFocus' },
    { kind: 'mark', label: '标记目标', desc: 'TA 的下一次攻击命中 +8%', action: 'assistMark' },
    { kind: 'rescue', label: '救援', desc: '拉起同节点倒下的队友（每幕一次）', action: 'assistRescue' },
    { kind: 'ping', label: '标记路线', desc: '只做共享标记，不消耗 AP、不改规则', action: 'assistPing' }
  ];

  function openAssistModal(kind) {
    const g = S.game;
    if (!g || g.phase !== 'exploration') return;
    const p = activePlayer();
    if (!p) return;
    const pick = typeof kind === 'string' ? kind : (S.assistKind || 'guard');
    S.assistKind = pick;
    const def = ASSIST_ACTIONS.find(a => a.kind === pick) || ASSIST_ACTIONS[0];
    if (pick !== 'ping' && p.ap < 1) { toast('AP 不足。', 'warn'); return; }
    const current = nodeById(p.nodeId);
    const sameNode = g.players.filter(x => x.id !== p.id && x.nodeId === p.nodeId);
    const near = g.players.filter(x => x.id !== p.id &&
      (x.nodeId === p.nodeId || current?.neighbors?.includes(x.nodeId)));
    const candidates = pick === 'rescue' ? sameNode.filter(x => x.downed) : near.filter(x => !x.downed);
    const tabs = ASSIST_ACTIONS.map(a => `<button class="assist-tab${a.kind === pick ? ' on' : ''}" data-act="assist-tab" data-kind="${a.kind}">${a.label}</button>`).join('');
    const body = candidates.length ? candidates.map(x => `<div class="safehouse-player">
      <div class="sp-head"><img src="${esc(x.portrait)}" alt="${esc(x.name)}" /><div><div class="sp-name">${esc(x.name)}</div><div class="pc-role">${esc(x.role)} · ${esc(nodeById(x.nodeId)?.name || x.nodeId)}${x.downed ? ' · 信号中断' : ''}</div></div>
      <button class="btn btn-sm btn-ghost" data-act="assist-do" data-player-id="${esc(x.id)}" data-kind="${pick}">${def.label}${pick === 'ping' ? '' : ' · 1AP'}</button></div>
    </div>`).join('') : '<div class="mini-label">没有符合条件的目标（救援只能救同节点倒下的队友）。</div>';
    mountModal('assist', modalHeader('◇', '协助队友', 'CO-OP SUPPORT // 5 ACTIONS') +
      `<div class="modal-body">
        <div class="assist-tabs">${tabs}</div>
        <div class="assist-desc">${esc(def.desc)}</div>
        ${body}
        <div class="select-tip"><b>协同</b><p>掩护会在下一场战斗替队友承担一半伤害；赠满 Focus 会让 TA 的终极技每击 +3。所有支援动作都写进行动记录与复盘。</p></div>
      </div>
       <div class="modal-foot"><button class="btn btn-sm btn-ghost" data-act="modal-close">取消</button></div>`, true);
  }

  function assistPlayer(playerId) {
    const p = activePlayer();
    if (!p) return;
    closeModal();
    applyAction({ type: 'assist', playerId: p.id, targetPlayerId: playerId }, { toastMessage: true, toastKind: 'info' });
  }

  function assistDo(playerId, kind) {
    const p = activePlayer();
    if (!p) return;
    const def = ASSIST_ACTIONS.find(a => a.kind === kind);
    if (!def) return;
    closeModal();
    applyAction({ type: def.action, playerId: p.id, targetPlayerId: playerId, nodeId: p.nodeId, slot: kind === 'ping' ? '看这里' : undefined },
      { toastMessage: true, toastKind: 'info' });
  }

  /* ── 多人事件（0.22）──────────────────────────────────────────── */
  function openCoopModal() {
    const g = S.game;
    const c = g?.coop;
    if (!c) return;
    const tally = {};
    for (const v of Object.values(c.votes || {})) tally[v] = (tally[v] || 0) + 1;
    const chosen = (c.options || []).find(o => o.id === c.chosenId);
    const rows = (c.options || []).map(o => {
      const voters = Object.entries(c.votes || {})
        .filter(([, v]) => v === o.id)
        .map(([id]) => g.players.find(p => p.id === id)?.name || id);
      const voteRow = c.resolved
        ? (voters.length ? `<div class="co-voters static">${voters.map(v => `<span>${esc(v)}</span>`).join('')}</div>` : '')
        : `<div class="co-voters">${g.players.filter(p => !p.downed).map(p =>
            `<button class="co-voter${(c.votes || {})[p.id] === o.id ? ' on' : ''}"
              data-act="coop-vote" data-player-id="${esc(p.id)}" data-option="${esc(o.id)}"
              aria-pressed="${(c.votes || {})[p.id] === o.id}">${esc(p.name)}${(c.votes || {})[p.id] === o.id ? ' ✓' : ''}</button>`).join('')}</div>`;
      return `<div class="coop-opt${c.chosenId === o.id ? ' chosen' : ''}">
        <div class="co-head"><b>${esc(o.label)}</b><span>${tally[o.id] || 0} 票</span></div>
        <p>${esc(o.desc)}</p>
        <div class="co-effect">${esc(effectLabel(o.effect))}</div>
        ${voteRow}
      </div>`;
    }).join('');
    const remain = Math.max(0, Math.round(((c.deadlineAt || 0) - Date.now()) / 1000));
    mountModal('coop', modalHeader('⇄', '多人事件 · ' + c.title, 'CO-OP DECISION // 多数决') +
      `<div class="modal-body">
        <div class="coop-text">${esc(c.text || '').replace(/\n/g, '<br />')}</div>
        <div class="coop-timer" id="coop-timer-line">剩余 <b id="coop-timer">${remain}</b> 秒 · 全员投完立即结算 · 超时按安全选项</div>
        <div class="coop-options">${rows}</div>
        ${c.resolved ? `<div class="coop-result"><b>${esc(chosen?.label || '')}</b><span>${esc(c.result || '')}</span>${c.timedOut ? '<em>超时，采用安全选项</em>' : ''}</div>` : ''}
      </div>
      <div class="modal-foot">${c.resolved
        ? '<button class="btn btn-primary" data-act="coop-close">继续前进</button>'
        : '<button class="btn btn-sm btn-ghost" data-act="coop-resolve" data-slot="timeout">放弃表决（安全选项）</button>'}</div>`, false);

    clearInterval(S.coopTimer);
    if (!c.resolved) {
      const started = Date.now();
      S.coopTimer = setInterval(() => {
        const el = $('#coop-timer');
        if (!el) { clearInterval(S.coopTimer); return; }
        const left = Math.max(0, Math.round(((c.deadlineAt || 0) - Date.now()) / 1000));
        el.textContent = String(left);
        if (left <= 0 || Date.now() - started > 130000) {
          clearInterval(S.coopTimer);
          coopResolve('timeout');
        }
      }, 1000);
    }
  }

  function effectLabel(effect) {
    return (effect || '').split(';').filter(Boolean).map(p => {
      const [k, v] = p.split(':');
      const name = { memory: '记忆币', hp: '生命', purge: '电子追踪', alloy: '合金', focus: 'Focus' }[k] || k;
      return `${name} ${v}`;
    }).join(' · ');
  }

  function coopVote(playerId, optionId) {
    if (!playerId || !optionId) return;
    applyAction({ type: 'coopVote', playerId, slot: optionId });
  }

  function coopResolve(slot) {
    applyAction({ type: 'coopResolve', slot: slot || undefined });
  }

  function coopClose() {
    applyAction({ type: 'coopClose' });
  }

  /* ── end states ─────────────────────────────────────────────────── */
  function openCombatResultModal() {
    const g = S.game;
    const c = g?.combat;
    if (!c) return;
    const victory = c.result === 'victory';
    const node = nodeById(c.nodeId);
    const elite = node?.type === 'elite' || node?.type === 'keyElite';
    const boss = node?.type === 'boss';
    const downed = (g.players || []).some(p => p.downed);
    const fastClear = (c.round || 1) <= (boss ? 12 : 5);
    const rank = !victory ? 'C' : downed ? 'C' : fastClear ? 'S' : 'A';
    // syncModals 会在弹窗打开期间反复重挂；字效只放一次
    const fxKey = `${g.sessionId}:${c.nodeId}:${c.round}:${c.result}:${g.revision}`;
    if (window.Fx && S.resultFxKey !== fxKey) {
      S.resultFxKey = fxKey;
      if (victory) {
        if (elite || boss) {
          window.Fx.victory({
            rank,
            title: boss ? '协议节点清除' : '精英信号清除',
            rewards: [`记忆 ${g.memory}`, `合金 ${g.alloy}`, `ROUND ${c.round}`]
          });
        } else {
          window.Fx.victory({ compact: true, title: '战斗结束' });
        }
      } else {
        window.Fx.defeat({ reason: g.message || '队伍失去了战斗能力' });
      }
    }
    const body = `<div class="end-panel ${victory ? 'victory' : ''}" style="padding:8px 0">
      <div class="end-icon">${victory ? '◇' : '✕'}</div>
      <h2>${victory ? '战斗胜利' : '战斗失败'}</h2>
      <div class="end-sub">${victory ? 'HOSTILE SIGNAL CLEARED' : 'SIGNAL LOST'}</div>
      <div class="end-text">${esc(g.message || (victory ? '敌方信号已清除。' : '队伍失去了战斗能力。'))}</div>
      <div class="end-stats">
        <div><b>R${c.round}</b><span>回合</span></div>
        <div><b>${c.units.filter(u => u.side === 'enemy' && u.downed).length}</b><span>清除信号</span></div>
        <div><b>${g.memory}</b><span>记忆币</span></div>
      </div>
    </div>`;
    mountModal('combatResult', modalHeader(victory ? '◇' : '✕', victory ? '战术结算' : '战术失败', 'AFTER ACTION REPORT') +
      `<div class="modal-body">${body}</div>
       <div class="modal-foot">${victory ? '<button class="btn btn-sm btn-primary" data-act="close-combat">返回节点图</button>' : ''}</div>`, false);

    // 首领收尾戏：结算面板已经在后面了，先让玩家把这段看完
    if (victory && boss) {
      const postId = `boss${Math.max(1, Math.min(3, g.act || 1))}_post`;
      if (storyReady() && !sceneSeen(postId) && S.postSceneKey !== fxKey) {
        S.postSceneKey = fxKey;
        playScene(postId);
      }
    }
  }

  /**
   * 幕间会自动把倒下的成员拉回来（40% 生命，不花记忆币、也不消耗队伍生命）——
   * 这条规则写在服务端 AdvanceAct 里，玩家在界面上完全看不到。这里把它摆出来。
   */
  function downedNote(g) {
    const downed = (g.players || []).filter(p => p.downed);
    if (!downed.length) return '';
    const names = downed.map(p => esc(p.name)).join('、');
    return `<div class="select-tip" style="margin-top:12px;border-left-color:var(--amber)">
      <b>会自动归队</b>
      <p>${names} 会在进入下一幕时以 <b>40% 生命</b>自动上线——<b>不消耗记忆币，也不消耗队伍生命</b>。</p>
    </div>`;
  }

  function openActTransitionModal() {
    const g = S.game;
    if (!g) return;
    const nextName = g.nextActName || '下一幕';
    const nextObjective = g.nextActObjective || '继续深入零号协议。';
    const avgLevel = g.players.length ? Math.round(g.players.reduce((a, p) => a + p.level, 0) / g.players.length) : 0;
    const tab = S.actTab || 'info';
    const tabs = [['info', '情报'], ['forge', '强化'], ['gear', '换装']];

    let body = '';
    if (tab === 'forge') {
      body = (g.players || []).map(player => `<div class="safehouse-player">
          <div class="sp-head"><img src="${esc(player.portrait)}" alt="${esc(player.name)}" /><div><div class="sp-name">${esc(player.name)}</div><div class="pc-role">Lv.${player.level} · ${esc(player.role)}</div></div></div>
          <div class="sp-gear">${gearUpgradeRowsHtml(g, player)}</div>
        </div>`).join('') +
        `<div class="select-tip"><b>幕间强化</b><p>幕间和安全屋一样能强化装备。下一个安全屋不一定在你想去的路上——把合金和记忆币在这里花掉。</p></div>`;
    } else if (tab === 'gear') {
      body = (g.players || []).map(player => {
        const slots = SLOT_ORDER.map(slot => {
          const item = player.equipment?.[slot];
          return `<div class="equip-slot">
            <span class="es-label">${SLOT_LABEL[slot]}</span>
            <div class="es-item"><div class="es-name ${item ? rarityClass(item.rarity) : ''}">${item ? `${esc(item.name)} ${esc(item.levelText || '')}` : '— 空 —'}</div>
            <div class="es-stats">${item ? gearSummary(item).join(' · ') : '未装备'}</div></div>
          </div>`;
        }).join('');
        const bag = (player.inventory || []).length
          ? player.inventory.map(item => bagItemHtml(player, item)).join('')
          : '<div class="mini-label">背包里没有备用装备。</div>';
        return `<div class="safehouse-player">
          <div class="sp-head"><img src="${esc(player.portrait)}" alt="${esc(player.name)}" /><div><div class="sp-name">${esc(player.name)}</div><div class="pc-role">Lv.${player.level} · ${esc(player.role)} · HP ${player.hp}/${player.maxHp}</div></div></div>
          ${traitChipsHtml(player)}
          <div class="act-gear-grid">
            <div><h4>装备槽</h4><div class="equip-slots">${slots}</div></div>
            <div><h4>背包 <span class="mini-label">${(player.inventory || []).length} 件</span></h4><div class="inv-list">${bag}</div></div>
          </div>
        </div>`;
      }).join('') +
        `<div class="select-tip"><b>幕间换装</b><p>换装立即生效并重算属性。下一幕的主题是「${esc(nextName)}」——先看清楚再来配。</p></div>`;
    } else {
      const recap = (g.recaps || []).slice(-1)[0];
      const recapHtml = recap ? `<div class="act-recap">
          <div class="ar2-head"><span>CHAPTER RECAP</span><b>${esc(recap.name || `第 ${recap.act} 幕`)} 做完的事</b></div>
          <div class="ar2-grid">
            <div><b>${recap.nodes || 0}</b><span>走过的节点</span></div>
            <div><b>${recap.victories || 0}/${recap.battles || 0}</b><span>战斗胜/场</span></div>
            <div><b>${recap.events || 0}</b><span>触发事件</span></div>
            <div><b>${recap.synergies || 0}</b><span>协同</span></div>
          </div>
          <div class="ar2-line">结束时追踪 ${recap.purgeLeft}/${recap.purgeMax} · 队伍生命 ${recap.teamLives} · 平均 Lv.${recap.avgLevel}</div>
          ${(recap.consequenceTitles || []).length ? `<div class="ar2-chips"><span>带进下一幕的后果</span>${recap.consequenceTitles.map(t => `<i>${esc(t)}</i>`).join('')}</div>` : ''}
          ${(recap.bondLines || []).length ? `<div class="ar2-bonds">${recap.bondLines.slice(0, 4).map(x => `<div>${esc(x)}</div>`).join('')}</div>` : ''}
        </div>` : '';
      body = `<div class="end-panel victory" style="padding:8px 0">
      <div class="end-icon">✦</div>
      <h2>${esc(g.actName || `第 ${g.act} 幕`)} · 完成</h2>
      <div class="end-sub">ACT CLEARED // NEXT ACT READY</div>
      <div class="end-text">${esc(g.outcome || '前路暂时安静下来。')}</div>
      <div class="end-stats">
        <div><b>${g.act}</b><span>已完成幕</span></div>
        <div><b>${g.memory}</b><span>记忆币</span></div>
        <div><b>${g.teamLives}</b><span>队伍生命</span></div>
        <div><b>${avgLevel}</b><span>平均等级</span></div>
      </div>
      <div class="select-tip" style="margin-top:16px;border-left-color:var(--cyan)">
        <b>NEXT ACT // ${esc(nextName)}</b>
        <p>${esc(nextObjective)}</p>
        <p class="mini-label" style="margin-top:6px">幕间整备：全队至少恢复至半血，倒下成员重新上线；等级、装备、套装、记忆币与队伍生命保留。追踪计时重置。</p>
      </div>
    </div>` + recapHtml + downedNote(g);
    }

    if (tab === 'info') {
      const nextAct = Math.max(1, Math.min(3, (g.act || 1) + 1));
      const roman = ['I', 'II', 'III'][nextAct - 1];
      const shortName = String(nextName).replace(/^第[一二三四]幕\s*·?\s*/, '');
      body = `<div class="interlude-hero">
          <img src="assets/keyart/act${nextAct}.webp" alt="" />
          <div class="ih-text"><span>ACT ${roman} · NEXT</span><b>${esc(shortName)}</b></div>
        </div>` + body;
    }

    const tabBar = `<div class="tabs">${tabs.map(([id, label]) => `<button class="tab-btn${tab === id ? ' active' : ''}" data-act="act-tab" data-tab="${id}">${label}</button>`).join('')}</div>`;
    mountModal('actTransition', modalHeader('✦', tab === 'info' ? '幕间 · 协议转移' : '幕间 · 整备', `INTERLUDE // ¤${g.memory} · ◈${g.alloy} · ♥${g.teamLives}`) +
      `<div class="modal-body">${tabBar}${body}</div>
       <div class="modal-foot"><button class="btn btn-primary" data-act="advance-act">进入 ${esc(nextName)}</button></div>`, false);
  }

  function bagItemIcon(id, fallback) {
    const slug = ITEM_ICON[id];
    if (!slug) return esc(fallback || '✚');
    return `<i class="item-icon" style="-webkit-mask-image:url(assets/icons/${slug}.svg);mask-image:url(assets/icons/${slug}.svg)"></i>`;
  }

  function openBag() {
    const g = S.game;
    if (!g) return;
    const p = activePlayer();
    if (!p) return;
    const defs = new Map((S.meta?.consumables || []).map(c => [c.id, c]));
    const entries = Object.entries(p.consumables || {}).filter(([, n]) => n > 0);
    const inCombat = g.phase === 'combat';
    const rows = entries.length
      ? entries.map(([id, n]) => {
          const d = defs.get(id) || { name: id, desc: '', icon: '✚', combatOnly: false };
          const blocked = inCombat ? false : !!d.combatOnly;
          return `<button class="bag-item${blocked ? ' disabled' : ''}" data-act="use-item" data-item-id="${esc(id)}" ${blocked ? 'disabled' : ''}>
            <span class="bag-icon">${bagItemIcon(id, d.icon)}</span>
            <span class="bag-main"><b>${esc(d.name)} <em>×${n}</em></b><small>${esc(d.desc || '')}</small></span>
            <span class="bag-use">${blocked ? '仅战斗' : '使用'}</span>
          </button>`;
        }).join('')
      : `<div class="bag-empty"><span class="bag-empty-icon">▤</span><b>背包是空的</b><small>遗骸、黑市和遭遇战里都会掉道具。战斗专用道具只能在战斗中使用。</small></div>`;
    mountModal('bag', `${modalHeader('▤', '随身道具', inCombat ? 'IN COMBAT · 使用会结束该单位行动' : '消耗 1 AP')}
      <div class="modal-body"><div class="bag-list">${rows}</div></div>
      <div class="modal-actions"><button class="btn btn-ghost" data-act="modal-close">关闭</button></div>`, true);
  }

  async function useConsumable(itemId) {
    const g = S.game;
    if (!g) return;
    const p = activePlayer();
    if (!p) return;
    let ok = false;
    if (g.phase === 'combat') {
      ok = await applyAction({ type: 'combatItem', itemId, playerId: p.id, targetUnitId: g.combat?.activeUnitId });
    } else {
      ok = await applyAction({ type: 'useItem', itemId, playerId: p.id, targetPlayerId: p.id });
    }
    if (ok) closeModal();
  }

  function openStoryModal() {
    const g = S.game;
    const beat = g?.pendingBeat;
    if (!beat) return;
    mountModal('story', `<div class="story-card">
        <div class="story-kicker">${esc(beat.subtitle || 'NARRATIVE')}</div>
        <h2 class="story-title">${esc(beat.title || '')}</h2>
        <div class="story-body">${esc(beat.body || '').replace(/\n/g, '<br />')}</div>
        <div class="story-actions"><button class="btn btn-primary" data-act="story-continue">继续 →</button></div>
      </div>`, true);
  }

  function ackStory() {
    if (S.busy) return;
    const beatId = S.game?.pendingBeat?.id;
    // 观战时 pendingBeat 是全局共享的：真去 ack 会把房主那张卡也清掉，
    // 而且战斗中 ackBeat 会被回合守卫拒掉。所以观战者只在本地关掉。
    if (spectatorUnit()) {
      if (beatId) S.dismissedBeats.add(beatId);
      closeModal();
      return;
    }
    applyAction({ type: 'ackBeat', beatId });
  }

  function openEndModal() {
    const g = S.game;
    if (!g) return;
    // 胜利先看结局戏。boss3_post 里的二选一会直接把 ending 场景接下去，
    // 等整段放完再回到结算面板——否则面板会压在演员身上。
    if (g.phase === 'victory' && !S.endingSceneDone && storyReady() && !sceneSeen('boss3_post')) {
      S.endingSceneDone = true;
      const retry = () => setTimeout(() => openEndModal(), 60);
      if (playScene('boss3_post', { onEnd: retry })) return;
      S.endingSceneDone = false;
    }
    forgetSession();
    const victory = g.phase === 'victory';
    const avgLevel = g.players.length ? Math.round(g.players.reduce((a, p) => a + p.level, 0) / g.players.length) : 0;
    const endRound = g.combat?.round ?? g.round;
    const roundLabel = g.combat ? '最终战斗轮' : '行动轮';
    const rating = g.rating;
    const review = g.review;
    const unlocks = (rating?.unlockedIds || [])
      .map(id => (S.meta?.unlocks || []).find(u => u.id === id))
      .filter(Boolean);
    const gradeHtml = rating ? `<div class="end-grade grade-${esc(rating.grade)}">
      <div class="eg-head"><b>${esc(rating.grade)}</b><span>${rating.score} 分${g.challenge ? ` · 挑战 ×${(g.challenge.scoreMultiplier || 1).toFixed(2)}` : ''}</span></div>
      <div class="eg-dims">${rating.dimensions.map(d => `<div class="eg-dim" title="${esc(d.note)}">
        <span>${esc(d.label)}</span><i><em style="width:${d.score}%"></em></i><b>${d.score}</b>
      </div>`).join('')}</div>
    </div>` : '';
    const reviewHtml = review ? `<div class="end-review">
      <div class="er-row"><span>${review.victory ? '结局' : '失败阶段'}</span><b>${esc(review.failureStage)}</b></div>
      <div class="er-row"><span>原因</span><b>${esc(review.reason)}</b></div>
      <p class="er-cause">${esc(review.keyCause)}</p>
      <div class="er-grid">
        <div><span>最高伤害技能</span><b>${esc(review.topSkill)}</b></div>
        <div><span>撤退</span><b>${review.retreatSuccess}/${review.retreatAttempts}</b></div>
        <div><span>平均生命</span><b>${review.avgHpPct}%</b></div>
        <div><span>队伍生命</span><b>${review.teamLives}</b></div>
      </div>
      <div class="er-unused"><span>没用上的</span>${(review.unusedResources || []).map(x => `<i>${esc(x)}</i>`).join('')}</div>
      ${(review.mutators || []).length ? `<div class="er-unused"><span>本局变异</span>${review.mutators.map(x => `<i>${esc(x)}</i>`).join('')}</div>` : ''}
      <div class="er-suggest"><b>下局建议</b><p>${esc(review.suggestion)}</p></div>
      ${unlocks.length ? `<div class="er-unlocks"><b>解锁</b>${unlocks.map(u => `<span>${esc(u.name)}</span>`).join('')}</div>` : ''}
    </div>` : '';
    const body = `<div class="end-panel ${victory ? 'victory' : ''}">
      <div class="end-icon">${victory ? '✦' : '✕'}</div>
      <h2>${victory ? '协议终止' : '信号丢失'}</h2>
      <div class="end-sub">${victory ? 'PROTOCOL ZERO // TERMINATED' : (g.defeatedBy || 'MISSION FAILED')}</div>
      ${victory && S.endingChoice ? `<div class="end-ending">${
        S.endingChoice === 'destroy'
          ? '<b>空白记忆</b>被归档者醒来，但失去被保存的那段记忆。城市重新开始。'
          : '<b>残响</b>所有人完整醒来，客星带着副本离开。城市多了一个影子。'
      }</div>` : ''}
      <div class="end-text">${esc(g.outcome || (victory ? '你们做到了。' : `${g.actName || '城市'}把你们归档为已注销。`))}</div>
      ${gradeHtml}
      <div class="end-stats">
        <div><b>R${endRound}</b><span>${roundLabel}</span></div>
        <div><b>${g.memory}</b><span>记忆币</span></div>
        <div><b>${g.teamLives}</b><span>队伍生命</span></div>
        <div><b>${avgLevel}</b><span>平均等级</span></div>
      </div>
      ${reviewHtml}
    </div>`;
    mountModal('end', modalHeader(victory ? '✦' : '✕', victory ? '零号协议 · 终止' : '零号协议 · 失败', victory ? 'THE CITY REMEMBERS' : 'THE CITY FORGETS') +
      `<div class="modal-body">${body}</div>
       <div class="modal-foot">
         <button class="btn btn-ghost" data-act="to-title">回到标题</button>
         <button class="btn btn-primary" data-act="play-again">再来一局</button>
       </div>`, false);
  }

  function playAgain() {
    S.game = null;
    S.selected = [];
    S.modalType = null;
    S.modalCloseable = false;
    $('#modal-root').innerHTML = '';
    showScreen('select-screen');
    renderSelect();
  }

  function openDangerModal(node, onConfirm) {
    const g = S.game;
    const avgLv = g.players.reduce((a, x) => a + (x.level || 1), 0) / Math.max(1, g.players.length);
    S.pendingDanger = onConfirm;
    mountModal('danger', modalHeader('⚠', '高危信号 · ' + node.name, 'THREAT ASSESSMENT') +
      `<div class="modal-body">
        <div class="event-text" style="border-left-color:var(--red)">
          这里的敌人强度明显高于队伍当前水平。队伍平均等级 <b>${avgLv.toFixed(1)}</b>，
          而你只有 Lv.${activePlayer()?.level ?? 1}。硬闯很可能直接减员。
          <br />建议先清理相邻的普通战斗节点升级，再从另一侧绕行。
        </div>
        <div class="event-text" style="margin-top:10px;border-left-color:var(--gold)">
          进入后如果全灭，本轮行动会直接结束。
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-sm btn-ghost" data-act="modal-close">先绕行</button>
        <button class="btn btn-sm btn-danger" data-act="danger-confirm">仍然进入</button>
      </div>`, true);
  }

  function openRestartModal() {
    // 教学没有正式存档，直接回标题即可
    if (S.game?.mode === 'tutorial') { showTitle(); return; }
    if (S.room) {
      mountModal('restart', modalHeader('⇄', '离开联机房间？', 'LEAVE ROOM') +
        `<div class="modal-body"><div class="event-text" style="border-left-color:var(--pink)">离开后你的座位会空出来，队友仍可以继续。对局开始后座位不会重新开放，所以想回来要趁早。</div></div>
         <div class="modal-foot"><button class="btn btn-sm btn-ghost" data-act="modal-close">继续游戏</button><button class="btn btn-sm btn-danger" data-act="leave-room">离开房间</button></div>`, true);
      return;
    }
    mountModal('restart', modalHeader('⟲', '放弃当前行动？', 'ABORT RUN') +
      `<div class="modal-body"><div class="event-text" style="border-left-color:var(--pink)">放弃后当前进度与服务器上的存档会一并删除，无法再继续。确定要断开连接吗？</div></div>
       <div class="modal-foot"><button class="btn btn-sm btn-ghost" data-act="modal-close">继续行动</button><button class="btn btn-sm btn-danger" data-act="restart-confirm">放弃并返回标题</button></div>`, true);
  }

  function restartRun() {
    forgetSession();
    S.game = null;
    S.selected = [];
    S.modalType = null;
    S.modalCloseable = false;
    $('#modal-root').innerHTML = '';
    showScreen('title-screen');
    setServerStatus(S.meta ? true : false);
  }

  /* ── help / modal plumbing ──────────────────────────────────────── */
  function openHelpModal() {
    const body = `<div class="event-text">
      <b style="color:var(--cyan)">目标</b>
      本作包含三幕：霓虹港、镜海穹顶、零号轨道。每一幕都要在电子追踪归零前找到密钥，进入终局节点并击败首领。击败前两幕首领后进入幕间整备，等级、装备、记忆币与队伍生命会保留。

      <b style="color:var(--cyan)">探索</b>
      每名角色每轮有 3 AP。移动到相邻节点消耗 1 AP，与当前节点互动消耗 1 AP。结束回合后切换到下一名角色，并推进追踪时钟。休息消耗 2 AP，恢复 20% 最大 HP。

      <b style="color:var(--cyan)">判定</b>
      事件检定使用 d100 掷骰。目标值为「DC + 属性修正」，属性高于 50 会提高成功率，低于 50 会降低。协助可使下一次战斗命中 +10%。

      <b style="color:var(--cyan)">战斗</b>
      7×5 六边形网格。移动不结束回合；攻击、技能或防御会结束当前单位回合。每个技能消耗 Focus，普通攻击不消耗。终极技能每场战斗一次。护甲减免物理伤害，抗性减免技术伤害，闪避可完全规避非完美攻击。

      <b style="color:var(--cyan)">装备</b>
      武器 / 护甲 / 头盔 / 饰品 / 义体五个槽位。战斗外可在背包中换装。安全屋可用记忆币和合金强化至 +5，不会失败或破碎。套装效果在齐套时生效。
    </div>
    <div class="select-tip"><b>快捷键</b><p><kbd>I</kbd> 随身道具　<kbd>L</kbd> 情报档案　<kbd>H</kbd> 操作说明　<kbd>Tab</kbd> 战斗中切换视角　<kbd>1–4</kbd> 查看队伍成员　<kbd>ESC</kbd> 取消技能选择 / 关闭窗口。</p></div>
    <div class="select-tip" style="margin-top:12px"><b>术语怎么看</b><p>界面里带虚线的词（${window.Glossary?.chip('ap', 'AP') || 'AP'}、${window.Glossary?.chip('focus', 'Focus') || 'Focus'}、${window.Glossary?.chip('tracking', '电子追踪') || '电子追踪'}…）都能点开看解释，不用离开游戏。<br /><button class="btn btn-sm btn-ghost" data-act="glossary-all" style="margin-top:6px">打开完整术语表</button></p></div>
    <div class="select-tip" style="margin-top:12px"><b>战斗特效</b><p>DANGER / MISSION COMPLETE 等字效可以调弱或关闭，不影响战斗信息。<br /><button class="btn btn-sm btn-ghost" data-act="fx-mode" style="margin-top:6px">当前：${{ full: '完整', simple: '简化', off: '关闭' }[window.Fx?.mode?.() || 'full']}（点击切换）</button></p></div>
    <div class="select-tip" style="margin-top:12px"><b>看懂战斗界面</b><p>敌人脚下的「受 X」是<b>当前选中技能</b>对它的一次预估伤害，换技能会实时变。技能卡左侧的大数字是打满多少伤害，右边写着「几次 × 每次多少 · 命中率 · 期望」。数字对不上，通常是护甲/抗性在起作用。</p></div>
    <div class="select-tip" style="margin-top:12px"><b>操作与显示</b>${settingsHtml()}</div>`;
    mountModal('help', modalHeader('?', '操作说明', 'FIELD MANUAL // AGI PROTOCOL 2046') +
      `<div class="modal-body">${body}</div><div class="modal-foot"><button class="btn btn-sm btn-ghost" data-act="modal-close">关闭</button></div>`, true);
  }

  /* ── 0.25 无障碍设置：三条音量 + 减少动效 + 色盲模式 ─────────── */
  const A11Y_KEY = 'agi2046.a11y';

  function a11y() {
    if (!S.a11y) {
      const def = { reduceMotion: false, colorblind: false };
      try { S.a11y = { ...def, ...(JSON.parse(localStorage.getItem(A11Y_KEY) || '{}')) }; }
      catch { S.a11y = def; }
    }
    return S.a11y;
  }

  function applyA11y() {
    const a = a11y();
    document.body.classList.toggle('reduce-motion', !!a.reduceMotion);
    document.body.classList.toggle('cb', !!a.colorblind);
  }

  function toggleA11y(key) {
    const a = a11y();
    a[key] = !a[key];
    try { localStorage.setItem(A11Y_KEY, JSON.stringify(a)); } catch { /* 忽略 */ }
    applyA11y();
    if (S.modalType === 'help') openHelpModal();
  }

  function setVolume(channel, value) {
    window.Sound?.setVolume?.(channel, Number(value) / 100);
    const label = document.querySelector(`[data-vol-label="${channel}"]`);
    if (label) label.textContent = `${value}%`;
  }

  function settingsHtml() {
    const a = a11y();
    const v = window.Sound?.volumes?.() || { sfx: 0.85, ambient: 0.6, ui: 0.7 };
    const row = (key, label) => `<label class="set-vol">
        <span>${label}</span>
        <input type="range" min="0" max="100" step="5" value="${Math.round((v[key] ?? 0) * 100)}"
          data-vol="${key}" aria-label="${label}音量"
          oninput="window.__agiSetVolume('${key}', this.value)" />
        <b data-vol-label="${key}">${Math.round((v[key] ?? 0) * 100)}%</b>
      </label>`;
    return `<div class="set-grid">
        ${row('sfx', '音效')}
        ${row('ambient', '环境音')}
        ${row('ui', '界面音')}
      </div>
      <div class="set-toggles">
        <button class="set-toggle${a.reduceMotion ? ' on' : ''}" data-act="a11y-motion"
          aria-pressed="${a.reduceMotion}">${a.reduceMotion ? '✓' : '○'} 减少动态效果</button>
        <button class="set-toggle${a.colorblind ? ' on' : ''}" data-act="a11y-cb"
          aria-pressed="${a.colorblind}">${a.colorblind ? '✓' : '○'} 色盲友好配色</button>
      </div>
      <p class="mini-label" style="margin-top:6px">减少动效会关掉转场、闪烁与浮动；色盲模式把「有利/危险」从绿红改成蓝橙，并在回合条上补文字标记。</p>`;
  }

  function modalHeader(icon, title, subtitle) {
    return `<div class="modal-head"><div class="mh-icon">${icon}</div><div><h3>${title}</h3><div class="mh-sub">${subtitle}</div></div></div>`;
  }

  /** 弹窗宽度按内容分级：宽表格用 wide，短确认用 narrow，叙述类用默认 780。 */
  const MODAL_SIZE = {
    wide: new Set(['inventory', 'actTransition', 'shop', 'safehouse', 'charpick', 'help']),
    narrow: new Set(['join', 'kick', 'retreat', 'assist', 'bag', 'restart', 'danger', 'combatResult'])
  };

  function mountModal(type, html, closeable) {
    clearDiceLayer();   // 结算弹窗压住"ATTACK //"浮层会很难看
    window.Cine?.clear();   // 弹窗是阻塞信息，过场一律让位（否则横幅会压在幕间卡上）
    const changed = S.modalType !== type;
    S.modalType = type;
    S.modalCloseable = closeable;
    const root = $('#modal-root');
    if (!root) return;
    const size = MODAL_SIZE.wide.has(type) ? 'modal wide' : MODAL_SIZE.narrow.has(type) ? 'modal narrow' : 'modal';
    root.innerHTML = `<div class="modal-backdrop" data-modal-backdrop><div class="${size}">${html}</div></div>`;
    // 右上角关闭：ESC 能用，但鼠标玩家会先找 ×，别让他们猜。
    if (closeable) {
      const head = root.querySelector('.modal-head');
      const modal = root.querySelector('.modal');
      if (modal && !modal.querySelector('.mh-close')) {
        const btn = document.createElement('button');
        btn.className = 'icon-btn mh-close' + (head ? '' : ' modal-float-close');
        btn.setAttribute('data-act', 'modal-close');
        btn.setAttribute('aria-label', '关闭');
        btn.title = '关闭（ESC）';
        btn.innerHTML = '<span class="ui-icon i-close"></span>';
        (head || modal).appendChild(btn);
      }
    }
    if (changed) Sound.sfx(type === 'actTransition' ? 'transition' : 'open');
  }

  function closeModal() {
    clearInterval(S.coopTimer);
    S.coopTimer = null;
    if (S.modalType) Sound.sfx('close');
    S.modalType = null;
    S.modalCloseable = false;
    const root = $('#modal-root');
    if (root) root.innerHTML = '';
  }

  /* ── dice / toasts / formatting ─────────────────────────────────── */
  function chooseActionRoll(data) {
    const combatRoll = data?.combat?.lastPlayerRoll;
    if (combatRoll && rollKey(combatRoll) !== S.lastRollKey) return combatRoll;
    const fallback = data?.lastRoll;
    if (fallback && rollKey(fallback) !== S.lastRollKey && rollKey(fallback) !== rollKey(combatRoll)) return fallback;
    return null;
  }

  function rollKey(r) {
    if (!r) return '';
    return [r.kind, r.label, r.roll, r.target, r.success, r.hits, r.damage,
      (r.dice || []).map(d => `${d.value}:${d.success}`).join('|')].join('/');
  }

  /** 清掉骰子/命中浮层：开新弹窗（尤其是战斗结算）时不能让它留在下面。 */
  function clearDiceLayer() {
    const layer = $('#dice-layer');
    if (!layer) return;
    if (S.diceTimer) clearTimeout(S.diceTimer);
    if (S.revealTimers) S.revealTimers.forEach(t => clearTimeout(t));
    S.revealTimers = [];
    layer.innerHTML = '';
    layer.style.pointerEvents = 'none';
  }

  /** 结算类弹窗压着骰子层会打架：这些弹窗开着时不放骰子动画。 */
  const DICE_BLOCKING_MODALS = new Set(['end', 'combatResult', 'actTransition', 'story', 'quest']);

  /** 群体技能：每个目标各掷一次，但 lastRoll 只保留最后一个目标。
   *  这里把整条轨迹整理成「谁挨了几下、多少伤害」，让面板能说清「不是一次判定打所有人」。 */
  function aoeGroup(data) {
    const list = data?.combat?.lastActions || [];
    const trace = [...list].reverse().find(a => (a.hits || []).length > 1);
    if (!trace) return null;
    const units = data?.combat?.units || [];
    const rows = (trace.hits || []).map(h => {
      const u = units.find(x => x.id === h.targetId);
      return {
        id: h.targetId,
        name: u?.name || h.targetId,
        hits: h.hits || 0,
        damage: h.damage || 0,
        evaded: !!h.evaded,
        downed: !!u?.downed
      };
    });
    return rows.length > 1 ? { count: rows.length, dice: trace.dice || 0, rows } : null;
  }

  /** 同名目标加序号：两个「蜂群」写成「蜂群 ①②」。 */
  function groupLabel(rows, index) {
    const r = rows[index];
    const name = r?.label || r?.name || '';
    const same = rows.filter(x => (x.label || x.name) === (r?.label || r?.name)).length;
    if (same <= 1) return name;
    const nth = rows.slice(0, index + 1).filter(x => (x.label || x.name) === (r?.label || r?.name)).length;
    return `${name} ${'①②③④⑤'[nth - 1] || nth}`;
  }

  function showDice(roll, group) {
    const layer = $('#dice-layer');
    if (!layer || !roll) return;
    if (S.modalType && DICE_BLOCKING_MODALS.has(S.modalType)) return;
    if (S.diceTimer) clearTimeout(S.diceTimer);
    if (S.revealTimers) S.revealTimers.forEach(t => clearTimeout(t));
    S.revealTimers = [];
    Sound.sfx('dice');
    const isAttack = roll.kind === 'attack';
    if (!isAttack) {
      setTimeout(() => {
        if (roll.kind === 'check') Sound.sfx(roll.success ? 'loot' : 'miss');
        else if (roll.damage > 0) Sound.sfx(roll.damage >= 18 ? 'crit' : 'hit');
        else Sound.sfx('miss');
      }, 380);
    }
    const ok = roll.success !== false;
    const cls = ok ? 'success' : 'fail';
    let html = '';
    if (roll.kind === 'check') {
      const dieCls = roll.success ? 'hit' : 'miss';
      html = `<div class="dice-panel check ${cls}">
        <div class="dice-head"><span class="dh-label">D100 CHECK</span><span>${esc(roll.label || '')}</span></div>
        <div class="dice-values"><div class="die d100 ${dieCls}">${roll.roll ?? '—'}</div><div class="die" style="width:auto;padding:0 8px">≤ ${roll.target ?? '—'}</div></div>
        <div class="dice-detail">${roll.success ? '<b>判定成功</b>' : '<b>判定失败</b>'} · ${esc(roll.detail || '')}</div>
      </div>`;
    } else if (isAttack) {
      // 骰子先摆空位，逐颗滚动定格（赛博骰子），全亮后再显示结算文字
      const dice = (roll.dice || []).map((d, i) =>
        `<div class="die pending" data-reveal="${i}" data-value="${d.value}" data-hit="${d.success ? 1 : 0}">·</div>`).join('');
      html = `<div class="dice-panel ${cls}">
        <div class="dice-head"><span class="dh-label">ATTACK // ${esc(roll.skillName || roll.label || '')}</span><span>${esc(roll.attackerName || '')} → ${esc(roll.targetName || '')}</span></div>
        <div class="dice-values">${dice || '<div class="die miss">—</div>'}</div>
        <div class="dice-detail" style="opacity:0">${esc(roll.detail || '')}${roll.damage > 0 && !/伤害|damage/i.test(roll.detail || '') ? ` · 伤害 <b>${roll.damage}</b>` : ''}</div>
        ${group ? `<div class="dice-group">
          <div class="dg-head">群体判定 · ${group.count} 个目标 · 每个目标独立掷 ${group.dice || roll.dice?.length || 1} 骰</div>
          ${group.rows.map((r, i) => `<div class="dg-row${r.damage > 0 ? ' hit' : ' miss'}">
            <span>${esc(groupLabel(group.rows, i))}</span>
            <b>${r.evaded ? '闪避' : (r.hits > 0 ? `命中 ${r.hits}` : '未命中')}</b>
            <em>${r.damage > 0 ? `-${r.damage}` : '0'}</em>
          </div>`).join('')}
          <div class="dg-note">上面的骰子是最后一个目标的；其余目标各自结算。</div>
        </div>` : ''}
      </div>`;
    } else {
      html = `<div class="dice-panel ${cls}">
        <div class="dice-head"><span class="dh-label">${esc(roll.label || 'ACTION')}</span><span>${esc(roll.attackerName || '')}</span></div>
        <div class="dice-detail" style="margin-top:8px">${esc(roll.detail || '行动完成。')}</div>
      </div>`;
    }
    layer.innerHTML = html;
    layer.style.pointerEvents = 'auto';
    layer.onclick = () => { layer.innerHTML = ''; layer.style.pointerEvents = 'none'; };
    S.diceTimer = setTimeout(() => {
      layer.innerHTML = '';
      layer.style.pointerEvents = 'none';
    }, isAttack ? Math.max(4200, 1200 + (roll.dice || []).length * 160) : 4200);
    if (isAttack) revealDice(layer, roll);
  }

  /* 赛博骰子：每颗先乱数滚动，再定格成真实结果；全部亮完才出结算文字 */
  function revealDice(layer, roll) {
    const cells = [...layer.querySelectorAll('.die[data-reveal]')];
    const detail = layer.querySelector('.dice-detail');
    if (!cells.length) return;
    let settled = 0;
    const step = cells.length > 5 ? 110 : 140;
    const spin = 240;
    cells.forEach((cell, i) => {
      const start = setTimeout(() => {
        cell.classList.add('rolling');
        const tick = setInterval(() => {
          cell.textContent = String(1 + Math.floor(Math.random() * 100));
        }, 42);
        const settle = setTimeout(() => {
          clearInterval(tick);
          cell.classList.remove('rolling');
          cell.classList.add(cell.dataset.hit === '1' ? 'hit' : 'miss');
          cell.classList.remove('pending');
          cell.textContent = cell.dataset.value;
          Sound.sfx('click');
          settled++;
          if (settled === cells.length) {
            if (detail) {
              detail.style.transition = 'opacity .18s';
              detail.style.opacity = '1';
            }
            const dmg = roll.damage || 0;
            Sound.sfx(dmg > 0 ? (dmg >= 18 ? 'crit' : 'hit') : 'miss');
          }
        }, spin);
        S.revealTimers.push(settle);
      }, 120 + i * step);
      S.revealTimers.push(start);
    });
  }

  function toast(message, kind = 'info', duration = 3200) {
    const layer = $('#toast-layer');
    if (!layer || !message) return;
    const div = document.createElement('div');
    div.className = `toast ${kind}`;
    div.textContent = message;
    layer.appendChild(div);
    setTimeout(() => {
      div.classList.add('leave');
      setTimeout(() => div.remove(), 220);
    }, duration);
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function rarityClass(rarity) {
    return `rarity-${RARITY_CLASS[rarity] || 'common'}`;
  }

  /**
   * 换装预览：这件换上去，哪些数值会变、变多少。
   * 以前只能看两件装备的绝对值自己心算，这里是"相对当前装备"的差。
   */
  function gearDeltaText(current, next) {
    const parts = [];
    const num = (it, k) => (it && typeof it[k] === 'number' ? it[k] : 0);
    const flat = [
      ['armor', '护甲'], ['resistance', '抗性'], ['evasion', '闪避'],
      ['hp', 'HP'], ['focus', 'Focus'], ['accuracyBonus', '命中'],
      ['damageBonus', '伤害'], ['movement', '移动']
    ];
    for (const [k, label] of flat) {
      const d = num(next, k) - num(current, k);
      if (d) parts.push(`${label} ${d > 0 ? '+' : ''}${d}`);
    }
    for (const k of STAT_KEYS) {
      const key = k.toLowerCase();
      const d = num(next?.stats, key) - num(current?.stats, key);
      if (d) parts.push(`${k} ${d > 0 ? '+' : ''}${d}`);
    }
    if ((next?.slot || current?.slot) === 'Weapon') {
      const w = it => (it ? `${it.dice || 0}×${it.damagePerDie || 0} 命中${it.accuracy || 0}%` : '空手');
      if (w(current) !== w(next)) parts.unshift(`武器 ${w(current)} → ${w(next)}`);
    }
    return parts;
  }

  function gearDeltaHtml(current, next) {
    const parts = gearDeltaText(current, next);
    if (!parts.length) return '<div class="gear-delta same">与当前相同</div>';
    return `<div class="gear-delta">${parts.map(p => {
      const cls = / \+\d/.test(p) ? 'up' : (/ -\d/.test(p) ? 'down' : 'flat');
      return `<span class="${cls}">${esc(p)}</span>`;
    }).join('')}</div>`;
  }

  /** 背包里的一件装备（带换装预览）。背包面板和幕间换装共用同一份。 */
  function bagItemHtml(player, item) {
    const cur = player.equipment?.[item.slot] || null;
    return `<div class="inv-item">
      <span class="ii-name ${rarityClass(item.rarity)}">${esc(item.name)} ${esc(item.levelText || '')}<br><span class="es-stats">${gearSummary(item).join(' · ')}</span></span>
      <div class="ii-side">
        ${gearDeltaHtml(cur, item)}
        <button class="btn btn-ghost" data-act="equip" data-player-id="${esc(player.id)}" data-item-id="${esc(item.instanceId)}" ${S.busy ? 'disabled' : ''}>装备</button>
      </div>
    </div>`;
  }

  function gearSummary(item) {
    if (!item) return [];
    const out = [];
    if (item.slot === 'Weapon') {
      out.push(`伤害 ${item.dice || 0}×${item.damagePerDie || 0}`);
      out.push(`命中 ${item.accuracy || 0}%`);
      out.push(`射程 ${item.range || 1}`);
      if (item.damageType) out.push(item.damageType === 'tech' ? '技术' : '物理');
    }
    if (item.armor) out.push(`护甲 +${item.armor}`);
    if (item.resistance) out.push(`抗性 +${item.resistance}`);
    if (item.evasion) out.push(`闪避 +${item.evasion}%`);
    if (item.hp) out.push(`HP +${item.hp}`);
    if (item.focus) out.push(`Focus +${item.focus}`);
    if (item.accuracyBonus) out.push(`命中 +${item.accuracyBonus}%`);
    if (item.damageBonus) out.push(`伤害 +${item.damageBonus}`);
    if (item.movement) out.push(`移动 +${item.movement}`);
    const stats = item.stats || {};
    for (const k of STAT_KEYS) {
      const v = stats[k.toLowerCase()];
      if (v) out.push(`${k} ${v > 0 ? '+' : ''}${v}`);
    }
    if (item.setId) out.push(`套装 ${gearSetName(item.setId)}`);
    const trait = itemTrait(item);
    if (trait) out.push(`特性 ${trait.name}：${trait.desc}`);
    return out.length ? out : ['无附加属性'];
  }

  function gearTrait(id) {
    if (!id) return null;
    if (!S.traitsById) S.traitsById = new Map((S.meta?.gearTraits || []).map(t => [t.id, t]));
    return S.traitsById.get(id) || null;
  }

  /** 物品实例只存 itemId，特性挂在装备定义上。 */
  function itemTrait(item) {
    if (!item?.itemId) return null;
    const def = S.gearById?.get(item.itemId);
    return gearTrait(def?.traitId);
  }

  /** 角色身上生效 / 待机的装备特性。最多 3 条生效，其余如实标出来。 */
  function playerTraits(player) {
    const order = ['Weapon', 'Armor', 'Helmet', 'Trinket', 'Cyberware'];
    const all = [];
    for (const slot of order) {
      const item = player.equipment?.[slot];
      const t = itemTrait(item);
      if (t) all.push({ slot, trait: t });
    }
    const limit = S.meta?.gearTraitLimit ?? 3;
    return { active: all.slice(0, limit), dormant: all.slice(limit) };
  }

  function traitChipsHtml(player) {
    const { active, dormant } = playerTraits(player);
    if (!active.length && !dormant.length) return '';
    return `<div class="trait-chips">
      ${active.map(x => `<span class="trait-chip" title="${esc(x.trait.desc || '')}">${esc(x.trait.name)}</span>`).join('')}
      ${dormant.map(x => `<span class="trait-chip dormant" title="同时最多 3 条特性生效，这条要等前面的换下来">待机 · ${esc(x.trait.name)}</span>`).join('')}
    </div>`;
  }

  function gearSetName(setId) {
    return S.gearSetsById?.get(setId)?.name || setId;
  }

  function setProgressHtml(player) {
    const counts = new Map();
    for (const item of Object.values(player.equipment || {})) {
      if (item?.setId) counts.set(item.setId, (counts.get(item.setId) || 0) + 1);
    }
    if (!counts.size) return '<div class="mini-label">未装备套装件。</div>';
    return [...counts.entries()].map(([id, count]) => {
      const set = S.gearSetsById?.get(id);
      if (!set) return '';
      const tiers = set.tiers || [];
      const max = tiers.length ? Math.max(...tiers.map(t => t.pieces)) : count;
      const next = tiers.filter(t => count < t.pieces).sort((a, b) => a.pieces - b.pieces)[0];
      return `<div class="set-status">
        <div class="set-head"><b>${esc(set.name)}</b><span>${count}/${max}</span></div>
        <div class="set-tiers">${tiers.map(t => `<span class="${count >= t.pieces ? 'on' : ''}">${t.pieces}件 · ${esc(t.text)}</span>`).join('')}</div>
        <div class="set-next ${next ? '' : 'done'}">${next ? `再装备 ${next.pieces - count} 件激活下一档` : '套装已完全激活'}</div>
      </div>`;
    }).join('');
  }

  function hexDistance(c1, r1, c2, r2) {
    const a = cube(c1, r1);
    const b = cube(c2, r2);
    return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
  }

  function cube(col, row) {
    const x = col - ((row - (row & 1)) / 2);
    const z = row;
    return [x, -x - z, z];
  }

  // 3D 战斗层拾取：交回既有战斗逻辑（必须在 IIFE 内，才能访问 handleHexClick / handleUnitClick）
  // 只读调试接口：给 e2e / 自动化用，不改变任何状态。
  // 3D 战斗没有 DOM 单位标记，脚本只能靠它判断"哪些目标现在真的能打"。
  window.__agiSetVolume = (channel, value) => setVolume(channel, value);

  window.__agi = {
    state: () => S.game,
    combatSkill: () => S.combatSkill,
    activeUnit: () => combatActiveUnit(),
    reachable: () => (S.game?.combat?.reachable || []),
    targetable: () => {
      const c = S.game?.combat;
      const active = combatActiveUnit();
      if (!c || !active) return [];
      return targetableUnits(c, active, selectedCombatSkill()).map(u => u.id);
    },
    // 0.20：首局解释的触发条件与渲染，给 tools/ui/tutorial-flow.mjs 断言用
    explainKey: (fake) => nextExplainKey(fake),
    openExplain: (key) => openExplainModal(key),
    goal: () => S.game?.objectives || null,
    // 0.21：给 e2e 在批量推进后同步页面状态（不改变规则）
    refresh: () => refreshState(false),
    applyA11y,
    // 0.25：给 UI 测试直接渲染多人事件弹层（不改变服务端状态）
    // 只给 UI 测试用：把服务端刚返回的状态塞回页面并重绘（不写回服务端）
    adopt: (next) => {
      if (!next) return false;
      S.game = next;
      renderTopbar();
      renderParty();
      renderMap();
      renderIntel();
      syncModals();
      return true;
    },
    openCoop: () => openCoopModal(),
    // 只给 UI 测试用：直接渲染骰子面板（不改规则状态）
    showDice,
    openBossPreview,
    // 0.23：只改本地副本再重绘，用来断言「有后果 / 有关系」时的界面。
    // 服务端才是权威，这里不动任何规则状态，刷新就会被覆盖。
    preview: (patch) => {
      if (!S.game) return false;
      S.game = { ...S.game, ...(patch || {}) };
      renderIntel();
      renderTopbar();
      if (S.game.combat) renderCombat();
      return true;
    }
  };

  window.addEventListener('battle3d-pick', (ev) => {
    const d = ev.detail || {};
    if (d.kind === 'unit' && d.unitId) handleUnitClick(d.unitId);
    else if (d.kind === 'hex') handleHexClick(d.col, d.row);
  });
})();

/* ── 地图缩放 / 拖拽（拉近看细节） ───────────────────────────── */
(function initMapZoom() {
  const viewport = document.getElementById('map-viewport');
  const canvas = document.getElementById('map-canvas');
  if (!viewport || !canvas) return;
  let scale = 1.24;
  let tx = 0;
  let ty = 0;
  let dragging = false;
  let sx = 0;
  let sy = 0;
  let ox = 0;
  let oy = 0;

  const apply = () => {
    canvas.style.transformOrigin = '0 0';
    canvas.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  };

  // 边界：别把地图拖出视口（缩放后 canvas 可能比视口小）
  const clamp = () => {
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const cw = canvas.offsetWidth * scale;
    const ch = canvas.offsetHeight * scale;
    tx = cw <= vw ? (vw - cw) / 2 : Math.min(0, Math.max(vw - cw, tx));
    ty = ch <= vh ? (vh - ch) / 2 : Math.min(0, Math.max(vh - ch, ty));
  };

  // 把某个节点放到视口中心（手机换人/移动后调用）
  const centerOn = (el) => {
    if (!el) return;
    const vr = viewport.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    tx += (vr.left + vr.width / 2) - (er.left + er.width / 2);
    ty += (vr.top + vr.height / 2) - (er.top + er.height / 2);
    clamp();
    apply();
  };

  const zoomBy = (dir) => {
    const next = Math.min(2.2, Math.max(0.7, scale * (dir > 0 ? 1.18 : 0.85)));
    const vr = viewport.getBoundingClientRect();
    const mx = vr.width / 2;
    const my = vr.height / 2;
    tx = mx - (mx - tx) * (next / scale);
    ty = my - (my - ty) * (next / scale);
    scale = next;
    clamp();
    apply();
  };

  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const next = Math.min(2.2, Math.max(0.65, scale * (e.deltaY > 0 ? 0.92 : 1.08)));
    // 以鼠标位置为缩放中心
    tx = mx - (mx - tx) * (next / scale);
    ty = my - (my - ty) * (next / scale);
    scale = next;
    apply();
  }, { passive: false });

  viewport.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.map-node')) return;
    dragging = true;
    sx = e.clientX;
    sy = e.clientY;
    ox = tx;
    oy = ty;
    viewport.classList.add('dragging');
    viewport.setPointerCapture?.(e.pointerId);
  });
  viewport.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    tx = ox + (e.clientX - sx);
    ty = oy + (e.clientY - sy);
    apply();
  });
  const stop = () => {
    dragging = false;
    viewport.classList.remove('dragging');
  };
  viewport.addEventListener('pointerup', stop);
  viewport.addEventListener('pointercancel', stop);

  viewport.addEventListener('dblclick', () => {
    scale = 1.24;
    tx = 0;
    ty = 0;
    apply();
  });

  apply();
  window.MapView = { centerOn, zoomBy, reset: () => { scale = 1.24; tx = 0; ty = 0; apply(); } };
})();
