// The whiteboard page. It shows whatever the server holds and draws each new map as it
// arrives: boxes appear one at a time and every link is drawn from one box to the next.
// The page only reads. Nothing typed or clicked here changes the board on the server.
//
// Everything that comes from the assistant is put on the page as plain text, never as markup.
import { boundsOf, buildOrder, layoutColumns, layoutHub, routeColumns, routeHub } from '/layout.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const sv = (tag, cls) => { const e = document.createElementNS('http://www.w3.org/2000/svg', tag); if (cls) e.setAttribute('class', cls); return e; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const calm = matchMedia('(prefers-reduced-motion: reduce)');
// No staged drawing when the reader asked for less motion, or when the page isn't being looked at
// (a hidden page runs its timers slowly, and the map must still end up complete).
const still = () => calm.matches || document.hidden;

const board = $('board');
const world = $('world');
const TIP = { flow: 'ink', money: 'green', depends: 'blue', competes: 'red', supports: 'green', threatens: 'red' };

/** What the page knows. */
const S = {
  board: null, agentName: null, seq: 0, kinds: {}, edgeKinds: {}, basis: {}, baseMaps: [],
  mapId: null,
  follow: true, // switch to each new map as it is drawn, until the reader picks one by hand
  fresh: new Set(), // maps drawn while the reader was looking at another one
  moved: new Map(), // boxes the reader dragged, per map
  cam: { x: 0, y: 0, z: 1 },
  sel: null, hover: null, walk: null, build: null
};
/** What is on the board right now. */
const V = { map: null, pos: {}, bounds: null, boxes: new Map(), links: new Map() };

const currentMap = () => (S.board ? S.board.maps.find((m) => m.id === S.mapId) || null : null);
const who = () => S.agentName || 'your assistant';

// ---- Talking to the server ------------------------------------------------

async function fetchState() {
  const d = await (await fetch('/api/state', { cache: 'no-store' })).json();
  S.kinds = d.kinds; S.edgeKinds = d.edgeKinds; S.basis = d.basis; S.baseMaps = d.baseMaps;
  return d;
}

function setBoard(d) {
  S.board = d.board; S.agentName = d.agentName; S.seq = d.seq;
  S.fresh.clear(); S.moved.clear(); S.follow = true; S.sel = null; S.hover = null;
  endWalk(true); closePanel(true);
  S.mapId = S.board && S.board.maps.length ? S.board.maps[0].id : null;
  chrome();
  draw(false);
}

// After a reload or a dropped connection the page takes the whole board again, so it can never
// show half of something it missed.
async function resync() {
  const d = await fetchState();
  if (!S.board || !d.board || S.board.id !== d.board.id) return setBoard(d);
  const keep = S.mapId;
  S.board = d.board; S.agentName = d.agentName; S.seq = d.seq;
  S.mapId = S.board.maps.some((m) => m.id === keep) ? keep : S.board.maps[0]?.id ?? null;
  chrome();
  return draw(false);
}

function onMap(d) {
  if (!S.board) return resync();
  S.seq = d.seq;
  const at = S.board.maps.findIndex((m) => m.id === d.map.id);
  if (at >= 0) S.board.maps[at] = d.map; else S.board.maps.push(d.map);
  S.board.maps.sort((a, b) => d.order.indexOf(a.id) - d.order.indexOf(b.id));
  S.board.sources = d.sources;
  S.board.done = false;
  S.moved.delete(d.map.id);
  // A new map takes the screen while the reader is following along. A map that was only
  // sent again (say, with figures added) redraws where it is if it is on screen, and otherwise
  // just gets a dot on its tab: it must not pull the reader away from the map they are reading.
  const onScreen = S.mapId === d.map.id || !S.mapId;
  if (onScreen || (S.follow && !d.replaced)) {
    S.mapId = d.map.id; S.sel = null;
    endWalk(true); closePanel(true);
    // If nobody is looking at the page right now (the investor is typing to the assistant),
    // the drawing is kept for when they come back instead of being spent unseen.
    if (document.hidden) S.fresh.add(d.map.id);
    chrome();
    return draw(!document.hidden);
  }
  S.fresh.add(d.map.id);
  return chrome();
}

function listen() {
  const es = new EventSource('/api/events');
  const on = (name, fn) => es.addEventListener(name, (ev) => fn(JSON.parse(ev.data)));
  on('hello', (d) => { if (d.seq !== S.seq) resync(); });
  on('board', setBoard);
  on('agent', (d) => { S.seq = d.seq; S.agentName = d.agentName; status(); });
  on('status', (d) => { S.seq = d.seq; if (S.board) { S.board.status = d.status; status(); } });
  on('map', onMap);
  on('follow', (d) => { S.seq = d.seq; if (S.board) { S.board.followUps = d.followUps; followUps(); } });
  on('done', (d) => { S.seq = d.seq; if (S.board) { S.board.done = true; S.board.unchecked = d.unchecked; S.board.status = ''; chrome(); } });
}

// ---- Everything around the board ------------------------------------------

function chrome() {
  const b = S.board;
  const m = currentMap();
  $('empty').hidden = !!b;
  $('title').hidden = !b;
  $('tabs').hidden = !b;
  $('tools').hidden = !m;
  $('walk-start').hidden = !m || !!S.walk;
  document.title = b ? `${b.company.name} on the whiteboard` : 'Whiteboard';
  if (b) {
    $('co-name').textContent = b.company.name;
    const listed = [b.company.ticker, b.company.exchange].filter(Boolean).join(' on ');
    const line = b.company.line && !/[.!?]$/.test(b.company.line) ? `${b.company.line}.` : b.company.line;
    $('co-line').textContent = [line, listed ? `Listed as ${listed}.` : ''].filter(Boolean).join(' ');
    $('about').hidden = !m;
    if (m) { $('map-question').textContent = m.question; $('map-summary').textContent = m.summary; }
  }
  tabs();
  status();
  followUps();
}

function tabs() {
  const nav = $('tabs');
  nav.replaceChildren();
  const b = S.board;
  if (!b) return;
  const all = [...S.baseMaps, ...b.maps.filter((m) => !S.baseMaps.some((x) => x.id === m.id))];
  all.forEach((t, i) => {
    const drawn = b.maps.find((m) => m.id === t.id);
    const btn = el('button', `tab${t.id === S.mapId ? ' is-on' : ''}${S.fresh.has(t.id) ? ' is-new' : ''}`);
    if (i < 9) btn.append(el('kbd', '', String(i + 1)));
    btn.append(el('span', '', drawn ? drawn.title : t.title));
    btn.disabled = !drawn;
    btn.title = drawn ? drawn.question : 'Not drawn yet';
    if (t.id === S.mapId) btn.setAttribute('aria-current', 'page');
    btn.addEventListener('click', () => openMap(t.id, true));
    nav.append(btn);
  });
}

function openMap(id, byHand) {
  if (!S.board || !S.board.maps.some((m) => m.id === id)) return;
  if (byHand && !S.board.done) S.follow = false;
  const play = S.fresh.delete(id);
  S.mapId = id; S.sel = null; S.hover = null;
  endWalk(true); closePanel(true);
  chrome();
  draw(play);
}

function status() {
  const s = $('status');
  const b = S.board;
  s.replaceChildren();
  s.classList.toggle('is-live', !!b && !b.done);
  if (!b) return void s.append(el('span', '', S.agentName ? `${S.agentName} is connected. Waiting for a company.` : 'Waiting for a company.'));
  if (!b.done) return void s.append(el('i', 'status-pen'), el('span', 'status-who', `${S.agentName || 'Your assistant'} is drawing`), el('span', '', b.status || `${b.maps.length} of ${S.baseMaps.length} maps so far`));
  const n = b.sources.length;
  return void s.append(el('span', '', `${b.maps.length} maps drawn. ${b.sample ? 'This company is made up, to show how the board works.' : b.unchecked ? 'The figures were not checked against sources.' : `${n} source${n === 1 ? '' : 's'}.`}`));
}

// Questions the assistant suggests asking next. They wait behind one button so they never cover the map.
function followUps() {
  const box = $('follow');
  const list = S.board && S.board.done ? S.board.followUps || [] : [];
  box.replaceChildren();
  box.hidden = !list.length;
  if (!list.length) return;
  const b = el('button', 'ask', `${list.length} question${list.length === 1 ? '' : 's'} to ask next`);
  b.addEventListener('click', () => { S.sel = null; lit(); openPanel(followPanel(list)); });
  box.append(b);
}

function followPanel(list) {
  const out = el('div');
  out.append(el('p', 'p-kind', S.board.company.name), el('h2', '', 'What to ask next'), el('p', 'p-sub', `Pick one to copy it, then paste it into ${who()}.`));
  const s = el('section', 'p-sec');
  const wrap = el('div', 'p-links');
  for (const q of list) {
    const b = el('button', 'btn p-ask', q);
    b.addEventListener('click', () => copy(q));
    wrap.append(b);
  }
  s.append(wrap);
  out.append(s);
  return out;
}

let toastTimer = 0;
function toast(text) {
  const t = $('toast');
  t.replaceChildren(el('span', '', text));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.replaceChildren(), 2600);
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast(`Copied. Paste it into ${who()}.`); } catch { toast('Copying is blocked here. Type the question to your assistant instead.'); }
}

// ---- Drawing a map ----------------------------------------------------------

function makeBox(n) {
  const kind = S.kinds[n.kind] || { name: '', ink: 'ink' };
  const b = el('div', `box ink-${kind.ink}`);
  b.dataset.id = n.id;
  b.tabIndex = 0;
  b.setAttribute('role', 'button');
  b.setAttribute('aria-label', `${kind.name}: ${n.label}${n.value ? `, ${n.value}` : ''}. Open details`);
  b.append(el('span', 'box-kind', kind.name), el('span', 'box-label', n.label));
  if (n.sub) b.append(el('span', 'box-sub', n.sub));
  if (n.value) {
    const v = el('span', `box-value${n.basis === 'estimate' ? ' is-estimate' : ''}`);
    v.append(el('span', '', n.value));
    if (n.basis === 'estimate' || n.basis === 'view') v.append(el('span', 'box-basis', n.basis === 'estimate' ? 'estimate' : 'opinion'));
    b.append(v);
  }
  return b;
}

function makeLink(e) {
  const g = sv('g', `link k-${e.kind}`);
  const line = sv('path', 'link-line');
  const pulse = sv('path', 'link-pulse');
  const hit = sv('path', 'link-hit');
  g.dataset.edge = e.id;
  g.append(line, pulse, hit);
  $('link-layer').append(g);
  let tag = null;
  if (e.label) {
    tag = el('button', 'tag', e.label);
    tag.dataset.edge = e.id;
    $('tags').append(tag);
  }
  return { edge: e, g, line, pulse, hit, tag, timer: 0, pen: null, wide: false, at: null };
}

function place(id) {
  const b = V.boxes.get(id);
  b.style.left = `${V.pos[id].x}px`;
  b.style.top = `${V.pos[id].y}px`;
}

function route() {
  const m = V.map;
  const routes = m.layout === 'hub' ? routeHub(V.pos, m.edges) : routeColumns(V.pos, m.edges);
  for (const [id, r] of Object.entries(routes)) {
    const L = V.links.get(id);
    for (const p of [L.line, L.pulse, L.hit]) p.setAttribute('d', r.d);
    L.wide = r.width > 5;
    L.line.setAttribute('stroke-width', r.width);
    L.pulse.setAttribute('stroke-width', L.wide ? clamp(r.width * 0.3, 2.5, 5) : r.width + 3.5);
    L.hit.setAttribute('stroke-width', Math.max(18, r.width + 10));
    L.g.classList.toggle('is-wide', L.wide);
    if (L.tag) {
      const p = L.at === null ? r.mid : L.line.getPointAtLength(L.line.getTotalLength() * L.at);
      L.tag.style.left = `${p.x}px`; L.tag.style.top = `${p.y}px`;
    }
  }
}

function finishLink(L) {
  clearTimeout(L.timer);
  L.pen?.remove();
  L.pen = null;
  L.line.classList.remove('is-drawing');
  L.line.style.strokeDasharray = '';
  L.line.style.strokeDashoffset = '';
  L.g.classList.remove('is-pending');
  L.g.classList.add('is-drawn');
  L.tag?.classList.remove('is-pending');
  // A thick band reads as a flow by itself; an arrowhead on it would be huge. Rivals pull both ways, so no arrow there either.
  if (!L.wide && L.edge.kind !== 'competes') L.line.setAttribute('marker-end', `url(#tip-${TIP[L.edge.kind] || 'ink'})`);
}

function drawLink(L) {
  L.g.classList.remove('is-pending');
  const len = L.line.getTotalLength();
  L.line.style.strokeDasharray = `${len} ${len}`;
  L.line.style.strokeDashoffset = `${len}`;
  L.line.getBoundingClientRect(); // makes the browser take the starting point before the line starts moving
  L.line.classList.add('is-drawing');
  L.line.style.strokeDashoffset = '0';
  // A pen tip rides the end of the line while it is drawn.
  const pen = sv('circle', 'pen');
  pen.setAttribute('r', clamp(Number(L.line.getAttribute('stroke-width')) / 2 + 2, 4.5, 12));
  L.g.append(pen);
  L.pen = pen;
  const ride = () => {
    if (L.pen !== pen) return;
    const left = parseFloat(getComputedStyle(L.line).strokeDashoffset) || 0;
    const p = L.line.getPointAtLength(len - left);
    pen.setAttribute('cx', p.x);
    pen.setAttribute('cy', p.y);
    requestAnimationFrame(ride);
  };
  ride();
  L.timer = setTimeout(() => finishLink(L), 480);
}

function stopBuild() {
  if (S.build) clearTimeout(S.build.timer);
  S.build = null;
}

/** Puts every box and link in its finished state at once. Safe to call at any time. */
function finishBuild() {
  stopBuild();
  for (const b of V.boxes.values()) b.classList.remove('is-pending', 'is-in');
  for (const L of V.links.values()) finishLink(L);
}

function play() {
  const m = V.map;
  const steps = buildOrder(m.nodes, m.edges, V.pos);
  for (const b of V.boxes.values()) b.classList.add('is-pending');
  for (const L of V.links.values()) { L.g.classList.add('is-pending'); L.g.classList.remove('is-drawn'); L.line.removeAttribute('marker-end'); L.tag?.classList.add('is-pending'); }
  const run = { i: 0, timer: 0, started: performance.now(), budget: steps.length * 230 + 1000 };
  S.build = run;
  const next = () => {
    if (S.build !== run) return;
    // If the page went out of view, or its timers are running far behind, finish at once.
    if (still() || performance.now() - run.started > run.budget * 3) return finishBuild();
    const st = steps[run.i++];
    if (!st) { S.build = null; return undefined; }
    if (st.node) {
      const b = V.boxes.get(st.node);
      b.classList.remove('is-pending');
      b.classList.add('is-in');
      reveal(st.node);
    } else drawLink(V.links.get(st.edge));
    run.timer = setTimeout(next, st.node ? 200 : 170);
    return undefined;
  };
  next();
}

function draw(animate) {
  stopBuild();
  for (const L of V.links.values()) clearTimeout(L.timer);
  $('boxes').replaceChildren(); $('tags').replaceChildren(); $('heads').replaceChildren(); $('link-layer').replaceChildren(); $('marks').replaceChildren();
  V.boxes.clear(); V.links.clear();
  const m = currentMap();
  V.map = m;
  V.bounds = null;
  world.classList.remove('has-focus');
  if (!m) return setCam({ x: 0, y: 0, z: 1 });

  for (const n of m.nodes) { const b = makeBox(n); V.boxes.set(n.id, b); $('boxes').append(b); }
  const sized = m.nodes.map((n) => ({ ...n, h: V.boxes.get(n.id).offsetHeight || 80 }));
  const lay = m.layout === 'hub' ? layoutHub(sized) : layoutColumns(sized, m.edges, m.columns);
  V.pos = lay.pos;
  const moved = S.moved.get(m.id) || {};
  for (const [id, p] of Object.entries(moved)) if (V.pos[id]) Object.assign(V.pos[id], p);
  for (const n of m.nodes) place(n.id);
  for (const h of lay.heads) { const d = el('div', 'head', h.text); d.style.left = `${h.x}px`; d.style.top = `${h.y}px`; $('heads').append(d); }
  for (const g of lay.labels) { const d = el('div', `group-name${g.align === 'center' ? '' : ` is-${g.align}`}`, g.text); d.style.left = `${g.x}px`; d.style.top = `${g.y}px`; $('heads').append(d); }
  // Several links fanning out of one box (or into one) with the same words get the words once,
  // written near the box they share. The details of each link still carry its own label.
  const once = new Map(); // edge id -> where along the link its label sits; absent means no label is shown
  const fans = new Map();
  for (const e of m.edges) {
    if (!e.label) continue;
    for (const key of [`out|${e.from}|${e.label}`, `in|${e.to}|${e.label}`]) { if (!fans.has(key)) fans.set(key, []); fans.get(key).push(e.id); }
  }
  const dropped = new Set();
  for (const [key, ids] of fans) {
    const live = ids.filter((id) => !dropped.has(id));
    if (live.length < 2) continue;
    const keep = live[Math.floor((live.length - 1) / 2)];
    for (const id of live) if (id !== keep) dropped.add(id);
    once.set(keep, key.startsWith('out') ? 0.2 : 0.8);
  }
  for (const e of m.edges) {
    const L = makeLink(dropped.has(e.id) ? { ...e, label: '' } : e);
    L.edge = e;
    L.at = once.get(e.id) ?? null;
    V.links.set(e.id, L);
  }
  route();
  V.bounds = lay.bounds;
  fit(false, true);
  if (animate && !still()) play(); else finishBuild();
  return lit();
}

// ---- Moving around the board ------------------------------------------------

function setCam(cam, glide) {
  S.cam = cam;
  world.classList.toggle('is-gliding', !!glide && !still());
  world.style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})`;
  const step = 26 * cam.z * (cam.z < 0.55 ? 2 : 1);
  board.style.backgroundSize = `${step}px ${step}px`;
  board.style.backgroundPosition = `${cam.x}px ${cam.y}px`;
}

// The part of the window the map can use. The title sits top left, so the map goes either
// beside it or under it, whichever lets it be drawn larger.
function frame(b, glide, maxZoom = 1.1, readable = false) {
  const W = innerWidth;
  const H = innerHeight;
  const w = Math.max(b.x1 - b.x0, 1);
  const h = Math.max(b.y1 - b.y0, 1);
  const right = !$('panel').hidden && W > 900 ? $('panel').offsetWidth + 24 : 30;
  // Whatever sits along the bottom edge (the walk, or the status and tools, which stack on a narrow window) is kept clear.
  const bottom = S.walk ? $('walk').offsetHeight + 44 : Math.max(104, H - document.querySelector('.foot').getBoundingClientRect().top + 14);
  const title = $('title').getBoundingClientRect();
  const tabsBottom = $('tabs').getBoundingClientRect().bottom;
  const beside = { l: title.right + 34, t: tabsBottom + 26 };
  const under = { l: 34, t: Math.max(title.bottom, tabsBottom) + 20 };
  const zoomFor = (a) => Math.min((W - a.l - right) / w, (H - a.t - bottom) / h);
  const a = W > 900 && zoomFor(beside) >= zoomFor(under) ? beside : under;
  let z = clamp(zoomFor(a), 0.22, maxZoom);
  let x = a.l + (W - a.l - right - w * z) / 2 - b.x0 * z;
  let y = a.t + (H - a.t - bottom - h * z) / 2 - b.y0 * z;
  // In a small window a whole map would be too small to read. It then opens at a readable size
  // on the start of the flow, and the view follows the drawing. "Fit" still shows all of it.
  if (readable && z < TOO_SMALL) {
    z = READABLE;
    x = a.l - b.x0 * z;
    y = Math.max(a.t + (H - a.t - bottom - h * z) / 2 - b.y0 * z, a.t - b.y0 * z);
    if (w * z <= W - a.l - right) x = a.l + (W - a.l - right - w * z) / 2 - b.x0 * z;
  }
  setCam({ x, y, z }, glide);
}

const TOO_SMALL = 0.5; // below this, text on a fitted map is too small to read
const READABLE = 0.62;

function fit(glide, readable = false) {
  if (V.bounds) frame(V.bounds, glide, 1.1, readable);
}

/** Slides the view just far enough to bring one box into the open part of the window. */
function reveal(id) {
  const p = V.pos[id];
  if (!p) return;
  const { x, y, z } = S.cam;
  const W = innerWidth;
  const H = innerHeight;
  const right = !$('panel').hidden && W > 900 ? $('panel').offsetWidth + 24 : 30;
  const top = Math.max($('tabs').getBoundingClientRect().bottom, W > 900 ? 0 : $('title').getBoundingClientRect().bottom) + 20;
  const bottom = Math.max(104, H - document.querySelector('.foot').getBoundingClientRect().top + 14);
  const box = { l: p.x * z + x, t: p.y * z + y, r: (p.x + p.w) * z + x, b: (p.y + p.h) * z + y };
  let dx = 0;
  let dy = 0;
  if (box.r > W - right) dx = W - right - box.r - 40; else if (box.l < 30) dx = 30 - box.l + 40;
  if (box.b > H - bottom) dy = H - bottom - box.b - 20; else if (box.t < top) dy = top - box.t + 20;
  if (dx || dy) setCam({ x: x + dx, y: y + dy, z }, true);
}

function zoomBy(f, cx = innerWidth / 2, cy = innerHeight / 2, glide = false) {
  const z = clamp(S.cam.z * f, 0.2, 2.4);
  const k = z / S.cam.z;
  setCam({ x: cx - (cx - S.cam.x) * k, y: cy - (cy - S.cam.y) * k, z }, glide);
}

let drag = null;
let routeQueued = false;
board.addEventListener('pointerdown', (ev) => {
  if (ev.button !== 0) return;
  const box = ev.target.closest('.box');
  const link = ev.target.closest('.tag, .link');
  drag = { box: box ? box.dataset.id : null, edge: link ? link.dataset.edge : null, x: ev.clientX, y: ev.clientY, cam: { ...S.cam }, from: box ? { ...V.pos[box.dataset.id] } : null, moved: false };
  board.setPointerCapture(ev.pointerId);
});
board.addEventListener('pointermove', (ev) => {
  if (!drag) return;
  const dx = ev.clientX - drag.x;
  const dy = ev.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) < 4) return;
  drag.moved = true;
  world.classList.remove('is-gliding');
  if (drag.box) {
    finishBuild();
    V.boxes.get(drag.box).classList.add('is-dragging');
    V.pos[drag.box].x = drag.from.x + dx / S.cam.z;
    V.pos[drag.box].y = drag.from.y + dy / S.cam.z;
    place(drag.box);
    if (!routeQueued) { routeQueued = true; requestAnimationFrame(() => { routeQueued = false; if (V.map) route(); }); }
  } else {
    board.classList.add('is-panning');
    setCam({ x: drag.cam.x + dx, y: drag.cam.y + dy, z: S.cam.z });
  }
});
const drop = () => {
  if (!drag) return;
  const d = drag;
  drag = null;
  board.classList.remove('is-panning');
  if (d.box) V.boxes.get(d.box)?.classList.remove('is-dragging');
  if (d.moved) {
    if (d.box && V.map) {
      const saved = S.moved.get(V.map.id) || {};
      saved[d.box] = { x: V.pos[d.box].x, y: V.pos[d.box].y };
      S.moved.set(V.map.id, saved);
      route();
      V.bounds = boundsOf(V.pos, $('heads').children.length ? -64 : 0);
    }
    return;
  }
  if (S.walk) return;
  if (d.box) pick({ node: d.box });
  else if (d.edge) pick({ edge: d.edge });
  else pick(null);
};
board.addEventListener('pointerup', drop);
board.addEventListener('pointercancel', drop);

board.addEventListener('wheel', (ev) => {
  ev.preventDefault();
  world.classList.remove('is-gliding');
  // Pinching a trackpad arrives with ctrl held. A mouse wheel arrives in big whole steps, and zooms too.
  const wheelMouse = ev.deltaX === 0 && Math.abs(ev.deltaY) >= 50 && Number.isInteger(ev.deltaY);
  if (ev.ctrlKey || ev.metaKey || wheelMouse) zoomBy(Math.exp(-ev.deltaY * (wheelMouse ? 0.0022 : 0.012)), ev.clientX, ev.clientY);
  else setCam({ x: S.cam.x - ev.deltaX, y: S.cam.y - ev.deltaY, z: S.cam.z });
}, { passive: false });

world.addEventListener('pointerover', (ev) => {
  if (drag || S.walk) return;
  const box = ev.target.closest('.box');
  const id = box ? box.dataset.id : null;
  if (id !== S.hover) { S.hover = id; lit(); }
});
board.addEventListener('pointerleave', () => { if (S.hover) { S.hover = null; lit(); } });
$('boxes').addEventListener('keydown', (ev) => {
  const box = ev.target.closest('.box');
  if (box && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); pick({ node: box.dataset.id }); }
});

// ---- What is lit, picked and highlighted --------------------------------------

function lit() {
  const m = V.map;
  if (!m) return;
  let nodes = null;
  let edges = null;
  let marked = new Set();
  if (S.walk) {
    nodes = new Set(m.walkthrough[S.walk.i].focus);
    edges = new Set(m.edges.filter((e) => nodes.has(e.from) && nodes.has(e.to)).map((e) => e.id));
    marked = nodes;
  } else {
    const at = S.hover || S.sel?.node;
    if (at) {
      nodes = new Set([at]);
      edges = new Set();
      for (const e of m.edges) if (e.from === at || e.to === at) { edges.add(e.id); nodes.add(e.from); nodes.add(e.to); }
    } else if (S.sel?.edge) {
      const e = m.edges.find((x) => x.id === S.sel.edge);
      if (e) { nodes = new Set([e.from, e.to]); edges = new Set([e.id]); }
    }
  }
  world.classList.toggle('has-focus', !!nodes);
  // A swipe of highlighter sits on the board behind each box the walk is talking about.
  $('marks').replaceChildren(...[...marked].filter((id) => V.pos[id]).map((id) => {
    const p = V.pos[id];
    const d = el('div', 'mark');
    d.style.left = `${p.x - 12}px`; d.style.top = `${p.y - 10}px`;
    d.style.width = `${p.w + 24}px`; d.style.height = `${p.h + 20}px`;
    return d;
  }));
  for (const [id, b] of V.boxes) {
    b.classList.toggle('is-lit', !!nodes && nodes.has(id));
    b.classList.toggle('is-marked', marked.has(id));
    b.classList.toggle('is-picked', S.sel?.node === id);
  }
  for (const [id, L] of V.links) {
    const on = !!edges && edges.has(id);
    const picked = S.sel?.edge === id;
    L.g.classList.toggle('is-lit', on); L.g.classList.toggle('is-picked', picked);
    L.tag?.classList.toggle('is-lit', on); L.tag?.classList.toggle('is-picked', picked);
  }
}

// ---- The details panel ----------------------------------------------------------

function section(title) {
  const s = el('section', 'p-sec');
  s.append(el('h3', '', title));
  return s;
}

function sourceList(ids) {
  const ul = el('ul', 'p-src');
  for (const src of ids.map((id) => S.board.sources.find((s) => s.id === id)).filter(Boolean)) {
    const li = el('li');
    // Only ordinary web addresses become links.
    if (/^https?:\/\//i.test(src.url)) {
      const a = el('a', '', src.title);
      a.href = src.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      li.append(a);
    } else li.append(el('span', '', src.title));
    const meta = [src.publisher, src.date].filter(Boolean).join(', ');
    if (meta) li.append(el('small', '', meta));
    ul.append(li);
  }
  return ul;
}

function nodePanel(n) {
  const m = V.map;
  const kind = S.kinds[n.kind] || { name: '', ink: 'ink' };
  const out = el('div', `ink-${kind.ink === 'solid' || kind.ink === 'mark' ? 'ink' : kind.ink}`);
  out.append(el('p', 'p-kind', kind.name), el('h2', '', n.label));
  if (n.sub) out.append(el('p', 'p-sub', n.sub));
  if (n.value) {
    const f = el('div', 'p-figure');
    f.append(el('b', '', n.value), el('span', '', n.basis === 'estimate' ? 'An estimate, worked out by the assistant. Not a reported figure.' : n.basis === 'view' ? 'An opinion, not a reported figure.' : 'Reported. The source is below.'));
    out.append(f);
  }
  out.append(el('p', 'p-text', n.detail));
  const near = m.edges.filter((e) => e.from === n.id || e.to === n.id);
  if (near.length) {
    const s = section('Linked to');
    const list = el('div', 'p-links');
    for (const e of near) {
      const outward = e.from === n.id;
      const other = m.nodes.find((x) => x.id === (outward ? e.to : e.from));
      const b = el('button', 'p-link');
      b.append(el('span', '', outward ? 'To ' : 'From '), el('b', '', other.label), el('span', '', e.label ? ` (${e.label})` : ''));
      b.addEventListener('click', () => pick({ node: other.id }));
      list.append(b);
    }
    s.append(list);
    out.append(s);
  }
  if (n.source.length) { const s = section('Where this comes from'); s.append(sourceList(n.source)); out.append(s); }
  const ask = section('Want more?');
  const q = `On the whiteboard for ${S.board.company.name}, go deeper on "${n.label}" in the ${m.title} map.`;
  const b = el('button', 'btn p-ask', `Copy a question about this for ${who()}`);
  b.addEventListener('click', () => copy(q));
  ask.append(b);
  out.append(ask);
  return out;
}

function edgePanel(e) {
  const m = V.map;
  const a = m.nodes.find((n) => n.id === e.from);
  const b = m.nodes.find((n) => n.id === e.to);
  const out = el('div');
  out.append(el('p', 'p-kind', 'Link'), el('h2', '', `${a.label} ${e.label || 'to'} ${b.label}`));
  out.append(el('p', 'p-sub', S.edgeKinds[e.kind] || ''));
  if (typeof e.weight === 'number') {
    const f = el('div', 'p-figure');
    f.append(el('b', '', `About ${Math.round(e.weight)} in every 100`), el('span', '', 'The thicker the line, the bigger the share.'));
    out.append(f);
  }
  if (e.detail) out.append(el('p', 'p-text', e.detail));
  const s = section('Between');
  const list = el('div', 'p-links');
  for (const n of [a, b]) { const btn = el('button', 'p-link'); btn.append(el('b', '', n.label)); btn.addEventListener('click', () => pick({ node: n.id })); list.append(btn); }
  s.append(list);
  out.append(s);
  if (e.source.length) { const src = section('Where this comes from'); src.append(sourceList(e.source)); out.append(src); }
  return out;
}

function sourcesPanel() {
  const out = el('div');
  out.append(el('p', 'p-kind', S.board.company.name), el('h2', '', 'Where the facts come from'));
  if (S.board.unchecked) out.append(el('p', 'p-text', 'This board was drawn without looking anything up. Treat every figure as unchecked.'));
  else if (!S.board.sources.length) out.append(el('p', 'p-text', 'No sources have been recorded yet.'));
  else { out.append(el('p', 'p-sub', 'Every figure marked as reported points to one of these. Open a box to see which.')); const s = el('section', 'p-sec'); s.append(sourceList(S.board.sources.map((x) => x.id))); out.append(s); }
  return out;
}

function keyPanel() {
  const m = V.map;
  const out = el('div');
  out.append(el('p', 'p-kind', m.title), el('h2', '', 'Reading this map'));
  const boxes = section('Boxes');
  const ul = el('ul', 'key');
  for (const k of [...new Set(m.nodes.map((n) => n.kind))]) {
    const li = el('li');
    li.append(el('span', `swatch ink-${S.kinds[k].ink}`), el('span', '', S.kinds[k].name));
    ul.append(li);
  }
  boxes.append(ul);
  const links = section('Links');
  const ul2 = el('ul', 'key');
  for (const k of [...new Set(m.edges.map((e) => e.kind))]) {
    const li = el('li');
    const s = sv('svg');
    s.setAttribute('width', '44'); s.setAttribute('height', '12');
    const g = sv('g', `link k-${k} is-drawn`);
    const p = sv('path', 'link-line');
    p.setAttribute('d', 'M2 6H42'); p.setAttribute('stroke-width', '2.5');
    g.append(p); s.append(g);
    li.append(s, el('span', '', S.edgeKinds[k]));
    ul2.append(li);
  }
  links.append(ul2);
  const figs = section('Figures');
  const ul3 = el('ul', 'key');
  for (const [name, text] of [['Reported', 'Taken from a source you can open.'], ['Estimate', 'Worked out by the assistant. Shown with a dashed outline.'], ['Opinion', 'A judgement, not a fact.']]) {
    const li = el('li');
    const d = el('span');
    d.append(el('span', '', name), el('small', '', text));
    li.append(el('span', `box-value${name === 'Estimate' ? ' is-estimate' : ''}`, '12%'), d);
    ul3.append(li);
  }
  figs.append(ul3);
  out.append(boxes, links, figs, el('p', 'p-note', 'Blue is the world outside the company. Green is money coming in and what helps. Red is money going out and what hurts. Yellow marks what to keep an eye on.'));
  return out;
}

function openPanel(body) {
  $('panel-body').replaceChildren(body);
  const was = $('panel').hidden;
  $('panel').hidden = false;
  $('panel').scrollTop = 0;
  if (was) fit(true, true);
}

function closePanel(quiet) {
  if ($('panel').hidden) return;
  $('panel').hidden = true;
  if (!quiet) fit(true, true);
}

function pick(sel) {
  const m = V.map;
  S.sel = sel;
  S.hover = null;
  if (!sel || !m) { closePanel(); return lit(); }
  const n = sel.node && m.nodes.find((x) => x.id === sel.node);
  const e = sel.edge && m.edges.find((x) => x.id === sel.edge);
  if (n) openPanel(nodePanel(n)); else if (e) openPanel(edgePanel(e)); else S.sel = null;
  return lit();
}

// ---- The walk -------------------------------------------------------------------

function startWalk() {
  const m = V.map;
  if (!m || !m.walkthrough.length) return;
  finishBuild();
  S.sel = null; S.hover = null;
  closePanel(true);
  S.walk = { i: 0 };
  document.body.classList.add('is-walking');
  $('walk').hidden = false;
  $('walk-start').hidden = true;
  stepWalk(0);
}

function stepWalk(i) {
  const steps = V.map.walkthrough;
  S.walk.i = clamp(i, 0, steps.length - 1);
  const st = steps[S.walk.i];
  $('walk-count').textContent = `Step ${S.walk.i + 1} of ${steps.length}`;
  $('walk-title').textContent = st.title;
  $('walk-title').hidden = !st.title;
  $('walk-text').textContent = st.text;
  $('walk-back').disabled = S.walk.i === 0;
  $('walk-next').textContent = S.walk.i === steps.length - 1 ? 'Finish' : 'Next';
  $('walk-dots').replaceChildren(...steps.map((_, k) => el('i', k === S.walk.i ? 'is-on' : k < S.walk.i ? 'is-past' : '')));
  lit();
  // The view moves in on what this step is about, with some of the map around it for bearings.
  const b = boundsOf(Object.fromEntries(st.focus.map((id) => [id, V.pos[id]])));
  frame({ x0: b.x0 - 150, y0: b.y0 - 90, x1: b.x1 + 150, y1: b.y1 + 90 }, true, 1.05);
}

function endWalk(quiet) {
  if (!S.walk) return;
  S.walk = null;
  document.body.classList.remove('is-walking');
  $('walk').hidden = true;
  $('walk-start').hidden = !V.map;
  if (!quiet) { lit(); fit(true, true); }
}

// ---- Buttons and keys --------------------------------------------------------------

$('walk-start').addEventListener('click', startWalk);
$('walk-close').addEventListener('click', () => endWalk());
$('walk-back').addEventListener('click', () => stepWalk(S.walk.i - 1));
$('walk-next').addEventListener('click', () => (S.walk.i === V.map.walkthrough.length - 1 ? endWalk() : stepWalk(S.walk.i + 1)));
$('panel-close').addEventListener('click', () => pick(null));
$('zoom-in').addEventListener('click', () => zoomBy(1.25, undefined, undefined, true));
$('zoom-out').addEventListener('click', () => zoomBy(0.8, undefined, undefined, true));
$('zoom-fit').addEventListener('click', () => fit(true));
$('redraw').addEventListener('click', () => { if (!V.map) return; S.sel = null; closePanel(true); endWalk(true); draw(true); });
$('show-sources').addEventListener('click', () => { S.sel = null; lit(); openPanel(sourcesPanel()); });
$('show-key').addEventListener('click', () => { if (V.map) { S.sel = null; lit(); openPanel(keyPanel()); } });

addEventListener('keydown', (ev) => {
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  if (S.walk) {
    if (ev.key === 'ArrowRight') $('walk-next').click();
    else if (ev.key === 'ArrowLeft' && S.walk.i > 0) stepWalk(S.walk.i - 1);
    else if (ev.key === 'Escape') endWalk();
    return;
  }
  if (ev.key === 'Escape') pick(null);
  else if (/^[1-9]$/.test(ev.key) && S.board) {
    const all = [...S.baseMaps, ...S.board.maps.filter((m) => !S.baseMaps.some((x) => x.id === m.id))];
    const t = all[Number(ev.key) - 1];
    if (t) openMap(t.id, true);
  } else if (ev.key === 'f') fit(true);
  else if (ev.key === 'w') startWalk();
});
addEventListener('resize', () => { if (S.walk) stepWalk(S.walk.i); else fit(false, true); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return finishBuild();
  // Back on the page: draw the map that arrived while it was out of view.
  if (S.mapId && S.fresh.delete(S.mapId)) { chrome(); draw(true); }
  return undefined;
});

fetchState().then((d) => { setBoard(d); listen(); }).catch(() => { $('status').textContent = 'The whiteboard server is not answering. Ask your assistant to open the whiteboard again.'; });
