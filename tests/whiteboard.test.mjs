// Run with: npm test
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { buildOrder, layoutColumns, layoutHub, routeColumns, routeHub } from '../skills/whiteboard/assets/layout.js';
import { BASE_MAPS, checkMap, missingForDone, newBoard, putMap } from '../skills/whiteboard/scripts/lib/model.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const skill = path.join(here, '..', 'skills', 'whiteboard');
const wbPath = path.join(skill, 'scripts', 'wb.mjs');
const sample = JSON.parse(fs.readFileSync(path.join(skill, 'scripts', 'sample.json'), 'utf8'));
const copy = (v) => JSON.parse(JSON.stringify(v));
const business = () => copy(sample.maps[0]);

// ---- The rules a map must pass -------------------------------------------------

test('every sample map passes the checks, in the order the six base maps are drawn', () => {
  assert.deepEqual(sample.maps.map((m) => m.id), BASE_MAPS.map((m) => m.id));
  const known = new Set();
  for (const m of sample.maps) {
    const { errors } = checkMap(m, known);
    assert.deepEqual(errors, [], `${m.id}: ${errors.join(' / ')}`);
    for (const s of m.sources || []) known.add(s.id);
  }
});

test('a map that would be unreadable or unsupported is refused, and the message says how to fix it', () => {
  const cases = [
    [(m) => { m.nodes[0].label = 'x'.repeat(60); }, /label is 60 characters/],
    [(m) => { delete m.nodes[1].col; }, /"col" must be a whole number/],
    [(m) => { m.edges[0].to = 'nowhere'; }, /not a box in this map/],
    [(m) => { m.nodes[0].kind = 'widget'; }, /"kind" must be one of/],
    [(m) => { delete m.nodes[0].source; }, /figure .* with no "source"/],
    [(m) => { m.nodes[0].source = 'missing'; }, /source "missing" isn't defined/],
    [(m) => { m.nodes[3].detail = 'Short.'; }, /"detail" is missing or too short/],
    [(m) => { m.walkthrough = m.walkthrough.slice(0, 2); }, /needs 4 to 7 steps/],
    [(m) => { m.walkthrough[0].focus = ['ghost']; }, /focus "ghost" is not a box/],
    [(m) => { m.nodes = m.nodes.filter((n) => n.kind !== 'customer'); m.edges = m.edges.filter((e) => !['homes', 'cafes'].includes(e.to)); m.walkthrough.forEach((s) => { s.focus = s.focus.filter((f) => !['homes', 'cafes'].includes(f)); if (!s.focus.length) s.focus = ['co']; }); }, /needs at least one "customer" box/],
    [(m) => { m.sources[0].url = 'javascript:alert(1)'; }, /must start with http/],
    [(m) => { m.edges = []; }, /"edges" is empty/],
    [(m) => { delete m.question; }, /"question" is missing/]
  ];
  for (const [breakIt, expected] of cases) {
    const m = business();
    breakIt(m);
    const { errors } = checkMap(m);
    assert.ok(errors.some((e) => expected.test(e)), `expected ${expected}, got: ${errors.join(' / ')}`);
  }
});

test('an estimate needs no source, and finance words are flagged unless explained', () => {
  const m = business();
  delete m.nodes[0].source;
  m.nodes[0].basis = 'estimate';
  assert.deepEqual(checkMap(m).errors, []);
  m.nodes[3].detail = 'Its EBITDA has grown steadily for five years in a row.';
  assert.ok(checkMap(m).warnings.some((w) => /"EBITDA"/.test(w)));
  m.nodes[3].detail = 'Its EBITDA (profit before interest, tax and wear and tear) has grown for five years.';
  assert.ok(!checkMap(m).warnings.some((w) => /"EBITDA"/.test(w)));
});

test('a board is done only when all six maps, a one-line description and sources are there', () => {
  const board = newBoard({ name: 'Brightleaf Tea', line: 'Sells tea.' });
  assert.equal(missingForDone(board).length, 7); // six maps and no sources
  for (const m of sample.maps) putMap(board, m);
  assert.deepEqual(missingForDone(board), []);
  assert.deepEqual(board.maps.map((m) => m.id), BASE_MAPS.map((m) => m.id));
  const bare = newBoard({ name: 'Brightleaf Tea', line: 'Sells tea.' });
  for (const m of sample.maps) { const c = copy(m); delete c.sources; c.nodes.forEach((n) => { delete n.source; if (n.value) n.basis = 'estimate'; }); putMap(bare, c); }
  assert.match(missingForDone(bare).join(' '), /No sources are recorded/);
  bare.unchecked = true;
  assert.deepEqual(missingForDone(bare), []);
});

test('redrawing a map replaces it, and base maps keep their set order whatever order they arrive in', () => {
  const board = newBoard({ name: 'Brightleaf Tea' });
  putMap(board, sample.maps[5]);
  putMap(board, sample.maps[0]);
  const again = business();
  again.summary = 'A changed summary for the same map, to check it replaces the first one.';
  assert.equal(putMap(board, again).replaced, true);
  assert.deepEqual(board.maps.map((m) => m.id), ['business', 'thesis']);
  assert.equal(board.maps[0].summary, again.summary);
});

test('a map read back from the board can be edited and sent again unchanged', () => {
  const board = newBoard({ name: 'Brightleaf Tea', line: 'Sells tea.' });
  for (const m of sample.maps) putMap(board, m);
  const printed = copy(board); // what `wb show` prints: every field, with "" or null where nothing was given
  const known = new Set(printed.sources.map((s) => s.id));
  for (const m of printed.maps) {
    const { errors } = checkMap(m, known);
    assert.deepEqual(errors, [], `${m.id}: ${errors.join(' / ')}`);
    const before = copy(m);
    putMap(board, m);
    const after = copy(board.maps.find((x) => x.id === m.id));
    assert.deepEqual({ ...after, drawnAt: 0 }, { ...before, drawnAt: 0 }, `${m.id} changed on the way round`);
  }
  const edited = printed.maps[0];
  edited.nodes[0].value = '12 of every 100'; edited.nodes[0].source = []; edited.nodes[0].basis = '';
  assert.ok(checkMap(edited, known).errors.some((e) => /with no "source"/.test(e)), 'an empty basis still needs a source for a figure');
});

test('the column names the skill recommends fit the limit the tool enforces', () => {
  const maps = fs.readFileSync(path.join(skill, 'references', 'maps.md'), 'utf8');
  const lines = [...maps.matchAll(/\*\*Columns:\*\* (.+)\./g)].map((m) => m[1]);
  assert.equal(lines.length, 5); // every base map except Competition, which is a hub
  for (const line of lines) for (const name of line.split(' → ')) assert.ok(name.length <= 30, `"${name}" is ${name.length} characters`);
});

// ---- Where boxes go and how links travel -------------------------------------------

const sized = (m) => m.nodes.map((n, i) => ({ ...n, h: 80 + (i % 3) * 22 }));
const withIds = (m) => m.edges.map((e) => ({ ...e, id: `${e.from}>${e.to}` }));
const hits = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test('no two boxes overlap, every link has a path, and each box and link is drawn exactly once', () => {
  for (const m of sample.maps) {
    const nodes = sized(m);
    const edges = withIds(m);
    const lay = m.layout === 'hub' ? layoutHub(nodes) : layoutColumns(nodes, edges, m.columns);
    const boxes = Object.values(lay.pos);
    assert.equal(boxes.length, nodes.length);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.ok(!hits(boxes[i], boxes[j]), `${m.id}: boxes overlap`);
    const routes = m.layout === 'hub' ? routeHub(lay.pos, edges) : routeColumns(lay.pos, edges);
    for (const e of edges) { assert.match(routes[e.id].d, /^M[-\d.]+ [-\d.]+C/); assert.ok(Number.isFinite(routes[e.id].mid.x)); }
    const steps = buildOrder(nodes, edges, lay.pos);
    assert.equal(steps.filter((s) => s.node).length, nodes.length);
    assert.equal(steps.filter((s) => s.edge).length, edges.length);
    // A link is only drawn once both of its boxes are on the board.
    const shown = new Set();
    for (const s of steps) { if (s.node) shown.add(s.node); else { const e = edges.find((x) => x.id === s.edge); assert.ok(shown.has(e.from) && shown.has(e.to)); } }
  }
});

test('a link that skips a column goes through free space, not behind the boxes in between', () => {
  const m = sample.maps[1]; // money flow: sales -> profit skips the column of costs
  const nodes = sized(m);
  const edges = withIds(m);
  const { pos } = layoutColumns(nodes, edges, m.columns);
  const route = routeColumns(pos, edges)['sales>profit'];
  const flat = route.d.match(/C[-\d. ]+ ([-\d.]+) ([-\d.]+)L([-\d.]+) ([-\d.]+)/);
  assert.ok(flat, 'the path has a straight run through the skipped column');
  const y = Number(flat[2]);
  const middle = Object.values(pos).filter((b) => b.x > pos.sales.x && b.x < pos.profit.x);
  assert.ok(middle.length >= 3);
  for (const b of middle) assert.ok(y < b.y || y > b.y + b.h, 'the straight run clears every box in the column');
});

test('in a hub map the company is in the middle and nothing sits on top of it', () => {
  const m = sample.maps[4];
  const { pos, labels } = layoutHub(sized(m));
  const hub = pos.co;
  assert.ok(Math.abs(hub.x + hub.w / 2) < 1 && Math.abs(hub.y + hub.h / 2) < 1);
  assert.deepEqual(labels.map((l) => l.text).sort(), ['Direct rivals', 'New challengers', 'Other ways to do the job', 'What protects it']);
});

// ---- The server and the command-line tool, end to end ------------------------------

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'whiteboard-test-'));
const env = { ...process.env, WHITEBOARD_HOME: home, WHITEBOARD_PORT: '4790', WHITEBOARD_NO_BROWSER: '1', WHITEBOARD_AGENT: 'codex' };
const run = promisify(execFile);
const wb = async (args, input) => {
  const child = run(process.execPath, [wbPath, ...args], { env });
  if (input !== undefined) { child.child.stdin.end(input); }
  try { const r = await child; return { code: 0, out: r.stdout, err: r.stderr }; } catch (e) { return { code: e.code, out: e.stdout, err: e.stderr }; }
};
let base = '';
let token = '';

before(async () => {
  const r = await wb(['open']);
  assert.equal(r.code, 0, r.err);
  const info = JSON.parse(fs.readFileSync(path.join(home, 'server.json'), 'utf8'));
  base = `http://127.0.0.1:${info.port}`;
  token = info.token;
});
after(async () => { await wb(['stop']); fs.rmSync(home, { recursive: true, force: true }); });

test('the server starts with clean white space and names the assistant that connected', async () => {
  const s = await (await fetch(`${base}/api/state`)).json();
  assert.equal(s.board, null);
  assert.equal(s.agentName, 'Codex');
  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
});

test('only the command-line tool can change the board', async () => {
  const post = (headers, host) => fetch(`${base}/api/cmd`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers, ...(host ? { host } : {}) }, body: JSON.stringify({ cmd: 'new', name: 'Intruder' }) });
  assert.equal((await post({})).status, 403); // no token
  assert.equal((await post({ 'x-whiteboard-token': 'wrong' })).status, 403);
  assert.equal((await post({ 'x-whiteboard-token': token, origin: 'https://evil.example' })).status, 403); // a web page
  const s = await (await fetch(`${base}/api/state`)).json();
  assert.equal(s.board, null);
});

test('a company is drawn map by map, pages hear about each one, and a late page gets the whole board', async () => {
  const events = [];
  const stream = await fetch(`${base}/api/events`);
  const reader = stream.body.getReader();
  const decoder = new TextDecoder();
  (async () => { for (;;) { const { value, done } = await reader.read(); if (done) return; for (const m of decoder.decode(value).matchAll(/event: (\w+)/g)) events.push(m[1]); } })().catch(() => {});

  const c = sample.company;
  assert.equal((await wb(['new', c.name, '--ticker', c.ticker, '--line', c.line])).code, 0);
  assert.equal((await wb(['say', 'Reading the annual report'])).code, 0);

  const bad = business();
  bad.edges[0].to = 'nowhere';
  const refused = await wb(['map', '-'], JSON.stringify(bad));
  assert.equal(refused.code, 1);
  assert.match(refused.err, /Not drawn\. Fix these/);
  assert.match(refused.err, /not a box in this map/);
  assert.equal((await wb(['map', '-'], '{ not json')).code, 1);

  const early = await wb(['done']);
  assert.equal(early.code, 1);
  assert.match(early.err, /Money flow map .* hasn't been drawn/);

  for (const m of sample.maps) { const r = await wb(['map', '-'], JSON.stringify(m)); assert.equal(r.code, 0, r.err); }
  assert.equal((await wb(['follow', ...sample.followUps])).code, 0);
  const done = await wb(['done', '--note', 'test run']);
  assert.equal(done.code, 0, done.err);

  const s = await (await fetch(`${base}/api/state`)).json();
  assert.equal(s.board.done, true);
  assert.deepEqual(s.board.maps.map((m) => m.id), BASE_MAPS.map((m) => m.id));
  assert.equal(s.board.followUps.length, 3);
  await new Promise((r) => setTimeout(r, 150));
  await reader.cancel();
  assert.equal(events.filter((e) => e === 'map').length, 6);
  assert.ok(events.includes('board') && events.includes('status') && events.includes('done'));

  const history = fs.readFileSync(path.join(home, 'history.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(history.length, 1);
  assert.equal(history[0].company, 'Brightleaf Tea');
  assert.equal(history[0].agent, 'codex');
  assert.ok(fs.existsSync(path.join(home, 'boards', `${s.board.id}.json`)));
});

test('memory is kept between sessions and a saved board can be put back', async () => {
  assert.equal((await wb(['remember', 'Explain in easy words, flowcharts first', '--explain'])).code, 0);
  const mem = await wb(['memory']);
  assert.match(mem.out, /## How to explain\n- Explain in easy words, flowcharts first \(\d{4}-\d\d-\d\d\)/);
  assert.match(mem.out, /Brightleaf Tea \(BLEAF\), board brightleaf-tea-/);
  const id = (await (await fetch(`${base}/api/state`)).json()).board.id;
  assert.equal((await wb(['clear'])).code, 0);
  assert.equal((await (await fetch(`${base}/api/state`)).json()).board, null);
  assert.match((await wb(['boards'])).out, new RegExp(id));
  assert.equal((await wb(['load', id])).code, 0);
  assert.equal((await (await fetch(`${base}/api/state`)).json()).board.id, id);
});

test('the sample is drawn like a real company but is never saved or remembered', async () => {
  const before = fs.readdirSync(path.join(home, 'boards')).sort();
  const r = await wb(['sample', '--pause', '0']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /not saved and not added to the investor's memory/);
  const s = await (await fetch(`${base}/api/state`)).json();
  assert.equal(s.board.sample, true);
  assert.equal(s.board.done, true);
  assert.equal(s.board.maps.length, 6);
  assert.deepEqual(fs.readdirSync(path.join(home, 'boards')).sort(), before);
  assert.equal(fs.readFileSync(path.join(home, 'history.jsonl'), 'utf8').trim().split('\n').length, 1);
  assert.equal((await wb(['clear'])).code, 0);
});

test('the page never turns text from the assistant into markup', () => {
  const js = fs.readFileSync(path.join(skill, 'assets', 'board.js'), 'utf8');
  for (const risky of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function']) assert.ok(!js.includes(risky), `board.js uses ${risky}`);
  assert.match(js, /\/\^https\?:/); // links are limited to web addresses
});
