// What a board is, and the rules a map must pass before it is drawn. The server and the
// command-line tool both use this file, so a map is checked the same way wherever it enters.

export const VERSION = '0.1.0';

/** The six maps every company explanation must have, in the order they are drawn. */
export const BASE_MAPS = [
  { id: 'business', title: 'Business', needs: ['company', 'product', 'customer'] },
  { id: 'money', title: 'Money flow', needs: ['revenue', 'cost', 'profit'] },
  { id: 'supply', title: 'Supply chain', needs: [['supplier', 'input'], ['company', 'process', 'asset']] },
  { id: 'technology', title: 'Technology', needs: ['tech'] },
  { id: 'competition', title: 'Competition', needs: ['company', 'competitor'] },
  { id: 'thesis', title: 'Thesis', needs: ['claim', 'pillar', 'risk', 'signal'] }
];

/** Every kind of box, with the plain name the page shows and the marker colour it is drawn in. */
export const NODE_KINDS = {
  company: { name: 'The company', ink: 'solid' },
  product: { name: 'What it sells', ink: 'ink' },
  process: { name: 'What it does', ink: 'ink' },
  channel: { name: 'How it reaches buyers', ink: 'ink' },
  asset: { name: 'What it owns', ink: 'ink' },
  customer: { name: 'Who buys', ink: 'blue' },
  supplier: { name: 'Who supplies it', ink: 'blue' },
  input: { name: 'What it needs', ink: 'blue' },
  partner: { name: 'Who it works with', ink: 'blue' },
  tech: { name: 'Technology', ink: 'blue' },
  revenue: { name: 'Money coming in', ink: 'green' },
  profit: { name: 'What is left', ink: 'green' },
  cash: { name: 'Where the money goes', ink: 'green' },
  strength: { name: 'What protects it', ink: 'green' },
  evidence: { name: 'Evidence', ink: 'green' },
  cost: { name: 'Money going out', ink: 'red' },
  competitor: { name: 'Rival', ink: 'red' },
  substitute: { name: 'Another way to do the job', ink: 'red' },
  entrant: { name: 'New challenger', ink: 'red' },
  risk: { name: 'What could go wrong', ink: 'red' },
  claim: { name: 'The idea', ink: 'solid' },
  pillar: { name: 'What must be true', ink: 'ink' },
  signal: { name: 'What to watch', ink: 'mark' },
  question: { name: 'Not known yet', ink: 'mark' },
  note: { name: 'Note', ink: 'ink' }
};

export const EDGE_KINDS = {
  flow: 'Goods, services or work moving from one to the other',
  money: 'Money moving from one to the other',
  depends: 'One needs the other to work',
  competes: 'They fight for the same buyers',
  supports: 'One makes the other more likely',
  threatens: 'One puts the other at risk'
};

export const BASIS = { reported: 'Reported', estimate: 'Estimate', view: 'Opinion' };

const LIMITS = { label: 38, sub: 72, detail: 440, value: 28, edgeLabel: 32, summary: 240, question: 120, step: 340, stepTitle: 60, column: 30 };

// Words an everyday investor shouldn't have to look up. Allowed when the same text explains them.
const JARGON = ['EBITDA', 'EBIT', 'CAGR', 'TAM', 'capex', 'opex', 'ROCE', 'ROE', 'ROIC', 'FCF', 'ARPU', 'P/E', 'moat', 'operating leverage', 'working capital', 'headwind', 'tailwind', 'synergy', 'synergies', 'vertical integration', 'backward integration', 'forward integration', 'gross margin', 'basis points', 'bps', 'YoY', 'QoQ', 'top line', 'bottom line', 'OEM', 'B2B', 'B2C', 'SKU', 'monetise', 'monetize'];
const EXPLAINS = /\(|\bmeans\b|\bthat is\b|\bwhich is\b|\bie\b|\bi\.e\./i;

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const isId = (v) => typeof v === 'string' && /^[a-z0-9][a-z0-9_-]{0,39}$/.test(v);
const list = (v) => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);
// `wb show` prints every field, with "" or null where nothing was given. Those count as not given,
// so a map printed by `show` can be edited and sent straight back.
const given = (v) => v !== undefined && v !== null && v !== '';

export function slug(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'board';
}

export function newBoard({ name, ticker, exchange, line, agent, sample } = {}) {
  const now = new Date().toISOString();
  return {
    id: `${slug(name)}-${now.slice(0, 10)}-${Math.random().toString(36).slice(2, 6)}`,
    company: { name: str(name), ticker: str(ticker), exchange: str(exchange), line: str(line) },
    agent: agent || null,
    status: '',
    startedAt: now,
    updatedAt: now,
    done: false,
    /** True for the made-up company that shows how the board works. It is never saved or remembered. */
    sample: !!sample,
    /** True when the board was finished without any source to check its figures against. The page says so. */
    unchecked: false,
    maps: [],
    sources: [],
    followUps: []
  };
}

function jargonIn(text) {
  if (!text || EXPLAINS.test(text)) return [];
  return JARGON.filter((w) => new RegExp(`(^|[^A-Za-z])${w.replace(/[/.]/g, '\\$&')}([^A-Za-z]|$)`, /^[A-Z/]+$/.test(w) ? '' : 'i').test(text));
}

export function checkSources(sources) {
  const errors = [];
  const seen = new Set();
  for (const [i, s] of list(sources).entries()) {
    const at = `sources[${i}]`;
    if (!s || typeof s !== 'object') { errors.push(`${at}: must be an object with id and title.`); continue; }
    if (!isId(s.id)) errors.push(`${at}: "id" must be short lowercase letters, digits, - or _ (got ${JSON.stringify(s.id)}).`);
    else if (seen.has(s.id)) errors.push(`${at}: id "${s.id}" is used twice in this file.`);
    seen.add(s.id);
    if (!str(s.title)) errors.push(`${at}: "title" is missing. Say what the document is, for example "Annual report 2025-26".`);
    if (s.url !== undefined && !/^https?:\/\/\S+$/i.test(str(s.url))) errors.push(`${at}: "url" must start with http:// or https://.`);
  }
  return errors;
}

/**
 * Checks one map. `known` is the set of source ids already on the board, so a map can cite a
 * source an earlier map brought. Errors stop the map being drawn; warnings don't.
 */
export function checkMap(map, known = new Set()) {
  const errors = [];
  const warnings = [];
  if (!map || typeof map !== 'object' || Array.isArray(map)) return { errors: ['The map must be a JSON object.'], warnings };
  if (!isId(map.id)) errors.push(`"id" must be short lowercase letters, digits, - or _ (got ${JSON.stringify(map.id)}). The six base maps are: ${BASE_MAPS.map((m) => m.id).join(', ')}.`);
  const base = BASE_MAPS.find((m) => m.id === map.id);
  if (!str(map.title) && !base) errors.push('"title" is missing.');
  if (!str(map.question)) errors.push('"question" is missing: the one plain question this map answers, for example "What does it sell, and to whom?".');
  else if (str(map.question).length > LIMITS.question) errors.push(`"question" is ${str(map.question).length} characters; keep it to ${LIMITS.question} or fewer.`);
  if (!str(map.summary)) errors.push('"summary" is missing: one or two plain sentences giving the answer.');
  else if (str(map.summary).length > LIMITS.summary) errors.push(`"summary" is ${str(map.summary).length} characters; keep it to ${LIMITS.summary} or fewer.`);

  const layout = given(map.layout) ? map.layout : 'columns';
  if (layout !== 'columns' && layout !== 'hub') errors.push(`"layout" must be "columns" or "hub" (got ${JSON.stringify(map.layout)}).`);

  const srcErrors = checkSources(map.sources);
  errors.push(...srcErrors);
  const sources = new Set([...known, ...list(map.sources).filter((s) => s && isId(s.id)).map((s) => s.id)]);

  const nodes = list(map.nodes);
  const ids = new Set();
  if (nodes.length < 3) errors.push(`A map needs at least 3 boxes; this one has ${nodes.length}.`);
  if (nodes.length > 16) errors.push(`${nodes.length} boxes is too many to read. Keep a map to 12 or fewer (16 at most) and move the rest into the "detail" of the box they belong to, or into another map.`);
  else if (nodes.length > 12) warnings.push(`${nodes.length} boxes. 12 or fewer reads better.`);
  let centers = 0;
  const kinds = new Set();
  for (const [i, n] of nodes.entries()) {
    const at = `nodes[${i}]${n && n.id ? ` "${n.id}"` : ''}`;
    if (!n || typeof n !== 'object') { errors.push(`${at}: must be an object.`); continue; }
    if (!isId(n.id)) errors.push(`${at}: "id" must be short lowercase letters, digits, - or _.`);
    else if (ids.has(n.id)) errors.push(`${at}: id is used twice in this map.`);
    ids.add(n.id);
    const label = str(n.label);
    if (!label) errors.push(`${at}: "label" is missing.`);
    else if (label.length > LIMITS.label) errors.push(`${at}: label is ${label.length} characters; keep it to ${LIMITS.label} or fewer. Put the rest in "sub" or "detail".`);
    if (!NODE_KINDS[n.kind]) errors.push(`${at}: "kind" must be one of: ${Object.keys(NODE_KINDS).join(', ')} (got ${JSON.stringify(n.kind)}).`);
    else kinds.add(n.kind);
    if (str(n.sub).length > LIMITS.sub) errors.push(`${at}: "sub" is ${str(n.sub).length} characters; keep it to ${LIMITS.sub} or fewer.`);
    const detail = str(n.detail);
    if (detail.length < 20) errors.push(`${at}: "detail" is missing or too short. Write one to three plain sentences: what this is and why it matters.`);
    else if (detail.length > LIMITS.detail) errors.push(`${at}: "detail" is ${detail.length} characters; keep it to ${LIMITS.detail} or fewer.`);
    if (str(n.value).length > LIMITS.value) errors.push(`${at}: "value" is ${str(n.value).length} characters; keep it to ${LIMITS.value} or fewer, for example "62% of sales".`);
    if (given(n.basis) && !BASIS[n.basis]) errors.push(`${at}: "basis" must be reported, estimate or view.`);
    const cited = list(n.source);
    for (const s of cited) if (!sources.has(s)) errors.push(`${at}: source "${s}" isn't defined. Add it to this file's "sources", or cite one an earlier map defined.`);
    if (str(n.value) && !cited.length && n.basis !== 'estimate' && n.basis !== 'view') errors.push(`${at}: has a figure ("${str(n.value)}") with no "source". Cite where it comes from, or set "basis" to "estimate" if it is your own working.`);
    if (n.basis === 'reported' && !cited.length) errors.push(`${at}: "basis" is reported but there is no "source".`);
    if (layout === 'columns' && !(Number.isInteger(n.col) && n.col >= 0 && n.col <= 7)) errors.push(`${at}: "col" must be a whole number from 0 (leftmost) to 7. It says which column the box sits in.`);
    if (layout === 'hub' && n.center) centers++;
    for (const [field, text] of [['label', label], ['sub', str(n.sub)], ['detail', detail]]) {
      for (const w of jargonIn(text)) warnings.push(`${at}: "${w}" in ${field}. Say it in everyday words, or explain it in the same sentence.`);
    }
  }
  if (layout === 'hub' && centers !== 1) errors.push(`A hub map needs exactly one box with "center": true (the company). This one has ${centers}.`);
  if (layout === 'columns') {
    const cols = [...new Set(nodes.filter((n) => n && Number.isInteger(n.col)).map((n) => n.col))].sort((a, b) => a - b);
    if (cols.length < 2) errors.push('A columns map needs boxes in at least 2 columns, so the flow reads left to right.');
    const names = list(map.columns);
    if (!names.length) warnings.push('"columns" is missing. Name each column (for example ["Inputs", "Suppliers", "The company", "Buyers"]) so the stages are labelled on the board.');
    else {
      if (cols.length && names.length <= cols[cols.length - 1]) errors.push(`"columns" names ${names.length} columns but a box uses col ${cols[cols.length - 1]}. Give one name per column, counting from 0.`);
      for (const [i, c] of names.entries()) if (str(c).length > LIMITS.column) errors.push(`columns[${i}] is ${str(c).length} characters; keep it to ${LIMITS.column} or fewer.`);
    }
  }

  const edges = list(map.edges);
  if (!edges.length) errors.push('"edges" is empty. A map is boxes joined by links; add the links.');
  if (edges.length > 28) errors.push(`${edges.length} links is too many to follow. Keep it to about 20.`);
  const linked = new Set();
  const pairs = new Set();
  for (const [i, e] of edges.entries()) {
    const at = `edges[${i}]`;
    if (!e || typeof e !== 'object') { errors.push(`${at}: must be an object.`); continue; }
    if (!ids.has(e.from)) errors.push(`${at}: "from" is ${JSON.stringify(e.from)}, which is not a box in this map.`);
    if (!ids.has(e.to)) errors.push(`${at}: "to" is ${JSON.stringify(e.to)}, which is not a box in this map.`);
    if (e.from === e.to) errors.push(`${at}: joins "${e.from}" to itself.`);
    const key = `${e.from}>${e.to}`;
    if (pairs.has(key)) errors.push(`${at}: "${e.from}" to "${e.to}" is linked twice. Keep one link and put both points in its label or detail.`);
    pairs.add(key);
    linked.add(e.from); linked.add(e.to);
    if (given(e.kind) && !EDGE_KINDS[e.kind]) errors.push(`${at}: "kind" must be one of: ${Object.keys(EDGE_KINDS).join(', ')}.`);
    if (str(e.label).length > LIMITS.edgeLabel) errors.push(`${at}: label is ${str(e.label).length} characters; keep it to ${LIMITS.edgeLabel} or fewer. A verb phrase works best: "sells to", "pays", "depends on".`);
    if (given(e.weight) && !(typeof e.weight === 'number' && e.weight > 0 && e.weight <= 100)) errors.push(`${at}: "weight" must be a number from 1 to 100 (a share of the whole, used for line thickness).`);
    for (const s of list(e.source)) if (!sources.has(s)) errors.push(`${at}: source "${s}" isn't defined.`);
    for (const w of jargonIn(str(e.label))) warnings.push(`${at}: "${w}" in label. Say it in everyday words.`);
  }
  for (const id of ids) if (!linked.has(id)) warnings.push(`Box "${id}" isn't linked to anything. Link it or remove it.`);

  const steps = list(map.walkthrough);
  if (steps.length < 4 || steps.length > 7) errors.push(`"walkthrough" needs 4 to 7 steps that take the reader through the map in order; this has ${steps.length}.`);
  for (const [i, st] of steps.entries()) {
    const at = `walkthrough[${i}]`;
    if (!st || typeof st !== 'object') { errors.push(`${at}: must be an object.`); continue; }
    const text = str(st.text);
    if (text.length < 20) errors.push(`${at}: "text" is missing or too short. One or two plain sentences saying what happens at this step.`);
    else if (text.length > LIMITS.step) errors.push(`${at}: "text" is ${text.length} characters; keep it to ${LIMITS.step} or fewer.`);
    if (str(st.title).length > LIMITS.stepTitle) errors.push(`${at}: "title" is ${str(st.title).length} characters; keep it to ${LIMITS.stepTitle} or fewer.`);
    const focus = list(st.focus);
    if (!focus.length) errors.push(`${at}: "focus" is missing. List the ids of the boxes this step is about.`);
    for (const f of focus) if (!ids.has(f)) errors.push(`${at}: focus "${f}" is not a box in this map.`);
    for (const w of jargonIn(text)) warnings.push(`${at}: "${w}". Say it in everyday words, or explain it in the same sentence.`);
  }

  if (base && !errors.length) {
    for (const need of base.needs) {
      const any = [].concat(need);
      if (any.some((k) => kinds.has(k))) continue;
      errors.push(any.length === 1 ? `The ${base.title} map needs at least one "${any[0]}" box (${NODE_KINDS[any[0]].name.toLowerCase()}).` : `The ${base.title} map needs at least one box of kind ${any.join(' or ')}.`);
    }
    if (base.id === 'competition' && layout !== 'hub') warnings.push('The Competition map reads best as "layout": "hub", with the company in the middle.');
    if (base.id === 'money' && !edges.some((e) => typeof e.weight === 'number')) warnings.push('Give the Money flow links a "weight" (share of sales, 1 to 100) so the thick lines show where most of the money goes.');
  }
  return { errors, warnings };
}

/** Puts a checked map on the board, replacing one with the same id. Returns what changed. */
export function putMap(board, map) {
  const base = BASE_MAPS.find((m) => m.id === map.id);
  const clean = {
    id: map.id,
    title: str(map.title) || (base ? base.title : map.id),
    question: str(map.question),
    summary: str(map.summary),
    layout: map.layout === 'hub' ? 'hub' : 'columns',
    columns: list(map.columns).map(str),
    nodes: list(map.nodes).map((n) => ({
      id: n.id, label: str(n.label), kind: n.kind, sub: str(n.sub), detail: str(n.detail), value: str(n.value),
      basis: n.basis || (list(n.source).length ? 'reported' : ''), source: list(n.source), col: n.col, group: str(n.group), center: !!n.center
    })),
    edges: list(map.edges).map((e) => ({ id: `${e.from}>${e.to}`, from: e.from, to: e.to, label: str(e.label), kind: e.kind || 'flow', weight: typeof e.weight === 'number' ? e.weight : null, detail: str(e.detail), source: list(e.source) })),
    walkthrough: list(map.walkthrough).map((s) => ({ title: str(s.title), text: str(s.text), focus: list(s.focus) })),
    drawnAt: new Date().toISOString()
  };
  for (const s of list(map.sources)) {
    const src = { id: s.id, title: str(s.title), url: str(s.url), publisher: str(s.publisher), date: str(s.date) };
    const at = board.sources.findIndex((x) => x.id === s.id);
    if (at >= 0) board.sources[at] = src; else board.sources.push(src);
  }
  const at = board.maps.findIndex((m) => m.id === clean.id);
  const replaced = at >= 0;
  if (replaced) board.maps[at] = clean; else board.maps.push(clean);
  // Base maps keep their set order on the board, whatever order they arrive in. Extra maps follow.
  const order = (m) => { const i = BASE_MAPS.findIndex((b) => b.id === m.id); return i < 0 ? 100 : i; };
  board.maps = board.maps.map((m, i) => [m, i]).sort((a, b) => order(a[0]) - order(b[0]) || a[1] - b[1]).map(([m]) => m);
  board.updatedAt = new Date().toISOString();
  board.done = false;
  return { map: clean, replaced };
}

/** What still stands between this board and "done". Empty when it is complete. */
export function missingForDone(board) {
  const out = [];
  if (!board.company.name) out.push('The board has no company. Start with: new "<company name>".');
  for (const b of BASE_MAPS) if (!board.maps.some((m) => m.id === b.id)) out.push(`The ${b.title} map ("${b.id}") hasn't been drawn.`);
  if (!board.company.line) out.push('The company has no one-line description. Set it with: new ... --line "<what it does in plain words>".');
  if (!board.sources.length && !board.unchecked) out.push('No sources are recorded. Add "sources" to the maps and cite them on the boxes with figures. If you truly cannot look anything up, finish with: done --unchecked (the board will then say its figures were not checked).');
  return out;
}
