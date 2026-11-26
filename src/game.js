'use strict';
// =====================================================================
//  game.js — 鎖の探索隊: ルール・物理・敵・部屋の流れ
// =====================================================================

const ROOM = { l: 12, r: 308, t: 30, b: 168 };
const DOOR_X = 160;
const STEP = 1 / 60;
const ROPE_NODES = 22;

const THEMES = {
  1: { name: '苔むす坑道', floor: ramp(['#100f0c', '#191813', '#22211a', '#2c2a21', '#38352a']), wall: ramp(['#09090b', '#18171b', '#28262c', '#3a373f', '#4f4b55', '#6a6570']), accent: 'moss', ambient: 0.4, slime: PAL.slime, core: PAL.slime, boss: '苔岩の番人' },
  2: { name: '凍てつく水晶洞', floor: ramp(['#0b0f18', '#121827', '#1a2234', '#232e44', '#2e3b55']), wall: ramp(['#07090f', '#121726', '#1d2538', '#2a354d', '#3a4865', '#53628a']), accent: 'crystal', ambient: 0.35, slime: PAL.aqua, core: PAL.frost, boss: '氷晶の番人' },
  3: { name: '灼熱の深層', floor: ramp(['#120a0a', '#1b1010', '#251615', '#301c1a', '#3d2420']), wall: ramp(['#0a0607', '#1a0f10', '#2a1819', '#3c2224', '#522e2e', '#6e3e3a']), accent: 'lava', ambient: 0.3, slime: PAL.magma, core: PAL.magma, boss: '熔岩の番人' },
};

const PCOL = [
  { name: 'P1', css: '#ff6b4a', R: ramp(['#3d1010', '#a3302a', '#e85a3c', '#ffa06c']) },
  { name: 'P2', css: '#5aa8ff', R: ramp(['#0f1a3d', '#2a56a8', '#4a90ea', '#a2d2ff']) },
  { name: 'P3', css: '#66d66c', R: ramp(['#0f2a14', '#2a8a38', '#58c65a', '#b6f08a']) },
  { name: 'P4', css: '#ffd23c', R: ramp(['#3a280a', '#b07a16', '#efbe2a', '#fff08a']) },
];

// 探検家 (右向き。w がヘッドランプ)
const HERO_A = [
  '...oooo...',
  '..oHHhho..',
  '.oHhhhhhow',
  '.odddddddo',
  '.ossssseo.',
  '..oSsssSo.',
  '..obBBbo..',
  '.osbBBbso.',
  '.obbbbbbo.',
  '..occcco..',
  '..olo.olo.',
  '..oo...oo.',
];
const HERO_B = [...HERO_A.slice(0, 10), '...olol...', '...oooo...'];
function heroMap(R) {
  return { o: hex('#120e14'), H: R[3], h: R[2], d: R[1], s: hex('#e6b089'), S: hex('#b07458'), e: hex('#1b1222'), b: hex('#5b4733'), B: hex('#7e6549'), c: hex('#3b2d22'), l: hex('#2a2026'), w: hex('#fff2b0') };
}

// ---------------------------------------------------------------- 強化
const UPG = [
  { id: 'blade', icon: '🗡️', name: '鋭い刃', max: 5, desc: '鎖のダメージ +35%' },
  { id: 'long', icon: '⛓️', name: '長い鎖', max: 3, desc: '鎖が長くなり、届く範囲が広がる' },
  { id: 'volt', icon: '⚡', name: '雷の鎖', max: 3, desc: '鎖に定期的に電流。触れている敵に雷が走り、近くの敵へ連鎖' },
  { id: 'fire', icon: '🔥', name: '炎の鎖', max: 3, desc: '鎖で叩いた敵が燃え、継続ダメージ' },
  { id: 'ice', icon: '❄️', name: '氷の鎖', max: 3, desc: '鎖で叩いた敵の動きが鈍くなる' },
  { id: 'heavy', icon: '🔩', name: '重い鎖', max: 3, desc: 'ゆっくり振っても切れる。ノックバック増加' },
  { id: 'guard', icon: '🛡️', name: '鎖の盾', max: 1, desc: '鎖が敵の弾をはじいて消す' },
  { id: 'leech', icon: '🩸', name: '吸血の鎖', max: 3, desc: '鎖で敵を倒すと、たまに一番傷ついた仲間が回復' },
  { id: 'taut', icon: '🎯', name: '張り詰め', max: 3, desc: '鎖がピンと張っている時ダメージ +40%' },
  { id: 'swift', icon: '💨', name: '疾風', max: 3, desc: 'ダッシュの再使用が速く、移動も少し速くなる' },
  { id: 'burst', icon: '💥', name: '爆裂ダッシュ', max: 3, desc: 'ダッシュの終わりに小爆発' },
  { id: 'heart', icon: '❤️', name: '丈夫な体', max: 4, desc: '全員の最大HP +1、全員全回復' },
  { id: 'bond', icon: '🤝', name: '絆', max: 2, desc: '仲間の蘇生が速くなり、蘇生時のHPが増える', multi: true },
  { id: 'binder', icon: '🌀', name: '縛りの達人', max: 3, desc: '大きな敵を鎖で縛った時、拘束が長くダメージ大' },
];
const lv = (id) => G.upg[id] || 0;

// ---------------------------------------------------------------- 状態
const G = {
  state: 'lobby', // lobby / play / over / win
  players: [], ball: null, ropes: [], enemies: [], bullets: [], pickups: [], hazards: [], spawnQ: [], popups: [],
  room: null, floor: 1, roomIdx: 0, upg: {}, time: 0, runTime: 0,
  hitstop: 0, shake: 0, fade: 0, trans: null, banner: null, choose: null, chooser: 0, paused: false, overT: 0,
  voltT: 0, stats: { kills: 0, binds: 0, falls: 0, downs: 0 }, best: loadBest(),
  chainLen: 72, chainDmg: 2, maxHp: 5,
};
function loadBest() { try { return JSON.parse(localStorage.getItem('chainx-best') || 'null'); } catch (e) { return null; } }
function saveBest(rec) { try { localStorage.setItem('chainx-best', JSON.stringify(rec)); } catch (e) {} }

function recalc() {
  G.chainLen = 72 + 22 * lv('long');
  G.chainDmg = 2 * (1 + 0.35 * lv('blade'));
  G.maxHp = 5 + lv('heart');
}

function buzz(idx, ms) {
  const p = G.players.find((q) => q.idx === idx);
  const mine = NET.mode === 'client' ? idx === NET.myIdx : p && !isNetDev(p.dev);
  if (mine && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) {}
}
function addPopup(x, y, text, col = '#fff', size = 7, life = 0.8) { G.popups.push({ x, y, text, col, size, life, t: 0 }); }
function shake(a) { G.shake = Math.max(G.shake, a); }
function hitstop(t) { G.hitstop = Math.max(G.hitstop, t); }

// ---------------------------------------------------------------- 部屋
function inPit(x, y, m = 0) {
  for (const p of G.room.pits) if (x > p.x + m && x < p.x + p.w - m && y > p.y + m && y < p.y + p.h - m) return true;
  return false;
}

let roomUid = 0, entityUid = 0;
function genRoom(floor, idx, kind) {
  const th = THEMES[floor];
  const room = { uid: ++roomUid + '-' + randi(0, 1e6), floor, idx, kind, theme: th, pits: [], pillars: [], torches: [44, 104, 216, 276], seed: randi(1, 99999), phase: 'fight', waves: [], door: 0, clearT: 0 };
  const okSpot = (x, y, r) => {
    if (dist(x, y, 160, 150) < 40 || dist(x, y, DOOR_X, 34) < 30) return false;
    for (const p of room.pillars) if (dist(x, y, p.x, p.y) < p.r + r + 14) return false;
    for (const p of room.pits) if (x > p.x - r - 10 && x < p.x + p.w + r + 10 && y > p.y - r - 10 && y < p.y + p.h + r + 10) return false;
    return true;
  };
  if (kind === 'lobby') {
    room.pillars.push({ x: 84, y: 104, r: 7 }, { x: 236, y: 104, r: 7 });
  } else if (kind === 'boss') {
    room.pillars.push({ x: 56, y: 60, r: 7 }, { x: 264, y: 60, r: 7 }, { x: 56, y: 148, r: 7 }, { x: 264, y: 148, r: 7 });
  } else {
    const np = randi(1, 4);
    for (let i = 0, tries = 0; i < np && tries < 60; tries++) {
      const r = randi(6, 9), x = rand(40, 280), y = rand(52, 150);
      if (okSpot(x, y, r)) { room.pillars.push({ x, y, r }); i++; }
    }
    const nh = idx === 1 && floor === 1 ? randi(0, 1) : randi(1, 3);
    for (let i = 0, tries = 0; i < nh && tries < 80; tries++) {
      const w = randi(18, 46), h = randi(14, 28), x = randi(30, 290 - w), y = randi(48, 156 - h);
      const cx = x + w / 2, cy = y + h / 2;
      if (dist(cx, cy, 160, 150) < 50 || dist(cx, cy, DOOR_X, 34) < 34) continue;
      let ok = true;
      for (const p of room.pillars) if (p.x > x - p.r - 10 && p.x < x + w + p.r + 10 && p.y > y - p.r - 10 && p.y < y + h + p.r + 10) ok = false;
      for (const q of room.pits) if (x < q.x + q.w + 16 && x + w + 16 > q.x && y < q.y + q.h + 16 && y + h + 16 > q.y) ok = false;
      if (ok) { room.pits.push({ x, y, w, h }); i++; }
    }
  }
  buildBg(room);
  return room;
}

function buildBg(room) {
  const th = room.theme, F = th.floor, Wr = th.wall, s = room.seed;
  // ゲストの画面でも同じ部屋になるよう、乱数は部屋の seed から作る
  const rr = mulberry(s), R_ = (a, b) => a + rr() * (b - a), RI = (a, b) => Math.floor(R_(a, b + 1));
  const bg = new Uint32Array(N), glow = new Float32Array(N * 3);
  room.bg = bg; room.bgGlow = glow; room.hasGlow = false;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let c;
      if (y < 6) c = Wr[0];
      else if (y < 26) {
        const row = Math.floor((y - 6) / 5), off = row % 2 ? 6 : 0, bx = (x + off) % 12, by = (y - 6) % 5;
        const id = hash2(Math.floor((x + off) / 12), row, s);
        let k = 2 + (id < 0.25 ? 1 : 0) - (id > 0.88 ? 1 : 0);
        if (y < 11) k--;
        if (by === 0 || bx === 0) k = 1;
        else if (by === 1) k = Math.min(5, k + 1);
        if (y === 25) k = 1;
        c = Wr[clamp(k, 0, Wr.length - 1)];
        if (hash2(x, y, s + 3) > 0.94 && by > 1) c = Wr[Math.max(0, k - 1)];
      } else if (y >= 171) c = y === 171 ? Wr[3] : y === 172 ? Wr[2] : Wr[1];
      else if (x < 10 || x >= 310) c = x === 9 || x === 310 ? Wr[3] : x === 8 || x === 311 ? Wr[2] : Wr[1];
      else {
        const n = fbm(x / 26, y / 26, s);
        const tx = (x - 10) % 16, ty = (y - 26) % 16, tid = hash2(Math.floor((x - 10) / 16), Math.floor((y - 26) / 16), s + 1);
        let k = 1 + Math.floor(n * 2.99) + (tid > 0.8 ? 1 : 0) - (tid < 0.12 ? 1 : 0);
        if ((tx === 0 || ty === 0) && hash2(x, y, s + 9) > 0.2) k--;
        if (tx === 1 || ty === 1) k = Math.min(k + 1, 4) * (hash2(x, y, s + 2) > 0.6 ? 1 : 0) || k;
        // 壁際は暗く (アンビエントオクルージョン)
        const ao = Math.max(0, (34 - y) / 4) + Math.max(0, (16 - x) / 3) + Math.max(0, (x - 303) / 3);
        k -= Math.floor(ao + bay(x, y) * 0.9);
        c = F[clamp(k, 0, F.length - 1)];
        if (hash2(x, y, s + 5) > 0.988) { c = F[4]; }
        if (th.accent === 'moss') {
          const m = fbm(x / 15, y / 15, s + 50);
          if (m > 0.64 && m - 0.64 > bay(x, y) * 0.1) c = hex(m > 0.72 ? '#36481f' : m > 0.68 ? '#283a18' : '#1d2a13');
        }
      }
      bg[y * W + x] = c;
    }
  // 石ころ: 1px のハイライトと影
  for (let i = 0; i < 70; i++) {
    const x = RI(14, 305), y = RI(30, 168);
    bg[y * W + x] = F[4]; if (y + 1 < H) bg[(y + 1) * W + x] = F[0];
  }
  const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) bg[y * W + x] = c; };
  const addG = (x, y, c, k) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 3; glow[i] += cR(c) * k; glow[i + 1] += cG(c) * k; glow[i + 2] += cB(c) * k; room.hasGlow = true; };
  // テーマ別の飾り
  if (th.accent === 'crystal') {
    for (let i = 0; i < 14; i++) {
      const edge = rr() < 0.6, x = edge ? RI(16, 304) : RI(20, 300), y = edge ? RI(27, 30) : RI(40, 165);
      const h = RI(3, 7), R = PAL.frost;
      for (let j = 0; j < h; j++) for (let k = -Math.floor((h - j) / 3); k <= Math.floor((h - j) / 3); k++) put(x + k, y - j, k < 0 ? R[4] : k > 0 ? R[2] : R[3]);
      put(x, y - h, R[5]);
      for (let gy = -10; gy <= 6; gy++) for (let gx = -8; gx <= 8; gx++) { const d = Math.hypot(gx, gy * 1.3) / 10; if (d < 1) addG(x + gx, y - 3 + gy, R[3], 0.22 * (1 - d) * (1 - d)); }
    }
  }
  if (th.accent === 'lava') {
    for (let i = 0; i < 5; i++) {
      let x = R_(30, 290), y = R_(45, 160), a = R_(0, TAU);
      const len = RI(25, 60);
      for (let j = 0; j < len; j++) {
        a += R_(-0.5, 0.5); x += Math.cos(a); y += Math.sin(a) * 0.7;
        if (x < 14 || x > 306 || y < 32 || y > 166) break;
        const R = PAL.magma;
        put(Math.floor(x), Math.floor(y), j % 7 === 0 ? R[5] : R[4]);
        put(Math.floor(x) + 1, Math.floor(y), R[2]);
        put(Math.floor(x), Math.floor(y) + 1, R[1]);
        for (let gy = -4; gy <= 4; gy++) for (let gx = -4; gx <= 4; gx++) { const d = Math.hypot(gx, gy) / 5; if (d < 1) addG(Math.floor(x) + gx, Math.floor(y) + gy, R[3], 0.05 * (1 - d)); }
      }
    }
  }
  // 出口のアーチ
  for (let y = 7; y < 26; y++)
    for (let x = DOOR_X - 13; x <= DOOR_X + 13; x++) {
      const dx = x + 0.5 - DOOR_X, inner = y > 12 ? Math.abs(dx) < 10 : Math.hypot(dx, (y - 13) * 1.6) < 10;
      const outer = y > 12 ? Math.abs(dx) < 13 : Math.hypot(dx, (y - 13) * 1.6) < 13.2;
      if (inner) put(x, y, hex('#050407'));
      else if (outer) put(x, y, Wr[dx < 0 ? 4 : 3]);
    }
  // 穴
  for (const p of room.pits) {
    for (let y = p.y - 1; y <= p.y + p.h; y++)
      for (let x = p.x - 1; x <= p.x + p.w; x++) {
        const edge = x < p.x || x >= p.x + p.w || y < p.y || y >= p.y + p.h;
        if (edge) { put(x, y, y >= p.y + p.h ? F[4] : F[0]); continue; }
        const d = y - p.y;
        let c = hex('#030205');
        if (d < 7) { const k = Math.floor((7 - d) / 7 * 4 + bay(x, y) * 0.9); c = k >= 3 ? Wr[2] : k >= 2 ? Wr[1] : k >= 1 ? Wr[0] : c; }
        if (d === 0) c = Wr[3];
        put(x, y, c);
      }
    for (let x = p.x - 2; x <= p.x + p.w + 1; x++) if (hash2(x, p.y, s) > 0.6) put(x, p.y - 2, F[0]);
  }
}

// ---------------------------------------------------------------- プレイヤー・鉄球
function makePlayer(dev, idx) {
  return {
    kind: 'player', dev, idx, x: 160, y: 140, vx: 0, vy: 0, r: 4, hp: G.maxHp, inv: 0, dashT: 0, dashCd: 0, anchor: false,
    face: 1, aim: -Math.PI / 2, walk: 0, state: 'alive', fallT: 0, safeX: 160, safeY: 140, revive: 0, afterT: 0, swing: false, burstPending: false,
    col: PCOL[idx], cmap: heroMap(PCOL[idx].R),
  };
}
function makeBall() { return { kind: 'ball', x: 170, y: 140, vx: 0, vy: 0, r: 5, spin: 0, hitCd: 0 }; }

function invMass(b) {
  if (b.kind === 'ball') return 1.15;
  if (b.state === 'falling') return 0;
  if (b.anchor) return 0;
  if (b.state === 'down') return 1.7;
  return 1;
}

function rebuildRopes() {
  const ends = G.players.slice();
  if (ends.length === 1) { if (!G.ball) G.ball = makeBall(); G.ball.x = ends[0].x + 14; G.ball.y = ends[0].y; ends.push(G.ball); }
  else G.ball = null;
  G.ropes = [];
  for (let i = 0; i < ends.length - 1; i++) G.ropes.push(makeRope(ends[i], ends[i + 1]));
}
function makeRope(a, b) {
  const nodes = [];
  for (let i = 0; i < ROPE_NODES; i++) {
    const t = i / (ROPE_NODES - 1), x = lerp(a.x, b.x, t), y = lerp(a.y, b.y, t);
    nodes.push({ x, y, px: x, py: y, sp: 0 });
  }
  return { a, b, nodes, taut: false, tension: 0, bindGlow: 0, len: 0 };
}

function collideBody(b) {
  b.x = clamp(b.x, ROOM.l + b.r, ROOM.r - b.r);
  b.y = clamp(b.y, ROOM.t + b.r, ROOM.b - b.r);
  for (const p of G.room.pillars) {
    const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy), m = p.r + b.r;
    if (d < m && d > 0.001) {
      b.x = p.x + (dx / d) * m; b.y = p.y + (dy / d) * m;
      const vn = b.vx * dx / d + b.vy * dy / d;
      if (vn < 0) { b.vx -= vn * dx / d; b.vy -= vn * dy / d; }
    }
  }
}

function updatePlayer(p, dt) {
  const inp = INPUT[p.dev] || { x: 0, y: 0 };
  p.inv = Math.max(0, p.inv - dt);
  p.dashCd = Math.max(0, p.dashCd - dt);
  if (p.state === 'falling') {
    p.fallT += dt;
    p.vx = p.vy = 0;
    if (p.fallT > 0.55) {
      p.state = 'alive'; p.x = p.safeX; p.y = p.safeY; p.fallT = 0;
      damagePlayer(p, 1, true);
      if (p.state === 'alive') p.inv = 1.2;
      fxRevive(p.x, p.y, p.col.R.concat([WHITE]));
      addPopup(p.x, p.y - 16, '引き上げ！', p.col.css);
    }
    return;
  }
  if (p.state === 'down') {
    p.anchor = false;
    p.vx *= 1 - 4 * dt; p.vy *= 1 - 4 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    collideBody(p);
    return;
  }
  const speed = 74 * (1 + 0.08 * lv('swift'));
  const wasAnchor = p.anchor;
  p.anchor = !!inp.anchor && p.dashT <= 0;
  if (p.anchor && !wasAnchor) { sfx('anchor'); fxDust(p.x, p.y, 4, 5); part({ type: 'ring', x: p.x, y: p.y, r0: 2, r1: 12, th: 2, life: 0.25, R: p.col.R.concat([WHITE]), k: 0.3 }); }
  const im = Math.hypot(inp.x, inp.y);
  if (im > 0.15) { p.aim = Math.atan2(inp.y, inp.x); if (Math.abs(inp.x) > 0.2) p.face = Math.sign(inp.x); }
  if (inp.dashP && p.dashCd <= 0 && !p.anchor) {
    const a = im > 0.15 ? Math.atan2(inp.y, inp.x) : p.aim;
    p.vx = Math.cos(a) * 235; p.vy = Math.sin(a) * 235;
    p.dashT = 0.15; p.dashCd = 0.7 * Math.pow(0.75, lv('swift'));
    p.burstPending = lv('burst') > 0;
    sfx('dash'); fxDust(p.x, p.y, 4, 3, Math.cos(a));
  }
  if (p.dashT > 0) {
    p.dashT -= dt;
    p.afterT -= dt;
    if (p.afterT <= 0) { p.afterT = 0.022; part({ type: 'after', tpl: HERO_A, cmap: p.cmap, x: Math.round(p.x - 5), y: Math.round(p.y - 12), flip: p.face < 0, c: p.col.R[3], life: 0.2 }); }
    if (p.dashT <= 0 && p.burstPending) {
      p.burstPending = false;
      const L = lv('burst'), r = 16 + L * 4;
      fxBurst(p.x, p.y, r, PAL.flame); sfx('kill'); shake(2);
      for (const e of G.enemies) if (!e.dead && dist(e.x, e.y, p.x, p.y) < r + e.r) hurtEnemy(e, 2 + L * 1.5, e.x - p.x, e.y - p.y, PAL.flame);
    }
  } else if (p.anchor) {
    p.vx *= 1 - 20 * dt; p.vy *= 1 - 20 * dt;
    if (Math.hypot(p.vx, p.vy) < 5) p.vx = p.vy = 0;
  } else {
    const cur = Math.hypot(p.vx, p.vy), cap = p.swing ? speed * 2.0 : speed;
    if (p.swing && im > 0.15) {
      // アンカーを中心に振り回されている: 入力方向に加速
      p.vx += inp.x * speed * 3.2 * dt; p.vy += inp.y * speed * 3.2 * dt;
      const m = Math.hypot(p.vx, p.vy);
      if (m > cap) { p.vx *= cap / m; p.vy *= cap / m; }
    } else if (cur > speed * 1.05) {
      // 勢いが残っている (投げ飛ばされた直後など)
      p.vx += inp.x * speed * 3 * dt; p.vy += inp.y * speed * 3 * dt;
      p.vx *= 1 - 2.2 * dt; p.vy *= 1 - 2.2 * dt;
    } else {
      const k = Math.min(1, 14 * dt);
      p.vx += (inp.x * speed - p.vx) * k; p.vy += (inp.y * speed - p.vy) * k;
    }
  }
  p.x += p.vx * dt; p.y += p.vy * dt;
  p.walk += Math.hypot(p.vx, p.vy) * dt;
  collideBody(p);
}

function afterRopePlayer(p) {
  if (p.state !== 'alive') return;
  collideBody(p);
  if (p.dashT <= 0 && inPit(p.x, p.y, 1)) {
    p.state = 'falling'; p.fallT = 0; p.anchor = false;
    G.stats.falls++;
    sfx('fall'); fxFall(p.x, p.y);
  } else if (!inPit(p.x, p.y, -7)) { p.safeX = p.x; p.safeY = p.y; }
}

function updateBall(b, dt) {
  b.vx *= 1 - 1.6 * dt; b.vy *= 1 - 1.6 * dt;
  b.x += b.vx * dt; b.y += b.vy * dt;
  b.spin += Math.hypot(b.vx, b.vy) * dt * 0.2;
  b.hitCd = Math.max(0, b.hitCd - dt);
  const vx = b.vx, vy = b.vy;
  collideBody(b);
  if (b.x <= ROOM.l + b.r + 0.01 || b.x >= ROOM.r - b.r - 0.01) b.vx = -vx * 0.5;
  if (b.y <= ROOM.t + b.r + 0.01 || b.y >= ROOM.b - b.r - 0.01) b.vy = -vy * 0.5;
}

function damagePlayer(p, dmg, force = false) {
  if (p.kind !== 'player' || p.state !== 'alive') return false;
  if (!force && (p.inv > 0 || p.dashT > 0)) return false;
  p.hp -= dmg; p.inv = 1.0;
  buzz(p.idx, p.hp <= 0 ? 300 : 70);
  sfx('hurt'); shake(3); hitstop(0.06);
  fxHit(p.x, p.y - 6, 0, -1, PAL.blood, 1.5);
  addPopup(p.x, p.y - 18, `-${dmg}`, '#ff6b6b', 8);
  if (p.hp <= 0) {
    p.hp = 0; p.state = 'down'; p.revive = 0; p.anchor = false;
    G.stats.downs++;
    sfx('down'); shake(5);
    addPopup(p.x, p.y - 24, 'ダウン！', p.col.css, 9, 1.2);
  }
  return true;
}

// ---------------------------------------------------------------- 鎖 (ロープ物理)
function ropeBodies() {
  const list = G.room.pillars.map((p) => ({ x: p.x, y: p.y, r: p.r + 1 }));
  for (const e of G.enemies) if (e.big && !e.dead && e.st !== 'intro') list.push({ x: e.x, y: e.y, r: e.r - 2, e });
  return list;
}

function updateRope(rp, bodies) {
  const n = rp.nodes, L = G.chainLen, seg = L / (ROPE_NODES - 1), a = rp.a, b = rp.b;
  const first = n[0], last = n[ROPE_NODES - 1];
  first.px = first.x; first.py = first.y; first.x = a.x; first.y = a.y;
  last.px = last.x; last.py = last.y; last.x = b.x; last.y = b.y;
  for (let i = 1; i < ROPE_NODES - 1; i++) {
    const q = n[i], vx = (q.x - q.px) * 0.9, vy = (q.y - q.py) * 0.9;
    q.px = q.x; q.py = q.y; q.x += vx; q.y += vy;
  }
  for (let it = 0; it < 10; it++) {
    for (let i = 0; i < ROPE_NODES - 1; i++) {
      const p = n[i], q = n[i + 1], dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
      if (d <= seg || d < 0.0001) continue;
      const wp = i === 0 ? 0 : 1, wq = i + 1 === ROPE_NODES - 1 ? 0 : 1, s = wp + wq;
      if (!s) continue;
      const k = (d - seg) / d / s;
      p.x += dx * k * wp; p.y += dy * k * wp; q.x -= dx * k * wq; q.y -= dy * k * wq;
    }
    for (let i = 1; i < ROPE_NODES - 1; i++) {
      const q = n[i];
      for (const o of bodies) {
        const dx = q.x - o.x, dy = q.y - o.y, d = Math.hypot(dx, dy);
        if (d < o.r && d > 0.0001) { q.x = o.x + (dx / d) * o.r; q.y = o.y + (dy / d) * o.r; }
      }
      q.x = clamp(q.x, ROOM.l, ROOM.r); q.y = clamp(q.y, ROOM.t, ROOM.b);
    }
  }
  let total = 0;
  for (let i = 0; i < ROPE_NODES - 1; i++) total += Math.hypot(n[i + 1].x - n[i].x, n[i + 1].y - n[i].y);
  rp.len = total;
  rp.tension = total - L;
  rp.taut = rp.tension > -1.5;
  const ia = invMass(a), ib = invMass(b), s = ia + ib;
  if (rp.tension > 0 && s > 0) {
    const u = (q, from) => { const dx = q.x - from.x, dy = q.y - from.y, d = Math.hypot(dx, dy) || 1; return [dx / d, dy / d]; };
    const [uax, uay] = u(n[1], a), [ubx, uby] = u(n[ROPE_NODES - 2], b);
    const t = Math.min(rp.tension, 12);
    a.x += uax * t * ia / s; a.y += uay * t * ia / s;
    b.x += ubx * t * ib / s; b.y += uby * t * ib / s;
    const sep = -(a.vx * uax + a.vy * uay) - (b.vx * ubx + b.vy * uby);
    if (sep > 0) {
      const j = sep / s;
      a.vx += uax * j * ia; a.vy += uay * j * ia;
      b.vx += ubx * j * ib; b.vy += uby * j * ib;
      if (sep > 140) sfx('clank');
    }
  }
  if (rp.taut) {
    if (ia === 0 && b.kind === 'player' && b.state === 'alive') b.swing = true;
    if (ib === 0 && a.kind === 'player' && a.state === 'alive') a.swing = true;
  }
  for (const q of n) q.sp = Math.hypot(q.x - q.px, q.y - q.py);
  rp.bindGlow = Math.max(0, rp.bindGlow - STEP);
}

// 点と線分の距離
function segDist(px_, py_, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px_ - ax) * dx + (py_ - ay) * dy) / l2 : 0;
  t = clamp(t);
  return [Math.hypot(px_ - (ax + dx * t), py_ - (ay + dy * t)), t];
}

function chainHits() {
  const thr = Math.max(0.45, 1.1 - 0.25 * lv('heavy'));
  for (const rp of G.ropes) {
    const n = rp.nodes;
    for (const e of G.enemies) {
      if (e.dead || e.spawning || e.chainCd > 0) continue;
      let best = 0, bx = 0, by = 0, hx = 0, hy = 0;
      for (let i = 0; i < ROPE_NODES - 1; i++) {
        const p = n[i], q = n[i + 1];
        const [d, t] = segDist(e.x, e.y, p.x, p.y, q.x, q.y);
        if (d > e.r + 2) continue;
        // 鎖の両端 (プレイヤーの手元) は凶器にならない
        const sp = (i === 0 ? q.sp : i + 1 === ROPE_NODES - 1 ? p.sp : lerp(p.sp, q.sp, t));
        if (sp > best) { best = sp; bx = lerp(q.x - q.px, p.x - p.px, 0.5); by = lerp(q.y - q.py, p.y - p.py, 0.5); hx = lerp(p.x, q.x, t); hy = lerp(p.y, q.y, t); }
      }
      if (best < thr) continue;
      let dmg = G.chainDmg * clamp(best / 2.2, 0.4, 2.4);
      if (rp.taut && lv('taut')) dmg *= 1 + 0.4 * lv('taut');
      chainStrike(e, dmg, bx, by, hx, hy, best);
    }
  }
  // 1人モードの鉄球
  const b = G.ball;
  if (b && b.hitCd <= 0) {
    const sp = Math.hypot(b.vx, b.vy) / 60;
    if (sp >= thr * 0.9)
      for (const e of G.enemies) {
        if (e.dead || e.spawning || e.chainCd > 0) continue;
        if (dist(b.x, b.y, e.x, e.y) < b.r + e.r + 1) {
          chainStrike(e, G.chainDmg * 1.4 * clamp(sp / 2, 0.5, 2.5), b.vx / 60, b.vy / 60, (b.x + e.x) / 2, (b.y + e.y) / 2, sp);
          b.vx *= 0.6; b.vy *= 0.6;
        }
      }
  }
}

function chainStrike(e, dmg, vx, vy, hx, hy, sp) {
  const def = ETYPES[e.type];
  if (e.type === 'crab') {
    const ang = Math.atan2(hy - e.y, hx - e.x);
    if (Math.abs(angDiff(ang, e.faceA)) < 1.15) {
      dmg *= 0.25;
      sfx('clank'); fxHit(hx, hy - 4, vx, vy, PAL.iron, 0.6);
    }
  }
  const m = Math.hypot(vx, vy) || 1;
  const kb = (55 + 45 * lv('heavy')) * clamp(sp / 2, 0.5, 2) / (def.mass || 1);
  e.vx += (vx / m) * kb; e.vy += (vy / m) * kb; e.kbT = 0.3;
  e.chainCd = 0.2;
  if (lv('fire')) e.burn = 2.5;
  if (lv('ice')) { e.slow = 1.8; for (let i = 0; i < 3; i++) part({ type: 'star', x: e.x + rand(-e.r, e.r), y: e.y - rand(2, 10), size: 1, life: 0.3, R: PAL.frost, k: 0.3 }); }
  hurtEnemy(e, dmg, vx, vy, sp > 2.6 ? PAL.gold : PAL.spark, hx, hy);
}

function voltPulse(dt) {
  const L = lv('volt');
  if (!L) return;
  G.voltT += dt;
  if (G.voltT < 1.7 - 0.3 * (L - 1)) return;
  G.voltT = 0;
  let any = false;
  for (const rp of G.ropes) {
    const n = rp.nodes, pts = [];
    for (let i = 0; i < ROPE_NODES; i += 3) pts.push([n[i].x, n[i].y - 4]);
    fxZap(pts, PAL.volt, 0.14);
    for (const e of G.enemies) {
      if (e.dead || e.spawning) continue;
      let near = null;
      for (const q of n) if (dist(q.x, q.y, e.x, e.y) < e.r + 5) { near = q; break; }
      if (!near) continue;
      any = true;
      fxZap([[near.x, near.y - 4], [e.x, e.y - 5]], PAL.volt, 0.2);
      hurtEnemy(e, 1.5 * L, 0, -1, PAL.volt);
      let other = null, od = 55;
      for (const f of G.enemies) if (f !== e && !f.dead && !f.spawning && dist(f.x, f.y, e.x, e.y) < od) { od = dist(f.x, f.y, e.x, e.y); other = f; }
      if (other) { fxZap([[e.x, e.y - 5], [other.x, other.y - 5]], PAL.volt, 0.2); hurtEnemy(other, L, 0, -1, PAL.volt); }
    }
  }
  sfx(any ? 'zap' : 'clank');
}

// ---------------------------------------------------------------- 敵
const ETYPES = {
  gumi: { hp: 4, r: 5, mass: 1, cost: 1, speed: 46 },
  bigGumi: { hp: 12, r: 8, mass: 2.2, cost: 3, speed: 34 },
  bat: { hp: 2.5, r: 4, mass: 0.7, cost: 1, speed: 66, flying: true },
  spitter: { hp: 5, r: 5, mass: 1.5, cost: 2, speed: 30 },
  beetle: { hp: 8, r: 6, mass: 2, cost: 3, speed: 30 },
  crab: { hp: 12, r: 7, mass: 2.6, cost: 4, speed: 24 },
  golem: { hp: 170, r: 15, mass: 30, speed: 22, big: true, boss: true },
  dummy: { hp: 9999, r: 6, mass: 99, speed: 0, dummy: true },
};

function makeEnemy(type, x, y) {
  const d = ETYPES[type], np = Math.max(1, G.players.length);
  const mul = d.dummy ? 1 : (1 + 0.42 * (G.floor - 1) + 0.05 * Math.max(0, G.roomIdx - 1)) * (1 + 0.22 * (np - 1));
  const e = {
    id: ++entityUid, type, x, y, vx: 0, vy: 0, r: d.r, hp: d.hp * mul, maxHp: d.hp * mul, t: rand(0, 1), st: 'idle', stT: rand(0.3, 1), face: 1, faceA: 0,
    flash: 0, burn: 0, slow: 0, chainCd: 0, kbT: 0, z: 0, big: !!d.big, flying: !!d.flying, dead: false, cd: rand(1, 2.5), dir: 0, seed: rand(0, 100),
  };
  if (type === 'golem') { e.st = 'intro'; e.stT = 1.4; e.atkT = 2; e.bindCd = 0; e.enraged = false; e.name = G.room.theme.boss; }
  G.enemies.push(e);
  return e;
}

function nearestPlayer(x, y) {
  let best = null, bd = 1e9;
  for (const p of G.players) {
    if (p.state !== 'alive') continue;
    const d = dist(x, y, p.x, p.y);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}

function hurtEnemy(e, dmg, dx, dy, R = PAL.spark, hx, hy) {
  if (e.dead || e.st === 'intro') return;
  if (e.st === 'bound') dmg *= 1.6 + 0.3 * lv('binder');
  if (e.st === 'stun' && e.type === 'golem') dmg *= 1.3;
  e.hp -= dmg; e.flash = 0.08;
  const big = dmg >= 4;
  fxHit(hx == null ? e.x : hx, (hy == null ? e.y : hy) - 4, dx, dy, R, big ? 2 : 1);
  sfx(big ? 'hitBig' : 'hit');
  addPopup(e.x + rand(-3, 3), e.y - e.r - 10, String(Math.max(1, Math.round(dmg))), big ? '#ffd35a' : '#ffffff', big ? 9 : 7, 0.6);
  hitstop(big ? 0.045 : 0.02);
  if (e.type === 'dummy') { e.hp = Math.max(e.hp, 9000); e.lastHit = 0; return; }
  if (e.hp <= 0) killEnemy(e);
}

function enemyRamp(e) {
  const th = G.room.theme;
  switch (e.type) {
    case 'gumi': case 'bigGumi': return th.slime;
    case 'bat': return PAL.void;
    case 'spitter': return G.floor === 3 ? PAL.magma : PAL.void;
    case 'beetle': return G.floor === 2 ? PAL.frost : PAL.dust;
    case 'crab': return PAL.blood;
    case 'golem': return PAL.stone;
    default: return PAL.bone;
  }
}

function killEnemy(e, how) {
  if (e.dead) return;
  e.dead = true;
  G.stats.kills++;
  if (e.type === 'golem') { bossDeath(e); return; }
  fxKill(e.x, e.y - 3, enemyRamp(e), e.r + 2);
  sfx('kill'); shake(2); hitstop(0.05);
  if (e.type === 'bigGumi') for (let i = 0; i < 2; i++) { const c = makeEnemy('gumi', e.x + (i ? 5 : -5), e.y); c.vx = (i ? 80 : -80); c.kbT = 0.3; c.hp = c.maxHp *= 0.7; }
  if (Math.random() < 0.07) G.pickups.push({ x: e.x, y: e.y, t: 0, kind: 'heart' });
  if (lv('leech') && how !== 'fall' && Math.random() < 0.18 * lv('leech')) {
    const p = G.players.filter((q) => q.state === 'alive' && q.hp < G.maxHp).sort((a, b) => a.hp - b.hp)[0];
    if (p) { p.hp++; fxHeal(p.x, p.y); addPopup(p.x, p.y - 18, '+1', '#7ef08e'); }
  }
}

function bossDeath(e) {
  sfx('boom'); shake(8); hitstop(0.25);
  addPopup(e.x, e.y - 34, '撃破！', '#ffd35a', 14, 2);
  for (let i = 0; i < 6; i++)
    setTimeout(() => { fxKill(e.x + rand(-14, 14), e.y - rand(0, 20), PAL.stone, 10); fxBurst(e.x + rand(-12, 12), e.y - rand(0, 18), 22, i % 2 ? PAL.gold : G.room.theme.core); sfx('kill'); shake(4); }, i * 140);
  fxRocks(e.x, e.y, 30);
  for (const o of G.enemies) if (o !== e && !o.dead) killEnemy(o);
  G.spawnQ.length = 0; G.bullets.length = 0; G.hazards.length = 0;
  for (let i = 0; i < 3; i++) G.pickups.push({ x: e.x + rand(-20, 20), y: e.y + rand(-8, 12), t: 0, kind: 'heart' });
}

function updateEnemy(e, dt) {
  const d = ETYPES[e.type];
  e.t += dt; e.stT -= dt; e.cd -= dt;
  e.flash = Math.max(0, e.flash - dt); e.chainCd = Math.max(0, e.chainCd - dt); e.kbT = Math.max(0, e.kbT - dt);
  e.slow = Math.max(0, e.slow - dt);
  if (e.burn > 0) {
    e.burn -= dt;
    e.burnTick = (e.burnTick || 0) + dt;
    if (Math.random() < 0.4) fxEmber(e.x + rand(-e.r, e.r), e.y - rand(0, e.r * 2));
    if (e.burnTick > 0.5) { e.burnTick = 0; e.hp -= 0.6 * lv('fire'); e.flash = 0.04; if (e.hp <= 0 && e.type !== 'dummy') killEnemy(e); if (e.type === 'dummy') e.hp = 9999; }
  }
  if (e.dead) return;
  const sm = e.slow > 0 ? 1 - 0.2 * Math.max(1, lv('ice')) : 1;
  const tgt = nearestPlayer(e.x, e.y);
  let dx = tgt ? tgt.x - e.x : 0, dy = tgt ? tgt.y - e.y : 0;
  const dd = Math.hypot(dx, dy) || 1; dx /= dd; dy /= dd;
  let wx = 0, wy = 0; // 望む速度
  const sp = d.speed * sm;
  switch (e.type) {
    case 'gumi': case 'bigGumi': {
      const cyc = (e.t + e.seed) % (e.type === 'gumi' ? 0.95 : 1.25), hop = e.type === 'gumi' ? 0.4 : 0.5;
      const ph = cyc - (e.type === 'gumi' ? 0.55 : 0.75);
      if (ph > 0) { wx = dx * sp * 2.3; wy = dy * sp * 2.3; e.z = Math.sin((ph / hop) * Math.PI) * (e.type === 'gumi' ? 5 : 4); }
      else e.z = 0;
      e.squash = ph > 0 ? -0.2 : Math.sin(clamp(-ph / 0.5) * Math.PI) * 0.18;
      if (e.z === 0 && e.wasAir) fxDust(e.x, e.y, 2, 3);
      e.wasAir = e.z > 0;
      break;
    }
    case 'bat': {
      if (e.st === 'idle' && e.stT <= 0) { e.st = 'swoop'; e.stT = rand(1.2, 1.8); }
      if (e.st === 'swoop') { const w = Math.sin(e.t * 5 + e.seed) * 0.8; wx = (dx - dy * w) * sp; wy = (dy + dx * w) * sp; if (e.stT <= 0) { e.st = 'back'; e.stT = 0.6; } }
      else if (e.st === 'back') { wx = -dx * sp * 0.8; wy = -dy * sp * 0.8; if (e.stT <= 0) { e.st = 'swoop'; e.stT = rand(1.2, 1.8); } }
      break;
    }
    case 'spitter': {
      if (e.st === 'charge') {
        if (e.stT <= 0) {
          const a = Math.atan2(dy, dx), shots = G.floor >= 3 ? [-0.25, 0, 0.25] : G.floor >= 2 ? [-0.12, 0.12] : [0];
          for (const o of shots) fireBullet(e.x, e.y - 8, a + o, 72, enemyRamp(e));
          sfx('shoot'); e.st = 'idle'; e.cd = rand(1.8, 2.6);
        }
      } else {
        if (dd < 70) { wx = -dx * sp; wy = -dy * sp; }
        else if (dd > 115) { wx = dx * sp; wy = dy * sp; }
        else { const s = Math.sin(e.seed) > 0 ? 1 : -1; wx = -dy * sp * 0.6 * s; wy = dx * sp * 0.6 * s; }
        if (e.cd <= 0 && tgt && dd < 170) { e.st = 'charge'; e.stT = 0.65; }
      }
      break;
    }
    case 'beetle': {
      if (e.st === 'aim') { e.vx *= 0.8; e.vy *= 0.8; if (e.stT <= 0) { e.st = 'charge'; e.stT = 0.75; sfx('dash'); } }
      else if (e.st === 'charge') {
        wx = Math.cos(e.dir) * 190 * sm; wy = Math.sin(e.dir) * 190 * sm;
        if (Math.random() < 0.5) fxDust(e.x, e.y, 1, 2);
        if (e.stT <= 0) { e.st = 'idle'; e.cd = rand(1.8, 2.8); }
      } else if (e.st === 'stun') { if (e.stT <= 0) { e.st = 'idle'; e.cd = 1.5; } }
      else {
        wx = dx * sp; wy = dy * sp;
        if (tgt && dd < 125 && e.cd <= 0) { e.st = 'aim'; e.stT = 0.6; e.dir = Math.atan2(dy, dx); sfx('charge'); }
      }
      break;
    }
    case 'crab': {
      wx = dx * sp; wy = dy * sp;
      if (tgt) e.faceA += angDiff(Math.atan2(dy, dx), e.faceA) * Math.min(1, 2.2 * dt * sm);
      break;
    }
    case 'golem': updateBoss(e, dt, tgt, dx, dy, dd, sm); return;
    case 'dummy': e.lastHit = (e.lastHit || 0) + dt; return;
  }
  if (Math.abs(wx) > 1) e.face = Math.sign(wx);
  const k = Math.min(1, (e.kbT > 0 ? 2 : 7) * dt);
  e.vx += (wx - e.vx) * k; e.vy += (wy - e.vy) * k;
  moveEnemy(e, dt);
}

function moveEnemy(e, dt) {
  const ox = e.x, oy = e.y;
  e.x += e.vx * dt; e.y += e.vy * dt;
  const hitWall = e.x < ROOM.l + e.r || e.x > ROOM.r - e.r || e.y < ROOM.t + e.r || e.y > ROOM.b - e.r;
  e.x = clamp(e.x, ROOM.l + e.r, ROOM.r - e.r); e.y = clamp(e.y, ROOM.t + e.r, ROOM.b - e.r);
  let hitPillar = false;
  if (!e.flying)
    for (const p of G.room.pillars) {
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy), m = p.r + e.r;
      if (d < m && d > 0.001) { e.x = p.x + (dx / d) * m; e.y = p.y + (dy / d) * m; hitPillar = true; }
    }
  if ((hitWall || hitPillar) && e.st === 'charge') {
    e.st = 'stun'; e.stT = e.type === 'golem' ? 1.8 : 1.2; e.vx = -e.vx * 0.3; e.vy = -e.vy * 0.3;
    sfx('wall'); shake(e.type === 'golem' ? 6 : 3); fxRocks(e.x + Math.cos(e.dir) * e.r, e.y + Math.sin(e.dir) * e.r, e.type === 'golem' ? 14 : 6);
    if (e.type === 'golem') addPopup(e.x, e.y - 40, 'スタン！', '#9fd6ff', 10, 1.2);
  }
  if (!e.flying && !e.big && inPit(e.x, e.y, 1)) {
    if (e.kbT > 0 || e.st === 'charge') {
      // 鎖で穴に叩き落とした！
      fxFall(e.x, e.y); sfx('fall');
      addPopup(e.x, e.y - 14, '落下！', '#c9b6ff', 8);
      e.hp = 0; killEnemy(e, 'fall');
    } else { e.x = ox; e.y = oy; e.vx *= -0.3; e.vy *= -0.3; }
  }
}

function fireBullet(x, y, a, sp, R) { G.bullets.push({ id: ++entityUid, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 3, t: 0, life: 4.5, R }); }

// ---------------------------------------------------------------- ボス
function updateBoss(e, dt, tgt, dx, dy, dd, sm) {
  const enr = e.enraged ? 1.35 : 1;
  e.bindCd = Math.max(0, e.bindCd - dt);
  if (!e.enraged && e.hp < e.maxHp * 0.5 && e.st !== 'intro') {
    e.enraged = true; shake(6); sfx('slam');
    part({ type: 'ring', x: e.x, y: e.y, r0: 10, r1: 90, th: 6, life: 0.6, R: PAL.blood, k: 0.6 });
    addPopup(e.x, e.y - 44, '激昂！', '#ff6b4a', 12, 1.5);
  }
  let wx = 0, wy = 0;
  switch (e.st) {
    case 'intro':
      if (Math.random() < 0.5) fxDust(e.x + rand(-14, 14), e.y, 1, 2);
      if (e.stT <= 0) { e.st = 'walk'; sfx('slam'); shake(5); part({ type: 'ring', x: e.x, y: e.y, r0: 8, r1: 60, th: 5, life: 0.5, R: PAL.dust, k: 0.2 }); }
      break;
    case 'walk':
      wx = dx * 22 * enr * sm; wy = dy * 22 * enr * sm;
      e.atkT -= dt * enr;
      if (e.atkT <= 0 && tgt) {
        const opts = ['slam', 'slam', 'rain'];
        if (G.floor >= 2) opts.push('charge', 'charge');
        if (G.floor >= 2 || e.enraged) opts.push('summon');
        if (G.floor >= 3) opts.push('nova', 'nova');
        let a = pick(opts);
        if (a === 'slam' && dd > 75) a = G.floor >= 2 ? 'charge' : 'rain';
        if (a === 'summon' && G.enemies.filter((q) => !q.dead).length > 5) a = 'rain';
        e.st = a + 'W';
        e.stT = { slam: 0.85, rain: 0.5, charge: 0.75, summon: 0.6, nova: 0.7 }[a] / (e.enraged ? 1.15 : 1);
        e.dir = Math.atan2(dy, dx);
        if (a === 'charge') sfx('charge');
      }
      break;
    case 'slamW':
      if (e.stT <= 0) {
        e.st = 'rest'; e.stT = 0.7;
        sfx('slam'); shake(7); hitstop(0.05);
        const maxR = e.enraged ? 92 : 76;
        G.hazards.push({ type: 'shock', x: e.x, y: e.y, t: 0, dur: 0.6, r0: 8, r1: maxR, hit: new Set() });
        part({ type: 'ring', x: e.x, y: e.y, r0: 8, r1: maxR, th: 6, life: 0.6, R: G.room.theme.core, k: 0.5 });
        fxRocks(e.x, e.y, 16);
        part({ type: 'flash', x: e.x, y: e.y - 4, size: 8, life: 0.08, R: PAL.spark, k: 0.8 });
      }
      break;
    case 'rainW':
      if (e.stT <= 0) {
        e.st = 'rest'; e.stT = 0.5; sfx('slam'); shake(3);
        const alive = G.players.filter((p) => p.state === 'alive');
        const n = 5 + G.floor * 2 + (e.enraged ? 3 : 0);
        for (let i = 0; i < n; i++) {
          const p = i < alive.length * 2 && alive.length ? alive[i % alive.length] : null;
          const x = p ? p.x + rand(-14, 14) : rand(30, 290), y = p ? p.y + rand(-10, 10) : rand(45, 160);
          G.hazards.push({ type: 'rock', x: clamp(x, 20, 300), y: clamp(y, 36, 164), t: -i * 0.07, dur: 1.05, r: 10 });
        }
      }
      break;
    case 'chargeW':
      e.dir += angDiff(Math.atan2(dy, dx), e.dir) * Math.min(1, 3 * dt);
      if (e.stT <= 0) { e.st = 'charge'; e.stT = 1.2; sfx('dash'); }
      break;
    case 'charge':
      wx = Math.cos(e.dir) * 175 * enr; wy = Math.sin(e.dir) * 175 * enr;
      if (Math.random() < 0.6) fxDust(e.x, e.y, 2, 8);
      if (e.stT <= 0) { e.st = 'rest'; e.stT = 0.5; }
      break;
    case 'summonW':
      if (e.stT <= 0) {
        e.st = 'rest'; e.stT = 0.5; sfx('spawn');
        for (let i = 0; i < 2 + (e.enraged ? 1 : 0); i++) queueSpawn(Math.random() < 0.5 ? 'gumi' : 'bat');
      }
      break;
    case 'novaW':
      if (e.stT <= 0) {
        e.st = 'rest'; e.stT = 0.6; sfx('shoot'); shake(2);
        const k = e.enraged ? 16 : 12, off = rand(0, 1);
        for (let i = 0; i < k; i++) fireBullet(e.x, e.y - 12, ((i + off) / k) * TAU, 62, PAL.magma);
      }
      break;
    case 'stun': case 'bound': case 'rest':
      if (e.stT <= 0) { e.st = 'walk'; e.atkT = rand(1.2, 2.2); if (e.wasBound) { e.bindCd = 2.5; e.wasBound = false; } }
      break;
  }
  // 鎖で巻き付かれたか判定 (ロープがボスの周りを何度回ったか)
  if (e.st !== 'bound' && e.st !== 'intro' && e.bindCd <= 0) {
    for (const rp of G.ropes) {
      let sum = 0, best = 0, prev = null;
      for (const q of rp.nodes) {
        const qd = dist(q.x, q.y, e.x, e.y);
        if (qd < e.r + 6) {
          const a = Math.atan2(q.y - e.y, q.x - e.x);
          if (prev !== null) sum += angDiff(a, prev);
          prev = a; best = Math.max(best, Math.abs(sum));
        } else { prev = null; sum = 0; }
      }
      if (best > Math.PI * 1.15) { bindBoss(e, rp); break; }
    }
  }
  if (Math.abs(wx) > 1) e.face = Math.sign(wx);
  const k = Math.min(1, (e.kbT > 0 ? 1 : 5) * dt);
  e.vx += (wx - e.vx) * k; e.vy += (wy - e.vy) * k;
  if (e.st === 'bound' || e.st === 'stun') { e.vx *= 0.8; e.vy *= 0.8; }
  moveEnemy(e, dt);
}

function bindBoss(e, rp) {
  e.st = 'bound'; e.stT = 2.4 + 0.8 * lv('binder'); e.wasBound = true;
  rp.bindGlow = e.stT;
  G.stats.binds++;
  sfx('bind'); shake(5); hitstop(0.12);
  fxBind(e.x, e.y - 10, e.r);
  addPopup(e.x, e.y - 40, 'バインド！', '#ffd35a', 13, 1.4);
  hurtEnemy(e, 6 + 3 * lv('binder'), 0, -1, PAL.gold);
}

function updateHazards(dt) {
  for (let i = G.hazards.length - 1; i >= 0; i--) {
    const h = G.hazards[i];
    h.t += dt;
    if (h.type === 'shock') {
      const u = clamp(h.t / h.dur), r = h.r0 + (h.r1 - h.r0) * ease.outQuart(u);
      for (const p of G.players) {
        if (h.hit.has(p) || p.state !== 'alive') continue;
        const d = Math.hypot(p.x - h.x, (p.y - h.y) / 0.7);
        if (Math.abs(d - r) < 6) { h.hit.add(p); damagePlayer(p, 1); }
      }
    } else if (h.type === 'rock' && h.t >= h.dur && !h.done) {
      h.done = true;
      fxRocks(h.x, h.y, 8); fxBurst(h.x, h.y, 14, PAL.dust); sfx('wall'); shake(2);
      for (const p of G.players) if (p.state === 'alive' && dist(p.x, p.y, h.x, h.y) < h.r) damagePlayer(p, 1);
      for (const e of G.enemies) if (!e.dead && !e.big && dist(e.x, e.y, h.x, h.y) < h.r) hurtEnemy(e, 4, 0, -1, PAL.dust);
    }
    if (h.t >= h.dur + 0.05) G.hazards.splice(i, 1);
  }
}

// ---------------------------------------------------------------- 弾・アイテム
function updateBullets(dt) {
  for (let i = G.bullets.length - 1; i >= 0; i--) {
    const b = G.bullets[i];
    b.t += dt; b.x += b.vx * dt; b.y += b.vy * dt;
    if (Math.random() < 0.5) part({ type: 'ember', x: b.x + rand(-1, 1), y: b.y + rand(-1, 1), vx: -b.vx * 0.1, vy: -b.vy * 0.1, grav: 0, life: 0.25, R: b.R, k: 0.3, seed: rand(0, 9) });
    let gone = b.t > b.life || b.x < ROOM.l || b.x > ROOM.r || b.y < ROOM.t - 6 || b.y > ROOM.b;
    for (const p of G.room.pillars) if (dist(b.x, b.y + 6, p.x, p.y) < p.r) gone = true;
    if (!gone && lv('guard'))
      for (const rp of G.ropes) {
        for (const q of rp.nodes) if (dist(q.x, q.y - 5, b.x, b.y) < 5) { gone = true; sfx('clank'); break; }
        if (gone) break;
      }
    if (!gone)
      for (const p of G.players)
        if (p.state === 'alive' && dist(p.x, p.y - 5, b.x, b.y) < b.r + 4) { if (damagePlayer(p, 1)) gone = true; }
    if (gone) { fxPop(b.x, b.y, b.R); G.bullets.splice(i, 1); }
  }
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const k = G.pickups[i];
    k.t += STEP;
    if (k.t > 14) { G.pickups.splice(i, 1); continue; }
    for (const p of G.players)
      if (p.state === 'alive' && p.hp < G.maxHp && dist(p.x, p.y, k.x, k.y) < 9) {
        p.hp = Math.min(G.maxHp, p.hp + 2); sfx('pick'); fxHeal(p.x, p.y); addPopup(p.x, p.y - 18, '+2', '#7ef08e');
        G.pickups.splice(i, 1); break;
      }
  }
}

// ---------------------------------------------------------------- ウェーブ
function findSpawn() {
  for (let i = 0; i < 60; i++) {
    const x = rand(26, 294), y = rand(44, 160);
    if (inPit(x, y, -8)) continue;
    let ok = true;
    for (const p of G.room.pillars) if (dist(x, y, p.x, p.y) < p.r + 10) ok = false;
    for (const p of G.players) if (dist(x, y, p.x, p.y) < 72) ok = false;
    if (ok) return [x, y];
  }
  return [rand(40, 280), 50];
}
function queueSpawn(type, x, y) {
  if (x == null) [x, y] = findSpawn();
  const R = type === 'golem' ? PAL.blood : PAL.void;
  const dur = type === 'golem' ? 1.2 : 0.8;
  fxRune(x, y, R, dur);
  G.spawnQ.push({ type, x, y, t: dur });
}
function buildWaves(floor, idx) {
  const np = Math.max(1, G.players.length);
  const budget = Math.round((5 + floor * 4 + idx * 2) * (1 + 0.38 * (np - 1)));
  const nw = idx === 1 ? 1 : Math.min(3, randi(1, 2) + (floor >= 2 ? 1 : 0));
  const pool = [['gumi', 3], ['bat', 2]];
  if (idx >= 2 || floor > 1) pool.push(['spitter', 2]);
  if (idx >= 3 || floor > 1) pool.push(['beetle', 2]);
  if (floor >= 2) pool.push(['bigGumi', 2], ['crab', 1.5]);
  if (floor >= 3) pool.push(['crab', 1], ['beetle', 1]);
  const waves = [];
  for (let w = 0; w < nw; w++) {
    let pts = Math.round(budget / nw) + w;
    const list = [];
    while (pts > 0 && list.length < 12) {
      const tot = pool.reduce((s, p) => s + p[1], 0);
      let r = rand(0, tot), t = pool[0][0];
      for (const [name, wt] of pool) { r -= wt; if (r <= 0) { t = name; break; } }
      list.push(t); pts -= ETYPES[t].cost;
    }
    waves.push(list);
  }
  return waves;
}

// ---------------------------------------------------------------- 進行
function loadRoom(floor, idx) {
  G.floor = floor; G.roomIdx = idx;
  const kind = idx === 0 ? 'lobby' : idx === 5 ? 'boss' : 'fight';
  G.room = genRoom(floor, idx, kind);
  G.enemies = []; G.bullets = []; G.hazards = []; G.pickups = []; G.spawnQ = [];
  PARTS.length = 0; FXO.length = 0;
  const n = G.players.length;
  G.players.forEach((p, i) => {
    p.x = 160 + (i - (n - 1) / 2) * 18; p.y = kind === 'lobby' ? 130 : 152; p.vx = p.vy = 0;
    p.safeX = p.x; p.safeY = p.y; p.anchor = false; p.dashT = 0;
    if (p.state !== 'alive') { p.state = 'alive'; p.hp = Math.max(1, p.hp); p.fallT = 0; }
  });
  rebuildRopes();
  if (kind === 'lobby') {
    G.room.phase = 'lobby';
    makeEnemy('dummy', 160, 84);
  } else if (kind === 'boss') {
    G.room.phase = 'fight';
    G.room.waves = [];
    queueSpawn('golem', 160, 78);
    G.banner = { t: 0, title: G.room.theme.boss, sub: `第${floor}層 ボス`, col: '#ff7a5a' };
  } else {
    G.room.phase = 'fight';
    G.room.waves = buildWaves(floor, idx);
    G.room.waveDelay = 0.7;
    if (idx === 1) G.banner = { t: 0, title: `第${floor}層`, sub: G.room.theme.name, col: '#ffd35a' };
  }
}

function startRun() {
  G.upg = {}; recalc();
  G.stats = { kills: 0, binds: 0, falls: 0, downs: 0 };
  G.runTime = 0; G.chooser = 0;
  for (const p of G.players) { p.hp = G.maxHp; p.state = 'alive'; }
  G.state = 'play';
  transition(() => loadRoom(1, 1));
  sfx('door');
}

function transition(fn) { if (!G.trans) G.trans = { t: 0, fn, done: false }; }

function nextRoom() {
  if (G.roomIdx >= 5) {
    if (G.floor >= 3) { winRun(); return; }
    transition(() => loadRoom(G.floor + 1, 1));
  } else transition(() => loadRoom(G.floor, G.roomIdx + 1));
}

function rollUpgrades() {
  const pool = UPG.filter((u) => lv(u.id) < u.max && (!u.multi || G.players.length > 1));
  for (let i = pool.length - 1; i > 0; i--) { const j = randi(0, i); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, 3);
}

function openChoose() {
  const opts = rollUpgrades();
  if (!opts.length) { G.room.phase = 'open'; sfx('door'); return; }
  const ch = G.players[G.chooser % G.players.length];
  G.choose = { opts, sel: 1, who: ch, t: 0 };
  G.room.phase = 'choose';
}

function applyUpgrade(u) {
  G.upg[u.id] = lv(u.id) + 1;
  recalc();
  if (u.id === 'heart') for (const p of G.players) { p.hp = G.maxHp; if (p.state === 'down') { p.state = 'alive'; } fxHeal(p.x, p.y); }
  G.chooser++;
}

function gameOver() {
  G.state = 'over'; G.overT = 0;
  recordBest(false);
}
function winRun() { G.state = 'win'; G.overT = 0; recordBest(true); sfx('revive'); }
function recordBest(win) {
  const score = (G.floor - 1) * 5 + G.roomIdx + (win ? 10 : 0);
  if (!G.best || score > G.best.score) { G.best = { score, floor: G.floor, room: G.roomIdx, win, time: Math.round(G.runTime), np: G.players.length }; saveBest(G.best); G.newBest = true; }
  else G.newBest = false;
}

function toLobby() {
  G.state = 'lobby'; G.upg = {}; recalc();
  for (const p of G.players) { p.hp = G.maxHp; p.state = 'alive'; }
  loadRoom(1, 0);
}

// ---------------------------------------------------------------- 参加
function addPlayer(dev) {
  const used = new Set(G.players.map((q) => q.idx));
  let idx = 0; while (used.has(idx)) idx++;
  const np = makePlayer(dev, idx);
  np.hp = G.maxHp;
  np.x = 120 + idx * 26; np.y = 130; np.safeX = np.x; np.safeY = np.y;
  G.players.push(np);
  G.players.sort((a, b) => a.idx - b.idx);
  rebuildRopes();
  sfx('confirm');
  fxRevive(np.x, np.y, np.col.R.concat([WHITE]));
  addPopup(np.x, np.y - 20, `${np.col.name} 参加！`, np.col.css, 8, 1.2);
  return np;
}
function handleJoin() {
  for (const id in INPUT) {
    if (isNetDev(id)) continue;
    const s = INPUT[id];
    if (s.dashP && G.players.length < 4 && !G.players.find((q) => q.dev === id)) addPlayer(id);
  }
  if (keyPressed('Backspace')) {
    const local = G.players.filter((q) => !isNetDev(q.dev));
    if (local.length) { const q = local[local.length - 1]; G.players = G.players.filter((x) => x !== q); rebuildRopes(); sfx('select'); }
  }
}

// タイトル ⇄ ロビー
function toTitle() {
  G.state = 'title'; G.players = []; G.ball = null; G.ropes = []; G.choose = null; G.paused = false; G.banner = null;
  G.upg = {}; recalc();
  loadRoom(1, 0);
  NET.screen = 'main';
}
function enterLobby(withTouch) {
  if (NET.mode === 'off') NET.mode = 'solo';
  G.state = 'lobby'; G.players = []; G.upg = {}; recalc();
  loadRoom(1, 0);
  if (withTouch) addPlayer('touch');
}
function leaveLobby() { netClose(); toTitle(); sfx('select'); }

// ---------------------------------------------------------------- メイン更新
function update(dt) {
  readDevices();
  G.time += dt;
  if (G.banner) { G.banner.t += dt; if (G.banner.t > 2.6) G.banner = null; }
  for (let i = G.popups.length - 1; i >= 0; i--) { const p = G.popups[i]; p.t += dt; if (p.t > p.life) G.popups.splice(i, 1); }
  G.shake = Math.max(0, G.shake - dt * 18);

  if (G.trans) {
    const tr = G.trans;
    tr.t += dt;
    if (!tr.done && tr.t >= 0.35) { tr.done = true; tr.fn(); }
    if (tr.t >= 0.7) G.trans = null;
    G.fade = tr.t < 0.35 ? tr.t / 0.35 : 1 - (tr.t - 0.35) / 0.35;
    updateFx(dt);
    clearPressed();
    return;
  }
  G.fade = 0;

  if (G.state === 'over' || G.state === 'win') {
    G.overT += dt;
    updateFx(dt);
    const any = Object.values(INPUT).some((s) => s.startP || s.dashP) || keyPressed('Enter');
    if (G.overT > 1.2 && any) toLobby();
    clearPressed();
    return;
  }

  if (G.state !== 'title' && (keyPressed('Escape') || keyPressed('KeyP') || (G.state === 'play' && Object.values(INPUT).some((s) => s.startP))) && G.room.phase !== 'choose') {
    G.paused = !G.paused; sfx('select');
  }
  if (G.paused) { clearPressed(); return; }

  if (G.state === 'title') {
    if (NET.screen === 'join') {
      for (let d = 0; d <= 9; d++) if ((keyPressed('Digit' + d) || keyPressed('Numpad' + d)) && NET.input.length < 4) NET.input += d;
      if (keyPressed('Backspace')) NET.input = NET.input.slice(0, -1);
      if (keyPressed('Enter') && NET.input.length === 4) netJoin(NET.input);
      if (keyPressed('Escape')) NET.screen = 'main';
    } else if (keyPressed('Enter')) enterLobby(false);
    updateFx(dt); clearPressed(); return;
  }
  if (G.state === 'lobby') {
    handleJoin();
    if (G.players.length && (keyPressed('Enter') || Object.values(INPUT).some((s) => s.startP))) startRun();
  }

  if (G.room.phase === 'choose') { updateChoose(dt); updateFx(dt); clearPressed(); return; }

  if (G.hitstop > 0) { G.hitstop -= dt; clearPressed(); return; }

  if (G.state === 'play') G.runTime += dt;
  // スローモーション: 全滅直前
  const allDown = G.players.length && G.players.every((p) => p.state === 'down');
  if (allDown && G.state === 'play') { G.overT += dt; dt *= 0.35; if (G.overT > 0.6) { gameOver(); } }

  for (const p of G.players) p.swing = false;
  // 前のフレームのスイング判定を使う
  for (const p of G.players) { p.swing = p._swing || false; updatePlayer(p, dt); }
  if (G.ball) updateBall(G.ball, dt);
  for (const e of G.enemies) updateEnemy(e, dt);
  // 敵同士の押し合い
  for (let i = 0; i < G.enemies.length; i++)
    for (let j = i + 1; j < G.enemies.length; j++) {
      const a = G.enemies[i], b = G.enemies[j];
      if (a.dead || b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = a.r + b.r;
      if (d < m && d > 0.01) {
        const k = (m - d) / d * 0.5, wa = a.big ? 0.05 : 1, wb = b.big ? 0.05 : 1;
        a.x -= dx * k * wa; a.y -= dy * k * wa; b.x += dx * k * wb; b.y += dy * k * wb;
      }
    }
  const bodies = ropeBodies();
  for (const p of G.players) p.swing = false;
  for (const rp of G.ropes) updateRope(rp, bodies);
  for (const p of G.players) { p._swing = p.swing; afterRopePlayer(p); }
  if (G.ball) collideBody(G.ball);
  chainHits();
  voltPulse(dt);
  if (lv('fire'))
    for (const rp of G.ropes) for (const q of rp.nodes) if (q.sp > 2.2 && Math.random() < 0.08 * lv('fire')) fxEmber(q.x, q.y - 5);

  // 接触ダメージ
  for (const e of G.enemies) {
    if (e.dead || e.type === 'dummy' || e.st === 'intro') continue;
    for (const p of G.players) {
      if (p.state !== 'alive') continue;
      if (e.flying && e.st === 'back') continue;
      if (dist(e.x, e.y, p.x, p.y) < e.r + p.r - 1) {
        if (damagePlayer(p, 1)) { const a = Math.atan2(p.y - e.y, p.x - e.x); p.vx += Math.cos(a) * 160; p.vy += Math.sin(a) * 160; }
      }
    }
  }
  updateBullets(dt);
  updateHazards(dt);
  G.enemies = G.enemies.filter((e) => !e.dead);

  // 蘇生
  for (const p of G.players) {
    if (p.state !== 'down') continue;
    const helpers = G.players.filter((q) => q !== p && q.state === 'alive' && dist(q.x, q.y, p.x, p.y) < 18).length;
    if (helpers) {
      p.revive += dt * helpers * (1 + 0.6 * lv('bond'));
      if (Math.random() < 0.3) part({ type: 'star', x: p.x + rand(-6, 6), y: p.y - rand(0, 8), size: 1, life: 0.3, R: p.col.R.concat([WHITE]), k: 0.3 });
      if (p.revive >= 1.5) {
        p.state = 'alive'; p.hp = Math.min(G.maxHp, 2 + lv('bond')); p.inv = 1.5; p.revive = 0;
        fxRevive(p.x, p.y, p.col.R.concat([WHITE])); sfx('revive');
        addPopup(p.x, p.y - 22, '復活！', p.col.css, 9, 1.2);
      }
    } else p.revive = Math.max(0, p.revive - dt * 0.5);
  }

  // 出現待ち
  for (let i = G.spawnQ.length - 1; i >= 0; i--) {
    const s = G.spawnQ[i];
    s.t -= dt;
    if (s.t <= 0) {
      G.spawnQ.splice(i, 1);
      makeEnemy(s.type, s.x, s.y);
      part({ type: 'flash', x: s.x, y: s.y - 4, size: 4, life: 0.08, R: PAL.void, k: 0.7 });
      part({ type: 'ring', x: s.x, y: s.y, r0: 3, r1: 16, th: 2, life: 0.3, R: PAL.void, k: 0.4 });
      sfx('spawn');
    }
  }

  // 部屋の進行
  const room = G.room;
  if (room.phase === 'fight') {
    const alive = G.enemies.filter((e) => e.type !== 'dummy').length + G.spawnQ.length;
    if (room.kind === 'fight' && room.waves.length && alive <= (room.waves.length ? 1 : 0)) {
      room.waveDelay -= dt;
      if (room.waveDelay <= 0) {
        const w = room.waves.shift();
        w.forEach((t) => queueSpawn(t));
        room.waveDelay = 1.0;
      }
    } else if (!room.waves.length && alive === 0 && G.state === 'play') {
      room.phase = 'cleared'; room.clearT = 0;
      if (room.kind === 'fight') addPopup(160, 90, 'クリア！', '#ffd35a', 14, 1.2);
      sfx('door');
      if (G.players.some((p) => p.hp < G.maxHp) && Math.random() < 0.5) G.pickups.push({ x: 160, y: 100, t: 0, kind: 'heart' });
    }
  } else if (room.phase === 'cleared') {
    room.clearT += dt;
    if (room.clearT > (room.kind === 'boss' ? 2.4 : 1.0)) {
      if (room.kind === 'boss' && G.floor >= 3) { winRun(); }
      else openChoose();
    }
  } else if (room.phase === 'open') {
    room.door = Math.min(1, room.door + dt * 1.5);
    if (Math.random() < 0.5) part({ type: 'ember', x: DOOR_X + rand(-8, 8), y: rand(12, 26), vx: 0, vy: rand(-10, -3), grav: 0, life: 0.6, R: PAL.gold, k: 0.4, seed: rand(0, 9) });
    if (room.door >= 1 && G.players.some((p) => p.state === 'alive' && p.y < ROOM.t + 6 && Math.abs(p.x - DOOR_X) < 13)) nextRoom();
  }

  // 漂うほこり
  if (Math.random() < 0.3) part({ type: 'mote', x: rand(14, 306), y: rand(30, 168), vx: rand(-3, 3), vy: rand(-4, 1), life: rand(2, 4), c: room.theme.floor[4] });

  updateFx(dt);
  clearPressed();
}

function choosePick(i) {
  const c = G.choose;
  if (!c || i == null || i < 0 || i >= c.opts.length) return;
  if (c.sel === i && c.t > 0.4) confirmChoose();
  else { c.sel = i; sfx('select'); }
}
function confirmChoose() {
  const c = G.choose, u = c.opts[c.sel];
  applyUpgrade(u);
  sfx('confirm');
  addPopup(c.who.x, c.who.y - 20, `${u.icon} ${u.name}`, c.who.col.css, 9, 1.5);
  for (const p of G.players) fxRevive(p.x, p.y, PAL.gold);
  G.choose = null;
  G.room.phase = 'open';
  sfx('door');
}
function updateChoose(dt) {
  const c = G.choose;
  c.t += dt;
  const s = INPUT[c.who.dev] || {};
  if (s.pick != null) { choosePick(s.pick); return; }
  if (s.leftP) { c.sel = (c.sel + c.opts.length - 1) % c.opts.length; sfx('select'); }
  if (s.rightP) { c.sel = (c.sel + 1) % c.opts.length; sfx('select'); }
  if (c.t > 0.5 && s.dashP) confirmChoose();
}
