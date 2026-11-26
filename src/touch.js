'use strict';
// =====================================================================
//  touch.js — スマホ操作: 左半分どこでもスティック / 右にダッシュとアンカー
//  画面上のボタン (タイトル・ロビー・強化カード) もここで受け付ける
// =====================================================================

const TOUCH = { used: false, stick: null, dashId: null, anchorId: null, dashTap: false, ptrs: new Map(), lastStick: { x: 0, y: 0 } };

function ctlLayout() {
  const u = canvas.height / 100, cw = canvas.width, ch = canvas.height;
  return {
    u,
    dash: { x: cw - 18 * u, y: ch - 22 * u, r: 12.5 * u },
    anchor: { x: cw - 40 * u, y: ch - 12 * u, r: 10 * u },
    stickR: 14 * u,
    home: { x: 22 * u, y: ch - 24 * u },
  };
}
function myPlayer() {
  if (NET.mode === 'client') return G.players.find((p) => p.idx === NET.myIdx);
  return G.players.find((p) => p.dev === 'touch');
}
function controlsActive() {
  return TOUCH.used && (G.state === 'play' || G.state === 'lobby') && !G.choose && !G.paused && !!myPlayer();
}

function tryFullscreen() {
  const el = document.documentElement;
  if (document.fullscreenElement || !el.requestFullscreen) return;
  el.requestFullscreen().then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch (e) {} }).catch(() => {});
}

canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  audioInit();
  if (e.pointerType === 'touch') { TOUCH.used = true; tryFullscreen(); }
  const dpr = window.devicePixelRatio || 1, sx = e.clientX * dpr, sy = e.clientY * dpr;
  const gx = (sx - OX) / S, gy = (sy - OY) / S;
  for (let i = UIB.length - 1; i >= 0; i--) {
    const b = UIB[i];
    if (gx >= b.x - 2 && gx <= b.x + b.w + 2 && gy >= b.y - 2 && gy <= b.y + b.h + 2) {
      TOUCH.ptrs.set(e.pointerId, 'ui');
      b.press = G.time;
      handleUI(b.id, e.pointerType);
      return;
    }
  }
  if (!controlsActive()) return;
  const L = ctlLayout();
  if (sx < canvas.width * 0.45) {
    TOUCH.stick = { id: e.pointerId, ox: sx, oy: sy, x: sx, y: sy };
    TOUCH.ptrs.set(e.pointerId, 'stick');
  } else if (dist(sx, sy, L.anchor.x, L.anchor.y) < dist(sx, sy, L.dash.x, L.dash.y)) {
    TOUCH.anchorId = e.pointerId; TOUCH.ptrs.set(e.pointerId, 'anchor');
  } else {
    TOUCH.dashId = e.pointerId; TOUCH.dashTap = true; TOUCH.ptrs.set(e.pointerId, 'dash');
  }
  try { canvas.setPointerCapture(e.pointerId); } catch (x) {}
}, { passive: false });

canvas.addEventListener('pointermove', (e) => {
  if (TOUCH.stick && TOUCH.stick.id === e.pointerId) {
    const dpr = window.devicePixelRatio || 1, st = TOUCH.stick, R = ctlLayout().stickR;
    st.x = e.clientX * dpr; st.y = e.clientY * dpr;
    // 指が大きく離れたら原点もついてくる (追従スティック)
    const dx = st.x - st.ox, dy = st.y - st.oy, d = Math.hypot(dx, dy);
    if (d > R * 1.4) { st.ox = st.x - (dx / d) * R * 1.4; st.oy = st.y - (dy / d) * R * 1.4; }
  }
}, { passive: true });

function releasePtr(e) {
  const k = TOUCH.ptrs.get(e.pointerId);
  TOUCH.ptrs.delete(e.pointerId);
  if (k === 'stick' && TOUCH.stick && TOUCH.stick.id === e.pointerId) TOUCH.stick = null;
  if (k === 'dash' && TOUCH.dashId === e.pointerId) TOUCH.dashId = null;
  if (k === 'anchor' && TOUCH.anchorId === e.pointerId) TOUCH.anchorId = null;
}
canvas.addEventListener('pointerup', releasePtr);
canvas.addEventListener('pointercancel', releasePtr);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

// readDevices から呼ばれる
function touchDevices(out) {
  if (!TOUCH.used) return;
  let x = 0, y = 0;
  const st = TOUCH.stick;
  if (st) {
    const R = ctlLayout().stickR;
    x = (st.x - st.ox) / R; y = (st.y - st.oy) / R;
    const m = Math.hypot(x, y);
    if (m < 0.18) { x = 0; y = 0; } else if (m > 1) { x /= m; y /= m; }
  }
  TOUCH.lastStick = { x, y };
  out.touch = { x, y, dash: TOUCH.dashId != null, anchor: TOUCH.anchorId != null, start: false, tapDash: TOUCH.dashTap };
  TOUCH.dashTap = false;
}

function handleUI(id, ptype) {
  switch (id) {
    case 'host': netHost(); enterLobby(ptype === 'touch'); sfx('confirm'); break;
    case 'joinScreen': NET.screen = 'join'; NET.input = ''; NET.err = ''; sfx('select'); break;
    case 'solo': netClose(); NET.mode = 'solo'; NET.err = ''; enterLobby(ptype === 'touch'); sfx('confirm'); break;
    case 'back': NET.screen = 'main'; sfx('select'); break;
    case 'del': NET.input = NET.input.slice(0, -1); sfx('select'); break;
    case 'go': if (NET.input.length === 4) { netJoin(NET.input); sfx('confirm'); } break;
    case 'start': if (NET.mode !== 'client' && G.state === 'lobby' && G.players.length) startRun(); break;
    case 'leave': leaveLobby(); break;
    case 'toLobby': if (NET.mode !== 'client' && G.overT > 1.2) toLobby(); break;
    case 'pause': if (NET.mode !== 'client') { G.paused = !G.paused; sfx('select'); } break;
    default:
      if (id.startsWith('k')) { if (NET.input.length < 4) { NET.input += id.slice(1); sfx('select'); } }
      else if (id.startsWith('card')) {
        const i = +id.slice(4);
        if (NET.mode === 'client') { if (G.choose && G.choose.who.idx === NET.myIdx) { clientPick(i); sfx('select'); } }
        else if (G.choose && !isNetDev(G.choose.who.dev)) choosePick(i);
      }
  }
}

// ---------------------------------------------------------------- 描画 (画面ピクセル単位)
function drawTouchControls() {
  if (!controlsActive()) return;
  const L = ctlLayout(), u = L.u;
  ctx.save();
  // スティック
  const st = TOUCH.stick, ox = st ? st.ox : L.home.x, oy = st ? st.oy : L.home.y;
  ctx.globalAlpha = st ? 0.55 : 0.28;
  ctx.fillStyle = '#0b0910'; ctx.strokeStyle = '#d8cfe0'; ctx.lineWidth = u * 0.6;
  ctx.beginPath(); ctx.arc(ox, oy, L.stickR, 0, TAU); ctx.fill(); ctx.stroke();
  const kx = ox + TOUCH.lastStick.x * L.stickR, ky = oy + TOUCH.lastStick.y * L.stickR;
  ctx.globalAlpha = st ? 0.85 : 0.4; ctx.fillStyle = '#d8cfe0';
  ctx.beginPath(); ctx.arc(kx, ky, L.stickR * 0.42, 0, TAU); ctx.fill();
  // ボタン
  const me = myPlayer(), col = me ? me.col.css : '#fff';
  const btn = (b, label, on, sub) => {
    ctx.globalAlpha = on ? 0.8 : 0.42;
    ctx.fillStyle = on ? col : '#0b0910'; ctx.strokeStyle = col; ctx.lineWidth = u * 0.7;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 0.95; ctx.fillStyle = on ? '#0b0910' : '#fff';
    ctx.font = `${Math.round(b.r * 0.42)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, b.x, b.y - (sub ? b.r * 0.12 : 0));
    if (sub) { ctx.font = `${Math.round(b.r * 0.26)}px ${FONT}`; ctx.fillText(sub, b.x, b.y + b.r * 0.38); }
  };
  btn(L.dash, 'ダッシュ', TOUCH.dashId != null, me && me.dashCd > 0 ? '…' : '');
  btn(L.anchor, 'アンカー', TOUCH.anchorId != null, '長押し');
  ctx.restore();
}
