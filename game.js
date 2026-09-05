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

  const IMG_SRC = 'mech.png';
  const MIN_BRICKS = 7000;
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
  let paddleTrail = []; // estela azul
  let bgImg = null;
  let bgT = 0;
  let bgDust = [];
  let bombs = [];
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
      img.src = IMG_SRC;
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
    // Limpiar y pintar opaco a tope (sin huecos al fondo)
    lctx.clearRect(br.x - 0.6, br.y - 0.6, br.w + 1.2, br.h + 1.2);
    if (!br.alive || br.falling || br.settled) return;
    const t = br.hp / br.maxHp;
    // Solape mínimo para que no se filtre el escenario entre ladrillos
    lctx.fillStyle = shade(br.color, 0.62 + 0.38 * t);
    lctx.fillRect(br.x - 0.35, br.y - 0.35, br.w + 0.7, br.h + 0.7);
    // Borde interno opaco para sellar
    lctx.strokeStyle = shade(br.color, 0.45);
    lctx.lineWidth = 0.8;
    lctx.strokeRect(br.x - 0.1, br.y - 0.1, br.w + 0.2, br.h + 0.2);
    if (br.maxHp >= 2) {
      lctx.strokeStyle = 'rgba(255,196,70,0.55)';
      lctx.lineWidth = 1;
      lctx.strokeRect(br.x + 0.6, br.y + 0.6, br.w - 1.2, br.h - 1.2);
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
    countEl.textContent = `${structureCount} ladrillos`;
    scoreEl.textContent = `$${score}`;
    renderLives();
  }

  function stickBallToPaddle() {
    ball.x = paddle.x + paddle.w / 2;
    ball.y = paddle.y - ball.r - 2;
    ball.vx = 0;
    ball.vy = 0;
  }

  /** ¿Quién sigue conectado al suelo? Lo demás se cae. */
  function recomputeSupport() {
    const n = bricks.length;
    const supported = new Uint8Array(n);
    const q = [];

    for (let i = 0; i < n; i++) {
      const br = bricks[i];
      if (!br.alive || br.falling || br.settled) continue;
      // Apoyado en el suelo (pies del mech)
      if (br.y + br.h >= groundY - 2) {
        supported[i] = 1;
        q.push(i);
      }
    }

    // Propagar soporte por vecinos (arriba/abajo/izq/der)
    while (q.length) {
      const i = q.pop();
      const br = bricks[i];
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (let d = 0; d < 4; d++) {
        const nix = br.ix + dirs[d][0];
        const niy = br.iy + dirs[d][1];
        if (nix < 0 || niy < 0 || nix >= cols || niy >= rows) continue;
        const id = grid[niy * cols + nix];
        if (id < 0 || supported[id]) continue;
        const nb = bricks[id];
        if (!nb.alive || nb.falling || nb.settled) continue;
        supported[id] = 1;
        q.push(id);
      }
    }

    let detached = 0;
    for (let i = 0; i < n; i++) {
      const br = bricks[i];
      if (!br.alive || br.falling || br.settled) continue;
      if (supported[i]) continue;
      // Sin camino al suelo → gravedad
      if (grid[br.iy * cols + br.ix] === i) grid[br.iy * cols + br.ix] = -1;
      br.falling = true;
      br.vx = (Math.random() - 0.5) * 0.55;
      br.vy = 0.15 + Math.random() * 0.35;
      drawBrickToLayer(br);
      detached++;
    }

    // Contar estructura restante
    structureCount = 0;
    for (let i = 0; i < n; i++) {
      const br = bricks[i];
      if (br.alive && !br.falling && !br.settled) structureCount++;
    }
    if (detached > 40) {
      hint.classList.add('show');
      hint.innerHTML = '<strong>¡Se derrumba!</strong><span>Sin soporte, cae al suelo</span>';
      clearTimeout(window.__hintHide);
      window.__hintHide = setTimeout(() => {
        if (launched && !gameOver) hint.classList.remove('show');
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
    // Congelar bola
    if (ball) { ball.vx = 0; ball.vy = 0; }
    hint.classList.add('show');
    hint.innerHTML = '<strong>Cámara lenta</strong><span>El mech se desmorona…</span>';
  }

  function finishOutro() {
    if (outro === 'done' || won) return;
    outro = 'done';
    won = true;
    launched = false;
    bombs = [];
    hint.classList.add('show');
    hint.innerHTML = '<strong>¡Mech destruido!</strong><span>Reinicia para otra ronda</span>';
    updateHud();
  }

  function maybeWin() {
    if (won || gameOver || outro === 'done') return;
    if (structureCount > 0) return;
    // Ya no hay estructura: si aún caen ladrillos → slow-mo; si no → victoria
    if (countFalling() > 0) startSlowMoOutro();
    else finishOutro();
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
    const fit = Math.min(availW / imgW, availH / imgH);
    cellScreen = cell * fit;
    // Cubrir todo el grid sin huecos al fondo
    brickPx = Math.max(3.5, cellScreen + 0.6);
    originX = (W - imgW * fit) / 2;
    originY = pad + 6;

    bricks = [];
    grid = new Int32Array(cols * rows);
    grid.fill(-1);
    groundY = 0;

    for (let iy = 0; iy < rows; iy++) {
      for (let ix = 0; ix < cols; ix++) {
        if (bricks.length >= MAX_BRICKS) break;
        const c = avgCell(ix, iy, cell);
        if (!c) continue;
        const maxHp = 1; // nivel 1: todos 1 golpe
        const br = {
          ix, iy,
          x: originX + ix * cellScreen,
          y: originY + iy * cellScreen,
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

    const pw = Math.min(168, W * 0.42);
    const ph = Math.max(28, pw * (271 / 1030)); // proporción del arte
    paddle = { w: pw, h: ph, x: (W - pw) / 2, y: H - 28 - ph, r: 7 };
    paddleTrail = [];

    const diameter = Math.max(brickPx * 3.92, 12);
    ball = {
      r: diameter / 2,
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
    hint.classList.add('show');
    hint.innerHTML = '<strong>Game over</strong><span>Pulsa Reiniciar</span>';
    updateHud();
    return true;
  }

  function loseLife() {
    lives = Math.max(0, lives - 1);
    updateHud();
    if (checkGameOver()) return;
    launched = false;
    stickBallToPaddle();
    hint.classList.add('show');
    hint.innerHTML = '<strong>Vida perdida</strong><span>Toca para lanzar de nuevo</span>';
  }

  function loseQuarterLife() {
    lives = Math.max(0, +(lives - 0.25).toFixed(2));
    updateHud();
    checkGameOver();
  }

  function destroyBrick(br, pts) {
    if (!br.alive || br.settled) return;
    const wasStructure = !br.falling;
    br.alive = false;
    br.falling = false;
    if (wasStructure && grid[br.iy * cols + br.ix] >= 0) {
      grid[br.iy * cols + br.ix] = -1;
    }
    score += pts;
    drawBrickToLayer(br);
    if (wasStructure) recomputeSupport();
    else updateHud();
  }

  function hitBrick(br) {
    if (!br.alive || br.falling || br.settled) return;
    spawnDust(br.x + br.w / 2, br.y + br.h / 2, br.color, br.hp <= 1 ? 14 : 8);
    br.hp--;
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

  function explodeAt(x, y) {
    const r2 = EXPLODE_R * EXPLODE_R;
    spawnDust(x, y, 'rgb(255,120,40)', 40);
    spawnDust(x, y, 'rgb(80,80,80)', 24);
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
      br.alive = false;
      br.falling = false;
      if (wasStructure && grid[br.iy * cols + br.ix] >= 0) grid[br.iy * cols + br.ix] = -1;
      score += 15;
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
    const ix0 = Math.floor((ball.x - ball.r - originX) / cellScreen) - 1;
    const iy0 = Math.floor((ball.y - ball.r - originY) / cellScreen) - 1;
    const ix1 = Math.floor((ball.x + ball.r - originX) / cellScreen) + 1;
    const iy1 = Math.floor((ball.y + ball.r - originY) / cellScreen) + 1;

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
      }

      if (b.reflected) {
        const ix0 = Math.floor((b.x - b.r - originX) / cellScreen) - 1;
        const iy0 = Math.floor((b.y - b.r - originY) / cellScreen) - 1;
        const ix1 = Math.floor((b.x + b.r - originX) / cellScreen) + 1;
        const iy1 = Math.floor((b.y + b.r - originY) / cellScreen) + 1;
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

  function update(dt) {
    if (!running) return;
    updateBg(dt);

    // Cámara lenta al derrumbe final
    let simDt = dt;
    if (outro === 'slowmo') {
      outroT += dt;
      simDt = dt * 0.28; // ~3.5× más lento
      updateFalling(simDt);
      // polvo también lento
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= simDt;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        p.x += p.vx * simDt * 60;
        p.y += p.vy * simDt * 60;
        p.vy += 0.12 * simDt * 60;
        p.vx *= 0.98;
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
      p.vy += 0.12 * dt * 60;
      p.vx *= 0.98;
    }

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
    if (paddleImg) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gg = ctx.createRadialGradient(x + w / 2, y + h * 0.55, 4, x + w / 2, y + h * 0.55, w * 0.55);
      gg.addColorStop(0, 'rgba(90,210,255,0.35)');
      gg.addColorStop(1, 'rgba(40,140,255,0)');
      ctx.fillStyle = gg;
      ctx.fillRect(x - 10, y - 6, w + 20, h + 14);
      ctx.restore();
      ctx.drawImage(paddleImg, x, y, w, h);
    } else {
      ctx.fillStyle = '#9ad8ff';
      ctx.fillRect(x, y, w, h);
    }
  }

  function drawBall() {
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

  function drawBombs() {
    for (const b of bombs) {
      if (!b.alive) continue;
      const g = ctx.createRadialGradient(
        b.x - b.r * 0.3, b.y - b.r * 0.35, b.r * 0.1,
        b.x, b.y, b.r
      );
      if (b.reflected) {
        g.addColorStop(0, '#ffe08a');
        g.addColorStop(0.45, '#e85d04');
        g.addColorStop(1, '#5a1408');
      } else {
        g.addColorStop(0, '#6a6a72');
        g.addColorStop(0.5, '#2a2a30');
        g.addColorStop(1, '#0e0e12');
      }
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = b.reflected ? '#ffb703' : '#c1121f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y - b.r);
      ctx.quadraticCurveTo(b.x + 6, b.y - b.r - 10, b.x + 2, b.y - b.r - 16);
      ctx.stroke();
      ctx.fillStyle = '#ff9f1c';
      ctx.beginPath();
      ctx.arc(b.x + 2, b.y - b.r - 16, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
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
    const groundFrac = 0.93;
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

  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawBackground();
    drawGround();
    if (brickLayer) ctx.drawImage(brickLayer, 0, 0, W, H);
    drawLooseBricks();
    drawParticles();
    drawBombs();
    drawPaddle();
    drawBall();
  }

  function frame(ts) {
    const dt = Math.min(0.033, (ts - lastTs) / 1000 || 0.016);
    lastTs = ts;
    update(dt);
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
    pointerX = pointerPos(e).x;
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
      img.src = 'bg.jpg';
    });
  }

  function loadPaddle() {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => { paddleImg = img; resolve(); };
      img.onerror = reject;
      img.src = 'paddle.png';
    });
  }

  (async function init() {
    try {
      await Promise.all([loadImage(), loadPaddle(), loadBg()]);
      buildLevel();
      loading.classList.add('hide');
      requestAnimationFrame(frame);
    } catch (err) {
      loading.textContent = 'No pude cargar la imagen.';
      console.error(err);
    }
  })();
})();
