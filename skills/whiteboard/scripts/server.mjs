#!/usr/bin/env node
// The whiteboard's small local server. It holds the board being drawn, serves the page, and
// pushes every change to open pages as it happens. It listens on this computer only. The page
// can read the board but never change it: changes come from the command-line tool, which
// proves itself with a token kept in the whiteboard's own folder.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE_MAPS, BASIS, EDGE_KINDS, NODE_KINDS, VERSION, checkMap, missingForDone, newBoard, putMap } from './lib/model.mjs';
import { PATHS, addHistory, ensureHome, listBoards, loadBoard, saveBoard, writeJson } from './lib/store.mjs';

const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const FILES = {
  '/': ['board.html', 'text/html; charset=utf-8'],
  '/board.css': ['board.css', 'text/css; charset=utf-8'],
  '/board.js': ['board.js', 'text/javascript; charset=utf-8'],
  '/layout.js': ['layout.js', 'text/javascript; charset=utf-8'],
  '/favicon.svg': ['favicon.svg', 'image/svg+xml']
};
const FIRST_PORT = Number(process.env.WHITEBOARD_PORT) || 4517;
const TOKEN = crypto.randomBytes(24).toString('hex');
const AGENT_NAMES = { claude: 'Claude Code', codex: 'Codex' };

// The board on the wall. It starts as clean white space every time the server starts.
let board = null;
let agent = null; // which assistant last spoke to the server
let seq = 0;
const clients = new Set();
let port = FIRST_PORT;

const snapshot = () => ({ version: VERSION, seq, board, agent, agentName: AGENT_NAMES[agent] || null });

function send(event, data) {
  seq += 1;
  const frame = `id: ${seq}\nevent: ${event}\ndata: ${JSON.stringify({ seq, ...data })}\n\n`;
  for (const res of clients) res.write(frame);
}

function persist() {
  if (board && board.company.name && !board.sample) saveBoard(board);
}

const COMMANDS = {
  hello({ agent: who }) {
    if (who && who !== agent) { agent = who; send('agent', { agent, agentName: AGENT_NAMES[agent] || null }); }
    return { ok: true };
  },
  new({ name, ticker, exchange, line, sample }) {
    if (!String(name || '').trim()) return { ok: false, errors: ['Give the company name: new "<company name>" --line "<what it does in plain words>".'] };
    persist();
    board = newBoard({ name, ticker, exchange, line, agent, sample });
    persist();
    send('board', snapshot());
    return { ok: true, boardId: board.id };
  },
  say({ text }) {
    if (!board) return { ok: false, errors: ['There is no board yet. Start one with: new "<company name>".'] };
    board.status = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    send('status', { status: board.status });
    return { ok: true };
  },
  map({ map }) {
    if (!board) return { ok: false, errors: ['There is no board yet. Start one with: new "<company name>".'] };
    const { errors, warnings } = checkMap(map, new Set(board.sources.map((s) => s.id)));
    if (errors.length) return { ok: false, errors, warnings };
    const { map: clean, replaced } = putMap(board, map);
    persist();
    send('map', { map: clean, replaced, sources: board.sources, order: board.maps.map((m) => m.id) });
    const left = BASE_MAPS.filter((b) => !board.maps.some((m) => m.id === b.id)).map((b) => b.id);
    return { ok: true, warnings, drawn: board.maps.map((m) => m.id), left };
  },
  follow({ questions }) {
    if (!board) return { ok: false, errors: ['There is no board yet.'] };
    board.followUps = (Array.isArray(questions) ? questions : []).map((q) => String(q).trim().slice(0, 140)).filter(Boolean).slice(0, 4);
    persist();
    send('follow', { followUps: board.followUps });
    return { ok: true };
  },
  done({ unchecked, note }) {
    if (!board) return { ok: false, errors: ['There is no board yet.'] };
    if (unchecked) board.unchecked = true;
    const missing = missingForDone(board);
    if (missing.length) return { ok: false, errors: missing };
    const first = !board.done;
    board.done = true;
    board.status = '';
    board.updatedAt = new Date().toISOString();
    persist();
    if (first && !board.sample) addHistory({ date: board.updatedAt.slice(0, 10), company: board.company.name, ticker: board.company.ticker, boardId: board.id, maps: board.maps.map((m) => m.id), agent, note: String(note || '').slice(0, 300) });
    send('done', { done: true, unchecked: board.unchecked });
    return { ok: true, boardId: board.id };
  },
  load({ id }) {
    const saved = loadBoard(id);
    if (!saved) return { ok: false, errors: [`No saved board "${id}". List them with: boards.`] };
    persist();
    board = saved;
    send('board', snapshot());
    return { ok: true, boardId: board.id };
  },
  clear() {
    persist();
    board = null;
    send('board', snapshot());
    return { ok: true };
  },
  show() {
    return { ok: true, board };
  },
  boards() {
    return { ok: true, boards: listBoards() };
  }
};

const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(body));
};

// Only this computer may talk to the server, and only by its own address. That shuts out other
// machines on the network and web pages that point a made-up host name at 127.0.0.1.
const hostOk = (req) => [`127.0.0.1:${port}`, `localhost:${port}`].includes(String(req.headers.host || ''));

const server = http.createServer((req, res) => {
  if (!hostOk(req)) return json(res, 403, { ok: false, error: 'This whiteboard only answers on 127.0.0.1.' });
  const url = new URL(req.url, `http://127.0.0.1:${port}`);

  if (req.method === 'GET' && FILES[url.pathname]) {
    const [name, type] = FILES[url.pathname];
    return fs.readFile(path.join(ASSETS, name), (err, buf) => {
      if (err) return json(res, 404, { ok: false, error: 'Not found' });
      res.writeHead(200, {
        'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
        // The page loads nothing from anywhere else, and nothing it shows can run as code.
        'content-security-policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'"
      });
      res.end(buf);
    });
  }
  if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, version: VERSION, pid: process.pid, pages: clients.size, board: board ? board.id : null });
  if (req.method === 'GET' && url.pathname === '/api/state') return json(res, 200, { ...snapshot(), kinds: NODE_KINDS, edgeKinds: EDGE_KINDS, basis: BASIS, baseMaps: BASE_MAPS.map(({ id, title }) => ({ id, title })) });
  if (req.method === 'GET' && url.pathname === '/api/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    res.write(`retry: 1500\nevent: hello\ndata: ${JSON.stringify({ seq })}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return undefined;
  }
  if (req.method === 'POST' && url.pathname === '/api/cmd') {
    // A browser can't send this: it has no token, and a page from another site would announce its Origin.
    if (req.headers.origin || req.headers['x-whiteboard-token'] !== TOKEN || !String(req.headers['content-type'] || '').startsWith('application/json')) return json(res, 403, { ok: false, error: 'Only the whiteboard command-line tool can change the board.' });
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 2_000_000) req.destroy(); });
    req.on('end', () => {
      let msg;
      try { msg = JSON.parse(body); } catch { return json(res, 400, { ok: false, errors: ['The request was not valid JSON.'] }); }
      const run = COMMANDS[msg.cmd];
      if (!run) return json(res, 400, { ok: false, errors: [`Unknown command "${msg.cmd}".`] });
      if (msg.agent && msg.cmd !== 'hello') COMMANDS.hello({ agent: msg.agent });
      try { return json(res, 200, run(msg)); } catch (err) { return json(res, 500, { ok: false, errors: [`The whiteboard server hit a problem: ${err.message}`] }); }
    });
    return undefined;
  }
  return json(res, 404, { ok: false, error: 'Not found' });
});

function listen(tries = 20) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && tries > 0) { port += 1; return listen(tries - 1); }
    console.error(`whiteboard: could not start (${err.message})`);
    process.exit(1);
  });
  server.listen(port, '127.0.0.1', () => {
    ensureHome();
    writeJson(PATHS.server, { pid: process.pid, port, token: TOKEN, version: VERSION, startedAt: new Date().toISOString() });
    console.log(`whiteboard: http://127.0.0.1:${port}`);
  });
}

// Keeps idle connections from being closed by anything in between.
setInterval(() => { for (const res of clients) res.write(': keep-alive\n\n'); }, 20_000).unref();

const stop = () => {
  persist();
  try { const cur = JSON.parse(fs.readFileSync(PATHS.server, 'utf8')); if (cur.pid === process.pid) fs.unlinkSync(PATHS.server); } catch { /* already gone */ }
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);

listen();
