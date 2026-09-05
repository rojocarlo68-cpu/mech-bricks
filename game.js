/* Mech Arkanoid — ladrillos con soporte + gravedad realista, bombas, polvo */
(() => {
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const stage = document.getElementById('stage');
  const loading = document.getElementById('loading');
  const hint = document.getElementById('hint');
  const countEl = document.getElementById('count');
  const scoreEl = document.getElementById('scoreVal');
  const livesEl = document.getElementById('lives');
  const resetBtn = document.getElementById('reset');

  const MIN_BRICKS = 7000;
  const LEVELS = [
    { id: 1, name: 'Nivel 1', mech: 'mech-level1.png', bg: 'bg.jpg', paddleScale: 1.0, groundFrac: 0.93, dodge: false },
    { id: 2, name: 'Nivel 2', mech: 'mech-level2.png', bg: 'bg-level2.jpg', paddleScale: 0.98, groundFrac: 0.80, dodge: false },
    { id: 3, name: 'Nivel 3', mech: 'mech-level3.png', bg: 'bg-level2.jpg', paddleScale: 0.98, groundFrac: 0.80, dodge: true, mechScale: 0.7 },
    { id: 4, name: 'Nivel 4', mech: 'mech-level4.png', bg: 'bg-level4.jpg', paddleScale: 0.96, groundFrac: 0.88, dodge: true, fly: true, mechScale: 0.75, irregularBricks: true },
  ];
  let levelIndex = 0;
  function level() { return LEVELS[levelIndex]; }
  // ?level=2 para probar nivel 2 directo
  (function bootLevelFromUrl() {
    try {
      const q = new URLSearchParams(location.search);
      const n = parseInt(q.get('level') || q.get('n') || '1', 10);
      if (n >= 1 && n <= LEVELS.length) levelIndex = n - 1;
    } catch (_) {}
  })();

  const SHOP = [
    { id: 'heart', name: 'Corazón de vida', desc: '+1 vida al usar', icon: '❤️', price: 1080 },
    { id: 'laser', name: 'Pistola láser', desc: 'Cañones duales · ráfagas + enfriamiento', icon: '🔫', price: 1120 },
    { id: 'shield', name: 'Escudo', desc: 'Bloquea el próximo daño', icon: '🛡️', price: 1100 },
    { id: 'bomb', name: 'Bomba', desc: 'Arma y dispara desde el botón arriba', icon: '💣', price: 1090 },
    { id: 'paddle', name: 'Paleta grande', desc: 'Paleta +35% por 20s', icon: '📏', price: 1110 },
    { id: 'ballskin', name: 'Bola grabada', desc: 'Skin de bola · dureza +10%', icon: '🪩', price: 26799, minLevel: 3, img: 'ball-skin.png' },
  ];
  const PACK_MAX = 5;
  const MAX_BRICKS = 12000;
  const START_LIVES = 3;
  const BOMB_EVERY = 4.2;
  const EXPLODE_R = 78;
  const G = 0.42; // gravedad pesada

  let W = 0, H = 0, dpr = 1;
  let imgData = null, imgW = 0, imgH = 0;
  let bricks = [];
  let grid = null;
  let cols = 0, rows = 0, cell = 6;
  let brickPx = 8, cellScreen = 8;
  let originX = 0, originY = 0;
  let groundY = 0;
  let brickLayer = null;
  let paddle, ball;
  let running = false, launched = false, gameOver = false, won = false;
  let score = 0, lives = START_LIVES, aliveCount = 0;
  let pointerX = null;
  let lastTs = 0;
  let particles = [];
  let paddleImg = null;
  let paddleLaserImg = null;
  let paddleTrail = []; // estela azul
  let laserCannonsActive = false;
  let laserPhase = null; // 'fire' | 'cooldown'
  let laserPhaseT = 0;
  const LASER_FIRE_S = 1.0;
  const LASER_CD_S = 7.0;
  let laserCdEl = null;
  let laserCdFillEl = null;
  let bombImg = null;
  let bombArmedImg = null;
  let bombPlayerImg = null;
  let bombPlayerArmedImg = null;
  let bgImg = null;
  let bgT = 0;
  let bgDust = [];
  let bombs = [];
  let paused = false;
  let backpack = []; // ids de SHOP
  let shieldCharges = 0;
  let bigPaddleUntil = 0;
  let basePaddleW = 0;
  let minIy = 0, maxIy = 0;
  let camShake = 0; // cámara ansiosa / agitada
  let structureDX = 0;
  let structureDVX = 0;
  let structureDY = 0;
  let structureDVY = 0;
  let playerBombArmed = false;
  let playerBomb = null;
  let fitScale = 1;
  let ballSkinImg = null;
  let ballSkinOn = false;
  let baseBallR = 6;
  let bombTimer = 0;
  let structureCount = 0; // ladrillos aún en la estructura (no caídos)
  let outro = null; // null | 'slowmo' | 'done'
  let outroT = 0;   // tiempo real en cámara lenta

  function size() {
    return {
      w: stage.clientWidth || window.innerWidth,
      h: stage.clientHeight || (window.innerHeight - 56),
    };
  }

  function resizeCanvas() {
    const s = size();
    W = s.w; H = s.h;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function avgCell(ix, iy, cellSize) {
    let r = 0, g = 0, b = 0, n = 0;
    const x0 = ix * cellSize, y0 = iy * cellSize;
    const x1 = Math.min(imgW, x0 + cellSize);
    const y1 = Math.min(imgH, y0 + cellSize);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * imgW + x) * 4;
        if (imgData[i + 3] < 28) continue;
        r += imgData[i]; g += imgData[i + 1]; b += imgData[i + 2]; n++;
      }
    }
    if (n < Math.max(2, cellSize * cellSize * 0.12)) return null;
    return { r: (r / n) | 0, g: (g / n) | 0, b: (b / n) | 0 };
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
        const c = off.getContext('2d', { willReadFrequently: true });
        c.drawImage(img, 0, 0, w, h);
        imgData = c.getImageData(0, 0, w, h).data;
        imgW = w; imgH = h;
        resolve();
      };
      img.onerror = reject;
      img.src = level().mech;
    });
  }

  function pickCell() {
    for (let c = 14; c >= 5; c--) {
      const ccols = Math.ceil(imgW / c);
      const crows = Math.ceil(imgH / c);
      let n = 0;
      for (let iy = 0; iy < crows; iy++) {
        for (let ix = 0; ix < ccols; ix++) {
          if (avgCell(ix, iy, c)) {
            n++;
            if (n >= MIN_BRICKS) return c;
          }
        }
      }
    }
    return 5;
  }

  function shade(color, factor) {
    const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(color);
    if (!m) return color;
    return `rgb(${(m[1] * factor) | 0},${(m[2] * factor) | 0},${(m[3] * factor) | 0})`;
  }

  function drawBrickToLayer(br) {
    const lctx = brickLayer.getContext('2d');
    // La capa estática usa coords base (sin dodge)
    const lx = br.baseX != null ? br.baseX : br.x;
    const ly = br.baseY != null ? br.baseY : br.y;
    lctx.clearRect(lx - 0.6, ly - 0.6, br.w + 1.2, br.h + 1.2);
    if (!br.alive || br.falling || br.settled) return;
    const t = br.hp / br.maxHp;
    lctx.fillStyle = shade(br.color, 0.62 + 0.38 * t);
    lctx.fillRect(lx - 0.35, ly - 0.35, br.w + 0.7, br.h + 0.7);
    lctx.strokeStyle = shade(br.color, 0.45);
    lctx.lineWidth = 0.8;
    lctx.strokeRect(lx - 0.1, ly - 0.1, br.w + 0.2, br.h + 0.2);
    if (br.maxHp >= 2) {
      lctx.strokeStyle = 'rgba(255,196,70,0.55)';
      lctx.lineWidth = 1;
      lctx.strokeRect(lx + 0.6, ly + 0.6, br.w - 1.2, br.h - 1.2);
    }
  }

  function renderLives() {
    let rem = lives;
    livesEl.innerHTML = Array.from({ length: START_LIVES }, () => {
      const fill = Math.max(0, Math.min(1, rem));
      rem -= 1;
      return `<span class="heart-wrap"><span class="heart-fill" style="width:${(fill * 100).toFixed(1)}%">♥</span></span>`;
    }).join('');
  }

  function updateHud() {
    countEl.textContent = `${level().name} · ${structureCount} ladrillos`;
    scoreEl.textContent = `$${score}`;
    renderLives();
  }

  function stickBallToPaddle() {
    ball.x = paddle.x + paddle.w / 2;
    ball.y = paddle.y - ball.r - 2;
    ball.vx = 0;
    ball.vy = 0;
  }

  function activePaddleImg() {
    if (laserCannonsActive && paddleLaserImg) return paddleLaserImg;
    return paddleImg;
  }

  function paddleAspectRatio() {
    const img = activePaddleImg();
    if (img && img.naturalWidth > 0) {
      return img.naturalHeight / img.naturalWidth;
    }
    return 347 / 1075;
  }

  function paddleHeightForWidth(w) {
    const ar = paddleAspectRatio();
    const h = w * ar;
    return Math.max(26, Math.min(h, Math.max(52, w * 0.48)));
  }

  function cannonXs() {
    return [
      paddle.x + paddle.w * 0.12,
      paddle.x + paddle.w * 0.88,
    ];
  }

  function ensureLaserCdEls() {
    if (!laserCdEl) laserCdEl = document.getElementById('laserCd');
    if (!laserCdFillEl) laserCdFillEl = document.getElementById('laserCdFill');
  }

  function updateLaserCdUi() {
    ensureLaserCdEls();
    if (!laserCdEl) return;
    if (!laserCannonsActive) {
      laserCdEl.classList.remove('show', 'firing');
      return;
    }
    laserCdEl.classList.add('show');
    if (laserPhase === 'fire') {
      laserCdEl.classList.add('firing');
      if (laserCdFillEl) laserCdFillEl.style.width = '100%';
    } else {
      laserCdEl.classList.remove('firing');
      const t = Math.max(0, Math.min(1, laserPhaseT / LASER_CD_S));
      // depleting bar during cooldown
      if (laserCdFillEl) laserCdFillEl.style.width = (t * 100).toFixed(1) + '%';
    }
  }

  function clearLaserCannons() {
    laserCannonsActive = false;
    laserPhase = null;
    laserPhaseT = 0;
    updateLaserCdUi();
  }

  function startLaserCannons() {
    laserCannonsActive = true;
    laserPhase = 'fire';
    laserPhaseT = LASER_FIRE_S;
    // refrescar alto de paleta al cambiar de skin
    if (paddle) {
      const cx = paddle.x + paddle.w / 2;
      paddle.h = paddleHeightForWidth(paddle.w);
      paddle.y = H - 28 - paddle.h;
      paddle.x = Math.max(6, Math.min(W - paddle.w - 6, cx - paddle.w / 2));
    }
    updateLaserCdUi();
  }

  function brickCells(br) {
    return br.cells || [{ ix: br.ix, iy: br.iy }];
  }

  function clearBrickGrid(br, id) {
    for (const c of brickCells(br)) {
      const gi = c.iy * cols + c.ix;
      if (grid[gi] === id) grid[gi] = -1;
    }
  }

  function forEachNeighborBrick(br, fn) {
    const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    const seen = Object.create(null);
    for (const c of brickCells(br)) {
      for (let d = 0; d < dirs.length; d++) {
        const nix = c.ix + dirs[d][0];
        const niy = c.iy + dirs[d][1];
        if (nix < 0 || niy < 0 || nix >= cols || niy >= rows) continue;
        const id = grid[niy * cols + nix];
        if (id < 0 || seen[id]) continue;
        seen[id] = 1;
        fn(id);
      }
    }
  }

  function brickBottomIy(br) {
    let m = br.iy;
    for (const c of brickCells(br)) m = Math.max(m, c.iy);
    return m;
  }

  /** Soporte realista: toda la zona de pies es cimiento hasta que casi se destruye.
   *  Con fly:true, el núcleo flotante = componente conexa más grande (sin exigir piso). */
  function recomputeSupport() {
    const n = bricks.length;
    const supported = new Uint8Array(n);
    const q = [];
    const footCut = minIy + Math.floor((maxIy - minIy) * 0.80); // ~20% inferior = pies

    if (level().fly) {
      const comp = new Int32Array(n);
      comp.fill(-1);
      let bestSize = 0;
      let bestRoot = -1;
      for (let i = 0; i < n; i++) {
        const br = bricks[i];
        if (!br.alive || br.falling || br.settled || comp[i] >= 0) continue;
        const stack = [i];
        comp[i] = i;
        let size = 0;
        while (stack.length) {
          const cur = stack.pop();
          size++;
          forEachNeighborBrick(bricks[cur], (id) => {
            const nb = bricks[id];
            if (!nb.alive || nb.falling || nb.settled || comp[id] >= 0) return;
            comp[id] = i;
            stack.push(id);
          });
        }
        if (size > bestSize) { bestSize = size; bestRoot = i; }
      }
      for (let i = 0; i < n; i++) {
        if (comp[i] === bestRoot && bestRoot >= 0) {
          supported[i] = 1;
          q.push(i);
        }
      }
    } else {
      let footAlive = 0;
      let footTotal = 0;
      for (let i = 0; i < n; i++) {
        const br = bricks[i];
        if (brickBottomIy(br) < footCut) continue;
        footTotal++;
        if (br.alive && !br.falling && !br.settled) footAlive++;
      }
      // Semillas: cualquier ladrillo de la zona de pies vivo (no basta romper 1 del pie izq.)
      for (let i = 0; i < n; i++) {
        const br = bricks[i];
        if (!br.alive || br.falling || br.settled) continue;
        const onFloor = br.y + br.h >= groundY - 2;
        const inFeet = brickBottomIy(br) >= footCut;
        if (onFloor || inFeet) {
          supported[i] = 1;
          q.push(i);
        }
      }
      // Si quedan muy pocos pies (<12%), ya no sirven de cimiento amplio
      if (footTotal > 0 && footAlive / footTotal < 0.12) {
        q.length = 0;
        supported.fill(0);
        for (let i = 0; i < n; i++) {
          const br = bricks[i];
          if (!br.alive || br.falling || br.settled) continue;
          if (br.y + br.h >= groundY - 2) {
            supported[i] = 1;
            q.push(i);
          }
        }
      }

      // 8 vecinos = articulaciones más estables
      while (q.length) {
        const i = q.pop();
        forEachNeighborBrick(bricks[i], (id) => {
          if (supported[id]) return;
          const nb = bricks[id];
          if (!nb.alive || nb.falling || nb.settled) return;
          supported[id] = 1;
          q.push(id);
        });
      }
    }

    let detached = 0;
    for (let i = 0; i < n; i++) {
      const br = bricks[i];
      if (!br.alive || br.falling || br.settled) continue;
      if (supported[i]) continue;
      clearBrickGrid(br, i);
      br.falling = true;
      br.vx = (Math.random() - 0.5) * 0.55;
      br.vy = 0.15 + Math.random() * 0.35;
      drawBrickToLayer(br);
      detached++;
    }

    structureCount = 0;
    for (let i = 0; i < n; i++) {
      const br = bricks[i];
      if (br.alive && !br.falling && !br.settled) structureCount++;
    }
    if (detached > 80) {
      bumpCam(4.2);
      hint.classList.add('show');
      hint.innerHTML = '<strong>¡Se derrumba!</strong><span>Sin soporte, cae al suelo</span>';
      clearTimeout(window.__hintHide);
      window.__hintHide = setTimeout(() => {
        if (launched && !gameOver && !paused) hint.classList.remove('show');
      }, 1400);
    }
    updateHud();
    maybeWin();
  }

  function countFalling() {
    let n = 0;
    for (const br of bricks) if (br.alive && br.falling) n++;
    return n;
  }

  function startSlowMoOutro() {
    if (outro || won || gameOver) return;
    outro = 'slowmo';
    outroT = 0;
    bombs = [];
    if (ball) { ball.vx = 0; ball.vy = 0; }
    bumpCam(8);
    // Caos inicial: explosiones, humo, pedazos
    for (let i = 0; i < 7; i++) {
      const x = originX + Math.random() * (imgW * (cellScreen / Math.max(1, cell)));
      const y = originY + Math.random() * (groundY - originY) * 0.85;
      spawnDust(x, y, 'rgb(255,110,30)', 28, { spread: 2.4, up: 3.2, big: true, long: true, jitter: 30 });
      spawnDust(x, y, 'rgb(60,55,50)', 34, { ground: true, hemisphere: true, spread: 2.2, up: 2.6, big: true, long: true, jitter: 40 });
      spawnDust(x, y, 'rgb(200,200,200)', 18, { spread: 1.8, up: 2.0, long: true, jitter: 24 });
    }
    // Empujar escombros que ya caen
    for (const br of bricks) {
      if (!br.alive || !br.falling) continue;
      br.vx += (Math.random() - 0.5) * 4;
      br.vy -= Math.random() * 2.5;
    }
    hint.classList.add('show');
    hint.innerHTML = '<strong>Cámara lenta</strong><span>El mech se desmorona…</span>';
  }

  function syncLevelUrl() {
    try {
      const u = new URL(location.href);
      u.searchParams.set('level', String(levelIndex + 1));
      history.replaceState(null, '', u.pathname + u.search);
    } catch (_) {}
  }

  function finishOutro() {
    if (outro === 'done' || won) return;
    outro = 'done';
    launched = false;
    bombs = [];
    const hasNext = levelIndex + 1 < LEVELS.length;
    if (hasNext) {
      const nextName = LEVELS[levelIndex + 1].name;
      hint.classList.add('show');
      hint.innerHTML = `<strong>¡Mech destruido!</strong><span>Siguiente: ${nextName} · Toca o espera</span>`;
      updateHud();
      window.__gotoNext = true;
      setTimeout(() => { if (window.__gotoNext) startNextLevel(); }, 2200);
    } else {
      won = true;
      window.__gotoNext = false;
      hint.classList.add('show');
      hint.innerHTML = '<strong>¡Zona despejada!</strong><span>Completaste los niveles · Reinicia</span>';
      updateHud();
    }
  }

  async function startNextLevel() {
    window.__gotoNext = false;
    if (levelIndex + 1 >= LEVELS.length) return;
    levelIndex++;
    syncLevelUrl();
    loading.classList.remove('hide');
    loading.textContent = `Cargando ${level().name}…`;
    hint.classList.remove('show');
    try {
      await Promise.all([loadImage(), loadBg()]);
      buildLevel();
      loading.classList.add('hide');
    } catch (err) {
      loading.textContent = 'No pude cargar el nivel.';
      console.error(err);
    }
  }

  function maybeWin() {
    if (won || gameOver || outro === 'done') return;
    if (structureCount > 0) return;
    // Ya no hay estructura: si aún caen ladrillos → slow-mo; si no → victoria
    if (countFalling() > 0) startSlowMoOutro();
    else finishOutro();
  }

  function mergeIrregularBricks() {
    // Fusiona ~18% de semillas en ladrillos 2x2 / 2x1 / 1x2 / 3x2 (AABB opacos)
    const shapes = [
      { cw: 2, ch: 2 },
      { cw: 2, ch: 1 },
      { cw: 1, ch: 2 },
      { cw: 3, ch: 2 },
      { cw: 2, ch: 3 },
      { cw: 3, ch: 1 },
    ];
    const order = bricks.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = order[i]; order[i] = order[j]; order[j] = t;
    }
    const claimed = new Uint8Array(cols * rows);
    const keep = new Array(bricks.length).fill(true);
    let mergeSeeds = 0;
    const seedBudget = Math.max(1, (bricks.length * 0.18) | 0);

    for (const bi of order) {
      if (mergeSeeds >= seedBudget) break;
      if (!keep[bi]) continue;
      const seed = bricks[bi];
      if (claimed[seed.iy * cols + seed.ix]) continue;
      const sh = shapes[(Math.random() * shapes.length) | 0];
      const cells = [];
      let ok = true;
      for (let dy = 0; dy < sh.ch && ok; dy++) {
        for (let dx = 0; dx < sh.cw; dx++) {
          const ix = seed.ix + dx;
          const iy = seed.iy + dy;
          if (ix < 0 || iy < 0 || ix >= cols || iy >= rows) { ok = false; break; }
          const gi = iy * cols + ix;
          if (claimed[gi]) { ok = false; break; }
          const id = grid[gi];
          if (id < 0 || !keep[id]) { ok = false; break; }
          const ob = bricks[id];
          if (!ob.alive || (ob.cells && ob.cells.length > 1)) { ok = false; break; }
          cells.push({ ix, iy, id });
        }
      }
      if (!ok || cells.length < 2) continue;

      // Promedio de color
      let r = 0, g = 0, b = 0, n = 0;
      for (const c of cells) {
        const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(bricks[c.id].color);
        if (m) { r += +m[1]; g += +m[2]; b += +m[3]; n++; }
      }
      const color = n ? `rgb(${(r / n) | 0},${(g / n) | 0},${(b / n) | 0})` : seed.color;
      const bx = originX + seed.ix * cellScreen;
      const by = originY + seed.iy * cellScreen;
      const primary = bricks[bi];
      primary.cells = cells.map((c) => ({ ix: c.ix, iy: c.iy }));
      primary.cw = sh.cw;
      primary.ch = sh.ch;
      primary.baseX = bx;
      primary.baseY = by;
      primary.x = bx;
      primary.y = by;
      primary.w = sh.cw * cellScreen + (brickPx - cellScreen);
      primary.h = sh.ch * cellScreen + (brickPx - cellScreen);
      primary.color = color;
      for (const c of cells) {
        claimed[c.iy * cols + c.ix] = 1;
        if (c.id !== bi) keep[c.id] = false;
      }
      mergeSeeds++;
    }

    // Rebuild bricks + grid (solo keep)
    const old = bricks;
    const map = new Int32Array(old.length);
    map.fill(-1);
    bricks = [];
    for (let i = 0; i < old.length; i++) {
      if (!keep[i]) continue;
      map[i] = bricks.length;
      bricks.push(old[i]);
    }
    grid.fill(-1);
    groundY = 0;
    minIy = rows;
    maxIy = 0;
    for (let i = 0; i < bricks.length; i++) {
      const br = bricks[i];
      const cells = brickCells(br);
      for (const c of cells) {
        grid[c.iy * cols + c.ix] = i;
        minIy = Math.min(minIy, c.iy);
        maxIy = Math.max(maxIy, c.iy);
      }
      groundY = Math.max(groundY, br.baseY + br.h);
    }
    groundY += 0.5;
  }

  function buildLevel() {
    resizeCanvas();
    cell = pickCell();
    cols = Math.ceil(imgW / cell);
    rows = Math.ceil(imgH / cell);

    const pad = 12;
    const paddleSpace = 92;
    const availW = W - pad * 2;
    const availH = H - pad * 2 - paddleSpace;
    const mechScale = level().mechScale != null ? level().mechScale : 1;
    const fit = Math.min(availW / imgW, availH / imgH) * mechScale;
    cellScreen = cell * fit;
    // Cubrir todo el grid sin huecos al fondo
    brickPx = Math.max(3.5, cellScreen + 0.6);
    originX = (W - imgW * fit) / 2;
    // Con mech más chico, bajar un poco para que los pies queden cerca del suelo
    // Si vuela (L4), dejarlo más alto: pies sobre la franja de nubes
    const unusedH = availH - imgH * fit;
    const yBias = level().fly ? 0.28 : 0.55;
    originY = pad + 6 + Math.max(0, unusedH * yBias);

    bricks = [];
    grid = new Int32Array(cols * rows);
    grid.fill(-1);
    groundY = 0;
    minIy = rows;
    maxIy = 0;

    for (let iy = 0; iy < rows; iy++) {
      for (let ix = 0; ix < cols; ix++) {
        if (bricks.length >= MAX_BRICKS) break;
        const c = avgCell(ix, iy, cell);
        if (!c) continue;
        minIy = Math.min(minIy, iy);
        maxIy = Math.max(maxIy, iy);
        const maxHp = 1; // 1 golpe
        const bx = originX + ix * cellScreen;
        const by = originY + iy * cellScreen;
        const br = {
          ix, iy,
          baseX: bx,
          baseY: by,
          x: bx,
          y: by,
          w: brickPx,
          h: brickPx,
          color: `rgb(${c.r},${c.g},${c.b})`,
          hp: maxHp,
          maxHp,
          alive: true,
          falling: false,
          settled: false,
          vx: 0,
          vy: 0,
        };
        groundY = Math.max(groundY, br.y + br.h);
        grid[iy * cols + ix] = bricks.length;
        bricks.push(br);
      }
    }
    // Suelo justo bajo los pies
    groundY += 0.5;
    structureDX = 0;
    structureDVX = 0;
    structureDY = 0;
    structureDVY = 0;
    fitScale = fit;

    if (level().irregularBricks) mergeIrregularBricks();

    brickLayer = document.createElement('canvas');
    brickLayer.width = Math.floor(W * dpr);
    brickLayer.height = Math.floor(H * dpr);
    const lctx = brickLayer.getContext('2d');
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lctx.clearRect(0, 0, W, H);
    for (const br of bricks) drawBrickToLayer(br);

    structureCount = bricks.length;
    aliveCount = bricks.length;
    particles = [];
    bombs = [];
    playerBomb = null;
    playerBombArmed = false;
    setBombButton(false);
    bombTimer = 2.5;
    score = 0;
    lives = START_LIVES;
    gameOver = false;
    won = false;
    outro = null;
    outroT = 0;
    window.__outroDust = false;
    bgT = 0;
    bgDust = [];
    for (let i = 0; i < 28; i++) {
      bgDust.push({
        x: Math.random() * W,
        y: Math.random() * H * 0.55,
        r: 0.6 + Math.random() * 1.8,
        vx: 0.15 + Math.random() * 0.35,
        vy: (Math.random() - 0.5) * 0.08,
        a: 0.12 + Math.random() * 0.22,
      });
    }
    launched = false;
    updateHud();

    clearLaserCannons();
    basePaddleW = Math.min(168, W * 0.42) * (level().paddleScale || 1);
    const pw = basePaddleW;
    const ph = paddleHeightForWidth(pw);
    paddle = { w: pw, h: ph, x: (W - pw) / 2, y: H - 28 - ph, r: 7 };
    paddleTrail = [];
    bigPaddleUntil = 0;

    const diameter = Math.max(brickPx * 3.92, 12);
    baseBallR = diameter / 2;
    const r = ballSkinOn ? baseBallR * 1.1 : baseBallR;
    ball = {
      r,
      x: 0, y: 0, vx: 0, vy: 0,
      speed: Math.min(7.4, 5.4 + Math.min(2, W / 420)) * 0.7,
    };
    stickBallToPaddle();

    hint.classList.add('show');
    hint.innerHTML = '<strong>Desliza la paleta</strong><span>Sin soporte abajo, los ladrillos caen</span>';
    running = true;
  }

  function spawnDust(x, y, color, count, opts) {
    opts = opts || {};
    const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(color || 'rgb(140,90,50)');
    let r = m ? +m[1] : 140;
    let g = m ? +m[2] : 90;
    let b = m ? +m[3] : 50;
    // polvo más grisáceo en impactos de suelo
    if (opts.ground) {
      r = ((r + 160) / 2) | 0;
      g = ((g + 150) / 2) | 0;
      b = ((b + 130) / 2) | 0;
    }
    const n = count || (8 + (Math.random() * 6) | 0);
    const spread = opts.spread || 1;
    const up = opts.up || 0.8;
    for (let i = 0; i < n; i++) {
      const ang = opts.hemisphere
        ? -Math.PI + Math.random() * Math.PI // hacia arriba
        : Math.random() * Math.PI * 2;
      const sp = (0.5 + Math.random() * 3.4) * spread;
      // trayectorias impredecibles
      const jx = (Math.random() - 0.5) * 1.8 * spread;
      const jy = (Math.random() - 0.5) * 1.8 * spread;
      particles.push({
        x: x + (Math.random() - 0.5) * (opts.jitter || 4),
        y: y + (Math.random() - 0.5) * 2,
        vx: Math.cos(ang) * sp + jx,
        vy: Math.sin(ang) * sp - up + jy * 0.5,
        life: (opts.long ? 0.7 : 0.35) + Math.random() * (opts.long ? 0.9 : 0.45),
        maxLife: (opts.long ? 1.1 : 0.55) + Math.random() * (opts.long ? 0.8 : 0.35),
        size: (opts.big ? 2.2 : 1.1) + Math.random() * (opts.big ? 5.5 : 2.4),
        r, g, b,
        spin: (Math.random() - 0.5) * 0.4,
      });
    }
    if (particles.length > 900) particles.splice(0, particles.length - 900);
  }

  function spawnMetalSparks(x, y) {
    const palette = [
      [255, 255, 245],
      [255, 230, 120],
      [255, 180, 60],
      [255, 140, 40],
      [240, 240, 255],
    ];
    const n = 14 + (Math.random() * 10) | 0;
    for (let i = 0; i < n; i++) {
      const [r, g, b] = palette[(Math.random() * palette.length) | 0];
      const ang = -Math.PI + Math.random() * Math.PI; // hacia arriba / afuera
      const sp = 2.2 + Math.random() * 5.5;
      particles.push({
        x: x + (Math.random() - 0.5) * 10,
        y: y + (Math.random() - 0.5) * 4,
        vx: Math.cos(ang) * sp + (Math.random() - 0.5) * 1.5,
        vy: Math.sin(ang) * sp - (2.5 + Math.random() * 2.5),
        life: 0.18 + Math.random() * 0.28,
        maxLife: 0.28 + Math.random() * 0.28,
        size: 0.7 + Math.random() * 1.8,
        r, g, b,
        spin: (Math.random() - 0.5) * 0.8,
        metal: true,
      });
    }
    if (particles.length > 900) particles.splice(0, particles.length - 900);
  }

  function spawnCannonSmoke(x, y) {
    spawnDust(x, y, 'rgb(160,160,165)', 3 + (Math.random() * 3) | 0, {
      spread: 0.55, up: 1.6, long: true, jitter: 6, hemisphere: true,
    });
  }

  function spawnGroundCloud(x, intensity) {
    const k = intensity || 1;
    spawnDust(x, groundY - 2, 'rgb(120,100,80)', (18 * k) | 0, {
      ground: true, hemisphere: true, spread: 1.6 + k * 0.4, up: 1.4 + k, big: true, long: true, jitter: 28,
    });
    spawnDust(x, groundY - 4, 'rgb(90,85,80)', (12 * k) | 0, {
      ground: true, hemisphere: true, spread: 2.2, up: 2.2, big: true, long: true, jitter: 40,
    });
    // chispas / escombros impredecibles
    spawnDust(x, groundY - 6, 'rgb(255,160,60)', (6 * k) | 0, {
      spread: 2.8, up: 3.2, long: true, jitter: 10,
    });
  }

  function spawnLandingBurst(br) {
    const x = br.x + br.w / 2;
    spawnGroundCloud(x, 0.7 + Math.random() * 0.6);
    if (Math.random() < 0.35) {
      // mini explosión ocasional al impactar
      spawnDust(x, groundY - 8, 'rgb(255,100,30)', 16, { spread: 2.5, up: 3.5, big: true, long: true });
      spawnDust(x, groundY - 4, 'rgb(60,60,60)', 20, { ground: true, hemisphere: true, spread: 2, up: 2, big: true, long: true, jitter: 22 });
    }
  }

  function launch() {
    if (launched || gameOver || won) return;
    launched = true;
    hint.classList.remove('show');
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.65;
    ball.vx = Math.cos(angle) * ball.speed;
    ball.vy = Math.sin(angle) * ball.speed;
  }

  function checkGameOver() {
    if (lives > 0.001) return false;
    lives = 0;
    gameOver = true;
    launched = false;
    bombs = [];
    clearLaserCannons();
    hint.classList.add('show');
    hint.innerHTML = '<strong>Game over</strong><span>Pulsa Reiniciar</span>';
    updateHud();
    return true;
  }

  function loseLife() {
    if (shieldCharges > 0) {
      shieldCharges--;
      hint.classList.add('show');
      hint.innerHTML = '<strong>Escudo</strong><span>Daño bloqueado</span>';
      setTimeout(() => { if (!paused) hint.classList.remove('show'); }, 900);
      return;
    }
    lives = Math.max(0, lives - 1);
    bumpCam(3.2);
    updateHud();
    if (checkGameOver()) return;
    launched = false;
    stickBallToPaddle();
    hint.classList.add('show');
    hint.innerHTML = '<strong>Vida perdida</strong><span>Toca para lanzar de nuevo</span>';
  }

  function loseQuarterLife() {
    if (shieldCharges > 0) {
      shieldCharges--;
      return;
    }
    lives = Math.max(0, +(lives - 0.25).toFixed(2));
    updateHud();
    checkGameOver();
  }

  function destroyBrick(br, pts) {
    if (!br.alive || br.settled) return;
    const wasStructure = !br.falling;
    br.alive = false;
    br.falling = false;
    if (wasStructure) {
      const id = grid[br.iy * cols + br.ix];
      clearBrickGrid(br, id >= 0 ? id : bricks.indexOf(br));
    }
    score += pts;
    drawBrickToLayer(br);
    if (wasStructure) recomputeSupport();
    else updateHud();
  }

  function ballDamage() {
    return ballSkinOn ? 1.1 : 1; // +10% dureza
  }

  function hitBrick(br) {
    if (!br.alive || br.falling || br.settled) return;
    bumpCam(0.55);
    spawnDust(br.x + br.w / 2, br.y + br.h / 2, br.color, br.hp <= 1 ? 14 : 8);
    br.hp -= ballDamage();
    if (br.hp <= 0) {
      destroyBrick(br, br.maxHp * 10);
    } else {
      score += 5;
      drawBrickToLayer(br);
      updateHud();
    }
    const sp = Math.hypot(ball.vx, ball.vy);
    const boost = Math.min(6.8, sp * 1.002); // nivel 1: ramp suave
    const ang = Math.atan2(ball.vy, ball.vx);
    ball.vx = Math.cos(ang) * boost;
    ball.vy = Math.sin(ang) * boost;
    ball.speed = boost;
  }

  function explodeAt(x, y, radius, ptsPerBrick) {
    bumpCam(radius && radius > EXPLODE_R ? 7.2 : 5.5);
    const R = radius != null ? radius : EXPLODE_R;
    const pts = ptsPerBrick != null ? ptsPerBrick : 15;
    const r2 = R * R;
    spawnDust(x, y, 'rgb(255,120,40)', radius && radius > EXPLODE_R ? 56 : 40);
    spawnDust(x, y, 'rgb(80,80,80)', radius && radius > EXPLODE_R ? 36 : 24);
    const hitList = [];
    for (const br of bricks) {
      if (!br.alive || br.settled) continue;
      const cx = br.x + br.w / 2;
      const cy = br.y + br.h / 2;
      const d2 = (cx - x) * (cx - x) + (cy - y) * (cy - y);
      if (d2 <= r2) hitList.push(br);
    }
    // Destruir y luego un solo recompute
    for (const br of hitList) {
      spawnDust(br.x + br.w / 2, br.y + br.h / 2, br.color, 5);
      const wasStructure = !br.falling;
      const id = grid[br.iy * cols + br.ix];
      br.alive = false;
      br.falling = false;
      if (wasStructure) clearBrickGrid(br, id >= 0 ? id : bricks.indexOf(br));
      score += pts;
      drawBrickToLayer(br);
    }
    recomputeSupport();
  }

  function spawnBomb() {
    if (gameOver || won || !launched) return;
    const candidates = [];
    for (const br of bricks) {
      if (!br.alive || br.falling || br.settled) continue;
      candidates.push(br);
    }
    if (!candidates.length) return;
    candidates.sort((a, b) => a.x - b.x);
    const pickPool = candidates.slice(0, Math.max(8, (candidates.length * 0.35) | 0));
    const src = pickPool[(Math.random() * pickPool.length) | 0];
    bombs.push({
      x: src.x + src.w / 2,
      y: src.y + src.h / 2,
      vx: (Math.random() - 0.5) * 0.8,
      vy: 1.2,
      r: ball.r,
      reflected: false,
      alive: true,
    });
  }

  function collideBricksWithBall() {
    const ox = originX + structureDX;
    const oy = originY + structureDY;
    const ix0 = Math.floor((ball.x - ball.r - ox) / cellScreen) - 1;
    const iy0 = Math.floor((ball.y - ball.r - oy) / cellScreen) - 1;
    const ix1 = Math.floor((ball.x + ball.r - ox) / cellScreen) + 1;
    const iy1 = Math.floor((ball.y + ball.r - oy) / cellScreen) + 1;

    let hit = null;
    let bounceX = false;
    let bounceY = false;

    for (let iy = iy0; iy <= iy1; iy++) {
      if (iy < 0 || iy >= rows) continue;
      for (let ix = ix0; ix <= ix1; ix++) {
        if (ix < 0 || ix >= cols) continue;
        const id = grid[iy * cols + ix];
        if (id < 0) continue;
        const br = bricks[id];
        if (!br.alive || br.falling || br.settled) continue;
        const nx = Math.max(br.x, Math.min(ball.x, br.x + br.w));
        const ny = Math.max(br.y, Math.min(ball.y, br.y + br.h));
        const dx = ball.x - nx;
        const dy = ball.y - ny;
        if (dx * dx + dy * dy > ball.r * ball.r) continue;

        hit = br;
        const oL = (ball.x + ball.r) - br.x;
        const oR = (br.x + br.w) - (ball.x - ball.r);
        const oT = (ball.y + ball.r) - br.y;
        const oB = (br.y + br.h) - (ball.y - ball.r);
        if (Math.min(oL, oR) < Math.min(oT, oB)) bounceX = true;
        else bounceY = true;
        break;
      }
      if (hit) break;
    }

    if (!hit) return;
    if (bounceX) ball.vx *= -1;
    if (bounceY) ball.vy *= -1;
    ball.x += Math.sign(ball.vx || 1) * 0.6;
    ball.y += Math.sign(ball.vy || 1) * 0.6;
    hitBrick(hit);
  }

  function updateBombs(dt) {
    for (let i = bombs.length - 1; i >= 0; i--) {
      const b = bombs[i];
      if (!b.alive) { bombs.splice(i, 1); continue; }

      b.vy += 0.18 * dt * 60;
      b.x += b.vx * dt * 60;
      b.y += b.vy * dt * 60;

      if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx); }
      if (b.x + b.r > W) { b.x = W - b.r; b.vx = -Math.abs(b.vx); }

      if (
        b.vy > 0 &&
        b.y + b.r >= paddle.y &&
        b.y - b.r <= paddle.y + paddle.h &&
        b.x >= paddle.x - 4 &&
        b.x <= paddle.x + paddle.w + 4
      ) {
        b.y = paddle.y - b.r - 0.5;
        const hit = (b.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
        const ang = -Math.PI / 2 + Math.max(-1, Math.min(1, hit)) * 0.95;
        const sp = 6.2;
        b.vx = Math.cos(ang) * sp;
        b.vy = Math.sin(ang) * sp;
        b.reflected = true;
        spawnMetalSparks(b.x, paddle.y);
      }

      if (b.reflected) {
        const ox = originX + structureDX;
        const oy = originY + structureDY;
        const ix0 = Math.floor((b.x - b.r - ox) / cellScreen) - 1;
        const iy0 = Math.floor((b.y - b.r - oy) / cellScreen) - 1;
        const ix1 = Math.floor((b.x + b.r - ox) / cellScreen) + 1;
        const iy1 = Math.floor((b.y + b.r - oy) / cellScreen) + 1;
        let struck = false;
        for (let iy = iy0; iy <= iy1 && !struck; iy++) {
          if (iy < 0 || iy >= rows) continue;
          for (let ix = ix0; ix <= ix1; ix++) {
            if (ix < 0 || ix >= cols) continue;
            const id = grid[iy * cols + ix];
            if (id < 0) continue;
            const br = bricks[id];
            if (!br.alive || br.falling || br.settled) continue;
            const nx = Math.max(br.x, Math.min(b.x, br.x + br.w));
            const ny = Math.max(br.y, Math.min(b.y, br.y + br.h));
            const dx = b.x - nx, dy = b.y - ny;
            if (dx * dx + dy * dy <= b.r * b.r) {
              explodeAt(b.x, b.y);
              b.alive = false;
              struck = true;
              break;
            }
          }
        }
      }

      if (!b.alive) { bombs.splice(i, 1); continue; }

      if (b.y - b.r > H + 6) {
        if (!b.reflected) loseQuarterLife();
        bombs.splice(i, 1);
      }
    }
  }

  function updateFalling(dt) {
    const step = dt * 60;
    let landed = 0;
    let landX = 0;
    for (const br of bricks) {
      if (!br.alive || !br.falling || br.settled) continue;
      br.vy += G * step; // pesados
      br.x += br.vx * step;
      br.y += br.vy * step;
      br.vx *= 0.998;

      // Rebote suave entre escombros ya amontonados (altura de pila)
      let stackTop = groundY;
      // muestreo barato: unos settled cercanos
      for (let k = 0; k < 6; k++) {
        const o = bricks[(Math.random() * bricks.length) | 0];
        if (!o.alive || !o.settled) continue;
        if (Math.abs(o.x - br.x) > br.w * 1.2) continue;
        stackTop = Math.min(stackTop, o.y);
      }

      if (br.y + br.h >= stackTop) {
        br.y = stackTop - br.h;
        // amontonar con un poco de desorden
        br.x += (Math.random() - 0.5) * br.w * 0.35;
        br.vx *= 0.25;
        br.vy = 0;
        br.falling = false;
        br.settled = true;
        landed++;
        landX += br.x + br.w / 2;
        spawnLandingBurst(br);
        continue;
      }
      // Nunca desaparecen: si se van muy abajo, clavar en suelo
      if (br.y > H) {
        br.y = groundY - br.h;
        br.falling = false;
        br.settled = true;
        landed++;
        landX += br.x + br.w / 2;
        spawnLandingBurst(br);
      }
    }
    // Nube grande si caen muchos a la vez
    if (landed >= 12) {
      spawnGroundCloud(landX / landed, 1.6 + Math.min(2.5, landed / 40));
      // varias bocanadas a lo largo del suelo
      for (let i = 0; i < 5; i++) {
        spawnGroundCloud(originX + Math.random() * (W * 0.6) + W * 0.2, 1.1);
      }
    } else if (landed >= 3) {
      spawnGroundCloud(landX / landed, 1.0);
    }
  }


  function applyStructureOffset() {
    for (const br of bricks) {
      if (!br.alive || br.falling || br.settled) continue;
      br.x = br.baseX + structureDX;
      br.y = br.baseY + structureDY;
    }
  }

  function updateDodgeAI(dt) {
    const canMove = level().dodge || level().fly;
    if (!canMove || !launched || gameOver || won || outro) {
      structureDVX *= 0.9;
      structureDVY *= 0.9;
      return;
    }
    const flying = !!level().fly;
    // Centro actual del mech
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, n = 0;
    for (const br of bricks) {
      if (!br.alive || br.falling || br.settled) continue;
      minX = Math.min(minX, br.x); maxX = Math.max(maxX, br.x + br.w);
      minY = Math.min(minY, br.y); maxY = Math.max(maxY, br.y + br.h);
      n++;
    }
    if (!n) return;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const halfW = (maxX - minX) / 2;
    const halfH = (maxY - minY) / 2;

    // Predecir trayectoria de la bola hacia el mech (2D si vuela)
    let threat = 0;
    let predX = ball.x;
    let predY = ball.y;
    const approaching = flying
      ? (Math.hypot(ball.x - cx, ball.y - cy) < Math.max(halfW, halfH) + 140)
      : (ball.vy < -0.05 && ball.y > minY);
    if (approaching || (ball.vy < -0.05 && ball.y > minY)) {
      const frames = flying
        ? Math.hypot(ball.x - cx, ball.y - cy) / Math.max(0.08, Math.hypot(ball.vx, ball.vy))
        : (ball.y - cy) / Math.max(0.05, -ball.vy);
      if (frames > 0 && frames < 100) {
        let px = ball.x, py = ball.y, pvx = ball.vx, pvy = ball.vy;
        const steps = Math.min(70, frames | 0);
        for (let f = 0; f < steps; f++) {
          px += pvx; py += pvy;
          if (px < ball.r) { px = ball.r; pvx = Math.abs(pvx); }
          if (px > W - ball.r) { px = W - ball.r; pvx = -Math.abs(pvx); }
          if (flying) {
            if (py < ball.r) { py = ball.r; pvy = Math.abs(pvy); }
            if (py > H - 40) { py = H - 40; pvy = -Math.abs(pvy); }
          }
        }
        predX = px; predY = py;
        const dist = flying
          ? Math.hypot(predX - cx, predY - cy)
          : Math.abs(predX - cx);
        const reach = flying ? (Math.max(halfW, halfH) + ball.r + 50) : (halfW + ball.r + 40);
        if (dist < reach) threat = 1.0 - dist / (reach + 80);
      }
    } else if (Math.hypot(ball.x - cx, ball.y - cy) < halfW + 80 && ball.y < maxY + 40) {
      predX = ball.x; predY = ball.y;
      threat = 0.55;
    }

    let desired = 0;
    let desiredY = 0;
    if (threat > 0.05) {
      desired = (predX < cx) ? 1 : -1;
      if (Math.abs(predX - cx) < 12) {
        const roomL = cx - halfW - 8;
        const roomR = W - 8 - (cx + halfW);
        desired = roomR > roomL ? 1 : -1;
      }
      if (flying) {
        desiredY = (predY < cy) ? 1 : -1;
        if (Math.abs(predY - cy) < 10) {
          const roomU = cy - halfH - 8;
          const roomD = (H - 110) - (cy + halfH);
          desiredY = roomD > roomU ? 1 : -1;
        }
      }
    } else {
      desired = structureDX > 8 ? -0.35 : structureDX < -8 ? 0.35 : 0;
      if (flying) desiredY = structureDY > 8 ? -0.35 : structureDY < -8 ? 0.35 : 0;
    }

    const accel = 0.55 + threat * 1.1;
    structureDVX += desired * accel * dt * 60;
    structureDVX *= 0.92;
    structureDVX = Math.max(-6.5, Math.min(6.5, structureDVX));
    structureDX += structureDVX * dt * 60;

    if (flying) {
      const accelY = 0.42 + threat * 0.95;
      structureDVY += desiredY * accelY * dt * 60;
      structureDVY *= 0.91;
      structureDVY = Math.max(-5.2, Math.min(5.2, structureDVY));
      structureDY += structureDVY * dt * 60;
    } else {
      structureDVY *= 0.85;
      structureDY *= 0.9;
    }

    // Límites: que no se salga de pantalla
    const left = originX + structureDX;
    const right = originX + imgW * fitScale + structureDX;
    if (left < 6) { structureDX += 6 - left; structureDVX = Math.abs(structureDVX) * 0.4; }
    if (right > W - 6) { structureDX -= right - (W - 6); structureDVX = -Math.abs(structureDVX) * 0.4; }

    if (flying) {
      const top = originY + structureDY;
      const bottom = originY + imgH * fitScale + structureDY;
      if (top < 8) { structureDY += 8 - top; structureDVY = Math.abs(structureDVY) * 0.4; }
      const maxBottom = H - 100;
      if (bottom > maxBottom) { structureDY -= bottom - maxBottom; structureDVY = -Math.abs(structureDVY) * 0.4; }
    }

    applyStructureOffset();
  }

  function update(dt) {
    if (!running) return;
    if (paused) {
      updateBg(dt * 0.3);
      return;
    }
    // paleta grande temporal
    if (bigPaddleUntil && performance.now() < bigPaddleUntil) {
      const target = basePaddleW * 1.35;
      if (Math.abs(paddle.w - target) > 0.5) {
        const cx = paddle.x + paddle.w / 2;
        paddle.w = target;
        paddle.h = paddleHeightForWidth(paddle.w);
        paddle.y = H - 28 - paddle.h;
        paddle.x = cx - paddle.w / 2;
      }
    } else if (bigPaddleUntil && performance.now() >= bigPaddleUntil) {
      bigPaddleUntil = 0;
      const cx = paddle.x + paddle.w / 2;
      paddle.w = basePaddleW;
      paddle.h = paddleHeightForWidth(paddle.w);
      paddle.y = H - 28 - paddle.h;
      paddle.x = cx - paddle.w / 2;
    }
    updateBg(dt);
    updateDodgeAI(dt);

    // Cámara lenta al derrumbe final
    let simDt = dt;
    if (outro === 'slowmo') {
      outroT += dt;
      simDt = dt * 0.28;
      // ráfagas de caos mientras cae
      if (Math.random() < 0.08) {
        bumpCam(1.2);
        const x = W * (0.2 + Math.random() * 0.6);
        const y = groundY - 20 - Math.random() * 120;
        spawnDust(x, y, 'rgb(255,130,40)', 16, { spread: 2.2, up: 3, big: true, long: true, jitter: 20 });
        spawnDust(x, y, 'rgb(70,65,60)', 22, { ground: true, hemisphere: true, spread: 2, up: 2.4, big: true, long: true, jitter: 28 });
      }
      updateFalling(simDt);
      // polvo también lento
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= simDt;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        p.x += p.vx * simDt * 60;
        p.y += p.vy * simDt * 60;
        p.vy += (p.metal ? 0.04 : 0.12) * simDt * 60;
        p.vx *= p.metal ? 0.96 : 0.98;
      }
      const prevPxS = paddle.x;
      if (pointerX != null) paddle.x = pointerX - paddle.w / 2;
      paddle.x = Math.max(6, Math.min(W - paddle.w - 6, paddle.x));
      if (Math.abs(paddle.x - prevPxS) > 0.4) {
        paddleTrail.push({
          x: paddle.x + paddle.w / 2,
          y: paddle.y + paddle.h / 2,
          w: paddle.w, h: paddle.h, life: 1, dx: paddle.x - prevPxS,
        });
        if (paddleTrail.length > 18) paddleTrail.shift();
      }
      for (let i = paddleTrail.length - 1; i >= 0; i--) {
        paddleTrail[i].life -= dt * 3.2;
        if (paddleTrail[i].life <= 0) paddleTrail.splice(i, 1);
      }
      // Terminar cuando dejen de caer o pase el dramatismo
      if (countFalling() === 0 || outroT > 5.5) {
        if (outroT < 5.2 && countFalling() === 0 && !window.__outroDust) {
          window.__outroDust = true;
          for (let i = 0; i < 10; i++) {
            spawnGroundCloud(W * (0.12 + i * 0.08), 2.0);
          }
        }
        if (outroT > 5.5 || (countFalling() === 0 && outroT > 4.6 && window.__outroDust)) {
          window.__outroDust = false;
          finishOutro();
        }
      }
      return;
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
      p.vy += (p.metal ? 0.04 : 0.12) * dt * 60;
      p.vx *= p.metal ? 0.96 : 0.98;
    }

    updateLaserCannons(dt);

    const prevPx = paddle.x;
    if (pointerX != null) paddle.x = pointerX - paddle.w / 2;
    paddle.x = Math.max(6, Math.min(W - paddle.w - 6, paddle.x));
    const moved = Math.abs(paddle.x - prevPx);
    if (moved > 0.4) {
      paddleTrail.push({
        x: paddle.x + paddle.w / 2,
        y: paddle.y + paddle.h / 2,
        w: paddle.w,
        h: paddle.h,
        life: 1,
        dx: paddle.x - prevPx,
      });
      if (paddleTrail.length > 18) paddleTrail.shift();
    }
    for (let i = paddleTrail.length - 1; i >= 0; i--) {
      paddleTrail[i].life -= dt * 3.2;
      if (paddleTrail[i].life <= 0) paddleTrail.splice(i, 1);
    }

    updateFalling(dt);

    if (!launched) {
      stickBallToPaddle();
      return;
    }
    if (gameOver || won) return;

    bombTimer -= dt;
    if (bombTimer <= 0) {
      spawnBomb();
      bombTimer = BOMB_EVERY + Math.random() * 1.8;
    }
    updateBombs(dt);
    updatePlayerBomb(dt);

    const steps = 3;
    for (let s = 0; s < steps; s++) {
      ball.x += (ball.vx * dt * 60) / steps;
      ball.y += (ball.vy * dt * 60) / steps;

      if (ball.x - ball.r < 0) { ball.x = ball.r; ball.vx = Math.abs(ball.vx); }
      if (ball.x + ball.r > W) { ball.x = W - ball.r; ball.vx = -Math.abs(ball.vx); }
      if (ball.y - ball.r < 0) { ball.y = ball.r; ball.vy = Math.abs(ball.vy); }

      if (
        ball.vy > 0 &&
        ball.y + ball.r >= paddle.y &&
        ball.y - ball.r <= paddle.y + paddle.h &&
        ball.x >= paddle.x - 2 &&
        ball.x <= paddle.x + paddle.w + 2
      ) {
        ball.y = paddle.y - ball.r - 0.5;
        const hit = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
        const ang = -Math.PI / 2 + Math.max(-1, Math.min(1, hit)) * 1.05;
        const sp = Math.max(ball.speed, Math.hypot(ball.vx, ball.vy));
        ball.vx = Math.cos(ang) * sp;
        ball.vy = Math.sin(ang) * sp;
        spawnMetalSparks(ball.x, paddle.y);
      }

      collideBricksWithBall();

      if (ball.y - ball.r > H + 4) {
        loseLife();
        return;
      }
    }
  }

  function drawGround() {
    ctx.strokeStyle = 'rgba(255,200,120,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, groundY + 0.5);
    ctx.lineTo(W, groundY + 0.5);
    ctx.stroke();
  }

  function drawPaddleTrail() {
    for (let i = 0; i < paddleTrail.length; i++) {
      const t = paddleTrail[i];
      const a = Math.max(0, t.life);
      const scale = 0.85 + 0.15 * a;
      const tw = t.w * scale;
      const th = t.h * (0.55 + 0.25 * a);
      const tx = t.x - tw / 2;
      const ty = t.y - th / 2;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(tx, ty, tx + tw, ty);
      g.addColorStop(0, `rgba(40,160,255,0)`);
      g.addColorStop(0.5, `rgba(80,200,255,${0.22 * a})`);
      g.addColorStop(1, `rgba(40,160,255,0)`);
      ctx.fillStyle = g;
      ctx.fillRect(tx, ty + th * 0.15, tw, th * 0.7);
      ctx.fillStyle = `rgba(180,240,255,${0.12 * a})`;
      ctx.fillRect(tx + tw * 0.15, ty + th * 0.3, tw * 0.7, th * 0.4);
      ctx.restore();
    }
  }

  function drawPaddle() {
    drawPaddleTrail();
    const { x, y, w, h } = paddle;
    const skin = activePaddleImg();
    if (skin) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const glow = laserCannonsActive
        ? ['rgba(80,220,255,0.42)', 'rgba(40,160,255,0)']
        : ['rgba(90,210,255,0.35)', 'rgba(40,140,255,0)'];
      const gg = ctx.createRadialGradient(x + w / 2, y + h * 0.55, 4, x + w / 2, y + h * 0.55, w * 0.55);
      gg.addColorStop(0, glow[0]);
      gg.addColorStop(1, glow[1]);
      ctx.fillStyle = gg;
      ctx.fillRect(x - 10, y - 6, w + 20, h + 14);
      ctx.restore();
      ctx.drawImage(skin, x, y, w, h);
    } else {
      ctx.fillStyle = '#9ad8ff';
      ctx.fillRect(x, y, w, h);
    }
  }

  function drawLaserBeams() {
    if (!laserCannonsActive || laserPhase !== 'fire' || !paddle) return;
    const tipsY = paddle.y + paddle.h * 0.22;
    const half = Math.max(brickPx * 1.0, 8);
    const pulse = 0.75 + 0.25 * Math.sin(performance.now() * 0.028);
    for (const x of cannonXs()) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(x, 0, x, tipsY);
      g.addColorStop(0, `rgba(180,255,255,${0.05 * pulse})`);
      g.addColorStop(0.35, `rgba(80,220,255,${0.55 * pulse})`);
      g.addColorStop(1, `rgba(40,160,255,${0.9 * pulse})`);
      ctx.fillStyle = g;
      ctx.fillRect(x - half * 1.6, 0, half * 3.2, tipsY);
      ctx.fillStyle = `rgba(220,255,255,${0.85 * pulse})`;
      ctx.fillRect(x - half * 0.35, 0, half * 0.7, tipsY);
      ctx.restore();
    }
  }

  function drawBall() {
    if (ballSkinOn && ballSkinImg) {
      const s = ball.r * 2.15;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 8;
      ctx.drawImage(ballSkinImg, ball.x - s / 2, ball.y - s / 2, s, s);
      ctx.restore();
      return;
    }
    const g = ctx.createRadialGradient(
      ball.x - ball.r * 0.35, ball.y - ball.r * 0.4, ball.r * 0.12,
      ball.x, ball.y, ball.r
    );
    g.addColorStop(0, '#f5f7f9');
    g.addColorStop(0.4, '#a0a8b2');
    g.addColorStop(1, '#2f343c');
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function setBombButton(on) {
    const btn = document.getElementById('btnBomb');
    if (!btn) return;
    btn.classList.toggle('show', !!on);
    btn.setAttribute('aria-hidden', on ? 'false' : 'true');
  }

  function updatePlayerBomb(dt) {
    if (!playerBomb || !playerBomb.alive) return;
    playerBomb.t += dt;
    playerBomb.x += playerBomb.vx * dt * 60;
    playerBomb.y += playerBomb.vy * dt * 60;
    // leve deriva
    playerBomb.vy += 0.04 * dt * 60;

    if (playerBomb.x - playerBomb.r < 0) { playerBomb.x = playerBomb.r; playerBomb.vx = Math.abs(playerBomb.vx); }
    if (playerBomb.x + playerBomb.r > W) { playerBomb.x = W - playerBomb.r; playerBomb.vx = -Math.abs(playerBomb.vx); }
    if (playerBomb.y - playerBomb.r < 0) { playerBomb.y = playerBomb.r; playerBomb.vy = Math.abs(playerBomb.vy); }

    if (playerBomb.phase === 'fuse' && playerBomb.t >= 3) {
      playerBomb.phase = 'armed';
      playerBomb.t = 0;
      bumpCam(1.2);
    } else if (playerBomb.phase === 'armed' && playerBomb.t >= 2) {
      explodeAt(playerBomb.x, playerBomb.y, EXPLODE_R * 1.55, 22);
      playerBomb.alive = false;
      playerBomb = null;
      return;
    }
    if (playerBomb && playerBomb.y - playerBomb.r > H + 40) {
      playerBomb.alive = false;
      playerBomb = null;
    }
  }

  function drawPlayerBomb() {
    if (!playerBomb || !playerBomb.alive) return;
    const b = playerBomb;
    const img = b.phase === 'armed'
      ? (bombPlayerArmedImg || bombPlayerImg || bombArmedImg)
      : (bombPlayerImg || bombImg);
    const size = b.r * (b.phase === 'armed' ? 3.4 : 3.0);
    if (img) {
      ctx.save();
      if (b.phase === 'armed') {
        ctx.shadowColor = 'rgba(255,80,20,0.95)';
        ctx.shadowBlur = 22;
      }
      ctx.drawImage(img, b.x - size / 2, b.y - size / 2, size, size);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 1.2, 0, Math.PI * 2);
      ctx.fillStyle = b.phase === 'armed' ? '#ff4d00' : '#222';
      ctx.fill();
    }
  }

  function drawBombs() {
    for (const b of bombs) {
      if (!b.alive) continue;
      const img = b.reflected ? (bombArmedImg || bombImg) : bombImg;
      const size = b.r * 2.6;
      if (img) {
        ctx.save();
        if (b.reflected) {
          ctx.shadowColor = 'rgba(255,120,30,0.85)';
          ctx.shadowBlur = 18;
        }
        ctx.drawImage(img, b.x - size / 2, b.y - size / 2, size, size);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = b.reflected ? '#e85d04' : '#333';
        ctx.fill();
      }
    }
    drawPlayerBomb();
  }
  function drawMechShadow() {
    // Sombra elíptica bajo los pies; se mueve con structureDX (y se suaviza si vuela)
    let minX = Infinity, maxX = -Infinity, n = 0;
    for (const br of bricks) {
      if (!br.alive || br.falling || br.settled) continue;
      minX = Math.min(minX, br.baseX != null ? br.baseX : br.x);
      maxX = Math.max(maxX, (br.baseX != null ? br.baseX : br.x) + br.w);
      n++;
    }
    if (!n) return;
    const cx = (minX + maxX) / 2 + structureDX;
    const flying = !!level().fly;
    const lift = flying ? Math.max(0, -structureDY) : 0;
    const soft = flying ? Math.max(0.28, 1 - lift / 180) : 1;
    const rw = Math.max(28, (maxX - minX) * 0.42) * (flying ? 0.85 : 1);
    const rh = Math.max(8, brickPx * 2.2) * (flying ? 0.75 : 1);
    const sy = groundY + rh * 0.15 + (flying ? Math.min(24, lift * 0.08) : 0);
    ctx.save();
    ctx.globalAlpha = soft;
    ctx.translate(cx, sy);
    ctx.scale(1, rh / rw);
    const g = ctx.createRadialGradient(0, 0, rw * 0.15, 0, 0, rw);
    g.addColorStop(0, flying ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.45)');
    g.addColorStop(0.55, flying ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rw, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawLooseBricks() {
    for (const br of bricks) {
      if (!br.alive) continue;
      if (!br.falling && !br.settled) continue;
      ctx.fillStyle = br.settled ? shade(br.color, 0.85) : br.color;
      ctx.fillRect(br.x - 0.3, br.y - 0.3, br.w + 0.6, br.h + 0.6);
    }
  }

  function drawParticles() {
    for (const p of particles) {
      const a = Math.max(0, p.life / p.maxLife);
      if (p.metal) {
        const s = p.size * (0.85 + 0.4 * a);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.beginPath();
        ctx.arc(p.x, p.y, s * 1.6, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${0.35 * a})`;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${0.95 * a})`;
        ctx.fill();
        ctx.restore();
        continue;
      }
      const s = p.size * (0.7 + 0.55 * (1 - a)); // se expanden al morir = nube
      ctx.beginPath();
      ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${0.42 * a})`;
      ctx.fill();
    }
  }

  function drawBackground() {
    if (!bgImg) {
      ctx.fillStyle = '#1a0f08';
      ctx.fillRect(0, 0, W, H);
      return;
    }
    const iw = bgImg.naturalWidth, ih = bgImg.naturalHeight;
    // Plaza/pavimento abajo (~92%): alineado con pies del mech (groundY)
    const groundFrac = level().groundFrac != null ? level().groundFrac : 0.93;
    const needH = Math.max(H * 1.35, (groundY + H * 0.45) / groundFrac);
    const scale = Math.max(W / iw, needH / ih) * 1.18;
    const dw = iw * scale, dh = ih * scale;
    // Solo pan horizontal suave; vertical fijo al suelo bajo los pies
    const drift = Math.sin(bgT * 0.045) * Math.min(28, (dw - W) * 0.08);
    const dx = -(dw - W) * 0.5 + drift;
    // Un pelín más arriba para que los pies “pisen” el pavimento
    const dy = groundY - groundFrac * dh + brickPx * 0.5;
    ctx.drawImage(bgImg, dx, dy, dw, dh);

    // Capas suaves de “calor” sin mover el suelo
    ctx.save();
    ctx.globalAlpha = 0.10;
    ctx.drawImage(bgImg, dx + Math.sin(bgT * 0.06) * 6, dy - 4, dw, dh);
    ctx.globalAlpha = 0.06;
    ctx.drawImage(bgImg, dx - 8, dy + 3, dw, dh);
    ctx.restore();

    // Vineta ligera (no tapa tanto el suelo)
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, 'rgba(10,6,4,0.22)');
    grd.addColorStop(0.55, 'rgba(10,6,4,0.10)');
    grd.addColorStop(0.78, 'rgba(10,6,4,0.05)');
    grd.addColorStop(1, 'rgba(10,6,4,0.25)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);

    for (const p of bgDust) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 170, 90, ${p.a})`;
      ctx.fill();
    }
    const flicker = 0.03 + Math.sin(bgT * 3.1) * 0.015 + Math.sin(bgT * 7.7) * 0.01;
    ctx.fillStyle = `rgba(255, 140, 40, ${flicker})`;
    // Letreros: un poco arriba del suelo del mech
    ctx.fillRect(0, Math.max(0, groundY - H * 0.28), W, H * 0.16);
  }

  function updateBg(dt) {
    bgT += dt;
    for (const p of bgDust) {
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60 + Math.sin(bgT * 2 + p.x * 0.01) * 0.05;
      if (p.x > W + 10) p.x = -10;
      if (p.y < 0) p.y = H * 0.5;
      if (p.y > H * 0.6) p.y = Math.random() * H * 0.4;
    }
  }

  function bumpCam(amount) {
    camShake = Math.min(18, camShake + amount * 1.3);
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // Cámara inquieta: temblor base + picos con impacto
    const rest = paused ? 0.2 : 0.72; // +30% inquietud base
    const amp = rest + camShake;
    const t = performance.now() * 0.001;
    const ox = Math.sin(t * 17.3) * amp * 0.35 + Math.sin(t * 41.1) * amp * 0.18;
    const oy = Math.cos(t * 19.7) * amp * 0.28 + Math.sin(t * 33.5) * amp * 0.16;
    const rot = (Math.sin(t * 13.1) * amp) * 0.00055;

    ctx.save();
    ctx.translate(W / 2 + ox, H / 2 + oy);
    ctx.rotate(rot);
    ctx.translate(-W / 2, -H / 2);

    drawBackground();
    drawGround();
    drawMechShadow();
    if (brickLayer) {
      if (structureDX || structureDY) {
        ctx.save();
        ctx.translate(structureDX, structureDY);
        ctx.drawImage(brickLayer, 0, 0, W, H);
        ctx.restore();
      } else {
        ctx.drawImage(brickLayer, 0, 0, W, H);
      }
    }
    drawLooseBricks();
    drawParticles();
    drawBombs();
    drawLaserBeams();
    drawPaddle();
    drawBall();
    ctx.restore();
  }

  function frame(ts) {
    const dt = Math.min(0.033, (ts - lastTs) / 1000 || 0.016);
    lastTs = ts;
    update(dt);
    if (!paused) camShake = Math.max(0, camShake - dt * 6.5);
    draw();
    requestAnimationFrame(frame);
  }

  function pointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    const pt = e.touches && e.touches[0] ? e.touches[0] : e;
    return {
      x: (pt.clientX - rect.left) * (W / rect.width),
      y: (pt.clientY - rect.top) * (H / rect.height),
    };
  }

  function onDown(e) {
    e.preventDefault();
    if (paused) return;
    pointerX = pointerPos(e).x;
    if (window.__gotoNext) { startNextLevel(); return; }
    if (!launched && !gameOver && !won) launch();
  }
  function onMove(e) {
    e.preventDefault();
    pointerX = pointerPos(e).x;
  }

  canvas.addEventListener('pointerdown', onDown, { passive: false });
  canvas.addEventListener('pointermove', onMove, { passive: false });
  canvas.addEventListener('touchstart', onDown, { passive: false });
  canvas.addEventListener('touchmove', onMove, { passive: false });

  resetBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    window.__gotoNext = false;
    if (won && levelIndex >= LEVELS.length - 1) {
      levelIndex = 0;
      loading.classList.remove('hide');
      loading.textContent = 'Cargando Nivel 1…';
      Promise.all([loadImage(), loadBg()]).then(() => { buildLevel(); loading.classList.add('hide'); });
      return;
    }
    buildLevel();
  });

  window.addEventListener('resize', () => {
    clearTimeout(window.__rz);
    window.__rz = setTimeout(() => buildLevel(), 150);
  });

  function loadBg() {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => { bgImg = img; resolve(); };
      img.onerror = reject;
      img.src = level().bg || 'bg.jpg';
    });
  }

  function loadPaddle() {
    const load = (src) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
    return Promise.all([
      load('paddle.png'),
      load('paddle-laser.png'),
    ]).then(([a, b]) => {
      paddleImg = a;
      paddleLaserImg = b;
    });
  }

  function loadBombArts() {
    const load = (src, assign) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => { assign(img); resolve(); };
      img.onerror = reject;
      img.src = src;
    });
    return Promise.all([
      load('bomb.png', (i) => { bombImg = i; }),
      load('bomb-armed.png', (i) => { bombArmedImg = i; }),
      load('bomb-player.png', (i) => { bombPlayerImg = i; }),
      load('bomb-player-armed.png', (i) => { bombPlayerArmedImg = i; }),
    ]);
  }

  function loadBallSkin() {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { ballSkinImg = img; resolve(); };
      img.onerror = () => { console.warn('ball-skin.png missing'); resolve(); };
      img.src = 'ball-skin.png';
    });
  }


  // —— Pausa / Tienda / Mochila ——
  const pauseOverlay = document.getElementById('pauseOverlay');
  const shopOverlay = document.getElementById('shopOverlay');
  const packOverlay = document.getElementById('packOverlay');
  const shopList = document.getElementById('shopList');
  const packList = document.getElementById('packList');
  const packSlots = document.getElementById('packSlots');
  const btnPause = document.getElementById('btnPause');

  function setOverlay(el, on) {
    el.classList.toggle('show', on);
    el.setAttribute('aria-hidden', on ? 'false' : 'true');
  }

  function openPause() {
    if (gameOver || outro === 'slowmo') return;
    paused = true;
    setOverlay(pauseOverlay, true);
    setOverlay(shopOverlay, false);
    setOverlay(packOverlay, false);
  }
  function closeAllMenus() {
    paused = false;
    setOverlay(pauseOverlay, false);
    setOverlay(shopOverlay, false);
    setOverlay(packOverlay, false);
    if (typeof setPauseBtn === 'function') setPauseBtn(false);
    if (typeof setShopBtn === 'function') setShopBtn(false);
    if (typeof setPackBtn === 'function') setPackBtn(false);
  }
  function openShop() {
    paused = true;
    setOverlay(pauseOverlay, false);
    setOverlay(packOverlay, false);
    renderShop();
    setOverlay(shopOverlay, true);
  }
  function openPack() {
    paused = true;
    setOverlay(pauseOverlay, false);
    setOverlay(shopOverlay, false);
    renderPack();
    setOverlay(packOverlay, true);
  }

  function renderShop() {
    const lvl = level().id;
    shopList.innerHTML = SHOP.filter((it) => {
      if (it.minLevel != null && lvl < it.minLevel) return false;
      // bola: solo desde nivel 3; ocultar si ya equipada o en mochila
      if (it.id === 'ballskin' && (ballSkinOn || backpack.includes('ballskin'))) return false;
      return true;
    }).map((it) => {
      const full = backpack.length >= PACK_MAX;
      const broke = score < it.price;
      const disabled = full || broke;
      let why = '';
      if (full) why = 'Mochila llena';
      else if (broke) why = 'Sin fondos';
      const iconHtml = it.img
        ? `<div class="icon"><img src="${it.img}" alt="" style="width:36px;height:36px;object-fit:contain;border-radius:50%"></div>`
        : `<div class="icon">${it.icon}</div>`;
      const priceLabel = it.price >= 1000 ? ('$' + it.price.toLocaleString('en-US')) : ('$' + it.price);
      return `<div class="shop-item">
        ${iconHtml}
        <div class="info"><div class="name">${it.name}</div><div class="desc">${it.desc}</div></div>
        <div class="price">${priceLabel}</div>
        <button type="button" data-buy="${it.id}" ${disabled ? 'disabled' : ''}>${disabled ? why : 'Comprar'}</button>
      </div>`;
    }).join('');
    shopList.querySelectorAll('[data-buy]').forEach((btn) => {
      btn.addEventListener('click', () => buyItem(btn.getAttribute('data-buy')));
    });
  }

  function renderPack() {
    packSlots.textContent = `${backpack.length} / ${PACK_MAX} espacios`;
    if (!backpack.length) {
      packList.innerHTML = '<p class="sub">Vacía — compra algo en la tienda.</p>';
      return;
    }
    packList.innerHTML = backpack.map((id, idx) => {
      const it = SHOP.find((s) => s.id === id);
      if (!it) return '';
      const iconHtml = it.img
        ? `<div class="icon"><img src="${it.img}" alt="" style="width:36px;height:36px;object-fit:contain;border-radius:50%"></div>`
        : `<div class="icon">${it.icon}</div>`;
      return `<div class="pack-item">
        ${iconHtml}
        <div class="info"><div class="name">${it.name}</div><div class="desc">${it.desc}</div></div>
        <button type="button" data-use="${idx}">Usar</button>
      </div>`;
    }).join('');
    packList.querySelectorAll('[data-use]').forEach((btn) => {
      btn.addEventListener('click', () => useItem(+btn.getAttribute('data-use')));
    });
  }

  function buyItem(id) {
    const it = SHOP.find((s) => s.id === id);
    if (!it) return;
    if (backpack.length >= PACK_MAX) return;
    if (score < it.price) return;
    score -= it.price;
    backpack.push(it.id);
    updateHud();
    renderShop();
  }

  function useItem(idx) {
    if (idx < 0 || idx >= backpack.length) return;
    const id = backpack[idx];
    const it = SHOP.find((s) => s.id === id);
    backpack.splice(idx, 1);
    if (!it) { renderPack(); return; }
    if (id === 'heart') {
      lives = Math.min(START_LIVES + 1, +(lives + 1).toFixed(2));
      hint.classList.add('show');
      hint.innerHTML = '<strong>❤️ +1 vida</strong><span>Usado desde la mochila</span>';
    } else if (id === 'shield') {
      shieldCharges++;
      hint.classList.add('show');
      hint.innerHTML = '<strong>🛡️ Escudo listo</strong><span>Bloqueará el próximo daño</span>';
    } else if (id === 'paddle') {
      bigPaddleUntil = performance.now() + 20000;
      hint.classList.add('show');
      hint.innerHTML = '<strong>📏 Paleta grande</strong><span>20 segundos</span>';
    } else if (id === 'bomb') {
      playerBombArmed = true;
      setBombButton(true);
      closeAllMenus();
      setPauseBtn(false);
      hint.classList.add('show');
      hint.innerHTML = '<strong>💣 Bomba lista</strong><span>Bomba lista · toca el botón arriba</span>';
    } else if (id === 'laser') {
      startLaserCannons();
      hint.classList.add('show');
      hint.innerHTML = '<strong>🔫 Cañones láser</strong><span>Ráfagas duales · enfriamiento 7s</span>';
    } else if (id === 'ballskin') {
      ballSkinOn = true;
      if (ball && baseBallR) ball.r = baseBallR * 1.1;
      hint.classList.add('show');
      hint.innerHTML = '<strong>🪩 Bola grabada</strong><span>Skin activa · dureza +10%</span>';
    }
    updateHud();
    renderPack();
    setTimeout(() => { if (!paused) hint.classList.remove('show'); }, 1200);
  }

  function burnLaserColumn(x) {
    const half = Math.max(brickPx * 1.0, 8);
    const ox = originX + structureDX;
    const oy = originY + structureDY;
    const ix0 = Math.max(0, Math.floor((x - half - ox) / cellScreen) - 1);
    const ix1 = Math.min(cols - 1, Math.floor((x + half - ox) / cellScreen) + 1);
    for (let iy = 0; iy < rows; iy++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const id = grid[iy * cols + ix];
        if (id < 0) continue;
        const br = bricks[id];
        if (!br.alive || br.falling || br.settled) continue;
        const cx = br.x + br.w / 2;
        if (Math.abs(cx - x) > half) continue;
        if (br.y + br.h < 0 || br.y >= paddle.y) continue;
        spawnDust(cx, br.y + br.h / 2, 'rgb(120,220,255)', 4, { spread: 0.8, up: 1.2 });
        destroyBrick(br, 12);
      }
    }
  }

  function updateLaserCannons(dt) {
    if (!laserCannonsActive || !paddle) return;
    if (gameOver || won) {
      clearLaserCannons();
      return;
    }
    laserPhaseT -= dt;
    if (laserPhase === 'fire') {
      for (const x of cannonXs()) burnLaserColumn(x);
      if (laserPhaseT <= 0) {
        laserPhase = 'cooldown';
        laserPhaseT = LASER_CD_S;
      }
    } else if (laserPhase === 'cooldown') {
      if (Math.random() < Math.min(1, dt * 8)) {
        for (const x of cannonXs()) {
          spawnCannonSmoke(x, paddle.y + paddle.h * 0.18);
        }
      }
      if (laserPhaseT <= 0) {
        laserPhase = 'fire';
        laserPhaseT = LASER_FIRE_S;
        for (const x of cannonXs()) {
          spawnDust(x, paddle.y - 20, 'rgb(120,220,255)', 12, {
            spread: 1.0, up: 3.2, long: true, big: true, hemisphere: true,
          });
        }
      }
    }
    updateLaserCdUi();
  }

  const btnPauseImg = document.getElementById('btnPauseImg');
  const btnShopImg = document.getElementById('btnShopImg');
  const btnPackImg = document.getElementById('btnPackImg');
  function setPauseBtn(on) {
    if (btnPauseImg) btnPauseImg.src = on ? 'btn-pause-on.png' : 'btn-pause.png';
  }
  function setShopBtn(on) {
    if (btnShopImg) btnShopImg.src = on ? 'btn-shop-on.png' : 'btn-shop.png';
  }
  function setPackBtn(on) {
    if (btnPackImg) btnPackImg.src = on ? 'btn-pack-on.png' : 'btn-pack.png';
  }

  btnPause.addEventListener('pointerdown', () => setPauseBtn(true));
  btnPause.addEventListener('pointerup', () => { if (!paused) setPauseBtn(false); });
  btnPause.addEventListener('pointerleave', () => { if (!paused) setPauseBtn(false); });
  btnPause.addEventListener('click', (e) => {
    e.stopPropagation();
    if (paused && pauseOverlay.classList.contains('show')) {
      closeAllMenus();
      setPauseBtn(false);
    } else {
      openPause();
      setPauseBtn(true);
    }
  });
  document.getElementById('btnResume').addEventListener('click', (e) => {
    e.stopPropagation(); closeAllMenus(); setPauseBtn(false); setShopBtn(false);
  });
  const btnShop = document.getElementById('btnShop');
  btnShop.addEventListener('pointerdown', () => setShopBtn(true));
  btnShop.addEventListener('pointerup', () => { /* keep on while shop open */ });
  btnShop.addEventListener('click', (e) => { e.stopPropagation(); openShop(); setShopBtn(true); });
  const btnPack = document.getElementById('btnPack');
  btnPack.addEventListener('pointerdown', () => setPackBtn(true));
  btnPack.addEventListener('click', (e) => { e.stopPropagation(); openPack(); setShopBtn(false); setPackBtn(true); });
  document.getElementById('btnShopBack').addEventListener('click', (e) => {
    e.stopPropagation(); openPause(); setShopBtn(false); setPackBtn(false);
  });
  document.getElementById('btnPackBack').addEventListener('click', (e) => {
    e.stopPropagation(); openPause(); setPackBtn(false);
  });


  const btnBomb = document.getElementById('btnBomb');
  if (btnBomb) {
    btnBomb.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (!playerBombArmed || playerBomb || !ball || gameOver || won || outro) return;
      if (!launched) return;
      const sp = Math.hypot(ball.vx, ball.vy) || ball.speed || 4;
      const ang = Math.atan2(ball.vy, ball.vx);
      const speed = sp * 0.7;
      playerBomb = {
        x: ball.x,
        y: ball.y,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        r: Math.max(ball.r * 1.15, 8),
        phase: 'fuse',
        t: 0,
        alive: true,
      };
      playerBombArmed = false;
      setBombButton(false);
      hint.classList.add('show');
      hint.innerHTML = '<strong>💣 Bomba en camino</strong><span>Espoleta 3s · armada 2s</span>';
      setTimeout(() => { if (!paused && launched) hint.classList.remove('show'); }, 1400);
    });
  }

  (async function init() {
    try {
      await Promise.all([loadImage(), loadPaddle(), loadBg(), loadBombArts(), loadBallSkin()]);
      buildLevel();
      loading.classList.add('hide');
      requestAnimationFrame(frame);
    } catch (err) {
      loading.textContent = 'No pude cargar la imagen.';
      console.error(err);
    }
  })();
})();
