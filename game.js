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
    { id: 2, name: 'Nivel 2', mech: 'mech-level2.png', bg: 'bg-level2.jpg', paddleScale: 0.98, groundFrac: 0.80, dodge: false, irregularBricks: true },
    { id: 3, name: 'Nivel 3', mech: 'mech-level3.png', bg: 'bg-level2.jpg', paddleScale: 0.98, groundFrac: 0.80, dodge: true, mechScale: 0.7, irregularBricks: true },
    { id: 4, name: 'Nivel 4', mech: 'mech-level4.png', bg: 'bg-level4.jpg', paddleScale: 0.96, groundFrac: 0.84, dodge: true, fly: true, mechScale: 0.75, irregularBricks: true },
    { id: 5, name: 'Nivel 5', mech: 'mech-level5.png', bg: 'bg-level5.jpg', paddleScale: 0.921, groundFrac: 0.90, dodge: true, fly: true, mechScale: 0.92, irregularBricks: true, ballSpeed: 1.02 },
    { id: 6, name: 'Nivel 6', mech: 'mech-level6.png', bg: 'bg-level6.jpg', bgB: 'bg-level6b.jpg', bgC: 'bg-level6c.jpg', waves: 3, paddleScale: 0.8846, groundFrac: 0.88, dodge: true, jump: true, mechScale: 0.45, irregularBricks: true, ballSpeed: 1.0404, brickDamageMult: 1.2 },
    { id: 7, name: 'Nivel 7', mech: 'mech-level7-upper.png', mechLower: 'mech-level7-lower.png', bg: 'bg-level7.jpg', dualLayer: true, irregularBricks: true, mechScale: 1.24, paddleScale: 0.86, groundFrac: 0.88, dodge: true, ballSpeed: 1.05, brickDamageMult: 1.25 },
    // Levels ≥8: harder scale (~−2% paddle, +2% ball vs L7 cascade). Only L8 exists beyond 7 for now.
    { id: 8, name: 'Nivel 8', mech: 'mech-level8-hand-l.png', queen: 'mech-level8-queen.png', queenUnder: 'mech-level8-queen-under.png', handL: 'mech-level8-hand-l.png', handR: 'mech-level8-hand-r.png', bg: 'bg-level8.jpg', queenBoss: true, irregularBricks: true, mechScale: 0.58, paddleScale: 0.8259, groundFrac: 0.82, dodge: true, ballSpeed: 1.0924, brickDamageMult: 1.3 },
  ];
  let levelIndex = 0;
  function level() { return LEVELS[levelIndex]; }
  function levelBallSpeedMult() {
    let m = level().ballSpeed || 1;
    if (level().queenBoss && l8Phase === 'torso' && l8TorsoStage === 'armor') m *= 1.02;
    return m;
  }
  function levelPaddleScale() {
    let s = level().paddleScale || 1;
    if (level().queenBoss && l8Phase === 'torso' && l8TorsoStage === 'armor') s *= 0.98;
    return s;
  }
  function isL8ArmorRest() {
    return !!(level().queenBoss && l8Phase === 'torso' && l8TorsoStage === 'armor');
  }
  function rebuildBrickLayerAlive() {
    if (!brickLayer) return;
    try {
      const lctx = brickLayer.getContext('2d');
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lctx.clearRect(0, 0, W, H);
      for (const br of bricks) {
        if (!br.alive || br.falling || br.settled) continue;
        const lx = br.baseX != null ? br.baseX : br.x;
        const ly = br.baseY != null ? br.baseY : br.y;
        lctx.fillStyle = br.color || '#ccc';
        lctx.fillRect(lx - 0.4, ly - 0.4, br.w + 0.8, br.h + 0.8);
      }
    } catch (_) {}
  }

  // ?level=2 para probar nivel 2 directo
  // ?level=8&phase=head — saltar a fase de cabeza (sin manos)
  // ?level=8&phase=torso — saltar a fase de torso (sin manos/cabeza)
  let l8BootSkipToHead = false;
  let l8BootSkipToTorso = false;
  let bootMoney = null; // ?money=30000 o ?m=30000
  (function bootLevelFromUrl() {
    try {
      const q = new URLSearchParams(location.search);
      // también aceptar hash: #money=30000
      try {
        const h = (location.hash || '').replace(/^#/, '');
        if (h) {
          const hq = new URLSearchParams(h.includes('=') ? h : '');
          for (const [k, v] of hq.entries()) {
            if (!q.has(k)) q.set(k, v);
          }
        }
      } catch (_) {}
      const n = parseInt(q.get('level') || q.get('n') || '1', 10);
      if (n >= 1 && n <= LEVELS.length) levelIndex = n - 1;
      const phase = (q.get('phase') || q.get('skip') || '').toLowerCase();
      // Solo aplica si ya entraste directo al nivel 8 (no en campaña desde el 1)
      if (
        levelIndex === 7 &&
        (phase === 'head' || phase === 'cabeza' || phase === 'after-hands' || phase === 'post-manos')
      ) {
        l8BootSkipToHead = true;
      }
      if (
        levelIndex === 7 &&
        (phase === 'torso' || phase === 'pecho' || phase === 'chest' || phase === 'body')
      ) {
        l8BootSkipToTorso = true;
        l8BootSkipToHead = false;
      }
      if (
        levelIndex === 7 &&
        (phase === 'armor' || phase === 'rest' || phase === 'armadura')
      ) {
        l8BootSkipToTorso = true;
        l8BootSkipToHead = false;
        window.__l8BootArmorRest = true;
      }
      const mRaw = q.get('money') || q.get('m') || q.get('cash') || q.get('dinero');
      if (mRaw != null && String(mRaw).trim() !== '') {
        const m = parseInt(String(mRaw).replace(/[^0-9]/g, ''), 10);
        if (Number.isFinite(m) && m >= 0) bootMoney = m;
      }
    } catch (_) {}
  })();

  let bootMoneyApplied = false;
  function applyBootMoney(showHint) {
    if (bootMoney == null) return false;
    if (!bootMoneyApplied) {
      score = bootMoney | 0;
      bootMoneyApplied = true;
    }
    try { updateHud(); } catch (_) {}
    if (showHint && typeof hint !== 'undefined' && hint) {
      hint.classList.add('show');
      hint.innerHTML = '<strong>Prueba</strong><span>$' + (bootMoney | 0).toLocaleString('en-US') + ' de inicio</span>';
      clearTimeout(window.__hintHide);
      window.__hintHide = setTimeout(() => {
        if (launched && !gameOver && !paused) hint.classList.remove('show');
      }, 2200);
    }
    return true;
  }

  const SHOP = [
    { id: 'heart', name: 'Corazón de vida', desc: '+1 vida al usar', icon: '❤️', price: 2080 },
    { id: 'laser', name: 'Pistola láser', desc: 'Cañones duales · 10s de duración', icon: '🔫', price: 5120 },
    { id: 'shield', name: 'Escudo', desc: 'Bloquea el próximo daño', icon: '🛡️', price: 2100 },
    { id: 'bomb', name: 'Bomba', desc: 'Arma y dispara desde el botón arriba', icon: '💣', price: 2090 },
    { id: 'paddle', name: 'Paleta grande', desc: 'Paleta +35% por 20s', icon: '📏', price: 2110 },
    { id: 'ballskin', name: 'Bola grabada', desc: 'Skin de bola · dureza +10%', icon: '🪩', price: 27799, minLevel: 3, img: 'ball-skin.png', ballPower: 1.1 },
    { id: 'ballsilbadora', name: 'La silbadora', desc: 'Skin · dureza +20% · rastro de aire', icon: '💨', price: 36699, minLevel: 5, img: 'ball-silbadora.png', ballPower: 1.2 },
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
  let brickLayerLower = null;
  let brickLayerUpper = null;
  let gridLower = null;
  let gridUpper = null;
  let imgDataLower = null;
  let imgDataUpper = null;
  let paddle, ball;
  let running = false, launched = false, gameOver = false, won = false;
  let ballStallT = 0;
  let ballLastAng = -Math.PI / 2;
  let score = 0, lives = START_LIVES, aliveCount = 0;
  const SCORE_KEY = 'mechBricksScore_v1';
  function persistScore() {
    try { localStorage.setItem(SCORE_KEY, String(score | 0)); } catch (_) {}
  }
  function restorePersistedScore() {
    if (bootMoney != null) { score = bootMoney | 0; persistScore(); return; }
    try {
      const n = parseInt(localStorage.getItem(SCORE_KEY) || '', 10);
      if (Number.isFinite(n) && n >= 0) score = n;
    } catch (_) {}
  }
  restorePersistedScore();
  let pointerX = null;
  let lastTs = 0;
  let particles = [];
  let paddleImg = null;
  let paddleLaserImg = null;
  let paddleTrail = []; // estela azul
  let laserCannonsActive = false;
  let laserPhase = null; // 'warmup' | 'fire' | 'cooldown'
  let laserAwaitUnpause = false;
  let laserPhaseT = 0;
  let laserFireUntil = 0; // performance.now() deadline
  const LASER_FIRE_S = 1.0;
  const LASER_CD_S = 7.0;
  const LASER_TOTAL_S = 10.0; // duración total activa
  let laserExpireAt = 0; // performance.now() deadline
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
  let structureAngle = 0; // rad — tilt/yaw for fly mechs
  let structureAV = 0;    // angular velocity
  let jumpPhase = 'ground'; // ground | up | down
  let jumpCooldown = 0;
  let jumpTargetDX = 0;
  let playerBombArmed = false;
  let playerBomb = null;
  let fitScale = 1;
  let activeBallSkin = null; // null | 'ballskin' | 'ballsilbadora'
  let ballSkinImgs = { ballskin: null, ballsilbadora: null };
  let ballAirTrail = [];
  let baseBallR = 6;
  function ballSkinOn() { return activeBallSkin != null; }
  function ballRadiusMult() {
    if (activeBallSkin === 'ballsilbadora') return 1.12;
    if (activeBallSkin === 'ballskin') return 1.1;
    return 1;
  }
  function activeBallSkinImg() {
    return activeBallSkin ? ballSkinImgs[activeBallSkin] : null;
  }
  let bombTimer = 0;
  let structureCount = 0; // ladrillos/paneles aún en la estructura (no caídos)
  let structureStartCount = 0;
  let outro = null; // null | 'slowmo' | 'done'
  let outroT = 0;   // tiempo real en cámara lenta
  // L6 multi-wave / dual mechs
  let l6Wave = 1;
  let l6PendingSpawn = null;
  let l6Transit = false;
  let l6CamFX = null; // { t, dur, swapped } head-turn FX
  // Player damage visual FX
  let hurtFlash = 0; // red flash timer (seconds)
  let cracks = []; // precomputed crack polylines { pts, w, shard? }
  let crackIntensity = 0; // 0..1 from lives vs START_LIVES
  let deathGlitch = 0; // TV glitch timer on game over
  let gameOverHintPending = false;
  let bgImgB = null;
  let bgImgC = null;
  let structures = []; // multi-mech: each is a captured structure snapshot
  // L6 rook trio phase (after pawn waves)
  let l6RookStarted = false;
  let l6RooksSpawned = 0;
  let l6Phase = 'pawns'; // 'pawns' | 'rooks' | 'chess'
  let l6RookMode = null; // null | 'wall' | 'scatter'
  let l6RookModeTimer = 0;
  let l6RookOrder = []; // permutation of living rook indices for wall slots
  let l6ChessStarted = false;
  let l6ChessSpawned = 0;

  // Level 8 — Queen boss + dual hands
  let l8Intro = false;
  let l8IntroT = 0;
  const L8_INTRO_DUR = 4.2;
  let l8CamY = 0; // 0 = feet, 1 = face+chest
  let l8QueenImg = null;
  let l8HandsSpawned = 0;
  let l8HandSpawnAt = 0; // performance.now() when left hand spawned; right at +5s
  let l8Phase = 'idle'; // idle | intro | hands | head | fade | torso | flash
  let l8Fade = null; // { t, out, hold, inn, donePrep } fundido a negro cara→torso
  let l8SpawnBusy = false;
  let l8Debris = [];
  let l8DebrisTimer = 0;
  let l8QueenUnderImg = null;
  let l8QueenTorsoImg = null;
  let l8QueenTorsoUnderImg = null;
  let l8BgRooftopImg = null;
  let l8BgTorsoImg = null;
  let l8EyeFlashT = 0; // red eye flash countdown (seconds)
  let l8HeadStartCount = 0;
  let l8TorsoStartCount = 0;
  let l8TorsoStage = 'chest'; // chest | armor (resto de armadura blanca)
  let l8Finale = null; // { t, stage, zoom, cam, shake, boomCd, booms } cinemática final
  let l8HeadFrac = 0.132; // solo corona+cara (antes de hombros/pecho) // crown+face (~top 24%) // crown+face ≈ top 15.5% of queen sprite
  let l8TorsoHeadFrac = 0.13; // cabeza visible (capa de abajo)
  let l8ChestV0 = 0.13; // bajo la cabeza
  let l8ChestV1 = 0.46; // antes de cintura/falda
  let l8Lasers = []; // {x0,y0,x1,y1,t,dur,w} brief diagonal (head) OR bounce beams (torso)
  let l8LaserCd = 0;
  let l8LasersDone = false;
  let l8HeadOriginX = 0;
  let l8HeadOriginY = 0;
  let l8RooftopGroundY = 0; // playfield ground for queen feet / bg (stable across brick spawns)
  let l8TorsoQuakeT = 0;
  let l8ExtraDust = []; // floating dust during torso earthquake
  let l8TorsoDriftX = 0;
  let l8TorsoDriftTarget = 0;
  let l8TorsoDriftTimer = 0;

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
        const a = imgData[i + 3];
        if (a < 28) continue; // ignore near-transparent
        // alpha >= 28 → solid: RGB at full weight (no blend toward transparent)
        r += imgData[i]; g += imgData[i + 1]; b += imgData[i + 2]; n++;
      }
    }
    const minPix = cellSize <= 1 ? 1 : Math.max(2, cellSize * cellSize * 0.12);
    if (n < minPix) return null;
    return { r: (r / n) | 0, g: (g / n) | 0, b: (b / n) | 0 };
  }

  function loadMechSrc(src, maxSideOpt) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const maxSide = maxSideOpt != null ? maxSideOpt : 900;
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
      img.src = src;
    });
  }

  function loadImageDataFromImg(img) {
    const maxSide = 900;
    let w = img.naturalWidth, h = img.naturalHeight;
    const scale = Math.min(1, maxSide / Math.max(w, h));
    w = Math.round(w * scale);
    h = Math.round(h * scale);
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const c = off.getContext('2d', { willReadFrequently: true });
    c.drawImage(img, 0, 0, w, h);
    return { data: c.getImageData(0, 0, w, h).data, w, h, canvas: off };
  }

  function loadImg(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  /** Align lower+upper mech art onto identical canvases (center X, feet on bottom). */
  async function loadDualMech(lowerSrc, upperSrc) {
    const [imgL, imgU] = await Promise.all([loadImg(lowerSrc), loadImg(upperSrc)]);
    const L = loadImageDataFromImg(imgL);
    const U = loadImageDataFromImg(imgU);
    const th = Math.max(L.h, U.h);
    function scaleToH(srcCanvas, tw, thSrc, thDst) {
      const r = thDst / thSrc;
      const nw = Math.max(1, Math.round(tw * r));
      const off = document.createElement('canvas');
      off.width = nw; off.height = thDst;
      off.getContext('2d').drawImage(srcCanvas, 0, 0, nw, thDst);
      return off;
    }
    const lScaled = scaleToH(L.canvas, L.w, L.h, th);
    const uScaled = scaleToH(U.canvas, U.w, U.h, th);
    const cw = Math.max(lScaled.width, uScaled.width);
    const ch = th;
    function pasteCentered(src) {
      const off = document.createElement('canvas');
      off.width = cw; off.height = ch;
      const c = off.getContext('2d', { willReadFrequently: true });
      const x = ((cw - src.width) / 2) | 0;
      const y = ch - src.height;
      c.clearRect(0, 0, cw, ch);
      c.drawImage(src, x, y);
      return { data: c.getImageData(0, 0, cw, ch).data, w: cw, h: ch };
    }
    const lower = pasteCentered(lScaled);
    const upper = pasteCentered(uScaled);
    imgDataLower = lower.data;
    imgDataUpper = upper.data;
    imgW = cw; imgH = ch;
    imgData = imgDataUpper;
    gridLower = null;
    gridUpper = null;
    brickLayerLower = null;
    brickLayerUpper = null;
  }

  function loadImage() {
    if (level().queenBoss) {
      imgDataLower = null;
      imgDataUpper = null;
      gridLower = null;
      gridUpper = null;
      brickLayerLower = null;
      brickLayerUpper = null;
      // Queen is pure backdrop; brick imgData filled when hands spawn
      imgData = new Uint8ClampedArray(4);
      imgW = 1; imgH = 1;
      return Promise.all([
        loadImg(level().queen || 'mech-level8-queen.png'),
        loadImg(level().queenUnder || 'mech-level8-queen-under.png').catch(() => null),
        loadImg('mech-level8-queen-torso.png').catch(() => null),
        loadImg('mech-level8-queen-torso-under.png').catch(() => null),
      ]).then(([img, under, torso, torsoUnder]) => {
        l8QueenImg = img;
        l8QueenUnderImg = under;
        l8QueenTorsoImg = torso;
        l8QueenTorsoUnderImg = torsoUnder;
      });
    }
    if (level().dualLayer && level().mechLower) {
      return loadDualMech(level().mechLower, level().mech);
    }
    imgDataLower = null;
    imgDataUpper = null;
    gridLower = null;
    gridUpper = null;
    brickLayerLower = null;
    brickLayerUpper = null;
    return loadMechSrc(level().mech);
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

  function brickLayerCanvasFor(br) {
    if (level().dualLayer) {
      if (br.layer === 'lower' && brickLayerLower) return brickLayerLower;
      if (br.layer === 'upper' && brickLayerUpper) return brickLayerUpper;
    }
    return brickLayer;
  }

  function drawBrickToLayer(br) {
    const layerCanvas = brickLayerCanvasFor(br);
    if (!layerCanvas) return;
    const lctx = layerCanvas.getContext('2d');
    // La capa estática usa coords base (sin dodge)
    const lx = br.baseX != null ? br.baseX : br.x;
    const ly = br.baseY != null ? br.baseY : br.y;
    // Solo limpiar al quitar el ladrillo. Si clear+fill en cada uno,
    // el clear borra el solape de los vecinos → se ve el fondo ("transparente").
    if (!br.alive || br.falling || br.settled) {
      lctx.clearRect(lx - 0.5, ly - 0.5, br.w + 1.0, br.h + 1.0);
      return;
    }
    const t = br.hp / br.maxHp;
    lctx.fillStyle = shade(br.color, 0.62 + 0.38 * t);
    if (br.panel && br.poly && br.poly.length >= 3) {
      lctx.beginPath();
      lctx.moveTo(br.poly[0].x, br.poly[0].y);
      for (let i = 1; i < br.poly.length; i++) lctx.lineTo(br.poly[i].x, br.poly[i].y);
      lctx.closePath();
      lctx.fill();
      lctx.strokeStyle = shade(br.color, 0.35);
      lctx.lineWidth = 1.1;
      lctx.stroke();
      return;
    }
    // Solape fuerte + fill opaco
    lctx.fillRect(lx - 0.55, ly - 0.55, br.w + 1.1, br.h + 1.1);
    lctx.strokeStyle = shade(br.color, 0.4);
    lctx.lineWidth = 0.9;
    lctx.strokeRect(lx - 0.15, ly - 0.15, br.w + 0.3, br.h + 0.3);
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
    const unit = level().panels ? 'paneles' : 'ladrillos';
    structureCount = countAliveStructureBricks();
    countEl.textContent = `${level().name} · ${structureCount} ${unit}`;
    const moneyTxt = '$' + (score >= 1000 ? score.toLocaleString('en-US') : String(score));
    if (scoreEl) scoreEl.textContent = moneyTxt;
    if (window.__lastPersistedScore !== (score | 0)) {
      window.__lastPersistedScore = score | 0;
      persistScore();
    }
    const shopMoney = document.getElementById('shopMoney');
    const packMoney = document.getElementById('packMoney');
    if (shopMoney) shopMoney.textContent = moneyTxt;
    if (packMoney) packMoney.textContent = moneyTxt;
    renderLives();
  }

  function stickBallToPaddle() {
    if (!ball || !paddle) return;
    ball.x = paddle.x + paddle.w / 2;
    ball.y = paddle.y - ball.r - 2;
    ball.vx = 0;
    ball.vy = 0;
    ballStallT = 0;
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
    } else if (laserPhase === 'warmup' || laserAwaitUnpause) {
      laserCdEl.classList.remove('firing');
      if (laserCdFillEl) laserCdFillEl.style.width = '0%';
    } else {
      laserCdEl.classList.remove('firing');
      const t = Math.max(0, Math.min(1, laserPhaseT / LASER_CD_S));
      if (laserCdFillEl) laserCdFillEl.style.width = (t * 100).toFixed(1) + '%';
    }
  }

  function clearLaserCannons() {
    laserCannonsActive = false;
    laserPhase = null;
    laserPhaseT = 0;
    laserFireUntil = 0;
    laserExpireAt = 0;
    laserAwaitUnpause = false;
    updateLaserCdUi();
  }

  function beginLaserWarmup() {
    if (!laserCannonsActive) return;
    laserAwaitUnpause = false;
    laserPhase = 'warmup';
    laserPhaseT = 1.0; // 1s después de quitar pausa
    // 10s de duración total desde que empieza el calentamiento
    if (!laserExpireAt) laserExpireAt = performance.now() + LASER_TOTAL_S * 1000;
    updateLaserCdUi();
  }

  function startLaserCannons() {
    // Never reset ball when equipping laser mid-flight
    const keepLaunched = !!launched;
    const kvx = ball ? ball.vx : 0;
    const kvy = ball ? ball.vy : 0;
    const ksp = ball ? ball.speed : 0;
    const kx = ball ? ball.x : 0;
    const ky = ball ? ball.y : 0;
    laserCannonsActive = true;
    // Espera a salir de pausa, luego 1s de calentamiento, luego dispara 1s
    laserAwaitUnpause = true;
    laserPhase = null;
    laserPhaseT = 0;
    laserExpireAt = 0; // se arma en beginLaserWarmup
    // refrescar alto de paleta al cambiar de skin
    if (paddle) {
      const cx = paddle.x + paddle.w / 2;
      paddle.h = paddleHeightForWidth(paddle.w);
      paddle.y = H - 28 - paddle.h;
      paddle.x = Math.max(6, Math.min(W - paddle.w - 6, cx - paddle.w / 2));
    }
    if (ball) {
      if (keepLaunched) {
        launched = true;
        ball.x = kx;
        ball.y = ky;
        ball.vx = kvx;
        ball.vy = kvy;
        ball.speed = ksp;
      } else {
        stickBallToPaddle();
      }
    }
    updateLaserCdUi();
  }

  function brickCells(br) {
    return br.cells || [{ ix: br.ix, iy: br.iy }];
  }

  function gridForBrick(br) {
    if (br && br.layer === 'lower' && gridLower) return gridLower;
    if (br && br.layer === 'upper' && gridUpper) return gridUpper;
    return grid;
  }

  function clearBrickGrid(br, id) {
    if (br.panel) return;
    const g = gridForBrick(br);
    if (!g) return;
    for (const c of brickCells(br)) {
      const gi = c.iy * cols + c.ix;
      if (g[gi] === id) g[gi] = -1;
    }
  }

  function forEachNeighborBrick(br, fn, orthoOnly) {
    if (br.neighbors && br.neighbors.length && !orthoOnly) {
      for (let i = 0; i < br.neighbors.length; i++) fn(br.neighbors[i]);
      return;
    }
    const dirs = orthoOnly
      ? [[1,0],[-1,0],[0,1],[0,-1]]
      : [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    const g = gridForBrick(br) || grid;
    const seen = Object.create(null);
    for (const c of brickCells(br)) {
      for (let d = 0; d < dirs.length; d++) {
        const nix = c.ix + dirs[d][0];
        const niy = c.iy + dirs[d][1];
        if (nix < 0 || niy < 0 || nix >= cols || niy >= rows) continue;
        const id = g[niy * cols + nix];
        if (id < 0 || seen[id]) continue;
        // Dual-layer: never treat opposite layer as structural neighbor
        if (br.layer && bricks[id] && bricks[id].layer && bricks[id].layer !== br.layer) continue;
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
    const footFrac = level().jump ? 0.85 : 0.80;
    const footCut = minIy + Math.floor((maxIy - minIy) * footFrac);

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

      // jump/L6: 4 vecinos (cortar el medio suelta el tope); otros: 8
      const ortho = !!level().jump;
      while (q.length) {
        const i = q.pop();
        forEachNeighborBrick(bricks[i], (id) => {
          if (supported[id]) return;
          const nb = bricks[id];
          if (!nb.alive || nb.falling || nb.settled) return;
          supported[id] = 1;
          q.push(id);
        }, ortho);
      }
    }

    let detached = 0;
    // Cara L8: no animar miles de caídas (congela al pasar a torso) — se esfuman
    const l8HeadPop = level().queenBoss && (l8Phase === 'head' || (l8Phase === 'torso' && l8TorsoStage === 'armor'));
    for (let i = 0; i < n; i++) {
      const br = bricks[i];
      if (!br.alive || br.falling || br.settled) continue;
      if (supported[i]) continue;
      clearBrickGrid(br, i);
      if (l8HeadPop) {
        br.alive = false;
        br.falling = false;
        br.settled = false;
      } else {
        br.falling = true;
        br.vx = (Math.random() - 0.5) * 0.55;
        br.vy = 0.15 + Math.random() * 0.35;
        drawBrickToLayer(br);
      }
      detached++;
    }
    if (l8HeadPop && detached > 0 && brickLayer) {
      try {
        const lctx = brickLayer.getContext('2d');
        lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        lctx.clearRect(0, 0, W, H);
        for (const br of bricks) {
          if (br.alive && !br.falling && !br.settled) drawBrickToLayer(br);
        }
      } catch (_) {}
    }

    let localCount = 0;
    for (let i = 0; i < n; i++) {
      const br = bricks[i];
      if (br.alive && !br.falling && !br.settled) localCount++;
    }
    // Colapso masivo: ≤50% de la estructura inicial → todo cae (por estructura / capa)
    const collapseLayer = (layerName, startCount) => {
      if (!(startCount > 0)) return;
      let live = 0;
      for (let i = 0; i < n; i++) {
        const br = bricks[i];
        if (layerName && br.layer !== layerName) continue;
        if (br.alive && !br.falling && !br.settled) live++;
      }
      if (live <= 0 || live > startCount * 0.50) return;
      const l8HeadPopC = level().queenBoss && (l8Phase === 'head' || (l8Phase === 'torso' && l8TorsoStage === 'armor'));
      for (let i = 0; i < n; i++) {
        const br = bricks[i];
        if (layerName && br.layer !== layerName) continue;
        if (!br.alive || br.falling || br.settled) continue;
        clearBrickGrid(br, i);
        if (l8HeadPopC) {
          br.alive = false;
          br.falling = false;
          br.settled = false;
        } else {
          br.falling = true;
          br.vx = (Math.random() - 0.5) * 0.8;
          br.vy = 0.2 + Math.random() * 0.5;
          drawBrickToLayer(br);
        }
        detached++;
      }
    };
    if (level().dualLayer) {
      const ds = window.__dualStart || {};
      collapseLayer('lower', ds.lower || 0);
      collapseLayer('upper', ds.upper || 0);
    } else if (localCount > 0 && structureStartCount > 0) {
      const collapseAt = isL8ArmorRest() ? 0.32 : 0.50; // resto: -20%×2 dureza
      if (localCount <= structureStartCount * collapseAt) collapseLayer(null, structureStartCount);
    }
    localCount = 0;
    for (let i = 0; i < n; i++) {
      const br = bricks[i];
      if (br.alive && !br.falling && !br.settled) localCount++;
    }
    if (structures.length) {
      for (const S of structures) {
        if (S.bricks === bricks) S.structureCount = localCount;
      }
      structureCount = 0;
      for (const S of structures) structureCount += S.structureCount | 0;
    } else {
      structureCount = localCount;
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
    if (structures.length) {
      let n = 0;
      for (const S of structures) {
        for (const br of S.bricks) if (br.alive && br.falling) n++;
      }
      return n;
    }
    let n = 0;
    for (const br of bricks) if (br.alive && br.falling) n++;
    return n;
  }

  /** Live structure bricks still standing (not falling/settled rubble). */
  function countAliveStructureBricks() {
    let n = 0;
    if (structures.length) {
      for (const S of structures) {
        for (const br of S.bricks) {
          if (br.alive && !br.falling && !br.settled) n++;
        }
      }
      return n;
    }
    for (const br of bricks) {
      if (br.alive && !br.falling && !br.settled) n++;
    }
    return n;
  }

  function startSlowMoOutro() {
    if (outro || won || gameOver || l6Transit) return;
    if (level().queenBoss && (l8Intro || l8Phase === 'intro' || l8Phase === 'idle')) return;
    if (level().queenBoss && l8Phase === 'hands' && l8HandsSpawned < 2) return;
    // Hands clear → head phase instead of crumple outro
    if (level().queenBoss && l8Phase === 'hands' && l8HandsSpawned >= 2) {
      beginL8HeadPhase();
      return;
    }
    // Head clear → torso phase (do not win yet)
    if (level().queenBoss && l8Phase === 'head') {
      beginL8TorsoPhase();
      return;
    }
    // Pecho limpio → resto de armadura blanca
    if (level().queenBoss && l8Phase === 'torso' && l8TorsoStage === 'chest') {
      beginL8ArmorRestPhase();
      return;
    }
    // Torso final (armor): nunca slow-mo pesado
    if (level().queenBoss && l8Phase === 'torso') {
      finishL8TorsoWinLight();
      return;
    }
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


  function captureStructure() {
    return {
      bricks, grid, cols, rows, cell, cellScreen, brickPx,
      originX, originY, fitScale, groundY, brickLayer,
      structureDX, structureDVX, structureDY, structureDVY,
      structureAngle, structureAV, jumpPhase, jumpCooldown, jumpTargetDX,
      structureCount, structureStartCount, minIy, maxIy,
    };
  }

  function applyStructure(S) {
    if (!S) return;
    bricks = S.bricks;
    grid = S.grid;
    cols = S.cols;
    rows = S.rows;
    cell = S.cell;
    cellScreen = S.cellScreen;
    brickPx = S.brickPx;
    originX = S.originX;
    originY = S.originY;
    fitScale = S.fitScale;
    groundY = S.groundY;
    brickLayer = S.brickLayer;
    structureDX = S.structureDX;
    structureDVX = S.structureDVX;
    structureDY = S.structureDY;
    structureDVY = S.structureDVY;
    structureAngle = S.structureAngle;
    structureAV = S.structureAV;
    jumpPhase = S.jumpPhase;
    jumpCooldown = S.jumpCooldown;
    jumpTargetDX = S.jumpTargetDX;
    structureCount = S.structureCount;
    structureStartCount = S.structureStartCount;
    minIy = S.minIy;
    maxIy = S.maxIy;
  }

  function writeBackStructure(S) {
    if (!S) return;
    S.bricks = bricks;
    S.grid = grid;
    S.cols = cols;
    S.rows = rows;
    S.cell = cell;
    S.cellScreen = cellScreen;
    S.brickPx = brickPx;
    S.originX = originX;
    S.originY = originY;
    S.fitScale = fitScale;
    S.groundY = groundY;
    S.brickLayer = brickLayer;
    S.structureDX = structureDX;
    S.structureDVX = structureDVX;
    S.structureDY = structureDY;
    S.structureDVY = structureDVY;
    S.structureAngle = structureAngle;
    S.structureAV = structureAV;
    S.jumpPhase = jumpPhase;
    S.jumpCooldown = jumpCooldown;
    S.jumpTargetDX = jumpTargetDX;
    // Persist live standing-brick count for this structure (not the multi-S total)
    let local = 0;
    for (const br of bricks) {
      if (br.alive && !br.falling && !br.settled) local++;
    }
    S.structureCount = local;
    S.structureStartCount = structureStartCount;
    S.minIy = minIy;
    S.maxIy = maxIy;
  }

  function refreshTotalStructureCount() {
    // Always recompute from live bricks so multi-structure counts never go stale
    if (!structures.length) {
      structureCount = countAliveStructureBricks();
      return structureCount;
    }
    let total = 0;
    for (const S of structures) {
      let local = 0;
      for (const br of S.bricks) {
        if (br.alive && !br.falling && !br.settled) local++;
      }
      S.structureCount = local;
      total += local;
    }
    structureCount = total;
    return total;
  }

  function eachStructure(fn) {
    if (!structures.length) {
      fn(null, -1);
      return;
    }
    for (let i = 0; i < structures.length; i++) {
      applyStructure(structures[i]);
      fn(structures[i], i);
      writeBackStructure(structures[i]);
    }
    refreshTotalStructureCount();
    applyStructure(structures[0]);
    // Keep HUD total (applyStructure would load S0's per-count only)
    refreshTotalStructureCount();
  }

  function loadBgSrc(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  function syncLevelUrl() {
    try {
      const u = new URL(location.href);
      u.searchParams.set('level', String(levelIndex + 1));
      // No arrastrar atajos de prueba al siguiente nivel
      u.searchParams.delete('phase');
      u.searchParams.delete('skip');
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch (_) {}
  }

  function finishOutro() {
    if (outro === 'done' || won) return;
    // L8 hands clear → head phase (never "Zona despejada" early)
    if (level().queenBoss && l8Phase === 'hands' && l8HandsSpawned >= 2) {
      beginL8HeadPhase();
      return;
    }
    // L8 head clear → torso (not level win)
    if (level().queenBoss && l8Phase === 'head') {
      beginL8TorsoPhase();
      return;
    }
    if (level().queenBoss && l8Phase === 'torso' && l8TorsoStage === 'chest') {
      beginL8ArmorRestPhase();
      return;
    }
    // L6 wave 1 clear → camera turn + more mechs (not next level)
    if (level().id === 6 && l6Wave === 1) {
      outro = null;
      outroT = 0;
      window.__outroDust = false;
      l6PhaseTransition();
      return;
    }
    // L6 pawn extras cleared → rook trio (do not finish level yet)
    if (level().id === 6 && l6Wave >= 3 && !l6RookStarted) {
      outro = null;
      outroT = 0;
      window.__outroDust = false;
      l6RookPhase();
      return;
    }
    // L6 rooks cleared → chess knights (do not finish level yet)
    if (level().id === 6 && l6RookStarted && !l6ChessStarted) {
      outro = null;
      outroT = 0;
      window.__outroDust = false;
      l6ChessTransition();
      return;
    }
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
    l8BootSkipToHead = false; // campaña: L8 siempre con intro → manos → cabeza → torso
    l8BootSkipToTorso = false;
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
    if (won || gameOver || outro === 'done' || l6Transit) return;
    if (l8Finale) return;
    // L8: no win during intro / before both hands / during head spawn
    if (level().queenBoss) {
      if (l8Intro || l8Phase === 'intro' || l8Phase === 'idle') return;
      if (l8Phase === 'hands' && l8HandsSpawned < 2) return;
      if (l8Phase === 'head' && l8SpawnBusy) return;
      if (l8Phase === 'torso' && l8SpawnBusy) return;
      if (l8Phase === 'fade') return;
      if (l8Phase !== 'hands' && l8Phase !== 'head' && l8Phase !== 'torso') return;
    }
    refreshTotalStructureCount();
    const live = countAliveStructureBricks();
    structureCount = live;
    if (live > 0) {
      // Torso: if ≤50% remaining, keep playing until cleared (no early win)
      return;
    }
    // L8 hands cleared → head phase (not level win)
    if (level().queenBoss && l8Phase === 'hands' && l8HandsSpawned >= 2) {
      beginL8HeadPhase();
      return;
    }
    // L8 head cleared → torso phase (not level win)
    if (level().queenBoss && l8Phase === 'head') {
      beginL8TorsoPhase();
      return;
    }
    // L8 pecho limpio → resto de armadura blanca
    if (level().queenBoss && l8Phase === 'torso' && l8TorsoStage === 'chest') {
      beginL8ArmorRestPhase();
      return;
    }
    // L6: wave 1 clear → finishOutro → l6PhaseTransition (camera + waves 2–3).
    // After wave 2+, wait for remaining pawn spawns before rook phase.
    // Rook phase: once towers are clear, always advance to chess (don't gate on spawn counter).
    // Chess phase: wait until both knights spawned, then real win — unless half-state.
    if (level().id === 6 && !l6RookStarted) {
      if (l6Wave > 1 && (l6Wave < 3 || l6PendingSpawn)) return;
    }
    if (level().id === 6 && l6RookStarted && !l6ChessStarted && (l6Phase === 'rooks' || l6Phase === 'pawns')) {
      // Treat spawned as at least structures that existed; never block forever when clear
      l6RooksSpawned = Math.max(l6RooksSpawned | 0, structures.length | 0);
      // fall through → finishOutro → l6ChessTransition
    }
    if (level().id === 6 && l6ChessStarted && l6ChessSpawned < 2) {
      // Recoverable half-state: flag set but transit never ran / no knights
      if (!l6Transit && !l6CamFX && l6ChessSpawned === 0 && l6Phase !== 'chess') {
        l6ChessStarted = false;
      } else {
        return;
      }
    }
    // L8 resto-armadura / torso final: sin slow-mo (congela con miles de FX)
    if (level().queenBoss && l8Phase === 'torso') {
      finishL8TorsoWinLight();
      return;
    }
    // Ya no hay estructura: si aún caen ladrillos → slow-mo; si no → victoria / L6 transit
    if (countFalling() > 0) startSlowMoOutro();
    else finishOutro();
  }

  function clearL6Timers() {
    if (l6PendingSpawn) {
      clearTimeout(l6PendingSpawn);
      l6PendingSpawn = null;
    }
  }

  function fillBricksFromImage(fit, ox, oy) {
    const localBricks = [];
    let localGrid;
    let localCols, localRows, localCell, localCellScreen, localBrickPx;
    let localMinIy, localMaxIy, localGroundY = 0;

    // Use globals temporarily for avgCell / mergeIrregularBricks helpers
    originX = ox;
    originY = oy;
    fitScale = fit;

    localCell = pickCell();
    localCols = Math.ceil(imgW / localCell);
    localRows = Math.ceil(imgH / localCell);
    localCellScreen = localCell * fit;
    localBrickPx = Math.max(3.5, localCellScreen + (level().fly ? 1.35 : 1.0));
    localGrid = new Int32Array(localCols * localRows);
    localGrid.fill(-1);
    localMinIy = localRows;
    localMaxIy = 0;

    cell = localCell;
    cols = localCols;
    rows = localRows;
    cellScreen = localCellScreen;
    brickPx = localBrickPx;
    grid = localGrid;
    bricks = localBricks;
    minIy = localMinIy;
    maxIy = localMaxIy;
    groundY = 0;

    for (let iy = 0; iy < rows; iy++) {
      for (let ix = 0; ix < cols; ix++) {
        if (bricks.length >= MAX_BRICKS) break;
        const c = avgCell(ix, iy, cell);
        if (!c) continue;
        minIy = Math.min(minIy, iy);
        maxIy = Math.max(maxIy, iy);
        const maxHp = 1;
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
    groundY += 0.5;
    if (level().irregularBricks) mergeIrregularBricks();

    brickLayer = document.createElement('canvas');
    brickLayer.width = Math.floor(W * dpr);
    brickLayer.height = Math.floor(H * dpr);
    const lctx = brickLayer.getContext('2d');
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lctx.clearRect(0, 0, W, H);
    for (const br of bricks) drawBrickToLayer(br);

    structureCount = bricks.length;
    structureStartCount = structureCount;
    structureDX = 0;
    structureDVX = 0;
    structureDY = 0;
    structureDVY = 0;
    structureAngle = 0;
    structureAV = 0;
    jumpPhase = 'ground';
    jumpCooldown = 0.4;
    jumpTargetDX = 0;
  }

  function buildStructureInstance(opts) {
    opts = opts || {};
    const pad = 12;
    const paddleSpace = 92;
    const availW = W - pad * 2;
    const availH = H - pad * 2 - paddleSpace;
    const mechScale = opts.mechScale != null
      ? opts.mechScale
      : (level().mechScale != null ? level().mechScale : 1);
    const fit = Math.min(availW / imgW, availH / imgH) * mechScale;
    const ox = (W - imgW * fit) / 2;
    const unusedH = availH - imgH * fit;
    const yBias = level().fly ? 0.28 : 0.55;
    const oy = pad + 6 + Math.max(0, unusedH * yBias);

    fillBricksFromImage(fit, ox, oy);

    const mechW = imgW * fitScale;
    const side = opts.side || 'right';
    if (side === 'left') {
      structureDX = -originX - mechW - 40;
    } else {
      structureDX = (W + 40) - originX;
    }
    jumpTargetDX = 0;
    structureDVX = (jumpTargetDX - structureDX) / 28;
    structureDVX = Math.max(-5.5, Math.min(5.5, structureDVX));
    jumpPhase = 'up';
    structureDVY = -Math.sqrt(Math.max(8, 2 * G * 36));
    jumpCooldown = 0.35;
    applyStructureOffset();

    const S = captureStructure();
    return S;
  }

  function l6EaseInOut(u) {
    return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
  }

  async function l6PhaseTransition() {
    if (l6Transit) return;
    l6Transit = true;
    clearL6Timers();
    bombs = [];
    playerBomb = null;
    if (ball) { ball.vx = 0; ball.vy = 0; }
    launched = false;
    outro = null;
    bumpCam(5);
    // Head-turn right: longer, smoother yaw (~1.4s) — not a flip
    l6CamFX = { t: 0, dur: 1.4, swapped: false, nextImg: bgImgB, nextSrc: level().bgB, kind: 'pawns' };
    hint.classList.add('show');
    hint.innerHTML = '<strong>¿Qué…?</strong><span>Volteas la mirada…</span>';
    try {
      if (!bgImgB && level().bgB) bgImgB = await loadBgSrc(level().bgB);
    } catch (e) {
      console.warn('bg-level6b', e);
    }
    if (l6CamFX) {
      l6CamFX.nextImg = bgImgB;
      l6CamFX.nextSrc = level().bgB;
    }
  }

  function updateL6Transit(dt) {
    if (!l6Transit || !l6CamFX) return;
    l6CamFX.t += dt;
    const u = Math.min(1, l6CamFX.t / l6CamFX.dur);
    const e = l6EaseInOut(u);
    // Swap bg once the ruined corridor has mostly wiped in from the right
    if (e >= 0.55 && !l6CamFX.swapped) {
      l6CamFX.swapped = true;
      if (l6CamFX.nextImg) bgImg = l6CamFX.nextImg;
      if (l6CamFX.nextSrc) level().bg = l6CamFX.nextSrc;
    }
    if (u < 1) return;

    const transitKind = l6CamFX.kind || 'pawns';
    l6Transit = false;
    l6CamFX = null;
    if (transitKind === 'chess') {
      hint.classList.add('show');
      hint.innerHTML = '<strong>¡Caballeros!</strong><span>¡Dos mechs caballo!</span>';
      clearTimeout(window.__hintHide);
      window.__hintHide = setTimeout(() => {
        if (launched && !gameOver && !paused && !l6Transit) hint.classList.remove('show');
      }, 2200);
      if (ball && paddle) {
        stickBallToPaddle();
        launched = false;
      }
      // Always enter chess spawn after head-turn (recover if prior half-state)
      l6ChessStarted = true;
      Promise.resolve(l6ChessPhase()).catch((e) => console.warn('l6ChessPhase', e));
      return;
    }
    hint.classList.add('show');
    hint.innerHTML = '<strong>¡Oh no! ¡Hay otro!</strong><span>¡Destrúyelos a todos!</span>';
    clearTimeout(window.__hintHide);
    window.__hintHide = setTimeout(() => {
      if (launched && !gameOver && !paused && !l6Transit) hint.classList.remove('show');
    }, 2200);

    spawnL6Wave(2);
    // ball back on paddle — player launches
    if (ball && paddle) {
      stickBallToPaddle();
      launched = false;
    }
    clearL6Timers();
    l6PendingSpawn = setTimeout(() => {
      l6PendingSpawn = null;
      if (level().id !== 6 || won || gameOver) return;
      spawnL6Wave(3);
      hint.classList.add('show');
      hint.innerHTML = '<strong>¡Y otro más!</strong><span>Dos mechs a la vez</span>';
      clearTimeout(window.__hintHide);
      window.__hintHide = setTimeout(() => {
        if (launched && !gameOver && !paused) hint.classList.remove('show');
      }, 1800);
    }, 3000);
  }

  function spawnL6Wave(wave) {
    const side = wave === 2 ? (Math.random() < 0.5 ? 'left' : 'right') : (structures[0] && structures[0].structureDX > 0 ? 'left' : 'right');
    const S = buildStructureInstance({ side });
    if (wave === 2) {
      structures = [S];
      applyStructure(S);
    } else {
      structures.push(S);
      applyStructure(structures[0]);
    }
    l6Wave = Math.max(l6Wave, wave);
    refreshTotalStructureCount();
    aliveCount = 0;
    for (const st of structures) aliveCount += st.bricks.length;
    updateHud();
    bumpCam(3.5);
  }

  function structureBaseCenterX(S) {
    let minX = Infinity, maxX = -Infinity, n = 0;
    for (const br of S.bricks) {
      if (!br.alive || br.falling || br.settled) continue;
      const bx = br.baseX != null ? br.baseX : br.x;
      minX = Math.min(minX, bx);
      maxX = Math.max(maxX, bx + br.w);
      n++;
    }
    if (!n) return S.originX + (imgW * S.fitScale) / 2;
    return (minX + maxX) / 2;
  }

  function structureAliveWidth(S) {
    let minX = Infinity, maxX = -Infinity, n = 0;
    for (const br of S.bricks) {
      if (!br.alive || br.falling || br.settled) continue;
      const bx = br.baseX != null ? br.baseX : br.x;
      minX = Math.min(minX, bx);
      maxX = Math.max(maxX, bx + br.w);
      n++;
    }
    if (!n) return imgW * S.fitScale;
    return Math.max(24, maxX - minX);
  }

  function livingL6Structures() {
    return structures.filter((S) => {
      for (const br of S.bricks) {
        if (br.alive && !br.falling && !br.settled) return true;
      }
      return false;
    });
  }

  function assignL6WallTargets(permute) {
    const alive = livingL6Structures();
    if (!alive.length) return;
    const widths = alive.map(structureAliveWidth);
    const avgW = widths.reduce((a, b) => a + b, 0) / widths.length;
    const spacing = avgW * 0.95;
    const totalSpan = spacing * Math.max(0, alive.length - 1);
    const leftCenter = W / 2 - totalSpan / 2;

    let order = alive.map((_, i) => i);
    if (permute && order.length > 1) {
      for (let i = order.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        const t = order[i]; order[i] = order[j]; order[j] = t;
      }
    } else if (l6RookOrder.length === alive.length) {
      // keep prior permutation if still valid length
      order = l6RookOrder.slice();
    }
    l6RookOrder = order.slice();

    for (let slot = 0; slot < order.length; slot++) {
      const S = alive[order[slot]];
      const desiredCx = leftCenter + slot * spacing;
      const cxBase = structureBaseCenterX(S);
      S.jumpTargetDX = desiredCx - cxBase;
      S.wallSlot = slot;
    }
  }

  function beginL6WallMode(permute) {
    l6RookMode = 'wall';
    l6RookModeTimer = 2 + Math.random() * 2; // hold wall ~2–4s
    assignL6WallTargets(!!permute);
  }

  function beginL6ScatterMode() {
    l6RookMode = 'scatter';
    l6RookModeTimer = 10;
  }

  function updateL6RookFormation(dt) {
    if (level().id !== 6 || !l6RookStarted || l6Phase !== 'rooks') return;
    if (won || gameOver || outro || l6Transit) return;
    if (l6RooksSpawned < 3) return;

    const alive = livingL6Structures();
    if (!alive.length) return;

    if (!l6RookMode) beginL6WallMode(false);

    l6RookModeTimer -= dt;
    if (l6RookMode === 'wall') {
      // keep targets fresh if a rook died mid-wall
      if (alive.length !== l6RookOrder.length) assignL6WallTargets(false);
      if (l6RookModeTimer <= 0) beginL6ScatterMode();
    } else if (l6RookMode === 'scatter') {
      if (l6RookModeTimer <= 0) beginL6WallMode(true);
    }
  }

  async function spawnL6Rook(opts) {
    opts = opts || {};
    await loadMechSrc('mech-level6-rook.png');
    // Slightly smaller than pawn waves so 3 fit shoulder-to-shoulder
    const side = opts.side || (Math.random() < 0.5 ? 'left' : 'right');
    const S = buildStructureInstance({ side, mechScale: 0.40 });
    return S;
  }

  async function l6RookPhase() {
    if (l6RookStarted) return;
    l6RookStarted = true;
    l6Phase = 'rooks';
    l6RooksSpawned = 0;
    l6RookMode = null;
    l6RookModeTimer = 0;
    l6RookOrder = [];
    clearL6Timers();
    bombs = [];
    playerBomb = null;
    structures = [];
    structureCount = 0;
    outro = null;
    outroT = 0;
    launched = false;
    bumpCam(4);

    try {
      const r1 = await spawnL6Rook({ side: Math.random() < 0.5 ? 'left' : 'right' });
      if (level().id !== 6 || !l6RookStarted || won || gameOver) return;
      structures = [r1];
      l6RooksSpawned = 1;
      applyStructure(r1);
      refreshTotalStructureCount();
      aliveCount = r1.bricks.length;
      updateHud();
      bumpCam(3.5);
      if (ball && paddle) {
        stickBallToPaddle();
        launched = false;
      }

      clearL6Timers();
      l6PendingSpawn = setTimeout(() => {
        l6PendingSpawn = null;
        if (level().id !== 6 || !l6RookStarted || won || gameOver) return;
        hint.classList.add('show');
        hint.innerHTML = '<strong>¡Oh no…!</strong><span>¿Más mechs?</span>';
        clearTimeout(window.__hintHide);
        window.__hintHide = setTimeout(() => {
          if (launched && !gameOver && !paused && !l6Transit) hint.classList.remove('show');
        }, 2000);

        (async () => {
          const side2 = structures[0] && structures[0].structureDX > 0 ? 'left' : 'right';
          const r2 = await spawnL6Rook({ side: side2 });
          if (level().id !== 6 || !l6RookStarted || won || gameOver) return;
          structures.push(r2);
          l6RooksSpawned = 2;
          applyStructure(structures[0]);
          refreshTotalStructureCount();
          aliveCount = 0;
          for (const st of structures) aliveCount += st.bricks.length;
          updateHud();
          bumpCam(3.2);

          clearL6Timers();
          l6PendingSpawn = setTimeout(() => {
            l6PendingSpawn = null;
            if (level().id !== 6 || !l6RookStarted || won || gameOver) return;
            hint.classList.add('show');
            hint.innerHTML = '<strong>¿es en serio?</strong><span>¡Tres torres!</span>';
            clearTimeout(window.__hintHide);
            window.__hintHide = setTimeout(() => {
              if (launched && !gameOver && !paused && !l6Transit) hint.classList.remove('show');
            }, 2200);

            (async () => {
              const side3 = structures.length >= 2
                ? (structures[0].structureDX + structures[1].structureDX > 0 ? 'left' : 'right')
                : 'right';
              const r3 = await spawnL6Rook({ side: side3 });
              if (level().id !== 6 || !l6RookStarted || won || gameOver) return;
              structures.push(r3);
              l6RooksSpawned = 3;
              applyStructure(structures[0]);
              refreshTotalStructureCount();
              aliveCount = 0;
              for (const st of structures) aliveCount += st.bricks.length;
              updateHud();
              bumpCam(4);
              beginL6WallMode(false);
            })().catch((e) => console.warn('l6 rook3', e));
          }, 5000);
        })().catch((e) => console.warn('l6 rook2', e));
      }, 2000);
    } catch (e) {
      console.warn('l6RookPhase', e);
    }
  }

  async function l6ChessTransition() {
    if (l6Transit) return;
    // Idempotent: already in chess / mid-spawn — do nothing
    if (l6Phase === 'chess' || l6ChessSpawned > 0) return;
    // Recoverable half-state: started flag without transit/cam/knights → allow retry
    if (l6ChessStarted && !l6CamFX) {
      l6ChessStarted = false;
    }
    if (l6ChessStarted) return;
    // Begin transit first; only then mark started (avoid half-state)
    l6Transit = true;
    l6ChessStarted = true;
    clearL6Timers();
    bombs = [];
    playerBomb = null;
    if (ball) { ball.vx = 0; ball.vy = 0; }
    launched = false;
    outro = null;
    bumpCam(5);
    // Second head-turn right — slightly longer, looking into the ruined hall
    l6CamFX = { t: 0, dur: 1.55, swapped: false, nextImg: bgImgC, nextSrc: level().bgC, kind: 'chess' };
    hint.classList.add('show');
    hint.innerHTML = '<strong>¿Otra vez…?</strong><span>Volteas la mirada…</span>';
    try {
      if (!bgImgC && level().bgC) bgImgC = await loadBgSrc(level().bgC);
    } catch (e) {
      console.warn('bg-level6c', e);
    }
    if (l6CamFX) {
      l6CamFX.nextImg = bgImgC;
      l6CamFX.nextSrc = level().bgC;
    }
  }

  async function spawnL6Knight(opts) {
    opts = opts || {};
    await loadMechSrc(opts.src || 'mech-level6-knight.png');
    const side = opts.side || (Math.random() < 0.5 ? 'left' : 'right');
    const scale = opts.mechScale != null ? opts.mechScale : 0.42;
    const S = buildStructureInstance({ side, mechScale: scale });
    S.l6Knight = true;
    const desiredCx = W * (side === 'left' ? 0.32 : 0.68);
    S.homeDX = desiredCx - structureBaseCenterX(S);
    return S;
  }

  async function l6ChessPhase() {
    if (l6Phase === 'chess' && l6ChessSpawned > 0) return;
    l6ChessStarted = true;
    l6Phase = 'chess';
    l6ChessSpawned = 0;
    l6RookMode = null;
    l6RookModeTimer = 0;
    clearL6Timers();
    bombs = [];
    playerBomb = null;
    structures = [];
    structureCount = 0;
    outro = null;
    outroT = 0;
    launched = false;
    bumpCam(4);

    try {
      const k1 = await spawnL6Knight({ src: 'mech-level6-knight.png', side: 'left', mechScale: 0.42 });
      if (level().id !== 6 || !l6ChessStarted || won || gameOver) return;
      structures = [k1];
      l6ChessSpawned = 1;
      applyStructure(k1);
      refreshTotalStructureCount();
      aliveCount = k1.bricks.length;
      updateHud();
      bumpCam(3.5);
      if (ball && paddle) {
        stickBallToPaddle();
        launched = false;
      }

      clearL6Timers();
      l6PendingSpawn = setTimeout(() => {
        l6PendingSpawn = null;
        if (level().id !== 6 || !l6ChessStarted || won || gameOver) return;
        hint.classList.add('show');
        hint.innerHTML = '<strong>¡Y el otro!</strong><span>Dos caballeros</span>';
        clearTimeout(window.__hintHide);
        window.__hintHide = setTimeout(() => {
          if (launched && !gameOver && !paused && !l6Transit) hint.classList.remove('show');
        }, 2000);

        (async () => {
          const k2 = await spawnL6Knight({ src: 'mech-level6-knight2.png', side: 'right', mechScale: 0.43 });
          if (level().id !== 6 || !l6ChessStarted || won || gameOver) return;
          structures.push(k2);
          l6ChessSpawned = 2;
          applyStructure(structures[0]);
          refreshTotalStructureCount();
          aliveCount = 0;
          for (const st of structures) aliveCount += st.bricks.length;
          updateHud();
          bumpCam(3.6);
        })().catch((e) => console.warn('l6 knight2', e));
      }, 1600);
    } catch (e) {
      console.warn('l6ChessPhase', e);
    }
  }


  function mergeIrregularBricks(seedFrac) {
    // Fusiona semillas en ladrillos 2x2 / 2x1 / 1x2 / 3x2 (AABB opacos) → tamaños distintos
    const shapes = [
      { cw: 2, ch: 2 },
      { cw: 2, ch: 1 },
      { cw: 1, ch: 2 },
      { cw: 3, ch: 2 },
      { cw: 2, ch: 3 },
      { cw: 3, ch: 1 },
      { cw: 1, ch: 3 },
      { cw: 4, ch: 2 },
      { cw: 2, ch: 4 },
    ];
    const order = bricks.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = order[i]; order[i] = order[j]; order[j] = t;
    }
    const claimed = new Uint8Array(cols * rows);
    const keep = new Array(bricks.length).fill(true);
    let mergeSeeds = 0;
    const frac = (seedFrac != null && seedFrac > 0) ? seedFrac : 0.18;
    const seedBudget = Math.max(1, (bricks.length * frac) | 0);

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

  function convexHull(points) {
    if (points.length <= 2) return points.slice();
    const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower = [];
    for (const p of pts) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
    }
    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
      upper.push(p);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
  }

  function buildPanels(fit) {
    const ds = Math.max(2, Math.floor(Math.min(imgW, imgH) / 180));
    const gw = Math.ceil(imgW / ds);
    const gh = Math.ceil(imgH / ds);
    const opaque = [];
    const rAcc = new Float64Array(gw * gh);
    const gAcc = new Float64Array(gw * gh);
    const bAcc = new Float64Array(gw * gh);
    const nAcc = new Uint16Array(gw * gh);

    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        const x0 = gx * ds, y0 = gy * ds;
        const x1 = Math.min(imgW, x0 + ds);
        const y1 = Math.min(imgH, y0 + ds);
        let r = 0, g = 0, b = 0, n = 0;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const i = (y * imgW + x) * 4;
            if (imgData[i + 3] < 28) continue;
            r += imgData[i]; g += imgData[i + 1]; b += imgData[i + 2]; n++;
          }
        }
        if (n < Math.max(2, ds * ds * 0.12)) continue;
        const gi = gy * gw + gx;
        rAcc[gi] = r; gAcc[gi] = g; bAcc[gi] = b; nAcc[gi] = n;
        opaque.push(gi);
      }
    }
    if (!opaque.length) return;

    let minGX = gw, maxGX = 0, minGY = gh, maxGY = 0;
    for (const gi of opaque) {
      const gx = gi % gw, gy = (gi / gw) | 0;
      if (gx < minGX) minGX = gx; if (gx > maxGX) maxGX = gx;
      if (gy < minGY) minGY = gy; if (gy > maxGY) maxGY = gy;
    }

    const targetN = Math.max(110, Math.min(160, 150));
    const spanX = Math.max(1, maxGX - minGX + 1);
    const spanY = Math.max(1, maxGY - minGY + 1);
    const gridN = Math.max(1, Math.round(Math.sqrt(targetN * (spanX / spanY))));
    const gridM = Math.max(1, Math.round(targetN / gridN));
    const cellW = spanX / gridN;
    const cellH = spanY / gridM;
    const seeds = [];
    const usedSeed = Object.create(null);

    for (let j = 0; j < gridM; j++) {
      for (let i = 0; i < gridN; i++) {
        if (seeds.length >= targetN) break;
        const cx0 = minGX + (i + 0.15 + Math.random() * 0.7) * cellW;
        const cy0 = minGY + (j + 0.15 + Math.random() * 0.7) * cellH;
        let best = -1, bestD = Infinity;
        for (const gi of opaque) {
          const gx = gi % gw, gy = (gi / gw) | 0;
          const dx = gx + 0.5 - cx0, dy = gy + 0.5 - cy0;
          const d = dx * dx + dy * dy;
          if (d < bestD) { bestD = d; best = gi; }
        }
        if (best >= 0 && !usedSeed[best]) {
          usedSeed[best] = 1;
          seeds.push(best);
        }
      }
    }
    // Fill up if stratified missed some
    let guard = 0;
    while (seeds.length < targetN && seeds.length < opaque.length && guard++ < opaque.length * 4) {
      const gi = opaque[(Math.random() * opaque.length) | 0];
      if (usedSeed[gi]) continue;
      usedSeed[gi] = 1;
      seeds.push(gi);
    }

    const owner = new Int32Array(gw * gh);
    owner.fill(-1);
    for (const gi of opaque) {
      const gx = gi % gw, gy = (gi / gw) | 0;
      let best = 0, bestD = Infinity;
      for (let s = 0; s < seeds.length; s++) {
        const sgx = seeds[s] % gw, sgy = (seeds[s] / gw) | 0;
        const dx = gx - sgx, dy = gy - sgy;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = s; }
      }
      owner[gi] = best;
    }

    const buckets = Array.from({ length: seeds.length }, () => []);
    for (const gi of opaque) {
      const s = owner[gi];
      if (s >= 0) buckets[s].push(gi);
    }

    const minCells = 18;
    bricks = [];
    groundY = 0;
    minIy = rows;
    maxIy = 0;

    for (let s = 0; s < buckets.length; s++) {
      const cells = buckets[s];
      if (cells.length < minCells) continue;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let r = 0, g = 0, b = 0, n = 0;
      const boundary = [];
      for (const gi of cells) {
        const gx = gi % gw, gy = (gi / gw) | 0;
        if (gx < minX) minX = gx; if (gx > maxX) maxX = gx;
        if (gy < minY) minY = gy; if (gy > maxY) maxY = gy;
        r += rAcc[gi]; g += gAcc[gi]; b += bAcc[gi]; n += nAcc[gi];
        // boundary sample: edge of region or image
        let isBound = false;
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nx = gx + dx, ny = gy + dy;
          if (nx < 0 || ny < 0 || nx >= gw || ny >= gh || owner[ny * gw + nx] !== s) {
            isBound = true; break;
          }
        }
        if (isBound) {
          boundary.push({
            x: (gx + 0.5) * ds,
            y: (gy + 0.5) * ds,
          });
        }
      }
      if (n < 1) continue;

      // Thin regions: pad AABB a bit
      const imgMinX = minX * ds;
      const imgMinY = minY * ds;
      const imgMaxX = (maxX + 1) * ds;
      const imgMaxY = (maxY + 1) * ds;
      const cx = (imgMinX + imgMaxX) / 2;
      const cy = (imgMinY + imgMaxY) / 2;

      let hullSrc = boundary;
      if (hullSrc.length < 3) {
        hullSrc = [
          { x: imgMinX, y: imgMinY },
          { x: imgMaxX, y: imgMinY },
          { x: imgMaxX, y: imgMaxY },
          { x: imgMinX, y: imgMaxY },
        ];
      } else if (hullSrc.length > 48) {
        // downsample boundary for hull speed
        const step = Math.ceil(hullSrc.length / 40);
        hullSrc = hullSrc.filter((_, i) => i % step === 0);
      }
      let hull = convexHull(hullSrc);
      if (hull.length < 3) {
        hull = [
          { x: imgMinX, y: imgMinY },
          { x: imgMaxX, y: imgMinY },
          { x: imgMaxX, y: imgMaxY },
          { x: imgMinX, y: imgMaxY },
        ];
      }

      const poly = hull.map((p) => ({
        x: originX + p.x * fit,
        y: originY + p.y * fit,
      }));
      let bx = Infinity, by = Infinity, bx2 = -Infinity, by2 = -Infinity;
      for (const p of poly) {
        if (p.x < bx) bx = p.x; if (p.y < by) by = p.y;
        if (p.x > bx2) bx2 = p.x; if (p.y > by2) by2 = p.y;
      }
      // Ensure AABB covers poly
      const pad = 0.5;
      bx -= pad; by -= pad; bx2 += pad; by2 += pad;
      const bw = Math.max(4, bx2 - bx);
      const bh = Math.max(4, by2 - by);
      const ix = ((minX + maxX) / 2) | 0;
      const iy = ((minY + maxY) / 2) | 0;
      minIy = Math.min(minIy, iy);
      maxIy = Math.max(maxIy, iy);

      const br = {
        ix, iy,
        baseX: bx,
        baseY: by,
        x: bx,
        y: by,
        w: bw,
        h: bh,
        color: `rgb(${(r / n) | 0},${(g / n) | 0},${(b / n) | 0})`,
        hp: 1,
        maxHp: 1,
        alive: true,
        falling: false,
        settled: false,
        vx: 0,
        vy: 0,
        panel: true,
        poly,
        neighbors: [],
        cells: [{ ix, iy }],
      };
      groundY = Math.max(groundY, br.y + br.h);
      bricks.push(br);
    }

    // Adjacency: AABB touch / near
    const gap = Math.max(4, cellScreen * 1.25);
    for (let i = 0; i < bricks.length; i++) {
      const a = bricks[i];
      for (let j = i + 1; j < bricks.length; j++) {
        const b = bricks[j];
        if (a.baseX - gap > b.baseX + b.w) continue;
        if (b.baseX - gap > a.baseX + a.w) continue;
        if (a.baseY - gap > b.baseY + b.h) continue;
        if (b.baseY - gap > a.baseY + a.h) continue;
        a.neighbors.push(j);
        b.neighbors.push(i);
      }
    }
    groundY += 0.5;
  }

  function makeBrickLayerCanvas() {
    const c = document.createElement('canvas');
    c.width = Math.floor(W * dpr);
    c.height = Math.floor(H * dpr);
    const lctx = c.getContext('2d');
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lctx.clearRect(0, 0, W, H);
    return c;
  }

  /** Build irregular brick field from current imgData into a pack (does not touch paddle/ball). */
  function materializeBricksFromImgData(fit, ox, oy, layerTag, cellOverride) {
    originX = ox;
    originY = oy;
    fitScale = fit;
    cell = cellOverride != null ? cellOverride : pickCell();
    cols = Math.ceil(imgW / cell);
    rows = Math.ceil(imgH / cell);
    cellScreen = cell * fit;
    brickPx = Math.max(3.5, cellScreen + (level().fly ? 1.35 : 1.0));
    grid = new Int32Array(cols * rows);
    grid.fill(-1);
    bricks = [];
    minIy = rows;
    maxIy = 0;
    groundY = 0;

    for (let iy = 0; iy < rows; iy++) {
      for (let ix = 0; ix < cols; ix++) {
        if (bricks.length >= MAX_BRICKS) break;
        const c = avgCell(ix, iy, cell);
        if (!c) continue;
        minIy = Math.min(minIy, iy);
        maxIy = Math.max(maxIy, iy);
        const maxHp = 1;
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
          layer: layerTag || null,
        };
        groundY = Math.max(groundY, br.y + br.h);
        grid[iy * cols + ix] = bricks.length;
        bricks.push(br);
      }
    }
    groundY += 0.5;
    if (level().irregularBricks) mergeIrregularBricks();
    if (layerTag) {
      for (const br of bricks) br.layer = layerTag;
    }
    const layerCanvas = makeBrickLayerCanvas();
    brickLayer = layerCanvas;
    for (const br of bricks) drawBrickToLayer(br);
    return {
      bricks: bricks.slice(),
      grid,
      cols, rows, cell, cellScreen, brickPx,
      originX, originY, fitScale,
      groundY, minIy, maxIy,
      brickLayer: layerCanvas,
      structureCount: bricks.length,
      structureStartCount: bricks.length,
    };
  }


  function resetL8State() {
    l8Intro = false;
    l8IntroT = 0;
    l8CamY = 0;
    l8HandsSpawned = 0;
    l8HandSpawnAt = 0;
    l8Phase = 'idle';
    l8Fade = null;
    l8SpawnBusy = false;
    l8Debris = [];
    l8DebrisTimer = 0.6 + Math.random() * 0.8;
    l8EyeFlashT = 0;
    l8HeadStartCount = 0;
    l8TorsoStartCount = 0;
    l8TorsoStage = 'chest';
    l8Finale = null;
    l8Lasers = [];
    l8LaserCd = 0;
    l8LasersDone = false;
    l8HeadOriginX = 0;
    l8HeadOriginY = 0;
    l8TorsoQuakeT = 0;
    l8ExtraDust = [];
    l8TorsoDriftX = 0;
    l8TorsoDriftTarget = 0;
    l8TorsoDriftTimer = 0;
    window.__l8LaserImmuneUntil = 0;
  }

  function l8EaseInOut(u) {
    return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
  }

  /** Queen draw transform: scale so face+chest fills viewport when cam settled.
   *  Feet stay planted on groundY (rooftop floor) at camY=0; pan rises to face.
   *  Torso phase: full-body torso sprites, tall in frame, feet near rooftop ground. */
  function l8QueenDrawParams() {
    const torsoMode = (l8Phase === 'torso');
    const img = torsoMode ? l8QueenTorsoImg : l8QueenImg;
    if (!img || !img.naturalWidth) return null;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const footFrac = torsoMode ? 0.988 : 0.984; // opaque heel/toe near bottom of queen art
    const gy = (l8RooftopGroundY > 0)
      ? l8RooftopGroundY
      : (groundY > 0 ? groundY : H * (level().groundFrac != null ? level().groundFrac : 0.82));
    let scale, dw, dh, dx, dy;
    if (torsoMode) {
      // Outer = armadura sin cabeza (más baja). Under = mismo robot + cabeza (más alta).
      // Misma escala por ancho; encuadre usa la altura del under para que quepa la cabeza.
      const uImg = l8QueenTorsoUnderImg;
      const uiw = (uImg && uImg.naturalWidth) ? uImg.naturalWidth : iw;
      const uih = (uImg && uImg.naturalHeight) ? uImg.naturalHeight : ih;
      const topPad = H * 0.03;
      const availH = Math.max(80, gy - topPad);
      scale = (availH / (uih * footFrac)) * 0.98;
      if (uiw * scale > W * 1.15) scale = (W * 1.15) / uiw;
      dw = iw * scale;
      dh = ih * scale;
      dx = (W - dw) / 2;
      dy = gy - footFrac * dh; // pies de la armadura en el suelo
    } else {
      // Top ~38% of body ≈ face + chest; scale that band to viewport height
      const faceFrac = 0.38;
      scale = (H / (ih * faceFrac)) * 1.08;
      dw = iw * scale;
      dh = ih * scale;
      dx = (W - dw) / 2;
      // camY 0 → feet on rooftop ground plane; camY 1 → face+chest framed
      const dyFeet = gy - footFrac * dh;
      const dyFace = -dh * 0.02;
      dy = dyFeet + (dyFace - dyFeet) * l8CamY;
    }
    // Subtle queen sway after intro: slow sine DX left-right (feet stay planted)
    let px = 0, py = 0;
    if (!l8Intro && (l8Phase === 'hands' || l8Phase === 'head' || l8Phase === 'idle')) {
      px = Math.sin(bgT * 0.22) * 14;
      py = Math.cos(bgT * 0.18) * 1.8;
    }
    if (torsoMode) {
      // Movimiento lento al azar de un lado a otro
      px = l8TorsoDriftX;
      py = Math.cos(bgT * 0.15) * 2.2;
    }
    const out = { dx: dx + px, dy: dy + py, dw, dh, torso: torsoMode };
    if (torsoMode) {
      // Capa de abajo: mismo ancho/escala, más alta; pies alineados → cabeza sobresale
      const uImg = l8QueenTorsoUnderImg;
      if (uImg && uImg.naturalWidth) {
        const udw = dw;
        const udh = uImg.naturalHeight * (dw / uImg.naturalWidth);
        out.udx = out.dx;
        out.udy = out.dy + dh - udh;
        out.udw = udw;
        out.udh = udh;
      }
    }
    return out;
  }

  function drawL8Queen() {
    const q = l8QueenDrawParams();
    if (!q) return;
    const torsoMode = !!q.torso;
    const outer = torsoMode ? l8QueenTorsoImg : l8QueenImg;
    const under = torsoMode ? l8QueenTorsoUnderImg : l8QueenUnderImg;
    if (!outer) return;
    ctx.save();
    ctx.globalAlpha = 1;
    // Torso: under primero (cables+cabeza, pies alineados) → outer encima (armadura sin cabeza)
    if (torsoMode && under && under.naturalWidth && q.udw) {
      ctx.drawImage(under, q.udx, q.udy, q.udw, q.udh);
    }
    ctx.drawImage(outer, q.dx, q.dy, q.dw, q.dh);
    // Head phase: underlayer skull clipped to head AABB
    if (!torsoMode && (l8Phase === 'head' || l8EyeFlashT > 0) && under && under.naturalWidth) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(q.dx, q.dy, q.dw, q.dh * l8HeadFrac);
      ctx.clip();
      ctx.drawImage(under, q.dx, q.dy, q.dw, q.dh);
      ctx.restore();
    }
    // Torso: under encima de armadura (pecho, o cuerpo entero en fase armor)
    if (torsoMode && under && under.naturalWidth && q.udw) {
      ctx.save();
      ctx.beginPath();
      if (l8TorsoStage === 'armor') {
        ctx.rect(q.dx, q.dy, q.dw, q.dh);
      } else {
        ctx.rect(q.dx, q.dy + q.dh * l8ChestV0, q.dw, q.dh * (l8ChestV1 - l8ChestV0));
      }
      ctx.clip();
      ctx.drawImage(under, q.udx, q.udy, q.udw, q.udh);
      ctx.restore();
    }
    // Soft darkness so hands/paddle read on top
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(4,2,10,0.15)');
    g.addColorStop(0.55, 'rgba(4,2,10,0.05)');
    g.addColorStop(1, 'rgba(4,2,10,0.35)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function updateL8Intro(dt) {
    if (!l8Intro) return;
    l8IntroT += dt;
    const u = Math.min(1, l8IntroT / L8_INTRO_DUR);
    l8CamY = l8EaseInOut(u);
    launched = false;
    if (ball && paddle) stickBallToPaddle();
    if (u < 1) return;
    // Intro settled → spawn left hand, unlock play
    l8Intro = false;
    l8CamY = 1;
    l8Phase = 'hands';
    hint.classList.add('show');
    hint.innerHTML = '<strong>¡Sus manos!</strong><span>Destruye ambas · bloquean la bola</span>';
    clearTimeout(window.__hintHide);
    window.__hintHide = setTimeout(() => {
      if (launched && !gameOver && !paused) hint.classList.remove('show');
    }, 2600);
    Promise.resolve(spawnL8Hand('left')).catch((e) => console.warn('l8 hand L', e));
  }

  async function spawnL8Hand(side) {
    if (!level().queenBoss || won || gameOver) return null;
    if (l8SpawnBusy) return null;
    l8SpawnBusy = true;
    try {
      const src = side === 'left' ? (level().handL || 'mech-level8-hand-l.png') : (level().handR || 'mech-level8-hand-r.png');
      await loadMechSrc(src);
      const pad = 12;
      const paddleSpace = 92;
      const availW = W - pad * 2;
      const availH = H - pad * 2 - paddleSpace;
      const mechScale = level().mechScale != null ? level().mechScale : 0.58;
      const fit = Math.min(availW / imgW, availH / imgH) * mechScale;
      const ox = (W - imgW * fit) / 2;
      // Hands sit low — roughly bottom 25–40% of screen (closer to paddle)
      const mechHApprox = imgH * fit;
      const oyPreferred = H * 0.60; // top of hand band in lower half
      const oy = Math.max(pad, Math.min(oyPreferred, H - paddleSpace - mechHApprox * 0.78));
      fillBricksFromImage(fit, ox, oy);

      const mechW = imgW * fitScale;
      const mechH = imgH * fitScale;
      // Anchor: forearm stump toward outer edge — ~42% of width off-screen
      if (side === 'left') {
        structureDX = -originX - mechW * 0.42;
      } else {
        structureDX = (W + mechW * 0.42) - originX - mechW;
      }
      // vertical freedom — keep hands in lower quarter / near paddle
      const padTop = H * 0.55;
      const padBot = Math.min(H * 0.88, (paddle ? paddle.y : H * 0.9) - 28);
      const homeDY = 0;
      structureDY = homeDY;
      structureDVX = 0;
      structureDVY = 0;
      structureAngle = 0;
      structureAV = 0;
      jumpPhase = 'ground';
      jumpCooldown = 99;
      jumpTargetDX = structureDX;
      applyStructureOffset();

      const S = captureStructure();
      S.l8Side = side;
      S.homeDX = structureDX;
      S.l8HomeDY = homeDY;
      S.l8AnchorDX = structureDX;
      S.l8MinInward = side === 'left' ? structureDX : structureDX - mechW * 0.22;
      S.l8MaxInward = side === 'left' ? structureDX + mechW * 0.22 : structureDX;
      S.l8MinDY = Math.max(-mechH * 0.10, padTop - originY);
      S.l8MaxDY = Math.max(S.l8MinDY + 28, padBot - (originY + mechH * 0.55));

      structures.push(S);
      l8HandsSpawned = structures.length;
      if (side === 'left') {
        l8HandSpawnAt = performance.now();
      }
      refreshTotalStructureCount();
      aliveCount = 0;
      for (const st of structures) aliveCount += st.bricks.length;
      applyStructure(structures[0]);
      updateHud();
      bumpCam(2.8);
      return S;
    } finally {
      l8SpawnBusy = false;
    }
  }


  function clearL8HandStructures() {
    structures = [];
    bricks = [];
    grid = new Int32Array(1); grid[0] = -1;
    brickLayer = null;
    structureCount = 0;
    structureStartCount = 0;
    aliveCount = 0;
    structureDX = 0; structureDY = 0;
    structureDVX = 0; structureDVY = 0;
    structureAngle = 0; structureAV = 0;
    originX = 0; originY = 0;
    fitScale = 1;
  }

  function beginL8HeadPhase() {
    if (!level().queenBoss) return;
    if (l8Phase === 'head' || l8Phase === 'torso' || l8Phase === 'fade' || l8Phase === 'flash') return;
    outro = null;
    outroT = 0;
    window.__outroDust = false;
    window.__gotoNext = false;
    clearL8HandStructures();
    l8Phase = 'head';
    l8EyeFlashT = 1.0;
    l8Lasers = [];
    l8LaserCd = 0.9 + Math.random() * 0.6;
    l8LasersDone = false;
    l8HeadStartCount = 0;
    bumpCam(6);
    hint.classList.add('show');
    hint.innerHTML = '<strong>¡Su cabeza!</strong><span>Destruye el casco · esquiva el láser</span>';
    clearTimeout(window.__hintHide);
    window.__hintHide = setTimeout(() => {
      if (launched && !gameOver && !paused) hint.classList.remove('show');
    }, 2800);
    Promise.resolve(spawnL8Head()).catch((e) => console.warn('l8 head', e));
  }

  /** Build irregular bricks for queen HEAD only; positions track l8QueenDrawParams each frame. */
  async function spawnL8Head() {
    if (!level().queenBoss || won || gameOver) return null;
    if (l8SpawnBusy) return null;
    l8SpawnBusy = true;
    try {
      await loadMechSrc(level().queen || 'mech-level8-queen.png', 1600); // full-ish res for sharp face bricks
      const q = l8QueenDrawParams();
      if (!q || !imgW || !imgH) return null;

      const headFrac = l8HeadFrac;
      const fit = q.dw / imgW;
      const ox = q.dx;
      const oy = q.dy;
      l8HeadOriginX = ox;
      l8HeadOriginY = oy;

      originX = ox;
      originY = oy;
      fitScale = fit;

      // Solo cabeza: densísimo (≥7000) con celdas chicas (1px si hace falta)
      const HEAD_MIN = Math.max(MIN_BRICKS, 7000);
      const HEAD_CAP = Math.max(MAX_BRICKS, 12000);
      let localCell = 2;
      let bestN = 0;
      for (let c = 4; c >= 1; c--) {
        const ccols = Math.ceil(imgW / c);
        const headRows = Math.ceil((imgH * headFrac) / c);
        let n = 0;
        for (let iy = 0; iy < headRows; iy++) {
          for (let ix = 0; ix < ccols; ix++) {
            if (avgCell(ix, iy, c)) {
              n++;
              if (n >= HEAD_CAP) break;
            }
          }
          if (n >= HEAD_CAP) break;
        }
        localCell = c;
        bestN = n;
        if (n >= HEAD_MIN) break;
      }
      console.log('[l8-head] cell', localCell, 'estBricks', bestN, 'frac', headFrac, 'img', imgW, imgH);

      const localCols = Math.ceil(imgW / localCell);
      const localRows = Math.ceil(imgH / localCell);
      const headMaxIy = Math.max(1, Math.ceil((imgH * headFrac) / localCell));
      const localCellScreen = localCell * fit;
      // Brick screen size: keep tight so the face silhouette stays sharp
      const localBrickPx = Math.max(2.2, localCellScreen + 0.55);
      const localGrid = new Int32Array(localCols * localRows);
      localGrid.fill(-1);

      cell = localCell;
      cols = localCols;
      rows = localRows;
      cellScreen = localCellScreen;
      brickPx = localBrickPx;
      grid = localGrid;
      bricks = [];
      minIy = localRows;
      maxIy = 0;
      groundY = 0;

      const headBrickCap = HEAD_CAP;
      for (let iy = 0; iy < headMaxIy; iy++) {
        for (let ix = 0; ix < cols; ix++) {
          if (bricks.length >= headBrickCap) break;
          const c = avgCell(ix, iy, cell);
          if (!c) continue;
          minIy = Math.min(minIy, iy);
          maxIy = Math.max(maxIy, iy);
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
            hp: 1,
            maxHp: 1,
            alive: true,
            falling: false,
            settled: false,
            vx: 0,
            vy: 0,
            // Queen-local UV (fraction of full sprite) — synced every frame
            l8u: (ix * cell) / imgW,
            l8v: (iy * cell) / imgH,
            l8uw: cell / imgW,
            l8vh: cell / imgH,
          };
          groundY = Math.max(groundY, br.y + br.h);
          grid[iy * cols + ix] = bricks.length;
          bricks.push(br);
        }
      }
      groundY += 0.5;
      // Tamaños distintos (2x1, 2x2, …) sin paneles voronoi enormes
      mergeIrregularBricks(0.32);
      for (const br of bricks) {
        // UV desde AABB del ladrillo (tras merge)
        br.l8u = (br.baseX - originX) / Math.max(1e-6, imgW * fitScale);
        br.l8v = (br.baseY - originY) / Math.max(1e-6, imgH * fitScale);
        br.l8uw = br.w / Math.max(1e-6, imgW * fitScale);
        br.l8vh = br.h / Math.max(1e-6, imgH * fitScale);
      }

      brickLayer = document.createElement('canvas');
      brickLayer.width = Math.floor(W * dpr);
      brickLayer.height = Math.floor(H * dpr);
      const lctx = brickLayer.getContext('2d');
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lctx.clearRect(0, 0, W, H);
      for (const br of bricks) drawBrickToLayer(br);

      structureCount = bricks.length;
      structureStartCount = structureCount;
      l8HeadStartCount = structureCount;
      structureDX = 0;
      structureDVX = 0;
      structureDY = 0;
      structureDVY = 0;
      structureAngle = 0;
      structureAV = 0;
      jumpPhase = 'ground';
      jumpCooldown = 99;
      jumpTargetDX = 0;
      applyStructureOffset();

      const S = captureStructure();
      S.l8Head = true;
      structures = [S];
      refreshTotalStructureCount();
      aliveCount = bricks.length;
      applyStructure(structures[0]);
      syncL8HeadToQueen();
      updateHud();
      bumpCam(3.2);
      return S;
    } finally {
      l8SpawnBusy = false;
    }
  }

  /** Lock head structure to the SAME queen draw params (sway DX/DY only — no drift). */
  function syncL8HeadToQueen() {
    if (!level().queenBoss || l8Phase !== 'head') return;
    if (!structures.length) return;
    const q = l8QueenDrawParams();
    if (!q) return;
    eachStructure((S) => {
      if (!S || !S.l8Head) return;
      // originX/Y frozen at spawn (= queen dx/dy then). Sway → structure offset.
      structureDX = q.dx - originX;
      structureDY = q.dy - originY;
      structureDVX = 0;
      structureDVY = 0;
      structureAngle = 0;
      structureAV = 0;
      applyStructureOffset();
    });
  }

  /** Fundido a negro después de la cara; prepara torso en la oscuridad (alivia CPU). */
  function requestL8TorsoTransition() {
    if (!level().queenBoss) return;
    if (l8Phase === 'torso' || l8Phase === 'fade' || l8Fade) return;
    if (l8Phase === 'flash') return;
    outro = null;
    outroT = 0;
    window.__outroDust = false;
    window.__gotoNext = false;
    // Congelar pelea breve mientras disolvemos
    particles = [];
    bombs = [];
    playerBomb = null;
    l8Debris = [];
    l8Lasers = [];
    if (ball) { ball.vx = 0; ball.vy = 0; }
    launched = false;
    l8Phase = 'fade';
    l8Fade = { t: 0, out: 0.65, hold: 0.9, inn: 0.7, donePrep: false, readyIn: false };
    hint.classList.add('show');
    hint.innerHTML = '<strong>…</strong><span>La reina se recompone</span>';
    bumpCam(3);
  }

  function updateL8Fade(dt) {
    if (!l8Fade) return;
    l8Fade.t += dt;
    const { out, hold, inn } = l8Fade;
    // Casi negro: montar torso (CPU trabaja fuera de vista)
    if (!l8Fade.donePrep && l8Fade.t >= out * 0.9) {
      l8Fade.donePrep = true;
      beginL8TorsoPhase(true);
    }
    // No abrir el fundido hasta que el spawn del torso termine (o timeout hold)
    const blackDone = l8Fade.t >= out + hold;
    const spawnReady = l8Fade.donePrep && !l8SpawnBusy;
    if (!l8Fade.readyIn && blackDone && (spawnReady || l8Fade.t > out + hold + 2.5)) {
      l8Fade.readyIn = true;
      l8Fade.inStart = l8Fade.t;
    }
    if (l8Fade.readyIn) {
      const u = (l8Fade.t - (l8Fade.inStart || l8Fade.t)) / Math.max(1e-6, inn);
      if (u >= 1) {
        l8Fade = null;
        if (paddle && ball) stickBallToPaddle();
        hint.classList.add('show');
        hint.innerHTML = '<strong>¡Su torso!</strong><span>Rompe la armadura del pecho</span>';
        clearTimeout(window.__hintHide);
        window.__hintHide = setTimeout(() => {
          if (launched && !gameOver && !paused) hint.classList.remove('show');
        }, 3000);
      }
    }
  }

  function l8FadeBlackAlpha() {
    if (!l8Fade) return 0;
    const { t, out, inn } = l8Fade;
    if (!l8Fade.readyIn) {
      if (t <= out) return Math.min(1, t / Math.max(1e-6, out));
      return 1; // negro sólido hasta que el torso esté listo
    }
    const u = (t - (l8Fade.inStart || t)) / Math.max(1e-6, inn);
    return Math.max(0, 1 - u);
  }

  function drawL8FadeBlack() {
    const a = l8FadeBlackAlpha();
    if (a <= 0.001) return;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function beginL8TorsoPhase(fromFade) {
    if (!level().queenBoss) return;
    if (l8Phase === 'torso' && !fromFade) return;
    if (l8Phase === 'flash') return;
    // Si no viene del fade, pedir transición (excepto boot ?phase=torso)
    if (!fromFade && l8Phase !== 'fade' && !window.__l8TorsoBootSkipFade) {
      requestL8TorsoTransition();
      return;
    }
    outro = null;
    outroT = 0;
    window.__outroDust = false;
    window.__gotoNext = false;
    // Limpiar escombros/partículas de la cara ANTES del torso (evita freeze)
    particles = [];
    bombs = [];
    playerBomb = null;
    l8Debris = [];
    l8Lasers = [];
    clearL8HandStructures();
    // Fase lógica = torso (el fundido negro lo pinta l8Fade, no l8Phase)
    l8Phase = 'torso';
    l8CamY = 1;
    l8EyeFlashT = 0.85;
    l8Lasers = [];
    l8LaserCd = 0;
    l8LasersDone = false;
    l8TorsoStartCount = 0;
    l8TorsoStage = 'chest';
    l8TorsoQuakeT = 0;
    l8ExtraDust = [];
    window.__l8LaserImmuneUntil = 0;
    // Swap to torso background (keep rooftop cached)
    if (l8BgTorsoImg) bgImg = l8BgTorsoImg;
    // Dense earthquake dust
    bgDust = [];
    for (let i = 0; i < 110; i++) {
      bgDust.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: 0.7 + Math.random() * 3.0,
        vx: 0.1 + Math.random() * 0.55,
        vy: (Math.random() - 0.5) * 0.28,
        a: 0.14 + Math.random() * 0.34,
      });
    }
    bumpCam(fromFade ? 4 : 10);
    if (!fromFade) {
      hint.classList.add('show');
      hint.innerHTML = '<strong>¡Su torso!</strong><span>Rompe la armadura del pecho</span>';
      clearTimeout(window.__hintHide);
      window.__hintHide = setTimeout(() => {
        if (launched && !gameOver && !paused) hint.classList.remove('show');
      }, 3000);
    }
    Promise.resolve(spawnL8Torso()).catch((e) => console.warn('l8 torso', e));
  }

  /** Prefer light / white / gold chest armor pixels; skip dark cable arms. */
  function avgCellChestArmor(ix, iy, cellSize) {
    // Solo franja central (pecho/torso), no brazos de cables a los lados
    const u = ((ix + 0.5) * cellSize) / Math.max(1, imgW);
    if (u < 0.28 || u > 0.72) return null;
    const c = avgCell(ix, iy, cellSize);
    if (!c) return null;
    const luma = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
    const isGoldish = (c.r > 145 && c.g > 105 && c.b < c.r * 0.92 && (c.r + c.g) > c.b * 2.1);
    const isLight = luma >= 125;
    const isWhiteMetal = luma >= 155 && Math.abs(c.r - c.g) < 40 && Math.abs(c.g - c.b) < 45;
    if (!(isLight || isGoldish || isWhiteMetal)) return null;
    if (luma < 110 && !isGoldish) return null;
    return c;
  }

  /** Irregular white chest-plate bricks tracking torso queen draw transform. */
  async function spawnL8Torso() {
    if (!level().queenBoss || won || gameOver) return null;
    if (l8SpawnBusy) return null;
    l8SpawnBusy = true;
    try {
      await loadMechSrc('mech-level8-queen-torso.png', 1800);
      const q = l8QueenDrawParams();
      if (!q || !imgW || !imgH) return null;

      const v0 = l8ChestV0;
      const v1 = l8ChestV1;
      const fit = q.dw / imgW;
      const ox = q.dx;
      const oy = q.dy;

      originX = ox;
      originY = oy;
      fitScale = fit;

      const TORSO_MIN = 2800;
      const TORSO_CAP = 6500;
      let localCell = 2;
      let bestN = 0;
      for (let c = 4; c >= 1; c--) {
        const ccols = Math.ceil(imgW / c);
        const iy0 = Math.floor((imgH * v0) / c);
        const iy1 = Math.ceil((imgH * v1) / c);
        let n = 0;
        for (let iy = iy0; iy < iy1; iy++) {
          for (let ix = 0; ix < ccols; ix++) {
            if (avgCellChestArmor(ix, iy, c)) {
              n++;
              if (n >= TORSO_CAP) break;
            }
          }
          if (n >= TORSO_CAP) break;
        }
        localCell = c;
        bestN = n;
        if (n >= TORSO_MIN) break;
      }
      console.log('[l8-torso] cell', localCell, 'estBricks', bestN, 'v', v0, v1, 'img', imgW, imgH);

      const localCols = Math.ceil(imgW / localCell);
      const localRows = Math.ceil(imgH / localCell);
      const iy0 = Math.max(0, Math.floor((imgH * v0) / localCell));
      const iy1 = Math.min(localRows, Math.ceil((imgH * v1) / localCell));
      const localCellScreen = localCell * fit;
      const localBrickPx = Math.max(2.2, localCellScreen + 0.55);
      const localGrid = new Int32Array(localCols * localRows);
      localGrid.fill(-1);

      cell = localCell;
      cols = localCols;
      rows = localRows;
      cellScreen = localCellScreen;
      brickPx = localBrickPx;
      grid = localGrid;
      bricks = [];
      minIy = localRows;
      maxIy = 0;
      // Keep rooftop ground for queen feet / bg; brick ground is local to structure
      const savedGround = l8RooftopGroundY > 0 ? l8RooftopGroundY : (H * 0.88);
      groundY = 0;

      for (let iy = iy0; iy < iy1; iy++) {
        for (let ix = 0; ix < cols; ix++) {
          if (bricks.length >= TORSO_CAP) break;
          const c = avgCellChestArmor(ix, iy, cell);
          if (!c) continue;
          minIy = Math.min(minIy, iy);
          maxIy = Math.max(maxIy, iy);
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
            hp: 1,
            maxHp: 1,
            alive: true,
            falling: false,
            settled: false,
            vx: 0,
            vy: 0,
            l8u: (ix * cell) / imgW,
            l8v: (iy * cell) / imgH,
            l8uw: cell / imgW,
            l8vh: cell / imgH,
          };
          groundY = Math.max(groundY, br.y + br.h);
          grid[iy * cols + ix] = bricks.length;
          bricks.push(br);
        }
      }
      groundY += 0.5;
      // SIN merge: mergeIrregularBricks dejaba ~200 paneles enormes
      for (const br of bricks) {
        br.l8u = (br.baseX - originX) / Math.max(1e-6, imgW * fitScale);
        br.l8v = (br.baseY - originY) / Math.max(1e-6, imgH * fitScale);
        br.l8uw = br.w / Math.max(1e-6, imgW * fitScale);
        br.l8vh = br.h / Math.max(1e-6, imgH * fitScale);
      }

      brickLayer = document.createElement('canvas');
      brickLayer.width = Math.floor(W * dpr);
      brickLayer.height = Math.floor(H * dpr);
      const lctx = brickLayer.getContext('2d');
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lctx.clearRect(0, 0, W, H);
      // Dibujo en lote (más barato que drawBrickToLayer ×7000)
      for (const br of bricks) {
        if (!br.alive) continue;
        const lx = br.baseX, ly = br.baseY;
        lctx.fillStyle = br.color;
        lctx.fillRect(lx - 0.35, ly - 0.35, br.w + 0.7, br.h + 0.7);
      }

      structureCount = bricks.length;
      structureStartCount = structureCount;
      l8TorsoStartCount = structureCount;
      structureDX = 0;
      structureDVX = 0;
      structureDY = 0;
      structureDVY = 0;
      structureAngle = 0;
      structureAV = 0;
      jumpPhase = 'ground';
      jumpCooldown = 99;
      jumpTargetDX = 0;
      applyStructureOffset();

      const S = captureStructure();
      S.l8Torso = true;
      // Playfield floor for falling bricks / queen feet / bg (not chest AABB)
      S.l8PlayGroundY = savedGround;
      S.groundY = savedGround;
      groundY = savedGround;
      structures = [S];
      refreshTotalStructureCount();
      aliveCount = bricks.length;
      applyStructure(structures[0]);
      groundY = savedGround;
      syncL8TorsoToQueen();
      // Láseres de ojos desactivados por ahora (afinar pecho primero)
      l8Lasers = [];
      l8LasersDone = true;
      updateHud();
      bumpCam(1.8);
      console.log('[l8-torso] bricks', bricks.length);
      return S;
    } finally {
      l8SpawnBusy = false;
    }
  }

  function syncL8TorsoToQueen() {
    if (!level().queenBoss || l8Phase !== 'torso') return;
    if (!structures.length) return;
    const q = l8QueenDrawParams();
    if (!q) return;
    eachStructure((S) => {
      if (!S || !S.l8Torso) return;
      structureDX = q.dx - originX;
      structureDY = q.dy - originY;
      structureDVX = 0;
      structureDVY = 0;
      structureAngle = 0;
      structureAV = 0;
      applyStructureOffset();
      if (S.l8PlayGroundY) groundY = S.l8PlayGroundY;
    });
  }

  /** Armadura blanca restante (vestido completo; sin merge agresivo). */
  function avgCellRestArmor(ix, iy, cellSize) {
    const v = ((iy + 0.5) * cellSize) / Math.max(1, imgH);
    // Outer no tiene cabeza; evitar franja vacía superior
    if (v < 0.06) return null;
    const u = ((ix + 0.5) * cellSize) / Math.max(1, imgW);
    if (u < 0.03 || u > 0.97) return null;
    const c = avgCell(ix, iy, cellSize);
    if (!c) return null;
    const luma = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
    const isGoldish = (c.r > 140 && c.g > 100 && c.b < c.r * 0.95 && (c.r + c.g) > c.b * 2.0);
    const isLight = luma >= 105;
    const isWhiteMetal = luma >= 135 && Math.abs(c.r - c.g) < 50 && Math.abs(c.g - c.b) < 55;
    const isDarkRedLining = (c.r > 70 && c.r > c.g * 1.35 && c.r > c.b * 1.35 && luma < 105);
    if (isDarkRedLining) return null;
    if (!(isLight || isGoldish || isWhiteMetal)) return null;
    return c;
  }

  function applyL8ArmorFeel() {
    // Paddle -2%, bola +2% solo en resto de armadura
    if (!paddle) return;
    const cx = paddle.x + paddle.w * 0.5;
    basePaddleW = Math.min(168, W * 0.42) * levelPaddleScale();
    paddle.w = (bigPaddleUntil && performance.now() < bigPaddleUntil) ? basePaddleW * 1.35 : basePaddleW;
    paddle.h = paddleHeightForWidth(paddle.w);
    paddle.y = H - 28 - paddle.h;
    paddle.x = Math.max(6, Math.min(W - paddle.w - 6, cx - paddle.w / 2));
    if (ball) {
      const want = Math.min(7.4, 5.4 + Math.min(2, W / 420)) * 0.7 * levelBallSpeedMult();
      const sp = Math.hypot(ball.vx, ball.vy);
      ball.speed = Math.max(ball.speed || 0, want);
      // Si ya va en juego, subir ~2% desde velocidad actual de nivel
      if (sp > 0.4) {
        const ns = sp * 1.02;
        ball.vx = (ball.vx / sp) * ns;
        ball.vy = (ball.vy / sp) * ns;
        ball.speed = Math.max(ball.speed, ns);
      } else {
        ball.speed = want;
      }
    }
  }

  function beginL8ArmorRestPhase() {
    if (!level().queenBoss || won || gameOver) return;
    if (l8Phase !== 'torso' || l8TorsoStage !== 'chest') return;
    if (l8SpawnBusy) return;
    outro = null;
    outroT = 0;
    window.__outroDust = false;
    l8TorsoStage = 'armor';
    particles = [];
    bombs = [];
    playerBomb = null;
    l8Debris = [];
    l8Lasers = [];
    bricks = [];
    structures = [];
    structureCount = 0;
    structureStartCount = 0;
    grid = null;
    brickLayer = null;
    applyL8ArmorFeel();
    hint.classList.add('show');
    hint.innerHTML = '<strong>¡El resto!</strong><span>Rompe toda la armadura blanca</span>';
    clearTimeout(window.__hintHide);
    window.__hintHide = setTimeout(() => {
      if (launched && !gameOver && !paused) hint.classList.remove('show');
    }, 2800);
    bumpCam(1.4);
    // Diferir spawn un frame para que el mensaje pinte y no congele el hilo
    setTimeout(() => {
      Promise.resolve(spawnL8RestArmor()).catch((e) => console.warn('l8 armor rest', e));
    }, 40);
  }

  /** Irregular bricks: collar, faldas, restos blancos fuera del pecho. */
  async function spawnL8RestArmor() {
    if (!level().queenBoss || won || gameOver) return null;
    if (l8SpawnBusy) return null;
    l8SpawnBusy = true;
    try {
      await loadMechSrc('mech-level8-queen-torso.png', 1800);
      const q = l8QueenDrawParams();
      if (!q || !imgW || !imgH) return null;

      const fit = q.dw / imgW;
      const ox = q.dx;
      const oy = q.dy;
      originX = ox;
      originY = oy;
      fitScale = fit;

      // Objetivo ≥7000 ladrillos chicos (sin merge que los “censura” a ~200)
      const ARMOR_MIN = 7000;
      const ARMOR_CAP = 7800;
      let localCell = 2;
      let bestN = 0;
      for (let c = 3; c >= 1; c--) {
        const ccols = Math.ceil(imgW / c);
        const crows = Math.ceil(imgH / c);
        let n = 0;
        for (let iy = 0; iy < crows; iy++) {
          for (let ix = 0; ix < ccols; ix++) {
            if (avgCellRestArmor(ix, iy, c)) {
              n++;
              if (n >= ARMOR_CAP) break;
            }
          }
          if (n >= ARMOR_CAP) break;
        }
        localCell = c;
        bestN = n;
        if (n >= ARMOR_MIN) break;
      }
      console.log('[l8-armor] cell', localCell, 'estBricks', bestN);

      const localCols = Math.ceil(imgW / localCell);
      const localRows = Math.ceil(imgH / localCell);
      const localCellScreen = localCell * fit;
      const localBrickPx = Math.max(2.2, localCellScreen + 0.55);
      const localGrid = new Int32Array(localCols * localRows);
      localGrid.fill(-1);

      cell = localCell;
      cols = localCols;
      rows = localRows;
      cellScreen = localCellScreen;
      brickPx = localBrickPx;
      grid = localGrid;
      bricks = [];
      minIy = localRows;
      maxIy = 0;
      const savedGround = l8RooftopGroundY > 0 ? l8RooftopGroundY : (H * 0.88);
      groundY = 0;

      for (let iy = 0; iy < rows; iy++) {
        for (let ix = 0; ix < cols; ix++) {
          if (bricks.length >= ARMOR_CAP) break;
          const c = avgCellRestArmor(ix, iy, cell);
          if (!c) continue;
          minIy = Math.min(minIy, iy);
          maxIy = Math.max(maxIy, iy);
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
            hp: 1,
            maxHp: 1,
            alive: true,
            falling: false,
            settled: false,
            vx: 0,
            vy: 0,
            l8u: (ix * cell) / imgW,
            l8v: (iy * cell) / imgH,
            l8uw: cell / imgW,
            l8vh: cell / imgH,
          };
          groundY = Math.max(groundY, br.y + br.h);
          grid[iy * cols + ix] = bricks.length;
          bricks.push(br);
        }
      }
      groundY += 0.5;
      mergeIrregularBricks(0.22);
      for (const br of bricks) {
        br.l8u = (br.baseX - originX) / Math.max(1e-6, imgW * fitScale);
        br.l8v = (br.baseY - originY) / Math.max(1e-6, imgH * fitScale);
        br.l8uw = br.w / Math.max(1e-6, imgW * fitScale);
        br.l8vh = br.h / Math.max(1e-6, imgH * fitScale);
      }

      brickLayer = document.createElement('canvas');
      brickLayer.width = Math.floor(W * dpr);
      brickLayer.height = Math.floor(H * dpr);
      const lctx = brickLayer.getContext('2d');
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lctx.clearRect(0, 0, W, H);
      for (const br of bricks) drawBrickToLayer(br);

      structureCount = bricks.length;
      structureStartCount = structureCount;
      l8TorsoStartCount = structureCount;
      structureDX = 0;
      structureDVX = 0;
      structureDY = 0;
      structureDVY = 0;
      structureAngle = 0;
      structureAV = 0;
      jumpPhase = 'ground';
      jumpCooldown = 99;
      jumpTargetDX = 0;
      applyStructureOffset();

      const S = captureStructure();
      S.l8Torso = true;
      S.l8ArmorRest = true;
      S.l8PlayGroundY = savedGround;
      S.groundY = savedGround;
      groundY = savedGround;
      structures = [S];
      refreshTotalStructureCount();
      aliveCount = bricks.length;
      applyStructure(structures[0]);
      groundY = savedGround;
      syncL8TorsoToQueen();
      updateHud();
      bumpCam(1.6);
      console.log('[l8-armor] bricks', bricks.length);
      return S;
    } finally {
      l8SpawnBusy = false;
    }
  }

  function initL8TorsoBounceLasers() {
    l8Lasers = [];
    for (let eyeIdx = 0; eyeIdx < 2; eyeIdx++) {
      const e = l8EyeWorldPos(eyeIdx);
      const ang = (eyeIdx === 0 ? 0.55 : 0.95) + (Math.random() - 0.5) * 0.35;
      const spd = 1;
      l8Lasers.push({
        bounce: true,
        eyeIdx,
        x0: e.x, y0: e.y,
        x1: e.x, y1: e.y,
        dx: Math.cos(ang) * spd,
        dy: Math.sin(ang) * spd,
        t: 0,
        dur: 1e9,
        w: 8 + Math.random() * 3,
        pts: [],
      });
    }
  }

  function rebuildL8BounceRay(L, maxBounces) {
    const pts = [{ x: L.x0, y: L.y0 }];
    let x = L.x0, y = L.y0;
    let dx = L.dx, dy = L.dy;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const margin = 0.5;
    for (let b = 0; b < maxBounces; b++) {
      let tMin = Infinity;
      let nx = dx, ny = dy;
      // intersect screen edges
      if (dx > 1e-8) {
        const t = (W - margin - x) / dx;
        if (t > 1e-4 && t < tMin) { tMin = t; nx = -Math.abs(dx); ny = dy; }
      } else if (dx < -1e-8) {
        const t = (margin - x) / dx;
        if (t > 1e-4 && t < tMin) { tMin = t; nx = Math.abs(dx); ny = dy; }
      }
      if (dy > 1e-8) {
        const t = (H - margin - y) / dy;
        if (t > 1e-4 && t < tMin) { tMin = t; nx = dx; ny = -Math.abs(dy); }
      } else if (dy < -1e-8) {
        const t = (margin - y) / dy;
        if (t > 1e-4 && t < tMin) { tMin = t; nx = dx; ny = Math.abs(dy); }
      }
      if (!Number.isFinite(tMin) || tMin > 1e6) {
        pts.push({ x: x + dx * Math.max(W, H) * 2, y: y + dy * Math.max(W, H) * 2 });
        break;
      }
      x += dx * tMin;
      y += dy * tMin;
      x = Math.max(margin, Math.min(W - margin, x));
      y = Math.max(margin, Math.min(H - margin, y));
      pts.push({ x, y });
      dx = nx; dy = ny;
      // tiny nudge off wall so next bounce progresses
      x += dx * 0.35;
      y += dy * 0.35;
    }
    L.pts = pts;
    if (pts.length >= 2) {
      L.x1 = pts[1].x;
      L.y1 = pts[1].y;
    }
  }

  function l8EyeWorldPos(which) {
    const q = l8QueenDrawParams();
    if (!q) return { x: W * 0.5, y: H * 0.12 };
    // UV calibrados a los ojos/visor rojos del sprite (armadura vs cráneo)
    // Cabeza/fase láser usa underlayer (ojos redondos rojos).
    const armoredEyes = [
      { u: 0.430, v: 0.108 },
      { u: 0.458, v: 0.107 },
    ];
    const underEyes = [
      { u: 0.406, v: 0.098 },
      { u: 0.449, v: 0.095 },
    ];
    // Torso sprites (outer): start ~L 0.40/0.18 R 0.49/0.18 — refine via red pixels if needed
    const torsoEyes = [
      { u: 0.402, v: 0.181 },
      { u: 0.488, v: 0.175 },
    ];
    let eyes;
    if (l8Phase === 'torso') eyes = torsoEyes;
    else {
      const useUnder = (l8Phase === 'head' || l8Phase === 'flash' || l8EyeFlashT > 0);
      eyes = useUnder ? underEyes : armoredEyes;
    }
    const e = eyes[(which | 0) % eyes.length];
    return { x: q.dx + e.u * q.dw, y: q.dy + e.v * q.dh };
  }

  function distPointToSegment(px, py, x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-6) return Math.hypot(px - x0, py - y0);
    let t = ((px - x0) * dx + (py - y0) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
  }

  function l8LaserHitsPaddle(L) {
    if (!paddle) return false;
    const pad = {
      x: paddle.x,
      y: paddle.y,
      w: paddle.w,
      h: paddle.h,
    };
    // Thick beam: sample distance from paddle AABB (center + corners) to segment(s)
    const halfW = Math.max(10, L.w * 0.5);
    const cx = pad.x + pad.w / 2;
    const cy = pad.y + pad.h / 2;
    const samples = [
      [cx, cy],
      [pad.x, pad.y],
      [pad.x + pad.w, pad.y],
      [pad.x, pad.y + pad.h],
      [pad.x + pad.w, pad.y + pad.h],
      [cx, pad.y],
      [cx, pad.y + pad.h],
    ];
    const segs = [];
    if (L.bounce && L.pts && L.pts.length >= 2) {
      for (let i = 0; i < L.pts.length - 1; i++) {
        segs.push([L.pts[i].x, L.pts[i].y, L.pts[i + 1].x, L.pts[i + 1].y]);
      }
    } else {
      segs.push([L.x0, L.y0, L.x1, L.y1]);
    }
    for (const [x0, y0, x1, y1] of segs) {
      for (const [px, py] of samples) {
        if (distPointToSegment(px, py, x0, y0, x1, y1) <= halfW + 4) return true;
      }
      const ex = pad.x - halfW, ey = pad.y - halfW;
      const ew = pad.w + halfW * 2, eh = pad.h + halfW * 2;
      const pts = [[x0, y0], [x1, y1], [(x0 + x1) / 2, (y0 + y1) / 2]];
      for (const [px, py] of pts) {
        if (px >= ex && px <= ex + ew && py >= ey && py <= ey + eh) return true;
      }
    }
    return false;
  }

  function damageFromL8EyeLaser(dt, discreteHalf) {
    // Shield blocks the beam for a short grace after consuming one charge
    if (window.__l8LaserShieldUntil && performance.now() < window.__l8LaserShieldUntil) {
      return;
    }
    if (discreteHalf) {
      if (window.__l8LaserImmuneUntil && performance.now() < window.__l8LaserImmuneUntil) {
        return;
      }
    }
    if (shieldCharges > 0) {
      shieldCharges--;
      window.__l8LaserShieldUntil = performance.now() + 900;
      if (discreteHalf) window.__l8LaserImmuneUntil = performance.now() + 700;
      triggerHurtFX(false);
      updateHud();
      return;
    }
    if (discreteHalf) {
      // Torso bounce lasers: −½ heart once, then ~0.7s immunity
      lives = Math.max(0, +(lives - 0.5).toFixed(2));
      window.__l8LaserImmuneUntil = performance.now() + 700;
      triggerHurtFX(true);
      bumpCam(2.4);
      hint.classList.add('show');
      hint.innerHTML = '<strong>¡Láser!</strong><span>−½ corazón</span>';
      clearTimeout(window.__hintHide);
      window.__hintHide = setTimeout(() => { if (!gameOver && !paused) hint.classList.remove('show'); }, 900);
      updateHud();
      checkGameOver();
      return;
    }
    const dmg = dt * 0.5; // 0.5 heart per second of contact (head phase)
    lives = Math.max(0, +(lives - dmg).toFixed(3));
    if (!window.__l8LaserHurtT || performance.now() - window.__l8LaserHurtT > 180) {
      window.__l8LaserHurtT = performance.now();
      triggerHurtFX(false);
      bumpCam(1.1);
    }
    updateHud();
    checkGameOver();
  }

  function updateL8EyeLasers(dt) {
    if (!level().queenBoss) return;
    if (won || gameOver || outro || l8SpawnBusy) return;

    // HEAD: brief diagonal lasers → at ≥70% destroy begin torso (not forever-stop)
    if (l8Phase === 'head') {
      if (!l8LasersDone && l8HeadStartCount > 0) {
        const live = countAliveStructureBricks();
        const destroyed = l8HeadStartCount - live;
        if (destroyed / l8HeadStartCount >= 0.70) {
          beginL8TorsoPhase();
          return;
        }
      }

      for (const L of l8Lasers) {
        if (L.eyeIdx != null) {
          const e = l8EyeWorldPos(L.eyeIdx);
          L.x0 = e.x; L.y0 = e.y;
        }
        L.t += dt;
        if (
          !paused && !gameOver && !won && launched &&
          L.t < L.dur && l8LaserHitsPaddle(L)
        ) {
          damageFromL8EyeLaser(dt, false);
        }
      }
      l8Lasers = l8Lasers.filter((L) => L.t < L.dur);

      if (paused || !launched) return;

      l8LaserCd -= dt;
      if (l8LaserCd <= 0 && l8Lasers.length === 0) {
        const eyeIdx = Math.random() < 0.5 ? 0 : 1;
        const e = l8EyeWorldPos(eyeIdx);
        const targetX = Math.random() * W;
        let targetY = paddle
          ? paddle.y + paddle.h * (0.15 + Math.random() * 0.7)
          : H * (0.84 + Math.random() * 0.12);
        targetY = Math.max(targetY, e.y + H * 0.35);
        targetY = Math.min(H * 0.98, targetY);
        const dur = 0.65 + Math.random() * 0.5;
        l8Lasers.push({
          x0: e.x, y0: e.y,
          x1: targetX, y1: targetY,
          t: 0, dur,
          w: 7 + Math.random() * 5,
          eyeIdx,
        });
        l8LaserCd = 1.55 + Math.random() * 1.4;
        bumpCam(1.4);
      }
      return;
    }

    // TORSO: láseres desactivados temporalmente
    if (l8Phase === 'torso') {
      l8Lasers = [];
      return;
    }
  }

  function drawL8EyeLasers() {
    if (!l8Lasers.length) return;
    for (const L of l8Lasers) {
      // Lock origin to the eye every frame (sway / phase)
      if (L.eyeIdx != null) {
        const e = l8EyeWorldPos(L.eyeIdx);
        L.x0 = e.x; L.y0 = e.y;
      }
      if (L.bounce) rebuildL8BounceRay(L, 6);
      const u = L.bounce ? 0.5 : (L.t / Math.max(1e-6, L.dur));
      const fade = L.bounce ? 1 : (u < 0.12 ? u / 0.12 : (u > 0.85 ? (1 - u) / 0.15 : 1));
      const pulse = 0.75 + 0.25 * Math.sin(performance.now() * 0.04);
      const a = fade * pulse;
      const segs = [];
      if (L.bounce && L.pts && L.pts.length >= 2) {
        for (let i = 0; i < L.pts.length - 1; i++) {
          segs.push([L.pts[i].x, L.pts[i].y, L.pts[i + 1].x, L.pts[i + 1].y]);
        }
      } else {
        segs.push([L.x0, L.y0, L.x1, L.y1]);
      }
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const [x0, y0, x1, y1] of segs) {
        ctx.strokeStyle = `rgba(255,40,50,${0.22 * a})`;
        ctx.lineWidth = L.w * 3.2;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,60,70,${0.55 * a})`;
        ctx.lineWidth = L.w * 1.6;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,200,200,${0.95 * a})`;
        ctx.lineWidth = Math.max(2, L.w * 0.45);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      // Eye bloom
      ctx.fillStyle = `rgba(255,30,45,${0.55 * a})`;
      ctx.beginPath();
      ctx.arc(L.x0, L.y0, L.w * 1.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawL8EyeFlash() {
    if (l8EyeFlashT <= 0) return;
    const u = Math.max(0, Math.min(1, l8EyeFlashT)); // 1 → 0
    // Pulse matching her red eyes
    const pulse = 0.35 + 0.65 * Math.abs(Math.sin((1 - u) * Math.PI * 3.2));
    const a = u * pulse * 0.55;
    ctx.save();
    ctx.fillStyle = `rgba(200, 12, 28, ${a})`;
    ctx.fillRect(0, 0, W, H);
    // Hot center vignette
    const g = ctx.createRadialGradient(W * 0.45, H * 0.14, 10, W * 0.5, H * 0.2, Math.max(W, H) * 0.7);
    g.addColorStop(0, `rgba(255,40,50,${0.55 * u * pulse})`);
    g.addColorStop(0.35, `rgba(180,10,25,${0.25 * u})`);
    g.addColorStop(1, 'rgba(80,0,10,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }


  function updateL8HandSpawns() {
    if (!level().queenBoss || l8Phase !== 'hands' || l8Intro) return;
    if (l8HandsSpawned >= 2 || l8SpawnBusy) return;
    if (l8HandsSpawned === 1 && l8HandSpawnAt && performance.now() - l8HandSpawnAt >= 5000) {
      Promise.resolve(spawnL8Hand('right')).catch((e) => console.warn('l8 hand R', e));
    }
  }

  /** Hands block/intercept ball; stay anchored to their screen edge. */
  function updateL8HandAI(dt) {
    if (l8Phase !== 'hands' || l8Intro) {
      structureDVX *= 0.9;
      structureDVY *= 0.9;
      return;
    }
    if (!launched || gameOver || won || outro) {
      structureDVX *= 0.9;
      structureDVY *= 0.9;
      return;
    }
    const me = currentL6Structure();
    const side = (me && me.l8Side) || (structureDX < 0 ? 'left' : 'right');
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

    // Predict ball toward top of playfield
    let predX = ball.x, predY = ball.y;
    let threat = 0;
    const goingUp = ball.vy < -0.08;
    if (goingUp || ball.y < H * 0.72) {
      let px = ball.x, py = ball.y, pvx = ball.vx, pvy = ball.vy;
      const steps = 55;
      for (let f = 0; f < steps; f++) {
        px += pvx; py += pvy;
        if (px < ball.r) { px = ball.r; pvx = Math.abs(pvx); }
        if (px > W - ball.r) { px = W - ball.r; pvx = -Math.abs(pvx); }
        if (py < cy + halfH + 30 && goingUp) break;
      }
      predX = px; predY = py;
      const distX = Math.abs(predX - cx);
      const reach = halfW + ball.r + 70;
      if (distX < reach + 120 || (side === 'left' ? predX < W * 0.62 : predX > W * 0.38)) {
        threat = Math.max(0.25, 1.0 - distX / (reach + 160));
      }
    }

    // Horizontal: chase ball but clamp to edge-anchor band
    let desiredX = 0;
    if (threat > 0.08) {
      desiredX = predX < cx ? -1 : 1;
      // Prefer blocking toward ball's path across the top
      if (Math.abs(predX - cx) < 18) desiredX = side === 'left' ? 1 : -1; // nudge inward
    } else {
      const home = (me && me.homeDX != null) ? me.homeDX : 0;
      desiredX = structureDX > home + 6 ? -0.4 : structureDX < home - 6 ? 0.4 : 0;
    }

    // Vertical: raise/lower to intercept
    let desiredY = 0;
    if (threat > 0.08) {
      desiredY = predY < cy ? -1 : 1;
    } else {
      const homeY = (me && me.l8HomeDY != null) ? me.l8HomeDY : 0;
      desiredY = structureDY > homeY + 8 ? -0.35 : structureDY < homeY - 8 ? 0.25 : 0;
    }

    const step = dt * 60;
    const accel = 0.62 + threat * 1.15;
    structureDVX += desiredX * accel * step;
    structureDVX *= 0.90;
    structureDVX = Math.max(-5.8, Math.min(5.8, structureDVX));
    structureDX += structureDVX * step;

    const accelY = 0.55 + threat * 1.05;
    structureDVY += desiredY * accelY * step;
    structureDVY *= 0.90;
    structureDVY = Math.max(-5.4, Math.min(5.4, structureDVY));
    structureDY += structureDVY * step;

    // Clamp to side anchor band (never fully enter center)
    if (me) {
      const minDX = me.l8MinInward != null ? me.l8MinInward : structureDX;
      const maxDX = me.l8MaxInward != null ? me.l8MaxInward : structureDX;
      if (structureDX < minDX) { structureDX = minDX; structureDVX = Math.abs(structureDVX) * 0.35; }
      if (structureDX > maxDX) { structureDX = maxDX; structureDVX = -Math.abs(structureDVX) * 0.35; }
      const minDY = me.l8MinDY != null ? me.l8MinDY : -120;
      const maxDY = me.l8MaxDY != null ? me.l8MaxDY : 160;
      if (structureDY < minDY) { structureDY = minDY; structureDVY = Math.abs(structureDVY) * 0.35; }
      if (structureDY > maxDY) { structureDY = maxDY; structureDVY = -Math.abs(structureDVY) * 0.35; }
    }

    // Soft screen clamp — allow overhang on own edge
    const left = originX + structureDX;
    const right = originX + imgW * fitScale + structureDX;
    if (side === 'left') {
      if (right > W * 0.58) { structureDX -= right - W * 0.58; structureDVX *= -0.3; }
    } else {
      if (left < W * 0.42) { structureDX += W * 0.42 - left; structureDVX *= -0.3; }
    }

    structureAV *= 0.85;
    structureAngle *= 0.9;
    applyStructureOffset();
  }

  function spawnL8Debris() {
    if (!level().queenBoss || won || gameOver) return;
    if (l8Debris.length >= 10) return;
    const w = 10 + Math.random() * 22;
    const h = 8 + Math.random() * 18;
    const x = Math.random() * (W - w);
    // Ocres: café, beige, crema, blanco, negro, gris, dorado
    const palette = [
      [92, 58, 32],    // café
      [140, 98, 55],   // ocre
      [186, 152, 108], // beige
      [232, 214, 180], // crema
      [245, 240, 230], // blanco cálido
      [28, 26, 24],    // negro
      [110, 110, 108], // gris
      [72, 72, 70],    // gris oscuro
      [198, 156, 62],  // dorado
      [168, 128, 48],  // dorado oscuro
    ];
    const [r, g, b] = palette[(Math.random() * palette.length) | 0];
    l8Debris.push({
      x,
      y: -h - Math.random() * 40,
      w,
      h,
      vx: (Math.random() - 0.5) * 0.7,
      vy: 0.4 + Math.random() * 0.9,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.08,
      r, g, b,
      alive: true,
      hitPaddle: false,
    });
  }

  function damageFromL8Debris() {
    // 1/4 a 1/2 corazón por golpe
    if (shieldCharges > 0) {
      shieldCharges--;
      triggerHurtFX(false);
      hint.classList.add('show');
      hint.innerHTML = '<strong>Escudo</strong><span>Escombro bloqueado</span>';
      clearTimeout(window.__hintHide);
      window.__hintHide = setTimeout(() => { if (!gameOver) hint.classList.remove('show'); }, 900);
      updateHud();
      return;
    }
    const dmg = Math.random() < 0.5 ? 0.25 : 0.5;
    lives = Math.max(0, +(lives - dmg).toFixed(2));
    triggerHurtFX(dmg >= 0.5);
    bumpCam(dmg >= 0.5 ? 3.6 : 2.6);
    hint.classList.add('show');
    hint.innerHTML = dmg >= 0.5
      ? '<strong>¡Escombro!</strong><span>−½ corazón</span>'
      : '<strong>¡Escombro!</strong><span>−¼ corazón</span>';
    clearTimeout(window.__hintHide);
    window.__hintHide = setTimeout(() => { if (!gameOver && !paused) hint.classList.remove('show'); }, 1100);
    updateHud();
    checkGameOver();
  }

  function updateL8Debris(dt) {
    if (!level().queenBoss) return;
    const step = dt * 60;
    const debrisActive = !paused && !gameOver && !won && !outro && l8Phase !== 'idle';
    // Moderate spawn rate — rains during intro + hands (even if ball on paddle)
    // En fase pecho/torso: sin escombros (solo polvo / explosiones)
    if (l8Phase === 'torso') {
      l8Debris = [];
    } else if ((l8Phase === 'hands' || l8Phase === 'head' || l8Intro || l8Phase === 'intro') && debrisActive) {
      l8DebrisTimer -= dt;
      if (l8DebrisTimer <= 0) {
        spawnL8Debris();
        if (Math.random() < 0.28) spawnL8Debris();
        l8DebrisTimer = (l8Intro ? 1.2 : 0.85) + Math.random() * (l8Intro ? 1.4 : 1.35);
      }
    }
    // Debris passes through hands — only ball + paddle. Floor = bottom of screen.
    const floor = H + 2;
    const padPadX = 10;
    const padPadY = 14;
    for (let i = l8Debris.length - 1; i >= 0; i--) {
      const d = l8Debris[i];
      if (!d.alive) { l8Debris.splice(i, 1); continue; }

      // Substeps avoid tunneling through the thin paddle at high fall speed
      d.vy += 0.085 * step;
      d.vx *= 0.999;
      const moveX = d.vx * step;
      const moveY = d.vy * step;
      const dist = Math.hypot(moveX, moveY);
      const subN = Math.max(1, Math.min(12, Math.ceil(dist / 4)));
      const sx = moveX / subN;
      const sy = moveY / subN;
      for (let s = 0; s < subN; s++) {
        const prevY = d.y;
        const prevBottom = d.y + d.h;
        d.x += sx;
        d.y += sy;
        d.rot += d.vr * (step / subN);

        if (
          !d.hitPaddle &&
          paddle &&
          debrisActive &&
          paddle.h > 0 &&
          // swept: crossing or overlapping paddle band this substep
          (
            (d.y + d.h >= paddle.y - padPadY && d.y <= paddle.y + paddle.h + padPadY) ||
            (prevBottom < paddle.y - padPadY && d.y + d.h >= paddle.y - padPadY) ||
            (prevY > paddle.y + paddle.h + padPadY && d.y <= paddle.y + paddle.h + padPadY)
          ) &&
          d.x + d.w >= paddle.x - padPadX &&
          d.x <= paddle.x + paddle.w + padPadX
        ) {
          d.hitPaddle = true;
          d.y = paddle.y - d.h - 1;
          d.vy = -Math.abs(d.vy) * 0.25 - 1.2;
          d.vx += (Math.random() - 0.5) * 1.6;
          spawnDust(d.x + d.w * 0.5, paddle.y, `rgb(${d.r},${d.g},${d.b})`, 10, {
            spread: 1.2, up: 2.0, hemisphere: true, jitter: 12,
          });
          damageFromL8Debris();
          break;
        }
      }

      // light dust trail while falling
      d._dustT = (d._dustT || 0) - dt;
      if (d._dustT <= 0 && d.vy > 0.2) {
        d._dustT = 0.05 + Math.random() * 0.07;
        spawnDust(d.x + d.w * 0.5, d.y + d.h * 0.5, `rgb(${d.r},${d.g},${d.b})`, 2, {
          spread: 0.35, up: 0.15, jitter: 3,
        });
      }

      const hitGround = d.y + d.h >= floor || d.y > H + 40;
      if (hitGround || d.x + d.w < -40 || d.x > W + 40) {
        if (hitGround && !d.hitPaddle) {
          spawnDust(d.x + d.w * 0.5, H - 6, `rgb(${d.r},${d.g},${d.b})`, 7 + (Math.random() * 5) | 0, {
            spread: 0.9, up: 1.4, ground: true, hemisphere: true, jitter: 8,
          });
        }
        l8Debris.splice(i, 1);
      }
    }
  }

  function collideBallWithL8Debris() {
    if (!level().queenBoss || !ball || !l8Debris.length) return;
    for (const d of l8Debris) {
      if (!d.alive) continue;
      if (!collideCircleAABB(ball.x, ball.y, ball.r, d)) continue;
      const flags = bounceFlagsForHit(ball.x, ball.y, ball.r, d);
      // Separate ball out of AABB
      const nx = Math.max(d.x, Math.min(ball.x, d.x + d.w));
      const ny = Math.max(d.y, Math.min(ball.y, d.y + d.h));
      let dx = ball.x - nx, dy = ball.y - ny;
      const dist = Math.hypot(dx, dy) || 0.001;
      const push = ball.r - dist + 0.5;
      if (push > 0 && dist < ball.r) {
        ball.x += (dx / dist) * push;
        ball.y += (dy / dist) * push;
      } else if (flags.bounceY) {
        if (ball.vy > 0) ball.y = d.y - ball.r - 0.5;
        else ball.y = d.y + d.h + ball.r + 0.5;
      } else if (flags.bounceX) {
        if (ball.vx > 0) ball.x = d.x - ball.r - 0.5;
        else ball.x = d.x + d.w + ball.r + 0.5;
      }
      if (flags.bounceX) {
        ball.vx = -ball.vx * 0.98;
        d.vx += (ball.vx > 0 ? 1 : -1) * 0.35;
      }
      if (flags.bounceY) {
        ball.vy = -ball.vy * 0.98;
        d.vy += ball.vy * 0.15;
      }
      // Keep speed floor
      const sp = Math.hypot(ball.vx, ball.vy);
      const minSp = Math.max(2.8, (ball.speed || 4) * 0.72);
      if (sp < minSp && sp > 0.01) {
        ball.vx = (ball.vx / sp) * minSp;
        ball.vy = (ball.vy / sp) * minSp;
      }
      d.vr += (Math.random() - 0.5) * 0.12;
      bumpCam(1.1);
    }
  }

  function drawL8Debris() {
    if (!level().queenBoss || !l8Debris.length) return;
    for (const d of l8Debris) {
      if (!d.alive) continue;
      ctx.save();
      ctx.translate(d.x + d.w / 2, d.y + d.h / 2);
      ctx.rotate(d.rot);
      ctx.fillStyle = `rgb(${d.r},${d.g},${d.b})`;
      ctx.globalAlpha = 0.88;
      ctx.fillRect(-d.w / 2, -d.h / 2, d.w, d.h);
      // small crack highlight
      ctx.fillStyle = `rgba(40,32,28,0.45)`;
      ctx.fillRect(-d.w / 2, -d.h / 2, d.w * 0.35, d.h);
      ctx.fillStyle = `rgba(160,140,120,0.25)`;
      ctx.fillRect(d.w * 0.1, -d.h / 2, d.w * 0.25, d.h * 0.4);
      ctx.restore();
    }
  }

  function buildLevel() {
    resizeCanvas();
    clearL6Timers();
    l6Wave = 1;
    l6Transit = false;
    l6CamFX = null;
    resetDamageFX();
    structures = [];
    resetL8State();
    l6RookStarted = false;
    l6RooksSpawned = 0;
    l6Phase = 'pawns';
    l6RookMode = null;
    l6RookModeTimer = 0;
    l6RookOrder = [];
    l6ChessStarted = false;
    l6ChessSpawned = 0;
    // Reset L6 primary bg if we swapped to ruined corridor
    if (LEVELS[5] && LEVELS[5].bgB) LEVELS[5].bg = 'bg-level6.jpg';

    const pad = 12;
    const paddleSpace = 92;
    const availW = W - pad * 2;
    const availH = H - pad * 2 - paddleSpace;
    const mechScale = level().mechScale != null ? level().mechScale : 1;
    const fit = Math.min(availW / imgW, availH / imgH) * mechScale;
    originX = (W - imgW * fit) / 2;
    // Con mech más chico, bajar un poco para que los pies queden cerca del suelo
    // Si vuela (L4/L5), dejarlo más alto: pies sobre la franja de nubes
    const unusedH = availH - imgH * fit;
    const yBias = level().fly ? 0.28 : 0.55;
    originY = pad + 6 + Math.max(0, unusedH * yBias);
    fitScale = fit;
    structureDX = 0;
    structureDVX = 0;
    structureDY = 0;
    structureDVY = 0;
    structureAngle = 0;
    structureAV = 0;
    jumpPhase = 'ground';
    jumpCooldown = 0;
    jumpTargetDX = 0;

    bricks = [];
    groundY = 0;
    gridLower = null;
    gridUpper = null;
    brickLayerLower = null;
    brickLayerUpper = null;

    if (level().queenBoss) {
      // Queen is backdrop only — no bricks yet; hands spawn after intro
      cols = 1; rows = 1; cell = 8; cellScreen = 8; brickPx = 5;
      originX = 0; originY = 0; fitScale = 1;
      minIy = 0; maxIy = 0;
      // Screen ground line near lower playfield; bg groundFrac aligns rooftop floor
      groundY = H * 0.88;
      l8RooftopGroundY = groundY;
      grid = new Int32Array(1); grid[0] = -1;
      brickLayer = makeBrickLayerCanvas();
      structureCount = 0;
      structureStartCount = 1;
      aliveCount = 0;
      window.__dualStart = null;
      particles = [];
      bombs = [];
      playerBomb = null;
      playerBombArmed = false;
      setBombButton(false);
      bombTimer = 9999; // no enemy bombs on L8
      lives = START_LIVES;
      gameOver = false;
      won = false;
      outro = null;
      outroT = 0;
      window.__outroDust = false;
      bgT = 0;
      bgDust = [];
      for (let i = 0; i < 22; i++) {
        bgDust.push({
          x: Math.random() * W,
          y: Math.random() * H * 0.55,
          r: 0.5 + Math.random() * 1.6,
          vx: 0.1 + Math.random() * 0.28,
          vy: (Math.random() - 0.5) * 0.06,
          a: 0.08 + Math.random() * 0.16,
        });
      }
      l8Debris = [];
      l8DebrisTimer = 0.8 + Math.random() * 0.7;
      launched = false;
      clearLaserCannons();
      basePaddleW = Math.min(168, W * 0.42) * levelPaddleScale();
      const pw = basePaddleW;
      const ph = paddleHeightForWidth(pw);
      paddle = { w: pw, h: ph, x: (W - pw) / 2, y: H - 28 - ph, r: 7 };
      paddleTrail = [];
      bigPaddleUntil = 0;
      ballAirTrail = [];
      // Normal ball size (do NOT tie to hand brickPx / placeholder)
      const diameter = Math.max(5 * 3.92, 12);
      baseBallR = diameter / 2;
      const r = baseBallR * ballRadiusMult();
      ball = {
        r,
        x: 0, y: 0, vx: 0, vy: 0,
        speed: Math.min(7.4, 5.4 + Math.min(2, W / 420)) * 0.7 * levelBallSpeedMult(),
      };
      stickBallToPaddle();
      if (l8BootSkipToTorso) {
        // Atajo: como DESPUÉS de la transición a negro → torso jugable
        l8Intro = false;
        l8IntroT = 999;
        l8CamY = 1;
        l8HandsSpawned = 2;
        l8HandSpawnAt = 0;
        l8Phase = 'head';
        l8EyeFlashT = 0;
        l8HeadStartCount = 0;
        l8TorsoStartCount = 0;
        l8Lasers = [];
        l8LaserCd = 0;
        l8LasersDone = true;
        l8Fade = null;
        updateHud();
        running = true;
        window.__l8TorsoBootSkipFade = true;
        beginL8TorsoPhase(false);
        window.__l8TorsoBootSkipFade = false;
        if (window.__l8BootArmorRest) {
          window.__l8BootArmorRest = false;
          // Esperar pecho spawn y pasar a resto (prueba)
          setTimeout(() => {
            try {
              if (l8Phase === 'torso' && l8TorsoStage === 'chest') beginL8ArmorRestPhase();
            } catch (_) {}
          }, 200);
        }
        return;
      }
      if (l8BootSkipToHead) {
        // Atajo de prueba: sin intro ni manos → directo a cabeza
        l8Intro = false;
        l8IntroT = 999;
        l8CamY = 1;
        l8HandsSpawned = 2;
        l8HandSpawnAt = 0;
        l8Phase = 'hands'; // beginL8HeadPhase espera hands→head
        l8EyeFlashT = 0;
        l8HeadStartCount = 0;
        l8Lasers = [];
        l8LaserCd = 0;
        l8LasersDone = false;
        updateHud();
        running = true;
        beginL8HeadPhase();
        return;
      }
      l8Intro = true;
      l8IntroT = 0;
      l8CamY = 0;
      l8HandsSpawned = 0;
      l8HandSpawnAt = 0;
      l8Phase = 'intro';
      l8EyeFlashT = 0;
      l8HeadStartCount = 0;
      l8Lasers = [];
      l8LaserCd = 0;
      l8LasersDone = false;
      hint.classList.add('show');
      hint.innerHTML = '<strong>La Reina…</strong><span>Una presencia colosal</span>';
      updateHud();
      running = true;
      return;
    }

    if (level().dualLayer && imgDataLower && imgDataUpper) {
      // ONE body, two layers — shared origin/fit/transform/cell forever
      imgData = imgDataLower;
      const sharedCell = pickCell();
      imgData = imgDataUpper;
      const cellU = pickCell();
      // denser layer wins so both stay ≥ MIN_BRICKS when possible
      const dualCell = Math.min(sharedCell, cellU);
      imgData = imgDataLower;
      const lowerPack = materializeBricksFromImgData(fit, originX, originY, 'lower', dualCell);
      imgData = imgDataUpper;
      const upperPack = materializeBricksFromImgData(fit, originX, originY, 'upper', dualCell);

      // Shared grid metrics (both packs use same canvas size / cell)
      cols = upperPack.cols;
      rows = upperPack.rows;
      cell = upperPack.cell;
      cellScreen = upperPack.cellScreen;
      brickPx = upperPack.brickPx;
      originX = upperPack.originX;
      originY = upperPack.originY;
      fitScale = upperPack.fitScale;
      minIy = Math.min(lowerPack.minIy, upperPack.minIy);
      maxIy = Math.max(lowerPack.maxIy, upperPack.maxIy);
      groundY = Math.max(lowerPack.groundY, upperPack.groundY);

      const lowerBricks = lowerPack.bricks;
      const upperBricks = upperPack.bricks;
      const offset = lowerBricks.length;
      // Remap upper grid ids into combined bricks array
      const ug = new Int32Array(upperPack.grid.length);
      for (let i = 0; i < upperPack.grid.length; i++) {
        const id = upperPack.grid[i];
        ug[i] = id < 0 ? -1 : id + offset;
      }
      gridLower = lowerPack.grid;
      gridUpper = ug;
      grid = gridUpper;
      bricks = lowerBricks.concat(upperBricks);
      brickLayerLower = lowerPack.brickLayer;
      brickLayerUpper = upperPack.brickLayer;
      brickLayer = brickLayerUpper;
      // Redraw both layers into their canvases with final brick refs
      for (const br of bricks) drawBrickToLayer(br);
    } else if (level().panels) {
      cell = Math.max(2, Math.floor(Math.min(imgW, imgH) / 180));
      cols = Math.ceil(imgW / cell);
      rows = Math.ceil(imgH / cell);
      grid = new Int32Array(cols * rows);
      grid.fill(-1);
      cellScreen = cell * fit;
      brickPx = Math.max(10, cellScreen * 2.2);
      minIy = rows;
      maxIy = 0;
      buildPanels(fit);
      brickLayer = makeBrickLayerCanvas();
      for (const br of bricks) drawBrickToLayer(br);
    } else {
      const pack = materializeBricksFromImgData(fit, originX, originY, null);
      bricks = pack.bricks;
      grid = pack.grid;
      cols = pack.cols; rows = pack.rows; cell = pack.cell;
      cellScreen = pack.cellScreen; brickPx = pack.brickPx;
      originX = pack.originX; originY = pack.originY; fitScale = pack.fitScale;
      groundY = pack.groundY; minIy = pack.minIy; maxIy = pack.maxIy;
      brickLayer = pack.brickLayer;
    }

    structureCount = bricks.length;
    structureStartCount = structureCount;
    aliveCount = bricks.length;
    if (level().dualLayer) {
      let lo = 0, up = 0;
      for (const br of bricks) {
        if (br.layer === 'lower') lo++;
        else if (br.layer === 'upper') up++;
      }
      window.__dualStart = { lower: lo, upper: up };
    } else {
      window.__dualStart = null;
    }
    particles = [];
    bombs = [];
    playerBomb = null;
    playerBombArmed = false;
    setBombButton(false);
    bombTimer = 2.5;
    // score se conserva entre niveles (solo compra lo gasta)
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
    basePaddleW = Math.min(168, W * 0.42) * levelPaddleScale();
    const pw = basePaddleW;
    const ph = paddleHeightForWidth(pw);
    paddle = { w: pw, h: ph, x: (W - pw) / 2, y: H - 28 - ph, r: 7 };
    paddleTrail = [];
    bigPaddleUntil = 0;

    ballAirTrail = [];
    const diameter = Math.max(brickPx * 3.92, 12);
    baseBallR = diameter / 2;
    const r = baseBallR * ballRadiusMult();
    ball = {
      r,
      x: 0, y: 0, vx: 0, vy: 0,
      speed: Math.min(7.4, 5.4 + Math.min(2, W / 420)) * 0.7 * levelBallSpeedMult(),
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


  /** Explosión espectacular de bomba de tienda: fuego, humo, chispas, escombros. */
  function spawnShopBombBlast(x, y) {
    // Fase resto-armadura: FX mínimo (la bomba full congela el teléfono)
    if (isL8ArmorRest()) {
      bumpCam(2.2);
      spawnDust(x, y, 'rgb(255,160,60)', 14, { spread: 1.6, up: 2.0, jitter: 10 });
      spawnDust(x, y, 'rgb(70,65,60)', 10, { spread: 1.4, up: 1.6, jitter: 12 });
      if (particles.length > 260) particles.splice(0, particles.length - 260);
      return;
    }
    bumpCam(12);
    // Núcleo de fuego
    spawnDust(x, y, 'rgb(255,220,80)', 48, { spread: 2.8, up: 3.8, big: true, long: true, jitter: 18, hemisphere: true });
    spawnDust(x, y, 'rgb(255,120,30)', 56, { spread: 3.2, up: 4.2, big: true, long: true, jitter: 22 });
    spawnDust(x, y, 'rgb(255,60,20)', 36, { spread: 2.6, up: 2.8, big: true, long: true, jitter: 16 });
    // Humo negro/gris
    spawnDust(x, y - 6, 'rgb(40,40,45)', 50, { spread: 3.4, up: 3.0, big: true, long: true, jitter: 28, hemisphere: true });
    spawnDust(x, y - 10, 'rgb(90,85,80)', 40, { spread: 2.8, up: 3.6, big: true, long: true, jitter: 24, hemisphere: true });
    spawnDust(x, y + 4, 'rgb(60,55,50)', 28, { ground: true, hemisphere: true, spread: 3.0, up: 2.2, big: true, long: true, jitter: 30 });
    // Chispas metálicas en ráfagas
    for (let i = 0; i < 4; i++) {
      spawnMetalSparks(x + (Math.random() - 0.5) * 28, y + (Math.random() - 0.5) * 18);
    }
    // Embers / brasas
    for (let i = 0; i < 28; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 2.5 + Math.random() * 7;
      particles.push({
        x: x + (Math.random() - 0.5) * 12,
        y: y + (Math.random() - 0.5) * 8,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - (2 + Math.random() * 4),
        life: 0.45 + Math.random() * 0.7,
        maxLife: 0.7 + Math.random() * 0.7,
        size: 1.4 + Math.random() * 3.2,
        r: 255,
        g: 120 + ((Math.random() * 100) | 0),
        b: 20 + ((Math.random() * 40) | 0),
        spin: (Math.random() - 0.5) * 1.2,
        metal: true,
      });
    }
    // Flash breve
    hurtFlash = Math.max(hurtFlash, 0.18);
    if (particles.length > 1100) particles.splice(0, particles.length - 1100);
  }

  function flingBricksFromBlast(x, y, R) {
    // Resto armadura: no simular vuelo de cientos de ladrillos
    if (isL8ArmorRest()) return;
    const r2 = R * R;
    const fling = (list) => {
      for (const br of list) {
        if (!br.alive || br.settled) continue;
        if (br.layer === 'lower' && isLowerCoveredByUpper(br)) continue;
        const cx = br.x + br.w / 2;
        const cy = br.y + br.h / 2;
        const dx = cx - x;
        const dy = cy - y;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2 * 1.35) continue;
        if (br.falling) {
          const d = Math.sqrt(d2) || 1;
          const force = (2.8 + Math.random() * 3.2) * (1 - Math.min(1, d / (R * 1.2)));
          br.vx += (dx / d) * force;
          br.vy += (dy / d) * force - (1.5 + Math.random() * 2.5);
          continue;
        }
        // Arrancar de la estructura y lanzar
        const wasStructure = !br.falling;
        if (wasStructure && !br.panel) {
          const g = gridForBrick(br);
          let id = -1;
          if (g) {
            const gi = br.iy * cols + br.ix;
            id = (gi >= 0 && gi < g.length) ? g[gi] : -1;
          }
          clearBrickGrid(br, id >= 0 ? id : bricks.indexOf(br));
        }
        br.falling = true;
        const d = Math.sqrt(d2) || 1;
        const force = (3.5 + Math.random() * 4.5) * (1 - Math.min(1, d / (R * 1.25)));
        br.vx = (dx / d) * force + (Math.random() - 0.5) * 1.5;
        br.vy = (dy / d) * force - (2.2 + Math.random() * 3.5);
        drawBrickToLayer(br);
      }
    };
    if (structures.length) eachStructure(() => fling(bricks));
    else fling(bricks);
  }

  /** Bomba en resto-armadura: limpia sin simular caídas → cinemática. */
  function detonateArmorBombFast(x, y, R) {
    bumpCam(2.2);
    spawnDust(x, y, 'rgb(255,160,60)', 8, { spread: 1.2, up: 1.4, jitter: 8 });
    spawnDust(x, y, 'rgb(90,85,80)', 6, { spread: 1.1, up: 1.2, jitter: 9 });
    // Soltar referencias YA (no iterar 7000 para marcar alive=false)
    const n = structureCount || bricks.length || 0;
    score += Math.min(400, n);
    bricks = [];
    structures = [];
    structureCount = 0;
    structureStartCount = 0;
    grid = null;
    brickLayer = null;
    particles = particles.slice(-80);
    l8ExtraDust = [];
    updateHud();
    // Cinemática en el siguiente tick (el frame del botón sigue fluido)
    setTimeout(() => beginL8FinaleCinematic(), 30);
    return n;
  }

  function finishL8TorsoWinLight() {
    beginL8FinaleCinematic();
  }

  /** Final L8: negro → zoom pecho → sube a cara (sacudida) → explosiones en el rostro. */
  function beginL8FinaleCinematic() {
    if (won || gameOver || outro === 'done') return;
    if (l8Finale) return;
    particles = [];
    bombs = [];
    playerBomb = null;
    l8Debris = [];
    l8ExtraDust = [];
    l8Lasers = [];
    bricks = [];
    structures = [];
    structureCount = 0;
    structureStartCount = 0;
    grid = null;
    brickLayer = null;
    brickLayerLower = null;
    brickLayerUpper = null;
    outro = null;
    outroT = 0;
    window.__outroDust = false;
    launched = false;
    if (ball) { ball.vx = 0; ball.vy = 0; }
    camShake = 0;
    l8Phase = 'torso';
    l8TorsoStage = 'armor';
    hint.classList.remove('show');
    l8Finale = {
      t: 0,
      stage: 'black', // black | chest | rise | explode | done
      stageT: 0,
      zoom: 1,
      cam: 0, // 0 pecho → 1 cara
      shake: 0,
      boomCd: 0,
      booms: 0,
      alpha: 0,
    };
    updateHud();
  }

  function updateL8Finale(dt) {
    const F = l8Finale;
    if (!F || F.stage === 'done') return;
    F.t += dt;
    F.stageT += dt;
    if (ball && paddle) stickBallToPaddle();

    if (F.stage === 'black') {
      F.alpha = Math.min(1, F.stageT / 0.45);
      if (F.stageT >= 0.55) {
        F.stage = 'chest';
        F.stageT = 0;
        F.alpha = 1;
        F.zoom = 1.15;
        F.cam = 0;
      }
      return;
    }
    if (F.stage === 'chest') {
      F.zoom = 1.15 + Math.min(1, F.stageT / 1.1) * 0.55;
      F.cam = 0;
      F.shake = 0.4;
      if (F.stageT >= 1.25) {
        F.stage = 'rise';
        F.stageT = 0;
      }
      return;
    }
    if (F.stage === 'rise') {
      const u = Math.min(1, F.stageT / 2.2);
      F.cam = u * u * (3 - 2 * u); // smoothstep pecho→cara
      F.zoom = 1.7 - u * 0.15;
      F.shake = 1.2 + u * 3.5;
      if (F.stageT >= 2.35) {
        F.stage = 'explode';
        F.stageT = 0;
        F.boomCd = 0;
        F.booms = 0;
      }
      return;
    }
    if (F.stage === 'explode') {
      F.cam = 1;
      F.zoom = 1.55;
      F.shake = 4.5 + Math.sin(F.t * 28) * 1.2;
      F.boomCd -= dt;
      if (F.boomCd <= 0 && F.booms < 14) {
        F.boomCd = 0.12 + Math.random() * 0.18;
        F.booms++;
        const q = l8FinaleQueenRect();
        if (q) {
          const fx = q.dx + q.dw * (0.28 + Math.random() * 0.44);
          const fy = q.dy + q.dh * (0.02 + Math.random() * 0.22); // rostro
          spawnDust(fx, fy, 'rgb(255,180,60)', 18, { spread: 1.8, up: 2.2, jitter: 12 });
          spawnDust(fx, fy, 'rgb(255,80,30)', 14, { spread: 1.6, up: 1.8, jitter: 10 });
          spawnDust(fx, fy, 'rgb(40,40,45)', 12, { spread: 1.5, up: 1.4, jitter: 14 });
          bumpCam(2.2);
        }
      }
      if (particles.length > 220) particles.splice(0, particles.length - 220);
      // update particles lightly
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        p.x += (p.vx || 0) * dt * 60;
        p.y += (p.vy || 0) * dt * 60;
        p.vy = (p.vy || 0) + 0.08 * dt * 60;
      }
      if (F.stageT >= 2.8) {
        F.stage = 'done';
        F.stageT = 0;
        l8Finale = null;
        finishOutro();
      }
    }
  }

  /** Rect de reina para cinemática: pecho(cam=0) → cara(cam=1) usando under (con cabeza). */
  function l8FinaleQueenRect() {
    const under = l8QueenTorsoUnderImg;
    const outer = l8QueenTorsoImg;
    const img = (under && under.naturalWidth) ? under : outer;
    if (!img || !img.naturalWidth) return null;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const F = l8Finale || { zoom: 1.4, cam: 0 };
    const zoom = F.zoom || 1.4;
    const cam = F.cam || 0;
    // Encuadre pecho (centro ~0.32) → cara (~0.08)
    const focusV = 0.34 + (0.09 - 0.34) * cam;
    const baseScale = (H * 0.95 * zoom) / ih;
    const dw = iw * baseScale;
    const dh = ih * baseScale;
    const dx = (W - dw) / 2;
    const focusY = dh * focusV;
    const dy = H * 0.42 - focusY;
    return { dx, dy, dw, dh, img, outer, under };
  }

  function drawL8Finale() {
    const F = l8Finale;
    if (!F) return;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const q = l8FinaleQueenRect();
    if (!q) return;
    const sh = F.shake || 0;
    const ox = Math.sin(performance.now() * 0.05) * sh * 0.9 + (Math.random() - 0.5) * sh * 0.8;
    const oy = Math.cos(performance.now() * 0.06) * sh * 0.7 + (Math.random() - 0.5) * sh * 0.6;
    ctx.save();
    ctx.translate(ox, oy);
    // Under (con cabeza) siempre
    if (q.under && q.under.naturalWidth) {
      ctx.drawImage(q.under, q.dx, q.dy, q.dw, q.dh);
    } else if (q.img) {
      ctx.drawImage(q.img, q.dx, q.dy, q.dw, q.dh);
    }
    // Outer armadura, pies alineados, se desvanece al subir a la cara
    if (q.outer && q.outer.naturalWidth) {
      const ow = q.outer.naturalWidth, oh = q.outer.naturalHeight;
      const odw = q.dw;
      const odh = oh * (q.dw / ow);
      const odx = q.dx;
      const ody = q.dy + q.dh - odh;
      ctx.globalAlpha = Math.max(0.12, 1 - (F.cam || 0) * 0.92);
      ctx.drawImage(q.outer, odx, ody, odw, odh);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    for (const p of particles) {
      const a = Math.max(0, Math.min(1, p.life / (p.maxLife || 0.6)));
      ctx.globalAlpha = a;
      ctx.fillStyle = `rgb(${(p.r)|0},${(p.g)|0},${(p.b)|0})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size || 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function launch() {
    if (launched || gameOver || won) return;
    if (level().queenBoss && (l8Intro || l8Phase === 'intro')) return;
    launched = true;
    hint.classList.remove('show');
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.65;
    if (!(ball.speed > 0.5)) {
      ball.speed = Math.min(7.4, 5.4 + Math.min(2, W / 420)) * 0.7 * levelBallSpeedMult();
    }
    ball.vx = Math.cos(angle) * ball.speed;
    ball.vy = Math.sin(angle) * ball.speed;
    ballLastAng = angle;
    ballStallT = 0;
  }

  function resetDamageFX() {
    hurtFlash = 0;
    cracks = [];
    crackIntensity = 0;
    deathGlitch = 0;
    gameOverHintPending = false;
  }

  function syncCrackIntensity() {
    crackIntensity = Math.max(0, Math.min(1, 1 - lives / START_LIVES));
  }

  function syncDamageFxFromLives() {
    const prev = crackIntensity;
    crackIntensity = Math.max(0, Math.min(1, 1 - lives / START_LIVES));
    if (lives >= START_LIVES) {
      cracks = [];
      crackIntensity = 0;
      hurtFlash = 0;
      return;
    }
    if (crackIntensity < prev && cracks.length) {
      const keep = Math.floor(cracks.length * crackIntensity / Math.max(prev, 0.01));
      cracks.length = keep;
    }
  }

  function addCrackBurst(impactX, impactY, count) {
    const cx = impactX != null ? impactX : Math.random() * W;
    const cy = impactY != null ? impactY : H * (0.45 + Math.random() * 0.4);
    for (let i = 0; i < count; i++) {
      let angle = Math.random() * Math.PI * 2;
      const pts = [{ x: cx, y: cy }];
      let x = cx, y = cy;
      const segs = 4 + Math.floor(Math.random() * 5);
      for (let s = 0; s < segs; s++) {
        const len = 18 + Math.random() * (35 + crackIntensity * 40);
        angle += (Math.random() - 0.5) * 0.95;
        x += Math.cos(angle) * len;
        y += Math.sin(angle) * len;
        pts.push({ x, y });
        if (Math.random() < 0.38) {
          const ba = angle + (Math.random() < 0.5 ? -1 : 1) * (0.45 + Math.random() * 0.85);
          let bx = x, by = y;
          const bpts = [{ x, y }];
          const bn = 2 + Math.floor(Math.random() * 3);
          for (let b = 0; b < bn; b++) {
            const bl = 10 + Math.random() * 28;
            bx += Math.cos(ba) * bl;
            by += Math.sin(ba) * bl;
            bpts.push({ x: bx, y: by });
          }
          cracks.push({ pts: bpts, w: 0.7 + Math.random() * 1.1 });
        }
      }
      cracks.push({ pts, w: 1 + Math.random() * 2.1 });
    }
    if (cracks.length > 90) cracks.splice(0, cracks.length - 90);
  }

  function triggerHurtFX(fullHeart) {
    syncCrackIntensity();
    hurtFlash = fullHeart ? 0.32 : 0.22;
    bumpCam(fullHeart ? 3.2 : 2.4);
    const n = Math.max(2, Math.floor(2 + crackIntensity * 7 + (fullHeart ? 3 : 0)));
    const ix = paddle
      ? paddle.x + paddle.w / 2 + (Math.random() - 0.5) * W * 0.35
      : W * (0.25 + Math.random() * 0.5);
    const iy = paddle
      ? paddle.y - 30 - Math.random() * 90
      : H * (0.55 + Math.random() * 0.3);
    addCrackBurst(ix, iy, n);
  }

  function triggerDeathFX() {
    if (deathGlitch > 0 || gameOverHintPending) return; // once
    syncCrackIntensity();
    crackIntensity = 1;
    hurtFlash = 0.35;
    bumpCam(8);
    for (let i = 0; i < 14; i++) {
      addCrackBurst(Math.random() * W, Math.random() * H, 2 + (i % 3));
    }
    for (const c of cracks) {
      c.shard = {
        dx: (Math.random() - 0.5) * 8,
        dy: (Math.random() - 0.5) * 10,
        rot: (Math.random() - 0.5) * 0.06,
      };
    }
    deathGlitch = 1.15;
    gameOverHintPending = true;
  }

  function updateDamageFX(dt) {
    if (hurtFlash > 0) hurtFlash = Math.max(0, hurtFlash - dt);
    if (deathGlitch > 0) {
      deathGlitch = Math.max(0, deathGlitch - dt);
      if (deathGlitch <= 0 && gameOverHintPending) {
        gameOverHintPending = false;
        hint.classList.add('show');
        hint.innerHTML = '<strong>Game over</strong><span>Pulsa Reiniciar</span>';
      }
    }
  }

  function drawDamageOverlays() {
    // Glass cracks (screen-space, accumulate)
    if (cracks.length) {
      const shatter = deathGlitch > 0 || (gameOver && lives <= 0);
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const c of cracks) {
        if (!c.pts || c.pts.length < 2) continue;
        ctx.save();
        if (c.shard && shatter) {
          ctx.translate(c.shard.dx * (1.2 + (1 - Math.min(1, deathGlitch / 1.15)) * 1.5), c.shard.dy * 1.4);
          ctx.rotate(c.shard.rot);
        }
        ctx.beginPath();
        ctx.moveTo(c.pts[0].x, c.pts[0].y);
        for (let i = 1; i < c.pts.length; i++) ctx.lineTo(c.pts[i].x, c.pts[i].y);
        ctx.lineWidth = (c.w || 1.2) + (shatter ? 0.6 : 0);
        ctx.strokeStyle = shatter ? 'rgba(210,225,245,0.78)' : 'rgba(185,205,230,0.48)';
        ctx.stroke();
        ctx.lineWidth = Math.max(0.4, (c.w || 1) * 0.35);
        ctx.strokeStyle = 'rgba(8,10,18,0.4)';
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }

    // Transparent red hurt flash
    if (hurtFlash > 0) {
      const a = Math.min(0.42, hurtFlash * 1.35);
      ctx.fillStyle = `rgba(200, 12, 18, ${a})`;
      ctx.fillRect(0, 0, W, H);
    }

    // TV no-signal / glitch on death
    if (deathGlitch > 0) {
      const u = 1 - Math.min(1, deathGlitch / 1.15); // 0→1 through glitch
      const peak = u < 0.55 ? (u / 0.55) : (1 - (u - 0.55) / 0.45);
      const inten = Math.max(0.15, peak);

      // RGB channel shift stripes
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(255,40,40,${0.12 * inten})`;
      ctx.fillRect(-6 - inten * 10, 0, W, H);
      ctx.fillStyle = `rgba(40,255,220,${0.10 * inten})`;
      ctx.fillRect(6 + inten * 10, 0, W, H);
      ctx.fillStyle = `rgba(60,80,255,${0.08 * inten})`;
      ctx.fillRect(0, -3, W, H);
      ctx.restore();

      // Horizontal tear lines
      const tears = 6 + Math.floor(inten * 10);
      for (let i = 0; i < tears; i++) {
        const y = ((Math.sin(deathGlitch * 40 + i * 1.7) * 0.5 + 0.5) * H * 0.92) | 0;
        const h = 1 + ((i + deathGlitch * 20) % 4);
        const shift = Math.sin(deathGlitch * 55 + i) * (18 + inten * 40);
        ctx.fillStyle = `rgba(255,255,255,${0.08 + inten * 0.18})`;
        ctx.fillRect(shift, y, W, h);
        ctx.fillStyle = `rgba(0,0,0,${0.15 * inten})`;
        ctx.fillRect(-shift * 0.5, y + h, W, 1);
      }

      // Static noise speckles
      const n = Math.floor(80 + inten * 220);
      for (let i = 0; i < n; i++) {
        const x = Math.random() * W;
        const y = Math.random() * H;
        const g = Math.random();
        ctx.fillStyle = `rgba(${(g*255)|0},${(g*255)|0},${(g*255)|0},${0.15 + inten * 0.35})`;
        ctx.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 2);
      }

      // Color bars flicker (brief)
      if (inten > 0.55 && Math.sin(deathGlitch * 28) > 0.2) {
        const cols = ['#fff', '#ff0', '#0ff', '#0f0', '#f0f', '#f00', '#00f', '#000'];
        const bw = W / cols.length;
        ctx.save();
        ctx.globalAlpha = 0.18 * inten;
        for (let i = 0; i < cols.length; i++) {
          ctx.fillStyle = cols[i];
          ctx.fillRect(i * bw, H * 0.35, bw + 1, H * 0.3);
        }
        ctx.restore();
      }

      // Dark vignette pulse
      ctx.fillStyle = `rgba(0,0,0,${0.12 * inten})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function checkGameOver() {
    if (lives > 0.001) return false;
    lives = 0;
    gameOver = true;
    launched = false;
    bombs = [];
    clearLaserCannons();
    triggerDeathFX();
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
    triggerHurtFX(true);
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
      triggerHurtFX(false); // show impact even when shield consumes the hit
      updateHud();
      return;
    }
    lives = Math.max(0, +(lives - 0.25).toFixed(2));
    triggerHurtFX(false);
    updateHud();
    checkGameOver();
  }

  function destroyBrick(br, pts) {
    if (!br.alive || br.settled) return;
    const wasStructure = !br.falling;
    br.alive = false;
    br.falling = false;
    if (wasStructure) {
      if (!br.panel) {
        const g = gridForBrick(br);
        let id = -1;
        if (g) {
          const gi = br.iy * cols + br.ix;
          id = (gi >= 0 && gi < g.length) ? g[gi] : -1;
        }
        clearBrickGrid(br, id >= 0 ? id : bricks.indexOf(br));
      }
    }
    score += pts;
    if (isL8ArmorRest()) {
      // Sin recomputeSupport (congela); tumbar si queda poco
      let live = 0;
      for (const b of bricks) if (b.alive && !b.falling && !b.settled) live++;
      const start = structureStartCount || l8TorsoStartCount || 1;
      if (live > 0 && live <= start * 0.40) {
        for (const b of bricks) {
          if (!b.alive) continue;
          b.alive = false;
          b.falling = false;
          b.settled = false;
        }
        live = 0;
      }
      rebuildBrickLayerAlive();
      refreshTotalStructureCount();
      updateHud();
      if (live <= 0) setTimeout(() => beginL8FinaleCinematic(), 40);
      else maybeWin();
    } else {
      drawBrickToLayer(br);
      if (wasStructure) recomputeSupport();
      else updateHud();
    }
  }

  function ballDamage() {
    if (!activeBallSkin) return 1;
    const it = SHOP.find((s) => s.id === activeBallSkin);
    return (it && it.ballPower) || 1;
  }

  function hitBrick(br) {
    if (!br.alive || br.falling || br.settled) return;
    bumpCam(0.55);
    const hx = br.x + br.w / 2, hy = br.y + br.h / 2;
    spawnDust(hx, hy, br.color, br.hp <= 1 ? 14 : 8);
    spawnMetalSparks(hx, hy); // chispas metal-metal
    // Fase pecho: explosiones al azar al golpear armadura
    if (level().queenBoss && l8Phase === 'torso' && l8TorsoStage === 'chest' && Math.random() < 0.38) {
      bumpCam(2.8 + Math.random() * 3.2);
      if (typeof spawnShopBombBlast === 'function') {
        spawnShopBombBlast(hx, hy);
        if (Math.random() < 0.45) spawnShopBombBlast(hx + (Math.random() - 0.5) * 28, hy - 10 - Math.random() * 20);
      } else {
        spawnDust(hx, hy, 'rgb(255,120,40)', 36, { spread: 2.4, up: 3.2, big: true, long: true, jitter: 18 });
        spawnDust(hx, hy, 'rgb(60,55,50)', 28, { ground: true, hemisphere: true, spread: 2.0, up: 2.4, big: true, long: true, jitter: 22 });
      }
      spawnMetalSparks(hx, hy);
    }
    {
      let dmg = ballDamage() * (level().brickDamageMult || 1);
      if (isL8ArmorRest()) dmg *= 1.5625; // -20% y otro -20% dureza (0.8^2)
      br.hp -= dmg;
    }
    score += 1; // $1 por golpe
    if (br.hp <= 0) {
      destroyBrick(br, 0);
    } else {
      drawBrickToLayer(br);
      updateHud();
    }
    const sp = Math.hypot(ball.vx, ball.vy);
    const minSp = Math.max(3.2, ball.speed || 0);
    const ang = sp > 0.05 ? Math.atan2(ball.vy, ball.vx) : (ballLastAng || -Math.PI / 2);
    const boost = Math.min(6.8, Math.max(minSp, sp) * (sp > 0.05 ? 1.002 : 1));
    ball.vx = Math.cos(ang) * boost;
    ball.vy = Math.sin(ang) * boost;
    ball.speed = boost;
    ballLastAng = ang;
    ballStallT = 0;
  }

  function explodeAtOnCurrent(x, y, R, pts, r2) {
    // Armor rest: sin polvo por ladrillo ni grafo de soporte
    if (isL8ArmorRest()) {
      let hit = 0;
      for (let i = 0; i < bricks.length; i++) {
        const br = bricks[i];
        if (!br.alive || br.settled) continue;
        const cx = br.x + br.w * 0.5;
        const cy = br.y + br.h * 0.5;
        const d2 = (cx - x) * (cx - x) + (cy - y) * (cy - y);
        if (d2 > r2) continue;
        br.alive = false;
        br.falling = false;
        br.settled = false;
        score += pts;
        hit++;
      }
      if (hit) {
        let live = 0;
        for (const br of bricks) if (br.alive && !br.falling && !br.settled) live++;
        const start = structureStartCount || l8TorsoStartCount || 1;
        if (live > 0 && live <= start * 0.55) {
          for (const br of bricks) {
            if (!br.alive) continue;
            br.alive = false;
            br.falling = false;
            br.settled = false;
          }
        }
        rebuildBrickLayerAlive();
      }
      return hit;
    }
    const hitList = [];
    for (const br of bricks) {
      if (!br.alive || br.settled) continue;
      if (br.layer === 'lower' && isLowerCoveredByUpper(br)) continue;
      const cx = br.x + br.w / 2;
      const cy = br.y + br.h / 2;
      const d2 = (cx - x) * (cx - x) + (cy - y) * (cy - y);
      if (d2 <= r2) hitList.push(br);
    }
    for (const br of hitList) {
      spawnDust(br.x + br.w / 2, br.y + br.h / 2, br.color, 5);
      const wasStructure = !br.falling;
      br.alive = false;
      br.falling = false;
      if (wasStructure && !br.panel) {
        const g = gridForBrick(br);
        let id = -1;
        if (g) {
          const gi = br.iy * cols + br.ix;
          id = (gi >= 0 && gi < g.length) ? g[gi] : -1;
        }
        clearBrickGrid(br, id >= 0 ? id : bricks.indexOf(br));
      }
      score += pts;
      drawBrickToLayer(br);
    }
    if (hitList.length) recomputeSupport();
    return hitList.length;
  }

  function explodeAt(x, y, radius, ptsPerBrick) {
    const big = radius != null && radius > EXPLODE_R;
    const armor = isL8ArmorRest();
    bumpCam(armor ? 2.5 : (big ? 9.5 : 5.5));
    const R = radius != null ? radius : EXPLODE_R;
    const pts = ptsPerBrick != null ? ptsPerBrick : 1;
    const r2 = R * R;
    if (armor) {
      spawnDust(x, y, 'rgb(255,140,50)', 14);
      spawnDust(x, y, 'rgb(80,80,80)', 10);
    } else {
      spawnDust(x, y, 'rgb(255,120,40)', big ? 64 : 40);
      spawnDust(x, y, 'rgb(80,80,80)', big ? 44 : 24);
      if (big) {
        spawnDust(x, y, 'rgb(255,200,60)', 30, { spread: 2.4, up: 3.2, big: true, long: true, jitter: 14 });
        spawnMetalSparks(x, y);
      }
    }
    if (structures.length) {
      eachStructure(() => explodeAtOnCurrent(x, y, R, pts, r2));
      refreshTotalStructureCount();
      updateHud();
      maybeWin();
      return;
    }
    explodeAtOnCurrent(x, y, R, pts, r2);
  }

  function spawnBomb() {
    if (gameOver || won || !launched || l6Transit || l8Intro) return;
    if (level().queenBoss) return; // Queen / hands: no bombs
    const candidates = [];
    const gather = () => {
      for (const br of bricks) {
        if (!br.alive || br.falling || br.settled) continue;
        candidates.push(br);
      }
    };
    if (structures.length) eachStructure(gather);
    else gather();
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

  function collideCircleAABB(cx, cy, cr, br) {
    const nx = Math.max(br.x, Math.min(cx, br.x + br.w));
    const ny = Math.max(br.y, Math.min(cy, br.y + br.h));
    const dx = cx - nx;
    const dy = cy - ny;
    return dx * dx + dy * dy <= cr * cr;
  }

  function bounceFlagsForHit(cx, cy, cr, br) {
    const oL = (cx + cr) - br.x;
    const oR = (br.x + br.w) - (cx - cr);
    const oT = (cy + cr) - br.y;
    const oB = (br.y + br.h) - (cy - cr);
    if (Math.min(oL, oR) < Math.min(oT, oB)) return { bounceX: true, bounceY: false };
    return { bounceX: false, bounceY: true };
  }

  function aabbOverlapBricks(a, b) {
    return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
  }

  /** Lower brick is blocked while any overlapping alive upper brick covers it. */
  function isLowerCoveredByUpper(br) {
    if (!br || br.layer !== 'lower' || !level().dualLayer || !gridUpper) return false;
    const cells = brickCells(br);
    for (const c of cells) {
      if (c.iy < 0 || c.ix < 0 || c.iy >= rows || c.ix >= cols) continue;
      const id = gridUpper[c.iy * cols + c.ix];
      if (id < 0) continue;
      const ub = bricks[id];
      if (!ub || !ub.alive || ub.falling || ub.settled) continue;
      return true; // same covering cell
    }
    // Irregular AABB: check a small neighborhood of upper grid cells
    const ox = originX + structureDX;
    const oy = originY + structureDY;
    const ix0 = Math.max(0, Math.floor((br.x - ox) / cellScreen) - 1);
    const iy0 = Math.max(0, Math.floor((br.y - oy) / cellScreen) - 1);
    const ix1 = Math.min(cols - 1, Math.floor((br.x + br.w - ox) / cellScreen) + 1);
    const iy1 = Math.min(rows - 1, Math.floor((br.y + br.h - oy) / cellScreen) + 1);
    for (let iy = iy0; iy <= iy1; iy++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const id = gridUpper[iy * cols + ix];
        if (id < 0) continue;
        const ub = bricks[id];
        if (!ub || !ub.alive || ub.falling || ub.settled) continue;
        if (aabbOverlapBricks(br, ub)) return true;
      }
    }
    return false;
  }

  function collideBricksWithBallOnCurrent() {
    let hit = null;
    let bounceX = false;
    let bounceY = false;

    if (level().panels) {
      for (let i = 0; i < bricks.length; i++) {
        const br = bricks[i];
        if (!br.alive || br.falling || br.settled) continue;
        if (br.layer === 'lower' && isLowerCoveredByUpper(br)) continue;
        if (!collideCircleAABB(ball.x, ball.y, ball.r, br)) continue;
        if (hit && hit.layer === 'upper' && br.layer === 'lower') continue;
        hit = br;
        const flags = bounceFlagsForHit(ball.x, ball.y, ball.r, br);
        bounceX = flags.bounceX;
        bounceY = flags.bounceY;
        if (br.layer === 'upper') break;
      }
    } else {
      let ox, oy, lx, ly;
      if (level().fly) {
        const g = ballToStructureGrid(ball.x, ball.y);
        ox = g.ox; oy = g.oy; lx = g.x; ly = g.y;
      } else {
        ox = originX + structureDX;
        oy = originY + structureDY;
        lx = ball.x; ly = ball.y;
      }
      const ix0 = Math.floor((lx - ball.r - ox) / cellScreen) - 1;
      const iy0 = Math.floor((ly - ball.r - oy) / cellScreen) - 1;
      const ix1 = Math.floor((lx + ball.r - ox) / cellScreen) + 1;
      const iy1 = Math.floor((ly + ball.r - oy) / cellScreen) + 1;

      const gridsToScan = (level().dualLayer && gridUpper && gridLower)
        ? [gridUpper, gridLower]
        : [grid];

      for (const scanGrid of gridsToScan) {
      for (let iy = iy0; iy <= iy1; iy++) {
        if (iy < 0 || iy >= rows) continue;
        for (let ix = ix0; ix <= ix1; ix++) {
          if (ix < 0 || ix >= cols) continue;
          const id = scanGrid[iy * cols + ix];
          if (id < 0) continue;
          const br = bricks[id];
          if (!br.alive || br.falling || br.settled) continue;
          if (!collideCircleAABB(ball.x, ball.y, ball.r, br)) continue;
          if (br.layer === 'lower' && isLowerCoveredByUpper(br)) continue;

          // Prefer upper-layer hits when both could register
          if (hit && hit.layer === 'upper' && br.layer === 'lower') continue;
          if (!hit || (br.layer === 'upper' && hit.layer === 'lower')) {
            hit = br;
            const flags = bounceFlagsForHit(ball.x, ball.y, ball.r, br);
            bounceX = flags.bounceX;
            bounceY = flags.bounceY;
            if (br.layer === 'upper') break;
            continue;
          }
          hit = br;
          const flags = bounceFlagsForHit(ball.x, ball.y, ball.r, br);
          bounceX = flags.bounceX;
          bounceY = flags.bounceY;
          break;
        }
        if (hit && hit.layer === 'upper') break;
      }
      if (hit && hit.layer === 'upper') break;
      }
    }

    if (!hit) return false;
    if (bounceX) ball.vx *= -1;
    if (bounceY) ball.vy *= -1;
    ball.x += Math.sign(ball.vx || 1) * 0.6;
    ball.y += Math.sign(ball.vy || 1) * 0.6;
    hitBrick(hit);
    return true;
  }

  function collideBricksWithBall() {
    if (!structures.length) {
      collideBricksWithBallOnCurrent();
      return;
    }
    let struck = false;
    eachStructure(() => {
      if (struck) return;
      if (collideBricksWithBallOnCurrent()) struck = true;
    });
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
        const sp = 6.2 * 1.2; // +20% rebote
        b.vx = Math.cos(ang) * sp;
        b.vy = Math.sin(ang) * sp;
        b.reflected = true;
        spawnMetalSparks(b.x, paddle.y);
      }

      if (b.reflected) {
        const tryHit = () => {
          if (level().panels) {
            for (let i = 0; i < bricks.length; i++) {
              const br = bricks[i];
              if (!br.alive || br.falling || br.settled) continue;
              if (collideCircleAABB(b.x, b.y, b.r, br)) return true;
            }
            return false;
          }
          let ox, oy, lx, ly;
          if (level().fly) {
            const g = ballToStructureGrid(b.x, b.y);
            ox = g.ox; oy = g.oy; lx = g.x; ly = g.y;
          } else {
            ox = originX + structureDX;
            oy = originY + structureDY;
            lx = b.x; ly = b.y;
          }
          const ix0 = Math.floor((lx - b.r - ox) / cellScreen) - 1;
          const iy0 = Math.floor((ly - b.r - oy) / cellScreen) - 1;
          const ix1 = Math.floor((lx + b.r - ox) / cellScreen) + 1;
          const iy1 = Math.floor((ly + b.r - oy) / cellScreen) + 1;
          for (let iy = iy0; iy <= iy1; iy++) {
            if (iy < 0 || iy >= rows) continue;
            for (let ix = ix0; ix <= ix1; ix++) {
              if (ix < 0 || ix >= cols) continue;
              const id = grid[iy * cols + ix];
              if (id < 0) continue;
              const br = bricks[id];
              if (!br.alive || br.falling || br.settled) continue;
              if (collideCircleAABB(b.x, b.y, b.r, br)) return true;
            }
          }
          return false;
        };
        let struck = false;
        if (structures.length) {
          eachStructure(() => {
            if (struck) return;
            if (tryHit()) struck = true;
          });
        } else {
          struck = tryHit();
        }
        if (struck) {
          explodeAt(b.x, b.y);
          b.alive = false;
        }
      }

      if (!b.alive) { bombs.splice(i, 1); continue; }

      if (b.y - b.r > H + 6) {
        if (!b.reflected) loseQuarterLife();
        bombs.splice(i, 1);
      }
    }
  }

  function updateFallingOnCurrent(dt) {
    const step = dt * 60;
    let landed = 0;
    let landX = 0;
    const flying = !!(level().fly);
    // Todos los niveles: caen y desaparecen al suelo (sin amontonar) para aliviar carga
    const despawnAtGround = true;
    // Cabeza / resto armadura L8: escombros se borran al instante (evita freeze)
    if (level().queenBoss && (l8Phase === 'head' || (l8Phase === 'torso' && l8TorsoStage === 'armor'))) {
      let any = false;
      for (const br of bricks) {
        if (!br.alive || !br.falling) continue;
        br.alive = false;
        br.falling = false;
        br.settled = false;
        any = true;
      }
      if (any && brickLayer) {
        try {
          const lctx = brickLayer.getContext('2d');
          lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          lctx.clearRect(0, 0, W, H);
        } catch (_) {}
      }
      return;
    }
    for (const br of bricks) {
      if (!br.alive || !br.falling || br.settled) continue;
      // En niveles aéreos: gravedad suave + deriva, sin amontonar en el suelo
      br.vy += (flying ? G * 0.35 : G) * step;
      br.x += br.vx * step;
      br.y += br.vy * step;
      br.vx *= 0.998;
      if (flying) {
        br.vx += (Math.random() - 0.5) * 0.04 * step;
        // Desaparecen al salir de pantalla (no hay suelo)
        if (br.y > H + 40 || br.x < -80 || br.x > W + 80) {
          br.alive = false;
          br.falling = false;
          drawBrickToLayer(br);
        }
        continue;
      }

      if (despawnAtGround) {
        // Solo suelo: al tocar groundY se esfuman (sin pilas / sin O(n²))
        if (br.y + br.h >= groundY || br.y > H) {
          const x = br.x + br.w / 2;
          br.alive = false;
          br.falling = false;
          br.settled = false;
          drawBrickToLayer(br);
          landed++;
          landX += x;
          // polvo ligero ocasional (no por cada ladrillo)
          if (landed <= 4 || Math.random() < 0.08) {
            spawnDust(x, groundY - 4, 'rgb(120,100,80)', 6, {
              ground: true, hemisphere: true, spread: 1.2, up: 1.2, jitter: 12,
            });
          }
        }
        continue;
      }

      // Caen al suelo / escombros del piso — NO se apilan sobre la estructura que quedó abajo
      let stackTop = groundY;
      const bcx = br.x + br.w * 0.5;
      for (let i = 0; i < bricks.length; i++) {
        const o = bricks[i];
        if (o === br || !o.alive || !o.settled) continue;
        if (o.x + o.w < br.x - 1 || o.x > br.x + br.w + 1) continue;
        const ocx = o.x + o.w * 0.5;
        if (Math.abs(ocx - bcx) > (o.w + br.w) * 0.65) continue;
        if (o.y < groundY - brickPx * 8) continue; // solo pilas cerca del piso
        stackTop = Math.min(stackTop, o.y);
      }

      if (br.y + br.h >= stackTop) {
        br.y = stackTop - br.h;
        br.x += (Math.random() - 0.5) * br.w * 0.25;
        br.vx *= 0.2;
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
      const cloudK = despawnAtGround ? 0.85 : 1.6 + Math.min(2.5, landed / 40);
      spawnGroundCloud(landX / landed, cloudK);
      // varias bocanadas a lo largo del suelo
      const puffs = despawnAtGround ? 2 : 5;
      for (let i = 0; i < puffs; i++) {
        spawnGroundCloud(originX + Math.random() * (W * 0.6) + W * 0.2, despawnAtGround ? 0.7 : 1.1);
      }
    } else if (landed >= 3) {
      spawnGroundCloud(landX / landed, despawnAtGround ? 0.7 : 1.0);
    }
  }

  function updateFalling(dt) {
    if (structures.length) eachStructure(() => updateFallingOnCurrent(dt));
    else updateFallingOnCurrent(dt);
  }

  function structureCenters() {
    const cx0 = originX + (imgW * fitScale) / 2;
    const cy0 = originY + (imgH * fitScale) / 2;
    return { cx0, cy0, cx: cx0 + structureDX, cy: cy0 + structureDY };
  }

  /** Local (unrotated, no DX/DY) coords for grid lookup when fly mech is tilted. */
  function ballToStructureGrid(ballX, ballY) {
    const { cx0, cy0, cx, cy } = structureCenters();
    const dx = ballX - cx;
    const dy = ballY - cy;
    const cos = Math.cos(structureAngle);
    const sin = Math.sin(structureAngle);
    // inverse rotate around structure center, then express in origin (no DX/DY) space
    const lx = dx * cos + dy * sin;
    const ly = -dx * sin + dy * cos;
    return { ox: originX, oy: originY, x: lx + cx0, y: ly + cy0 };
  }

  function applyStructureOffset() {
    const flying = !!level().fly;
    if (flying) {
      const { cx0, cy0, cx, cy } = structureCenters();
      const cos = Math.cos(structureAngle);
      const sin = Math.sin(structureAngle);
      for (const br of bricks) {
        if (!br.alive || br.falling || br.settled) continue;
        const lx = br.baseX + br.w / 2 - cx0;
        const ly = br.baseY + br.h / 2 - cy0;
        const wx = cx + lx * cos - ly * sin;
        const wy = cy + lx * sin + ly * cos;
        br.x = wx - br.w / 2;
        br.y = wy - br.h / 2;
      }
    } else {
      for (const br of bricks) {
        if (!br.alive || br.falling || br.settled) continue;
        br.x = br.baseX + structureDX;
        br.y = br.baseY + structureDY;
      }
    }
  }

  function currentL6Structure() {
    if (!structures.length) return null;
    for (const S of structures) {
      if (S.bricks === bricks) return S;
    }
    return null;
  }

  function otherKnightWorldCx() {
    if (l6Phase !== 'chess') return null;
    for (const S of structures) {
      if (S.bricks === bricks) continue;
      if ((S.structureCount | 0) <= 0) continue;
      return structureBaseCenterX(S) + (S.structureDX || 0);
    }
    return null;
  }

  function applyKnightSeparation(step) {
    if (l6Phase !== 'chess' || structures.length < 2) return;
    let minX = Infinity, maxX = -Infinity, n = 0;
    for (const br of bricks) {
      if (!br.alive || br.falling || br.settled) continue;
      minX = Math.min(minX, br.x);
      maxX = Math.max(maxX, br.x + br.w);
      n++;
    }
    if (!n) return;
    const minGap = 56;
    for (const S of structures) {
      if (S.bricks === bricks || (S.structureCount | 0) <= 0) continue;
      let omin = Infinity, omax = -Infinity, on = 0;
      for (const br of S.bricks) {
        if (!br.alive || br.falling || br.settled) continue;
        omin = Math.min(omin, br.x);
        omax = Math.max(omax, br.x + br.w);
        on++;
      }
      if (!on) continue;
      const overlap = Math.min(maxX, omax) - Math.max(minX, omin);
      if (overlap > -minGap) {
        const myCx = (minX + maxX) / 2;
        const oCx = (omin + omax) / 2;
        const dir = myCx < oCx ? -1 : (myCx > oCx ? 1 : 1);
        const push = (overlap + minGap) * 0.085;
        structureDVX += dir * push * step;
        structureDVX = Math.max(-4.5, Math.min(4.5, structureDVX));
      }
    }
  }

  function updateJumpAI(dt) {
    const step = dt * 60;
    jumpCooldown = Math.max(0, jumpCooldown - dt);

    // Soft settle / idle when not in play (still hop-in from off-screen for L6 waves)
    if (!launched || gameOver || won || outro || l6Transit) {
      structureAV *= 0.8;
      structureAngle *= 0.9;
      if (structureDY < -0.01 || jumpPhase !== 'ground') {
        structureDVY += G * 0.9 * step;
        structureDY += structureDVY * step;
        structureDX += structureDVX * step;
        if (structureDY >= 0) {
          structureDY = 0;
          structureDVY = 0;
          structureDVX *= 0.45;
          jumpPhase = 'ground';
        }
      } else {
        structureDY = 0;
        structureDVY *= 0.85;
        // Walk/hop toward wall slot (rook) or center if spawned off-screen
        let idleTarget = 0;
        if (l6Phase === 'rooks' && l6RookMode === 'wall') idleTarget = jumpTargetDX;
        else if (l6Phase === 'chess') {
          const me = currentL6Structure();
          if (me && me.homeDX != null) idleTarget = me.homeDX;
        }
        if (Math.abs(structureDX - idleTarget) > 14) {
          structureDVX += (idleTarget - structureDX) * 0.035 * step;
          structureDVX *= 0.94;
          structureDX += structureDVX * step;
        } else {
          structureDVX *= 0.88;
        }
      }
      // keep on screen
      const left0 = originX + structureDX;
      const right0 = originX + imgW * fitScale + structureDX;
      if (left0 < 6) { structureDX += 6 - left0; structureDVX = Math.abs(structureDVX) * 0.35; }
      if (right0 > W - 6) { structureDX -= right0 - (W - 6); structureDVX = -Math.abs(structureDVX) * 0.35; }
      applyStructureOffset();
      return;
    }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, n = 0;
    for (const br of bricks) {
      if (!br.alive || br.falling || br.settled) continue;
      minX = Math.min(minX, br.x); maxX = Math.max(maxX, br.x + br.w);
      minY = Math.min(minY, br.y); maxY = Math.max(maxY, br.y + br.h);
      n++;
    }
    if (!n) { applyStructureOffset(); return; }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const halfW = (maxX - minX) / 2;

    // Predict impact (grounded: ball rising toward mech)
    let threat = 0;
    let predX = ball.x;
    const approaching = ball.vy < -0.05 && ball.y > minY;
    if (approaching) {
      const frames = (ball.y - cy) / Math.max(0.05, -ball.vy);
      if (frames > 0 && frames < 100) {
        let px = ball.x, py = ball.y, pvx = ball.vx, pvy = ball.vy;
        const steps = Math.min(70, frames | 0);
        for (let f = 0; f < steps; f++) {
          px += pvx; py += pvy;
          if (px < ball.r) { px = ball.r; pvx = Math.abs(pvx); }
          if (px > W - ball.r) { px = W - ball.r; pvx = -Math.abs(pvx); }
        }
        predX = px;
        const dist = Math.abs(predX - cx);
        const reach = halfW + ball.r + 40;
        if (dist < reach) threat = 1.0 - dist / (reach + 80);
      }
    } else if (Math.hypot(ball.x - cx, ball.y - cy) < halfW + 80 && ball.y < maxY + 40) {
      predX = ball.x;
      threat = 0.55;
    }

    const onGround = jumpPhase === 'ground' && structureDY >= -0.5;

    // Rook wall formation: hop/hold toward assigned shoulder slot
    if (l6Phase === 'rooks' && l6RookMode === 'wall') {
      const mechW = imgW * fitScale;
      const maxDX = W - 6 - mechW - originX;
      const minDX = 6 - originX;
      jumpTargetDX = Math.max(minDX, Math.min(maxDX, jumpTargetDX));
      const err = jumpTargetDX - structureDX;

      if (onGround && jumpCooldown <= 0 && Math.abs(err) > 16) {
        const heightPx = 34 + Math.random() * 22;
        structureDVY = -Math.sqrt(Math.max(8, 2 * G * heightPx));
        structureDVX = err / 16;
        structureDVX = Math.max(-4.5, Math.min(4.5, structureDVX));
        jumpPhase = 'up';
        jumpCooldown = 0.5 + Math.random() * 0.3;
      } else if (onGround) {
        structureDY = 0;
        structureDVY = 0;
        structureDVX *= 0.82;
        structureDVX += Math.max(-0.45, Math.min(0.45, err * 0.05)) * step;
        structureDX += structureDVX * step;
        structureAV *= 0.8;
        structureAngle *= 0.9;
        const leftW = originX + structureDX;
        const rightW = originX + mechW + structureDX;
        if (leftW < 6) { structureDX += 6 - leftW; structureDVX = Math.abs(structureDVX) * 0.35; }
        if (rightW > W - 6) { structureDX -= rightW - (W - 6); structureDVX = -Math.abs(structureDVX) * 0.35; }
        applyStructureOffset();
        return;
      }

      if (jumpPhase !== 'ground' || structureDY < -0.01) {
        structureDVY += G * 0.92 * step;
        structureDY += structureDVY * step;
        structureDX += structureDVX * step;
        const errAir = jumpTargetDX - structureDX;
        structureDVX += Math.max(-0.4, Math.min(0.4, errAir * 0.05)) * step;
        structureDVX *= 0.992;
        if (structureDVY > 0 && jumpPhase === 'up') jumpPhase = 'down';
        if (structureDY >= 0) {
          structureDY = 0;
          structureDVY = 0;
          structureDVX *= 0.28;
          jumpPhase = 'ground';
        }
      }
      structureAV *= 0.8;
      structureAngle *= 0.9;
      const left = originX + structureDX;
      const right = originX + mechW + structureDX;
      if (left < 6) { structureDX += 6 - left; structureDVX = Math.abs(structureDVX) * 0.4; }
      if (right > W - 6) { structureDX -= right - (W - 6); structureDVX = -Math.abs(structureDVX) * 0.4; }
      applyStructureOffset();
      return;
    }

    if (onGround && jumpCooldown <= 0 && threat > 0.08) {
      let dir = predX < cx ? 1 : -1;
      const roomL = cx - halfW - 8;
      const roomR = W - 8 - (cx + halfW);
      if (Math.abs(predX - cx) < 12) dir = roomR > roomL ? 1 : -1;
      // Prefer the side with more room if chosen side is tight
      if (dir < 0 && roomL < 50 && roomR > roomL) dir = 1;
      if (dir > 0 && roomR < 50 && roomL > roomR) dir = -1;

      const hopDist = 80 + Math.random() * 60; // 80–140px
      jumpTargetDX = structureDX + dir * hopDist;
      // Clamp target so feet stay on-screen
      const mechW = imgW * fitScale;
      const maxDX = W - 6 - mechW - originX;
      const minDX = 6 - originX;
      jumpTargetDX = Math.max(minDX, Math.min(maxDX, jumpTargetDX));
      if (l6Phase === 'chess') {
        const otherCx = otherKnightWorldCx();
        if (otherCx != null) {
          const destCx = cx + (jumpTargetDX - structureDX);
          const minSep = halfW + 70;
          if (Math.abs(destCx - otherCx) < minSep) {
            dir = destCx >= otherCx ? 1 : -1;
            if (dir < 0 && roomL < 50 && roomR > roomL) dir = 1;
            if (dir > 0 && roomR < 50 && roomL > roomR) dir = -1;
            jumpTargetDX = structureDX + dir * hopDist;
            jumpTargetDX = Math.max(minDX, Math.min(maxDX, jumpTargetDX));
            const dest2 = cx + (jumpTargetDX - structureDX);
            if (Math.abs(dest2 - otherCx) < minSep) {
              const away = (cx < otherCx ? -1 : 1) * (minSep + 20);
              jumpTargetDX = structureDX + (otherCx + away - cx);
              jumpTargetDX = Math.max(minDX, Math.min(maxDX, jumpTargetDX));
            }
          }
        }
      }

      const heightPx = 42 + Math.random() * 28; // ~40–70
      // v0 ≈ -sqrt(2 * G * h) in per-frame units
      structureDVY = -Math.sqrt(Math.max(8, 2 * G * heightPx));
      structureDVX = (jumpTargetDX - structureDX) / 18; // drift toward hop X while airborne
      structureDVX = Math.max(-4.2, Math.min(4.2, structureDVX));
      jumpPhase = 'up';
      jumpCooldown = 0.9 + Math.random() * 0.5; // 0.9–1.4s
    }

    if (jumpPhase !== 'ground' || structureDY < -0.01) {
      structureDVY += G * 0.92 * step;
      structureDY += structureDVY * step;
      structureDX += structureDVX * step;
      // Nudge toward hop target while airborne
      if (jumpPhase !== 'ground') {
        const err = jumpTargetDX - structureDX;
        structureDVX += Math.max(-0.35, Math.min(0.35, err * 0.04)) * step;
        structureDVX *= 0.992;
      }
      if (structureDVY > 0 && jumpPhase === 'up') jumpPhase = 'down';
      if (structureDY >= 0) {
        structureDY = 0;
        structureDVY = 0;
        structureDVX *= 0.28;
        jumpPhase = 'ground';
      }
    } else {
      // Ground idle: gentle return toward home (knights) or center
      structureDY = 0;
      structureDVY = 0;
      structureDVX *= 0.9;
      let idleX = 0;
      if (l6Phase === 'chess') {
        const me = currentL6Structure();
        if (me && me.homeDX != null) idleX = me.homeDX;
      }
      if (Math.abs(structureDX - idleX) > 10) {
        structureDVX += (structureDX > idleX ? -0.22 : 0.22) * step * 0.35;
      }
      structureDX += structureDVX * step;
    }

    structureAV *= 0.8;
    structureAngle *= 0.9;

    applyKnightSeparation(step);

    const leftB = originX + structureDX;
    const right = originX + imgW * fitScale + structureDX;
    if (leftB < 6) { structureDX += 6 - leftB; structureDVX = Math.abs(structureDVX) * 0.4; }
    if (right > W - 6) { structureDX -= right - (W - 6); structureDVX = -Math.abs(structureDVX) * 0.4; }

    applyStructureOffset();
  }

  function updateDodgeAI(dt) {
    if (level().queenBoss) {
      if (l8Phase === 'hands' && structures.length && !l8Intro) {
        eachStructure(() => updateL8HandAI(dt));
      } else if (l8Phase === 'head') {
        syncL8HeadToQueen();
      } else if (l8Phase === 'torso') {
        syncL8TorsoToQueen();
      }
      return;
    }
    if (level().jump) {
      if (structures.length) eachStructure(() => updateJumpAI(dt));
      else updateJumpAI(dt);
      return;
    }
    const canMove = level().dodge || level().fly;
    if (!canMove || !launched || gameOver || won || outro) {
      structureDVX *= 0.9;
      structureDVY *= 0.9;
      structureAV *= 0.88;
      structureAngle *= 0.92;
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

      // Axis tilt: turn away from threat; spring to 0 when safe
      const step = dt * 60;
      if (threat > 0.05) {
        // Ball on left → lean right (positive angle = top leans right in screen space)
        const away = Math.sign(cx - predX) || (desired >= 0 ? 1 : -1);
        structureAV += away * (0.012 + threat * 0.02) * step;
      } else {
        structureAV += -structureAngle * 0.08 * step;
      }
      structureAV *= 0.88;
      const maxAV = 0.045;
      if (structureAV > maxAV) structureAV = maxAV;
      if (structureAV < -maxAV) structureAV = -maxAV;
      structureAngle += structureAV * step;
      // Soft clamp toward ±0.35; hard restoring beyond ±0.55
      const soft = 0.35;
      const hard = 0.55;
      if (structureAngle > soft) structureAV -= (structureAngle - soft) * 0.06 * step;
      if (structureAngle < -soft) structureAV -= (structureAngle + soft) * 0.06 * step;
      if (structureAngle > hard) {
        structureAV -= (structureAngle - hard) * 0.18 * step;
        structureAngle = hard + (structureAngle - hard) * 0.85;
      } else if (structureAngle < -hard) {
        structureAV -= (structureAngle + hard) * 0.18 * step;
        structureAngle = -hard + (structureAngle + hard) * 0.85;
      }
      if (structureAngle > soft * 1.15) structureAngle += (soft - structureAngle) * 0.08 * step;
      if (structureAngle < -soft * 1.15) structureAngle += (-soft - structureAngle) * 0.08 * step;
    } else {
      structureDVY *= 0.85;
      structureDY *= 0.9;
      structureAV *= 0.8;
      structureAngle *= 0.9;
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
    if (level().queenBoss && (l8Intro || l8Phase === 'intro')) {
      updateBg(dt);
      updateL8Intro(dt);
      updateL8Debris(dt);
      updatePlayerBomb(dt);
      // paddle still tracks
      if (pointerX != null && paddle) {
        paddle.x = pointerX - paddle.w / 2;
        paddle.x = Math.max(6, Math.min(W - paddle.w - 6, paddle.x));
      }
      if (ball && paddle) stickBallToPaddle();
      return;
    }
    if (level().queenBoss && l8Phase === 'hands') {
      updateL8HandSpawns();
    }
    if (l8Finale) {
      updateL8Finale(dt);
      updateHud();
      return;
    }
    if (level().queenBoss && l8Fade) {
      updateL8Fade(dt);
      // paddle track during fade
      if (pointerX != null && paddle) {
        paddle.x = pointerX - paddle.w / 2;
        paddle.x = Math.max(6, Math.min(W - paddle.w - 6, paddle.x));
      }
      if (ball && paddle) stickBallToPaddle();
      updateBg(dt * 0.4);
      return;
    }
    if (level().queenBoss && l8EyeFlashT > 0) {
      l8EyeFlashT = Math.max(0, l8EyeFlashT - dt);
    }
    if (level().queenBoss && (l8Phase === 'head' || l8Phase === 'torso')) {
      updateL8EyeLasers(dt);
    }
    if (level().queenBoss && l8Phase === 'torso' && !paused && !won && !gameOver) {
      // Drift lento al azar (lado a lado)
      l8TorsoDriftTimer -= dt;
      if (l8TorsoDriftTimer <= 0) {
        l8TorsoDriftTarget = (Math.random() * 2 - 1) * Math.min(56, W * 0.12);
        l8TorsoDriftTimer = 1.8 + Math.random() * 2.8;
      }
      l8TorsoDriftX += (l8TorsoDriftTarget - l8TorsoDriftX) * Math.min(1, dt * 0.55);

      if (l8TorsoStage === 'armor') {
        l8ExtraDust = [];
      } else {
        // Temblor suave (menos sacudida)
        l8TorsoQuakeT -= dt;
        if (l8TorsoQuakeT <= 0) {
          bumpCam(0.55 + Math.random() * 0.85);
          l8TorsoQuakeT = 0.45 + Math.random() * 0.7;
        }
        const dustBurst = Math.max(1, (dt * 10) | 0);
        for (let k = 0; k < dustBurst; k++) {
          if (Math.random() > 0.65) continue;
          l8ExtraDust.push({
            x: Math.random() * W,
            y: H * (0.08 + Math.random() * 0.85),
            r: 0.7 + Math.random() * 4.2,
            vx: (Math.random() - 0.5) * 1.6,
            vy: -0.15 - Math.random() * 1.1,
            a: 0.22 + Math.random() * 0.5,
            life: 0.9 + Math.random() * 1.8,
          });
        }
        for (let i = l8ExtraDust.length - 1; i >= 0; i--) {
          const p = l8ExtraDust[i];
          p.life -= dt;
          p.x += p.vx * dt * 60;
          p.y += p.vy * dt * 60;
          p.vy += 0.012 * dt * 60;
          p.a *= 0.991;
          if (p.life <= 0 || p.a < 0.02) l8ExtraDust.splice(i, 1);
        }
        if (l8ExtraDust.length > 260) l8ExtraDust.splice(0, l8ExtraDust.length - 260);
      }
    }
    if (l6Transit) {
      updateBg(dt);
      updateL6Transit(dt);
      // debris / particles keep simmering during whip-pan
      updateFalling(dt * 0.45);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        p.x += p.vx * dt * 60;
        p.y += p.vy * dt * 60;
        p.vy += (p.metal ? 0.04 : 0.12) * dt * 60;
        p.vx *= p.metal ? 0.96 : 0.98;
      }
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
    updateL6RookFormation(dt);
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
      if (level().queenBoss) updateL8Debris(dt);
      updatePlayerBomb(dt);
      stickBallToPaddle();
      updateBallAirTrail(dt);
      return;
    }
    if (gameOver || won) {
      updateBallAirTrail(dt);
      return;
    }

    if (!level().queenBoss) {
      bombTimer -= dt;
      if (bombTimer <= 0) {
        spawnBomb();
        const every = (l6Phase === 'chess') ? BOMB_EVERY * 0.5 : BOMB_EVERY;
        const jitter = (l6Phase === 'chess') ? 0.9 : 1.8;
        bombTimer = every + Math.random() * jitter;
      }
      updateBombs(dt);
      updatePlayerBomb(dt);
    } else {
      bombs = []; // no enemy bombs on L8
      updateL8Debris(dt);
      updatePlayerBomb(dt); // shop bombs must still fly/detonate
    }

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
        const sp = Math.max(ball.speed || 0, Math.hypot(ball.vx, ball.vy), 3.2);
        ball.vx = Math.cos(ang) * sp;
        ball.vy = Math.sin(ang) * sp;
        ball.speed = Math.max(ball.speed || 0, sp);
        ballLastAng = ang;
        ballStallT = 0;
        spawnMetalSparks(ball.x, paddle.y);
      }

      collideBricksWithBall();
      if (level().queenBoss) collideBallWithL8Debris();

      if (ball.y - ball.r > H + 4) {
        loseLife();
        return;
      }
    }

    // Safety: launched ball must never stay frozen (laser equip / pause glitches)
    const spdNow = Math.hypot(ball.vx, ball.vy);
    if (spdNow > 0.2) {
      ballLastAng = Math.atan2(ball.vy, ball.vx);
      ballStallT = 0;
      if (ball.speed < spdNow) ball.speed = spdNow;
    } else if (launched && !gameOver && !won && outro !== 'slowmo') {
      ballStallT += dt;
      if (ballStallT > 0.2) {
        const restore = Math.max(ball.speed || 0, 3.6) * levelBallSpeedMult();
        const ang = ballLastAng || -Math.PI / 2;
        ball.speed = restore;
        ball.vx = Math.cos(ang) * restore;
        ball.vy = Math.sin(ang) * restore;
        ballStallT = 0;
      }
    }
    updateBallAirTrail(dt);
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

  function updateBallAirTrail(dt) {
    for (let i = ballAirTrail.length - 1; i >= 0; i--) {
      const p = ballAirTrail[i];
      p.life -= dt;
      if (p.life <= 0) { ballAirTrail.splice(i, 1); continue; }
    }
    if (
      activeBallSkin === 'ballsilbadora' &&
      launched &&
      ball &&
      (Math.abs(ball.vx) > 0.01 || Math.abs(ball.vy) > 0.01)
    ) {
      const maxLife = 0.28 + Math.random() * 0.12; // ~0.25–0.4s
      ballAirTrail.push({
        x: ball.x + (Math.random() - 0.5) * 2,
        y: ball.y + (Math.random() - 0.5) * 2,
        life: maxLife,
        maxLife,
        r: ball.r * (0.55 + Math.random() * 0.4),
      });
      if (ballAirTrail.length > 48) ballAirTrail.splice(0, ballAirTrail.length - 48);
    }
  }

  function drawBallAirTrail() {
    if (!ballAirTrail.length) return;
    ctx.save();
    for (const p of ballAirTrail) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.r * 1.55, p.r * 0.75, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180, 235, 255, ${0.22 * a})`;
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.r * 0.85, p.r * 0.4, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${0.28 * a})`;
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBall() {
    const skinImg = activeBallSkinImg();
    if (activeBallSkin && skinImg) {
      const s = ball.r * 2.15;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 8;
      ctx.drawImage(skinImg, ball.x - s / 2, ball.y - s / 2, s, s);
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

  function playerBombHitsStructureBrick(b) {
    // Resto-armadura: NUNCA AABB del cuerpo entero (la falda llega a la paleta →
    // la bomba detonaba al nacer y congelaba con 7000 ladrillos).
    // Solo grid local (barato) + un pelín de radio extra.
    if (isL8ArmorRest()) {
      if (!b || (b.t != null && b.t < 0.12)) return false; // gracia al disparar
      if (paddle && b.y > paddle.y - 36) return false; // aún cerca de la paleta
      const ox = originX + structureDX;
      const oy = originY + structureDY;
      const cs = Math.max(1e-6, cellScreen || 8);
      const rad = (b.r || 8) * 1.35;
      const ix0 = Math.floor((b.x - rad - ox) / cs) - 1;
      const iy0 = Math.floor((b.y - rad - oy) / cs) - 1;
      const ix1 = Math.floor((b.x + rad - ox) / cs) + 1;
      const iy1 = Math.floor((b.y + rad - oy) / cs) + 1;
      const g = grid;
      if (!g) return false;
      for (let iy = iy0; iy <= iy1; iy++) {
        if (iy < 0 || iy >= rows) continue;
        for (let ix = ix0; ix <= ix1; ix++) {
          if (ix < 0 || ix >= cols) continue;
          const id = g[iy * cols + ix];
          if (id < 0) continue;
          const br = bricks[id];
          if (!br || !br.alive || br.falling || br.settled) continue;
          if (collideCircleAABB(b.x, b.y, rad, br)) return true;
        }
      }
      return false;
    }
    const tryHit = () => {
      if (level().panels) {
        for (let i = 0; i < bricks.length; i++) {
          const br = bricks[i];
          if (!br.alive || br.falling || br.settled) continue;
          if (br.layer === 'lower' && isLowerCoveredByUpper(br)) continue;
          if (collideCircleAABB(b.x, b.y, b.r, br)) return true;
        }
        return false;
      }
      let ox, oy, lx, ly;
      if (level().fly) {
        const g = ballToStructureGrid(b.x, b.y);
        ox = g.ox; oy = g.oy; lx = g.x; ly = g.y;
      } else {
        ox = originX + structureDX;
        oy = originY + structureDY;
        lx = b.x; ly = b.y;
      }
      const ix0 = Math.floor((lx - b.r - ox) / cellScreen) - 1;
      const iy0 = Math.floor((ly - b.r - oy) / cellScreen) - 1;
      const ix1 = Math.floor((lx + b.r - ox) / cellScreen) + 1;
      const iy1 = Math.floor((ly + b.r - oy) / cellScreen) + 1;
      const gridsToScan = (level().dualLayer && gridUpper && gridLower)
        ? [gridUpper, gridLower]
        : [grid];
      for (const scanGrid of gridsToScan) {
        for (let iy = iy0; iy <= iy1; iy++) {
          if (iy < 0 || iy >= rows) continue;
          for (let ix = ix0; ix <= ix1; ix++) {
            if (ix < 0 || ix >= cols) continue;
            const id = scanGrid[iy * cols + ix];
            if (id < 0) continue;
            const br = bricks[id];
            if (!br.alive || br.falling || br.settled) continue;
            if (br.layer === 'lower' && isLowerCoveredByUpper(br)) continue;
            if (collideCircleAABB(b.x, b.y, b.r, br)) return true;
          }
        }
      }
      return false;
    };
    if (!structures.length) return tryHit();
    let hit = false;
    eachStructure(() => {
      if (hit) return;
      if (tryHit()) hit = true;
    });
    return hit;
  }

  function updatePlayerBomb(dt) {
    if (!playerBomb || !playerBomb.alive) return;
    playerBomb.t += dt;
    playerBomb.x += playerBomb.vx * dt * 60;
    playerBomb.y += playerBomb.vy * dt * 60;
    // gravedad clara (antes 0.04 se sentía “colgada”)
    playerBomb.vy += 0.12 * dt * 60;

    if (playerBomb.x - playerBomb.r < 0) { playerBomb.x = playerBomb.r; playerBomb.vx = Math.abs(playerBomb.vx); }
    if (playerBomb.x + playerBomb.r > W) { playerBomb.x = W - playerBomb.r; playerBomb.vx = -Math.abs(playerBomb.vx); }
    if (playerBomb.y - playerBomb.r < 0) { playerBomb.y = playerBomb.r; playerBomb.vy = Math.abs(playerBomb.vy); }

    // Rebote en la paleta
    const b = playerBomb;
    if (
      paddle &&
      b.vy > 0 &&
      b.y + b.r >= paddle.y &&
      b.y - b.r <= paddle.y + paddle.h &&
      b.x >= paddle.x - 4 &&
      b.x <= paddle.x + paddle.w + 4
    ) {
      b.y = paddle.y - b.r - 0.5;
      const hit = (b.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
      const ang = -Math.PI / 2 + Math.max(-1, Math.min(1, hit)) * 0.95;
      const cur = Math.hypot(b.vx, b.vy) || (ball && ball.speed) || 4;
      const sp = cur * 1.05;
      b.vx = Math.cos(ang) * sp;
      b.vy = Math.sin(ang) * sp;
      spawnMetalSparks(b.x, paddle.y);
    }

    // Detonate on first alive structure brick hit (no fuse timer)
    if (playerBombHitsStructureBrick(b)) {
      b.phase = 'armed';
      const bx = b.x, by = b.y;
      const R = EXPLODE_R * 2.05;
      if (isL8ArmorRest()) {
        detonateArmorBombFast(bx, by, R * 1.05);
      } else if (level().queenBoss && l8Phase === 'torso') {
        // Pecho: bomba ligera (sin fling ni doble blast)
        bumpCam(3);
        spawnDust(bx, by, 'rgb(255,150,50)', 16);
        spawnDust(bx, by, 'rgb(70,65,60)', 12);
        explodeAt(bx, by, R, 1);
        if (particles.length > 220) particles.splice(0, particles.length - 220);
      } else {
        spawnShopBombBlast(bx, by);
        flingBricksFromBlast(bx, by, R);
        explodeAt(bx, by, R, 1);
        spawnShopBombBlast(bx, by - 8);
        bumpCam(6);
      }
      b.alive = false;
      playerBomb = null;
      return;
    }

    // Visual fuse only (never auto-detonates on timer)
    if (playerBomb.phase === 'fuse' && playerBomb.t >= 3) {
      playerBomb.phase = 'armed';
      playerBomb.t = 0;
      bumpCam(1.2);
    }
    // Leave screen → despawn without life penalty
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
    // Sombra elíptica bajo los pies; se mueve con structureDX
    let minX = Infinity, maxX = -Infinity, footBottom = 0, n = 0;
    for (const br of bricks) {
      if (!br.alive || br.falling || br.settled) continue;
      const bx = br.baseX != null ? br.baseX : br.x;
      minX = Math.min(minX, bx);
      maxX = Math.max(maxX, bx + br.w);
      footBottom = Math.max(footBottom, (br.baseY != null ? br.baseY : br.y) + br.h);
      n++;
    }
    if (!n) return;
    const cx = (minX + maxX) / 2 + structureDX;
    const flying = !!level().fly;
    const jumping = !!level().jump;
    if (flying) return;
    const lift = jumping ? Math.max(0, -structureDY) : 0;
    const soft = jumping ? Math.max(0.55, 1 - lift / 220) : 1;
    const rw = Math.max(36, (maxX - minX) * (jumping ? 0.55 : 0.42));
    const rh = Math.max(10, brickPx * (jumping ? 3.2 : 2.2)) * (lift > 2 ? 0.88 : 1);
    const floorY = Math.max(groundY, footBottom + structureDY);
    const sy = floorY + rh * 0.2 + (jumping ? Math.min(18, lift * 0.06) : 0);
    ctx.save();
    ctx.globalAlpha = soft;
    ctx.translate(cx, sy);
    ctx.scale(1, rh / rw);
    const g = ctx.createRadialGradient(0, 0, rw * 0.12, 0, 0, rw);
    g.addColorStop(0, jumping ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.45)');
    g.addColorStop(0.5, jumping ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.22)');
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
      if (br.panel && br.poly && br.poly.length >= 3) {
        const ox = br.x - br.baseX;
        const oy = br.y - br.baseY;
        ctx.beginPath();
        ctx.moveTo(br.poly[0].x + ox, br.poly[0].y + oy);
        for (let i = 1; i < br.poly.length; i++) {
          ctx.lineTo(br.poly[i].x + ox, br.poly[i].y + oy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = shade(br.color, 0.4);
        ctx.lineWidth = 1;
        ctx.stroke();
        continue;
      }
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
      ctx.fillStyle = level().queenBoss ? '#07060e' : '#1a0f08';
      ctx.fillRect(0, 0, W, H);
      return;
    }
    if (level().queenBoss) {
      const iw = bgImg.naturalWidth, ih = bgImg.naturalHeight;
      // Align cracked rooftop floor (groundFrac) with queen feet / groundY
      const groundFrac = level().groundFrac != null ? level().groundFrac : 0.82;
      const gy = (l8RooftopGroundY > 0)
        ? l8RooftopGroundY
        : (groundY > 0 ? groundY : H * 0.88);
      const needH = Math.max(H * 1.25, (gy + H * 0.35) / groundFrac);
      const scale = Math.max(W / iw, needH / ih) * 1.12;
      const dw = iw * scale, dh = ih * scale;
      const drift = Math.sin(bgT * 0.04) * Math.min(18, (dw - W) * 0.06);
      const dx = -(dw - W) * 0.5 + drift;
      // Keep rooftop plane under feet as camera pans (bg locked to groundY)
      const dy = gy - groundFrac * dh;
      ctx.drawImage(bgImg, dx, dy, dw, dh);
      const grd = ctx.createRadialGradient(W * 0.5, H * 0.22, 20, W * 0.5, H * 0.45, H * 0.8);
      grd.addColorStop(0, 'rgba(60,25,10,0.05)');
      grd.addColorStop(0.5, 'rgba(10,6,14,0.28)');
      grd.addColorStop(1, 'rgba(2,1,6,0.62)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H);
      for (const p of bgDust) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(220, 160, 90, ${p.a * 0.55})`;
        ctx.fill();
      }
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
    // L6 head-turn: ruined corridor wipes in from the right (looking right)
    if (l6CamFX && l6CamFX.nextImg && !l6CamFX.swapped) {
      const u = Math.min(1, l6CamFX.t / l6CamFX.dur);
      const e = l6EaseInOut(u);
      const wipe = Math.max(0, Math.min(1, (e - 0.18) / 0.52));
      if (wipe > 0) {
        ctx.save();
        const wipeX = W * (1 - wipe);
        ctx.beginPath();
        ctx.rect(wipeX - 2, -4, W - wipeX + 8, H + 8);
        ctx.clip();
        const slideIn = (1 - wipe) * W * 0.22;
        ctx.globalAlpha = Math.min(1, 0.35 + wipe * 0.65);
        ctx.drawImage(l6CamFX.nextImg, dx + slideIn, dy, dw, dh);
        ctx.restore();
        // Soft edge of the wipe
        if (wipe < 0.98) {
          const grd = ctx.createLinearGradient(wipeX - 40, 0, wipeX + 30, 0);
          grd.addColorStop(0, 'rgba(10,6,4,0)');
          grd.addColorStop(0.55, 'rgba(10,6,4,0.35)');
          grd.addColorStop(1, 'rgba(20,10,6,0.15)');
          ctx.fillStyle = grd;
          ctx.fillRect(wipeX - 40, 0, 70, H);
        }
      }
    }

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
    const cap = (level().queenBoss && l8Phase === 'torso') ? 10 : 18;
    camShake = Math.min(cap, camShake + amount * 1.3);
  }

  function drawOneBrickLayer(layerCanvas) {
    if (!layerCanvas) return;
    const flying = !!level().fly;
    if (flying && (structureDX || structureDY || structureAngle)) {
      const { cx0, cy0, cx, cy } = structureCenters();
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(structureAngle);
      ctx.translate(-cx0, -cy0);
      ctx.drawImage(layerCanvas, 0, 0, W, H);
      ctx.restore();
    } else if (structureDX || structureDY) {
      ctx.save();
      ctx.translate(structureDX, structureDY);
      ctx.drawImage(layerCanvas, 0, 0, W, H);
      ctx.restore();
    } else {
      ctx.drawImage(layerCanvas, 0, 0, W, H);
    }
  }

  function drawStructureLayer() {
    if (level().dualLayer && (brickLayerLower || brickLayerUpper)) {
      // Lower first, upper on top — same transform
      drawOneBrickLayer(brickLayerLower);
      drawOneBrickLayer(brickLayerUpper);
      return;
    }
    drawOneBrickLayer(brickLayer);
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // Cámara inquieta: temblor base + picos con impacto
    // Torso phase = earthquake (much stronger resting shake)
    const rest = paused
      ? 0.2
      : (level().queenBoss && l8Phase === 'torso' ? 1.15 : 0.72);
    const amp = rest + camShake;
    const t = performance.now() * 0.001;
    let ox = Math.sin(t * 17.3) * amp * 0.35 + Math.sin(t * 41.1) * amp * 0.18;
    let oy = Math.cos(t * 19.7) * amp * 0.28 + Math.sin(t * 33.5) * amp * 0.16;
    let rot = (Math.sin(t * 13.1) * amp) * 0.00055;
    let sx = 1, sy = 1;

    // L8 intro: slight zoom-in as we rise to the Queen's face
    if (level().queenBoss && (l8Intro || l8Phase === 'intro' || l8Phase === 'hands' || l8Phase === 'head' || l8Phase === 'torso')) {
      const z = 1 + (l8Intro ? l8CamY * 0.04 : (l8Phase === 'torso' ? 0.03 : 0.045));
      sx *= z; sy *= z;
      // Extra upward feel while rising (world slides down a touch)
      if (l8Intro) oy -= (1 - l8CamY) * 10;
    }

    // L6: head turn right — pan/yaw (no flip). Looking right → world slides left;
    // new view enters from the right. Soft FOV stretch then settle.
    if (l6CamFX) {
      const u = Math.min(1, l6CamFX.t / l6CamFX.dur);
      const e = l6EaseInOut(u);
      const peak = Math.sin(u * Math.PI); // 0 at ends, 1 mid-turn
      // Continuous pan left (no reverse whip)
      ox -= e * W * 0.42;
      oy += peak * 6 * Math.sin(u * Math.PI * 1.5);
      // Subtle roll only — not a pirate flip
      rot += peak * 0.035;
      // Fake rotateY / FOV: compress X at peak, slight zoom stretch then settle
      const fov = 1 + peak * 0.1 - e * 0.03;
      sx = (1 - peak * 0.14) * fov;
      sy = fov;
    }

    ctx.save();
    ctx.translate(W / 2 + ox, H / 2 + oy);
    ctx.scale(sx, sy);
    ctx.rotate(rot);
    ctx.translate(-W / 2, -H / 2);

    drawBackground();
    if (level().queenBoss && l8Phase === 'torso' && l8ExtraDust.length) {
      for (const p of l8ExtraDust) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(210, 175, 120, ${p.a * 0.7})`;
        ctx.fill();
      }
    }
    if (l8Finale) { drawL8Finale(); return; }
    if (level().queenBoss) drawL8Queen();
    if (!level().queenBoss) drawGround();
    if (!level().fly) {
      if (structures.length) eachStructure(() => drawMechShadow());
      else if (!level().queenBoss) drawMechShadow();
    }
    if (structures.length) eachStructure(() => drawStructureLayer());
    else if (!level().queenBoss) drawStructureLayer();
    if (structures.length) eachStructure(() => drawLooseBricks());
    else if (!level().queenBoss) drawLooseBricks();
    drawParticles();
    if (level().queenBoss) drawL8Debris();
    if (level().queenBoss) drawL8EyeLasers();
    drawBombs();
    drawLaserBeams();
    drawPaddle();
    drawBallAirTrail();
    drawBall();

    // Motion blur / smear streaks during peak head-turn
    if (l6CamFX) {
      const u = Math.min(1, l6CamFX.t / l6CamFX.dur);
      const peak = Math.sin(u * Math.PI);
      if (peak > 0.15) {
        ctx.save();
        ctx.fillStyle = `rgba(12,5,0,${0.14 * peak})`;
        ctx.fillRect(0, 0, W, H);
        const streaks = Math.floor(8 + peak * 14);
        for (let i = 0; i < streaks; i++) {
          const y = ((i * 97 + u * 800) % H);
          const h = 1 + (i % 3);
          const len = 50 + peak * 140 + (i % 5) * 18;
          const x = ((i * 53 + eSeed(u, i)) % (W + len)) - len * 0.3;
          ctx.fillStyle = `rgba(255,190,120,${0.06 + peak * 0.14})`;
          ctx.fillRect(x, y, len, h);
          ctx.fillStyle = `rgba(40,20,10,${0.05 + peak * 0.08})`;
          ctx.fillRect(x - 20, y + h, len * 0.7, 1);
        }
        ctx.fillStyle = `rgba(255,150,60,${0.06 * peak})`;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }
    }
    ctx.restore();
    // Fundido a negro (pantalla completa, sin shake)
    if (level().queenBoss && l8Fade) drawL8FadeBlack();


    // Screen-space damage overlays (flash / cracks / death glitch)
    if (level().queenBoss) drawL8EyeFlash();
    drawDamageOverlays();
  }

  function eSeed(u, i) {
    return ((Math.sin(u * 40 + i * 1.3) * 0.5 + 0.5) * W);
  }

  function frame(ts) {
    const dt = Math.min(0.033, (ts - lastTs) / 1000 || 0.016);
    lastTs = ts;
    update(dt);
    if (!paused) {
      camShake = Math.max(0, camShake - dt * 6.5);
      updateDamageFX(dt);
    }
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
    if (!launched && !gameOver && !won && !l6Transit && !(level().queenBoss && l8Intro)) launch();
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
    // Salir de estados que dejan la pantalla rara / trabada
    paused = false;
    outro = null;
    outroT = 0;
    window.__outroDust = false;
    l6Transit = false;
    l6CamFX = null;
    particles = [];
    bombs = [];
    playerBomb = null;
    try { closeAllMenus(); } catch (_) {}
    try { setPauseBtn(false); setShopBtn(false); setPackBtn(false); } catch (_) {}

    if (won && levelIndex >= LEVELS.length - 1) {
      levelIndex = 0;
      score = 0;
      persistScore();
      backpack = [];
      // KEEP activeBallSkin across full campaign restart
      loading.classList.remove('hide');
      loading.textContent = 'Cargando Nivel 1…';
      Promise.all([loadImage(), loadBg()]).then(() => { buildLevel(); loading.classList.add('hide'); });
      return;
    }
    // Reinicio de nivel: recargar imagen/fondo (importante en L6 tras peones/torres/caballos)
    const keepScore = score;
    loading.classList.remove('hide');
    loading.textContent = `Reiniciando ${level().name}…`;
    // Restaurar fondo L6 al original antes de loadBg
    if (LEVELS[5] && LEVELS[5].bgB) LEVELS[5].bg = 'bg-level6.jpg';
    Promise.all([loadImage(), loadBg()]).then(() => {
      buildLevel();
      score = keepScore;
      if (bootMoney != null) applyBootMoney(false);
      updateHud();
      loading.classList.add('hide');
    }).catch((err) => {
      console.error(err);
      loading.textContent = 'No pude reiniciar.';
    });
  });

  window.addEventListener('resize', () => {
    clearTimeout(window.__rz);
    window.__rz = setTimeout(() => { buildLevel(); applyBootMoney(false); }, 150);
  });

  function loadBg() {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        bgImg = img;
        const loads = [];
        if (level().bgB) {
          loads.push(loadBgSrc(level().bgB).then((b) => { bgImgB = b; }).catch(() => {}));
        } else {
          bgImgB = null;
        }
        if (level().bgC) {
          loads.push(loadBgSrc(level().bgC).then((c) => { bgImgC = c; }).catch(() => {}));
        } else {
          bgImgC = null;
        }
        if (level().queenBoss) {
          l8BgRooftopImg = img;
          loads.push(
            loadBgSrc('bg-level8-torso.jpg')
              .then((t) => { l8BgTorsoImg = t; })
              .catch(() => { l8BgTorsoImg = null; })
          );
        } else {
          l8BgRooftopImg = null;
          l8BgTorsoImg = null;
        }
        if (loads.length) Promise.all(loads).then(() => resolve());
        else resolve();
      };
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
    const load = (key, src) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => { ballSkinImgs[key] = img; resolve(); };
      img.onerror = () => { console.warn(src + ' missing'); resolve(); };
      img.src = src;
    });
    return Promise.all([
      load('ballskin', 'ball-skin.png'),
      load('ballsilbadora', 'ball-silbadora.png'),
    ]);
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
    if (gameOver || outro === 'slowmo' || l6Transit) return;
    paused = true;
    setOverlay(pauseOverlay, true);
    setOverlay(shopOverlay, false);
    setOverlay(packOverlay, false);
    // Asegurar que tienda/mochila sigan visibles en el menú de pausa
    const shopBtn = document.getElementById('btnShop');
    const packBtn = document.getElementById('btnPack');
    if (shopBtn) {
      shopBtn.style.display = '';
      shopBtn.style.visibility = 'visible';
      shopBtn.hidden = false;
    }
    if (packBtn) {
      packBtn.style.display = '';
      packBtn.style.visibility = 'visible';
      packBtn.hidden = false;
    }
    if (typeof setShopBtn === 'function') setShopBtn(false);
    if (typeof setPackBtn === 'function') setPackBtn(false);
    if (typeof setSaveBtn === 'function') setSaveBtn(false);
    if (typeof setLoadBtn === 'function') setLoadBtn(false);
  }
  function closeAllMenus() {
    paused = false;
    setOverlay(pauseOverlay, false);
    setOverlay(shopOverlay, false);
    setOverlay(packOverlay, false);
    if (typeof setPauseBtn === 'function') setPauseBtn(false);
    if (typeof setShopBtn === 'function') setShopBtn(false);
    if (typeof setPackBtn === 'function') setPackBtn(false);
    if (typeof setSaveBtn === 'function') setSaveBtn(false);
    if (typeof setLoadBtn === 'function') setLoadBtn(false);
    if (laserAwaitUnpause) beginLaserWarmup();
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
    const shopMoney = document.getElementById('shopMoney');
    if (shopMoney) shopMoney.textContent = '$' + (score >= 1000 ? score.toLocaleString('en-US') : String(score));
    const lvl = level().id;
    shopList.innerHTML = SHOP.filter((it) => {
      if (it.minLevel != null && lvl < it.minLevel) return false;
      // ball skins: hide if active or already in backpack
      if (it.ballPower != null && (activeBallSkin === it.id || backpack.includes(it.id))) return false;
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
    const packMoney = document.getElementById('packMoney');
    if (packMoney) packMoney.textContent = '$' + (score >= 1000 ? score.toLocaleString('en-US') : String(score));
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
      syncDamageFxFromLives();
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
      const keepL = !!launched;
      const kvx = ball ? ball.vx : 0, kvy = ball ? ball.vy : 0;
      const ksp = ball ? ball.speed : 0, kx = ball ? ball.x : 0, ky = ball ? ball.y : 0;
      startLaserCannons();
      closeAllMenus();
      setPauseBtn(false);
      setShopBtn(false);
      setPackBtn(false);
      beginLaserWarmup();
      if (ball && keepL) {
        launched = true;
        ball.x = kx; ball.y = ky;
        ball.vx = kvx; ball.vy = kvy;
        ball.speed = ksp;
        ballStallT = 0;
      } else if (ball && !keepL) {
        stickBallToPaddle();
      }
      hint.classList.add('show');
      hint.innerHTML = '<strong>🔫 Cañones láser</strong><span>10s de duración · ráfaga 1s · CD 7s</span>';
    } else if (id === 'ballskin' || id === 'ballsilbadora') {
      activeBallSkin = id;
      if (ball && baseBallR) ball.r = baseBallR * ballRadiusMult();
      hint.classList.add('show');
      if (id === 'ballsilbadora') {
        hint.innerHTML = '<strong>💨 La silbadora</strong><span>Skin activa · dureza +20% · rastro de aire</span>';
      } else {
        hint.innerHTML = '<strong>🪩 Bola grabada</strong><span>Skin activa · dureza +10%</span>';
      }
    }
    updateHud();
    renderPack();
    clearTimeout(window.__hintHide);
    window.__hintHide = setTimeout(() => {
      if (!gameOver) hint.classList.remove('show');
    }, 2000);
  }

  function burnLaserColumnOnCurrent(x) {
    const half = Math.max(brickPx * 1.0, 8);
    const tryBurn = (br) => {
      if (!br.alive || br.falling || br.settled) return;
      if (br.layer === 'lower' && isLowerCoveredByUpper(br)) return;
      if (br.y + br.h < 0 || br.y >= paddle.y) return;
      const cx = br.x + br.w / 2;
      if (Math.abs(cx - x) > half && (br.x > x + half || br.x + br.w < x - half)) return;
      if (Math.abs(cx - x) > half) return;
      spawnDust(cx, br.y + br.h / 2, 'rgb(120,220,255)', 4, { spread: 0.8, up: 1.2 });
      destroyBrick(br, 1);
    };
    if (level().panels) {
      for (let i = 0; i < bricks.length; i++) tryBurn(bricks[i]);
      return;
    }
    const ox = originX + structureDX;
    const ix0 = Math.max(0, Math.floor((x - half - ox) / cellScreen) - 1);
    const ix1 = Math.min(cols - 1, Math.floor((x + half - ox) / cellScreen) + 1);
    const gridsToScan = (level().dualLayer && gridUpper && gridLower)
      ? [gridUpper, gridLower]
      : [grid];
    const seen = new Set();
    for (const scanGrid of gridsToScan) {
      for (let iy = 0; iy < rows; iy++) {
        for (let ix = ix0; ix <= ix1; ix++) {
          const id = scanGrid[iy * cols + ix];
          if (id < 0 || seen.has(id)) continue;
          seen.add(id);
          tryBurn(bricks[id]);
        }
      }
    }
  }

  function burnLaserColumn(x) {
    if (structures.length) eachStructure(() => burnLaserColumnOnCurrent(x));
    else burnLaserColumnOnCurrent(x);
  }

  function updateLaserCannons(dt) {
    if (!laserCannonsActive || !paddle) return;
    if (gameOver || won) {
      clearLaserCannons();
      return;
    }
    if (laserExpireAt && performance.now() >= laserExpireAt) {
      clearLaserCannons();
      hint.classList.add('show');
      hint.innerHTML = '<strong>🔫 Láser agotado</strong><span>Duración de 10s terminada</span>';
      clearTimeout(window.__hintHide);
      window.__hintHide = setTimeout(() => { if (!gameOver) hint.classList.remove('show'); }, 1800);
      return;
    }
    if (laserAwaitUnpause || !laserPhase) {
      updateLaserCdUi();
      return;
    }
    if (laserPhase === 'warmup') {
      laserPhaseT -= dt;
      if (laserPhaseT <= 0) {
        laserPhase = 'fire';
        laserFireUntil = performance.now() + LASER_FIRE_S * 1000; // 1.0s exacto
        laserPhaseT = LASER_FIRE_S;
        for (const x of cannonXs()) {
          spawnDust(x, paddle.y - 20, 'rgb(120,220,255)', 12, {
            spread: 1.0, up: 3.2, long: true, big: true, hemisphere: true,
          });
        }
      }
    } else if (laserPhase === 'fire') {
      // Apagar al cumplir 1s de reloj (no se alarga con lag)
      if (performance.now() >= laserFireUntil) {
        laserPhase = 'cooldown';
        laserPhaseT = LASER_CD_S;
        updateLaserCdUi();
        return;
      }
      laserPhaseT = Math.max(0, (laserFireUntil - performance.now()) / 1000);
      if (!updateLaserCannons._acc) updateLaserCannons._acc = 0;
      updateLaserCannons._acc += dt;
      if (updateLaserCannons._acc >= 0.08) {
        updateLaserCannons._acc = 0;
        for (const x of cannonXs()) burnLaserColumn(x);
      }
    } else if (laserPhase === 'cooldown') {
      laserPhaseT -= dt;
      if (Math.random() < Math.min(1, dt * 8)) {
        for (const x of cannonXs()) {
          spawnCannonSmoke(x, paddle.y + paddle.h * 0.18);
        }
      }
      if (laserPhaseT <= 0) {
        laserPhase = 'fire';
        laserFireUntil = performance.now() + LASER_FIRE_S * 1000;
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


  const SAVE_KEY = 'mechBricksSave_v1';

  function showMenuHint(title, sub, ms) {
    hint.classList.add('show');
    hint.innerHTML = `<strong>${title}</strong><span>${sub || ''}</span>`;
    clearTimeout(window.__hintHide);
    window.__hintHide = setTimeout(() => {
      if (!gameOver) hint.classList.remove('show');
    }, ms || 1800);
  }

  function saveGameProgress() {
    try {
      const payload = {
        v: 1,
        levelIndex,
        score,
        lives,
        backpack: backpack.slice(),
        activeBallSkin,
        shieldCharges,
        laserCannonsActive: !!laserCannonsActive,
        laserExpireAt: laserCannonsActive ? (laserExpireAt || 0) : 0,
        crackIntensity,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      showMenuHint('Partida guardada', 'Progreso: nivel, dinero, vidas, mochila', 2200);
    } catch (err) {
      console.warn('save failed', err);
      showMenuHint('No se pudo guardar', 'Revisa el almacenamiento del navegador', 2000);
    }
  }

  async function loadGameProgress() {
    let data = null;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) {
        showMenuHint('No hay partida guardada', 'Progreso: nivel, dinero, vidas, mochila', 2200);
        return;
      }
      data = JSON.parse(raw);
    } catch (err) {
      console.warn('load parse failed', err);
      showMenuHint('No hay partida guardada', 'Archivo inválido', 2000);
      return;
    }
    if (!data || typeof data.levelIndex !== 'number') {
      showMenuHint('No hay partida guardada', 'Datos incompletos', 2000);
      return;
    }
    const li = Math.max(0, Math.min(LEVELS.length - 1, data.levelIndex | 0));
    window.__gotoNext = false;
    closeAllMenus();
    setPauseBtn(false);
    levelIndex = li;
    l8BootSkipToHead = false; // load = inicio de nivel (intro completo en L8)
    syncLevelUrl();
    loading.classList.remove('hide');
    loading.textContent = `Cargando ${level().name}…`;
    hint.classList.remove('show');
    try {
      await Promise.all([loadImage(), loadBg()]);
      buildLevel();
      // buildLevel resets lives — restore inventory/progress after
      score = Math.max(0, data.score | 0);
      lives = (typeof data.lives === 'number' && data.lives > 0) ? data.lives : START_LIVES;
      backpack = Array.isArray(data.backpack) ? data.backpack.slice(0, PACK_MAX) : [];
      activeBallSkin = data.activeBallSkin || null;
      shieldCharges = Math.max(0, data.shieldCharges | 0);
      if (typeof syncDamageFxFromLives === 'function') syncDamageFxFromLives();
      if (ball && baseBallR) ball.r = baseBallR * ballRadiusMult();
      if (data.laserCannonsActive && typeof startLaserCannons === 'function') {
        try {
          startLaserCannons();
          if (data.laserExpireAt && data.laserExpireAt > performance.now()) {
            laserExpireAt = data.laserExpireAt;
          }
        } catch (_) {}
      }
      updateHud();
      loading.classList.add('hide');
      showMenuHint('Partida cargada', `${level().name} · $` + score + ` · ♥` + lives, 2400);
    } catch (err) {
      loading.textContent = 'No pude cargar la partida.';
      console.error(err);
    }
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
  const btnSaveImg = document.getElementById('btnSaveImg');
  const btnLoadImg = document.getElementById('btnLoadImg');
  function setSaveBtn(on) {
    if (btnSaveImg) btnSaveImg.src = on ? 'btn-save-on.png' : 'btn-save.png';
  }
  function setLoadBtn(on) {
    if (btnLoadImg) btnLoadImg.src = on ? 'btn-load-on.png' : 'btn-load.png';
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
  const btnClosePause = document.getElementById('btnClosePause');
  if (btnClosePause) {
    btnClosePause.addEventListener('click', (e) => {
      e.stopPropagation(); closeAllMenus(); setPauseBtn(false); setShopBtn(false);
    });
  }
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

  const btnSave = document.getElementById('btnSave');
  if (btnSave) {
    btnSave.addEventListener('pointerdown', () => setSaveBtn(true));
    btnSave.addEventListener('pointerup', () => setSaveBtn(false));
    btnSave.addEventListener('pointerleave', () => setSaveBtn(false));
    btnSave.addEventListener('click', (e) => {
      e.stopPropagation();
      setSaveBtn(false);
      saveGameProgress();
    });
  }
  const btnLoad = document.getElementById('btnLoad');
  if (btnLoad) {
    btnLoad.addEventListener('pointerdown', () => setLoadBtn(true));
    btnLoad.addEventListener('pointerup', () => setLoadBtn(false));
    btnLoad.addEventListener('pointerleave', () => setLoadBtn(false));
    btnLoad.addEventListener('click', (e) => {
      e.stopPropagation();
      setLoadBtn(false);
      Promise.resolve(loadGameProgress()).catch((err) => console.warn('load', err));
    });
  }

  function firePlayerBomb() {
    if (!playerBombArmed || gameOver || won || outro || l6Transit) return false;
    // If a previous bomb is stuck/dead, clear it so the button works again
    if (playerBomb && (!playerBomb.alive || (Math.abs(playerBomb.vx) + Math.abs(playerBomb.vy) < 0.01 && playerBomb.t > 0.05))) {
      playerBomb = null;
    }
    if (playerBomb) return false;
    if (!ball && !paddle) return false;

    let x = ball ? ball.x : (paddle.x + paddle.w / 2);
    let y = ball ? ball.y : paddle.y;
    let vx = 0, vy = -4.2;
    if (launched && ball) {
      const sp = Math.hypot(ball.vx, ball.vy) || ball.speed || 4;
      if (sp > 0.35) {
        const ang = Math.atan2(ball.vy, ball.vx);
        const speed = Math.max(2.2, sp * 0.5);
        vx = Math.cos(ang) * speed;
        vy = Math.sin(ang) * speed;
        // Prefer upward-ish shot if ball is nearly horizontal toward paddle
        if (vy > -0.6) vy = Math.min(vy, -2.4);
      } else {
        vx = (Math.random() - 0.5) * 0.8;
        vy = -4.2;
        x = ball.x; y = ball.y;
      }
    } else if (paddle) {
      // Antes de servir: dispara hacia arriba desde la paleta
      x = paddle.x + paddle.w / 2;
      y = paddle.y - 10;
      vx = (Math.random() - 0.5) * 0.6;
      vy = -4.6;
    }

    playerBomb = {
      x, y, vx, vy,
      r: Math.max((ball && ball.r) ? ball.r * 1.15 : 8, 8),
      phase: 'fuse',
      t: 0,
      alive: true,
    };
    playerBombArmed = false;
    setBombButton(false);
    hint.classList.add('show');
    hint.innerHTML = '<strong>💣 Bomba en camino</strong><span>Explota al tocar un ladrillo</span>';
    clearTimeout(window.__hintHide);
    window.__hintHide = setTimeout(() => {
      if (!paused && !gameOver) hint.classList.remove('show');
    }, 1400);
    return true;
  }

  const btnBomb = document.getElementById('btnBomb');
  if (btnBomb) {
    const onBombPress = (e) => {
      e.stopPropagation();
      e.preventDefault();
      firePlayerBomb();
    };
    btnBomb.addEventListener('pointerdown', onBombPress);
    btnBomb.addEventListener('click', onBombPress);
  }

  (async function init() {
    try {
      await Promise.all([loadImage(), loadPaddle(), loadBg(), loadBombArts(), loadBallSkin()]);
      buildLevel();
      applyBootMoney(true);
      loading.classList.add('hide');
      requestAnimationFrame(frame);
    } catch (err) {
      loading.textContent = 'No pude cargar la imagen.';
      console.error(err);
    }
  })();
})();
