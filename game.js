/* Mech Bricks — piedra pesada, +7000 ladrillos, se parten con golpes */
(() => {
  const { Engine, Render, Runner, Bodies, Body, Composite, Events, Query, Mouse, MouseConstraint } = Matter;

  const canvas = document.getElementById('c');
  const stage = document.getElementById('stage');
  const loading = document.getElementById('loading');
  const hint = document.getElementById('hint');
  const countEl = document.getElementById('count');
  const shatterBtn = document.getElementById('shatter');
  const resetBtn = document.getElementById('reset');

  const IMG_SRC = 'mech.png';
  const MIN_BRICKS = 7000;
  const MAX_BRICKS = 12000;
  const MAX_BODIES = 16000;
  const BREAK_SPEED = 6.5;      // impacto entre cuerpos
  const HAMMER_SPEED = 9;       // golpe con el dedo
  const MAX_GEN = 2;            // cuántas veces puede partirse un ladrillo

  let engine, runner, render, mouseConstraint;
  let brickBodies = [];
  let shattered = false;
  let walls = [];
  let imgData = null;
  let imgW = 0, imgH = 0;
  let breaking = false;
  let lastHammer = 0;

  function size() {
    return {
      w: stage.clientWidth || window.innerWidth,
      h: stage.clientHeight || (window.innerHeight - 56),
    };
  }

  function isBackground(r, g, b, a) {
    // Cut-out PNG: transparent (and near-transparent) is empty space
    if (a < 28) return true;
    return false;
  }

  function avgCell(data, iw, ix, iy, cell) {
    let r = 0, g = 0, b = 0, n = 0;
    const x0 = Math.floor(ix * cell);
    const y0 = Math.floor(iy * cell);
    const x1 = Math.min(iw, x0 + cell);
    const y1 = Math.min(imgH, y0 + cell);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * iw + x) * 4;
        const a = data[i + 3];
        const rr = data[i], gg = data[i + 1], bb = data[i + 2];
        if (isBackground(rr, gg, bb, a)) continue;
        r += rr; g += gg; b += bb; n++;
      }
    }
    if (n < Math.max(2, (cell * cell) * 0.12)) return null;
    return { r: (r / n) | 0, g: (g / n) | 0, b: (b / n) | 0 };
  }

  function stoneOptions(color, gen) {
    return {
      friction: 0.95,
      frictionStatic: 1.2,
      frictionAir: 0.0015,
      restitution: 0.015,
      density: 0.045,
      slop: 0.02,
      render: {
        fillStyle: color,
        strokeStyle: 'rgba(0,0,0,0.45)',
        lineWidth: 0.6,
      },
      label: 'brick',
      plugin: { gen: gen || 0, color },
    };
  }

  function loadImage() {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const maxSide = 900;
        let w = img.naturalWidth, h = img.naturalHeight;
        const scale = Math.min(1, maxSide / Math.max(w, h));
        w = Math.round(w * scale);
        h = Math.round(h * scale);
        const off = document.createElement('canvas');
        off.width = w; off.height = h;
        const ctx = off.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        imgData = ctx.getImageData(0, 0, w, h).data;
        imgW = w; imgH = h;
        resolve();
      };
      img.onerror = reject;
      img.src = IMG_SRC;
    });
  }

  function clearWorld() {
    if (!engine) return;
    Composite.clear(engine.world, false);
    brickBodies = [];
    walls = [];
    if (mouseConstraint) Composite.add(engine.world, mouseConstraint);
  }

  function addBounds(W, H) {
    const t = 100;
    const opts = {
      isStatic: true,
      friction: 1,
      frictionStatic: 1,
      restitution: 0.01,
      render: { visible: false },
      label: 'wall',
    };
    walls = [
      Bodies.rectangle(W / 2, H + t / 2, W + 400, t, opts),
      Bodies.rectangle(-t / 2, H / 2, t, H * 3, opts),
      Bodies.rectangle(W + t / 2, H / 2, t, H * 3, opts),
    ];
    Composite.add(engine.world, walls);
  }

  function pickCellForMinBricks() {
    // Smaller cell → more bricks. Find largest cell that still yields >= MIN_BRICKS.
    for (let cell = 14; cell >= 5; cell--) {
      const cols = Math.ceil(imgW / cell);
      const rows = Math.ceil(imgH / cell);
      let n = 0;
      for (let iy = 0; iy < rows; iy++) {
        for (let ix = 0; ix < cols; ix++) {
          if (avgCell(imgData, imgW, ix, iy, cell)) n++;
          if (n >= MIN_BRICKS) return cell;
        }
      }
    }
    return 5;
  }

  function buildBricks() {
    const { w: W, h: H } = size();
    clearWorld();
    addBounds(W, H);

    const pad = 16;
    const availW = W - pad * 2;
    const availH = H - pad * 2 - 20;
    const fit = Math.min(availW / imgW, availH / imgH);
    const drawW = imgW * fit;
    const drawH = imgH * fit;
    const originX = (W - drawW) / 2;
    const originY = (H - drawH) / 2 + 8;

    const useCell = pickCellForMinBricks();
    const cols = Math.ceil(imgW / useCell);
    const rows = Math.ceil(imgH / useCell);
    const brickPx = Math.max(3.5, useCell * fit * 0.96);
    const list = [];

    for (let iy = 0; iy < rows; iy++) {
      for (let ix = 0; ix < cols; ix++) {
        if (list.length >= MAX_BRICKS) break;
        const c = avgCell(imgData, imgW, ix, iy, useCell);
        if (!c) continue;
        const cx = originX + (ix * useCell + useCell / 2) * fit;
        const cy = originY + (iy * useCell + useCell / 2) * fit;
        const color = `rgb(${c.r},${c.g},${c.b})`;
        const body = Bodies.rectangle(cx, cy, brickPx, brickPx, {
          ...stoneOptions(color, 0),
          isStatic: true,
        });
        body._brick = true;
        body._gen = 0;
        body._color = color;
        body._size = brickPx;
        list.push(body);
      }
    }

    brickBodies = list;
    Composite.add(engine.world, list);
    countEl.textContent = `${list.length} ladrillos`;
    shattered = false;
    hint.classList.add('show');
    hint.innerHTML = '<strong>Toca para derribar</strong><span>Piedra pesada — golpea para romper</span>';
  }

  function updateCount() {
    const n = brickBodies.filter((b) => b._brick && !b.isSleeping || b._brick).length;
    const live = engine.world.bodies.filter((b) => b._brick).length;
    countEl.textContent = `${live} ladrillos`;
  }

  function shatter() {
    if (shattered || !brickBodies.length) return;
    shattered = true;
    hint.classList.remove('show');
    // Separación mínima: caen como bloques, no flotan
    for (const b of brickBodies) {
      Body.setStatic(b, false);
      Body.setVelocity(b, {
        x: (Math.random() - 0.5) * 0.6,
        y: Math.random() * 0.3,
      });
      Body.setAngularVelocity(b, (Math.random() - 0.5) * 0.04);
    }
  }

  function splitBrick(body, nx, ny) {
    if (!body._brick || body._gen >= MAX_GEN) return;
    if (engine.world.bodies.length >= MAX_BODIES) return;
    const s = body._size || 8;
    if (s < 4.5) return;

    const gen = (body._gen || 0) + 1;
    const color = body._color || body.render.fillStyle;
    const half = s * 0.48;
    const cx = body.position.x;
    const cy = body.position.y;
    const vx = body.velocity.x;
    const vy = body.velocity.y;

    Composite.remove(engine.world, body);
    const idx = brickBodies.indexOf(body);
    if (idx >= 0) brickBodies.splice(idx, 1);

    const shards = [];
    const offsets = [
      [-0.28, -0.28], [0.28, -0.28],
      [-0.28, 0.28], [0.28, 0.28],
    ];
    // 2 o 4 fragmentos según generación
    const use = gen === 1 ? offsets : offsets.slice(0, 2);
    for (const [ox, oy] of use) {
      if (engine.world.bodies.length + shards.length >= MAX_BODIES) break;
      const shard = Bodies.rectangle(cx + ox * s, cy + oy * s, half, half, stoneOptions(color, gen));
      shard._brick = true;
      shard._gen = gen;
      shard._color = color;
      shard._size = half;
      Body.setVelocity(shard, {
        x: vx + (ox * 4) + (Math.random() - 0.5) * 2,
        y: vy + (oy * 3) - 1 + (Math.random() - 0.5),
      });
      Body.setAngularVelocity(shard, (Math.random() - 0.5) * 0.4);
      shards.push(shard);
    }
    Composite.add(engine.world, shards);
    brickBodies.push(...shards);
  }

  function relativeSpeed(a, b) {
    const dx = a.velocity.x - b.velocity.x;
    const dy = a.velocity.y - b.velocity.y;
    return Math.hypot(dx, dy);
  }

  function hammerAt(x, y) {
    const now = performance.now();
    if (now - lastHammer < 80) return;
    lastHammer = now;

    const hit = Query.point(brickBodies, { x, y });
    const radius = 42;
    const nearby = brickBodies.filter((b) => {
      if (!b._brick || b.isStatic) return false;
      const d = Math.hypot(b.position.x - x, b.position.y - y);
      return d < radius;
    });

    for (const b of nearby) {
      const dx = b.position.x - x;
      const dy = b.position.y - y;
      const d = Math.max(8, Math.hypot(dx, dy));
      const force = (1 - d / radius) * 0.08;
      Body.applyForce(b, b.position, {
        x: (dx / d) * force,
        y: (dy / d) * force - 0.04,
      });
      Body.setAngularVelocity(b, Body.getAngularVelocity(b) + (Math.random() - 0.5) * 0.3);
      if (Math.hypot(b.velocity.x, b.velocity.y) + force * 80 > HAMMER_SPEED * 0.35) {
        splitBrick(b, dx / d, dy / d);
      }
    }

    // Si tocaste un ladrillo directo, partelo seguro
    for (const b of hit) {
      if (b._brick && !b.isStatic) splitBrick(b, 0, -1);
    }
    updateCount();
  }

  function reset() {
    buildBricks();
  }

  function setupEngine() {
    const { w: W, h: H } = size();
    engine = Engine.create({
      gravity: { x: 0, y: 2.05 },
      positionIterations: 8,
      velocityIterations: 6,
      enableSleeping: true,
    });
    // Menos “goma”: solver más firme
    engine.world.gravity.scale = 0.001;

    render = Render.create({
      canvas,
      engine,
      options: {
        width: W,
        height: H,
        wireframes: false,
        background: 'transparent',
        pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      },
    });
    Render.run(render);
    runner = Runner.create();
    Runner.run(runner, engine);

    const mouse = Mouse.create(canvas);
    mouse.pixelRatio = render.options.pixelRatio;
    mouseConstraint = MouseConstraint.create(engine, {
      mouse,
      constraint: {
        stiffness: 0.85,
        damping: 0.1,
        render: { visible: false },
      },
    });
    Composite.add(engine.world, mouseConstraint);
    render.mouse = mouse;

    Events.on(engine, 'collisionStart', (ev) => {
      if (!shattered || breaking) return;
      breaking = true;
      const toBreak = [];
      for (const pair of ev.pairs) {
        const a = pair.bodyA;
        const b = pair.bodyB;
        const speed = relativeSpeed(a, b);
        // También velocidad absoluta del más rápido
        const absA = Math.hypot(a.velocity.x, a.velocity.y);
        const absB = Math.hypot(b.velocity.x, b.velocity.y);
        const impact = Math.max(speed, absA * 0.7, absB * 0.7);
        if (impact < BREAK_SPEED) continue;
        if (a._brick && a._gen < MAX_GEN) toBreak.push(a);
        if (b._brick && b._gen < MAX_GEN) toBreak.push(b);
      }
      // Limitar roturas por frame (rendimiento móvil)
      const uniq = [...new Set(toBreak)].slice(0, 18);
      for (const body of uniq) splitBrick(body, 0, 0);
      if (uniq.length) updateCount();
      breaking = false;
    });

    const onPointer = (e) => {
      const rect = canvas.getBoundingClientRect();
      const pt = e.touches ? e.touches[0] : e;
      const x = (pt.clientX - rect.left) * (canvas.width / rect.width) / (render.options.pixelRatio || 1);
      const y = (pt.clientY - rect.top) * (canvas.height / rect.height) / (render.options.pixelRatio || 1);
      // Corregir: Matter usa CSS pixels del canvas render
      const mx = (pt.clientX - rect.left) * (render.options.width / rect.width);
      const my = (pt.clientY - rect.top) * (render.options.height / rect.height);

      if (!shattered) {
        e.preventDefault();
        shatter();
        return;
      }
      hammerAt(mx, my);
    };
    canvas.addEventListener('pointerdown', onPointer, { passive: false });
  }

  function onResize() {
    if (!render) return;
    const { w: W, h: H } = size();
    render.canvas.width = W * render.options.pixelRatio;
    render.canvas.height = H * render.options.pixelRatio;
    render.canvas.style.width = W + 'px';
    render.canvas.style.height = H + 'px';
    render.options.width = W;
    render.options.height = H;
    render.bounds.max.x = W;
    render.bounds.max.y = H;
    if (!shattered) reset();
    else {
      Composite.remove(engine.world, walls);
      addBounds(W, H);
    }
  }

  shatterBtn.addEventListener('click', (e) => { e.stopPropagation(); shatter(); });
  resetBtn.addEventListener('click', (e) => { e.stopPropagation(); reset(); });

  window.addEventListener('resize', () => {
    clearTimeout(window.__rz);
    window.__rz = setTimeout(onResize, 120);
  });

  (async function init() {
    try {
      await loadImage();
      setupEngine();
      reset();
      loading.classList.add('hide');
    } catch (err) {
      loading.textContent = 'No pude cargar la imagen.';
      console.error(err);
    }
  })();
})();
