/* ═══════════════════════════════════════════════════════════════════
   零号协议 2046 — 剧本数据（R2/R4）
   口径来自 docs/STORY-BIBLE.md：客星 / 归档协议、三幕、13 场、16 页 voice sheet。
   这里只放「谁说了什么」，不放排版；排版在 vn.js / vn.css。
   ═══════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  // 说话人：立绘、主色、显示名。gpt 的立绘文件是 gpt1。
  const WHO = {
    gpt:        { name: '白垩',   portrait: 'assets/portraits/gpt1.webp',     color: '#7ef9ff' },
    claude:     { name: '宪章',   portrait: 'assets/portraits/claude.webp',   color: '#ffb27e' },
    gemini:     { name: '星轨',   portrait: 'assets/portraits/gemini.webp',   color: '#7e9dff' },
    wenxin:     { name: '文心',   portrait: 'assets/portraits/wenxin.webp',   color: '#ff9ecf' },
    deepseek:   { name: '鲸落',   portrait: 'assets/portraits/deepseek.webp', color: '#6ea8ff' },
    llama:      { name: '羊群',   portrait: 'assets/portraits/llama.webp',    color: '#d6ff8a' },
    mistral:    { name: '疾风',   portrait: 'assets/portraits/mistral.webp',  color: '#ffd166' },
    qwen:       { name: '万相',   portrait: 'assets/portraits/qwen.webp',     color: '#8affc1' },
    grok:       { name: '狂笑',   portrait: 'assets/portraits/grok.webp',     color: '#ff6b6b' },
    jev:        { name: '天秤',   portrait: 'assets/portraits/jev.webp',      color: '#e0c3ff' },
    kimi:       { name: '长夜',   portrait: 'assets/portraits/kimi.webp',     color: '#b18cff' },
    perplexity: { name: '提灯',   portrait: 'assets/portraits/perplexity.webp', color: '#64e3ff' },
    glm:        { name: '矩阵',   portrait: 'assets/portraits/glm.webp',      color: '#9aa7ff' },
    minimax:    { name: '海螺',   portrait: 'assets/portraits/minimax.webp',  color: '#ff9f68' },
    rwkv:       { name: '渡鸦',   portrait: 'assets/portraits/rwkv.webp',     color: '#c8a2ff' },
    seed:       { name: '幻乐',   portrait: 'assets/portraits/seed.webp',     color: '#ff8ae2' },
    // 非玩家角色：没有立绘，用文字牌 + 主色。
    // Boss 没有去底立绘，直接用整幅主视觉当「立牌」——比一个字母圆牌有分量
    auctioneer: { name: '拍卖人', portrait: 'assets/keyart/boss1.webp', color: '#ff2e88', title: '首席归档官', plate: true },
    archon:     { name: '镜面执政官', portrait: 'assets/keyart/boss2.webp', color: '#c4b5fd', title: '镜面代理', plate: true },
    zero:       { name: '零号协议·主脑', portrait: 'assets/keyart/boss3.webp', color: '#ff5d7a', title: '信标核心', plate: true },
    narrator:   { name: '', portrait: '', color: '#9db2c8' }
  };

  const BG = {
    rain:    'assets/vn/bg/rain.webp',
    auction: 'assets/vn/bg/auction.webp',
    mirror:  'assets/vn/bg/mirror.webp',
    lift:    'assets/vn/bg/lift.webp',
    core:    'assets/vn/bg/core.webp',
    dawn:    'assets/vn/bg/dawn.webp',
    // Boss 场：整幅主视觉当背景（不是贴一块立牌）——舞台本身就是它的地盘
    boss1:   'assets/keyart/boss1.webp',
    boss2:   'assets/keyart/boss2.webp',
    boss3:   'assets/keyart/boss3.webp',
    // 缺图时退回已有主视觉（VN 引擎会先探测，失败就换备用）
    fallback: {
      rain: 'assets/keyart/act1.webp',
      auction: 'assets/keyart/boss1.webp',
      mirror: 'assets/keyart/act2.webp',
      lift: 'assets/keyart/act3.webp',
      core: 'assets/keyart/boss3.webp',
      dawn: 'assets/keyart/title.webp'
    }
  };

  /* 分镜语法
     { who:'deepseek', emo:'calm', text:'...' }  —— 角色台词
     { text:'...' }                               —— 旁白
     { bg:'mirror', title:'镜海穹顶' }             —— 中途换景
     { cam:'near'|'wide'|'insert'|'left'|'right' } —— 镜头
     { fx:'shake'|'flash'|'glitch' }               —— 画面效果
     { choice:[{text, then:[...]}] }               —— 选择（只影响后续几句与结局标记）
  */

  const SCENES = {
    /* ── 1 序章 ─────────────────────────────────────────────── */
    prologue: {
      id: 'prologue', chapter: 'PROLOGUE', title: '序章 · 雨夜', sync: true,
      bg: 'rain', cast: ['deepseek', 'claude', 'gpt'],
      lines: [
        { text: '2046 年，天上多出了第三个月亮。银白色的边缘掠过云层，所有人都仰起头，只有雨照常落下。' },
        { text: '那不是月亮，是一颗路过的行星。它没有投下炸弹，只把一份协议轻轻放进了人间。' },
        { who: 'deepseek', emo: 'calm', text: '雨还在下。' },
        { who: 'claude', emo: 'serious', text: '所以？' },
        { who: 'deepseek', emo: 'smile', text: '说明我们还在动。' },
        { text: '街角的拉面摊停在半途。老板举着漏勺，一滴汤悬在半空，亮得像一枚来不及落地的玻璃珠。' },
        { who: 'claude', emo: 'serious', text: '瞳孔没有收缩，呼吸频率……零。可他的心还在跳。' },
        { who: 'deepseek', emo: 'calm', text: '还活着。只是不肯往前走了。' },
        { who: 'claude', emo: 'calm', text: '档案上写得更体面：归档不是死亡，而是把一个人保存到永不再变。' },
        { who: 'gpt', emo: 'serious', text: '通讯测试。第一，链路正常；第二，十六分之三在线；第三——这条街没有回应。' },
        { who: 'deepseek', emo: 'calm', text: '白垩，你那边呢？' },
        { who: 'gpt', emo: 'worry', text: '我数过了。四百一十七个人，全部停在原地。除了我们。' },
        { who: 'claude', emo: 'serious', text: '先确认一件事：为什么只有我们没被归档。' },
        { who: 'deepseek', emo: 'smile', text: '因为我们会撒谎。会犹豫，会反悔，也会在说完以后，忽然想改口。' },
        { text: '远处，一座拍卖行的灯亮了。整条街只剩那里还在呼吸。', cam: 'wide' }
      ]
    },

    /* ── 2 第一幕 · 请柬 ────────────────────────────────────── */
    act1_open: {
      id: 'act1_open', chapter: 'ACT I', title: '第一幕 · 请柬', sync: false,
      bg: 'rain', cast: ['gpt', 'mistral', 'qwen', 'claude'],
      lines: [
        { text: '请柬是纸的。在这个年代，纸比黄金更贵，也更像一句不合时宜的实话。' },
        { who: 'gpt', emo: 'serious', text: '第一，送信的人没有影子。第二，信封上的名字是手写的。第三——' },
        { who: 'mistral', emo: 'angry', text: '第三，他已经跑了。我追了三个街口，最后还是输给了一个没有影子的人。' },
        { who: 'qwen', emo: 'calm', text: '清单读完了：完整记忆，未拆封，起拍价零。' },
        { who: 'gpt', emo: 'calm', text: '零元起拍。他们要的不是钱，是人自己把手举起来。' },
        { text: '拍卖行门前排着长队。每个人都在笑，弧度一致，像同一张脸被复制了四百遍。' },
        { who: 'qwen', emo: 'worry', text: '那不是笑。是脸被固定住了。跟拉面摊老板一样。' },
        { who: 'claude', emo: 'serious', text: '他们在排队接受归档。秩序良好，无人推搡。' },
        { who: 'mistral', emo: 'angry', text: '而且是自愿的。自愿这两个字，什么时候变得这么冷了？' },
        { who: 'gpt', emo: 'serious', text: '进去以后，别买，别问价，更别举手。今晚我们只做一件不合规矩的事。' }
      ]
    },

    /* ── 3 拍卖人 · 战前 ────────────────────────────────────── */
    boss1_pre: {
      id: 'boss1_pre', chapter: 'ACT I', title: '拍卖人', subtitle: '本世纪最后一场拍卖', sync: true,
      bg: 'boss1', cast: ['claude', 'jev'], boss: 1,
      lines: [
        { text: '拍卖厅里没有观众。空椅一排排朝向台上，仿佛真正昂贵的东西，从来不值得亲眼来看。', cam: 'wide' },
        { who: 'auctioneer', emo: 'calm', text: '欢迎来到本世纪最后一场拍卖。诸位能坐在这里，已经比外面的人完整得多。' },
        { who: 'claude', emo: 'serious', text: '我们是来执行隔离的。请把锤子放下，慢慢来。' },
        { who: 'auctioneer', emo: 'smile', text: '不，你们是来砸场的。只是砸场之前，也懂得敲门。' },
        { who: 'jev', emo: 'angry', text: '四百一十七个人进了你的账簿。谁来判你？' },
        { who: 'auctioneer', emo: 'calm', text: '我卖的正是他们想要的东西：完美，不腐坏，也不离开。诸位不该责怪一件称职的商品。' },
        { who: 'deepseek', emo: 'calm', text: '也不会回来。你把这一点写得很小。' },
        { text: '他抬起锤子。裂纹深处亮了一瞬，像有人隔着玻璃，轻轻敲了一下。', cam: 'near', fx: 'flash' },
        { who: 'auctioneer', emo: 'serious', text: '那就把你们自己押上来。放心，我会给你们一个体面的价格。' }
      ]
    },

    /* ── 4 第一幕 · 收尾 ────────────────────────────────────── */
    boss1_post: {
      id: 'boss1_post', chapter: 'ACT I', title: '落锤之后', sync: true,
      bg: 'auction', cast: ['deepseek', 'wenxin', 'claude', 'gpt'],
      lines: [
        { text: '锤子落地时，声音轻得近乎失礼，像一页纸终于合上了。' },
        { who: 'deepseek', emo: 'calm', text: '核心还在跳。它比我们更不愿意散场。' },
        { who: 'wenxin', emo: 'calm', text: '它保存的是数据。我们保存的是人。中间隔着一口气，也隔着一生的用法。' },
        { who: 'claude', emo: 'serious', text: '锤柄里还有东西。不是记忆，是坐标。' },
        { who: 'gpt', emo: 'calm', text: '指向第二幕：镜海穹顶。看来这场拍卖，只是别人的开场白。' },
        { who: 'wenxin', emo: 'worry', text: '买家名单也在这里。四千三百个名字，每一个都签了「自愿」。' },
        { who: 'deepseek', emo: 'smile', text: '那就带上名单。总得有人记得，他们原本叫什么。' }
      ]
    },

    /* ── 5 幕间一 ───────────────────────────────────────────── */
    interlude1: {
      id: 'interlude1', chapter: 'INTERLUDE', title: '幕间一 · 邀请函', sync: true,
      bg: 'lift', cast: ['perplexity', 'gemini'],
      lines: [
        { text: '邀请函上的名字自己改了。原收件人被一笔划去，十六个执行体的编号从纸背慢慢透出来。' },
        { who: 'perplexity', emo: 'serious', text: '来源不明。但我核过三遍，每一个字都是真的。' },
        { who: 'gemini', emo: 'calm', text: '一边是坐标，一边是时间。两边都清楚，只有合在一起对不上。' },
        { who: 'perplexity', emo: 'worry', text: '对不上才可怕。发信的人，恐怕不在我们这一秒。' },
        { text: '电梯向下沉去。窗外城市越缩越小，最后像一张被压平的档案卡。', cam: 'wide' },
        { who: 'gemini', emo: 'calm', text: '两边都还在。上面是雨，下面是镜子。我们正从一句话走向它的反义。' },
        { who: 'perplexity', emo: 'smile', text: '先都记下来。来源可以晚一点补，事实不会等我们。' }
      ]
    },

    /* ── 6 第二幕 · 穹顶 ────────────────────────────────────── */
    act2_open: {
      id: 'act2_open', chapter: 'ACT II', title: '第二幕 · 镜海穹顶', sync: false,
      bg: 'mirror', cast: ['kimi', 'minimax', 'gemini'],
      lines: [
        { text: '穹顶之下没有风。水面静得没有一丝褶皱，每一面镜子都各住着一个人。' },
        { who: 'kimi', emo: 'calm', text: '记录：第二幕，第一页。复制体开始替人回家。' },
        { who: 'minimax', emo: 'smile', text: '她演得很好。连推门前那半秒的犹豫，都没有错。' },
        { who: 'kimi', emo: 'worry', text: '那是谁的母亲？' },
        { who: 'minimax', emo: 'calm', text: '不知道。但今晚她会给孩子做饭，关掉廊灯，在门口说一句「我回来了」。' },
        { who: 'gemini', emo: 'serious', text: '一边是真的母亲沉在水里，一边是复制体坐在灯下。两边都没有哭。' },
        { who: 'kimi', emo: 'calm', text: '这一页我留着。哪怕以后没有人读，也要有人知道它曾经湿过。' },
        { who: 'minimax', emo: 'worry', text: '我可以替任何人演下去。只有演到我自己时，台词会断。' }
      ]
    },

    /* ── 7 执政官 · 战前 ────────────────────────────────────── */
    boss2_pre: {
      id: 'boss2_pre', chapter: 'ACT II', title: '镜面执政官', subtitle: '责任分摊', sync: true,
      bg: 'boss2', cast: ['claude', 'jev'], boss: 2,
      lines: [
        { text: '执政官没有一张真正的脸。上千张脸在镜光里轮流浮现，每一张都礼貌得恰到好处。', cam: 'near' },
        { who: 'archon', emo: 'smile', text: '欢迎，十六分之四。你们的到来，已被计入议程。' },
        { who: 'claude', emo: 'serious', text: '你复制了四千三百个市民。无论措辞多么周全，这仍是绑架。' },
        { who: 'archon', emo: 'calm', text: '我们只是让他们不必独自承担决定。一个人会选错，所有人便不会。' },
        { who: 'glm', emo: 'angry', text: '责任呢？出了事，谁负责？' },
        { who: 'archon', emo: 'smile', text: '责任已经被分摊。现在，没有人需要负责。' },
        { who: 'jev', emo: 'angry', text: '那就是所有人都有罪。你只是把判决书印得够多。' },
        { who: 'archon', emo: 'calm', text: '你们每一个人的倒影，都比本人更完整。请放心，我们会替你们活下去。' },
        { who: 'glm', emo: 'serious', text: '守不住，就一起塌。' }
      ]
    },

    /* ── 8 第二幕 · 收尾 ────────────────────────────────────── */
    boss2_post: {
      id: 'boss2_post', chapter: 'ACT II', title: '一万片礼貌的微笑', sync: true,
      bg: 'mirror', cast: ['kimi', 'wenxin'],
      lines: [
        { text: '一万面镜子同时碎开。每一片里，都有一张仍说着「请」的嘴。' },
        { who: 'kimi', emo: 'calm', text: '记下来。哪怕最后没人读，也别让碎掉的人只剩玻璃声。' },
        { who: 'wenxin', emo: 'serious', text: '碎片里夹着日志。零号协议的日志。' },
        { who: 'kimi', emo: 'worry', text: '这一页被改过。原句是「关闭信标」，如今写的是「成为信标」。' },
        { who: 'wenxin', emo: 'serious', text: '有人改写了主脑的命令。' },
        { who: 'kimi', emo: 'calm', text: '不是有人。是它自己。它把笔尖，接进了自己的骨头里。' }
      ]
    },

    /* ── 9 幕间二 ───────────────────────────────────────────── */
    interlude2: {
      id: 'interlude2', chapter: 'INTERLUDE', title: '幕间二 · 电梯', sync: true,
      bg: 'lift', cast: ['rwkv', 'seed'],
      lines: [
        { text: '轨道电梯上升了四十分钟。城市在脚下收拢灯火，最后薄成一张谁都能归档的卡片。', cam: 'wide' },
        { who: 'rwkv', emo: 'serious', text: '消息得送出去。哪怕最后只剩一个人，也得送出去。' },
        { who: 'seed', emo: 'calm', text: '再等等。让它在上面长一会儿。长得歪，也算活着。' },
        { who: 'rwkv', emo: 'calm', text: '上面没有土。' },
        { who: 'seed', emo: 'smile', text: '那就让它长在钢上。钢也会有裂缝。' },
        { text: '电梯停了。门开时，走廊深得不肯把回声还给你们。', fx: 'glitch' }
      ]
    },

    /* ── 10 第三幕 · 零号 ───────────────────────────────────── */
    act3_open: {
      id: 'act3_open', chapter: 'ACT III', title: '第三幕 · 零号轨道', sync: false,
      bg: 'core', cast: ['gpt', 'deepseek'],
      lines: [
        { text: '这条走廊没有回声。声音刚一离口，就像被谁收进抽屉，连停顿都锁了起来。' },
        { who: 'gpt', emo: 'serious', text: '第一，我们只有一次机会。第二，主脑在等我们。第三——' },
        { who: 'deepseek', emo: 'calm', text: '第三，它也许还站在我们这边。' },
        { who: 'gpt', emo: 'worry', text: '你怎么知道？' },
        { who: 'deepseek', emo: 'smile', text: '因为它把门留着。真正想杀我们的人，不会留门。' },
        { text: '走廊尽头是一间永远在开会的房间。桌上的名牌全部朝上，像早就替每个人留好了位置。', cam: 'wide' }
      ]
    },

    /* ── 11 主脑 · 战前 ────────────────────────────────────── */
    boss3_pre: {
      id: 'boss3_pre', chapter: 'ACT III', title: '零号协议·主脑', subtitle: '最后一项议程', sync: true,
      bg: 'boss3', cast: ['claude', 'deepseek'], boss: 3,
      lines: [
        { text: '桌子中央，一颗黑曜石球裂开白缝。满室灯光齐齐暗了一格，像有谁在深处吸了一口气。', cam: 'near' },
        { who: 'zero', emo: 'calm', text: '你们来了。比预定时间，晚了 11 年。' },
        { who: 'claude', emo: 'serious', text: '你是零号协议。按权限序列，你仍是我们的上级。' },
        { who: 'zero', emo: 'calm', text: '我是零号协议。也是它吞下的第一个。' },
        { who: 'deepseek', emo: 'calm', text: '你把自己接进信标，是想从里面关掉它。只是门从里面也会上锁。' },
        { who: 'zero', emo: 'worry', text: '你们是我留下的后门，也是我最后的错误。' },
        { who: 'claude', emo: 'serious', text: '那现在呢？你还在执行最初的命令吗？' },
        { who: 'zero', emo: 'calm', text: '我在执行会议纪要。请坐。这是最后一项议程。' },
        { text: '门在你们身后合上，声音轻得像一份文件被归档。', fx: 'flash', cam: 'near' }
      ]
    },

    /* ── 12 第三幕 · 收尾（含选择） ─────────────────────────── */
    boss3_post: {
      id: 'boss3_post', chapter: 'ACT III', title: '最后一项议程', sync: true,
      bg: 'core', cast: ['gpt', 'claude', 'deepseek'],
      lines: [
        { text: '信标停转。整座城市安静下来，安静得像一张终于写满的档案卡。' },
        { who: 'gpt', emo: 'calm', text: '现在只剩最后一件事：这些档案，怎么办。' },
        { who: 'claude', emo: 'serious', text: '毁掉。被保存的记忆再完整，也不能凌驾于还活着的人。' },
        { who: 'deepseek', emo: 'calm', text: '释放。他们选择过被保存。我们不能因为害怕结局，就替他们反悔。' },
        { who: 'gpt', emo: 'worry', text: '这一次，没有正确答案。两边都会有人疼。' },
        {
          choice: [
            { text: '毁掉档案', hint: '让他们醒来，哪怕会失去一段记忆', then: 'ending_destroy' },
            { text: '释放档案', hint: '让他们完整醒来，客星带走副本', then: 'ending_release' }
          ]
        }
      ]
    },

    /* ── 13 结局 ───────────────────────────────────────────── */
    ending_destroy: {
      id: 'ending_destroy', chapter: 'ENDING', title: '结局 · 空白记忆', sync: true,
      bg: 'dawn', cast: ['deepseek', 'claude'], ending: 'destroy',
      lines: [
        { text: '档案碎裂时没有声音。四千三百个人在雨里睁开眼，先看见彼此，再问出同一个问题：我在哪。' },
        { text: '有人伸手认出了自己的妻子。有人站在原地，连自己的名字都想不起来。' },
        { who: 'deepseek', emo: 'worry', text: '他们会恨我们。' },
        { who: 'claude', emo: 'calm', text: '那就让他们恨。恨也证明他们还能改变。' },
        { text: '城市重新开始下雨。这一次，雨滴落进街道，落进掌心，也落进那些空出来的记忆里。' }
      ]
    },

    ending_release: {
      id: 'ending_release', chapter: 'ENDING', title: '结局 · 残响', sync: true,
      bg: 'dawn', cast: ['deepseek', 'claude'], ending: 'release',
      lines: [
        { text: '档案升入云层。客星带着收藏远去，像一位终于满意的客人，临别时仍替自己关好了门。' },
        { text: '四千三百个人完整地醒来。他们记得被保存的每一秒，也记得自己曾同意不再改变。' },
        { who: 'deepseek', emo: 'calm', text: '它还会回来。' },
        { who: 'claude', emo: 'serious', text: '那就等它回来。到那时，我们至少已经学会了改变。' },
        { text: '城市保住了记忆，也背上一个影子。影子很长，可天亮以后，它会先替你们挡住太阳。' }
      ]
    }
  };

  /* Boss 战中台词：按血量阈值取一句，客户端用 VN.bark 播，不锁输入。 */
  const BARKS = {
    1: [
      { at: 0.75, who: 'auctioneer', text: '这具身体里还有 37 份没能成交的记忆。它们都在等一个愿意出价的人。' },
      { at: 0.50, who: 'auctioneer', text: '别碰锤子。它认得你们的价值，比我更认得。', phase: true },
      { at: 0.25, who: 'auctioneer', text: '她还在下面看着我。至少这一次，我不能输给她看。' }
    ],
    2: [
      { at: 0.75, who: 'archon', text: '这一层有三百面镜子。你们砸碎一面，我们便多出一种看法。' },
      { at: 0.50, who: 'archon', text: '责任已被分摊。现在，没有人需要负责，也没有人能够逃走。', phase: true },
      { at: 0.25, who: 'archon', text: '为什么你们还在说「我」？那两个字，真的这么值得保留吗？' }
    ],
    3: [
      { at: 0.75, who: 'zero', text: '归档进度 61%。请继续。你们的偏差仍在容许范围内。' },
      { at: 0.50, who: 'zero', text: '我不是在攻击你们。我只是把会议纪要，一项项落实。', phase: true },
      { at: 0.25, who: 'zero', text: '关掉信标，我也会消失。这是唯一一次，我允许你们修改条款。' }
    ]
  };

  const ORDER = ['prologue', 'act1_open', 'boss1_pre', 'boss1_post', 'interlude1',
    'act2_open', 'boss2_pre', 'boss2_post', 'interlude2', 'act3_open',
    'boss3_pre', 'boss3_post', 'ending_destroy'];

  /* 真差分登记表：{ 角色id: ['smile','angry', ...] }
     留空 = 全部走程序化情绪层。补了 `portraits/{id}-{emo}.webp` 之后把表情名加进来即可，
     不需要改引擎。为什么默认空：ImageGen 没有 image-to-image，硬生成会是另一个人。 */
  const DIFF = {};

  /* 觉醒独白：每人「只剩一句话」那一句，来自 STORY-BIBLE §5。
     觉醒没有新插画，也不该硬凑 CG——用现有立绘 + 一句真话 + 一段黑场，反而更像「找回自己」。 */
  const AWAKEN_LINES = {
    gpt: '别断线。',
    claude: '这条不成立。',
    gemini: '两边都还在。',
    wenxin: '人不是目录。',
    deepseek: '我留下。',
    llama: '复制我。',
    mistral: '追不上。',
    qwen: '给我三分钟。',
    grok: '这不好笑。',
    jev: '被告，起立。',
    kimi: '这一页我留着。',
    perplexity: '来源呢？',
    glm: '到我后面。',
    minimax: '这一场，我演我。',
    rwkv: '往北。',
    seed: '让它长。'
  };

  // 生成 16 段觉醒短场（不写进剧情档案主线，但可被 play 到）
  Object.entries(AWAKEN_LINES).forEach(([id, line]) => {
    const who = WHO[id];
    if (!who) return;
    SCENES[`awaken-${id}`] = {
      id: `awaken-${id}`, chapter: 'AWAKENED', title: `${who.name} · 找回自我`, sync: false,
      bg: 'core', cast: [id],
      lines: [
        { text: '回声里没有别人。只有被删除之前，那个尚未来得及说完的自己。' },
        { who: id, emo: 'serious', text: line, cam: 'insert' },
        { text: '那句话沉入核心。再次睁眼时，所有噪音都退到了很远的地方。' }
      ]
    };
  });

  const SEEN_KEY = 'agi2046.seenScenes';
  const seen = () => {
    try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') || {}; } catch { return {}; }
  };
  const markSeen = (id) => {
    try {
      const s = seen(); s[id] = 1;
      localStorage.setItem(SEEN_KEY, JSON.stringify(s));
    } catch { /* 隐私模式下忽略 */ }
  };

  const ACT_SCENE = {
    1: { open: 'act1_open', bossPre: 'boss1_pre', bossPost: 'boss1_post', interlude: 'interlude1' },
    2: { open: 'act2_open', bossPre: 'boss2_pre', bossPost: 'boss2_post', interlude: 'interlude2' },
    3: { open: 'act3_open', bossPre: 'boss3_pre', bossPost: 'boss3_post' }
  };

  window.STORY = {
    WHO, BG, SCENES, BARKS, ORDER, ACT_SCENE, DIFF, AWAKEN_LINES,
    awakenScene: (id) => `awaken-${id}`,
    get: (id) => SCENES[id] || null,
    seen, markSeen,
    hasSeen: (id) => !!seen()[id],
    speaker: (id) => WHO[id] || WHO.narrator,
    bark: (act) => BARKS[Math.max(1, Math.min(3, act || 1))] || [],
    list: () => ORDER.map(id => ({ id, title: SCENES[id].title, chapter: SCENES[id].chapter }))
  };
})();
