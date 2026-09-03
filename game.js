/* Mech Arkanoid — ladrillos con soporte + gravedad realista, bombas, polvo */
(() => {
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const stage = document.getElementById('stage');
  const loading = document.getElementById('loading');
  const hint = document.getElementById('hint');
  const countEl = document.getElementById('count');
  const scoreEl = document.getElementById('score');
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
    const pad = 0.35;
    lctx.clearRect(br.x - 0.5, br.y - 0.5, br.w + 1, br.h + 1);
    // Solo estructura apoyada se dibuja en la capa estática
    if (!br.alive || br.falling || br.settled) return;
    const t = br.hp / br.maxHp;
    lctx.fillStyle = shade(br.color, 0.52 + 0.48 * t);
    lctx.fillRect(br.x + pad, br.y + pad, br.w - pad * 2, br.h - pad * 2);
    if (br.maxHp >= 2) {
      lctx.strokeStyle = 'rgba(255,196,70,0.35)';
      lctx.lineWidth = 1;
      lctx.strokeRect(br.x + 0.8, br.y + 0.8, br.w - 1.6, br.h - 1.6);
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
    scoreEl.textContent = `${score} pts`;
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
    brickPx = Math.max(3.5, cell * fit * 0.96);
    cellScreen = cell * fit;
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
    launched = false;
    updateHud();

    const pw = Math.min(118, W * 0.3);
    const ph = 14;
    paddle = { w: pw, h: ph, x: (W - pw) / 2, y: H - 38 - ph, r: 7 };

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

  function spawnDust(x, y, color, count) {
    const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(color || 'rgb(140,90,50)');
    const r = m ? +m[1] : 140;
    const g = m ? +m[2] : 90;
    const b = m ? +m[3] : 50;
    const n = count || (8 + (Math.random() * 6) | 0);
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 0.6 + Math.random() * 2.8;
      particles.push({
        x, y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 0.8,
        life: 0.35 + Math.random() * 0.45,
        maxLife: 0.55 + Math.random() * 0.35,
        size: 1.1 + Math.random() * 2.4,
        r, g, b,
      });
    }
    if (particles.length > 320) particles.splice(0, particles.length - 320);
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
    for (const br of bricks) {
      if (!br.alive || !br.falling || br.settled) continue;
      br.vy += G * step; // pesados
      br.x += br.vx * step;
      br.y += br.vy * step;
      br.vx *= 0.998;

      // Suelo bajo los pies del mech
      if (br.y + br.h >= groundY) {
        br.y = groundY - br.h;
        br.vx *= 0.4;
        br.vy = 0;
        br.falling = false;
        br.settled = true;
        spawnDust(br.x + br.w / 2, br.y + br.h, br.color, 3);
        continue;
      }

      if (br.y > H + 40) {
        br.alive = false;
        br.falling = false;
      }
    }
  }

  function update(dt) {
    if (!running) return;

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
      if (pointerX != null) paddle.x = pointerX - paddle.w / 2;
      paddle.x = Math.max(6, Math.min(W - paddle.w - 6, paddle.x));
      // Terminar cuando dejen de caer o pase el dramatismo
      if (countFalling() === 0 || outroT > 4.2) finishOutro();
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

    if (pointerX != null) paddle.x = pointerX - paddle.w / 2;
    paddle.x = Math.max(6, Math.min(W - paddle.w - 6, paddle.x));

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
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, groundY + 0.5);
    ctx.lineTo(W, groundY + 0.5);
    ctx.stroke();
  }

  function drawPaddle() {
    const { x, y, w, h, r } = paddle;
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, '#d5dae2');
    g.addColorStop(0.45, '#8e96a3');
    g.addColorStop(1, '#3e4450');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.fillRect(x + 10, y + 2, w - 20, 3);
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
      ctx.fillStyle = br.settled ? shade(br.color, 0.75) : br.color;
      ctx.fillRect(br.x, br.y, br.w, br.h);
    }
  }

  function drawParticles() {
    for (const p of particles) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.6 + 0.4 * a), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${0.55 * a})`;
      ctx.fill();
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
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

  (async function init() {
    try {
      await loadImage();
      buildLevel();
      loading.classList.add('hide');
      requestAnimationFrame(frame);
    } catch (err) {
      loading.textContent = 'No pude cargar la imagen.';
      console.error(err);
    }
  })();
})();
