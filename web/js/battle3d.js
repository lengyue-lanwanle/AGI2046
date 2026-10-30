/* 战斗 3D 渲染层（Three.js）——只负责画与拾取，规则仍走服务端 API。
 * 数据来自 app.js 的 combat 对象：width/height/terrain/units/reachable/activeUnitId。
 * 点击通过 window 事件 `battle3d-pick` 交回 app.js 处理，避免两套输入逻辑。
 */
(function () {
  const R = 0.68;                 // 六边形外接半径
  const THICK = 0.16;             // 地块厚度
  const FOG = 0x05070b;
  const IMPACT_DELAY = 0.22;      // 受击/飘字相对结算完成延后，对齐施法前冲的打击帧

  let renderer = null;
  let scene = null;
  let camera = null;
  let canvas = null;
  let boardGroup = null;
  let mounted = false;
  let builtKey = '';
  let visible = false;

  let current = null;
  let bgMesh = null;
  let bgTex = null;
  let bgUrl = '';
  const effects = [];
  const cellMeshes = new Map();   // "col,row" -> mesh
  const unitObjects = new Map();  // unitId -> object3d
  const texLoader = window.THREE ? new THREE.TextureLoader() : null;

  // 相机：默认锁在某个单位身上（近景），空字符串表示看整个棋盘
  const CAM_PITCH = 0.74;                                  // 俯角（与原机位 8.6/7.8 一致）
  const CAM_HORIZ = Math.sqrt(1 - CAM_PITCH * CAM_PITCH);
  let focusUnitId = '';
  let camPos = null;
  let camLook = null;
  let camReady = false;

  function cellPos(col, row, width, height) {
    const cx = R * Math.sqrt(3) * ((width - 1) / 2 + 0.25);
    const cz = R * 1.5 * ((height - 1) / 2);
    return {
      x: R * Math.sqrt(3) * (col + 0.5 * (row & 1)) - cx,
      z: R * 1.5 * row - cz
    };
  }

  /** 低性能设备：少核心 / 少内存 / 小屏高像素密度，自动降一档画质。 */
  const LOW_POWER = (() => {
    try {
      const cores = navigator.hardwareConcurrency || 8;
      const mem = navigator.deviceMemory || 8;
      const small = Math.min(window.innerWidth, window.innerHeight) < 620;
      return cores <= 4 || mem <= 4 || (small && (window.devicePixelRatio || 1) > 2);
    } catch { return false; }
  })();

  function mount() {
    if (mounted || !window.THREE) return;
    canvas = document.getElementById('battle3d');
    if (!canvas) return;
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: !LOW_POWER, alpha: true });
    renderer.setPixelRatio(LOW_POWER ? 1 : Math.min(2, window.devicePixelRatio || 1));
    // 低性能设备（核显 / 少核心 / 省内存）关阴影，画面仍然可读，只是少了投影
    renderer.shadowMap.enabled = !LOW_POWER;

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(FOG, 13, 34);
    camera = new THREE.PerspectiveCamera(40, 1, 0.1, 120);
    camera.position.set(0, 8.6, 7.8);
    camera.lookAt(0, 0.05, 0.1);

    scene.add(new THREE.AmbientLight(0x8fa6c8, 1.0));
    const key = new THREE.DirectionalLight(0xd8ecff, 1.15);
    key.position.set(-5, 10, 7);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x4fd8e8, 0.5);
    rim.position.set(6, 4, -6);
    scene.add(rim);


    boardGroup = new THREE.Group();
    scene.add(boardGroup);
    scene.add(camera);          // camera 要进场景，挂在它下面的背景才会被渲染

    mounted = true;
    resize();
    window.addEventListener('resize', resize);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas.parentElement || canvas);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    requestAnimationFrame(loop);
  }

  /* 战场背景：挂在相机前的一块大 plane，永远铺满视口。
     不放在世界坐标里，是因为镜头会跟着当前单位平移；挂相机上才不会露出边缘。 */
  function ensureBackdrop() {
    if (bgMesh || !camera) return;
    const mat = new THREE.MeshBasicMaterial({
      transparent: true, opacity: 0.8, depthWrite: false, depthTest: false, fog: false
    });
    bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    bgMesh.position.set(0, 0, -40);
    bgMesh.renderOrder = -100;
    bgMesh.visible = false;
    camera.add(bgMesh);
  }

  function layoutBackdrop() {
    if (!bgMesh || !camera) return;
    const z = 40;
    const h = 2 * Math.tan((camera.fov * Math.PI / 180) / 2) * z;
    const w = h * camera.aspect;
    // 多留 8% 余量，避免相机轻微移动时露出边缘
    bgMesh.scale.set(w * 1.08, h * 1.08, 1);
    bgMesh.position.set(0, 0, -z);
    const map = bgMesh.material.map;
    if (map && map.image) {
      const ia = map.image.width / map.image.height;
      const sa = camera.aspect;
      map.repeat.set(1, 1);
      map.offset.set(0, 0);
      // cover：图片比例和视口不一致时裁掉多出来的部分，而不是拉伸
      if (ia > sa) {
        map.repeat.x = sa / ia;
        map.offset.x = (1 - map.repeat.x) / 2;
      } else {
        map.repeat.y = ia / sa;
        map.offset.y = (1 - map.repeat.y) / 2;
      }
      map.needsUpdate = true;
    }
  }

  function setBackdrop(url) {
    if (!url) {
      if (bgMesh) bgMesh.visible = false;
      return;
    }
    ensureBackdrop();
    if (!bgMesh) return;
    bgMesh.visible = true;
    if (url === bgUrl) { layoutBackdrop(); return; }
    bgUrl = url;
    const loader = texLoader || new THREE.TextureLoader();
    loader.load(url, (tex) => {
      if (bgUrl !== url) { tex.dispose(); return; }
      if (window.THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      else if (window.THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      if (bgTex && bgTex !== tex) bgTex.dispose();
      bgTex = tex;
      bgMesh.material.map = tex;
      bgMesh.material.needsUpdate = true;
      layoutBackdrop();
    }, undefined, () => {
      // 加载失败：清掉 URL，下一场还能重试；保留上一张纹理，不阻塞战斗
      if (bgUrl === url) bgUrl = '';
    });
  }

  function resize() {
    if (!renderer || !canvas) return;
    const host = canvas.parentElement || canvas;
    const rect = host.getBoundingClientRect();
    const w = Math.max(320, Math.round(rect.width || host.clientWidth || 0));
    const h = Math.max(240, Math.round(rect.height || host.clientHeight || 0));
    renderer.setSize(w, h, false);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fitCamera();
    layoutBackdrop();
  }

  // 相机自适应：画布是竖长条（右侧还有技能面板），固定机位会把棋盘两侧裁出画面。
  // 按棋盘包围盒四个角投影到 NDC，不够就往后拉；再让棋盘在画面里竖直居中，留白均分。
  function computeFit() {
    const w = current?.width || 7;
    const hgt = current?.height || 5;
    const spanX = ((w - 1) * Math.sqrt(3) + Math.sqrt(3) * 0.5) * R;
    const spanZ = ((hgt - 1) * 1.5 + 2) * R;
    const corners = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) corners.push([sx * spanX / 2, sz * spanZ / 2]);
    let dist = Math.max(spanX, spanZ) * 1.25;
    let targetZ = 0.05;
    const apply = () => {
      camera.position.set(0, dist * CAM_PITCH, dist * CAM_HORIZ);
      camera.lookAt(0, 0, targetZ);
      camera.updateMatrixWorld(true);
      camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
      camera.updateProjectionMatrix();
    };
    const probe = () => {
      let maxX = 0;
      let maxY = 0;
      let cySum = 0;
      for (const [x, z] of corners) {
        const v = new THREE.Vector3(x, 0, z).project(camera);
        maxX = Math.max(maxX, Math.abs(v.x));
        maxY = Math.max(maxY, Math.abs(v.y));
        cySum += v.y;
      }
      return { maxX, maxY, cy: cySum / corners.length };
    };
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < 24; i++) {
        apply();
        const p = probe();
        if (p.maxX <= 0.9 && p.maxY <= 0.88) break;
        dist *= 1.06;
      }
      apply();
      const p = probe();
      if (Math.abs(p.cy) < 0.02) break;
      targetZ += p.cy * 0.45;                 // targetZ 变大 → 画面内容下移
    }
    return { dist, targetZ };
  }

  // 焦点近景的相机距离：想让画面里装下约 6.5 格宽、5 格深（纵向按俯角压缩折算）。
  // 近景会把立绘放大到约四分之一屏高，再多就挡棋盘了，所以两头都夹住。
  function unitCamDist() {
    const aspect = camera?.aspect || 1;
    const wantW = R * Math.sqrt(3) * 6.5;
    const wantH = (R * 1.5 * 5) / CAM_PITCH;
    const d = Math.max(wantW / (0.728 * aspect), wantH / 0.728);
    return Math.min(13, Math.max(7.5, d));
  }

  function desiredCam() {
    if (focusUnitId && current) {
      const u = (current.units || []).find(x => x.id === focusUnitId);
      if (u) {
        const p = cellPos(u.col, u.row, current.width, current.height);
        const dist = unitCamDist();
        // 角色站在棋盘角落时，死锁它会把大半个画面浪费在棋盘外；
        // 把镜头朝棋盘中心挪三成，角色仍在框内，战场也能看全。
        const bias = 0.3;
        const cx = p.x * (1 - bias);
        const cz = p.z * (1 - bias);
        return {
          pos: new THREE.Vector3(cx, dist * CAM_PITCH, cz + dist * CAM_HORIZ),
          look: new THREE.Vector3(cx, 0.7, cz)
        };
      }
    }
    const fit = computeFit();
    return {
      pos: new THREE.Vector3(0, fit.dist * CAM_PITCH, fit.dist * CAM_HORIZ),
      look: new THREE.Vector3(0, 0, fit.targetZ)
    };
  }

  // 每帧把相机平滑推向目标机位：焦点单位的走位镜头会跟着滑过去
  function updateCamera() {
    if (!camera) return;
    const want = desiredCam();
    if (!camPos || !camLook) {
      camPos = want.pos.clone();
      camLook = want.look.clone();
      camReady = false;
    }
    const k = camReady ? 0.16 : 1;
    camPos.lerp(want.pos, k);
    camLook.lerp(want.look, k);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    camera.updateMatrixWorld(true);
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    camReady = true;
  }

  function setFocus(unitId) {
    const next = unitId || '';
    if (next === focusUnitId) return;
    focusUnitId = next;
  }

  function resize() {
    if (!renderer || !canvas) return;
    const host = canvas.parentElement || canvas;
    const rect = host.getBoundingClientRect();
    const w = Math.max(320, Math.round(rect.width || host.clientWidth || 0));
    const h = Math.max(240, Math.round(rect.height || host.clientHeight || 0));
    renderer.setSize(w, h, false);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    updateCamera();
    layoutBackdrop();
  }

  function loop() {
    requestAnimationFrame(loop);
    if (!renderer) return;
    if (!visible) return;
    const now = performance.now() / 1000;
    animateUnits(now);
    animateEffects(now);
    updateCamera();
    renderer.render(scene, camera);
  }

  function disposeBoard() {
    // 逐个释放几何与材质，否则长时间开关战斗会一直吃显存
    boardGroup.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          for (const key of ['map', 'emissiveMap', 'alphaMap', 'normalMap']) {
            if (m[key] && m[key].dispose) m[key].dispose();
          }
          m.dispose();
        }
      }
    });
    boardGroup.clear();
    cellMeshes.clear();
    unitObjects.clear();
  }

  function terrainColor(t) {
    if (t && t.type === 'obstacle') return 0x5a2230;
    if (t && t.type === 'cover') return 0x2c4a34;
    return 0x2b3a4a;
  }

  let circuitTex = null;

  /** 程序生成赛博电路板：蓝紫渐变底 + 折线走线 + 焊盘/过孔。 */
  // 敌人背后的柔光：深色棋盘 + 深色立绘会糊在一起，
  // 用阵营色打一层加色光晕，既分离主体又强化「颜色=阵营」的编码。
  let haloTexture = null;
  function makeHaloTexture() {
    if (haloTexture) return haloTexture;
    const size = 128;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d');
    const grd = g.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
    grd.addColorStop(0, 'rgba(255,255,255,0.85)');
    grd.addColorStop(0.45, 'rgba(255,255,255,0.28)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    haloTexture = new THREE.CanvasTexture(cv);
    haloTexture.encoding = THREE.sRGBEncoding;
    return haloTexture;
  }

  function makeCircuitTexture() {
    if (circuitTex) return circuitTex;
    const W = 1024;
    const H = 768;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');

    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0a1030');
    bg.addColorStop(0.4, '#16205c');
    bg.addColorStop(0.68, '#2a2070');
    bg.addColorStop(1, '#0c0a2a');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    const glow = g.createRadialGradient(W * 0.35, H * 0.45, 40, W * 0.35, H * 0.45, W * 0.6);
    glow.addColorStop(0, 'rgba(40,180,255,0.25)');
    glow.addColorStop(1, 'rgba(40,180,255,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, W, H);

    const step = 16;
    function trace(color, width, segments) {
      let x = Math.floor(Math.random() * (W / step)) * step;
      let y = Math.floor(Math.random() * (H / step)) * step;
      g.strokeStyle = color;
      g.lineWidth = width;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(x, y);
      let dir = Math.floor(Math.random() * 4);
      for (let i = 0; i < segments; i++) {
        if (Math.random() < 0.3) dir = (dir + (Math.random() < 0.5 ? 1 : 3)) % 4;
        const d = step * (1 + Math.floor(Math.random() * 3));
        if (dir === 0) x += d;
        else if (dir === 1) y += d;
        else if (dir === 2) x -= d;
        else y -= d;
        x = Math.max(4, Math.min(W - 4, x));
        y = Math.max(4, Math.min(H - 4, y));
        g.lineTo(x, y);
      }
      g.stroke();

      g.fillStyle = color;
      g.beginPath();
      g.arc(x, y, width * 1.5, 0, Math.PI * 2);
      g.fill();
    }

    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 180; i++) {
      const t = Math.random();
      const color = t < 0.55
        ? 'rgba(110,225,255,0.5)'
        : 'rgba(150,110,255,0.45)';
      trace(color, 1.1 + Math.random() * 1.5, 6 + Math.floor(Math.random() * 14));
    }
    // 密度层：短促暗线打底，避免 180 条主线互相压成一片糊
    for (let i = 0; i < 70; i++) {
      trace('rgba(90,150,255,0.28)', 0.7 + Math.random() * 0.6, 2 + Math.floor(Math.random() * 4));
    }

    // 焊盘 / 过孔
    for (let i = 0; i < 95; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      const r = 2 + Math.random() * 4;
      g.strokeStyle = Math.random() < 0.5 ? 'rgba(120,230,255,0.45)' : 'rgba(160,120,255,0.45)';
      g.lineWidth = 1.4;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.stroke();
    }

    // 大块芯片封装
    for (let i = 0; i < 6; i++) {
      const w = 60 + Math.random() * 120;
      const h = 30 + Math.random() * 60;
      const x = Math.random() * (W - w);
      const y = Math.random() * (H - h);
      g.fillStyle = 'rgba(90,160,255,0.06)';
      g.fillRect(x, y, w, h);
      g.strokeStyle = 'rgba(140,220,255,0.3)';
      g.lineWidth = 1.2;
      g.strokeRect(x, y, w, h);
    }

    g.globalCompositeOperation = 'source-over';
    circuitTex = new THREE.CanvasTexture(c);
    if (THREE.sRGBEncoding) circuitTex.encoding = THREE.sRGBEncoding;
    return circuitTex;
  }

  function buildBoard(c) {
    const key = `${c.width}x${c.height}`;
    if (key === builtKey) return;
    builtKey = key;
    disposeBoard();

    const geo = new THREE.CylinderGeometry(R * 0.985, R * 0.985, THICK, 6);
    const edgeGeo = new THREE.EdgesGeometry(geo, 1);

    // 电路板底板：透过玻璃砖能看到走线。
    // 压低亮度：底板是背景，不是主角——之前它比单位和名牌还亮，视线全被走线抓走。
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(10.6, 8.1),
      new THREE.MeshBasicMaterial({
        map: makeCircuitTexture(),
        color: 0x5f7386,
        transparent: true,
        opacity: 0.7,
        depthWrite: false
      })
    );
    board.rotation.x = -Math.PI / 2;
    board.position.y = -0.1;
    board.renderOrder = 0;
    boardGroup.add(board);
    for (let row = 0; row < c.height; row++) {
      for (let col = 0; col < c.width; col++) {
        const p = cellPos(col, row, c.width, c.height);
        const mat = new THREE.MeshPhysicalMaterial({
          color: 0x9fd4ea, metalness: 0.42, roughness: 0.1,
          transparent: true, opacity: 0.36, depthWrite: false,
          emissive: 0x0a2230, emissiveIntensity: 0.7,
          side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geo, mat);
        // 玻璃砖的发光棱边
        const edge = new THREE.LineSegments(
          edgeGeo,
          new THREE.LineBasicMaterial({ color: 0x3fd0ee, transparent: true, opacity: 0.42, depthWrite: false })
        );
        edge.renderOrder = 2;
        mesh.add(edge);
        mesh.rotation.y = Math.PI / 6;
        mesh.position.set(p.x, 0, p.z);
        mesh.receiveShadow = true;
        mesh.userData = { col: col, row: row };
        boardGroup.add(mesh);
        cellMeshes.set(`${col},${row}`, mesh);
      }
    }
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function drawPlate(canvas, u) {
    const g = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(6,10,16,0.74)';
    roundRect(g, 2, 2, w - 4, h - 4, 12);
    g.fill();
    g.strokeStyle = u.side === 'player' ? 'rgba(120,232,255,0.8)' : 'rgba(255,96,110,0.8)';
    g.lineWidth = 2;
    roundRect(g, 2, 2, w - 4, h - 4, 12);
    g.stroke();
    g.fillStyle = u.side === 'player' ? '#9ff2ff' : '#ffb0b8';
    g.font = 'bold 24px "Microsoft YaHei", sans-serif';
    g.textAlign = 'center';
    g.fillText(u.name || '', w / 2, 26);
    // HP 条
    const ratio = Math.max(0, Math.min(1, u.hp / Math.max(1, u.maxHp)));
    g.fillStyle = 'rgba(255,255,255,0.16)';
    g.fillRect(16, 36, w - 32, 9);
    g.fillStyle = u.side === 'player'
      ? (ratio > 0.35 ? '#6ff08a' : '#ffb347')
      : '#ff5a6a';
    g.fillRect(16, 36, (w - 32) * ratio, 9);

    if (u.side !== 'player') {
      // 护甲/抗性 + 当前技能对它的预计伤害。
      // 白噪唱诗班那种「抗 9」的单位，玩家以前只能看到"预测 2 点"却不知道为什么，
      // 现在把抗性和结果摆在一起：甲 0 · 抗 9 · 受 2 —— 一眼就知道该换物理武器或换目标。
      const armor = u.armor ?? 0;
      const res = u.resistance ?? 0;
      const hasForecast = u.forecast && u.forecast.total != null;
      let label = `甲 ${armor} · 抗 ${res}`;
      if (hasForecast) label += ` · 受 ${u.forecast.total}`;
      g.font = '600 15px "Microsoft YaHei", sans-serif';
      g.textAlign = 'center';
      g.fillStyle = hasForecast
        ? 'rgba(126, 238, 208, 0.96)'
        : (res >= 7 ? 'rgba(255, 176, 96, 0.92)' : 'rgba(186, 202, 220, 0.78)');
      g.fillText(label, w / 2, 61);
    }

    // 敌人：下回合意图（和服务端 AI 用同一份决策逻辑算出来的）
    if (u.side !== 'player' && u.intent) {
      g.fillStyle = 'rgba(255, 196, 150, 0.96)';
      g.font = '600 18px "Microsoft YaHei", sans-serif';
      g.textAlign = 'center';
      const text = u.intent.length > 22 ? u.intent.slice(0, 21) + '…' : u.intent;
      g.fillText(text, w / 2, 85);
    }
  }

  // 敌人立绘：优先用「每只敌人一张」的专属立绘（assets/enemies/{enemyId}.webp），
  // 没有专属图时退回旧的阵营色占位图（黄 / 绿 / 蓝 / 红）。
  const ENEMY_ART = {};
  function enemySpriteFor(u) {
    const id = u.enemyId || '';
    if (id && ENEMY_ART[id] !== false) return ENEMY_ART[id] || (ENEMY_ART[id] = `assets/enemies/${id}.webp`);
    const m = /^#?([0-9a-f]{6})$/i.exec((u.color || '').trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255;
    const gr = (n >> 8) & 255;
    const b = n & 255;
    const max = Math.max(r, gr, b);
    const min = Math.min(r, gr, b);
    const d = max - min;
    let hue = 0;
    if (d) {
      if (max === r) hue = 60 * (((gr - b) / d) % 6);
      else if (max === gr) hue = 60 * ((b - r) / d + 2);
      else hue = 60 * ((r - gr) / d + 4);
    }
    if (hue < 0) hue += 360;
    let name = 'red';
    if (hue >= 40 && hue < 80) name = 'yellow';
    else if (hue >= 80 && hue < 170) name = 'green';
    else if (hue >= 170 && hue < 265) name = 'blue';
    return 'assets/portraits3d/enemy_' + name + '.png';
  }

  function createUnit(u, c) {
    const group = new THREE.Group();
    const isPlayer = u.side === 'player';
    let body;

    const enemyArt = isPlayer ? null : enemySpriteFor(u);
    if (isPlayer && u.portrait) {
      const mat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false, alphaTest: 0.04 });
      const loadPortrait = (url, fallback) => {
        texLoader.load(url, (tex) => {
          tex.encoding = THREE.sRGBEncoding;
          mat.map = tex;
          mat.needsUpdate = true;
        }, undefined, () => { if (fallback) fallback(); });
      };
      const m = /assets\/portraits\/([a-z0-9_]+?)\d*\.(webp|png)$/i.exec(u.portrait);
      const id = m ? m[1] : null;
      // 战斗立绘优先用 WebP（3.5MB → 763KB，四人队省 800KB），老浏览器/缺图退 PNG，再退 2D 大图。
      // 文件名不变地重画过立绘（wenxin 0.25 换过），加版本号让浏览器别用旧缓存。
      const ver = '?v=3';
      if (id) {
        loadPortrait('assets/portraits3d/' + id + '.webp' + ver,
          () => loadPortrait('assets/portraits3d/' + id + '.png' + ver,
            () => loadPortrait(u.portrait, null)));
      } else loadPortrait(u.portrait, null);
      body = new THREE.Sprite(mat);
      body.scale.set(1.05, 1.55, 1);
      body.position.y = 0.95;
      body.renderOrder = 12;
    } else if (enemyArt) {
      // 敌人也有现成的机偶立绘（portraits3d/enemy_*.png），按阵营色挑一张
      const mat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, alphaTest: 0.04 });
      texLoader.load(enemyArt, (tex) => {
        tex.encoding = THREE.sRGBEncoding;
        mat.map = tex;
        mat.needsUpdate = true;
      }, undefined, () => {
        // 专属立绘缺失/损坏：标记为不可用，下次渲染自动退回阵营色占位图
        if (u.enemyId) ENEMY_ART[u.enemyId] = false;
        const fallback = enemySpriteFor(u);
        if (fallback) {
          texLoader.load(fallback, (tex) => {
            tex.encoding = THREE.sRGBEncoding;
            mat.map = tex;
            mat.needsUpdate = true;
          });
        }
      });
      body = new THREE.Sprite(mat);
      // 专属立绘是竖版 chibi（约 0.82 宽高比）；旧占位图是横版方块，按来源区分尺寸
      const isArt = /assets\/enemies\//.test(enemyArt);
      if (isArt) {
        body.scale.set(1.14, 1.40, 1);
        body.position.y = 0.71;
      } else {
        body.scale.set(1.0, 0.72, 1);
        body.position.y = 0.5;
      }
      body.renderOrder = 12;

      const halo = new THREE.Sprite(new THREE.SpriteMaterial({
        map: makeHaloTexture(),
        color: new THREE.Color(u.color || '#ff3d7f'),
        transparent: true,
        opacity: 0.46,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending
      }));
      halo.scale.set(2.15, 2.05, 1);
      halo.position.y = 0.72;
      halo.renderOrder = 11;
      group.add(halo);
    } else {
      const geo = isPlayer ? new THREE.OctahedronGeometry(0.34) : new THREE.OctahedronGeometry(0.46);
      const mat = new THREE.MeshStandardMaterial({
        color: isPlayer ? 0x3a6a7a : 0x8a2a3a,
        emissive: isPlayer ? 0x1a4a5a : 0x8a1430,
        emissiveIntensity: 0.9, roughness: 0.5
      });
      body = new THREE.Mesh(geo, mat);
      body.position.y = 0.42;
    }
    group.add(body);

    // 名字 + 血条（敌人多一行「下回合意图」）
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = isPlayer ? 64 : 96;
    drawPlate(canvas, u);
    const plateTex = new THREE.CanvasTexture(canvas);
    plateTex.encoding = THREE.sRGBEncoding;
    const plate = new THREE.Sprite(new THREE.SpriteMaterial({
      map: plateTex, transparent: true, depthWrite: false
    }));
    plate.scale.set(1.45, isPlayer ? 0.36 : 0.545, 1);
    // 竖版立绘头顶约 1.41，名牌要抬到头顶之上
    plate.position.y = isPlayer ? 1.95 : (/assets\/enemies\//.test(enemyArt || '') ? 1.62 : 1.32);
    plate.renderOrder = 13;
    group.add(plate);

    // 行动环
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.46, 36),
      new THREE.MeshBasicMaterial({ color: 0x8ff0ff, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.035;
    ring.visible = false;
    group.add(ring);

    group.userData = { unitId: u.id };
    body.userData = { unitId: u.id };
    boardGroup.add(group);
    return {
      group: group, body: body, plate: plate, plateCanvas: canvas, plateTex: plateTex, ring: ring,
      isPlayer: isPlayer,
      hp: -1, hitAt: 0,
      prevPos: null, moveFrom: null, moveTo: null, moveStart: 0, moveDur: 0.34
    };
  }

  function updateUnits(c) {
    const alive = new Set();
    const now = performance.now() / 1000;
    for (const u of c.units || []) {
      if (u.hp <= 0) continue;
      alive.add(u.id);
      let entry = unitObjects.get(u.id);
      if (!entry) {
        entry = createUnit(u, c);
        unitObjects.set(u.id, entry);
      }
      // 受击拖后到「打击帧」再抖：施法前冲要 0.26s 才到位，同一帧就抖会像隔空挨打
      if (entry.hp >= 0 && u.hp < entry.hp) {
        queueHit(entry, entry.hp - u.hp, u.id, now);
      }
      // 预计伤害变了也要重绘（换了技能、换了目标、BUFF 变了都会变）
      const forecastTotal = u.forecast?.total ?? null;
      if (entry.hp !== u.hp || entry.intent !== u.intent || entry.forecastTotal !== forecastTotal) {
        drawPlate(entry.plateCanvas, u);
        entry.plateTex.needsUpdate = true;
      }
      entry.hp = u.hp;
      entry.intent = u.intent;
      entry.forecastTotal = forecastTotal;

      const p = cellPos(u.col, u.row, c.width, c.height);
      if (entry.prevPos &&
          (Math.abs(entry.prevPos.x - p.x) > 0.01 || Math.abs(entry.prevPos.z - p.z) > 0.01)) {
        entry.moveFrom = entry.prevPos;
        entry.moveTo = p;
        entry.moveStart = performance.now() / 1000;
      }
      entry.prevPos = p;
      entry.group.position.set(p.x, 0, p.z);
      entry.group.userData.home = p;
      entry.ring.visible = u.id === c.activeUnitId;
    }
    for (const [id, entry] of unitObjects) {
      if (alive.has(id)) continue;
      boardGroup.remove(entry.group);
      unitObjects.delete(id);
    }
    pendingCast = null;     // 只在「动作结算后到渲染完」这一次窗口里有效
  }

  // 把一次掉血按「判定次数」拆成几段，一段接一段地跳数字。
  // 判定数来自服务端 lastAction.dice：3 次判定就跳三下，而不是糊成一个总数。
  function queueHit(entry, delta, unitId, now) {
    entry.hitQueue = entry.hitQueue || [];
    const dice = Math.max(1, Math.min(6, pendingCast?.dice || 1));
    const segments = delta >= dice && dice > 1 ? dice : 1;
    if (segments === 1) {
      entry.hitQueue.push({ at: now + IMPACT_DELAY, delta });
      return;
    }
    const base = Math.floor(delta / segments);
    let rest = delta - base * segments;
    for (let i = 0; i < segments; i++) {
      const v = base + (rest > 0 ? 1 : 0);
      if (rest > 0) rest--;
      entry.hitQueue.push({ at: now + IMPACT_DELAY + i * 0.14, delta: v });
    }
  }

  // 外部（app.js）在动作结算后、渲染前把这次动作的表现快照塞进来，
  // 这样 updateUnits 排队受击时就知道该拆几段
  let pendingCast = null;
  function setPendingCast(detail) {
    pendingCast = detail || null;
  }

  function animateUnits(now) {
    for (const entry of unitObjects.values()) {
      const home = entry.group.userData.home;
      if (!home) continue;
      // 打击帧：队列里到点的一次伤害才真正抖起来、同时飘字
      if (entry.hitQueue && entry.hitQueue.length && now >= entry.hitQueue[0].at) {
        while (entry.hitQueue.length && now >= entry.hitQueue[0].at) {
          const hit = entry.hitQueue.shift();
          entry.hitAt = now + 0.28;
          const pos = entry.group.userData.home;
          // 玩家立绘和名字牌更高，飘字也跟着抬高，别压在牌上
          if (pos) spawnDamageText(pos.x, pos.z, hit.delta, hit.miss, entry.isPlayer ? 2.15 : 1.8);
          if (hit.delta > 0) shakeScreen();
        }
      }
      // 受击后退：沿 -Z 方向短促位移 + 轻微抖动
      let offset = 0;
      let shake = 0;
      if (entry.hitAt > now) {
        const k = (entry.hitAt - now) / 0.28;
        offset = Math.sin(k * Math.PI) * 0.22;
        shake = Math.sin(now * 90) * 0.03 * k;
      }
      let px = home.x;
      let pz = home.z;
      let py = 0;
      if (entry.moveFrom && now < entry.moveStart + entry.moveDur) {
        const k = Math.min(1, (now - entry.moveStart) / entry.moveDur);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        px = entry.moveFrom.x + (entry.moveTo.x - entry.moveFrom.x) * e;
        pz = entry.moveFrom.z + (entry.moveTo.z - entry.moveFrom.z) * e;
        py = Math.sin(k * Math.PI) * 0.3;   // 轻跳一下，让移动看得见
      }
      // 原地抬手：远程/群体技能用「上浮一下」代替前冲
      if (entry.liftUntil > now) {
        py += Math.sin(((entry.liftUntil - now) / 0.3) * Math.PI) * 0.18;
      }
      entry.group.position.set(px + shake, py, pz - offset);
      if (entry.lungeUntil > now) {
        const lk = (entry.lungeUntil - now) / 0.26;
        const amp = Math.sin(lk * Math.PI) * 0.26;
        entry.group.position.x += (entry.lungeX || 0) * amp;
        entry.group.position.z += (entry.lungeZ || 0) * amp;
      }
      if (entry.ring.visible) {
        const pulse = 1 + Math.sin(now * 4.2) * 0.07;
        entry.ring.scale.set(pulse, pulse, 1);
        entry.ring.material.opacity = 0.6 + Math.sin(now * 4.2) * 0.25;
      }
    }
  }

  function hexDistance(c1, r1, c2, r2) {
    const toCube = (col, row) => {
      const x = col - (row - (row & 1)) / 2;
      const z = row;
      return { x, z, y: -x - z };
    };
    const a = toCube(c1, r1);
    const b = toCube(c2, r2);
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
  }

  function updateCells(c, opts) {
    const reachable = new Set((c.reachable || []).map(h => `${h.col},${h.row}`));
    const terrain = new Map((c.terrain || []).map(t => [`${t.col},${t.row}`, t]));
    // 0.24 主脑「协议覆写」：关闭的格子用暗红底色 + 高自发光标出来，玩家一眼能躲
    const closed = new Set((c.bossMechanic?.closedCells) || []);
    const active = (c.units || []).find(u => u.id === c.activeUnitId);
    const range = (opts && opts.range) || 0;
    for (const [key, mesh] of cellMeshes) {
      const t = terrain.get(key);
      const base = terrainColor(t);
      const isReach = reachable.has(key);
      const isClosed = closed.has(key);
      const parts = key.split(',');
      const inRange = range > 0 && active && hexDistance(active.col, active.row, +parts[0], +parts[1]) <= range;
      mesh.material.color.setHex(base);
      let emissive = t ? 0x101820 : 0x0a1620;
      let intensity = 1;
      if (isClosed) { mesh.material.color.setHex(0x5a1020); emissive = 0x8a1230; intensity = 2.0; }
      else if (isReach) { emissive = 0x1d6a4a; intensity = 1.5; }
      else if (inRange) { emissive = 0x6a2a12; intensity = 1.35; }
      mesh.material.emissive.setHex(emissive);
      mesh.material.emissiveIntensity = intensity * 0.8;
      mesh.material.opacity = isClosed ? 0.46 : (isReach ? 0.42 : 0.28);
    }
  }

  function render(combat, opts) {
    if (!window.THREE) return false;
    mount();
    if (!mounted || !canvas) return false;
    if (!combat) {
      visible = false;
      canvas.style.display = 'none';
      // 退出战斗：把上一场的棋盘和单位一起释放，避免残留对象
      if (mounted) disposeBoard();
      return false;
    }
    const host = document.getElementById('combat-wrap');
    if (!host || host.classList.contains('hidden')) { visible = false; return false; }

    canvas.style.display = 'block';
    visible = true;
    current = combat;
    setBackdrop(opts && opts.backdrop ? opts.backdrop : '');
    // 视角：外部传 focus 时锁到那个单位，空字符串回全景
    if (opts && Object.prototype.hasOwnProperty.call(opts, 'focus')) setFocus(opts.focus);
    const wasBuilt = builtKey;
    resize();
    buildBoard(combat);
    updateCells(combat, opts || {});
    updateUnits(combat);
    if (builtKey !== wasBuilt) camReady = false;   // 换棋盘直接跳机位，别从上一场滑过来
    updateCamera();
    return true;
  }

  function spawnRing(col, row, radius, color, delay) {
    if (!current) return;
    const p = cellPos(col, row, current.width, current.height);
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.46, 44),
      new THREE.MeshBasicMaterial({
        color: color, transparent: true, opacity: 0.95,
        side: THREE.DoubleSide, depthWrite: false
      })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(p.x, 0.07, p.z);
    scene.add(mesh);
    effects.push({ mesh: mesh, born: performance.now() / 1000 + (delay || 0), life: 0.85, target: radius });
  }

  function animateEffects(now) {
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i];
      const k = (now - e.born) / e.life;
      if (k < 0) continue;
      if (k >= 1) {
        if (e.kind === 'text') {
          releaseText(e.pool);
        } else {
          scene.remove(e.mesh);
          if (e.mesh.geometry) e.mesh.geometry.dispose();
          e.mesh.material.dispose();
        }
        effects.splice(i, 1);
        continue;
      }
      if (e.kind === 'text') {
        // 飘字：先快速淡入，然后上浮并淡出
        const sprite = e.pool.sprite;
        sprite.position.y = e.baseY + k * 0.7;
        sprite.material.opacity = k < 0.12 ? k / 0.12 : Math.max(0, 1 - Math.pow(k, 1.8));
        const pop = 1 + Math.sin(Math.min(1, k * 4) * Math.PI * 0.5) * 0.18;
        sprite.scale.set(e.w * pop, e.h * pop, 1);
        continue;
      }
      const scl = 0.5 + k * e.target * 2.6;
      e.mesh.scale.set(scl, scl, 1);
      e.mesh.material.opacity = 0.95 * (1 - k) * (1 - k);
    }
  }

  // 打击帧的轻微震屏：只抖 canvas，不影响布局
  function shakeScreen() {
    if (!canvas) return;
    canvas.classList.remove('hit-shake');
    void canvas.offsetWidth;          // 强制重排，让动画能连续触发
    canvas.classList.add('hit-shake');
    clearTimeout(shakeScreen._t);
    shakeScreen._t = setTimeout(() => canvas.classList.remove('hit-shake'), 200);
  }

  // 飘字对象池：一场仗几十上百次飘字，每次 new CanvasTexture 会堆 GC
  const textPool = [];

  function acquireText() {
    let item = textPool.find(p => !p.busy);
    if (!item) {
      const canvas = document.createElement('canvas');
      canvas.width = 192;
      canvas.height = 96;
      const tex = new THREE.CanvasTexture(canvas);
      tex.encoding = THREE.sRGBEncoding;
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: tex, transparent: true, depthTest: false, depthWrite: false
      }));
      sprite.renderOrder = 20;
      sprite.visible = false;
      item = { canvas, ctx: canvas.getContext('2d'), tex, sprite, busy: false };
      textPool.push(item);
    }
    item.busy = true;
    item.sprite.visible = true;
    return item;
  }

  function releaseText(item) {
    item.busy = false;
    item.sprite.visible = false;
    if (item.sprite.parent) item.sprite.parent.remove(item.sprite);
  }

  // 伤害飘字：在打击帧从单位头顶浮起，数值取本次掉的血
  function spawnDamageText(x, z, delta, miss, baseY) {
    if (!window.THREE) return;
    const y = baseY || 1.85;
    const item = acquireText();
    const { ctx, canvas } = item;
    const value = Math.max(0, delta | 0);
    const text = miss || value <= 0 ? 'MISS' : '-' + value;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = 'bold 56px "Segoe UI", "Microsoft YaHei", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(4, 8, 14, .85)';
    ctx.strokeText(text, 96, 50);
    ctx.fillStyle = miss || value <= 0 ? '#d3e2f2' : (value >= 12 ? '#ff5a6a' : '#ffd166');
    ctx.fillText(text, 96, 50);
    item.tex.needsUpdate = true;
    const w = 0.92;
    const h = w * 0.5;
    item.sprite.scale.set(w, h, 1);
    item.sprite.position.set(x + (Math.random() - 0.5) * 0.16, y, z);
    item.sprite.material.opacity = 1;
    scene.add(item.sprite);
    effects.push({
      kind: 'text', pool: item, born: performance.now() / 1000,
      life: 0.95, baseY: y, w, h
    });
  }

  // 施法：近战前冲，远程/群体原地抬手；落点按真实受影响单位逐格扩散
  window.addEventListener('battle3d-cast', (ev) => {
    const d = ev.detail || {};
    if (!current || !d.casterId) return;
    const entry = unitObjects.get(d.casterId);
    if (entry && entry.group.userData.home) {
      if (d.ranged) {
        entry.liftUntil = performance.now() / 1000 + 0.3;
      } else {
        const from = entry.group.userData.home;
        const to = cellPos(d.targetCol, d.targetRow, current.width, current.height);
        const dx = to.x - from.x;
        const dz = to.z - from.z;
        const len = Math.hypot(dx, dz) || 1;
        entry.lungeX = dx / len;
        entry.lungeZ = dz / len;
        entry.lungeUntil = performance.now() / 1000 + 0.26;
      }
    }

    const area = d.area || 0;
    const color = area > 0 ? 0xffb45a : 0x8ff0ff;
    // 没掉血的判定也要有反馈：服务端逐目标结算里 damage<=0 的，补一个 MISS
    if (Array.isArray(d.hits)) {
      const at = performance.now() / 1000 + IMPACT_DELAY;
      for (const h of d.hits) {
        if (h.damage > 0) continue;
        const target = unitObjects.get(h.targetId);
        if (!target || !target.group.userData.home) continue;
        target.hitQueue = target.hitQueue || [];
        target.hitQueue.push({ at, delta: 0 });
      }
    }
    const inBounds = (col, row) => col >= 0 && col < current.width && row >= 0 && row < current.height;
    const targets = Array.isArray(d.targets) ? d.targets : null;
    if (targets && targets.length) {
      // 群体技：每个真正被命中的单位脚下各亮一环，比以自己为圆心扩散更准
      targets.forEach((t, i) => {
        if (!inBounds(t.col, t.row)) return;
        spawnRing(t.col, t.row, area > 0 ? 0.95 : 0.7, color, i * 0.05);
        if (area > 0) {
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              if (dc === 0 && dr === 0) continue;
              const cc = t.col + dc;
              const rr = t.row + dr;
              if (!inBounds(cc, rr)) continue;
              if (hexDistance(t.col, t.row, cc, rr) > 1) continue;
              spawnRing(cc, rr, 0.4, color, i * 0.05 + 0.06);
            }
          }
        }
      });
      return;
    }

    spawnRing(d.targetCol, d.targetRow, area > 0 ? 1 + area * 0.7 : 0.7, color, 0);
    if (area > 0) {
      for (let dr = -area; dr <= area; dr++) {
        for (let dc = -area; dc <= area; dc++) {
          if (dc === 0 && dr === 0) continue;
          const cc = d.targetCol + dc;
          const rr = d.targetRow + dr;
          if (!inBounds(cc, rr)) continue;
          if (hexDistance(d.targetCol, d.targetRow, cc, rr) > area) continue;
          spawnRing(cc, rr, 0.4, color, 0.07);
        }
      }
    }
  });

  /* ── 拾取：屏幕空间距离匹配 ─────────────────────────────────
     不用 raycaster：把格子和单位投影到屏幕，取离鼠标最近且在阈值内的。
     比射线更稳，也不会被透明 Sprite / 相机矩阵边界坑到。 */
  function projectToScreen(x, y, z) {
    camera.updateMatrixWorld(true);
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    camera.updateProjectionMatrix();
    const v = new THREE.Vector3(x, y, z).project(camera);
    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.left + (v.x * 0.5 + 0.5) * rect.width,
      y: rect.top + (-v.y * 0.5 + 0.5) * rect.height
    };
  }

  function pickAt(clientX, clientY) {
    let best = null;
    const unitRadius = 42;
    for (const [id, entry] of unitObjects) {
      const p = entry.group.position;
      const s = projectToScreen(p.x, 0.6, p.z);
      const d = Math.hypot(s.x - clientX, s.y - clientY);
      if (d <= unitRadius && (!best || d < best.d)) best = { kind: 'unit', unitId: id, d: d };
    }
    if (best) return best;

    const cellRadius = 46;
    for (const [key, mesh] of cellMeshes) {
      const p = mesh.position;
      const s = projectToScreen(p.x, 0, p.z);
      const d = Math.hypot(s.x - clientX, s.y - clientY);
      if (d <= cellRadius && (!best || d < best.d)) {
        best = { kind: 'hex', col: mesh.userData.col, row: mesh.userData.row, d: d };
      }
    }
    return best;
  }

  function onPointerMove(ev) {
    if (!renderer || !mounted || !current) return;
    const hit = pickAt(ev.clientX, ev.clientY);
    let over = false;
    if (hit && hit.kind === 'hex') {
      over = (current.reachable || []).some(h => h.col === hit.col && h.row === hit.row);
    }
    canvas.style.cursor = over ? 'pointer' : (hit && hit.kind === 'unit' ? 'crosshair' : 'default');
  }

  function onPointerDown(ev) {
    if (!renderer || !mounted) return;
    const hit = pickAt(ev.clientX, ev.clientY);
    if (!hit) return;
    window.dispatchEvent(new CustomEvent('battle3d-pick', {
      detail: hit.kind === 'unit'
        ? { kind: 'unit', unitId: hit.unitId }
        : { kind: 'hex', col: hit.col, row: hit.row }
    }));
  }

  window.Battle3D = {
    render,
    setBackdrop,
    focus: setFocus,
    pendingCast: setPendingCast,
    _debug: () => ({
      pool: textPool.length,
      busy: textPool.filter(p => p.busy).length,
      effects: effects.length,
      backdrop: bgUrl,
      hasBackdrop: !!bgTex,
      pending: pendingCast ? { dice: pendingCast.dice, hits: pendingCast.hits?.length ?? 0 } : null,
      queues: [...unitObjects.values()].map(e => e.hitQueue?.length || 0).filter(n => n > 0)
    })
  };
})();
