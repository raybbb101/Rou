'use strict';
// =====================================================================
//  render.js — 世界の描画・UI・メインループ
// =====================================================================

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const low = document.createElement('canvas');
low.width = W; low.height = H;
const lctx = low.getContext('2d');
const IMG = lctx.createImageData(W, H);
const OUT = new Uint32Array(IMG.data.buffer);
let S = 1, OX = 0, OY = 0, SHX = 0, SHY = 0;
const FONT = '"DotGothic16", "Hiragino Kaku Gothic ProN", "Yu Gothic", monospace';

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(innerWidth * dpr); canvas.height = Math.floor(innerHeight * dpr);
  canvas.style.width = innerWidth + 'px'; canvas.style.height = innerHeight + 'px';
  S = Math.min(canvas.width / W, canvas.height / H);
  if (S >= 2) S = Math.floor(S);
  OX = Math.floor((canvas.width - W * S) / 2); OY = Math.floor((canvas.height - H * S) / 2);
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- 世界
function drawTorch(x, y) {
  const t = G.time, R = PAL.flame;
  px(x, y + 1, PAL.iron[3]); px(x - 1, y + 1, PAL.iron[2]); px(x + 1, y + 1, PAL.iron[2]);
  px(x, y + 2, PAL.iron[1]); px(x, y + 3, PAL.iron[1]); px(x, y + 4, PAL.iron[2]);
  for (let j = 0; j < 8; j++) {
    const f = j / 8, w = Math.pow(1 - f, 0.8) * 2.3 + (vnoise(j * 0.7, t * 9 + x) - 0.5) * 1.4 * f;
    const sway = (vnoise(j * 0.35, t * 5 + x * 0.1 + 9) - 0.5) * j * 0.5;
    for (let i = -Math.ceil(w); i <= Math.ceil(w); i++) {
      if (Math.abs(i) > w) continue;
      const heat = (1 - f * 0.95) - (Math.abs(i) / (w + 0.6)) * 0.55 + (vnoise(i * 0.8, j * 0.8 - t * 12, x) - 0.5) * 0.3;
      if (heat < 0.12) continue;
      px(x + i + sway, y - j, rAt(R, heat));
    }
  }
  const fl = 0.85 + vnoise(t * 7, x) * 0.3;
  glowDisc(x, y - 3, 13, R[4], 0.38 * fl);
  illum(x, y + 8, 78, 0.5 * fl);
}

function drawDoor() {
  const room = G.room, R = PAL.iron, open = room.door;
  if (open > 0) {
    const t = G.time;
    glowDisc(DOOR_X, 17, 20, PAL.gold[3], 0.45 * open);
    for (let k = 0; k < 46; k++) {
      const a = t * 2.4 + k * 0.62, r = (k % 9) + 1 + Math.sin(t * 3 + k) * 0.6;
      const x = DOOR_X + Math.cos(a) * r * 0.95, y = 18 + Math.sin(a) * r * 0.85;
      px(x, y, rAt(PAL.gold, 1 - r / 11));
    }
    illum(DOOR_X, 30, 60, 0.6 * open);
  }
  const top = 8, lift = Math.round(open * 18);
  for (let i = 0; i < 4; i++) {
    const bx = DOOR_X - 8 + i * 5;
    for (let y = top; y <= 25 - lift; y++) { px(bx, y, R[3]); px(bx + 1, y, R[1]); }
    if (25 - lift >= top) { px(bx, 26 - lift, R[4]); }
  }
  if (lift < 14) for (let x = DOOR_X - 9; x <= DOOR_X + 9; x++) { px(x, 14 - lift, R[2]); px(x, 15 - lift, R[1]); }
}

function drawPillar(p) {
  const Wr = G.room.theme.wall, top = p.y - 22, r = p.r;
  for (let y = top; y <= p.y; y++) {
    const w = y === p.y ? r - 1 : r;
    for (let x = -w; x <= w; x++) {
      const xx = x / r;
      let k = xx < -0.55 ? 4 : xx < -0.05 ? 3 : xx < 0.55 ? 2 : 1;
      if ((y - top) % 7 === 6) k--;
      if (Math.abs(xx) > 0.9) k = 0;
      if (hash2(p.x + x, y, 3) > 0.93) k = Math.max(0, k - 1);
      px(p.x + x, y, Wr[clamp(k, 0, Wr.length - 1)]);
    }
  }
  for (let x = -r; x <= r; x++) px(p.x + x, p.y + 1, Wr[0]);
  ellipseFill(p.x, top, r + 0.5, (r + 0.5) * 0.45, Wr[3]);
  ellipseFill(p.x - 1, top - 0.5, r * 0.6, r * 0.25, Wr[5] || Wr[4]);
  for (let x = -r; x <= r; x++) if (Math.abs(x) >= r - 1) px(p.x + x, top, Wr[1]);
}

function drawPlayer(p) {
  const x = Math.round(p.x), y = Math.round(p.y);
  if (p.state === 'falling') {
    const s = Math.max(0.1, 1 - p.fallT / 0.5);
    drawTpl(HERO_A, p.cmap, Math.round(x - 5 * s), Math.round(y - 12 * s + (1 - s) * 6), { scale: s, flip: ((p.fallT * 12) | 0) % 2 === 1, alpha: s + 0.2 });
    return;
  }
  if (p.state === 'down') {
    drawTpl(HERO_A, p.cmap, x - 6, y - 8, { rot: true, tint: hex('#6a6478'), tintK: 0.6 });
    const bob = Math.sin(G.time * 3 + p.idx) * 2;
    for (let i = 0; i < 3; i++) pxa(x + Math.sin(G.time * 4 + i) * 1.5, y - 14 - i * 2 + bob, p.col.R[3], 0.8 - i * 0.2);
    glowDisc(x, y - 14 + bob, 6, p.col.R[3], 0.35);
    illum(x, y - 4, 26, 0.35);
    if (p.revive > 0) {
      const f = p.revive / 1.5;
      for (let a = 0; a < TAU * f; a += 0.08) px(x + Math.cos(a - Math.PI / 2) * 11, y - 4 + Math.sin(a - Math.PI / 2) * 8, p.col.R[3]);
    }
    return;
  }
  const blink = p.inv > 0 && p.dashT <= 0 && ((G.time * 16) | 0) % 2 === 0;
  const moving = Math.hypot(p.vx, p.vy) > 8;
  const frame = moving && ((p.walk / 6) | 0) % 2 ? HERO_B : HERO_A;
  const bob = moving && ((p.walk / 6) | 0) % 2 ? -1 : 0;
  if (p.anchor) {
    const pulse = 0.5 + 0.5 * Math.sin(G.time * 10);
    ring(x, y, 8 + pulse, 1, p.col.R[3], 0.8, 0.55);
    glowDisc(x, y, 12, p.col.R[3], 0.25);
    for (let j = 0; j < 4; j++) px(x + p.face * 5, y - j + 1, PAL.iron[j === 3 ? 4 : 2]);
  }
  if (!blink) drawTpl(frame, p.cmap, x - 5, y - 12 + bob + (p.anchor ? 1 : 0), { flip: p.face < 0, tint: p.dashT > 0 ? p.col.R[3] : null, tintK: 0.4 });
  // 名札の三角
  px(x, y - 15, p.col.R[3]); px(x - 1, y - 16, p.col.R[3]); px(x + 1, y - 16, p.col.R[3]); px(x, y - 16, p.col.R[2]);
  // ヘッドランプ
  const lx = x + (p.face < 0 ? -5 : 4), ly = y - 10 + bob;
  glowPx(lx, ly, hex('#fff2b0'), 0.8);
  glowDisc(lx, ly, 4, hex('#ffe9a0'), 0.25);
  illum(x, y - 6, 34, 0.55);
  illumCone(lx, ly, p.aim, 100, 0.55, 0.75);
  // ダッシュ再使用バー
  if (p.dashCd > 0) {
    const cd = 0.7 * Math.pow(0.75, lv('swift')), f = 1 - p.dashCd / cd;
    for (let i = 0; i < 8; i++) px(x - 4 + i, y + 3, i < f * 8 ? p.col.R[3] : PAL.iron[1]);
  }
}

function drawBall(b) {
  const x = b.x, y = b.y - 5;
  shadedBlob(x, y, 5, 5, PAL.iron);
  for (let i = 0; i < 4; i++) {
    const a = b.spin + (i / 4) * TAU;
    px(x + Math.cos(a) * 6, y + Math.sin(a) * 6, PAL.iron[4]);
  }
}

function drawEnemy(e) {
  const R = enemyRamp(e), fl = e.flash > 0, x = e.x, y = e.y;
  const tint = e.slow > 0 ? PAL.frost[4] : e.burn > 0 ? PAL.flame[3] : null;
  switch (e.type) {
    case 'gumi': case 'bigGumi': {
      const sq = e.squash || 0, rx = e.r * (1 + sq), ry = e.r * 0.82 * (1 - sq);
      const cy = y - ry - e.z;
      shadedBlob(x, cy, rx, ry, R, { flash: fl });
      if (!fl) {
        const ex = x + e.face * rx * 0.35;
        px(ex - 1, cy - 1, INK); px(ex + 2, cy - 1, INK);
        px(ex - 1, cy - 2, WHITE); px(ex + 2, cy - 2, WHITE);
        if (e.type === 'bigGumi') { px(x - 2, cy + 2, R[1]); px(x - 1, cy + 3, R[1]); px(x + 1, cy + 2, R[1]); }
        if (tint) { for (let i = 0; i < 3; i++) px(x + rand(-rx, rx), cy + rand(-ry, ry), tint); }
      }
      glowDisc(x, cy, e.r + 2, R[3], 0.08);
      break;
    }
    case 'bat': {
      const cy = y - 11 + Math.sin(e.t * 6) * 2, flap = Math.sin(e.t * 22);
      for (let k = 1; k <= 6; k++) {
        const wy = cy - flap * k * 0.6 + (k > 4 ? 1 : 0);
        px(x - 2 - k, wy, fl ? WHITE : R[k < 3 ? 2 : 1]); px(x + 2 + k, wy, fl ? WHITE : R[k < 3 ? 2 : 1]);
        if (k < 5) { px(x - 2 - k, wy + 1, R[0]); px(x + 2 + k, wy + 1, R[0]); }
      }
      shadedBlob(x, cy, 3, 3, R, { flash: fl });
      px(x - 1, cy - 4, R[2]); px(x + 1, cy - 4, R[2]);
      px(x - 1, cy, hex('#ff4a4a')); px(x + 1, cy, hex('#ff4a4a'));
      glowPx(x - 1, cy, hex('#ff3030'), 0.6); glowPx(x + 1, cy, hex('#ff3030'), 0.6);
      break;
    }
    case 'spitter': {
      const B = PAL.bone, ch = e.st === 'charge' ? 1 - e.stT / 0.65 : 0, sh = ch > 0.5 ? rand(-1, 1) : 0;
      rectFill(x - 2, y - 5, 4, 5, fl ? WHITE : B[3]); rectFill(x + 1, y - 5, 1, 5, B[2]); rectFill(x - 2, y - 5, 1, 5, B[4]);
      shadedBlob(x + sh, y - 9, 6.5, 4.5, R, { flash: fl });
      for (let i = -4; i <= 4; i += 3) px(x + i + sh, y - 11, R[5]);
      const mx = x + sh, my = y - 7;
      px(mx - 1, my, INK); px(mx, my, INK); px(mx + 1, my, INK);
      if (ch > 0) { px(mx, my, rAt(R, ch)); glowDisc(mx, my, 3 + ch * 7, R[4], 0.6 * ch); illum(mx, my, 30, ch * 0.5); }
      break;
    }
    case 'beetle': {
      const a = e.st === 'aim' || e.st === 'charge' ? e.dir : Math.atan2(e.vy, e.vx || 0.001);
      const fx = Math.cos(a), fy = Math.sin(a), cy = y - 4;
      if (e.st === 'aim') {
        const blink = ((G.time * 20) | 0) % 2;
        for (let i = 8; i < 90; i += 2) pxa(x + fx * i, y + fy * i, PAL.blood[4], blink ? 0.9 : 0.4);
      }
      for (let k = -1; k <= 1; k++) {
        const lg = Math.sin(e.t * 18 + k) > 0 ? 1 : 0;
        px(x - 7, cy + k * 2 + lg, R[0]); px(x + 7, cy + k * 2 - lg, R[0]);
      }
      shadedBlob(x, cy, 6.5, 4.8, R, { flash: fl });
      if (!fl) for (let i = -3; i <= 3; i++) px(x - fy * i * 0.2, cy + i * 0.3 - 1, R[1]);
      const hx = x + fx * 7, hy = cy + fy * 5;
      line(hx, hy, hx + fx * 4, hy + fy * 3 - 2, PAL.bone[4]);
      px(hx + fx * 4, hy + fy * 3 - 2, WHITE);
      const red = e.st === 'aim' || e.st === 'charge';
      px(hx - fy, hy - 1, red ? hex('#ff5050') : INK); if (red) glowPx(hx - fy, hy - 1, hex('#ff3030'), 0.8);
      if (e.st === 'stun') stars(x, cy - 9);
      break;
    }
    case 'crab': {
      const cy = y - 5, a = e.faceA;
      for (let k = 0; k < 3; k++) {
        const lg = Math.sin(e.t * 14 + k * 2) > 0 ? 1 : 0;
        px(x - 8 + lg, cy + 2 + k, R[1]); px(x + 8 - lg, cy + 2 + k, R[1]);
      }
      shadedBlob(x, cy, 7, 5, R, { flash: fl });
      px(x - 2, cy - 6, INK); px(x + 2, cy - 6, INK); px(x - 2, cy - 5, R[3]); px(x + 2, cy - 5, R[3]);
      // 盾
      for (let o = -1.0; o <= 1.0; o += 0.08) {
        const sa = a + o, sx = x + Math.cos(sa) * 10, sy = cy + Math.sin(sa) * 7;
        px(sx, sy, Math.abs(o) < 0.3 ? PAL.iron[5] : PAL.iron[3]);
        px(sx + Math.cos(sa), sy + Math.sin(sa) + 1, PAL.iron[1]);
      }
      if (tint) px(x, cy, tint);
      break;
    }
    case 'golem': drawBoss(e); break;
    case 'dummy': {
      const B = PAL.dust, wob = e.lastHit < 0.4 ? Math.sin(e.lastHit * 40) * (0.4 - e.lastHit) * 6 : 0;
      rectFill(x - 1, y - 6, 2, 6, PAL.bone[2]);
      shadedBlob(x + wob, y - 11, 5, 6, B, { flash: fl });
      line(x - 7 + wob, y - 12, x + 7 + wob, y - 12, PAL.bone[3]);
      px(x - 2 + wob, y - 13, INK); px(x + 2 + wob, y - 13, INK);
      line(x - 2 + wob, y - 9, x + 2 + wob, y - 9, B[1]);
      break;
    }
  }
  // 体力バー
  if (!ETYPES[e.type].boss && e.type !== 'dummy' && e.hp < e.maxHp) {
    const w = e.r * 2, f = clamp(e.hp / e.maxHp);
    const by = y - e.r * 2 - (e.type === 'bat' ? 14 : 6);
    for (let i = 0; i < w; i++) px(x - e.r + i, by, i < f * w ? hex('#e85a4a') : hex('#2a1418'));
  }
}

function stars(x, y) {
  for (let i = 0; i < 3; i++) {
    const a = G.time * 6 + (i / 3) * TAU;
    const sx = x + Math.cos(a) * 6, sy = y + Math.sin(a) * 2;
    px(sx, sy, PAL.gold[5]); px(sx + 1, sy, PAL.gold[3]); px(sx - 1, sy, PAL.gold[3]); px(sx, sy - 1, PAL.gold[3]); px(sx, sy + 1, PAL.gold[3]);
    glowPx(sx, sy, PAL.gold[4], 0.5);
  }
}

function drawBoss(e) {
  const R = PAL.stone, C = e.enraged ? PAL.blood : G.room.theme.core, fl = e.flash > 0;
  const x = e.x, y = e.y;
  let rise = 0;
  if (e.st === 'intro') rise = clamp(e.stT / 1.4) * 30;
  const wind = e.st === 'slamW' ? 1 - e.stT / 0.85 : 0;
  const shk = (e.st === 'chargeW' || wind > 0.6) ? rand(-1, 1) : 0;
  const bx = x + shk, by = y - 14 + rise;
  if (rise > 0) { // 地面から這い出る
    for (let i = 0; i < 2; i++) fxDust(x + rand(-14, 14), y, 1, 2);
  }
  // 予告
  if (e.st === 'slamW') {
    const r = (e.enraged ? 92 : 76) * ease.outCubic(wind);
    ring(x, y, r, 1, C[4], ((G.time * 14) | 0) % 2 ? 0.9 : 0.4);
  }
  if (e.st === 'chargeW') {
    const fx = Math.cos(e.dir), fy = Math.sin(e.dir);
    for (let i = 18; i < 150; i += 3) pxa(x + fx * i, y + fy * i, PAL.blood[4], ((G.time * 18) | 0) % 2 ? 0.9 : 0.35);
  }
  // 足
  shadedBlob(x - 8, y - 3 + rise, 5, 3.5, R, { flash: fl, noSpec: true });
  shadedBlob(x + 8, y - 3 + rise, 5, 3.5, R, { flash: fl, noSpec: true });
  // 腕 (叩きつけの溜めで上がる)
  const armY = by + 2 - wind * 12;
  shadedBlob(bx - 16, armY, 5, 7, R, { flash: fl });
  shadedBlob(bx + 16, armY, 5, 7, R, { flash: fl });
  // 体
  shadedBlob(bx, by, 15, 13, R, { flash: fl });
  if (!fl) {
    // 体に食い込んだ鎖
    for (let i = -10; i <= 10; i++) {
      const cx = bx + i, cy = by + 3 + Math.round(Math.sin(i * 0.3) * 1.5);
      px(cx, cy, i % 3 === 0 ? PAL.iron[2] : PAL.iron[4]);
    }
    // ひび
    line(bx - 9, by - 7, bx - 5, by - 3, R[1]); line(bx + 6, by - 9, bx + 9, by - 4, R[1]);
    // 核の目
    const pulse = 0.7 + 0.3 * Math.sin(G.time * (e.enraged ? 12 : 5));
    const ey = by - 4;
    ellipseFill(bx, ey, 4, 3, C[1]);
    ellipseFill(bx, ey, 3, 2, C[3]);
    px(bx, ey, C[5]); px(bx - 1, ey, C[4]); px(bx + 1, ey, C[4]);
    glowDisc(bx, ey, 14, C[4], 0.55 * pulse);
    illum(bx, ey, 46, 0.5 * pulse);
  }
  if (e.st === 'stun') stars(bx, by - 18);
  if (e.st === 'bound') {
    stars(bx, by - 18);
    for (let i = 0; i < 2; i++) ring(bx, by + 2 - i * 8, 15 - i * 2, 1, PAL.gold[4 + (((G.time * 10) | 0) + i) % 2], 1, 0.4);
    glowDisc(bx, by, 26, PAL.gold[3], 0.35);
  }
}

function drawHazards() {
  for (const h of G.hazards) {
    if (h.type === 'rock') {
      if (h.t < 0) continue;
      const u = clamp(h.t / h.dur);
      const blink = ((G.time * 16) | 0) % 2;
      ring(h.x, h.y, h.r * (1.2 - 0.2 * u), 1, PAL.blood[4], blink ? 0.9 : 0.5, 0.65);
      ellipseBlend(h.x, h.y, h.r * u, h.r * 0.65 * u, PAL.blood[2], 0.35);
      shadow(h.x, h.y, 2 + u * 5, 1 + u * 3, 0.5);
      if (u > 0.55) {
        const hh = (1 - (u - 0.55) / 0.45) * 110;
        shadedBlob(h.x, h.y - 5 - hh, 4.5, 4, PAL.stone);
        for (let i = 1; i < 6; i++) pxa(h.x, h.y - 10 - hh - i * 3, PAL.stone[3], 0.5 - i * 0.08);
      }
    }
  }
}

function drawPickup(k) {
  if (k.t > 11 && ((G.time * 10) | 0) % 2) return;
  const bob = Math.sin(k.t * 4) * 1.5, x = Math.round(k.x), y = Math.round(k.y - 7 + bob);
  const hp = ['.rr.rr.', 'rWrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'];
  drawTpl(hp, { r: hex('#e0413f'), W: hex('#ffd0c8') }, x - 3, y - 3);
  glowDisc(x, y, 8, hex('#ff5050'), 0.3);
}

function drawBullet(b) {
  const R = b.R;
  discFill(b.x, b.y, 3, R[3]);
  discFill(b.x, b.y, 2, R[4]);
  px(b.x, b.y, WHITE); px(b.x - 1, b.y - 1, R[5]);
  glowDisc(b.x, b.y, 9, R[4], 0.55);
  illum(b.x, b.y, 24, 0.35);
}

function drawRope(rp) {
  const n = rp.nodes, Lr = G.chainLen;
  const straight = dist(n[0].x, n[0].y, n[ROPE_NODES - 1].x, n[ROPE_NODES - 1].y);
  const slack = clamp(1 - straight / Lr);
  const hgt = (i) => Math.max(0, 5 * (1 - slack * 1.25 * Math.sin((Math.PI * i) / (ROPE_NODES - 1))));
  const gold = rp.bindGlow > 0, R = gold ? PAL.gold : PAL.iron;
  const pts = [];
  for (let i = 0; i < ROPE_NODES - 1; i++) {
    const p = n[i], q = n[i + 1], len = Math.hypot(q.x - p.x, q.y - p.y), steps = Math.max(1, Math.ceil(len));
    const h0 = hgt(i), h1 = hgt(i + 1);
    for (let k = 0; k < steps; k++) {
      const f = k / steps;
      pts.push([lerp(p.x, q.x, f), lerp(p.y, q.y, f), lerp(h0, h1, f), (q.x - p.x) / (len || 1), (q.y - p.y) / (len || 1), lerp(p.sp, q.sp, f)]);
    }
  }
  // 影
  for (const [x, y] of pts) blendPx(x, y + 1, INK, 0.4);
  // 振り回した時の残像
  for (let i = 1; i < ROPE_NODES - 1; i++) {
    const q = n[i];
    if (q.sp > 2.4) {
      const h = hgt(i), k = Math.min(4, Math.floor(q.sp));
      for (let j = 1; j <= k; j++) pxa(lerp(q.x, q.px, j / k * 1.6), lerp(q.y, q.py, j / k * 1.6) - h, R[2], 0.55 - j * 0.1);
    }
  }
  // 輪っか模様: 正面を向いた輪 (穴あき) と 横を向いた輪 を交互に
  for (let s = 0; s < pts.length; s++) {
    const [x, y, h, dx, dy] = pts[s];
    const yy = y - h, li = Math.floor(s / 3), m = s % 3;
    const ox = Math.round(-dy), oy = Math.round(dx);
    if (li % 2 === 0) {
      if (m === 1) { px(x + ox, yy + oy, R[4]); px(x - ox, yy - oy, R[2]); }
      else px(x, yy, R[3]);
    } else px(x, yy, m === 1 ? R[5] : R[3]);
    // 暗闇でも鎖が見えるよう、ほんのり光らせる
    glowPx(x, yy, R[4], gold ? 0.4 : 0.1 + Math.min(0.3, pts[s][5] * 0.06));
  }
  if (lv('volt') && G.voltT > (1.7 - 0.3 * (lv('volt') - 1)) - 0.25) {
    for (let i = 0; i < 4; i++) { const p = pick(pts); glowPx(p[0], p[1] - p[2], PAL.volt[4], 0.9); px(p[0], p[1] - p[2], PAL.volt[5]); }
  }
  if (lv('ice') && Math.random() < 0.3) { const p = pick(pts); px(p[0], p[1] - p[2] - 1, PAL.frost[4]); }
}

function renderWorld() {
  const room = G.room;
  COL.set(room.bg);
  ILL.fill(0);
  if (room.hasGlow) { const k = 0.8 + 0.2 * Math.sin(G.time * 2.2); for (let i = 0; i < GLW.length; i++) GLW[i] = room.bgGlow[i] * k; }
  else GLW.fill(0);
  for (const tx of room.torches) drawTorch(tx, 15);
  drawDoor();
  drawHazards();
  // 影
  for (const p of G.players) if (p.state !== 'falling') shadow(p.x, p.y, 5, 2);
  for (const e of G.enemies) shadow(e.x, e.y, e.r * (e.big ? 1.2 : 1), e.r * 0.45, e.flying ? 0.3 : 0.45);
  if (G.ball) shadow(G.ball.x, G.ball.y, 5, 2);
  for (const p of room.pillars) shadow(p.x + 3, p.y + 1, p.r + 2, p.r * 0.5, 0.5);
  drawFx('ground');
  const items = [];
  for (const p of room.pillars) items.push([p.y, () => drawPillar(p)]);
  for (const e of G.enemies) items.push([e.y, () => drawEnemy(e)]);
  for (const p of G.players) items.push([p.y + 0.5, () => drawPlayer(p)]);
  if (G.ball) items.push([G.ball.y, () => drawBall(G.ball)]);
  for (const k of G.pickups) items.push([k.y, () => drawPickup(k)]);
  items.sort((a, b) => a[0] - b[0]);
  for (const it of items) it[1]();
  for (const rp of G.ropes) drawRope(rp);
  for (const b of G.bullets) drawBullet(b);
  drawFx('top');
  composite(OUT, room.kind === 'lobby' ? 0.5 : room.theme.ambient);
}

// ---------------------------------------------------------------- UI (高解像度で文字を描く)
function T(text, x, y, size, col, align = 'left', alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.font = `${Math.round(size * S)}px ${FONT}`;
  ctx.textAlign = align; ctx.textBaseline = 'top';
  ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, S * 0.9); ctx.strokeStyle = '#0b0910';
  const sx = OX + x * S, sy = OY + y * S;
  ctx.strokeText(text, sx, sy);
  ctx.fillStyle = col; ctx.fillText(text, sx, sy);
  ctx.globalAlpha = 1;
}
function box(x, y, w, h, fill, stroke, lw = 1) {
  ctx.fillStyle = fill; ctx.fillRect(OX + x * S, OY + y * S, w * S, h * S);
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw * S; ctx.strokeRect(OX + x * S + lw * S / 2, OY + y * S + lw * S / 2, w * S - lw * S, h * S - lw * S); }
}
const HEART = ['.xx.xx.', 'xxxxxxx', 'xxxxxxx', '.xxxxx.', '..xxx..', '...x...'];
function heart(x, y, full, col) {
  for (let j = 0; j < 6; j++) for (let i = 0; i < 7; i++) if (HEART[j][i] === 'x') {
    ctx.fillStyle = full ? (j === 1 && i === 1 ? '#ffd0c8' : col) : '#3a1d24';
    ctx.fillRect(OX + (x + i) * S, OY + (y + j) * S, Math.ceil(S), Math.ceil(S));
  }
}

function drawHUD() {
  G.players.forEach((p, i) => {
    const x = 4 + i * 78;
    T(p.col.name, x, 0.5, 7, p.col.css);
    for (let k = 0; k < G.maxHp; k++) heart(x + 12 + k * 7.5, 1.5, k < p.hp, p.state === 'down' ? '#6a6478' : '#e0413f');
  });
  if (G.state === 'play' || G.state === 'over' || G.state === 'win') {
    const th = G.room.theme;
    T(`第${G.floor}層 ${th.name}  ${G.roomIdx === 5 ? 'ボス' : `${G.roomIdx}/4`}`, 12, 172, 7, '#d8cfb8');
    const ups = UPG.filter((u) => lv(u.id)).map((u) => `${u.icon}${lv(u.id)}`).join(' ');
    T(ups, 308, 172, 7, '#ffe9a0', 'right');
  }
  // ボスの体力
  const boss = G.enemies.find((e) => e.type === 'golem');
  if (boss && boss.st !== 'intro') {
    const w = 150, x = 85, y = 33, f = clamp(boss.hp / boss.maxHp);
    box(x - 1, y - 1, w + 2, 6, '#0b0910');
    box(x, y, w, 4, '#3a1418');
    box(x, y, w * f, 4, boss.st === 'bound' ? '#ffd35a' : boss.enraged ? '#ff4a3a' : '#e8783a');
    T(boss.name, 160, y + 5, 7, '#ffd8c0', 'center');
  }
  if (G.room.phase === 'open' && G.state === 'play') {
    const a = 0.6 + 0.4 * Math.sin(G.time * 6);
    T('▲ 出口が開いた！', 160, 28, 7, '#ffe066', 'center', a);
  }
}

function drawPopups() {
  for (const p of G.popups) {
    const u = p.t / p.life, pop = 1 + 0.6 * Math.max(0, 1 - p.t / 0.08);
    T(p.text, p.x, p.y - ease.outCubic(u) * 12, p.size * pop, p.col, 'center', u > 0.7 ? (1 - u) / 0.3 : 1);
  }
}

function drawBanner() {
  const b = G.banner; if (!b) return;
  const a = b.t < 0.3 ? b.t / 0.3 : b.t > 2.1 ? Math.max(0, (2.6 - b.t) / 0.5) : 1;
  const slide = (1 - ease.outCubic(b.t / 0.4)) * 20;
  ctx.globalAlpha = a * 0.6; box(0, 70, 320, 34, '#000'); ctx.globalAlpha = 1;
  T(b.sub, 160 - slide, 73, 8, '#d8cfb8', 'center', a);
  T(b.title, 160 + slide, 84, 15, b.col, 'center', a);
}

function drawLobby() {
  const t = G.time;
  T('鎖の探索隊', 160, 34 + Math.sin(t * 2) * 1.5, 22, '#ffd35a', 'center');
  T('CHAIN EXPEDITION', 160, 58, 8, '#c9b48a', 'center');
  const slots = 4, w = 72;
  for (let i = 0; i < slots; i++) {
    const x = 160 - (slots * (w + 4) - 4) / 2 + i * (w + 4), y = 140;
    const p = G.players.find((q) => q.idx === i);
    box(x, y, w, 24, p ? 'rgba(20,16,28,0.85)' : 'rgba(10,8,14,0.6)', p ? p.col.css : '#3a3444');
    if (p) {
      T(`${p.col.name} 参加中`, x + w / 2, y + 3, 8, p.col.css, 'center');
      T(DEV_LABEL[p.dev] || p.dev, x + w / 2, y + 13, 6.5, '#cfc6d8', 'center');
    } else {
      const a = 0.5 + 0.5 * Math.sin(t * 4 + i);
      T(`${PCOL[i].name}`, x + w / 2, y + 3, 8, '#6d6578', 'center');
      T('ダッシュボタンで参加', x + w / 2, y + 13, 6, '#8d8597', 'center', 0.5 + a * 0.5);
    }
  }
  T('左: WASD移動 F ダッシュ G アンカー   右: 矢印 . ダッシュ / アンカー   パッド: A ダッシュ B アンカー', 160, 126, 6, '#a99fb4', 'center');
  if (G.players.length) {
    const a = 0.6 + 0.4 * Math.sin(t * 5);
    T(G.players.length === 1 ? 'Enter / START で出発 (1人なら鉄球が相棒)' : `Enter / START で ${G.players.length}人で出発！`, 160, 112, 8, '#ffe9a0', 'center', a);
  }
  if (G.best) T(`最高記録: ${G.best.win ? '踏破！' : `第${G.best.floor}層 ${G.best.room === 5 ? 'ボス' : G.best.room + '部屋'}`} (${G.best.np}人)`, 316, 172, 6.5, '#bfb39a', 'right');
  T('アンカー(長押し)で踏ん張り、仲間を振り回して鎖で切り裂け！ 人形で練習できるよ', 12, 172, 6.5, '#9a8fa8');
}

function wrapText(text, maxW, size) {
  ctx.font = `${Math.round(size * S)}px ${FONT}`;
  const lines = []; let cur = '';
  for (const ch of text) {
    if (ctx.measureText(cur + ch).width > maxW * S) { lines.push(cur); cur = ch; } else cur += ch;
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawChoose() {
  const c = G.choose; if (!c) return;
  const a = Math.min(1, c.t / 0.25);
  ctx.globalAlpha = 0.7 * a; box(0, 0, 320, 180, '#06040a'); ctx.globalAlpha = 1;
  T('強化を選ぼう', 160, 16, 12, '#ffd35a', 'center', a);
  T(`選ぶ人: ${c.who.col.name}  — みんなで相談してね！`, 160, 32, 8, c.who.col.css, 'center', a);
  const w = 90, gap = 8;
  c.opts.forEach((u, i) => {
    const x = 160 - (3 * w + 2 * gap) / 2 + i * (w + gap), sel = i === c.sel;
    const y = 48 - (sel ? 4 : 0) + (1 - ease.outBack(clamp((c.t - i * 0.06) / 0.3))) * 30;
    box(x, y, w, 100, sel ? 'rgba(40,30,50,0.97)' : 'rgba(20,16,28,0.92)', sel ? c.who.col.css : '#4a4256', sel ? 2 : 1);
    T(u.icon, x + w / 2, y + 8, 16, '#fff', 'center');
    T(u.name, x + w / 2, y + 30, 9, sel ? '#fff' : '#d8cfe0', 'center');
    T(`Lv ${lv(u.id)} → ${lv(u.id) + 1}`, x + w / 2, y + 43, 7, '#ffd35a', 'center');
    wrapText(u.desc, w - 10, 6.5).forEach((ln, k) => T(ln, x + 5, y + 55 + k * 9, 6.5, '#bdb2c8'));
  });
  T('← → で選んで、ダッシュボタンで決定', 160, 158, 7, '#cfc6d8', 'center', 0.7 + 0.3 * Math.sin(G.time * 5));
}

function drawEnd() {
  const win = G.state === 'win', a = Math.min(1, G.overT / 0.8);
  ctx.globalAlpha = 0.75 * a; box(0, 0, 320, 180, win ? '#0e0a02' : '#0a0206'); ctx.globalAlpha = 1;
  T(win ? '深淵を踏破した！' : '探索隊、全滅…', 160, 34, 18, win ? '#ffd35a' : '#ff6b5a', 'center', a);
  const st = G.stats, m = Math.floor(G.runTime / 60), s = Math.floor(G.runTime % 60);
  const lines = [
    `到達: 第${G.floor}層 ${G.roomIdx === 5 ? 'ボス部屋' : `${G.roomIdx}部屋目`}`,
    `時間: ${m}分${String(s).padStart(2, '0')}秒`,
    `撃破: ${st.kills}   バインド: ${st.binds}   落下: ${st.falls}   ダウン: ${st.downs}`,
    `強化: ${UPG.filter((u) => lv(u.id)).map((u) => `${u.icon}${u.name}${lv(u.id)}`).join(' ') || 'なし'}`,
  ];
  lines.forEach((l, i) => T(l, 160, 70 + i * 14, i === 3 ? 6.5 : 8, '#e0d6c8', 'center', a));
  if (G.newBest) T('★ 最高記録更新！', 160, 128, 9, '#ffe066', 'center', a);
  if (G.overT > 1.2) T('Enter / ダッシュ でロビーへ', 160, 146, 8, '#cfc6d8', 'center', 0.6 + 0.4 * Math.sin(G.time * 5));
}

function render() {
  renderWorld();
  lctx.putImageData(IMG, 0, 0);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  SHX = G.shake > 0 ? Math.round(rand(-G.shake, G.shake)) * S : 0;
  SHY = G.shake > 0 ? Math.round(rand(-G.shake, G.shake)) * S : 0;
  ctx.drawImage(low, OX + SHX, OY + SHY, W * S, H * S);
  drawHUD();
  drawPopups();
  if (G.state === 'lobby') drawLobby();
  drawBanner();
  drawChoose();
  if (G.state === 'over' || G.state === 'win') drawEnd();
  if (G.paused) { ctx.globalAlpha = 0.6; box(0, 0, 320, 180, '#000'); ctx.globalAlpha = 1; T('ポーズ中', 160, 76, 16, '#fff', 'center'); T('Esc / P / START で再開', 160, 98, 8, '#cfc6d8', 'center'); }
  if (G.fade > 0) { ctx.globalAlpha = clamp(G.fade); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.globalAlpha = 1; }
}

// ---------------------------------------------------------------- ループ
recalc();
loadRoom(1, 0);
let last = performance.now(), acc = 0;
function loop(now) {
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.1) dt = 0.1;
  acc += dt;
  let n = 0;
  while (acc >= STEP && n++ < 6) { update(STEP); acc -= STEP; }
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
