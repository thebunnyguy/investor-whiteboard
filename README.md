# Investor Whiteboard

Name a company. Claude Code or Codex draws it on a whiteboard in your browser while it works, as six flowchart maps you can click through:

| Map | The question it answers |
|---|---|
| Business | What does it sell, and who buys it? |
| Money flow | For every 100 of sales, where does the money come from and go? |
| Supply chain | What has to arrive, and from whom, before the product reaches the buyer? |
| Technology | What know-how makes it work, and how hard is that to copy? |
| Competition | Who else wants the same buyers, and what keeps them out? |
| Thesis | What would have to be true for this to be a good business to own, and what would break it? |

Boxes appear one at a time and each link is drawn from one box to the next. Every map has **Walk me through it**, a step-by-step explanation in plain words that highlights what it is talking about. Click any box for what it is, why it matters and where the figure comes from.

It is for understanding a business. It never tells you to buy or sell.

## Install

You need [Node.js 18+](https://nodejs.org) and Claude Code or Codex. There is nothing else to install: no dependencies, no API keys. The repository is private, so the machine must be signed in to a GitHub account that can read it (`gh auth login`).

### Claude Code

In a terminal (or the desktop app's Code tab):

```bash
claude plugin marketplace add thebunnyguy/investor-whiteboard
```

```bash
claude plugin install investor-whiteboard@investor-whiteboard
```

Start a new session. The skill is `/investor-whiteboard:whiteboard`, and it also starts by itself when you ask for a company to be explained.

To try it for one session without installing, from a copy of this folder: `claude --plugin-dir .`

### Codex

```bash
codex plugin marketplace add thebunnyguy/investor-whiteboard
```

```bash
codex plugin add investor-whiteboard@investor-whiteboard
```

Or in the Codex app: **Plugins**, **Add a marketplace**, source `thebunnyguy/investor-whiteboard`, then install **Investor Whiteboard**. Start a new chat and ask, or type `$whiteboard`. This packaging has not yet been run under Codex.

### From a folder on your computer

Clone the repository, then give either tool the folder instead of the GitHub name:

```bash
git clone https://github.com/thebunnyguy/investor-whiteboard.git
```

```bash
claude plugin marketplace add ./investor-whiteboard
```

(`codex plugin marketplace add ./investor-whiteboard` for Codex.) Any other assistant that can run shell commands can use it too: point it at `skills/whiteboard/SKILL.md` and it will follow the same steps.

### Update or remove

```bash
claude plugin marketplace update investor-whiteboard
```

```bash
claude plugin uninstall investor-whiteboard@investor-whiteboard
```

Removing the plugin leaves your memory and saved boards in `~/.investor-whiteboard`; delete that folder to remove them too.

## Use it

Say what you want:

- "Open the investor whiteboard" (clean white space, in your browser)
- "Explain Asian Paints"
- "Go deeper on the suppliers", "Make the money map simpler", "Compare it with Berger"
- "Show me a sample" (draws a made-up company; nothing is saved)

Your prompts go to whichever assistant you connected it to, and the board shows which one is drawing. The board lives at `http://127.0.0.1:4517` while it is running.

## How it works

```
you ── prompt ──▶ Claude Code or Codex ── wb.mjs ──▶ local server ── live ──▶ whiteboard page
                        │                                  │
                        └── reads and adds to ────▶ ~/.investor-whiteboard (memory, saved boards)
```

- `skills/whiteboard/SKILL.md` tells the assistant what to look up, what each map must show, and how to say it in everyday words. `references/maps.md` and `references/format.md` have the detail.
- `scripts/wb.mjs` is the one tool the assistant uses. It checks every map before it is drawn (short labels, a walk-through, a source for every figure) and tells the assistant exactly what to fix.
- `scripts/server.mjs` holds the board and pushes each change to the page as it happens.
- `assets/` is the page: plain HTML, CSS and JavaScript with no libraries, so it works offline.

## What it remembers

One folder, `~/.investor-whiteboard`, shared by Claude Code and Codex:

- `profile.md`: how you like things explained and what you care about. Plain text; edit or delete anything.
- `history.jsonl`: which companies were explained, and when.
- `boards/`: every board, so an old one can be put back on the wall.

It does not record what you own or anything about your money.

## Privacy and safety

- The server listens on this computer only (`127.0.0.1`) and refuses requests that arrive under any other name.
- The page can read the board but cannot change it. Only `wb.mjs` can, using a token kept in the folder above.
- Nothing the assistant writes can run as code on the page: text is shown as text, and only `http`/`https` links are clickable.
- Company facts come from what the assistant looks up. Each figure carries its source, or is marked as an estimate. Check anything that matters before relying on it.
- While the skill is in use, the assistant may run the whiteboard tool and search and read the web without asking each time (`allowed-tools` in `SKILL.md`). Without that, a permission prompt before every lookup and every map would stop the board being drawn live. Remove `WebSearch` and `WebFetch` from that list if you would rather approve each lookup.

## Working on it

```bash
npm test
```

runs the checks (rules, layout, server, memory). To watch a made-up company being drawn (it is not saved or remembered):

```bash
npm run demo
```
