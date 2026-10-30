/* 零号协议 2046 · 程序化音效与氛围垫音
   不依赖任何音频素材：全部由 WebAudio 振荡器与噪声实时合成。 */
(function () {
  const MUTE_KEY = 'agi2046.muted';
  const VOL_KEY = 'agi2046.volumes';
  const Sound = {};
  let ctx = null;
  let master = null;
  let bgmGain = null;
  let bgmStarted = false;
  let muted = false;
  /** 三条独立通道：音效 / 环境 / 界面。0–1，持久化。 */
  let volumes = { sfx: 0.85, ambient: 0.6, ui: 0.7 };
  const channels = {};
  /** 当前默认通道：Sound.sfx 会按音效名切换，UI 音和环境音各走自己的滑杆。 */
  let currentChannel = 'sfx';
  const UI_SOUNDS = new Set(['click', 'hover', 'open', 'close', 'tab', 'toggle', 'select']);

  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { /* 忽略 */ }
  try {
    const saved = JSON.parse(localStorage.getItem(VOL_KEY) || '{}');
    for (const k of Object.keys(volumes)) {
      if (typeof saved[k] === 'number' && saved[k] >= 0 && saved[k] <= 1) volumes[k] = saved[k];
    }
  } catch (e) { /* 忽略 */ }

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    master.connect(ctx.destination);
    // 每条通道一个 GainNode：调一条不会连带别的
    for (const key of Object.keys(volumes)) {
      const g = ctx.createGain();
      g.gain.value = volumes[key];
      g.connect(master);
      channels[key] = g;
    }
    return ctx;
  }

  function now() {
    return ctx ? ctx.currentTime : 0;
  }

  function tone(opts) {
    const c = ensure();
    if (!c || muted) return;
    const {
      freq = 440, type = 'sine', dur = 0.2, gain = 0.1,
      slideTo = null, delay = 0, attack = 0.008, filter = null, detune = 0,
      channel = currentChannel
    } = opts;
    const t0 = now() + delay;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    osc.detune.value = detune;
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    const g = c.createGain();
    g.connect(channels[channel] || master);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = osc;
    if (filter) {
      const f = c.createBiquadFilter();
      f.type = filter.type || 'lowpass';
      f.frequency.setValueAtTime(filter.freq || 1200, t0);
      if (filter.to) f.frequency.exponentialRampToValueAtTime(Math.max(60, filter.to), t0 + dur);
      f.Q.value = filter.q ?? 1;
      node.connect(f);
      node = f;
    }
    node.connect(g);   // g 已经接到对应通道，再连 master 会重复放大
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise(opts) {
    const c = ensure();
    if (!c || muted) return;
    const { dur = 0.2, gain = 0.08, delay = 0, freq = 900, to = null, q = 1.2, type = 'bandpass',
      channel = currentChannel } = opts;
    const t0 = now() + delay;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (to) f.frequency.exponentialRampToValueAtTime(Math.max(80, to), t0 + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(channels[channel] || master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  const SFX = {
    click() {
      tone({ freq: 620, type: 'square', dur: 0.045, gain: 0.035, filter: { type: 'highpass', freq: 400 } });
    },
    open() {
      tone({ freq: 300, type: 'sine', dur: 0.22, gain: 0.06, slideTo: 520 });
      noise({ dur: 0.18, gain: 0.04, freq: 1800, to: 900 });
    },
    close() {
      tone({ freq: 420, type: 'sine', dur: 0.16, gain: 0.045, slideTo: 220 });
    },
    dice() {
      for (let i = 0; i < 4; i++) {
        noise({ dur: 0.06, gain: 0.05, freq: 2200 + i * 240, delay: i * 0.075, q: 2 });
      }
    },
    hit() {
      noise({ dur: 0.16, gain: 0.13, freq: 1400, to: 300 });
      tone({ freq: 150, type: 'sine', dur: 0.2, gain: 0.14, slideTo: 60 });
    },
    crit() {
      noise({ dur: 0.22, gain: 0.16, freq: 2400, to: 400 });
      tone({ freq: 220, type: 'square', dur: 0.24, gain: 0.1, slideTo: 55 });
      tone({ freq: 880, type: 'triangle', dur: 0.18, gain: 0.05, delay: 0.02, slideTo: 440 });
    },
    miss() {
      noise({ dur: 0.22, gain: 0.06, freq: 700, to: 2200, q: 0.8 });
    },
    hurt() {
      tone({ freq: 190, type: 'sawtooth', dur: 0.3, gain: 0.11, slideTo: 55, filter: { type: 'lowpass', freq: 900, to: 180 } });
      noise({ dur: 0.14, gain: 0.08, freq: 500, to: 160 });
    },
    heal() {
      tone({ freq: 523.25, type: 'sine', dur: 0.3, gain: 0.06 });
      tone({ freq: 784, type: 'sine', dur: 0.34, gain: 0.05, delay: 0.09 });
    },
    loot() {
      [659.25, 880, 1174.66].forEach((f, i) =>
        tone({ freq: f, type: 'triangle', dur: 0.22, gain: 0.055, delay: i * 0.07 }));
    },
    buy() {
      tone({ freq: 1046.5, type: 'square', dur: 0.07, gain: 0.04 });
      tone({ freq: 1318.5, type: 'square', dur: 0.1, gain: 0.035, delay: 0.07 });
    },
    equip() {
      noise({ dur: 0.08, gain: 0.05, freq: 3200, q: 3 });
      tone({ freq: 740, type: 'triangle', dur: 0.16, gain: 0.05, delay: 0.04 });
    },
    levelup() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        tone({ freq: f, type: 'triangle', dur: 0.3, gain: 0.06, delay: i * 0.085 }));
    },
    transition() {
      [261.63, 392, 523.25, 659.25].forEach((f, i) =>
        tone({ freq: f, type: 'sine', dur: 1.4, gain: 0.05, delay: i * 0.12, attack: 0.35 }));
      noise({ dur: 1.1, gain: 0.05, freq: 300, to: 2600, q: 0.7 });
      tone({ freq: 70, type: 'sine', dur: 1.2, gain: 0.12, slideTo: 40 });
    },
    victory() {
      [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
        tone({ freq: f, type: 'triangle', dur: 1.8, gain: 0.06, delay: i * 0.14, attack: 0.25 }));
      tone({ freq: 65.4, type: 'sine', dur: 2.2, gain: 0.12, attack: 0.4 });
    },
    defeat() {
      [392, 349.23, 293.66, 220].forEach((f, i) =>
        tone({ freq: f, type: 'sawtooth', dur: 1.2, gain: 0.05, delay: i * 0.18, filter: { type: 'lowpass', freq: 900, to: 240 } }));
      tone({ freq: 55, type: 'sine', dur: 1.8, gain: 0.12, slideTo: 30 });
    },
    turn() {
      tone({ freq: 440, type: 'sine', dur: 0.12, gain: 0.03 });
    },
    // NIKKE 式字效：警报 / 印章 / 评级 / 上升音
    alarm() {
      for (let i = 0; i < 2; i++) {
        tone({ freq: 880, type: 'sawtooth', dur: 0.42, gain: 0.055, delay: i * 0.34, slideTo: 620,
          filter: { type: 'bandpass', freq: 900, q: 1.2 } });
      }
      noise({ dur: 0.5, gain: 0.025, freq: 500, to: 180, delay: 0.05 });
    },
    stamp() {
      tone({ freq: 92, type: 'sine', dur: 0.34, gain: 0.16, slideTo: 42 });
      noise({ dur: 0.12, gain: 0.09, freq: 2200, to: 300 });
      tone({ freq: 196, type: 'square', dur: 0.12, gain: 0.04, delay: 0.04, slideTo: 98 });
    },
    rank() {
      [659.25, 987.77, 1318.5].forEach((f, i) =>
        tone({ freq: f, type: 'triangle', dur: 0.32, gain: 0.05, delay: i * 0.06 }));
    },
    riser() {
      noise({ dur: 0.55, gain: 0.05, freq: 300, to: 3200, q: 0.7 });
      tone({ freq: 180, type: 'sawtooth', dur: 0.5, gain: 0.04, slideTo: 720,
        filter: { type: 'lowpass', freq: 600, to: 2400 } });
    }
  };

  Sound.sfx = function (name) {
    if (muted) return;
    const fn = SFX[name];
    if (!fn) return;
    const prev = currentChannel;
    currentChannel = UI_SOUNDS.has(name) ? 'ui' : 'sfx';
    try { fn(); } catch (e) { /* 音频失败不影响游戏 */ }
    finally { currentChannel = prev; }
  };

  Sound.muted = () => muted;
  Sound.volumes = () => ({ ...volumes });

  /** 0–1；越界自动夹紧。两条通道互不影响。 */
  Sound.setVolume = function (channel, value) {
    if (!(channel in volumes)) return volumes;
    const v = Math.max(0, Math.min(1, Number(value) || 0));
    volumes[channel] = v;
    try { localStorage.setItem(VOL_KEY, JSON.stringify(volumes)); } catch (e) { /* 忽略 */ }
    const g = channels[channel];
    if (g && ctx) g.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
    return { ...volumes };
  };

  Sound.setMuted = function (value) {
    muted = !!value;
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) { /* 忽略 */ }
    if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.85, ctx.currentTime, 0.05);
    return muted;
  };

  Sound.toggle = function () {
    ensure();
    return Sound.setMuted(!muted);
  };

  function startBgm() {
    const c = ensure();
    if (!c || bgmStarted) return;
    bgmStarted = true;
    bgmGain = c.createGain();
    bgmGain.gain.value = 0.0001;
    bgmGain.connect(channels.ambient || master);
    bgmGain.gain.exponentialRampToValueAtTime(0.05, c.currentTime + 8);

    const voices = [
      { freq: 55, type: 'sine', gain: 0.5, cut: 320 },
      { freq: 82.41, type: 'triangle', gain: 0.28, cut: 420 },
      { freq: 110, type: 'sine', gain: 0.22, cut: 520 },
      { freq: 164.81, type: 'sine', gain: 0.1, cut: 900 }
    ];
    for (const v of voices) {
      const osc = c.createOscillator();
      osc.type = v.type;
      osc.frequency.value = v.freq;
      osc.detune.value = (Math.random() - 0.5) * 12;
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = v.cut;
      filter.Q.value = 2;
      const gain = c.createGain();
      gain.gain.value = v.gain * 0.35;
      const lfo = c.createOscillator();
      lfo.frequency.value = 0.025 + Math.random() * 0.03;
      const lfoGain = c.createGain();
      lfoGain.gain.value = v.cut * 0.45;
      lfo.connect(lfoGain).connect(filter.frequency);
      osc.connect(filter).connect(gain).connect(bgmGain);
      osc.start();
      lfo.start();
    }

    // 极稀疏的高频雨声，每 9–17 秒一次
    const drip = () => {
      if (!ctx || muted) { setTimeout(drip, 12000); return; }
      noise({ dur: 0.5, gain: 0.012, freq: 3800 + Math.random() * 1600, q: 6 });
      setTimeout(drip, 9000 + Math.random() * 8000);
    };
    setTimeout(drip, 6000);
    setBgm(bgmWanted);
  }

  /* ── BGM 曲目（OpenGameArt CC0 / SRG774） ─────────────────── */
  const bgmTracks = {
    explore: 'assets/audio/bgm-explore.mp3',
    battle: 'assets/audio/bgm-battle.mp3'
  };
  const bgmBuffers = {};
  const bgmLoading = {};
  let bgmNow = null;
  let bgmSource = null;
  let bgmWanted = 'explore';

  function loadBgmTrack(name) {
    const c = ensure();
    if (!c || bgmBuffers[name] || bgmLoading[name]) return;
    bgmLoading[name] = true;
    fetch(bgmTracks[name])
      .then((r) => r.arrayBuffer())
      .then((buf) => c.decodeAudioData(buf))
      .then((data) => {
        bgmBuffers[name] = data;
        bgmLoading[name] = false;
        if (bgmWanted === name && bgmStarted) playBgmTrack(name);
      })
      .catch(() => { bgmLoading[name] = false; });
  }

  function playBgmTrack(name) {
    const c = ensure();
    if (!c || muted || !bgmStarted) return;
    if (bgmNow === name && bgmSource) return;
    const buf = bgmBuffers[name];
    if (!buf) { loadBgmTrack(name); return; }

    if (bgmSource) {
      const old = bgmSource;
      try {
        old.gain.gain.cancelScheduledValues(c.currentTime);
        old.gain.gain.setValueAtTime(Math.max(0.0001, old.gain.gain.value), c.currentTime);
        old.gain.gain.linearRampToValueAtTime(0.0001, c.currentTime + 0.9);
        old.src.stop(c.currentTime + 1.0);
      } catch (e) { /* 已停止 */ }
    }

    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = c.createGain();
    gain.gain.value = 0.0001;
    src.connect(gain);
    gain.connect(master);
    src.start();
    gain.gain.exponentialRampToValueAtTime(0.075, c.currentTime + 2.4);
    bgmSource = { src: src, gain: gain };
    bgmNow = name;
  }

  function setBgm(name) {
    bgmWanted = name;
    if (!bgmStarted) { loadBgmTrack(name); return; }
    if (bgmGain) {
      try {
        bgmGain.gain.cancelScheduledValues(ctx.currentTime);
        bgmGain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 3);
      } catch (e) { /* 忽略 */ }
    }
    playBgmTrack(name);
  }

  Sound.setBgm = setBgm;

  /* ── 采样音效（Kenney CC0） ───────────────────────────────── */
  const samples = {};
  const sampleUrls = {
    hit: 'assets/audio/hit-light.ogg',
    hitHeavy: 'assets/audio/hit-heavy.ogg',
    step: 'assets/audio/step.ogg'
  };
  let samplesLoading = false;

  function loadSamples() {
    const c = ensure();
    if (!c || samplesLoading) return;
    samplesLoading = true;
    Object.keys(sampleUrls).forEach((key) => {
      fetch(sampleUrls[key])
        .then((r) => r.arrayBuffer())
        .then((buf) => c.decodeAudioData(buf))
        .then((data) => { samples[key] = data; })
        .catch(() => { /* 缺文件就静默回退到合成音 */ });
    });
  }

  function playSample(name, gain = 0.4, rate = 1) {
    const c = ensure();
    if (!c || muted) return false;
    const buf = samples[name];
    if (!buf) { loadSamples(); return false; }
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(master);
    src.start();
    return true;
  }

  Sound.playSample = playSample;
  Sound.loadSamples = loadSamples;
  Sound.startBgm = startBgm;

  Sound.init = function () {
    const unlock = () => {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume();
      startBgm();
      loadSamples();
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
  };

  window.Sound = Sound;
})();
