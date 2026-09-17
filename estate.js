/* Mecharoid — Terreno / estate mini-game (placeholder art) */
(() => {
  const STORAGE_KEY = 'mecharoidEstate_v1';
  const TW = 128;
  const TH = 64;
  const GRID = 12;

  const CATALOG = [
    { id: 'grass', name: 'Cesped', price: 0, w: 1, h: 1, placeable: false },
    { id: 'path_1x1', name: 'Camino', price: 80, w: 1, h: 1, color: '#8a7a5a', placeable: true },
    { id: 'plant_1x1', name: 'Planta', price: 120, w: 1, h: 1, color: '#3cb043', placeable: true },
    { id: 'chair_1x1', name: 'Silla', price: 200, w: 1, h: 1, color: '#c47a3a', placeable: true },
    { id: 'sofa_1x2', name: 'Sofa', price: 600, w: 1, h: 2, color: '#5b6ee1', placeable: true },
    { id: 'bed_2x2', name: 'Cama', price: 1200, w: 2, h: 2, color: '#d4a0c8', placeable: true },
    { id: 'car_2x3', name: 'Auto', price: 3500, w: 2, h: 3, color: '#e23b3b', placeable: true },
    { id: 'house_4x4', name: 'Casa', price: 8000, w: 4, h: 4, color: '#d9b56a', placeable: true },
  ];
  const CATALOG_BY_ID = Object.create(null);
  for (const it of CATALOG) CATALOG_BY_ID[it.id] = it;

  function defaultState() {
    return {
      owned: false,
      plotPrice: 5000,
      tiles: {},
      inventory: {},
      placements: [], // {id, i, j, itemId}
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const data = JSON.parse(raw);
      const base = defaultState();
      return {
        owned: !!data.owned,
        plotPrice: data.plotPrice != null ? (data.plotPrice | 0) : base.plotPrice,
        tiles: data.tiles && typeof data.tiles === 'object' ? data.tiles : {},
        inventory: data.inventory && typeof data.inventory === 'object' ? data.inventory : {},
        placements: Array.isArray(data.placements) ? data.placements : [],
      };
    } catch (_) {
      return defaultState();
    }
  }

  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  let state = loadState();
  let selectedItemId = 'path_1x1';
  let trashMode = false;
  let longPressTimer = null;
  let longPressCell = null;
  let hoverCell = null;
  let running = false;
  let raf = 0;

  const overlay = () => document.getElementById('estateOverlay');
  const moneyEl = () => document.getElementById('estateMoney');
  const canvas = () => document.getElementById('estateCanvas');
  const buyPanel = () => document.getElementById('estateBuyPanel');
  const tray = () => document.getElementById('estateTray');
  const statusEl = () => document.getElementById('estateStatus');

  function getScore() {
    if (typeof window.getMecharoidScore === 'function') return window.getMecharoidScore() | 0;
    if (typeof window.__mecharoidScore === 'number') return window.__mecharoidScore | 0;
    try {
      const s = localStorage.getItem('mechBricksScore_v1');
      return s != null ? (parseInt(s, 10) | 0) : 0;
    } catch (_) { return 0; }
  }

  function spendScore(amount) {
    amount = amount | 0;
    if (amount <= 0) return true;
    const cur = getScore();
    if (cur < amount) return false;
    if (typeof window.addMecharoidScore === 'function') {
      window.addMecharoidScore(-amount);
    } else if (typeof window.setMecharoidScore === 'function') {
      window.setMecharoidScore(cur - amount);
    } else {
      try {
        localStorage.setItem('mechBricksScore_v1', String(cur - amount));
      } catch (_) {}
    }
    return true;
  }

  function refundScore(amount) {
    amount = Math.max(0, amount | 0);
    if (!amount) return;
    if (typeof window.addMecharoidScore === 'function') window.addMecharoidScore(amount);
    else if (typeof window.setMecharoidScore === 'function') window.setMecharoidScore(getScore() + amount);
  }

  function fmtMoney(n) {
    n = n | 0;
    return '$' + (n >= 1000 ? n.toLocaleString('en-US') : String(n));
  }

  function updateMoneyHud() {
    const el = moneyEl();
    if (el) el.textContent = fmtMoney(getScore());
  }

  function setStatus(msg) {
    const el = statusEl();
    if (el) el.textContent = msg || '';
  }

  function tileKey(i, j) { return i + ',' + j; }

  function occupancyMap() {
    const occ = Object.create(null);
    for (const p of state.placements) {
      const item = CATALOG_BY_ID[p.itemId];
      if (!item) continue;
      for (let dj = 0; dj < item.h; dj++) {
        for (let di = 0; di < item.w; di++) {
          occ[tileKey(p.i + di, p.j + dj)] = p.id;
        }
      }
    }
    return occ;
  }

  function canPlace(item, i, j) {
    if (!item || !item.placeable) return false;
    if (i < 0 || j < 0 || i + item.w > GRID || j + item.h > GRID) return false;
    const occ = occupancyMap();
    for (let dj = 0; dj < item.h; dj++) {
      for (let di = 0; di < item.w; di++) {
        if (occ[tileKey(i + di, j + dj)]) return false;
      }
    }
    return true;
  }

  function placeItem(itemId, i, j) {
    const item = CATALOG_BY_ID[itemId];
    if (!canPlace(item, i, j)) {
      setStatus('No cabe ahi');
      return false;
    }
    if (!spendScore(item.price)) {
      setStatus('Fondos insuficientes');
      return false;
    }
    const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    state.placements.push({ id, i, j, itemId });
    // footprint keys (optional mirror)
    for (let dj = 0; dj < item.h; dj++) {
      for (let di = 0; di < item.w; di++) {
        state.tiles[tileKey(i + di, j + dj)] = itemId;
      }
    }
    saveState();
    updateMoneyHud();
    setStatus('Colocado: ' + item.name);
    return true;
  }

  function removePlacementAt(i, j) {
    const occ = occupancyMap();
    const pid = occ[tileKey(i, j)];
    if (!pid) {
      setStatus('Nada que quitar');
      return false;
    }
    const idx = state.placements.findIndex((p) => p.id === pid);
    if (idx < 0) return false;
    const p = state.placements[idx];
    const item = CATALOG_BY_ID[p.itemId];
    state.placements.splice(idx, 1);
    // clear tiles for this footprint
    if (item) {
      for (let dj = 0; dj < item.h; dj++) {
        for (let di = 0; di < item.w; di++) {
          delete state.tiles[tileKey(p.i + di, p.j + dj)];
        }
      }
      const refund = Math.floor((item.price | 0) * 0.5);
      refundScore(refund);
      setStatus('Quitado · reembolso ' + fmtMoney(refund));
    }
    saveState();
    updateMoneyHud();
    return true;
  }

  function buyPlot() {
    if (state.owned) return;
    const price = state.plotPrice | 0;
    if (!spendScore(price)) {
      setStatus('Necesitas ' + fmtMoney(price));
      return;
    }
    state.owned = true;
    state.tiles = {};
    state.placements = [];
    saveState();
    updateMoneyHud();
    syncPanels();
    setStatus('¡Terreno comprado!');
  }

  function syncPanels() {
    const buy = buyPanel();
    const tr = tray();
    if (buy) buy.style.display = state.owned ? 'none' : 'flex';
    if (tr) tr.style.display = state.owned ? 'flex' : 'none';
    const priceBtn = document.getElementById('estateBuyBtn');
    if (priceBtn) priceBtn.textContent = 'Comprar terreno ' + fmtMoney(state.plotPrice);
    renderTray();
  }

  function renderTray() {
    const tr = tray();
    if (!tr) return;
    const items = CATALOG.filter((c) => c.placeable);
    tr.innerHTML = '';
    const trashBtn = document.createElement('button');
    trashBtn.type = 'button';
    trashBtn.className = 'estate-tray-item' + (trashMode ? ' active trash' : ' trash');
    trashBtn.innerHTML = '<span class="swatch" style="background:#444"></span><span>Quitar<br/><small>50%</small></span>';
    trashBtn.addEventListener('click', () => {
      trashMode = !trashMode;
      if (trashMode) selectedItemId = null;
      renderTray();
      setStatus(trashMode ? 'Modo quitar: toca un objeto' : '');
    });
    tr.appendChild(trashBtn);

    for (const it of items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'estate-tray-item' + (!trashMode && selectedItemId === it.id ? ' active' : '');
      btn.innerHTML =
        '<span class="swatch" style="background:' + it.color + '"></span>' +
        '<span>' + it.name + '<br/><small>' + fmtMoney(it.price) + ' · ' + it.w + '×' + it.h + '</small></span>';
      btn.addEventListener('click', () => {
        trashMode = false;
        selectedItemId = it.id;
        renderTray();
        setStatus('Seleccionado: ' + it.name);
      });
      tr.appendChild(btn);
    }
  }

  function layoutMetrics(c) {
    const w = c.width;
    const h = c.height;
    const scale = Math.min(1, Math.min(w, h) < 700 ? 0.55 : 0.72);
    const tw = TW * scale;
    const th = TH * scale;
    const gridW = (GRID + GRID) * (tw / 2);
    const gridH = (GRID + GRID) * (th / 2);
    const originX = w * 0.5;
    const originY = Math.max(24, (h - gridH) * 0.28);
    return { tw, th, originX, originY, scale };
  }

  function isoToScreen(i, j, m) {
    return {
      x: m.originX + (i - j) * (m.tw / 2),
      y: m.originY + (i + j) * (m.th / 2),
    };
  }

  function screenToIso(sx, sy, m) {
    const x = sx - m.originX;
    const y = sy - m.originY;
    const a = m.tw / 2;
    const b = m.th / 2;
    const i = (y / b + x / a) / 2;
    const j = (y / b - x / a) / 2;
    return { i: Math.floor(i + 1e-6), j: Math.floor(j + 1e-6) };
  }

  function drawDiamond(ctx, x, y, tw, th, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + tw / 2, y + th / 2);
    ctx.lineTo(x, y + th);
    ctx.lineTo(x - tw / 2, y + th / 2);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function drawPlaceholder(ctx, item, i, j, m) {
    const base = isoToScreen(i, j, m);
    if (item.id === 'house_4x4') {
      // stacked diamonds
      for (let layer = 0; layer < 3; layer++) {
        const s = isoToScreen(i + 1.2, j + 1.2, m);
        drawDiamond(
          ctx,
          s.x,
          s.y - layer * m.th * 0.55,
          m.tw * (2.2 - layer * 0.25),
          m.th * (2.0 - layer * 0.2),
          layer === 2 ? '#f0d090' : item.color,
          'rgba(0,0,0,.35)'
        );
      }
      return;
    }
    if (item.id === 'car_2x3') {
      const s = isoToScreen(i + 0.5, j + 1, m);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.fillStyle = item.color;
      ctx.strokeStyle = 'rgba(0,0,0,.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, 0, m.tw * 0.85, m.th * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(-m.tw * 0.35, m.th * 0.15, m.th * 0.18, 0, Math.PI * 2);
      ctx.arc(m.tw * 0.35, m.th * 0.15, m.th * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    // furniture / path / plant: footprint diamonds + raised block
    for (let dj = 0; dj < item.h; dj++) {
      for (let di = 0; di < item.w; di++) {
        const s = isoToScreen(i + di, j + dj, m);
        drawDiamond(ctx, s.x, s.y - 2, m.tw * 0.92, m.th * 0.92, item.color, 'rgba(0,0,0,.3)');
      }
    }
    const mid = isoToScreen(i + (item.w - 1) * 0.5, j + (item.h - 1) * 0.5, m);
    const bh = Math.max(6, m.th * 0.35 * Math.max(item.w, item.h));
    ctx.fillStyle = item.color;
    ctx.globalAlpha = 0.92;
    ctx.fillRect(mid.x - m.tw * 0.22 * item.w, mid.y - bh, m.tw * 0.44 * item.w, bh);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.font = Math.max(9, 10 * m.scale) + 'px system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(item.name, mid.x, mid.y - bh - 4);
  }

  function resizeCanvas() {
    const c = canvas();
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = c.getBoundingClientRect();
    const cssW = Math.max(1, rect.width | 0);
    const cssH = Math.max(1, rect.height | 0);
    c.width = Math.floor(cssW * dpr);
    c.height = Math.floor(cssH * dpr);
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.__cssW = cssW;
    c.__cssH = cssH;
  }

  function draw() {
    const c = canvas();
    if (!c) return;
    const ctx = c.getContext('2d');
    const w = c.__cssW || c.clientWidth;
    const h = c.__cssH || c.clientHeight;
    ctx.clearRect(0, 0, w, h);

    // sky / ground backdrop
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1a2433');
    g.addColorStop(0.55, '#243448');
    g.addColorStop(1, '#1c3020');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    if (!state.owned) {
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.fillRect(0, 0, w, h);
      return;
    }

    const m = layoutMetrics({ width: w, height: h });
    // grass tiles sorted by i+j
    const cells = [];
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) cells.push({ i, j, z: i + j });
    }
    cells.sort((a, b) => a.z - b.z || a.i - b.i);

    for (const cell of cells) {
      const s = isoToScreen(cell.i, cell.j, m);
      const shade = ((cell.i + cell.j) & 1) ? '#3d8f4a' : '#45a055';
      drawDiamond(ctx, s.x, s.y, m.tw, m.th, shade, 'rgba(0,0,0,.22)');
    }

    // hover / ghost
    if (hoverCell && !trashMode && selectedItemId) {
      const item = CATALOG_BY_ID[selectedItemId];
      if (item) {
        const ok = canPlace(item, hoverCell.i, hoverCell.j);
        ctx.globalAlpha = 0.45;
        for (let dj = 0; dj < item.h; dj++) {
          for (let di = 0; di < item.w; di++) {
            const s = isoToScreen(hoverCell.i + di, hoverCell.j + dj, m);
            drawDiamond(ctx, s.x, s.y, m.tw, m.th, ok ? '#ffe566' : '#ff5555', null);
          }
        }
        ctx.globalAlpha = 1;
      }
    } else if (hoverCell && trashMode) {
      const s = isoToScreen(hoverCell.i, hoverCell.j, m);
      ctx.globalAlpha = 0.4;
      drawDiamond(ctx, s.x, s.y, m.tw, m.th, '#ff8844', null);
      ctx.globalAlpha = 1;
    }

    // placements sorted
    const sorted = state.placements.slice().sort((a, b) => {
      const za = a.i + a.j;
      const zb = b.i + b.j;
      return za - zb || a.i - b.i;
    });
    for (const p of sorted) {
      const item = CATALOG_BY_ID[p.itemId];
      if (!item) continue;
      drawPlaceholder(ctx, item, p.i, p.j, m);
    }
  }

  function loop() {
    if (!running) return;
    draw();
    raf = requestAnimationFrame(loop);
  }

  function pointerToCell(ev) {
    const c = canvas();
    if (!c || !state.owned) return null;
    const rect = c.getBoundingClientRect();
    const sx = (ev.clientX - rect.left);
    const sy = (ev.clientY - rect.top);
    const m = layoutMetrics({ width: rect.width, height: rect.height });
    const iso = screenToIso(sx, sy, m);
    if (iso.i < 0 || iso.j < 0 || iso.i >= GRID || iso.j >= GRID) return null;
    return iso;
  }

  let longPressFired = false;

  function onPointerDown(ev) {
    if (!state.owned) return;
    const cell = pointerToCell(ev);
    if (!cell) return;
    hoverCell = cell;
    longPressCell = cell;
    longPressFired = false;
    clearTimeout(longPressTimer);
    longPressTimer = setTimeout(() => {
      if (longPressCell) {
        longPressFired = true;
        removePlacementAt(longPressCell.i, longPressCell.j);
        longPressCell = null;
      }
    }, 650);
  }

  function onPointerMove(ev) {
    const cell = pointerToCell(ev);
    hoverCell = cell;
  }

  function onPointerUp(ev) {
    clearTimeout(longPressTimer);
    const cell = pointerToCell(ev) || longPressCell;
    longPressCell = null;
    if (longPressFired) { longPressFired = false; return; }
    if (!cell || !state.owned) return;
    if (trashMode) {
      removePlacementAt(cell.i, cell.j);
      return;
    }
    if (selectedItemId) placeItem(selectedItemId, cell.i, cell.j);
  }

  function onPointerCancel() {
    clearTimeout(longPressTimer);
    longPressCell = null;
    longPressFired = false;
  }

  function openEstate() {
    const el = overlay();
    if (!el) return;
    state = loadState();
    el.classList.add('show');
    el.setAttribute('aria-hidden', 'false');
    document.body.classList.add('estate-active');
    if (typeof window.__mecharoidHideTitle === 'function') window.__mecharoidHideTitle();
    if (typeof window.__mecharoidSetPaused === 'function') window.__mecharoidSetPaused(true);
    updateMoneyHud();
    syncPanels();
    resizeCanvas();
    running = true;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
    setStatus(state.owned ? 'Toca una celda para colocar' : 'Compra tu terreno');
  }

  function closeEstate() {
    const el = overlay();
    if (el) {
      el.classList.remove('show');
      el.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('estate-active');
    running = false;
    cancelAnimationFrame(raf);
    if (typeof window.__mecharoidSetPaused === 'function') window.__mecharoidSetPaused(false);
    if (typeof window.__mecharoidShowTitle === 'function') window.__mecharoidShowTitle();
  }

  function wire() {
    const el = overlay();
    if (!el || el.__wired) return;
    el.__wired = true;
    const back = document.getElementById('estateBack');
    if (back) back.addEventListener('click', (e) => { e.preventDefault(); closeEstate(); });
    const buyBtn = document.getElementById('estateBuyBtn');
    if (buyBtn) buyBtn.addEventListener('click', (e) => { e.preventDefault(); buyPlot(); });
    const c = canvas();
    if (c) {
      c.addEventListener('pointerdown', onPointerDown);
      c.addEventListener('pointermove', onPointerMove);
      c.addEventListener('pointerup', onPointerUp);
      c.addEventListener('pointercancel', onPointerCancel);
      c.addEventListener('pointerleave', () => { hoverCell = null; });
    }
    window.addEventListener('resize', () => {
      if (!running) return;
      resizeCanvas();
    });
  }

  window.openMecharoidEstate = openEstate;
  window.closeMecharoidEstate = closeEstate;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
