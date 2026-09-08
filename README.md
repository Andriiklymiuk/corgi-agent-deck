# Agent Deck

Every Claude Code session on your Mac on its own Stream Deck key. Amber while it works, red and pulsing when it needs you, green when it's done. Press a key and that session's window and terminal tab come to the front. Hold to pin. An empty key opens a new session.

Agent Deck draws the board that [corgi](https://github.com/Andriiklymiuk/corgi) keeps (`corgi agent track`) and turns presses into `corgi agent …` commands. It holds no state of its own.

## Setup

Five parts, in this order. Each one is short.

### 1. corgi (the daemon that tracks sessions)

```bash
brew install andriiklymiuk/homebrew-tools/corgi
corgi agent install          # the daemon, at login
corgi agent track enable     # hooks into your Claude Code settings
corgi agent doctor           # every line should be ✓
```

`track enable` hooks `~/.claude` plus every Claude config dir your corgi profiles and workspaces use (`~/.claude-work`, …). One you use outside corgi? Add it: `corgi agent track enable --config-dir ~/.claude-other`. Doctor's `session tracking` line says `hooks in N of N`.

After `corgi upd` (a new corgi version), restart the daemon: `corgi agent install`.

### 2. The corgi VS Code extension (so a press lands on the exact tab)

Install the [corgi VS Code extension](https://marketplace.visualstudio.com/items?itemName=corgi.corgi), then **reload every VS Code window** (⌘⇧P → *Reload Window*). The extension only starts describing a window after that reload, and only terminals opened *after* it loads carry the window id. Without it, a press can only bring the app forward.

When it asks, let it set `terminal.integrated.tabs.title` to `${sequence}`: your terminal tabs then read `▲ acme-api NEEDS YOU` even without the deck.

Check: `corgi agent sessions --json | grep -c '"windows"'` prints `1` once at least one window has reported.

### 3. The Stream Deck app

The [Elgato Stream Deck app](https://www.elgato.com/downloads) must be installed **and opened once** before the plugin can be linked (`brew install --cask elgato-stream-deck`). It works without a physical deck too.

### 4. The plugin

From a release: double-click the `.streamDeckPlugin` from [Releases](../../releases).

From source:

```bash
npm install && make build
npx streamdeck dev                                   # once: developer mode
npx streamdeck link com.andriiklymiuk.agent-deck.sdPlugin
```

Then **quit and reopen the Stream Deck app**: it scans plugins only at start. (`Error: ENOENT … /Plugins` from `link` means the app was never opened; see step 3.)

### 5. Keys

Stream Deck never places keys for you. In the app, right panel → **Keys** tab (not *Plugins*, that is the store) → scroll to **Agent Deck** → drag **Session** onto a key. Repeat for every key you want (right-click a key → Copy, then Paste on the empty ones). Their order on the deck is their order on the board. Add one **Talk** key if you want dictation.

Keys paint within a second. If they stay blank, read `com.andriiklymiuk.agent-deck.sdPlugin/logs/`.

## Keys

| key shows | short press | hold (600 ms) |
|---|---|---|
| a session | focus its window and tab | pin / unpin |
| `+N` | next page | previous page |
| empty | new Claude session in the editor window in front | rescan for untracked sessions |

Statuses: **WORKING** (amber), **NEEDS YOU** (red, pulsing: a permission prompt, a question, an API failure), **DONE** (green), **IDLE** (30 min quiet), **CLOSED** (a pinned key whose session exited). A profile chip (`WK`) marks sessions under another Claude account. A key flashes ⚠ once when a press could not land; `corgi agent doctor` says why.

When a session needs you but has no key of its own, the `+N` key turns red and says how many. Elapsed times keep counting between corgi's updates.

When the corgi daemon is not running every key reads `corgi OFF`; the plugin never starts it.

## Talk key

Drag a **Talk** key onto the deck to dictate into the session in front of you (the one in the editor window you are looking at, or the one you last pressed): press to talk, press again to send. Claude Code does the recording; the key only focuses the session and presses its dictation chord. One-time setup in Claude Code:

```
/voice tap
```

and in `~/.claude/keybindings.json` bind the chord (default `alt+v`; change it in the key's settings):

```json
{ "bindings": [{ "context": "Chat", "bindings": { "alt+v": "voice:pushToTalk" } }] }
```

Do both in **every** Claude config dir you run sessions from (`~/.claude-work/keybindings.json` and its `settings.json` too). Tap mode is required: a synthesized keystroke has no key-repeat, so hold mode can't be triggered from a deck. Restart running Claude sessions; keybindings load at start.

Sending the chord needs Accessibility permission for the Stream Deck app. It is not in the list by default: System Settings → Privacy & Security → Accessibility → **+** → `/Applications/Elgato Stream Deck.app`, or press Talk once and accept the prompt macOS shows.

Which session Talk goes to: the one in the editor window in front (its active terminal tab, else its Claude panel), else the key you last pressed, else the only one that needs you, else the one that moved last. The key shows REC optimistically and clears when the session starts working or after Claude Code's two-minute cap.

## Good to know

- **Terminal sessions beat panel sessions.** A session started with `claude` in an integrated terminal gets its own tab, and a press opens exactly that tab. Sessions in the Claude Code *panel* can only be focused to the window and the panel: Claude Code has no command to pick a chat tab, so two panel sessions in one window land in the same place. The `+` key opens a terminal session for this reason.
- **A closed panel chat keeps its key.** Closing a Claude Code chat tab does not end its `claude` process, so corgi still sees it (as DONE). Quit the process, or ignore the key; it goes IDLE after 30 minutes quiet.
- **Everything is on disk.** `corgi agent sessions --json` is what the plugin draws; `corgi agent doctor` explains a press that went nowhere; `corgi agent focus <key number>` reproduces a press from the shell.
- **No corgi daemon** → every key reads `corgi OFF`. The plugin never starts it: `corgi agent install`.



## Development

```bash
make install           # npm install
make test              # vitest, against fixtures/sessions.json
make restart           # build (rollup → …sdPlugin/bin/plugin.js) and reload the plugin
make watch             # rebuild + reload on every change
make validate          # streamdeck validate
make pack              # the .streamDeckPlugin for a release
make dev && make link  # once per machine, then reopen the Stream Deck app
```

A code change needs only `make restart`. A `manifest.json` change or a fresh `link` needs the Stream Deck app quit and reopened. Plugin logs: `com.andriiklymiuk.agent-deck.sdPlugin/logs/`; the app's own: `~/Library/Logs/ElgatoStreamDeck/StreamDeck.log`.

`SPEC.md` is the full specification; `CLAUDE.md` the conventions. The contract with corgi is `corgi agent sessions --json`; refresh `fixtures/sessions.json` from it when corgi changes.
