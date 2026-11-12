#!/usr/bin/env node
// The one tool an assistant uses to draw on the whiteboard. Every command talks to the local
// whiteboard server (starting it if needed) and prints a short plain answer, with anything that
// must be fixed listed line by line.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE_MAPS, VERSION } from './lib/model.mjs';
import { PATHS, ensureHome, readHistory, readJson, readProfile, remember } from './lib/store.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AGENT_NAMES = { claude: 'Claude Code', codex: 'Codex' };

const HELP = `Investor whiteboard ${VERSION}

  open                         Start the whiteboard if needed and show its address
  memory                       What is known about this investor, and what was explained before
  remember "<text>" [--explain|--cares]
                               Save one thing learned about the investor
  new "<company>" --line "<what it does>" [--ticker X] [--exchange Y]
                               Clear the board and write the company's name on it
  say "<what you are doing>"   Show a line of live status on the board
  map <file.json | ->          Draw one map (or redraw it). Reads the file, or standard input with -
  follow "<question>" ...      Offer up to 4 follow-up questions on the board
  done [--note "<text>"] [--unchecked]
                               Finish: checks all six maps are there, saves the board
  show                         Print the board as JSON (for editing a map later)
  boards                       List saved boards
  load <board-id>              Put a saved board back on the wall
  clear                        Back to clean white space
  sample [--pause <seconds>]   Draw a made-up company, to show how the board works. Nothing is saved
  status                       Whether the whiteboard is running and what is on it
  stop                         Stop the whiteboard

Options for every command: --agent claude|codex, --no-browser`;

const FLAGS = new Set(['explain', 'cares', 'unchecked', 'no-browser']); // options that never take a value

function parse(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-' || !a.startsWith('--')) { out._.push(a); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (FLAGS.has(key) || next === undefined || (next.startsWith('--') && next.length > 2)) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

// Claude Code and Codex each set variables for the commands they run. That tells the board who is drawing.
function detectAgent(args) {
  const v = String(args.agent || process.env.WHITEBOARD_AGENT || '').toLowerCase();
  if (AGENT_NAMES[v]) return v;
  if (process.env.CODEX_THREAD_ID || process.env.CODEX_SESSION_ID || process.env.CODEX_SANDBOX) return 'codex';
  if (process.env.CLAUDECODE || process.env.CLAUDE_CODE_ENTRYPOINT) return 'claude';
  return null;
}

async function health(info) {
  if (!info) return null;
  try {
    const r = await fetch(`http://127.0.0.1:${info.port}/api/health`, { signal: AbortSignal.timeout(1200) });
    const body = await r.json();
    return body.ok ? body : null;
  } catch { return null; }
}

async function ensureServer({ start = true } = {}) {
  ensureHome();
  let info = readJson(PATHS.server);
  let alive = await health(info);
  // A server left running from an older copy of the plugin is replaced, so the page and the rules always match.
  if (alive && alive.version !== VERSION) {
    try { process.kill(info.pid, 'SIGTERM'); } catch { /* already stopped */ }
    await new Promise((r) => setTimeout(r, 400));
    alive = null;
  }
  if (alive) return { info, alive, started: false };
  if (!start) return { info: null, alive: null, started: false };
  try { fs.unlinkSync(PATHS.server); } catch { /* no stale file */ }
  const child = spawn(process.execPath, [path.join(HERE, 'server.mjs')], { detached: true, stdio: 'ignore', env: process.env });
  child.unref();
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 150));
    info = readJson(PATHS.server);
    alive = await health(info);
    if (alive) return { info, alive, started: true };
  }
  throw new Error('The whiteboard server did not start. Check that Node 18 or newer is installed, then try: open.');
}

async function send(cmd, payload, args) {
  const { info } = await ensureServer();
  const r = await fetch(`http://127.0.0.1:${info.port}/api/cmd`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-whiteboard-token': info.token },
    body: JSON.stringify({ cmd, agent: detectAgent(args), ...payload })
  });
  return { res: await r.json(), info };
}

function openBrowser(url) {
  const [cmd, argv] = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  try { spawn(cmd, argv, { detached: true, stdio: 'ignore' }).unref(); return true; } catch { return false; }
}

function fail(lines) {
  for (const l of [].concat(lines)) console.error(l);
  process.exitCode = 1;
}

function report(res, okLine) {
  if (!res.ok) {
    console.error('Not drawn. Fix these and run the command again:');
    for (const e of res.errors || [res.error || 'Unknown problem']) console.error(`  - ${e}`);
    if (res.warnings?.length) { console.error('Also worth fixing:'); for (const w of res.warnings) console.error(`  - ${w}`); }
    process.exitCode = 1;
    return false;
  }
  console.log(okLine);
  if (res.warnings?.length) { console.log('Worth improving (the map was drawn anyway):'); for (const w of res.warnings) console.log(`  - ${w}`); }
  return true;
}

const readInput = (file) => (file === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(path.resolve(file), 'utf8'));

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parse(rest);
  const url = (info) => `http://127.0.0.1:${info.port}`;

  switch (cmd) {
    case undefined: case 'help': case '--help': case '-h':
      console.log(HELP);
      return;

    case 'open': {
      const { info, alive, started } = await ensureServer();
      await send('hello', {}, args);
      let opened = false;
      // The browser is opened only when no page is showing the board yet, so asking twice never opens a second tab.
      if (!alive.pages && !args['no-browser'] && !process.env.WHITEBOARD_NO_BROWSER) opened = openBrowser(url(info));
      console.log(`Whiteboard: ${url(info)}`);
      console.log(started ? 'Started with clean white space.' : alive.board ? `Already running, showing board ${alive.board}.` : 'Already running, with clean white space.');
      console.log(alive.pages ? `${alive.pages} page${alive.pages === 1 ? ' is' : 's are'} already showing it.` : opened ? 'Opened it in the browser.' : 'No page is showing it yet. Open the address above for the investor.');
      return;
    }

    case 'status': {
      const { info, alive } = await ensureServer({ start: false });
      if (!alive) { console.log('The whiteboard is not running. Start it with: open'); return; }
      const { res } = await send('show', {}, args);
      const b = res.board;
      console.log(`Whiteboard: ${url(info)} (${alive.pages} page${alive.pages === 1 ? '' : 's'} showing it)`);
      if (!b) { console.log('Board: clean white space.'); return; }
      const left = BASE_MAPS.filter((m) => !b.maps.some((x) => x.id === m.id)).map((m) => m.id);
      console.log(`Board: ${b.company.name}${b.company.ticker ? ` (${b.company.ticker})` : ''}, id ${b.id}${b.done ? ', finished' : ', in progress'}.`);
      console.log(`Maps drawn: ${b.maps.map((m) => m.id).join(', ') || 'none'}.${left.length ? ` Still to draw: ${left.join(', ')}.` : ''}`);
      return;
    }

    case 'memory': {
      console.log(readProfile().trim());
      const past = readHistory();
      console.log('\n## Explained before');
      if (!past.length) console.log('Nothing yet. This is the first company.');
      for (const h of past) console.log(`- ${h.date}: ${h.company}${h.ticker ? ` (${h.ticker})` : ''}, board ${h.boardId}${h.note ? `. ${h.note}` : ''}`);
      console.log(`\nFiles: ${PATHS.profile} and ${PATHS.history}. Saved boards: ${PATHS.boards}`);
      return;
    }

    case 'remember': {
      const text = args._.join(' ').trim();
      if (!text) return fail('Say what to remember: remember "<text>" [--explain | --cares]');
      console.log(`Saved: ${remember(text, args.explain ? 'explain' : args.cares ? 'cares' : 'notes')}`);
      return;
    }

    case 'new': {
      const name = args._.join(' ').trim();
      const { res, info } = await send('new', { name, ticker: args.ticker === true ? '' : args.ticker, exchange: args.exchange === true ? '' : args.exchange, line: args.line === true ? '' : args.line }, args);
      if (report(res, `Board started for ${name}: ${url(info)}`)) console.log(`Draw these six maps, in this order, each with "map -" (JSON on standard input) or "map <file>": ${BASE_MAPS.map((m) => m.id).join(', ')}.`);
      return;
    }

    case 'say': {
      const { res } = await send('say', { text: args._.join(' ') }, args);
      report(res, 'Shown.');
      return;
    }

    case 'map': {
      const file = args._[0];
      if (!file) return fail('Give the map file, or - to read it from standard input: map <file.json | ->');
      let map;
      try { map = JSON.parse(readInput(file)); } catch (err) { return fail([`That is not valid JSON (${err.message}).`, 'Check for a missing comma or quote, then run the command again.']); }
      const { res } = await send('map', { map }, args);
      if (report(res, `Drawn: ${map.id}.`)) console.log(res.left.length ? `Still to draw: ${res.left.join(', ')}.` : 'All six base maps are drawn. Finish with: done');
      return;
    }

    case 'follow': {
      const { res } = await send('follow', { questions: args._ }, args);
      report(res, 'Follow-up questions are on the board.');
      return;
    }

    case 'done': {
      const { res, info } = await send('done', { unchecked: !!args.unchecked, note: args.note === true ? '' : args.note }, args);
      report(res, `Finished and saved as ${res.boardId}. The investor can explore it at ${info ? url(info) : ''}`);
      return;
    }

    case 'show': {
      const { res } = await send('show', {}, args);
      console.log(JSON.stringify(res.board, null, 2));
      return;
    }

    case 'boards': {
      const { res } = await send('boards', {}, args);
      if (!res.boards.length) { console.log('No saved boards yet.'); return; }
      for (const b of res.boards) console.log(`${b.id}  ${b.company}${b.ticker ? ` (${b.ticker})` : ''}  ${b.updatedAt.slice(0, 10)}  ${b.maps.length} maps${b.done ? '' : ', unfinished'}`);
      return;
    }

    case 'load': {
      if (!args._[0]) return fail('Give the board id (see: boards): load <board-id>');
      const { res } = await send('load', { id: args._[0] }, args);
      report(res, `Board ${args._[0]} is back on the wall.`);
      return;
    }

    case 'clear': {
      const { res } = await send('clear', {}, args);
      report(res, 'Clean white space.');
      return;
    }

    case 'sample': {
      // A made-up company, drawn the way a real one is, so the board can be seen working.
      // It is not saved and does not enter the investor's memory.
      const sample = JSON.parse(fs.readFileSync(path.join(HERE, 'sample.json'), 'utf8'));
      const pause = Math.max(0, Number(args.pause === true ? 6 : args.pause ?? 6)) * 1000;
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const { info, alive } = await ensureServer();
      if (!alive.pages && !args['no-browser'] && !process.env.WHITEBOARD_NO_BROWSER && openBrowser(url(info))) await wait(2500);
      const c = sample.company;
      let { res } = await send('new', { name: c.name, ticker: c.ticker, exchange: c.exchange, line: c.line, sample: true }, args);
      if (!report(res, `Drawing a made-up company, ${c.name}, at ${url(info)}`)) return;
      for (const map of sample.maps) {
        const title = BASE_MAPS.find((m) => m.id === map.id)?.title || map.title;
        await send('say', { text: `Drawing the ${title} map` }, args);
        await wait(pause / 3);
        ({ res } = await send('map', { map }, args));
        if (!report(res, `Drawn: ${map.id}.`)) return;
        await wait(pause);
      }
      await send('follow', { questions: sample.followUps }, args);
      ({ res } = await send('done', {}, args));
      report(res, `The sample is finished. It is not saved and not added to the investor's memory.`);
      return;
    }

    case 'stop': {
      const { info, alive } = await ensureServer({ start: false });
      if (!alive) { console.log('The whiteboard is not running.'); return; }
      try { process.kill(info.pid, 'SIGTERM'); } catch { /* already stopped */ }
      console.log('Whiteboard stopped. Saved boards are kept.');
      return;
    }

    default:
      fail([`Unknown command "${cmd}".`, '', HELP]);
  }
}

main().catch((err) => fail(`whiteboard: ${err.message}`));
