'use strict';
// =====================================================================
//  fx.js — オリジナルのピクセルエフェクト
//  ルール: 速く出て遅く消える / 最初の1〜2フレームだけ白く光る /
//          色はランプの段で塗る / 柔らかいのは光と煙だけ / 最後は何も残さない
// =====================================================================

const PARTS = [];
const FXO = [];

function part(o) {
  const p = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, life: 0.4, type: 'spark', drag: 0, grav: 0, size: 1, R: PAL.spark, k: 0.6, c: 0 };
  for (const k in o) p[k] = o[k];
  PARTS.push(p);
  return p;
}
function fxObj(o) { o.t = 0; FXO.push(o); return o; }

function updateFx(dt) {
  for (let i = PARTS.length - 1; i >= 0; i--) {
    const p = PARTS[i];
    p.t += dt;
    if (p.t >= p.life) { PARTS[i] = PARTS[PARTS.length - 1]; PARTS.pop(); continue; }
    const dr = Math.max(0, 1 - p.drag * dt);
    p.vx *= dr; p.vy *= dr;
    if (p.type === 'bit') {
      p.vz -= p.grav * dt; p.z += p.vz * dt;
      if (p.z < 0) {
        p.z = 0; p.vz = -p.vz * 0.42; p.vx *= 0.55; p.vy *= 0.55;
        if (Math.abs(p.vz) < 25) p.vz = 0;
      }
      if (p.z === 0 && p.vz === 0) { p.vx *= 1 - 5 * dt; p.vy *= 1 - 5 * dt; }
    } else if (p.type === 'ember' || p.type === 'soul') {
      p.vy -= p.grav * dt;
      p.vx += Math.sin(p.t * 9 + p.seed) * 30 * dt;
    } else {
      p.vy += p.grav * dt;
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
  for (let i = FXO.length - 1; i >= 0; i--) {
    const o = FXO[i];
    o.t += dt;
    if (o.update) o.update(dt, o);
    if (o.t >= o.dur) FXO.splice(i, 1);
  }
}

// layer: 'ground' (影より上・キャラより下) / 'top' (最前面)
function drawFx(layer) {
  for (const o of FXO) if ((o.layer || 'top') === layer) o.draw(o, clamp(o.t / o.dur));
  for (const p of PARTS) {
    const L = p.layer || (p.type === 'smoke' || p.type === 'scorch' ? 'ground' : 'top');
    if (L !== layer) continue;
    drawPart(p, p.t / p.life);
  }
}

function drawPart(p, u) {
  const R = p.R;
  switch (p.type) {
    case 'spark': { // 光の筋: 頭は明るく尾は暗い
      const sp = Math.hypot(p.vx, p.vy), len = clamp(sp * 0.03, 1, 7) * (1 - u * 0.5);
      const nx = p.vx / (sp || 1), ny = p.vy / (sp || 1);
      for (let i = 0; i < len; i++) {
        const c = rAt(R, (1 - u) * (1 - i / len * 0.6));
        px(p.x - nx * i, p.y - ny * i, c);
      }
      glowPx(p.x, p.y, R[R.length - 2], p.k * (1 - u));
      break;
    }
    case 'ember': {
      if (u > 0.5 && ((p.t * 30 + p.seed) | 0) % 3 === 0) break; // 消える前にチラつく
      const c = rAt(R, 1 - u * 0.9);
      px(p.x, p.y, c);
      if (p.size > 1 && u < 0.5) { px(p.x + 1, p.y, rAt(R, 0.6 - u)); px(p.x, p.y + 1, rAt(R, 0.5 - u)); }
      glowPx(p.x, p.y, R[R.length - 2], p.k * (1 - u));
      break;
    }
    case 'soul': { // ふわっと昇る魂の粒
      const c = rAt(R, 1 - u);
      pxa(p.x, p.y, c, 1 - u * 0.7);
      pxa(p.x, p.y + 1, rAt(R, 0.6 - u * 0.6), 0.8 - u);
      glowDisc(p.x, p.y, 4, R[R.length - 2], p.k * (1 - u));
      break;
    }
    case 'bit': { // 跳ねる破片
      const a = u > 0.7 ? (1 - u) / 0.3 : 1;
      if (p.z > 1) blendPx(p.x, p.y, INK, 0.35 * a);
      const y = p.y - p.z;
      pxa(p.x, y, p.c, a);
      if (p.size > 1) { pxa(p.x + 1, y, p.c2 || p.c, a); pxa(p.x, y + 1, p.c2 || p.c, a); pxa(p.x + 1, y + 1, p.c3 || p.c, a); }
      break;
    }
    case 'smoke': { // 本当に半透明な煙。上が明るく下が暗い
      const r = p.size * (0.45 + 0.75 * ease.outCubic(u)), a = (p.a || 0.5) * (1 - u);
      const cy = p.y - p.z;
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
        for (let x = Math.floor(p.x - r); x <= Math.ceil(p.x + r); x++) {
          const dx = (x + 0.5 - p.x) / r, dy = (y + 0.5 - cy) / r, d = dx * dx + dy * dy;
          if (d > 1) continue;
          const c = dy < -0.25 ? R[4] : dy < 0.3 ? R[3] : R[2];
          blendPx(x, y, c, a * (d > 0.7 ? 0.55 : 1));
        }
      break;
    }
    case 'star': { // キラッと光る十字
      const s = Math.max(0, Math.round(p.size * (1 - ease.inQuad(u))));
      px(p.x, p.y, WHITE);
      for (let i = 1; i <= s; i++) {
        const c = rAt(R, 1 - i / (s + 1));
        px(p.x + i, p.y, c); px(p.x - i, p.y, c); px(p.x, p.y + i, c); px(p.x, p.y - i, c);
      }
      glowPx(p.x, p.y, R[R.length - 2], p.k * (1 - u));
      break;
    }
    case 'flash': { // 1〜2フレームの白い芯
      const r = p.size * (1 - u * 0.4);
      discFill(p.x, p.y, r, u < 0.5 ? WHITE : R[R.length - 1]);
      discFill(p.x, p.y, r + 1, R[R.length - 2], 0.5 * (1 - u));
      glowDisc(p.x, p.y, r * 4, R[R.length - 2], p.k * (1 - u));
      break;
    }
    case 'light': {
      illum(p.x, p.y, p.size, p.k * (1 - ease.inQuad(u)));
      if (p.c) glowDisc(p.x, p.y, p.size * 0.5, p.c, p.gk * (1 - u));
      break;
    }
    case 'ring': { // 衝撃波リング
      const e = ease.outQuart(u), r = p.r0 + (p.r1 - p.r0) * e, th = Math.max(1, p.th * (1 - u));
      ring(p.x, p.y, r, th, rAt(R, 1 - u * 0.8), 1 - u * 0.6, p.sq || 0.7);
      if (u < 0.6) ring(p.x, p.y, r - th, 1, R[R.length - 1], (0.6 - u) * 2, p.sq || 0.7);
      const n = Math.ceil(r * 0.6);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        glowPx(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r * (p.sq || 0.7), R[R.length - 2], p.k * (1 - u));
      }
      break;
    }
    case 'after': { // ダッシュの残像
      drawTpl(p.tpl, p.cmap, p.x, p.y, { flip: p.flip, tint: p.c, tintK: 0.85, alpha: 0.55 * (1 - u) });
      break;
    }
    case 'mote': { // 光の中を漂うほこり
      const a = Math.sin(u * Math.PI) * 0.8;
      pxa(p.x, p.y, p.c, a);
      break;
    }
    case 'scorch': { // 焦げ跡
      ellipseBlend(p.x, p.y, p.size, p.size * 0.55, INK, 0.35 * (1 - u));
      break;
    }
  }
}

// ---------------------------------------------------------------- 組み合わせエフェクト

function fxLight(x, y, r, k, life, c = 0, gk = 0) { part({ type: 'light', x, y, size: r, k, life, c, gk }); }

// 鎖が当たった時の火花
function fxHit(x, y, dx, dy, R = PAL.spark, power = 1) {
  const a0 = Math.atan2(dy, dx);
  part({ type: 'flash', x, y, size: 1.5 + power, life: 0.07, R, k: 0.7 });
  const n = 3 + Math.round(power * 3);
  for (let i = 0; i < n; i++) {
    const a = a0 + rand(-0.95, 0.95), sp = rand(80, 230) * (0.7 + power * 0.3);
    part({ type: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.1, 0.28), drag: 7, R, k: 0.5 });
  }
  for (let i = 0; i < 1 + power; i++) {
    const a = a0 + rand(-1.2, 1.2), sp = rand(30, 90);
    part({ type: 'bit', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: rand(40, 110), grav: 420, life: rand(0.4, 0.7), c: R[3], c2: R[2], c3: R[1] });
  }
  fxLight(x, y, 30, 0.6, 0.14);
}

// 敵を倒した時の爆散: 白い芯 → リング → 破片が跳ねる → 煙 → 魂が昇る
function fxKill(x, y, R, size = 6) {
  part({ type: 'flash', x, y, size: size * 0.6, life: 0.08, R: PAL.spark, k: 0.8 });
  part({ type: 'ring', x, y: y + 2, r0: size * 0.4, r1: size * 2.4, th: 3, life: 0.32, R: PAL.spark, k: 0.35 });
  const nb = 8 + size;
  for (let i = 0; i < nb; i++) {
    const a = rand(0, TAU), sp = rand(30, 120);
    const s = Math.random() < 0.35 ? 2 : 1;
    part({ type: 'bit', x: x + rand(-2, 2), y: y + rand(-2, 2), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7, vz: rand(50, 160), grav: 450, life: rand(0.6, 1.1), size: s, c: R[randi(2, 4)], c2: R[2], c3: R[1] });
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + rand(-0.2, 0.2), sp = rand(100, 210);
    part({ type: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.12, 0.25), drag: 8, R: PAL.spark, k: 0.4 });
  }
  for (let i = 0; i < 3 + (size >> 2); i++)
    part({ type: 'smoke', x: x + rand(-3, 3), y: y + rand(-2, 2), vx: rand(-12, 12), vy: rand(-18, -4), size: rand(3, 5) + size * 0.25, life: rand(0.45, 0.8), R: PAL.smoke, a: 0.45, drag: 2 });
  for (let i = 0; i < 3; i++)
    part({ type: 'soul', x: x + rand(-3, 3), y: y - 2, vx: rand(-8, 8), vy: rand(-30, -16), grav: 20, life: rand(0.6, 1.0), R, k: 0.25, seed: rand(0, 10) });
  part({ type: 'scorch', x, y: y + 2, size: size * 0.9, life: 2.5 });
  fxLight(x, y, 46, 0.9, 0.25);
}

function fxDust(x, y, n = 3, spread = 4, dir = 0) {
  for (let i = 0; i < n; i++)
    part({ type: 'smoke', x: x + rand(-spread, spread), y: y + rand(-1, 1), vx: rand(-15, 15) - dir * 25, vy: rand(-10, -2), size: rand(1.5, 3), life: rand(0.25, 0.45), R: PAL.dust, a: 0.5, drag: 4 });
}

// 敵の出現前の魔法陣 (予告)
function fxRune(x, y, R, dur) {
  return fxObj({
    dur, layer: 'ground', x, y, R,
    update(dt, o) {
      if (Math.random() < 0.6) {
        const a = rand(0, TAU), r = rand(14, 20);
        part({ type: 'ember', x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.6, vx: -Math.cos(a) * 40, vy: -Math.sin(a) * 24, grav: 0, life: 0.35, R, k: 0.5, seed: rand(0, 9) });
      }
    },
    draw(o, u) {
      const r = lerp(14, 7, ease.outCubic(u)), rot = o.t * 4;
      const blink = u > 0.75 && ((o.t * 20) | 0) % 2 === 0;
      for (let a = 0; a < TAU; a += 0.06) {
        if (Math.floor(((a + rot) / TAU) * 12) % 2) continue;
        const qx = x + Math.cos(a) * r, qy = y + Math.sin(a) * r * 0.6;
        px(qx, qy, blink ? WHITE : R[4]);
        glowPx(qx, qy, R[4], 0.35);
      }
      ring(x, y, r * 0.55, 1, R[3], 0.6 + u * 0.4, 0.6);
      const s = 2 + Math.round(u * 2);
      line(x - s, y, x + s, y, R[5]); line(x, y - s * 0.6, x, y + s * 0.6, R[5]);
      glowDisc(x, y, 10 + u * 8, R[3], 0.25 + u * 0.4);
      illum(x, y, 30, 0.3 + u * 0.3);
    },
  });
}

// 雷: ギザギザの線を毎フレーム作り直してチラつかせる
function jag(x0, y0, x1, y1, depth, amp, out) {
  if (depth <= 0) { out.push([x1, y1]); return; }
  const mx = (x0 + x1) / 2 + rand(-amp, amp), my = (y0 + y1) / 2 + rand(-amp, amp);
  jag(x0, y0, mx, my, depth - 1, amp * 0.55, out);
  jag(mx, my, x1, y1, depth - 1, amp * 0.55, out);
}
function fxZap(pts, R = PAL.volt, dur = 0.16) {
  return fxObj({
    dur, pts, path: null, k: -1,
    draw(o, u) {
      const step = Math.floor(o.t / 0.035);
      if (step !== o.k) {
        o.k = step; o.path = [];
        for (let i = 0; i < pts.length - 1; i++) {
          const [ax, ay] = pts[i], [bx, by] = pts[i + 1], seg = [[ax, ay]];
          jag(ax, ay, bx, by, 3, Math.min(8, dist(ax, ay, bx, by) * 0.3), seg);
          o.path.push(seg);
        }
      }
      for (const seg of o.path)
        for (let i = 0; i < seg.length - 1; i++) {
          const [ax, ay] = seg[i], [bx, by] = seg[i + 1];
          line(ax + 1, ay, bx + 1, by, R[2], 0.6 * (1 - u));
          line(ax, ay, bx, by, u < 0.4 ? WHITE : R[4]);
          glowLine(ax, ay, bx, by, R[3], 0.7 * (1 - u));
        }
    },
  });
}

// 拘束(バインド)の黄金のはじけ
function fxBind(x, y, r) {
  part({ type: 'ring', x, y, r0: r, r1: r * 3, th: 4, life: 0.5, R: PAL.gold, k: 0.6 });
  part({ type: 'ring', x, y, r0: r * 0.5, r1: r * 2, th: 2, life: 0.35, R: PAL.gold, k: 0.5 });
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU, sp = rand(120, 240);
    part({ type: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7, life: rand(0.2, 0.4), drag: 6, R: PAL.gold, k: 0.6 });
  }
  for (let i = 0; i < 8; i++) part({ type: 'star', x: x + rand(-r, r), y: y + rand(-r, r) - 6, size: randi(2, 4), life: rand(0.3, 0.6), R: PAL.gold, k: 0.5 });
  fxLight(x, y, 90, 1.0, 0.4, PAL.gold[4], 0.4);
}

// 蘇生: 光の柱が立ち上がる
function fxRevive(x, y, R) {
  fxObj({
    dur: 0.7, layer: 'top',
    draw(o, u) {
      const w = Math.round(lerp(7, 1, ease.outCubic(u))), hgt = 40 * ease.outExpo(u * 2);
      for (let j = 0; j < hgt; j++) {
        const a = (1 - j / hgt) * (1 - u);
        for (let i = -w; i <= w; i++) pxa(x + i, y - j, Math.abs(i) < w * 0.4 ? WHITE : R[4], a * (1 - Math.abs(i) / (w + 1)));
      }
      glowDisc(x, y - 10, 30, R[4], 0.6 * (1 - u));
    },
  });
  part({ type: 'ring', x, y, r0: 4, r1: 26, th: 3, life: 0.45, R, k: 0.5 });
  for (let i = 0; i < 12; i++) part({ type: 'ember', x: x + rand(-6, 6), y: y - rand(0, 10), vx: rand(-10, 10), vy: rand(-70, -30), grav: 0, life: rand(0.5, 0.9), R, k: 0.5, seed: rand(0, 9), size: 2 });
  fxLight(x, y, 70, 1, 0.6);
}

// 穴に落ちる: 渦を巻いて吸い込まれるほこり
function fxFall(x, y) {
  for (let i = 0; i < 14; i++) {
    const a = rand(0, TAU), r = rand(5, 12);
    part({ type: 'smoke', x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.6, vx: -Math.cos(a + 1.2) * 30, vy: -Math.sin(a + 1.2) * 18, size: rand(1.5, 2.5), life: rand(0.3, 0.5), R: PAL.dust, a: 0.6, drag: 3 });
  }
}

function fxHeal(x, y) {
  for (let i = 0; i < 8; i++) part({ type: 'star', x: x + rand(-7, 7), y: y - rand(2, 16), vy: -20, size: randi(1, 3), life: rand(0.3, 0.7), R: PAL.heal, k: 0.5 });
  fxLight(x, y, 40, 0.7, 0.4, PAL.heal[4], 0.3);
}

// ダッシュ爆発・岩の着弾などの小爆発
function fxBurst(x, y, r, R = PAL.flame) {
  part({ type: 'flash', x, y, size: r * 0.4, life: 0.08, R, k: 0.9 });
  part({ type: 'ring', x, y, r0: 2, r1: r, th: 4, life: 0.3, R, k: 0.5 });
  for (let i = 0; i < 12; i++) {
    const a = rand(0, TAU), sp = rand(60, 180);
    part({ type: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7, life: rand(0.15, 0.3), drag: 6, R, k: 0.5 });
  }
  for (let i = 0; i < 4; i++) part({ type: 'smoke', x: x + rand(-4, 4), y: y + rand(-3, 3), vy: rand(-20, -6), size: rand(3, 6), life: rand(0.4, 0.7), R: PAL.smoke, a: 0.45 });
  part({ type: 'scorch', x, y, size: r * 0.5, life: 2 });
  fxLight(x, y, r * 2.4, 1, 0.25, R[4], 0.5);
}

// 岩の破片
function fxRocks(x, y, n, R = PAL.stone) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), sp = rand(30, 120);
    part({ type: 'bit', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: rand(60, 170), grav: 480, life: rand(0.6, 1.1), size: Math.random() < 0.5 ? 2 : 1, c: R[4], c2: R[3], c3: R[2] });
  }
  fxDust(x, y, 5, 8);
}

// 炎の鎖の火の粉
function fxEmber(x, y, R = PAL.flame) {
  part({ type: 'ember', x: x + rand(-1, 1), y, vx: rand(-6, 6), vy: rand(-35, -15), grav: 25, life: rand(0.25, 0.55), R, k: 0.45, seed: rand(0, 9) });
}

// 弾が消える時の小さなはじけ
function fxPop(x, y, R) {
  part({ type: 'flash', x, y, size: 2, life: 0.06, R, k: 0.6 });
  for (let i = 0; i < 5; i++) {
    const a = rand(0, TAU), sp = rand(40, 110);
    part({ type: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.1, 0.2), drag: 8, R, k: 0.4 });
  }
}
