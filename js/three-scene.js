/* The Awesome Brothers — 3D hero world (three.js).
   Loaded as an ES module from every page. Each <canvas class="hero-3d" data-scene="...">
   gets its own little universe of floating shapes and drifting stars.

   We only ever boot when the browser really has WebGL and the visitor has not
   asked for reduced motion. If anything is missing the canvas stays empty and
   the CSS gradient underneath is what you see — the page never depends on this. */
import * as THREE from '../vendor/three.module.min.js';

const PRESETS = {
  red: {
    palette: [0xe63946, 0xffc93c, 0xff8fab, 0xffffff, 0xbc1a2a, 0xf4801a],
    lights: [0xffd0c4, 0xa8d5ff],
    shapes: 15, stars: 300, ring: false, spin: 0.15
  },
  blue: {
    palette: [0x2f7fd1, 0x35d0c0, 0x8fc7f2, 0xffffff, 0x1b5a9c, 0xf4801a],
    lights: [0xcfe6ff, 0xffdcb0],
    shapes: 15, stars: 300, ring: false, spin: 0.15
  },
  games: {
    palette: [0xe63946, 0xffc93c, 0x3aa6e8, 0x3fa96e, 0xff8fab, 0xffffff],
    lights: [0xfff0c9, 0xbcd9ff],
    shapes: 20, stars: 380, ring: true, spin: 0.2
  }
};

const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
  } catch (err) {
    return false;
  }
}

/* A handful of chunky low-poly shapes — the "toys" floating in the hero. */
function makeShape(THREE, palette, rng) {
  const kind = rng();
  const geo =
    kind < 0.3 ? new THREE.IcosahedronGeometry(0.5 + rng() * 0.35, 0)
      : kind < 0.5 ? new THREE.TetrahedronGeometry(0.55 + rng() * 0.35, 0)
        : kind < 0.68 ? new THREE.OctahedronGeometry(0.5 + rng() * 0.3, 0)
          : kind < 0.82 ? new THREE.BoxGeometry(0.6 + rng() * 0.5, 0.6 + rng() * 0.5, 0.6 + rng() * 0.5)
            : kind < 0.92 ? new THREE.TorusGeometry(0.42 + rng() * 0.22, 0.16, 10, 24)
              : new THREE.CylinderGeometry(0.42, 0.42, 0.14, 18);

  const color = new THREE.Color(palette[Math.floor(rng() * palette.length)]);
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.42,
    metalness: 0.16,
    flatShading: kind < 0.68,
    emissive: color.clone().multiplyScalar(0.06)
  });
  return new THREE.Mesh(geo, mat);
}

function boot(canvas) {
  const preset = PRESETS[canvas.getAttribute('data-scene')] || PRESETS.red;
  const host = canvas.parentElement || canvas;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch (err) {
    canvas.classList.add('fx-3d-off');
    return null;
  }
  if (!renderer || !renderer.getContext()) {
    canvas.classList.add('fx-3d-off');
    return null;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 100);
  camera.position.set(0, 0, 8.4);

  scene.add(new THREE.AmbientLight(0xffffff, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(3, 5, 6);
  scene.add(key);
  const glowA = new THREE.PointLight(preset.lights[0], 26, 26);
  glowA.position.set(-5, 3, 4);
  scene.add(glowA);
  const glowB = new THREE.PointLight(preset.lights[1], 22, 26);
  glowB.position.set(5, -3, 3);
  scene.add(glowB);

  /* --- floating shapes --- */
  const world = new THREE.Group();
  scene.add(world);
  let seed = 7;
  const rng = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  const toys = [];
  for (let i = 0; i < preset.shapes; i++) {
    const mesh = makeShape(THREE, preset.palette, rng);
    const angle = (i / preset.shapes) * Math.PI * 2 + rng() * 0.7;
    const radius = 2.1 + rng() * 2.6;
    mesh.position.set(
      Math.cos(angle) * radius,
      (rng() - 0.5) * 4.2,
      -1.6 + rng() * 3.2
    );
    mesh.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    const scale = 0.65 + rng() * 0.95;
    mesh.scale.setScalar(scale);
    mesh.userData = {
      spin: new THREE.Vector3((rng() - 0.5) * 0.42, (rng() - 0.5) * 0.42, (rng() - 0.5) * 0.42),
      bob: rng() * Math.PI * 2,
      bobAmp: 0.12 + rng() * 0.26,
      baseY: mesh.position.y,
      drift: 0.04 + rng() * 0.08
    };
    toys.push(mesh);
    world.add(mesh);
  }

  /* --- a big wireframe halo so the scene has depth --- */
  if (preset.ring) {
    const halo = new THREE.Mesh(
      new THREE.IcosahedronGeometry(3.55, 1),
      new THREE.MeshBasicMaterial({ color: preset.palette[0], wireframe: true, transparent: true, opacity: 0.16 })
    );
    halo.position.z = -2.2;
    world.add(halo);
    halo.userData = { spin: new THREE.Vector3(0.03, 0.05, 0.01), bob: 0, bobAmp: 0, baseY: 0, drift: 0 };
    toys.push(halo);
  }

  /* --- drifting star dust --- */
  const starCount = preset.stars;
  const positions = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < starCount; i++) {
    positions[i * 3] = (rng() - 0.5) * 17;
    positions[i * 3 + 1] = (rng() - 0.5) * 11;
    positions[i * 3 + 2] = -5 + rng() * 9;
    tmp.set(preset.palette[Math.floor(rng() * preset.palette.length)]);
    starColors[i * 3] = tmp.r;
    starColors[i * 3 + 1] = tmp.g;
    starColors[i * 3 + 2] = tmp.b;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    size: 0.085, vertexColors: true, transparent: true, opacity: 0.85,
    depthWrite: false, blending: THREE.AdditiveBlending
  }));
  scene.add(stars);

  /* --- sizing --- */
  function size() {
    const w = Math.max(1, host.clientWidth || window.innerWidth);
    const h = Math.max(1, host.clientHeight || window.innerHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  size();
  let resizeObs = null;
  if (window.ResizeObserver) {
    resizeObs = new ResizeObserver(size);
    resizeObs.observe(host);
  } else {
    window.addEventListener('resize', size, { passive: true });
  }

  /* --- pointer parallax --- */
  const aim = { x: 0, y: 0 };
  const eased = { x: 0, y: 0 };
  function onPointer(e) {
    const t = e.touches && e.touches[0] ? e.touches[0] : e;
    aim.x = (t.clientX / window.innerWidth - 0.5) * 2;
    aim.y = (t.clientY / window.innerHeight - 0.5) * 2;
  }
  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('touchmove', onPointer, { passive: true });

  /* --- pause when the hero is off screen or the tab is hidden --- */
  let visible = true;
  let onScreen = true;
  if (window.IntersectionObserver) {
    new IntersectionObserver((entries) => {
      onScreen = entries.some((entry) => entry.isIntersecting);
    }, { threshold: 0 }).observe(canvas);
  }
  document.addEventListener('visibilitychange', () => {
    visible = document.visibilityState !== 'hidden';
  });

  const clock = new THREE.Clock();
  let frame = 0;
  let stopped = false;
  let last = 0;

  function draw(dt, time) {
    eased.x += (aim.x - eased.x) * 0.05;
    eased.y += (aim.y - eased.y) * 0.05;
    world.rotation.y = eased.x * 0.28 + time * preset.spin * 0.1;
    world.rotation.x = -eased.y * 0.18;
    camera.position.x = eased.x * 0.55;
    camera.position.y = -eased.y * 0.35;
    camera.lookAt(0, 0, 0);

    for (let i = 0; i < toys.length; i++) {
      const mesh = toys[i];
      const d = mesh.userData;
      mesh.rotation.x += d.spin.x * dt;
      mesh.rotation.y += d.spin.y * dt;
      mesh.rotation.z += d.spin.z * dt;
      if (d.bobAmp) {
        mesh.position.y = d.baseY + Math.sin(time * 0.8 + d.bob) * d.bobAmp;
      }
    }
    stars.rotation.y = time * 0.02;
    stars.rotation.z = Math.sin(time * 0.12) * 0.06;
    glowA.position.x = Math.cos(time * 0.4) * 5;
    glowA.position.y = Math.sin(time * 0.3) * 3;
    glowB.position.x = Math.sin(time * 0.35) * 5;
    glowB.position.y = Math.cos(time * 0.28) * 3.4;

    renderer.render(scene, camera);
  }

  function loop() {
    if (stopped) { return; }
    frame = window.requestAnimationFrame(loop);
    const dt = Math.min(0.05, clock.getDelta());
    const now = clock.elapsedTime;
    /* While the hero is scrolled away we keep the loop alive but idle at 6fps
       so the page stays light on a phone. */
    if (!onScreen || !visible) {
      if (now - last < 0.16) { return; }
      last = now;
      draw(dt * 0.6, now);
      return;
    }
    draw(dt, now);
  }

  if (reduced) {
    draw(0.016, 0);
  } else {
    loop();
  }

  return {
    destroy: function () {
      stopped = true;
      if (frame) { window.cancelAnimationFrame(frame); }
      if (resizeObs) { resizeObs.disconnect(); }
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('touchmove', onPointer);
      toys.forEach((m) => {
        if (m.geometry) { m.geometry.dispose(); }
        if (m.material) { m.material.dispose(); }
      });
      starGeo.dispose();
      stars.material.dispose();
      renderer.dispose();
    }
  };
}

function start() {
  const canvases = Array.prototype.slice.call(document.querySelectorAll('canvas.hero-3d'));
  if (!canvases.length) { return; }
  if (reduced || !hasWebGL()) {
    canvases.forEach((c) => c.classList.add('fx-3d-off'));
    document.documentElement.classList.add('no-3d');
    return;
  }
  document.documentElement.classList.add('has-3d');
  canvases.forEach((canvas) => {
    try {
      boot(canvas);
    } catch (err) {
      canvas.classList.add('fx-3d-off');
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
