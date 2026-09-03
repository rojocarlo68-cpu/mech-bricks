/* Mech Bricks — image → gravity bricks (Matter.js) */
(() => {
  const { Engine, Render, Runner, Bodies, Body, Composite, Events, Mouse, MouseConstraint } = Matter;

  const canvas = document.getElementById('c');
  const stage = document.getElementById('stage');
  const loading = document.getElementById('loading');
  const hint = document.getElementById('hint');
  const countEl = document.getElementById('count');
  const sizeSel = document.getElementById('size');
  const shatterBtn = document.getElementById('shatter');
  const resetBtn = document.getElementById('reset');

  const IMG_SRC = 'mech.jpeg';
  const MAX_BRICKS = 10000;
  const BG_THRESH = 245; // skip near-white / light grey studio bg

  let engine, runner, render;
  let brickBodies = [];
  let shattered = false;
  let walls = [];
  let imgData = null;
  let imgW = 0, imgH = 0;

  function size() {
    return {
      w: stage.clientWidth || window.innerWidth,
      h: stage.clientHeight || (window.innerHeight - 56),
    };
  }

  function isBackground(r, g, b, a) {
    if (a < 28) return true;
    // studio grey / white
    if (r > 200 && g > 200 && b > 200) return true;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max - min < 18 && r > 160) return true; // flat grey
    return false;
  }

  function avgCell(data, iw, ix, iy, cell, sw, sh) {
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
    return {
      r: Math.round(r / n),
      g: Math.round(g / n),
      b: Math.round(b / n),
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
  }

  function addBounds(W, H) {
    const t = 80;
    const opts = { isStatic: true, render: { visible: false } };
    walls = [
      Bodies.rectangle(W / 2, H + t / 2, W + 200, t, opts), // floor
      Bodies.rectangle(-t / 2, H / 2, t, H * 2, opts),
      Bodies.rectangle(W + t / 2, H / 2, t, H * 2, opts),
    ];
    Composite.add(engine.world, walls);
  }

  function buildBricks(cell) {
    const { w: W, h: H } = size();
    clearWorld();
    addBounds(W, H);

    // Fit image into stage with padding
    const pad = 16;
    const availW = W - pad * 2;
    const availH = H - pad * 2 - 20;
    const fit = Math.min(availW / imgW, availH / imgH);
    const drawW = imgW * fit;
    const drawH = imgH * fit;
    const originX = (W - drawW) / 2;
    const originY = (H - drawH) / 2 + 8;

    // Grow cell a bit if needed so we stay near the target count (no stride skip).
    let useCell = cell;
    while (true) {
      const cols0 = Math.ceil(imgW / useCell);
      const rows0 = Math.ceil(imgH / useCell);
      if (cols0 * rows0 <= MAX_BRICKS * 1.35) break; // fg is less than full grid
      useCell += 1;
      if (useCell > cell + 12) break;
    }

    const cols = Math.ceil(imgW / useCell);
    const rows = Math.ceil(imgH / useCell);
    const brickPx = Math.max(3, useCell * fit * 0.98);
    const list = [];

    for (let iy = 0; iy < rows; iy++) {
      for (let ix = 0; ix < cols; ix++) {
        if (list.length >= MAX_BRICKS) break;
        const c = avgCell(imgData, imgW, ix, iy, useCell, 1, 1);
        if (!c) continue;
        const cx = originX + (ix * useCell + useCell / 2) * fit;
        const cy = originY + (iy * useCell + useCell / 2) * fit;
        const color = `rgb(${c.r},${c.g},${c.b})`;
        const body = Bodies.rectangle(cx, cy, brickPx, brickPx, {
          isStatic: true,
          friction: 0.35,
          frictionAir: 0.012,
          restitution: 0.08,
          density: 0.002,
          chamfer: { radius: Math.max(1, brickPx * 0.12) },
          render: {
            fillStyle: color,
            strokeStyle: 'rgba(0,0,0,0.25)',
            lineWidth: 0.5,
          },
        });
        body._brickColor = color;
        list.push(body);
      }
    }

    brickBodies = list;
    Composite.add(engine.world, list);
    countEl.textContent = `${list.length} ladrillos`;
    shattered = false;
    hint.classList.add('show');
  }

  function shatter() {
    if (shattered || !brickBodies.length) return;
    shattered = true;
    hint.classList.remove('show');
    for (const b of brickBodies) {
      Body.setStatic(b, false);
      Body.setVelocity(b, {
        x: (Math.random() - 0.5) * 2.2,
        y: (Math.random() - 0.2) * 1.5,
      });
      Body.setAngularVelocity(b, (Math.random() - 0.5) * 0.15);
    }
  }

  function reset() {
    const cell = parseInt(sizeSel.value, 10) || 10;
    buildBricks(cell);
  }

  function setupEngine() {
    const { w: W, h: H } = size();
    engine = Engine.create({ gravity: { x: 0, y: 1.15 } });
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

    // Soft pointer: drag a few bricks after shatter
    const mouse = Mouse.create(canvas);
    mouse.pixelRatio = render.options.pixelRatio;
    const mc = MouseConstraint.create(engine, {
      mouse,
      constraint: { stiffness: 0.15, render: { visible: false } },
    });
    Composite.add(engine.world, mc);
    render.mouse = mouse;

    // Tap empty area to shatter
    const onPointer = (e) => {
      if (!shattered) {
        e.preventDefault();
        shatter();
      }
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
    // Rebuild only if still assembled (cheaper UX)
    if (!shattered) reset();
    else {
      // just refresh walls positions roughly by rebuild static bounds
      Composite.remove(engine.world, walls);
      addBounds(W, H);
    }
  }

  shatterBtn.addEventListener('click', (e) => { e.stopPropagation(); shatter(); });
  resetBtn.addEventListener('click', (e) => { e.stopPropagation(); reset(); });
  sizeSel.addEventListener('change', () => reset());

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
