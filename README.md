# Corgi Agent Deck

Every Claude Code session on your Mac on its own Stream Deck key. Amber while it works, red and pulsing when it needs you, green when it's done, its context window as a bar along the bottom. Press a key and that session's window and terminal tab come to the front. Hold to pin. An empty key shows the workspace in front and opens a new session there; hold it to walk your other open windows. A permission prompt turns the Talk key red: press to allow, hold to deny. Prompt keys type a canned line; a Budget key shows how much of the account's five hours is gone.

Corgi Agent Deck draws the board that [corgi](https://github.com/Andriiklymiuk/corgi) keeps (`corgi agent track`) and turns presses into `corgi agent …` commands. It holds no state of its own.

![Corgi Agent Deck on a Stream Deck MK.2: working, needs you, done, limit, idle, closed, slow, a note, a +2 pager, an empty key, the Talk key answering a permission, two Prompt keys and two Budget keys](docs/media/deck-mk2.png)

<p align="center"><img src="docs/media/deck-pulse.gif" width="720" alt="A key that needs you pulses; elapsed times keep counting"></p>

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
npx streamdeck link com.andriiklymiuk.corgi-agent-deck.sdPlugin
```

Then **quit and reopen the Stream Deck app**: it scans plugins only at start. (`Error: ENOENT … /Plugins` from `link` means the app was never opened; see step 3.)

### 5. Keys

Stream Deck never places keys for you. In the app, right panel → **Keys** tab (not *Plugins*, that is the store) → scroll to **Corgi Agent Deck** → drag **Session** onto a key. Repeat for every key you want (right-click a key → Copy, then Paste on the empty ones). Their order on the deck is their order on the board. Add one **Talk** key if you want dictation.

Keys paint within a second. If they stay blank, read `com.andriiklymiuk.corgi-agent-deck.sdPlugin/logs/`. Add **Prompt** keys for the lines you type most and a **Budget** key per Claude account.

## Keys

| key shows | short press | hold (600 ms) |
|---|---|---|
| a session | focus its window and tab | working or waiting: pin / unpin · finished (DONE, LIMIT, IDLE, CLOSED): dismiss until its next event · pinned: unpin |
| `+N` | next page | previous page |
| `+` with a workspace name | new Claude session in that window — the editor window in front — under its folder's account (`corgi agent claude`) | the next open window comes forward and gets the session; keep holding on later presses to go round |
| Talk, red with ALLOW | allow the permission the session in front is waiting on | deny it |
| Talk | start dictating; press again to send | focus the session in the next open window |
| Prompt | type its text into the session in front, then Enter | — |
| Budget | open corgi's dashboard when the daemon publishes one | — |

Statuses: **WORKING** (amber), **SLOW** (amber: working but silent for 12 minutes), **NEEDS YOU** (red, pulsing: a permission prompt, a question, an API failure), **DONE** (green), **LIMIT** (blue: the account hit its usage limit; the key says when it resets), **IDLE** (30 min quiet), **CLOSED** (a pinned key whose session exited). The line under the label is what the session is doing (`Edit registry.go`, `Bash go test`) — or your own note, once you set one with `corgi agent note <session> "waiting on review"`. The bar along the bottom is the context window: grey, amber past 60 %, red past 85 %, absent until the first turn finishes. A profile chip (`WK`) marks sessions under another Claude account; the elapsed time sits top right. A key flashes ⚠ once when a press could not land; `corgi agent doctor` says why.

Font size: labels are 24 px on the 144 px key (14 px status word, 13 px detail), sized to be read from a desk. Long labels wrap at `-`, `_`, `·` or `/` and ellipsize; the detail line ellipsizes at 15 characters.

When a session needs you but has no key of its own, the `+N` key turns red and says how many. Elapsed times keep counting between corgi's updates.

## Approving a permission

When the session in front of you (the same pick as Talk, below) waits on a permission, the **Talk** key turns red: **ALLOW**, the tool and what it wants (`Bash` · `go test`). Press to allow, hold to deny; the key runs `corgi agent answer <session> allow|deny`, which focuses the session and presses Claude Code's own keys. corgi refuses to allow a Bash command it recognises as risky (`rm`, `sudo`, `--force`, …) — the key flashes ⚠ and you go look. Sessions in the Claude Code panel take no keystrokes from corgi, so there the key presses them itself after the focus lands (Accessibility for the Stream Deck app, as for dictation). With nothing pending it is the ordinary Talk key.

## Prompt keys

Drag a **Prompt** key onto the deck and pick a preset in its settings — *continue*, *run the tests and fix what fails*, */compact*, *commit with a good message* — or write your own text; Enter follows unless you turn it off. The key shows the first word or two (`run the`, `/compact`). A press types the text into the session in front of you through `corgi agent send`; a panel session gets it typed by the key itself, like the approve fallback.

## Budget key

A **Budget** key is one Claude account's usage: a ring for the five-hour window with the percentage inside, a bar for the seven-day one, and `resets 4:10pm`. Pick the account in the key's settings (the list comes from the board; you can also type a profile name). It turns blue with `LIMIT` when a session under that account hit the limit, and the ring goes red when, at the current pace, the window runs out before it resets. The numbers are what Claude Code last fetched for that account (`/usage`, `corgi agent usage`), so they are as fresh as its last session. A press opens corgi's dashboard when the daemon publishes one.

When the corgi daemon is not running every key reads `corgi OFF`; the plugin never starts it.

## Talk key

Drag a **Talk** key onto the deck to dictate into the session in front of you (the one in the editor window you are looking at, or the one you last pressed): press to talk, press again to send. (While that session waits on a permission the same key answers it instead; see above.) Claude Code does the recording; the key only focuses the session and presses its dictation chord. One-time setup in Claude Code:

```
/voice tap
```

and in `~/.claude/keybindings.json` bind the chord (default `ctrl+y`; change it in the key's settings):

```json
{ "bindings": [{ "context": "Chat", "bindings": { "ctrl+y": "voice:pushToTalk" } }] }
```

Do both in **every** Claude config dir you run sessions from (`~/.claude-work/keybindings.json` and its `settings.json` too). Tap mode is required: a synthesized keystroke has no key-repeat, so hold mode can't be triggered from a deck. Restart running Claude sessions; keybindings load at start. Pick a Ctrl chord: on a Mac, Option+letter types a symbol (`alt+v` is `√`) unless the terminal treats Option as Meta.

The plugin is macOS-only today (focus needs macOS); the keystroke helper already knows xdotool and SendKeys for later. Sending the chord needs Accessibility permission for the Stream Deck app. It is not in the list by default: System Settings → Privacy & Security → Accessibility → **+** → `/Applications/Elgato Stream Deck.app`, or press Talk once and accept the prompt macOS shows.

Sessions in the Claude Code **panel** need none of that: the panel has its own dictation shortcut (`cmd+d`), and Talk sends that one instead. The panel only stops recording on the second press, so Talk then waits 1.5 s for the transcript and presses Enter (both in the key's settings; set the send key blank to review before sending, or to `ctrl+enter` if you turned on `claudeCode.useCtrlEnterToSend`).

Which session Talk goes to: the one in the editor window in front (its Claude panel when that is the active tab, else its active terminal tab, else its panel), else the key you last pressed, else the only one that needs you, else the one that moved last. The key shows REC optimistically and clears when the session starts working or after Claude Code's two-minute cap.

## Good to know

- **Terminal sessions beat panel sessions.** A session started with `claude` in an integrated terminal gets its own tab, and a press opens exactly that tab. Sessions in the Claude Code *panel* can only be focused to the window and the panel: Claude Code has no command to pick a chat tab, so two panel sessions in one window land in the same place. The `+` key opens a terminal session for this reason.
- **A closed panel chat leaves the board** once its window's extension (corgi VS Code extension ≥ 1.16.12, corgi ≥ 1.21.36) reports fewer Claude tabs than finished panel sessions. Claude Code keeps the process for *Reopen Closed Session*; the key comes back with the session's next event. The side bar view is not a tab, so a finished session living there is hidden the same way until it speaks again.
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

Releases: bump `package.json` and push `main`; CI tags it, packs the plugin and publishes the `.streamDeckPlugin` on GitHub Releases. Elgato Marketplace submission is manual: see [docs/MARKETPLACE.md](docs/MARKETPLACE.md).

`npm run showcase` redraws the README pictures (`docs/media/`) from the plugin's own key renderer and screenshots them with Chrome, so they never drift from what the plugin draws.

A code change needs only `make restart`. A `manifest.json` change or a fresh `link` needs the Stream Deck app quit and reopened. Plugin logs: `com.andriiklymiuk.corgi-agent-deck.sdPlugin/logs/`; the app's own: `~/Library/Logs/ElgatoStreamDeck/StreamDeck.log`.

`SPEC.md` is the full specification; `CLAUDE.md` the conventions. The contract with corgi is `corgi agent sessions --json`; refresh `fixtures/sessions.json` from it when corgi changes.
