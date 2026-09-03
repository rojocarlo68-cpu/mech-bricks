/* Mech Arkanoid — bola grande, HP 1–2, polvo, corazones */
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

  let W = 0, H = 0, dpr = 1;
  let imgData = null, imgW = 0, imgH = 0;
  let bricks = [];
  let grid = null;
  let cols = 0, rows = 0, cell = 6;
  let brickPx = 8, cellScreen = 8;
  let originX = 0, originY = 0;
  let brickLayer = null;
  let paddle, ball;
  let running = false, launched = false, gameOver = false, won = false;
  let score = 0, lives = START_LIVES, aliveCount = 0;
  let pointerX = null;
  let lastTs = 0;
  let particles = [];

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
    if (!br.alive) return;
    const t = br.hp / br.maxHp;
    lctx.fillStyle = shade(br.color, 0.52 + 0.48 * t);
    lctx.fillRect(br.x + pad, br.y + pad, br.w - pad * 2, br.h - pad * 2);
    if (br.maxHp >= 2) {
      lctx.strokeStyle = 'rgba(255,196,70,0.4)';
      lctx.lineWidth = 1;
      lctx.strokeRect(br.x + 0.8, br.y + 0.8, br.w - 1.6, br.h - 1.6);
    } else if (br.hp < br.maxHp) {
      lctx.strokeStyle = 'rgba(0,0,0,0.5)';
      lctx.beginPath();
      lctx.moveTo(br.x + 1, br.y + br.h * 0.35);
      lctx.lineTo(br.x + br.w - 1, br.y + br.h * 0.7);
      lctx.stroke();
    }
  }

  function renderLives() {
    // Corazones púrpura oscuro, esquina superior derecha
    livesEl.innerHTML = Array.from({ length: START_LIVES }, (_, i) => {
      const on = i < lives;
      return `<span class="heart${on ? '' : ' empty'}" aria-hidden="true">♥</span>`;
    }).join('');
  }

  function updateHud() {
    countEl.textContent = `${aliveCount} ladrillos`;
    scoreEl.textContent = `${score} pts`;
    renderLives();
  }

  function stickBallToPaddle() {
    ball.x = paddle.x + paddle.w / 2;
    ball.y = paddle.y - ball.r - 2;
    ball.vx = 0;
    ball.vy = 0;
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

    for (let iy = 0; iy < rows; iy++) {
      for (let ix = 0; ix < cols; ix++) {
        if (bricks.length >= MAX_BRICKS) break;
        const c = avgCell(ix, iy, cell);
        if (!c) continue;
        const maxHp = Math.random() < 0.25 ? 2 : 1;
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
        };
        grid[iy * cols + ix] = bricks.length;
        bricks.push(br);
      }
    }

    brickLayer = document.createElement('canvas');
    brickLayer.width = Math.floor(W * dpr);
    brickLayer.height = Math.floor(H * dpr);
    const lctx = brickLayer.getContext('2d');
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lctx.clearRect(0, 0, W, H);
    for (const br of bricks) drawBrickToLayer(br);

    aliveCount = bricks.length;
    particles = [];
    score = 0;
    lives = START_LIVES;
    gameOver = false;
    won = false;
    launched = false;
    updateHud();

    const pw = Math.min(118, W * 0.3);
    const ph = 14;
    paddle = { w: pw, h: ph, x: (W - pw) / 2, y: H - 38 - ph, r: 7 };

    const diameter = Math.max(brickPx * 7.84, 20);
    ball = {
      r: diameter / 2,
      x: 0, y: 0, vx: 0, vy: 0,
      speed: Math.min(7.4, 5.4 + Math.min(2, W / 420)),
    };
    stickBallToPaddle();

    hint.classList.add('show');
    hint.innerHTML = '<strong>Desliza la paleta</strong><span>Toca para lanzar la bola de metal</span>';
    running = true;
  }


  function spawnDust(x, y, color, count) {
    const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(color || 'rgb(140,90,50)');
    const r = m ? +m[1] : 140, g = m ? +m[2] : 90, b = m ? +m[3] : 50;
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
    if (particles.length > 280) particles.splice(0, particles.length - 280);
  }

  function launch() {
    if (launched || gameOver || won) return;
    launched = true;
    hint.classList.remove('show');
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.65;
    ball.vx = Math.cos(angle) * ball.speed;
    ball.vy = Math.sin(angle) * ball.speed;
  }

  function loseLife() {
    lives--;
    updateHud();
    if (lives <= 0) {
      gameOver = true;
      launched = false;
      hint.classList.add('show');
      hint.innerHTML = '<strong>Game over</strong><span>Pulsa Reiniciar</span>';
      return;
    }
    launched = false;
    stickBallToPaddle();
    hint.classList.add('show');
    hint.innerHTML = '<strong>Vida perdida</strong><span>Toca para lanzar de nuevo</span>';
  }

  function hitBrick(br) {
    if (!br.alive) return;
    spawnDust(br.x + br.w / 2, br.y + br.h / 2, br.color, br.hp <= 1 ? 14 : 8);
    br.hp--;
    if (br.hp <= 0) {
      br.alive = false;
      aliveCount--;
      score += br.maxHp * 10;
      grid[br.iy * cols + br.ix] = -1;
      drawBrickToLayer(br);
      if (aliveCount <= 0) {
        won = true;
        launched = false;
        hint.classList.add('show');
        hint.innerHTML = '<strong>¡Campo limpio!</strong><span>Reinicia para otra ronda</span>';
      }
    } else {
      score += 5;
      drawBrickToLayer(br);
    }
    updateHud();
    const sp = Math.hypot(ball.vx, ball.vy);
    const boost = Math.min(9.6, sp * 1.0035);
    const ang = Math.atan2(ball.vy, ball.vx);
    ball.vx = Math.cos(ang) * boost;
    ball.vy = Math.sin(ang) * boost;
    ball.speed = boost;
  }

  function collideBricks() {
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
        if (!br.alive) continue;
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

  function update(dt) {
    if (!running) return;

    // polvo
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt * 60;
      p.y += p.vy * dt * 60;
      p.vy += 0.12 * dt * 60; // leve gravedad
      p.vx *= 0.98;
    }

    if (pointerX != null) paddle.x = pointerX - paddle.w / 2;
    paddle.x = Math.max(6, Math.min(W - paddle.w - 6, paddle.x));

    if (!launched) {
      stickBallToPaddle();
      return;
    }
    if (gameOver || won) return;

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

      collideBricks();

      if (ball.y - ball.r > H + 4) {
        loseLife();
        return;
      }
    }
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
    if (brickLayer) ctx.drawImage(brickLayer, 0, 0, W, H);
    drawParticles();
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
