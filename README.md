# Agent Deck

Every Claude Code session on your Mac on its own Stream Deck key. Amber while it works, red and pulsing when it needs you, green when it's done. Press a key and that session's window and terminal tab come to the front. Hold to pin. An empty key opens a new session.

Agent Deck draws the board that [corgi](https://github.com/Andriiklymiuk/corgi) keeps (`corgi agent track`) and turns presses into `corgi agent …` commands. It holds no state of its own.

## Setup

On the Mac, once:

```bash
brew install andriiklymiuk/homebrew-tools/corgi
corgi agent install          # the daemon, at login
corgi agent track enable     # hooks into your Claude Code settings
```

Install the [corgi VS Code extension](https://marketplace.visualstudio.com/items?itemName=corgi.corgi) so a press lands on the exact terminal tab (or the Claude Code panel) rather than just the window. When it asks, let it set `terminal.integrated.tabs.title` to `${sequence}`: your terminal tabs then read `▲ acme-api NEEDS YOU` even without the deck.

Then install the plugin (a `.streamDeckPlugin` from [Releases](../../releases)) and drag as many **Session** keys onto your deck as you have keys. Their order on the deck is their order on the board; nothing else to configure.

## Keys

| key shows | short press | hold (600 ms) |
|---|---|---|
| a session | focus its window and tab | pin / unpin |
| `+N` | next page | previous page |
| empty | new Claude session in the last-focused window | rescan for untracked sessions |

Statuses: **WORKING** (amber), **NEEDS YOU** (red, pulsing: a permission prompt, a question, an API failure), **DONE** (green), **IDLE** (30 min quiet), **CLOSED** (a pinned key whose session exited). A profile chip (`WK`) marks sessions under another Claude account. A key flashes ⚠ once when a press could not land; `corgi agent doctor` says why.

When the corgi daemon is not running every key reads `corgi OFF`; the plugin never starts it.

## Development

```bash
npm install
npm test               # vitest, against fixtures/sessions.json
npm run build          # rollup → com.andriiklymiuk.agent-deck.sdPlugin/bin/plugin.js
npm run validate       # streamdeck validate
npx streamdeck dev     # once
npx streamdeck link com.andriiklymiuk.agent-deck.sdPlugin
npm run watch          # rebuild + restart the plugin on change
```

`SPEC.md` is the full specification; `CLAUDE.md` the conventions. The contract with corgi is `corgi agent sessions --json`; refresh `fixtures/sessions.json` from it when corgi changes.
