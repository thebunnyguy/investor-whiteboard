// Where each box goes, and the path each link takes. Pure arithmetic with no page access, so
// the same file runs in the browser and in the tests.
//
// Two arrangements: "columns", where the assistant says which column each box belongs to and
// the flow reads left to right, and "hub", where the company sits in the middle with everything
// else around it.

export const NODE_W = 236;
const GAP_X = 172; // room between columns for a link and its label
const GAP_Y = 30;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

function neighbours(nodes, edges) {
  const nb = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    if (!nb.has(e.from) || !nb.has(e.to)) continue;
    nb.get(e.from).push(e.to);
    nb.get(e.to).push(e.from);
  }
  return nb;
}

/**
 * nodes: [{ id, col, h }] in the order the assistant listed them. Returns each box's top-left
 * corner and size, the x of every column, and the bounds of the whole map.
 */
export function layoutColumns(nodes, edges, columns = []) {
  const cols = [...new Set(nodes.map((n) => n.col))].sort((a, b) => a - b);
  const colAt = new Map(cols.map((c, i) => [c, i]));
  const byCol = cols.map(() => []);
  for (const n of nodes) byCol[colAt.get(n.col)].push(n);
  const where = new Map(nodes.map((n) => [n.id, colAt.get(n.col)]));
  const nb = neighbours(nodes, edges);

  // Order inside each column so that linked boxes sit level with each other and links cross less.
  // A box with no link outside its column keeps the place the assistant gave it.
  const rank = new Map();
  const rerank = (col) => col.forEach((n, k) => rank.set(n.id, col.length === 1 ? 0.5 : k / (col.length - 1)));
  byCol.forEach(rerank);
  for (let sweep = 0; sweep < 6; sweep++) {
    const order = byCol.map((_, i) => (sweep % 2 ? byCol.length - 1 - i : i));
    for (const ci of order) {
      const col = byCol[ci];
      const key = new Map(col.map((n) => {
        const out = nb.get(n.id).filter((id) => where.get(id) !== ci);
        return [n.id, out.length ? mean(out.map((id) => rank.get(id))) : rank.get(n.id)];
      }));
      const listed = new Map(col.map((n, k) => [n.id, k]));
      col.sort((a, b) => key.get(a.id) - key.get(b.id) || listed.get(a.id) - listed.get(b.id));
      rerank(col);
    }
  }

  const pos = {};
  byCol.forEach((col, ci) => {
    const height = col.reduce((s, n) => s + n.h, 0) + GAP_Y * (col.length - 1);
    let y = -height / 2;
    for (const n of col) { pos[n.id] = { x: ci * (NODE_W + GAP_X), y, w: NODE_W, h: n.h }; y += n.h + GAP_Y; }
  });
  // Then slide each column so its boxes line up with what they are linked to, never overlapping.
  for (let pass = 0; pass < 8; pass++) {
    const order = byCol.map((_, i) => (pass % 2 ? byCol.length - 1 - i : i));
    for (const ci of order) {
      const col = byCol[ci];
      const want = col.map((n) => {
        const out = nb.get(n.id).filter((id) => where.get(id) !== ci);
        return out.length ? mean(out.map((id) => pos[id].y + pos[id].h / 2)) : pos[n.id].y + n.h / 2;
      });
      const ys = [];
      let floor = -Infinity;
      col.forEach((n, k) => { const y = Math.max(want[k] - n.h / 2, floor); ys.push(y); floor = y + n.h + GAP_Y; });
      const shift = mean(want) - mean(ys.map((y, k) => y + col[k].h / 2));
      col.forEach((n, k) => { pos[n.id].y = ys[k] + shift; });
    }
  }

  const top = Math.min(...nodes.map((n) => pos[n.id].y));
  for (const n of nodes) pos[n.id].y = Math.round(pos[n.id].y - top);
  const heads = cols.map((c, i) => ({ x: i * (NODE_W + GAP_X), y: -52, w: NODE_W, text: columns[c] || '' })).filter((h) => h.text);
  const bounds = boundsOf(pos, heads.length ? -64 : 0);
  // Two boxes in one column are joined by a link that loops out to the right, so it needs room there.
  if (edges.some((e) => pos[e.from] && pos[e.to] && pos[e.from].x === pos[e.to].x)) bounds.x1 += 84;
  return { pos, heads, labels: [], bounds };
}

/** nodes: [{ id, h, center, group }]. The centre box is the hub; the rest sit on an oval, grouped. */
export function layoutHub(nodes) {
  const hub = nodes.find((n) => n.center) || nodes[0];
  const groups = [];
  for (const n of nodes) if (n !== hub && !groups.includes(n.group || '')) groups.push(n.group || '');
  const ring = groups.flatMap((g) => nodes.filter((n) => n !== hub && (n.group || '') === g));
  const count = Math.max(ring.length, 1);
  const rx = Math.min(760, Math.max(400, 300 + 34 * count));
  const ry = rx * 0.6;
  const pos = { [hub.id]: { x: -NODE_W / 2, y: -hub.h / 2, w: NODE_W, h: hub.h } };
  const angle = new Map();
  ring.forEach((n, k) => {
    const a = -Math.PI / 2 + ((k + 0.5) / count) * Math.PI * 2;
    angle.set(n.id, a);
    pos[n.id] = { x: Math.round(Math.cos(a) * rx - NODE_W / 2), y: Math.round(Math.sin(a) * ry - n.h / 2), w: NODE_W, h: n.h };
  });
  // Each group gets its name written just outside the oval, at the middle of its boxes.
  const labels = groups.filter(Boolean).map((g) => {
    const a = mean(ring.filter((n) => (n.group || '') === g).map((n) => angle.get(n.id)));
    const x = Math.cos(a) * (rx + NODE_W / 2 + 34);
    const y = Math.sin(a) * (ry + 86);
    return { text: g, x: Math.round(x), y: Math.round(y), align: Math.abs(Math.cos(a)) < 0.35 ? 'center' : Math.cos(a) > 0 ? 'left' : 'right' };
  });
  const b = boundsOf(pos, 0);
  // A group's name is written outward from its anchor, so only the side it grows toward needs room.
  for (const l of labels) {
    const w = l.text.length * 9.5 + 12;
    const [x0, x1] = l.align === 'center' ? [l.x - w / 2, l.x + w / 2] : l.align === 'left' ? [l.x, l.x + w] : [l.x - w, l.x];
    b.x0 = Math.min(b.x0, x0); b.x1 = Math.max(b.x1, x1); b.y0 = Math.min(b.y0, l.y - 16); b.y1 = Math.max(b.y1, l.y + 16);
  }
  return { pos, heads: [], labels, bounds: b };
}

export function boundsOf(pos, topPad = 0) {
  const boxes = Object.values(pos);
  return {
    x0: Math.min(...boxes.map((p) => p.x)),
    y0: Math.min(...boxes.map((p) => p.y)) + topPad,
    x1: Math.max(...boxes.map((p) => p.x + p.w)),
    y1: Math.max(...boxes.map((p) => p.y + p.h))
  };
}

/** How thick a link is drawn. A weight is a share of the whole, so the thick lines carry the most. */
export const strokeOf = (edge) => (typeof edge.weight === 'number' ? Math.max(2, Math.min(26, 1.5 + edge.weight * 0.3)) : 2);

function cubicAt(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return { x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x, y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y };
}

/**
 * Paths for a columns map. Links leave the side of a box that faces where they are going, and
 * links sharing a side are stacked by thickness instead of meeting at one point.
 */
export function routeColumns(pos, edges) {
  const side = (e) => {
    const a = pos[e.from];
    const b = pos[e.to];
    if (Math.abs(a.x - b.x) < 1) return ['right', 'right'];
    return a.x < b.x ? ['right', 'left'] : ['left', 'right'];
  };
  const ports = new Map(); // "box|side" -> [{ edge, end, otherY, width }]
  for (const e of edges) {
    const [sa, sb] = side(e);
    const width = strokeOf(e);
    for (const [id, s, end, other] of [[e.from, sa, 'a', e.to], [e.to, sb, 'b', e.from]]) {
      const key = `${id}|${s}`;
      if (!ports.has(key)) ports.set(key, []);
      ports.get(key).push({ edge: e, end, width, otherY: pos[other].y + pos[other].h / 2 });
    }
  }
  const at = new Map(); // edge id -> { a: y, b: y }
  for (const [key, list] of ports) {
    const box = pos[key.split('|')[0]];
    list.sort((p, q) => p.otherY - q.otherY);
    const gap = 7;
    let total = list.reduce((s, p) => s + p.width, 0) + gap * (list.length - 1);
    // When the stack is taller than the box, it is squeezed to fit rather than spilling past the corners.
    const room = Math.max(box.h - 18, 10);
    const scale = total > room ? room / total : 1;
    total *= scale;
    let y = box.y + box.h / 2 - total / 2;
    for (const p of list) {
      const w = p.width * scale;
      if (!at.has(p.edge.id)) at.set(p.edge.id, {});
      at.get(p.edge.id)[p.end] = y + w / 2;
      y += w + gap * scale;
    }
  }
  // A link that skips a column must not pass behind the boxes in between, where it would look
  // as if it joined them. It is steered through the nearest free space in each column it crosses.
  const columns = new Map();
  for (const box of Object.values(pos)) {
    if (!columns.has(box.x)) columns.set(box.x, []);
    columns.get(box.x).push(box);
  }
  for (const boxes of columns.values()) boxes.sort((p, q) => p.y - q.y);
  const freeY = (boxes, y, width) => {
    const half = width / 2 + 9;
    if (!boxes.some((bx) => y + half > bx.y && y - half < bx.y + bx.h)) return y;
    const slots = [boxes[0].y - half - 4, boxes[boxes.length - 1].y + boxes[boxes.length - 1].h + half + 4];
    for (let i = 0; i + 1 < boxes.length; i++) {
      const top = boxes[i].y + boxes[i].h;
      const gap = boxes[i + 1].y - top;
      if (gap >= width + 10) slots.push(top + gap / 2);
    }
    return slots.reduce((best, sy) => (Math.abs(sy - y) < Math.abs(best - y) ? sy : best));
  };
  const r = (v) => Math.round(v * 10) / 10;
  const curve = (p, q) => {
    const reach = Math.max(30, Math.abs(q.x - p.x) * 0.5) * Math.sign(q.x - p.x || 1);
    return { p1: { x: p.x + reach, y: p.y }, p2: { x: q.x - reach, y: q.y } };
  };
  const out = {};
  const perGap = new Map();
  for (const e of edges) {
    const a = pos[e.from];
    const b = pos[e.to];
    const [sa, sb] = side(e);
    const width = strokeOf(e);
    const p0 = { x: sa === 'right' ? a.x + a.w : a.x, y: at.get(e.id).a };
    const p3 = { x: sb === 'right' ? b.x + b.w : b.x, y: at.get(e.id).b };
    // Labels of links crossing the same gap are staggered so they don't sit on top of each other.
    const gapKey = `${Math.min(a.x, b.x)}|${Math.max(a.x, b.x)}`;
    const k = perGap.get(gapKey) || 0;
    perGap.set(gapKey, k + 1);
    if (sa === sb) {
      const p1 = { x: p0.x + 70, y: p0.y };
      const p2 = { x: p3.x + 70, y: p3.y };
      out[e.id] = { d: `M${r(p0.x)} ${r(p0.y)}C${r(p1.x)} ${r(p1.y)} ${r(p2.x)} ${r(p2.y)} ${r(p3.x)} ${r(p3.y)}`, mid: cubicAt(p0, p1, p2, p3, 0.5), width };
      continue;
    }
    const dir = Math.sign(p3.x - p0.x);
    const between = [...columns.keys()].filter((x) => (dir > 0 ? x > a.x && x < b.x : x < a.x && x > b.x)).sort((x, y) => (x - y) * dir);
    let cur = p0;
    let d = `M${r(p0.x)} ${r(p0.y)}`;
    let mid = null;
    for (const x of between) {
      const boxes = columns.get(x);
      const w = boxes[0].w;
      const straight = p0.y + ((p3.y - p0.y) * (x + w / 2 - p0.x)) / (p3.x - p0.x || 1);
      const y = freeY(boxes, straight, width);
      const enter = { x: dir > 0 ? x - 16 : x + w + 16, y };
      const leave = { x: dir > 0 ? x + w + 16 : x - 16, y };
      const c = curve(cur, enter);
      if (!mid) mid = cubicAt(cur, c.p1, c.p2, enter, [0.5, 0.34, 0.66][k % 3]);
      d += `C${r(c.p1.x)} ${r(c.p1.y)} ${r(c.p2.x)} ${r(c.p2.y)} ${r(enter.x)} ${r(enter.y)}L${r(leave.x)} ${r(leave.y)}`;
      cur = leave;
    }
    const c = curve(cur, p3);
    if (!mid) mid = cubicAt(cur, c.p1, c.p2, p3, [0.5, 0.34, 0.66][k % 3]);
    d += `C${r(c.p1.x)} ${r(c.p1.y)} ${r(c.p2.x)} ${r(c.p2.y)} ${r(p3.x)} ${r(p3.y)}`;
    out[e.id] = { d, mid, width };
  }
  return out;
}

function edgeOfBox(box, toward) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const s = Math.min((box.w / 2 + 6) / Math.abs(dx || 1e-9), (box.h / 2 + 6) / Math.abs(dy || 1e-9));
  return { x: cx + dx * s, y: cy + dy * s };
}

/** Paths for a hub map: a gently bowed line from the edge of one box to the edge of the other. */
export function routeHub(pos, edges) {
  const out = {};
  for (const e of edges) {
    const a = pos[e.from];
    const b = pos[e.to];
    const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
    const cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    const p0 = edgeOfBox(a, cb);
    const p3 = edgeOfBox(b, ca);
    const dx = p3.x - p0.x;
    const dy = p3.y - p0.y;
    const bow = 0.08;
    const p1 = { x: p0.x + dx / 3 - dy * bow, y: p0.y + dy / 3 + dx * bow };
    const p2 = { x: p0.x + (dx * 2) / 3 - dy * bow, y: p0.y + (dy * 2) / 3 + dx * bow };
    const r = (v) => Math.round(v * 10) / 10;
    out[e.id] = { d: `M${r(p0.x)} ${r(p0.y)}C${r(p1.x)} ${r(p1.y)} ${r(p2.x)} ${r(p2.y)} ${r(p3.x)} ${r(p3.y)}`, mid: cubicAt(p0, p1, p2, p3, 0.5), width: strokeOf(e) };
  }
  return out;
}

/** The order boxes and links appear in when a map is drawn live: left to right, each box followed by the links that can now be joined. */
export function buildOrder(nodes, edges, pos) {
  const order = [...nodes].sort((a, b) => (a.center ? -1 : b.center ? 1 : 0) || pos[a.id].x - pos[b.id].x || pos[a.id].y - pos[b.id].y);
  const shown = new Set();
  const used = new Set();
  const steps = [];
  for (const n of order) {
    steps.push({ node: n.id });
    shown.add(n.id);
    for (const e of edges) {
      if (used.has(e.id) || !shown.has(e.from) || !shown.has(e.to)) continue;
      used.add(e.id);
      steps.push({ edge: e.id });
    }
  }
  return steps;
}
