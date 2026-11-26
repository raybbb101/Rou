'use strict';
// =====================================================================
//  net.js — スマホ同士のオンライン協力 (WebRTC / PeerJS)
//  ホスト: ゲーム全体を計算し、状態を約30回/秒で配信
//  ゲスト: 入力を送り、届いた状態を補間して描画。エフェクトと音は手元で再生
//  ?local を URL に付けると同じブラウザ内のタブ同士で通信 (テスト用)
// =====================================================================

const NET = {
  mode: 'off', // off / solo / host / connecting / client
  transport: /[?&]local\b/.test(location.search) ? 'local' : 'peer',
  peer: null, conns: new Map(), hostConn: null, code: '', status: '', err: '', screen: 'main', input: '',
  myIdx: -1, events: [], depth: 0, snaps: [], sendT: 0, remote: {}, prevSeq: {}, dashSeq: 0, pickSeq: 0, pick: 0,
  lastIn: '', inT: 0, joinTimer: null,
};
const SNAP_HZ = 30, INTERP_DELAY = 75;
const isNetDev = (dev) => typeof dev === 'string' && dev.startsWith('net:');

// ---------------------------------------------------------------- テスト用ローカル通信
function emitter(o) {
  o._h = {};
  o.on = (ev, fn) => { (o._h[ev] = o._h[ev] || []).push(fn); return o; };
  o._emit = (ev, ...a) => (o._h[ev] || []).forEach((f) => f(...a));
  return o;
}
function localPeer(id) {
  const me = emitter({ id: id || 'c' + Math.random().toString(36).slice(2, 8), conns: {} });
  const ch = new BroadcastChannel('chainx-local');
  const mk = (other) => {
    const c = emitter({ peer: other, open: false });
    c.send = (data) => ch.postMessage({ k: 'msg', from: me.id, to: other, data });
    c.close = () => { ch.postMessage({ k: 'close', from: me.id, to: other }); delete me.conns[other]; };
    return c;
  };
  ch.onmessage = (m) => {
    const d = m.data;
    if (d.to !== me.id) return;
    if (d.k === 'open') {
      const c = mk(d.from); me.conns[d.from] = c; me._emit('connection', c);
      setTimeout(() => { c.open = true; c._emit('open'); ch.postMessage({ k: 'ack', from: me.id, to: d.from }); }, 5);
    } else if (d.k === 'ack') { const c = me.conns[d.from]; if (c) { c.open = true; c._emit('open'); } }
    else if (d.k === 'msg') { const c = me.conns[d.from]; if (c) c._emit('data', d.data); }
    else if (d.k === 'close') { const c = me.conns[d.from]; if (c) { delete me.conns[d.from]; c._emit('close'); } }
  };
  me.connect = (to) => {
    const c = mk(to); me.conns[to] = c;
    ch.postMessage({ k: 'open', from: me.id, to });
    setTimeout(() => { if (!c.open) me._emit('error', { type: 'peer-unavailable' }); }, 1500);
    return c;
  };
  me.destroy = () => { for (const k in me.conns) ch.postMessage({ k: 'close', from: me.id, to: k }); ch.close(); };
  setTimeout(() => me._emit('open', me.id), 5);
  return me;
}
function makePeer(id) {
  if (NET.transport === 'local') return localPeer(id);
  if (typeof Peer === 'undefined') throw new Error('通信ライブラリを読み込めませんでした');
  return id ? new Peer(id, { debug: 1 }) : new Peer({ debug: 1 });
}

// ---------------------------------------------------------------- ホスト
function netHost() {
  netClose();
  NET.mode = 'host'; NET.err = ''; NET.status = '部屋を準備中…';
  NET.code = String(randi(1000, 9999));
  let peer;
  try { peer = makePeer('chainx-room-' + NET.code); } catch (e) { NET.err = e.message; NET.mode = 'solo'; return; }
  NET.peer = peer;
  peer.on('open', () => { NET.status = ''; });
  peer.on('error', (e) => {
    if (e.type === 'unavailable-id') { try { peer.destroy(); } catch (x) {} netHost(); enterLobby(TOUCH.used); return; }
    NET.err = '通信エラー: ' + (e.type || e.message);
  });
  peer.on('disconnected', () => { NET.status = '再接続中…'; try { peer.reconnect(); } catch (x) {} });
  peer.on('connection', (conn) => {
    conn.on('open', () => {
      if (G.players.length >= 4 || G.state !== 'lobby') {
        conn.send({ t: 'full', why: G.state !== 'lobby' ? 'ゲーム中なので入れません' : '満員です (最大4人)' });
        setTimeout(() => conn.close(), 400);
        return;
      }
      const p = addPlayer('net:' + conn.peer);
      NET.conns.set(conn.peer, { conn, idx: p.idx });
      conn.send({ t: 'welcome', idx: p.idx, code: NET.code });
    });
    conn.on('data', (d) => { if (d && d.t === 'in') NET.remote['net:' + conn.peer] = d; });
    conn.on('close', () => dropClient(conn.peer));
    conn.on('error', () => dropClient(conn.peer));
  });
}
function dropClient(id) {
  if (!NET.conns.has(id)) return;
  NET.conns.delete(id);
  const dev = 'net:' + id;
  delete NET.remote[dev]; delete NET.prevSeq[dev];
  const p = G.players.find((q) => q.dev === dev);
  if (p) {
    addPopup(p.x, p.y - 20, `${p.col.name} 切断`, '#aaa', 8, 1.5);
    G.players = G.players.filter((q) => q !== p);
    if (G.players.length) rebuildRopes();
    else if (G.state !== 'lobby') toLobby();
  }
}
// readDevices から呼ばれ、ゲストの入力を INPUT に混ぜる
function netDevices(out) {
  if (NET.mode !== 'host') return;
  for (const id in NET.remote) {
    const r = NET.remote[id], pv = NET.prevSeq[id] || { ds: r.ds, ps: r.ps };
    out[id] = { x: +r.x || 0, y: +r.y || 0, dash: !!r.d, anchor: !!r.a, start: false, tapDash: r.ds !== pv.ds, pick: r.ps !== pv.ps ? r.pk : null };
    NET.prevSeq[id] = { ds: r.ds, ps: r.ps };
  }
}

// エフェクト・音・ポップアップを記録してゲストに送る
const NET_EVENTS = ['fxHit', 'fxKill', 'fxDust', 'fxRune', 'fxZap', 'fxBind', 'fxRevive', 'fxFall', 'fxHeal', 'fxBurst', 'fxRocks', 'fxEmber', 'fxPop', 'fxLight', 'part', 'sfx', 'addPopup', 'buzz'];
for (const name of NET_EVENTS) {
  const orig = window[name];
  window[name] = function (...args) {
    if (NET.mode === 'host' && NET.depth === 0 && NET.conns.size) NET.events.push([name, args]);
    NET.depth++;
    try { return orig.apply(this, args); } finally { NET.depth--; }
  };
}

const q1 = (v) => Math.round(v * 10) / 10, q2 = (v) => Math.round(v * 100) / 100;
function palKey(R) { for (const k in PAL) if (PAL[k] === R) return k; return 'spark'; }

function makeSnap() {
  const r = G.room, c = G.choose, b = G.ball;
  return {
    t: 's', st: G.state, f: G.floor, ri: G.roomIdx, up: G.upg, mh: G.maxHp, cl: G.chainLen, rt: q1(G.runTime), stats: G.stats,
    sh: q1(G.shake), pa: G.paused, ot: q2(G.overT), nb: G.newBest, best: G.best, fade: q2(G.fade), code: NET.code,
    bn: G.banner && { title: G.banner.title, sub: G.banner.sub, col: G.banner.col, t: q2(G.banner.t) },
    ch: c && { o: c.opts.map((u) => u.id), sel: c.sel, who: c.who.idx, t: q2(c.t) },
    room: { uid: r.uid, kind: r.kind, floor: r.floor, idx: r.idx, seed: r.seed, pits: r.pits, pillars: r.pillars.map((p) => ({ x: q1(p.x), y: q1(p.y), r: p.r })), phase: r.phase, door: q2(r.door) },
    pl: G.players.map((p) => ({ i: p.idx, dev: isNetDev(p.dev) ? 'net' : p.dev, x: q1(p.x), y: q1(p.y), vx: q1(p.vx), vy: q1(p.vy), fc: p.face, am: q2(p.aim), wk: q1(p.walk), s: p.state, hp: p.hp, iv: q2(p.inv), dt: q2(p.dashT), dc: q2(p.dashCd), an: p.anchor ? 1 : 0, ft: q2(p.fallT), rv: q2(p.revive) })),
    ball: b && { x: q1(b.x), y: q1(b.y), sp: q2(b.spin) },
    ro: G.ropes.map((rp) => ({ g: q2(rp.bindGlow), n: rp.nodes.flatMap((q) => [q1(q.x), q1(q.y), q1(q.sp)]) })),
    en: G.enemies.map((e) => ({ id: e.id, ty: e.type, x: q1(e.x), y: q1(e.y), vx: q1(e.vx), vy: q1(e.vy), r: e.r, hp: q1(e.hp), mh: q1(e.maxHp), t: q2(e.t), st: e.st, stT: q2(e.stT), fc: e.face, fa: q2(e.faceA), fl: q2(e.flash), bu: q2(e.burn), sl: q2(e.slow), z: q1(e.z), sq: q2(e.squash || 0), dr: q2(e.dir), en: e.enraged ? 1 : 0, nm: e.name, lh: q2(e.lastHit || 0) })),
    bu: G.bullets.map((x) => ({ id: x.id, x: q1(x.x), y: q1(x.y), k: palKey(x.R) })),
    pk: G.pickups.map((k) => ({ x: q1(k.x), y: q1(k.y), t: q2(k.t) })),
    hz: G.hazards.filter((h) => h.type === 'rock').map((h) => ({ x: q1(h.x), y: q1(h.y), t: q2(h.t), d: h.dur, r: h.r })),
    ev: NET.events.splice(0),
  };
}

function netTick(dt) {
  if (NET.mode !== 'host') return;
  if (!NET.conns.size) { NET.events.length = 0; return; }
  NET.sendT += dt;
  if (NET.sendT < 1 / SNAP_HZ) return;
  NET.sendT = 0;
  const snap = makeSnap();
  for (const { conn } of NET.conns.values()) { try { if (conn.open !== false) conn.send(snap); } catch (e) {} }
}

// ---------------------------------------------------------------- ゲスト
function netJoin(code) {
  netClose();
  NET.mode = 'connecting'; NET.code = code; NET.err = ''; NET.status = `部屋 ${code} に接続中…`;
  let peer;
  try { peer = makePeer(); } catch (e) { netLost(e.message); return; }
  NET.peer = peer;
  NET.joinTimer = setTimeout(() => { if (NET.mode === 'connecting') netLost('接続できませんでした。番号を確認してね'); }, 15000);
  peer.on('open', () => {
    const conn = peer.connect('chainx-room-' + code, { reliable: true });
    NET.hostConn = conn;
    conn.on('data', onClientData);
    conn.on('close', () => { if (NET.mode === 'client' || NET.mode === 'connecting') netLost('ホストとの接続が切れました'); });
    conn.on('error', () => netLost('接続エラー'));
  });
  peer.on('error', (e) => netLost(e.type === 'peer-unavailable' ? `部屋 ${code} が見つかりませんでした` : '通信エラー: ' + (e.type || e.message)));
}
function onClientData(d) {
  if (!d) return;
  if (d.t === 'welcome') {
    clearTimeout(NET.joinTimer);
    NET.mode = 'client'; NET.myIdx = d.idx; NET.status = ''; NET.snaps = [];
    G.players = []; G.state = 'lobby';
    sfx('confirm');
  } else if (d.t === 'full') netLost(d.why || '入れませんでした');
  else if (d.t === 's' && NET.mode === 'client') {
    NET.snaps.push({ at: performance.now(), s: d, played: false });
    if (NET.snaps.length > 12) NET.snaps.splice(0, NET.snaps.length - 12);
  }
}
function netLost(msg) {
  clearTimeout(NET.joinTimer);
  netClose();
  NET.err = msg;
  toTitle();
}
function netClose() {
  try { if (NET.peer) NET.peer.destroy(); } catch (e) {}
  NET.peer = null; NET.hostConn = null; NET.conns.clear(); NET.remote = {}; NET.prevSeq = {}; NET.snaps = []; NET.events = [];
  NET.mode = 'off'; NET.myIdx = -1; NET.status = '';
}

function sendInput(dt) {
  const c = NET.hostConn;
  if (NET.mode !== 'client' || !c) return;
  let s = INPUT.touch;
  if (!s || (!s.x && !s.y && !s.dash && !s.anchor)) for (const id of ['kbA', 'kbB', 'pad0', 'pad1']) if (INPUT[id] && (INPUT[id].x || INPUT[id].y || INPUT[id].dash || INPUT[id].anchor)) { s = INPUT[id]; break; }
  s = s || { x: 0, y: 0 };
  for (const id in INPUT) if (INPUT[id].dashP) NET.dashSeq++;
  const msg = { t: 'in', x: q2(s.x || 0), y: q2(s.y || 0), d: s.dash ? 1 : 0, a: s.anchor ? 1 : 0, ds: NET.dashSeq, pk: NET.pick, ps: NET.pickSeq };
  const key = JSON.stringify(msg);
  NET.inT += dt;
  if (key !== NET.lastIn || NET.inT > 0.2) {
    NET.lastIn = key; NET.inT = 0;
    try { c.send(msg); } catch (e) {}
  }
}
function clientPick(i) { NET.pick = i; NET.pickSeq++; }

// 届いたスナップショットを補間して G に反映
function clientFrame(dt) {
  readDevices();
  G.time += dt;
  sendInput(dt);
  const now = performance.now() - INTERP_DELAY, S = NET.snaps;
  while (S.length >= 3 && S[1].at <= now) S.shift();
  if (S.length) {
    const a = S[0], b = S[1] || a;
    const al = b === a ? 1 : clamp((now - a.at) / (b.at - a.at));
    for (const sn of S) if (!sn.played && sn.at <= now + 1) { sn.played = true; playEvents(sn.s.ev); }
    applySnap(a.s, b.s, al);
  }
  for (let i = G.popups.length - 1; i >= 0; i--) { const p = G.popups[i]; p.t += dt; if (p.t > p.life) G.popups.splice(i, 1); }
  updateFx(dt);
  clearPressed();
}
function playEvents(list) {
  if (!list) return;
  for (const [name, args] of list) { try { window[name](...args); } catch (e) {} }
}

const clientCache = { players: {}, enemies: {} };
function applySnap(s, n, al) {
  const L = (a, b) => (b == null ? a : a + (b - a) * al);
  G.state = s.st; G.floor = s.f; G.roomIdx = s.ri; G.upg = s.up; G.maxHp = s.mh; G.chainLen = s.cl; G.runTime = s.rt;
  G.stats = s.stats; G.shake = Math.max(G.shake * 0.9, s.sh); G.paused = s.pa; G.overT = s.ot; G.newBest = s.nb; G.best = s.best; G.fade = s.fade;
  NET.code = s.code;
  G.banner = s.bn ? { ...s.bn } : null;
  const R = s.room;
  if (!G.room || G.room.uid !== R.uid) {
    const room = { ...R, theme: THEMES[R.floor], torches: [44, 104, 216, 276], waves: [] };
    buildBg(room);
    G.room = room;
    PARTS.length = 0; FXO.length = 0;
  }
  G.room.phase = R.phase; G.room.door = R.door;
  // プレイヤー
  const np = {};
  for (const q of n.pl) np[q.i] = q;
  G.players = s.pl.map((q) => {
    let p = clientCache.players[q.i];
    if (!p) p = clientCache.players[q.i] = makePlayer(q.dev, q.i);
    const m = np[q.i];
    p.dev = q.i === NET.myIdx ? 'touch' : q.dev;
    p.x = L(q.x, m && m.x); p.y = L(q.y, m && m.y); p.vx = q.vx; p.vy = q.vy; p.face = q.fc; p.aim = q.am; p.walk = L(q.wk, m && m.wk);
    p.state = q.s; p.hp = q.hp; p.inv = q.iv; p.dashT = q.dt; p.dashCd = q.dc; p.anchor = !!q.an; p.fallT = q.ft; p.revive = q.rv;
    return p;
  });
  G.ball = s.ball ? { kind: 'ball', r: 5, x: L(s.ball.x, n.ball && n.ball.x), y: L(s.ball.y, n.ball && n.ball.y), spin: s.ball.sp } : null;
  G.ropes = s.ro.map((r, ri) => {
    const m = n.ro[ri] && n.ro[ri].n.length === r.n.length ? n.ro[ri].n : null, nodes = [];
    for (let i = 0; i < r.n.length; i += 3) {
      const x = L(r.n[i], m && m[i]), y = L(r.n[i + 1], m && m[i + 1]);
      const vx = m ? (m[i] - r.n[i]) / 2 : 0, vy = m ? (m[i + 1] - r.n[i + 1]) / 2 : 0;
      nodes.push({ x, y, px: x - vx, py: y - vy, sp: r.n[i + 2] });
    }
    return { nodes, bindGlow: r.g };
  });
  const ne = {};
  for (const e of n.en) ne[e.id] = e;
  const keep = {};
  G.enemies = s.en.map((q) => {
    const e = clientCache.enemies[q.id] || { id: q.id };
    const m = ne[q.id];
    Object.assign(e, { type: q.ty, x: L(q.x, m && m.x), y: L(q.y, m && m.y), vx: q.vx, vy: q.vy, r: q.r, hp: q.hp, maxHp: q.mh, t: L(q.t, m && m.t), st: q.st, stT: q.stT, face: q.fc, faceA: q.fa, flash: q.fl, burn: q.bu, slow: q.sl, z: q.z, squash: q.sq, dir: q.dr, enraged: !!q.en, name: q.nm, lastHit: q.lh, big: !!ETYPES[q.ty].big, flying: !!ETYPES[q.ty].flying });
    keep[q.id] = e;
    return e;
  });
  clientCache.enemies = keep;
  const nb = {};
  for (const x of n.bu) nb[x.id] = x;
  G.bullets = s.bu.map((x) => ({ x: L(x.x, nb[x.id] && nb[x.id].x), y: L(x.y, nb[x.id] && nb[x.id].y), R: PAL[x.k] || PAL.spark }));
  G.pickups = s.pk.map((k) => ({ ...k }));
  G.hazards = s.hz.map((h) => ({ type: 'rock', x: h.x, y: h.y, t: h.t, dur: h.d, r: h.r }));
  G.choose = s.ch ? { opts: s.ch.o.map((id) => UPG.find((u) => u.id === id)), sel: s.ch.sel, who: G.players.find((p) => p.idx === s.ch.who) || G.players[0], t: s.ch.t } : null;
}

// ページを閉じたら相手にすぐ知らせる
window.addEventListener('pagehide', () => { if (NET.peer) netClose(); });
