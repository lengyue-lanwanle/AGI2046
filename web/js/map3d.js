/* 地图 3D 背景层：雨、浮尘、城市光点。DOM 地图卡片浮在上面，不参与交互。 */
(function () {
  const canvas = document.getElementById('map3d');
  if (!canvas || !window.THREE) return;

  const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x05070b, 14, 34);
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 120);
  camera.position.set(0, 5.4, 13);
  camera.lookAt(0, 1.2, 0);

  const RAIN_COUNT = 900;
  const rainGeo = new THREE.BufferGeometry();
  const rainPos = new Float32Array(RAIN_COUNT * 3);
  const rainSpeed = new Float32Array(RAIN_COUNT);
  for (let i = 0; i < RAIN_COUNT; i++) {
    rainPos[i * 3] = (Math.random() - 0.5) * 40;
    rainPos[i * 3 + 1] = Math.random() * 16;
    rainPos[i * 3 + 2] = -12 + Math.random() * 16;
    rainSpeed[i] = 3.2 + Math.random() * 4.5;
  }
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({
    color: 0x9fe8ff, size: 0.045, transparent: true, opacity: 0.55, depthWrite: false, sizeAttenuation: true
  }));
  scene.add(rain);

  const SPARK_COUNT = 140;
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(SPARK_COUNT * 3);
  const sparkPhase = new Float32Array(SPARK_COUNT);
  for (let i = 0; i < SPARK_COUNT; i++) {
    sparkPos[i * 3] = (Math.random() - 0.5) * 38;
    sparkPos[i * 3 + 1] = Math.random() * 13;
    sparkPos[i * 3 + 2] = -14 + Math.random() * 12;
    sparkPhase[i] = Math.random() * Math.PI * 2;
  }
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
    color: 0xffc46b, size: 0.09, transparent: true, opacity: 0.75, depthWrite: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: true
  }));
  scene.add(sparks);

  let running = false;
  let last = performance.now();

  function resize() {
    const host = canvas.parentElement || canvas;
    const w = Math.max(320, host.clientWidth);
    const h = Math.max(240, host.clientHeight);
    renderer.setSize(w, h, false);
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function loop(now) {
    if (!running) return;
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    const arr = rainGeo.attributes.position.array;
    for (let i = 0; i < RAIN_COUNT; i++) {
      arr[i * 3 + 1] -= rainSpeed[i] * dt;
      if (arr[i * 3 + 1] < 0) {
        arr[i * 3 + 1] = 15 + Math.random() * 2;
        arr[i * 3] = (Math.random() - 0.5) * 40;
        arr[i * 3 + 2] = -12 + Math.random() * 16;
      }
    }
    rainGeo.attributes.position.needsUpdate = true;

    // 光点呼吸
    sparks.material.opacity = 0.55 + Math.sin(now / 700) * 0.2;
    sparks.rotation.y = Math.sin(now / 9000) * 0.05;

    renderer.render(scene, camera);
  }

  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
  }

  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });

  resize();
  start();
  window.Map3D = { start, stop };
})();
