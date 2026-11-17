// Halftone dots: a photo by default, each line of the list turns them into its number.
// To swap the photo, replace img/portrait.jpg and adjust `crop` (x, y, width, height as fractions).
(() => {
  'use strict';
  const TAU = Math.PI * 2;
  const stage = document.getElementById('stage');
  const cv = document.getElementById('dots');
  const ctx = cv.getContext('2d');
  const cap = document.getElementById('cap');
  const list = document.getElementById('list');
  const rows = [...list.querySelectorAll('li[data-shape]')];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canHover = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const wide = matchMedia('(min-width: 900px)');

  const SHAPES = {
    // crop = [x, y, width, height] as fractions of the photo; levels = [darkest, brightest that still gets a dot]
    me:    { kind: 'photo', src: 'img/portrait-2.jpg', crop: [0.22, 0.17, 0.66, 0.64], levels: [0.04, 0.72], gamma: 1.3, cut: [0.5, 0.55], cutSoft: 0.38, color: '#16140f',
             cap: canHover ? 'Hover a line · click anywhere' : 'Tap a line' },
    frc:   { kind: 'text', lines: ['1st'], color: '#d9361c', cap: 'Greek team in FRC · Creativity Award 2025' },
    video: { kind: 'text', lines: ['8.4M'], color: '#2440c8', cap: 'Recorded views · Aug to Nov 2026' },
    study: { kind: 'text', lines: ['50'], color: '#5b3fd4', cap: 'Sign-ups in 12 days · Oct 2026' },
    run:   { kind: 'route', color: '#1d7a4a', cap: 'GPS art, planned on real streets' },
    foni:  { kind: 'text', lines: ['0.5s'], color: '#0e7490', cap: 'From letting go of the key to typed text' },
    ugc:   { kind: 'text', lines: ['500K+'], color: '#b4552d', cap: 'Views in under 30 days' },
    first: { kind: 'text', lines: ['FLL FTC', 'FGC FRC'], color: '#16140f', cap: 'All four FIRST programs · 2022 to 2026' },
  };
  const ORDER = ['me', 'ugc', 'video', 'study', 'frc', 'run', 'foni', 'first'];

  /* ---------- geometry ---------- */
  let W = 0, H = 0, region = null, s = 6, cols = 0, rowsN = 0, maxR = 3;

  function measure() {
    const r = stage.getBoundingClientRect();
    W = r.width; H = r.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (wide.matches) {
      const x = list.getBoundingClientRect().right + Math.max(40, W * 0.04);
      region = { x, y: H * 0.07, w: Math.max(240, W - x - Math.max(28, W * 0.04)), h: H * 0.8 };
    } else {
      region = { x: 16, y: 10, w: Math.max(200, W - 32), h: Math.max(200, H - 40) };
    }
    s = Math.max(4.2, Math.sqrt((region.w * region.h) / 9000));
    cols = Math.max(8, Math.floor(region.w / s));
    rowsN = Math.max(8, Math.floor(region.h / (s * 0.866)));
    maxR = s * 0.58;
  }

  /* ---------- rasterising a shape into dots ---------- */
  function canvasOf(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    return c;
  }
  function smooth(g) { g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; return g; }
  function downsample(src, w, h) {
    let cur = src;
    while (cur.width / 2 >= w && cur.height / 2 >= h) {
      const next = canvasOf(cur.width / 2, cur.height / 2);
      smooth(next.getContext('2d')).drawImage(cur, 0, 0, next.width, next.height);
      cur = next;
    }
    const out = canvasOf(w, h);
    const g = smooth(out.getContext('2d', { willReadFrequently: true }));
    g.drawImage(cur, 0, 0, w, h);
    return g.getImageData(0, 0, w, h).data;
  }

  function drawPhoto(a, aw, ah, sh) {
    const im = sh.img, [fx, fy, fw, fh] = sh.crop;
    const sx = fx * im.naturalWidth, sy = fy * im.naturalHeight;
    const sw = fw * im.naturalWidth, shh = fh * im.naturalHeight;
    const k = Math.min(aw / sw, ah / shh), dw = sw * k, dh = shh * k;
    sh.rect = { x: (aw - dw) / 2, y: (ah - dh) / 2, w: dw, h: dh };
    a.drawImage(im, sx, sy, sw, shh, sh.rect.x, sh.rect.y, dw, dh);
  }

  function drawText(a, aw, ah, lines) {
    const font = px => `800 ${px}px "Bricolage Grotesque", "Arial Black", sans-serif`;
    a.fillStyle = '#000'; a.textAlign = 'center'; a.textBaseline = 'alphabetic';
    if ('letterSpacing' in a) a.letterSpacing = '0.01em';
    let px = 200; a.font = font(px);
    const capH = a.measureText('H').actualBoundingBoxAscent || px * 0.7;
    const widest = Math.max(...lines.map(l => a.measureText(l).width));
    const n = lines.length, gapR = 0.32;
    const blockH = capH * (n + gapR * (n - 1));
    const k = Math.min((aw * 0.96) / widest, (ah * (n > 1 ? 0.84 : 0.6)) / blockH);
    px *= k; a.font = font(px);
    const ch = capH * k, gap = ch * gapR, total = ch * n + gap * (n - 1);
    let y = (ah - total) / 2 + ch;
    for (const l of lines) { a.fillText(l, aw / 2, y); y += ch + gap; }
  }

  function drawRoute(a, aw, ah) {
    // faint streets inside a round patch of map, then a heart run on top
    a.save();
    a.beginPath(); a.ellipse(aw / 2, ah / 2, aw * 0.47, ah * 0.47, 0, 0, TAU); a.clip();
    a.translate(aw / 2, ah / 2); a.rotate(-0.2);
    const m = Math.min(aw, ah), g = m / 8.5, ext = Math.hypot(aw, ah);
    a.strokeStyle = 'rgba(0,0,0,0.3)'; a.lineWidth = Math.max(1, s * 0.8);
    a.beginPath();
    for (let x = -ext; x <= ext; x += g) { a.moveTo(x, -ext); a.lineTo(x, ext); }
    for (let y = -ext; y <= ext; y += g * 0.78) { a.moveTo(-ext, y); a.lineTo(ext, y); }
    a.stroke();
    a.restore();
    const k = Math.min((aw * 0.8) / 32, (ah * 0.8) / 29);
    const pt = t => [aw / 2 + 16 * Math.sin(t) ** 3 * k,
      ah / 2 - (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t) + 2.5) * k];
    a.strokeStyle = '#000'; a.lineWidth = s * 1.9; a.lineJoin = 'round'; a.lineCap = 'round';
    a.beginPath();
    for (let i = 0; i <= 28; i++) { const [x, y] = pt((TAU * i) / 28); i ? a.lineTo(x, y) : a.moveTo(x, y); }
    a.stroke();
    const [sx, sy] = pt(0);
    a.fillStyle = '#000'; a.beginPath(); a.arc(sx, sy, s * 2.3, 0, TAU); a.fill();
  }

  function rasterize(sh) {
    const A = canvasOf(region.w, region.h);
    const a = A.getContext('2d');
    a.fillStyle = '#fff'; a.fillRect(0, 0, A.width, A.height);
    if (sh.kind === 'photo') drawPhoto(a, A.width, A.height, sh);
    else if (sh.kind === 'route') drawRoute(a, A.width, A.height);
    else drawText(a, A.width, A.height, sh.lines);
    const d = downsample(A, cols, rowsN);
    const pts = [];
    let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
    const [lo, hi] = sh.levels || [0, 1], gamma = sh.gamma || 1;
    const photo = sh.kind === 'photo' && sh.rect;
    const fade = photo ? (sh.fade || 0) : 0;
    const cut = photo ? sh.cut : null;
    for (let r = 0; r < rowsN; r++) {
      for (let c = 0; c < cols; c++) {
        const i = (r * cols + c) * 4;
        const lum = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
        let t = (hi - lum) / (hi - lo);
        if (t <= 0.05) continue;
        if (t > 1) t = 1;
        if (gamma !== 1) t = Math.pow(t, gamma);
        if (fade || cut) {
          const u = (((c + 0.5) / cols) * A.width - sh.rect.x) / sh.rect.w;
          const v = (((r + 0.5) / rowsN) * A.height - sh.rect.y) / sh.rect.h;
          if (cut) { // the top-left corner dissolves: dots shrink to nothing across a wide, slightly uneven band
            const soft = sh.cutSoft || 0.3;
            const n = Math.sin(c * 12.9898 + r * 78.233) * 43758.5453;
            const s = u / cut[0] + v / cut[1] + ((n - Math.floor(n)) - 0.5) * soft * 0.5;
            const g = (s - (1 - soft)) / (2 * soft);
            if (g <= 0) continue;
            if (g < 1) t *= g * g * (3 - 2 * g);
          }
          if (fade) { // soften the photo's rectangular edge
            const e = Math.min(u, 1 - u, v, 1 - v) / fade;
            if (e <= 0) continue;
            if (e < 1) t *= e * e * (3 - 2 * e);
          }
        }
        const rad = maxR * Math.sqrt(t);
        if (rad < 0.5) continue;
        const x = region.x + (c + 0.5 + (r & 1 ? 0.5 : 0)) * s;
        const y = region.y + (r + 0.5) * s * 0.866;
        pts.push(x, y, rad);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    if (!pts.length) pts.push(region.x + region.w / 2, region.y + region.h / 2, 0);
    sh.pts = Float32Array.from(pts);
    sh.count = pts.length / 3;
    sh.box = { minX, maxX, maxY };
  }

  /* ---------- particles ---------- */
  let N = 0, X, Y, VX, VY, R, TX, TY, TR, K;
  function alloc(n) {
    const o = { N, X, Y, VX, VY, R };
    X = new Float32Array(n); Y = new Float32Array(n); VX = new Float32Array(n); VY = new Float32Array(n);
    R = new Float32Array(n); TX = new Float32Array(n); TY = new Float32Array(n); TR = new Float32Array(n); K = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      if (i < o.N) { X[i] = o.X[i]; Y[i] = o.Y[i]; VX[i] = o.VX[i]; VY[i] = o.VY[i]; R[i] = o.R[i]; }
      else { X[i] = Math.random() * W; Y[i] = Math.random() * H; R[i] = 0; }
      K[i] = 0.02 + Math.random() * 0.032;
    }
    N = n;
  }

  function setTargets(sh) {
    const P = sh.pts, cnt = sh.count;
    const idx = new Uint32Array(N);
    for (let i = 0; i < N; i++) idx[i] = i;
    for (let i = N - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
    for (let i = 0; i < N; i++) {
      const j = idx[i];
      const q = j < cnt ? j : j % cnt;
      TX[i] = P[q * 3]; TY[i] = P[q * 3 + 1]; TR[i] = j < cnt ? P[q * 3 + 2] : 0;
    }
    if (reduce) for (let i = 0; i < N; i++) { X[i] = TX[i]; Y[i] = TY[i]; R[i] = TR[i]; VX[i] = VY[i] = 0; }
  }

  /* ---------- drawing ---------- */
  const rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  let colFrom = rgb('#16140f'), colTo = colFrom, colNow = colFrom, colT0 = 0;
  let px = -1e4, py = -1e4, pvx = 0, pvy = 0, pActive = false, lastMove = 0;
  let raf = 0, visible = true;

  function schedule() { if (!raf && visible && N) raf = requestAnimationFrame(frame); }

  function frame(now) {
    raf = 0;
    const PR = Math.max(70, Math.min(160, s * 17)), PR2 = PR * PR;
    const ct = Math.min(1, (now - colT0) / 500), e = ct * ct * (3 - 2 * ct);
    colNow = colFrom.map((v, i) => Math.round(v + (colTo[i] - v) * e));
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = `rgb(${colNow[0]},${colNow[1]},${colNow[2]})`;
    ctx.beginPath();
    const act = pActive && !reduce;
    let energy = 0;
    for (let i = 0; i < N; i++) {
      let x = X[i], y = Y[i], vx = VX[i], vy = VY[i];
      const k = K[i];
      vx += (TX[i] - x) * k; vy += (TY[i] - y) * k;
      let grow = 1;
      if (act) {
        const dx = x - px, dy = y - py, d2 = dx * dx + dy * dy;
        if (d2 < PR2) {
          const d = Math.sqrt(d2) + 0.001, f = 1 - d / PR, f2 = f * f;
          vx += (dx / d) * f2 * 2.6 + pvx * f * 0.1;
          vy += (dy / d) * f2 * 2.6 + pvy * f * 0.1;
          grow = 1 + f * 0.9;
        }
      }
      vx *= 0.86; vy *= 0.86;
      x += vx; y += vy;
      const r = R[i] + (TR[i] - R[i]) * 0.1;
      X[i] = x; Y[i] = y; VX[i] = vx; VY[i] = vy; R[i] = r;
      energy += Math.abs(vx) + Math.abs(vy) + Math.abs(TR[i] - r);
      const rr = r * grow;
      if (rr > 0.35) { ctx.moveTo(x + rr, y); ctx.arc(x, y, rr, 0, TAU); }
    }
    ctx.fill();
    pvx *= 0.85; pvy *= 0.85;
    const moving = act && now - lastMove < 900;
    if (moving || ct < 1 || energy / N > 0.004) schedule();
  }

  /* ---------- states ---------- */
  let current = '';
  function placeCap(sh) {
    cap.textContent = sh.cap;
    cap.style.color = sh.color === '#16140f' ? '' : sh.color;
    const w = cap.offsetWidth;
    const left = Math.max(region.x, Math.min(sh.box.minX - maxR, W - w - 16));
    const top = Math.min(H - 22, sh.box.maxY + maxR + (wide.matches ? 18 : 10));
    cap.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }
  function show(key, force) {
    const sh = SHAPES[key];
    if (!sh || !sh.pts || (key === current && !force)) return;
    current = key;
    setTargets(sh);
    colFrom = colNow; colTo = rgb(sh.color); colT0 = performance.now();
    placeCap(sh);
    for (const li of rows) li.classList.toggle('on', li.dataset.shape === key);
    schedule();
  }

  /* ---------- input ---------- */
  const local = e => { const r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

  window.addEventListener('pointermove', e => {
    const [x, y] = local(e);
    if (pActive) { pvx = pvx * 0.5 + (x - px) * 0.5; pvy = pvy * 0.5 + (y - py) * 0.5; }
    px = x; py = y; pActive = true; lastMove = performance.now();
    schedule();
  }, { passive: true });
  const release = () => { pActive = false; pvx = pvy = 0; schedule(); };
  document.documentElement.addEventListener('mouseleave', release);
  window.addEventListener('blur', release);
  window.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') release(); });
  window.addEventListener('pointercancel', release);

  // click or tap on empty space: blow the dots outward
  window.addEventListener('pointerdown', e => {
    if (reduce || !N || e.target.closest('a, .list li, .links, .who')) return;
    const [x, y] = local(e);
    if (y < 0 || y > H) return;
    const RB = Math.max(160, Math.min(W, H) * 0.38);
    for (let i = 0; i < N; i++) {
      const dx = X[i] - x, dy = Y[i] - y, d = Math.hypot(dx, dy) + 0.01;
      if (d < RB) {
        const f = 1 - d / RB, p = f * f * 30 * (0.6 + Math.random() * 0.8);
        VX[i] += (dx / d) * p; VY[i] += (dy / d) * p;
      }
    }
    px = x; py = y; pActive = true; lastMove = performance.now();
    schedule();
  });

  let autoOn = !canHover && !reduce, autoTimer = 0;
  function auto() {
    if (!autoOn) return;
    show(ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]);
    autoTimer = setTimeout(auto, current === 'me' ? 3400 : 2700);
  }
  function stopAuto() { autoOn = false; clearTimeout(autoTimer); }

  for (const li of rows) {
    const key = li.dataset.shape;
    li.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') show(key); });
    li.addEventListener('click', e => { if (e.target.closest('a')) return; stopAuto(); show(key, true); });
    li.addEventListener('focusin', () => { stopAuto(); show(key); });
  }
  list.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') show('me'); });
  list.addEventListener('focusout', e => { if (!list.contains(e.relatedTarget)) show('me'); });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([en]) => { visible = en.isIntersecting; schedule(); }).observe(stage);
  }
  document.addEventListener('visibilitychange', () => { visible = !document.hidden; schedule(); });

  /* ---------- start ---------- */
  function build() {
    measure();
    let most = 1;
    for (const key of ORDER) { rasterize(SHAPES[key]); most = Math.max(most, SHAPES[key].count); }
    alloc(most);
  }

  let resizeT = 0, lastW = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      const r = stage.getBoundingClientRect();
      if (!wide.matches && Math.abs(r.width - lastW) < 1) return; // phone address bar show/hide
      lastW = r.width;
      build(); show(current || 'me', true);
    }, 160);
  });

  const loadImg = src => new Promise(res => {
    const im = new Image();
    im.onload = () => res(im); im.onerror = () => res(null);
    im.src = src;
  });
  const fontsReady = document.fonts && document.fonts.load
    ? Promise.race([document.fonts.load('800 100px "Bricolage Grotesque"').catch(() => {}), new Promise(r => setTimeout(r, 2500))])
    : Promise.resolve();

  Promise.all([fontsReady, loadImg(SHAPES.me.src)]).then(([, img]) => {
    if (img) SHAPES.me.img = img;
    else Object.assign(SHAPES.me, { kind: 'text', lines: ['JA'] });
    build();
    lastW = stage.getBoundingClientRect().width;
    show('me', true);
    if (autoOn) autoTimer = setTimeout(auto, 3400);
  });
})();
