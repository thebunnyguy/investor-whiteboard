// Where the whiteboard keeps things between sessions: the investor's profile, the list of
// companies already explained, and every finished board. It is one folder in the home directory,
// so Claude Code and Codex read and write the same memory.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const HOME = process.env.WHITEBOARD_HOME || path.join(os.homedir(), '.investor-whiteboard');
export const PATHS = {
  home: HOME,
  server: path.join(HOME, 'server.json'),
  profile: path.join(HOME, 'profile.md'),
  history: path.join(HOME, 'history.jsonl'),
  boards: path.join(HOME, 'boards')
};

const PROFILE_START = `# Investor profile

What the assistant has learned about how this investor likes companies explained.
Both Claude Code and Codex read this before drawing, and add to it afterwards.
You can edit it by hand: delete anything that is wrong.

## How to explain

## What they care about

## Notes
`;

export function ensureHome() {
  fs.mkdirSync(PATHS.boards, { recursive: true, mode: 0o700 });
  if (!fs.existsSync(PATHS.profile)) fs.writeFileSync(PATHS.profile, PROFILE_START, { mode: 0o600 });
}

export function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

export function writeJson(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

const SECTIONS = { explain: '## How to explain', cares: '## What they care about', notes: '## Notes' };

/** Adds one dated line to the profile, under the section it belongs to. */
export function remember(text, section = 'notes') {
  ensureHome();
  const head = SECTIONS[section] || SECTIONS.notes;
  const line = `- ${text.replace(/\s+/g, ' ').trim()} (${new Date().toISOString().slice(0, 10)})`;
  let body = fs.readFileSync(PATHS.profile, 'utf8');
  if (!body.includes(head)) body = `${body.trimEnd()}\n\n${head}\n`;
  const at = body.indexOf(head) + head.length;
  const next = body.indexOf('\n## ', at);
  const end = next < 0 ? body.length : next;
  const block = body.slice(at, end).trimEnd();
  body = `${body.slice(0, at)}${block}\n${line}\n${next < 0 ? '' : body.slice(end)}`;
  fs.writeFileSync(PATHS.profile, body, { mode: 0o600 });
  return line;
}

export function readProfile() {
  ensureHome();
  return fs.readFileSync(PATHS.profile, 'utf8');
}

export function readHistory(limit = 12) {
  let lines = [];
  try { lines = fs.readFileSync(PATHS.history, 'utf8').split('\n').filter(Boolean); } catch { /* nothing explained yet */ }
  return lines.slice(-limit).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

export function addHistory(entry) {
  ensureHome();
  fs.appendFileSync(PATHS.history, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
}

const boardFile = (id) => path.join(PATHS.boards, `${String(id).replace(/[^a-z0-9-]/gi, '')}.json`);

export function saveBoard(board) {
  ensureHome();
  writeJson(boardFile(board.id), board);
}

export function loadBoard(id) {
  return readJson(boardFile(id));
}

export function listBoards() {
  let files = [];
  try { files = fs.readdirSync(PATHS.boards).filter((f) => f.endsWith('.json')); } catch { /* none saved */ }
  return files.map((f) => readJson(path.join(PATHS.boards, f))).filter((b) => b && b.company)
    .map((b) => ({ id: b.id, company: b.company.name, ticker: b.company.ticker, maps: b.maps.map((m) => m.id), done: !!b.done, updatedAt: b.updatedAt }))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}
