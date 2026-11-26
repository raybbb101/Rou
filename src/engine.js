'use strict';
// =====================================================================
//  engine.js — ピクセルバッファ描画・ライティング・入力・サウンド
//  描画は 320x180 の 3 バッファ:
//    COL  … 不透明な色 (ディザで透過を表現)
//    ILL  … 照明 (色に掛け算。暗いダンジョンをランプで照らす)
//    GLW  … 発光 (加算。火花・電撃・魔法の光)
// =====================================================================

const W = 320, H = 180, N = W * H;
const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
const ease = {
  outQuart: (t) => 1 - Math.pow(1 - clamp(t), 4),
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(t))),
  outCubic: (t) => 1 - Math.pow(1 - clamp(t), 3),
  inQuad: (t) => clamp(t) * clamp(t),
  outBack: (t) => { t = clamp(t); const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
};

// ---------------------------------------------------------------- color
const rgb = (r, g, b) => ((255 << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)) >>> 0;
const cR = (c) => c & 255, cG = (c) => (c >>> 8) & 255, cB = (c) => (c >>> 16) & 255;
function hex(h) {
  let s = h.replace('#', '');
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const v = parseInt(s, 16);
  return rgb((v >> 16) & 255, (v >> 8) & 255, v & 255);
}
const mixC = (a, b, t) => rgb(cR(a) + (cR(b) - cR(a)) * t, cG(a) + (cG(b) - cG(a)) * t, cB(a) + (cB(b) - cB(a)) * t);
const ramp = (list) => list.map(hex);
// ランプから段階的に色を選ぶ (ピクセルアートはグラデーションではなく段で塗る)
const rAt = (R, t) => R[clamp(Math.floor(t * R.length), 0, R.length - 1)];

// オリジナルの色ランプ (暗→明、影は寒色寄り・ハイライトは暖色寄り)
const PAL = {
  iron: ramp(['#12141c', '#262b3a', '#424a60', '#6a7590', '#9eaac2', '#dde5f2']),
  spark: ramp(['#2a0e12', '#6c2016', '#c24e1a', '#f4962a', '#ffd469', '#fffbe6']),
  volt: ramp(['#0a0f32', '#1b3a98', '#3374ee', '#6cbcff', '#c4f0ff', '#ffffff']),
  flame: ramp(['#1c090c', '#581412', '#a02c15', '#e6621b', '#ffae3a', '#fff0a6']),
  frost: ramp(['#0c1736', '#1e4486', '#3884c6', '#7ac6ee', '#c8f0ff', '#ffffff']),
  slime: ramp(['#0d1b0f', '#1d481b', '#3a7c26', '#6cb438', '#b2e568', '#eefcc0']),
  aqua: ramp(['#071a22', '#0f3d52', '#1a6f86', '#2fa8b8', '#7ae0dc', '#dafff6']),
  magma: ramp(['#1e0a08', '#521810', '#9a3214', '#df6a1c', '#ffb340', '#fff2b0']),
  void: ramp(['#0b0613', '#23103c', '#441f78', '#6e36b6', '#a670ec', '#e0c6ff']),
  gold: ramp(['#21130a', '#5a380e', '#a66a12', '#e6a824', '#ffde66', '#fffbdd']),
  heal: ramp(['#0a1e17', '#135038', '#238f55', '#4ece78', '#a3f3ae', '#f0fff0']),
  smoke: ramp(['#110e15', '#211c28', '#35303e', '#4c4556', '#696173', '#8c8496']),
  dust: ramp(['#1a140f', '#30261b', '#4b3c2a', '#6a573e', '#8d7656', '#b39c76']),
  blood: ramp(['#1d070f', '#54101c', '#981e29', '#de403e', '#ff8876', '#ffe0d6']),
  stone: ramp(['#0e0e12', '#1d1c23', '#2e2d37', '#45434f', '#615e6b', '#868391', '#b2afbb']),
  bone: ramp(['#19160f', '#3a342a', '#5d5546', '#8a7f6a', '#b8ac94', '#e6dcc6']),
};
const WHITE = hex('#ffffff');
const INK = hex('#0d0a12');

// ---------------------------------------------------------------- buffers
const COL = new Uint32Array(N);
const ILL = new Float32Array(N);
const GLW = new Float32Array(N * 3);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bay = (x, y) => BAYER[((y & 3) << 2) | (x & 3)];

function px(x, y, c) {
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  COL[y * W + x] = c;
}
// ディザ付き半透明 (ドットがまばらになって消えていく)
function pxa(x, y, c, a) {
  if (a <= 0) return;
  x = Math.floor(x); y = Math.floor(y);
  if (a < 1 && a <= bay(x, y)) return;
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  COL[y * W + x] = c;
}
// 本当の半透明 (煙・影など柔らかいもの用)
function blendPx(x, y, c, a) {
  if (a <= 0.004) return;
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = y * W + x, d = COL[i];
  if (a > 1) a = 1;
  COL[i] = rgb(cR(d) + (cR(c) - cR(d)) * a, cG(d) + (cG(c) - cG(d)) * a, cB(d) + (cB(c) - cB(d)) * a);
}
function getPx(x, y) {
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return 0;
  return COL[y * W + x];
}
// 加算発光
function glowPx(x, y, c, k) {
  if (k <= 0.003) return;
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  GLW[i] += cR(c) * k; GLW[i + 1] += cG(c) * k; GLW[i + 2] += cB(c) * k;
}
function glowDisc(cx, cy, r, c, k) {
  if (r <= 0 || k <= 0.003) return;
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
  const rr = cR(c) * k, gg = cG(c) * k, bb = cB(c) * k, ir = 1 / r;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) * ir;
      if (d >= 1) continue;
      const f = (1 - d) * (1 - d), i = (y * W + x) * 3;
      GLW[i] += rr * f; GLW[i + 1] += gg * f; GLW[i + 2] += bb * f;
    }
}
// 照明 (乗算側)
function illum(cx, cy, r, k) {
  if (r <= 0 || k <= 0.003) return;
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
  const ir = 1 / r;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) * ir;
      if (d >= 1) continue;
      const f = 1 - d;
      ILL[y * W + x] += k * f * f;
    }
}
// 懐中ランプの円錐ライト
function illumCone(cx, cy, ang, r, spread, k) {
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx, dy = (y + 0.5 - cy) * 1.25, d = Math.hypot(dx, dy) / r;
      if (d >= 1 || d < 0.02) continue;
      const da = Math.abs(angDiff(Math.atan2(dy, dx), ang));
      if (da > spread) continue;
      const edge = 1 - da / spread;
      ILL[y * W + x] += k * (1 - d) * Math.min(1, edge * 2.2);
    }
}

// ---------------------------------------------------------------- shapes
function rectFill(x, y, w, h, c, a = 1) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) pxa(x + i, y + j, c, a);
}
function discFill(cx, cy, r, c, a = 1) {
  const r2 = r * r;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) pxa(x, y, c, a);
    }
}
function ellipseFill(cx, cy, rx, ry, c, a = 1) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) pxa(x, y, c, a);
    }
}
function ellipseBlend(cx, cy, rx, ry, c, a) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) blendPx(x, y, c, a);
    }
}
function shadow(cx, cy, rx, ry, a = 0.45) { ellipseBlend(cx, cy, rx, ry, INK, a); }
// 地面に描くリング (縦は少しつぶして奥行き感)
function ring(cx, cy, r, th, c, a = 1, squash = 0.7) {
  const ro = r + th / 2, ri = Math.max(0, r - th / 2);
  for (let y = Math.floor(cy - ro * squash) - 1; y <= Math.ceil(cy + ro * squash) + 1; y++)
    for (let x = Math.floor(cx - ro) - 1; x <= Math.ceil(cx + ro) + 1; x++) {
      const d = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) / squash);
      if (d <= ro && d >= ri) pxa(x, y, c, a);
    }
}
function line(x0, y0, x1, y1, c, a = 1) {
  x0 = Math.floor(x0); y0 = Math.floor(y0); x1 = Math.floor(x1); y1 = Math.floor(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy, n = 0;
  for (;;) {
    pxa(x0, y0, c, a);
    if ((x0 === x1 && y0 === y1) || n++ > 600) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}
function glowLine(x0, y0, x1, y1, c, k) {
  const n = Math.max(1, Math.ceil(dist(x0, y0, x1, y1)));
  for (let i = 0; i <= n; i++) glowPx(lerp(x0, x1, i / n), lerp(y0, y1, i / n), c, k);
}
// 左上から光が当たった立体の楕円 (スライム・岩・ボスの体)
function shadedBlob(cx, cy, rx, ry, R, opt = {}) {
  const n = R.length, flash = opt.flash, outline = opt.outline !== false;
  for (let y = Math.floor(cy - ry) - 1; y <= Math.ceil(cy + ry) + 1; y++)
    for (let x = Math.floor(cx - rx) - 1; x <= Math.ceil(cx + rx) + 1; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d = dx * dx + dy * dy;
      if (d > 1) continue;
      if (outline && d > 0.78 && (dx * 0.4 + dy * 0.9) > 0.25) { px(x, y, R[0]); continue; }
      const lit = clamp(0.55 - dx * 0.35 - dy * 0.55 - d * 0.25 + (opt.bias || 0));
      let c = R[clamp(1 + Math.floor(lit * (n - 1.5)), 1, n - 1)];
      if (d < 0.12 && dx < -0.05 && dy < -0.1 && !opt.noSpec) c = R[n - 1];
      px(x, y, flash ? WHITE : c);
    }
}

// ---------------------------------------------------------------- sprites
// テンプレート (文字の配列) を色マップで描く。flip=左向き, scale=縮小拡大, rot=寝た姿勢
function drawTpl(tpl, cmap, x, y, opt = {}) {
  const h = tpl.length, w = tpl[0].length, s = opt.scale || 1, a = opt.alpha == null ? 1 : opt.alpha;
  const dw = Math.max(1, Math.round(w * s)), dh = Math.max(1, Math.round(h * s));
  for (let j = 0; j < dh; j++)
    for (let i = 0; i < dw; i++) {
      let tx = Math.floor(i / s), ty = Math.floor(j / s);
      if (opt.flip) tx = w - 1 - tx;
      const ch = tpl[ty][tx];
      if (ch === '.') continue;
      let c = cmap[ch];
      if (c == null) continue;
      if (opt.flash && ch !== 'o') c = WHITE;
      else if (opt.tint != null) c = mixC(c, opt.tint, opt.tintK || 0.5);
      let ox = i, oy = j;
      if (opt.rot) { ox = dh - 1 - j; oy = i; }
      pxa(x + ox, y + oy, c, a);
    }
}

// 再現性のある乱数 (seed が同じなら同じ並び)
function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------------------------------------------------------------- noise
function hash2(x, y, s = 0) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(hash2(xi, yi, s), hash2(xi + 1, yi, s), u), lerp(hash2(xi, yi + 1, s), hash2(xi + 1, yi + 1, s), u), v);
}
const fbm = (x, y, s = 0) => vnoise(x, y, s) * 0.6 + vnoise(x * 2.1, y * 2.1, s + 7) * 0.28 + vnoise(x * 4.3, y * 4.3, s + 13) * 0.12;

// ---------------------------------------------------------------- composite
// 照明は 6 段 + ディザで量子化 → レトロな光の輪郭
function composite(out, ambient) {
  for (let y = 0, i = 0; y < H; y++)
    for (let x = 0; x < W; x++, i++) {
      const c = COL[i];
      let L = ambient + ILL[i];
      if (L > 1.3) L = 1.3;
      L = Math.floor(L * 6 + bay(x, y)) / 6;
      const g = i * 3;
      let r = (c & 255) * L + GLW[g], gg = ((c >>> 8) & 255) * L + GLW[g + 1], b = ((c >>> 16) & 255) * L + GLW[g + 2];
      out[i] = (255 << 24) | ((b > 255 ? 255 : b) << 16) | ((gg > 255 ? 255 : gg) << 8) | (r > 255 ? 255 : r);
    }
}

// ---------------------------------------------------------------- audio (すべて合成音)
const AC = { ctx: null, master: null, noise: null, last: {} };
function audioInit() {
  if (AC.ctx) { if (AC.ctx.state === 'suspended') AC.ctx.resume(); return; }
  try {
    const C = window.AudioContext || window.webkitAudioContext;
    AC.ctx = new C();
    AC.master = AC.ctx.createGain();
    AC.master.gain.value = 0.32;
    AC.master.connect(AC.ctx.destination);
    const len = AC.ctx.sampleRate;
    AC.noise = AC.ctx.createBuffer(1, len, AC.ctx.sampleRate);
    const d = AC.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { AC.ctx = null; }
}
function tone(f0, f1, dur, type = 'square', vol = 0.2, delay = 0) {
  const c = AC.ctx; if (!c) return;
  const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(AC.master);
  o.start(t); o.stop(t + dur + 0.02);
}
function noiseHit(dur, vol, f0 = 2000, f1 = 400, delay = 0, type = 'lowpass') {
  const c = AC.ctx; if (!c) return;
  const t = c.currentTime + delay, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = AC.noise;
  f.type = type; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(AC.master);
  s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}
function sfx(name) {
  if (!AC.ctx) return;
  const now = performance.now();
  if (AC.last[name] && now - AC.last[name] < 45) return;
  AC.last[name] = now;
  const v = rand(0.92, 1.08);
  switch (name) {
    case 'hit': noiseHit(0.08, 0.35, 5000, 800); tone(520 * v, 180, 0.07, 'square', 0.08); break;
    case 'hitBig': noiseHit(0.14, 0.45, 4000, 300); tone(300 * v, 80, 0.12, 'square', 0.12); break;
    case 'kill': noiseHit(0.22, 0.4, 2500, 120); tone(180 * v, 50, 0.2, 'triangle', 0.25); break;
    case 'dash': noiseHit(0.12, 0.18, 800, 3000, 0, 'bandpass'); break;
    case 'anchor': tone(110, 70, 0.12, 'square', 0.14); noiseHit(0.06, 0.25, 3000, 900); break;
    case 'clank': tone(1400 * v, 1200, 0.05, 'square', 0.04); tone(2100 * v, 1900, 0.04, 'square', 0.03, 0.02); break;
    case 'hurt': tone(420, 90, 0.25, 'sawtooth', 0.18); noiseHit(0.1, 0.2, 1500, 300); break;
    case 'down': tone(300, 60, 0.6, 'sawtooth', 0.2); break;
    case 'fall': tone(700, 90, 0.5, 'triangle', 0.18); break;
    case 'pick': [523, 659, 784].forEach((f, i) => tone(f, f, 0.08, 'square', 0.08, i * 0.06)); break;
    case 'revive': [392, 523, 659, 1046].forEach((f, i) => tone(f, f * 1.01, 0.12, 'triangle', 0.16, i * 0.07)); break;
    case 'select': tone(660, 880, 0.06, 'square', 0.07); break;
    case 'confirm': [523, 784, 1046].forEach((f, i) => tone(f, f, 0.1, 'square', 0.09, i * 0.05)); break;
    case 'zap': noiseHit(0.1, 0.25, 8000, 2000, 0, 'highpass'); tone(1800, 600, 0.08, 'sawtooth', 0.05); break;
    case 'burn': noiseHit(0.15, 0.15, 1200, 400); break;
    case 'shoot': tone(300, 520, 0.1, 'triangle', 0.1); break;
    case 'spawn': tone(200, 600, 0.25, 'triangle', 0.06); break;
    case 'slam': tone(90, 30, 0.5, 'sine', 0.5); noiseHit(0.45, 0.5, 1200, 60); break;
    case 'boom': tone(70, 25, 0.9, 'sine', 0.55); noiseHit(0.9, 0.55, 2000, 50); break;
    case 'bind': [880, 1175, 1568].forEach((f, i) => tone(f, f, 0.18, 'square', 0.07, i * 0.04)); noiseHit(0.2, 0.2, 6000, 1000); break;
    case 'door': [262, 330, 392, 523].forEach((f, i) => tone(f, f, 0.25, 'triangle', 0.12, i * 0.08)); break;
    case 'charge': tone(150, 400, 0.45, 'sawtooth', 0.07); break;
    case 'wall': noiseHit(0.2, 0.4, 900, 100); tone(120, 50, 0.2, 'square', 0.15); break;
  }
}

// ---------------------------------------------------------------- input
const KB = new Set();
const KB_PRESS = new Set();
const KEYSETS = {
  kbA: { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], dash: ['KeyF'], anchor: ['KeyG'] },
  kbB: { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], dash: ['Period', 'Numpad1', 'Numpad0'], anchor: ['Slash', 'Numpad2', 'NumpadDecimal'] },
};
const DEV_LABEL = { touch: 'スマホ', net: 'オンライン', kbA: 'キーボード左', kbB: 'キーボード右', pad0: 'パッド1', pad1: 'パッド2', pad2: 'パッド3', pad3: 'パッド4' };
window.addEventListener('keydown', (e) => {
  if (!KB.has(e.code)) KB_PRESS.add(e.code);
  KB.add(e.code);
  audioInit();
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Slash', 'Period', 'Enter'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => KB.delete(e.code));
window.addEventListener('blur', () => KB.clear());
window.addEventListener('pointerdown', audioInit);

const devPrev = {};
const INPUT = {}; // devId -> state
function readDevices() {
  const out = {};
  const any = (list) => list.some((k) => KB.has(k));
  for (const id of ['kbA', 'kbB']) {
    const s = KEYSETS[id];
    let x = (any(s.right) ? 1 : 0) - (any(s.left) ? 1 : 0), y = (any(s.down) ? 1 : 0) - (any(s.up) ? 1 : 0);
    if (x && y) { x *= 0.7071; y *= 0.7071; }
    const tap = (list) => list.some((k) => KB_PRESS.has(k));
    out[id] = { x, y, dash: any(s.dash), anchor: any(s.anchor), start: KB.has('Enter') && id === 'kbA', tapDash: tap(s.dash), tapAnchor: tap(s.anchor) };
  }
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (let i = 0; i < 4; i++) {
    const p = pads && pads[i];
    if (!p || !p.connected) continue;
    const b = (k) => !!(p.buttons[k] && (p.buttons[k].pressed || p.buttons[k].value > 0.5));
    let x = p.axes[0] || 0, y = p.axes[1] || 0;
    if (b(14)) x = -1; if (b(15)) x = 1; if (b(12)) y = -1; if (b(13)) y = 1;
    const m = Math.hypot(x, y);
    if (m < 0.25) { x = 0; y = 0; } else if (m > 1) { x /= m; y /= m; }
    out['pad' + i] = { x, y, dash: b(0) || b(5), anchor: b(1) || b(2) || b(4) || b(7), start: b(9) };
  }
  if (typeof touchDevices === 'function') touchDevices(out);
  if (typeof netDevices === 'function') netDevices(out);
  for (const id in out) {
    const s = out[id], p = devPrev[id] || { dash: false, anchor: false, start: false, x: 0, y: 0 };
    s.dashP = (s.dash && !p.dash) || !!s.tapDash;
    s.anchorP = (s.anchor && !p.anchor) || !!s.tapAnchor;
    s.startP = s.start && !p.start;
    s.leftP = s.x < -0.5 && p.x >= -0.5;
    s.rightP = s.x > 0.5 && p.x <= 0.5;
    devPrev[id] = { dash: s.dash, anchor: s.anchor, start: s.start, x: s.x, y: s.y };
  }
  for (const k in INPUT) delete INPUT[k];
  Object.assign(INPUT, out);
}
const keyPressed = (code) => KB_PRESS.has(code);
const clearPressed = () => KB_PRESS.clear();
