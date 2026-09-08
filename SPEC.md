# Corgi Agent Deck — implementation spec

A Stream Deck plugin whose keys are a live view of every Claude Code session on this Mac. Press a key and that session's window and terminal tab come to the front. Long-press to pin. An empty key opens a new session. Nothing to configure per session.

This document is self-contained. Everything the plugin needs from the outside world already exists in **corgi** (`corgi agent track`, corgi ≥ 1.21.32; the context bar, SLOW, notes, the approve key, Prompt and Budget need the board fields of corgi ≥ 1.21.46) and the **corgi VS Code extension** (≥ 1.16.7). Corgi Agent Deck is a thin renderer: it reads one JSON file and runs a few `corgi agent …` commands. It holds no session state of its own.

---

## 0. Ground rules for whoever builds this

- **Never** hold session state, decide slot order, spawn the corgi daemon, or talk to Claude Code directly. corgi does all of that; if something seems to be missing on the corgi side, stop and say so rather than working around it in the plugin.
- Zero heavy dependencies: `@elgato/streamdeck` and Node built-ins (`node:fs`, `node:child_process`, `node:path`, `node:os`). No image libraries: keys are inline SVG.
- TypeScript strict. Tests with vitest. Every pure function (layout, rendering, parsing, resolver order) has a unit test with a fixture; nothing that needs a real Stream Deck is required to run tests.
- Follow the Elgato SDK's current scaffold exactly (`streamdeck create`); don't hand-roll the manifest. Check the CLI's Node requirement at scaffold time (recent releases moved between Node 20 and 24).
- Commit small, milestone by milestone (section 8). Each milestone has an acceptance check; don't move on until it passes on a real device.

---

## 1. The contract with corgi

### 1.1 Where the board lives

corgi's daemon publishes the board to `sessions.json` inside its **agent data directory**:

| platform | path |
|---|---|
| macOS | `~/Library/Application Support/corgi/agent/sessions.json` |
| Linux | `$XDG_DATA_HOME/corgi/agent/sessions.json`, else `~/.local/share/corgi/agent/sessions.json` |
| override | `$CORGI_DATA_DIR/agent/sessions.json` when `CORGI_DATA_DIR` is set |

**Never hard-code the path.** Ask corgi once:

```bash
corgi agent sessions --json
```

The output is the board (section 1.2) plus two fields: `path` (absolute path of `sessions.json`) and `daemonRunning` (bool). Keep `path`, then watch that file.

The daemon writes the file atomically (write a `.tmp` sibling, rename over), so a directory watch sees **one** `rename` event per publish. It publishes only when something a key shows has changed; a burst of twenty tool calls that don't change status produces no write.

`daemon.json` in the same directory (`{"pid": N, "commands": true, ...}`) exists only while the daemon runs. `daemonRunning` in the `--json` output is derived from it; you don't need to read it yourself.

### 1.2 `sessions.json` — the board

```ts
interface Board {
  updatedAt: string;          // ISO time of the last change
  size: number;               // number of keys (default 6)
  overflow: number;           // sessions with no key of their own (incl. the one hidden behind the pager)
  needsInput: number;         // sessions in status needs_input, anywhere
  working: number;            // sessions in status working, anywhere
  slots: Slot[];              // exactly `size` entries, index 0..size-1
  sessions: Session[];        // every tracked session, oldest first
  windows?: Window[];         // editor windows the corgi VS Code extension has connected
  lastFocusWindow?: string;   // window id the last successful focus landed in
  notice?: string;            // last board-level failure (e.g. `new` with no window, a refused `answer`); "" when cleared
  noticeAt?: string;          // when notice was set
  accounts?: Account[];       // usage per Claude account
}

interface Slot {
  index: number;
  empty?: true;               // no session on this key
  pager?: true;               // the "+N" key
  overflow?: number;          // N for the pager key
  sessionId?: string;
  label?: string;             // display name, unique across live sessions ("acme-api", "acme-api·zsh 2")
  profile?: string;           // "default", or a corgi profile / config-dir name ("work")
  status?: Status;
  pinned?: boolean;
  elapsedS?: number;          // seconds in the current status
  detail?: string;            // "Bash", "permission: Bash", "question", "rate_limit", Claude's message…
  host?: HostKind;
  focusError?: string;        // set when the last press on this key could not land
  focusAt?: string;           // when the last focus attempt was made (success or failure)
  context?: number;           // context window used, percent; 0/absent = unknown
  pending?: string;           // tool of the permission prompt waiting, only while status is needs_input
  note?: string;              // the owner's line (`corgi agent note`); outlives any detail
  stuck?: boolean;            // working but silent for 12+ minutes
}

type Status = "working" | "needs_input" | "done" | "stale" | "gone" | "unknown";
type HostKind = "vscode-terminal" | "vscode-panel" | "iterm" | "terminal" | "unknown";

interface Session {                // only what a plugin might want; the file has more
  id: string; label: string; display?: string; cwd?: string; profile?: string;
  status: Status; statusSince: string; detail?: string; tool?: string;
  startedAt: string; lastActivity: string;
  host: { kind: HostKind; windowId?: string; app?: string; folder?: string;
          shellPid?: number; terminal?: string; connected?: boolean };
  focusError?: string; focusAt?: string;
  context?: { tokens: number; window: number; percent: number; model?: string; at: string };
  pending?: { tool: string; subject?: string; at: string };   // subject: the one safe word about the input ("go test", "registry.go")
  title?: string; note?: string; stuck?: boolean;
}

interface Account {                // top-level `accounts[]`: every account the sessions run under
  profile: string; configDir?: string; sessions: number;
  limits?: { fetchedAt: string; fiveHour: { percent: number; resetsAt?: string }; sevenDay: { percent: number; resetsAt?: string } };
  forecast?: { fiveHour?: WindowForecast; sevenDay?: WindowForecast };
}
interface WindowForecast { percentPerHour: number; exhaustAt?: string; safe: boolean; samples: number } // safe:false = runs out before it resets

interface Window { id: string; app?: string; extHostPid: number; folders?: string[];
                   terminals?: { name: string; shellPid: number }[]; updatedAt: string }
```

Slot invariants you can rely on:

- Indexes never move on their own. A new session takes the lowest free key; an ending one frees its key; nothing is re-sorted. Only `page` and unpinning change existing assignments.
- A pinned key keeps its session even after the process exits (`status: "gone"`) until unpinned.
- With overflow, the **highest unpinned key** becomes the pager: `pager: true`, `overflow: N`, no `sessionId`.
- `label` is already unique and already ellipsis-safe for two lines of 24 px at 144 px width when broken at `-`, `_`, `·`, `/`.
- `detail` reads like `Edit registry.go`, `Bash go test`, `permission: Bash go test`: the tool and the one safe word about its input.

### 1.3 Statuses and their meaning

| status | when | bar colour | word |
|---|---|---|---|
| `working` | model running or a tool executing | amber `#F5A623` | WORKING, or **SLOW** when `stuck` |
| `needs_input` | permission prompt, a question, an API failure | red `#E5484D`, **pulsing** | NEEDS YOU |
| `done` | turn finished, waiting for a prompt | green `#30A46C` | DONE |
| `limited` | the account hit its usage limit; `detail` says when it resets | blue `#5B8DEF` | LIMIT |
| `stale` | alive, no events for 30 min | gray `#6E6E6E` | IDLE |
| `gone` | process exited, key is pinned | gray at 40 % opacity, whole key dimmed | CLOSED |
| `unknown` | found by rescan, no hook has reported yet | gray | (none, show `?`) |

`needs_input` is the state that justifies the product. Everything else is decoration.

### 1.4 Commands a press turns into

All are `corgi agent …`. They enqueue for the daemon and return immediately (well under 50 ms). Exit code 1 with a message on stderr means **the daemon is not running**; treat that as the no-daemon state, not as an error to alert on.

| press | command | notes |
|---|---|---|
| short press, session key | `corgi agent focus <sessionId>` | the daemon raises the window and reveals the tab/panel; outcome arrives on the next board as `focusError`/`focusAt` |
| long press, session key | `corgi agent pin <index+1>` / `corgi agent pin <index+1> --off` | keys are **1-based** in the CLI; decide on/off from the slot's current `pinned` |
| short press, pager | `corgi agent page next` | |
| long press, pager | `corgi agent page prev` | |
| short press, empty key | `corgi agent new` | opens a fresh terminal running `claude` in the last-focused editor window; failure → board `notice` |
| long press, empty key | `corgi agent rescan` | adopt sessions the hooks missed |
| device key count ≠ `size` | `corgi agent board --slots <count>` | applies live; `--json` → `{"ok":true,"size":N,"applied":true}`; `applied:false` means no daemon yet |
| diagnostics (PI) | `corgi agent doctor --json`, `corgi agent status` | read-only |
| Talk key, permission pending | `corgi agent answer <sessionId> allow` (press) / `deny` (hold) | corgi types Claude Code's own keys into the session after focusing it; a risky Bash command is refused and lands as `notice` |
| Prompt key | `corgi agent send <sessionId> [--enter] -- <text>` | focuses, then types; the outcome is the session's `focusAt`/`focusError` |
| Budget key | `corgi agent status --json` → `dashboardUrl` | opened in the browser when present |

A `vscode-panel` session takes no text from corgi (its input is a web view): `send` and `answer` record a `focusError` containing "keyboard" on the session. The window is up by then, so the key runs `corgi agent focus` (which reveals the chat) and presses the keys itself: the text plus Enter for a prompt; Enter for allow, `2` then Enter for always, Escape for deny.

`--json` on any of these prints a JSON object; without it they print one human line.

### 1.5 Finding the corgi binary

A plugin launched by the Stream Deck app has the Dock's PATH, which rarely includes Homebrew. Resolve once, in this order, and cache:

1. the Property Inspector override, if set;
2. `/opt/homebrew/bin/corgi`;
3. `/usr/local/bin/corgi`;
4. the user's login shell: `$SHELL -lc 'command -v corgi'`.

Re-resolve when a spawn fails with `ENOENT`.

---

## 2. Product behaviour

1. A session starts anywhere → its key lights up with the project label within about a second.
2. A session or its window closes → the key clears within 5 s (corgi's reaper). Other keys don't move.
3. Each key shows: label, status bar + word, one detail line, a profile chip (hidden for `default`), a pin glyph when pinned.
4. Short press → that session's window and tab come forward. The key shows nothing on success (the window coming up is the feedback); if the next board reports a `focusError` newer than the press, the key shows ⚠ (`showAlert`) once.
5. Long press (≥ 600 ms) → pin / unpin.
6. More sessions than keys → the last unpinned key is `+N`; short press pages forward, long press back.
7. Empty key → short press opens a new Claude session; long press rescans.
8. Daemon down → every key renders the dim "corgi OFF" state; presses do nothing except re-check.

---

## 3. Repository layout

```
agent-deck/
  CLAUDE.md                                  (conventions; points here)
  SPEC.md                                    (this file)
  package.json                               (from `streamdeck create`; scripts: build, watch, test, pack)
  com.andriiklymiuk.corgi-agent-deck.sdPlugin/
    manifest.json                            SDKVersion 2, Controllers ["Keypad"], OS mac (MinimumVersion "12"),
                                             later windows; Nodejs.Version per the CLI's scaffold
    bin/plugin.js                            rollup output (scaffold default)
    imgs/                                    plugin + category icons, action default icon
    ui/slot.html                             Property Inspector (one page, shared by every action)
  src/
    plugin.ts                                entry: registers actions, starts BoardWatcher, wires logging
    actions/slot.ts                          the board key: appear/disappear, keyDown/keyUp
    actions/talk.ts                          talk + approve (section 7)
    actions/prompt.ts                        canned prompts (section 7.1)
    actions/budget.ts                        account usage (section 7.2)
    actions/hold.ts                          short press vs. 600 ms hold, shared by every key
    board/outcome.ts                         what the board says became of a focus/send/answer
    board/watcher.ts                         resolve path via CLI, fs.watch + 5 s fallback poll, parse, emit
    board/layout.ts                          (deviceId, actionId, coordinates) → slot index
    render/key.ts                            Slot → SVG data URI, cache, pulse frames
    corgi/cli.ts                             resolve binary, run commands, parse --json
    corgi/types.ts                           the interfaces in section 1.2
  test/
    layout.test.ts  render.test.ts  watcher.test.ts  cli.test.ts
  fixtures/
    sessions.json                            a real board captured from corgi (`corgi agent sessions --json`)
```

One action UUID for the board: `com.andriiklymiuk.corgi-agent-deck.slot`. Six copies dragged onto a Mini in any order make a board. The other actions are `…talk`, `…prompt` and `…budget`.

---

## 4. Modules

### 4.1 `corgi/cli.ts`

```ts
export function resolveCorgi(override?: string): Promise<string>;      // section 1.5, cached
export function runJson<T>(args: string[]): Promise<T | { daemonDown: true }>;
export function run(args: string[]): Promise<{ ok: boolean; daemonDown: boolean; stderr: string }>;
```

- `execFile`, never a shell string, so a session id or label can't be interpreted.
- Timeout 3 s. Log stderr at debug level.
- `daemonDown` = exit code 1 **and** stderr contains `not running`.

### 4.2 `board/watcher.ts`

```ts
export class BoardWatcher {
  on(event: "board", fn: (b: Board & { daemonRunning: boolean }) => void): void;
  on(event: "daemon", fn: (running: boolean) => void): void;
  start(): Promise<void>;
  stop(): void;
  current(): Board | undefined;
}
```

1. On `start`: `corgi agent sessions --json` → remember `path`, emit the board.
2. `fs.watch(dirname(path))`, filtered to the basename; debounce 50 ms; read + parse. Parse failure keeps the last good board (the atomic rename makes this rare).
3. A 5 s poll is the safety net. Redraw only when `updatedAt` changed.
4. When the CLI reports the daemon down, emit `daemon:false`, and retry the CLI with backoff 1 s → 30 s until it's back.

### 4.3 `board/layout.ts`

```ts
export class Layout {
  set(deviceId: string, actionId: string, coords: { column: number; row: number }): void;
  remove(actionId: string): void;
  indexOf(actionId: string): number | undefined;   // 0-based slot index within its device
  count(deviceId: string): number;                 // keys placed on that device
}
```

Sort each device's instances by `(row, column)`; that order is the slot index. Recompute on every appear/disappear. Never ask the user to number keys.

Board-size sync: when `count(device) !== board.size` and the daemon is running, run `corgi agent board --slots <count>` once per (device, count) and log it. Never shrink below the number of pinned keys (count them in `board.slots`).

### 4.4 `render/key.ts`

```ts
export function renderKey(slot: Slot | { kind: "off" }, opts: { frame: 0 | 1 }): string; // SVG data URI
export function keyCacheKey(slot: Slot, frame: 0 | 1): string; // label|status|profile|pinned|detail|elapsedBucket|frame
```

Canvas 144×144 (Mini keys are 80×80; Stream Deck scales). Type is sized to be read from a desk, not held up to the eyes. Exact layout:

| element | position | style |
|---|---|---|
| status bar | `rect 0,0 144×5` | status colour |
| pin glyph | `x=12 y=24` | 11 px, `📌` or a simple pin path |
| elapsed | right-aligned at `x=132 y=24` (`x=98` when a chip is shown) | 12 px mono, `#8F98A8` (`12s`, `3m`, `1h04m`) |
| profile chip | `rect 104,12 28×16 r3`, text centred at `118,24` | 10 px mono, 2 letters uppercase (`WK` for `work`), hidden for `default` |
| label | `x=12`, baseline `y=72` (one line) or `y=58` and `y=85` (two lines) | 24 px semibold, `#F2F4F7` |
| detail | `x=12 y=106` | 13 px mono, `#8F98A8`; the `note` when set, else `detail` (a pending permission drops its `permission: ` prefix); ellipsized at 15 characters |
| status word | `x=12 y=128` | 14 px bold, letter-spacing 1, status colour; `SLOW` for a stuck working session |
| context bar | `rect 0,140 144×4` | filled to `context` %; grey `#6E6E6E` ≤ 60, amber > 60, red > 85, over a 25 % track; nothing when unknown |
| ground | whole key | `#000000` |

- Label wrapping: break at `-`, `_`, `·`, `/`; otherwise hard-wrap at 9 characters; ellipsize the second line. Use a fixed advance table (semibold 24 px ≈ 13 px per character) so rendering is synchronous.
- `gone`: everything at 40 % opacity. `unknown`: no status word, `?` where the word would be.
- Pager: `+N` centred, 40 px bold, and `MORE` as the status word in dim gray; bar dim gray.
- Empty: ground only, a faint `+` (34 px, 35 % opacity) centred.
- Off (no daemon): ground, label `corgi`, word `OFF` in dim gray, bar off.
- **Escape every string** (`& < > "`) before it enters the SVG. Labels and details come from directory names and Claude's own messages.
- Cache by `keyCacheKey` (label, status, profile, pinned, detail, elapsed bucket, host, pulse, context, pending, note, stuck); bucket `elapsedS` to 5 s so a working key redraws at most every 5 s.
- Pulse: `needs_input` alternates frames 0/1 at 1 Hz (bar and word at full vs 45 % opacity). One `setInterval` for the whole plugin, running only while any visible slot is `needs_input`.

### 4.5 `actions/slot.ts`

`SingletonAction` for `com.andriiklymiuk.corgi-agent-deck.slot`:

- `onWillAppear`: `layout.set(device, action, coordinates)`, redraw all keys on that device.
- `onWillDisappear`: `layout.remove`, redraw.
- `onKeyDown`: record `pressedAt`, start a 600 ms timer.
- `onKeyUp`: if the timer is still pending → short press; else ignore (the long press already fired).
- Timer fires → long press.
- Map presses to commands per section 1.4 using the slot at `layout.indexOf(action)` in the current board. No ✓ on an accepted press; on the next board, if that slot's `focusAt > pressedAt` and `focusError` is set, `showAlert()` once and remember that `focusAt`.
- For an empty-key `new`, watch `board.noticeAt > pressedAt` with a non-empty `notice` → `showAlert()`.
- Redraw: on every `board` event, for each instance, compute its slot and `setImage(renderKey(slot, frame))` only if the cache key changed.

### 4.6 Property Inspector (`ui/slot.html`)

One page, global settings, shared by every instance:

- corgi path override (text; blank = automatic) and a read-only line with the resolved path.
- Daemon state (from the watcher), board size vs. this device's key count.
- Dictation chord for the talk key (section 7), default `ctrl+y` (a Ctrl chord: macOS types a symbol for Option+letter unless the terminal maps Option to Meta).
- Link to corgi's docs: `https://github.com/Andriiklymiuk/corgi/blob/main/docs/agent.md` (section "Sessions on a Stream Deck").
- No per-key settings, by design.

---

## 5. No-daemon state

When `daemonRunning` is false or the CLI reports the daemon down: render every key as "off", stop the pulse timer, and keep retrying with backoff. A press runs nothing except an immediate re-check. The PI shows "corgi agent is not running — run `corgi agent install` on this Mac". **The plugin never spawns the daemon.**

---

## 6. Logging and errors

Use `streamDeck.logger`. Info on: resolved corgi path, board path, board size sync, daemon up/down transitions. Debug on: every command run and its exit code, every redraw count per board. Never log full labels or details at info level (they can contain Claude's messages).

---

## 7. Talk key (optional, milestone 7)

A second action, `com.andriiklymiuk.corgi-agent-deck.talk`: press to dictate into the session in front (corgi's `frontSession`: the session in the window in front, in its active terminal tab or its panel; else the key you last pressed; else the one that needs you, when exactly one does; else the one that moved last), press again to send. Claude Code's own dictation does the work.

- **Claude Code side** (user setup, documented in README): `/voice tap` once (persists), and in `~/.claude/keybindings.json` bind `voice:pushToTalk` to a chord no terminal claims — `ctrl+y` by default. Tap mode is required: a synthesized keystroke has no key-repeat, so hold mode cannot be triggered from a deck. Needs a Claude.ai login and microphone permission for the terminal app.
- **Press**: `corgi agent focus <sessionId>`, wait until the next board shows `focusAt` newer than the press with no `focusError` (cap 1.5 s), then `osascript -e 'tell application "System Events" to keystroke "y" using control down'`. Sending keystrokes needs Accessibility for the Stream Deck app (its built-in Hotkey action already uses it).
- **Feedback**: the key turns red with `REC` after the first press and back to idle when that session's status becomes `working` (transcript submitted) or after two minutes (Claude Code's own recording cap). corgi has no recording event; this is optimistic by design.
- **Panel sessions**: the Claude Code panel has its own dictation shortcut (`cmd+d` in the webview), so a `vscode-panel` session gets that chord (`talkPanelChord`, default `cmd+d`) instead of the keybindings.json one; the panel's second press only stops recording, so `talkPanelSend` (default `enter`) follows after `talkPanelSendDelayMs` (default 1500).
- **Approve**: while the session Talk would pick has `pending` (and is still `needs_input`), the key is red: `ALLOW`, the tool, its subject (`sessions[].pending.subject`), `HOLD TO DENY`. A short press runs `corgi agent answer <id> allow`; a hold (600 ms, the slot keys' detection) runs `deny`. The board's outcome within 1.5 s decides the feedback: a `notice` (corgi refused a risky command) flashes ⚠; a `focusError` naming the keyboard means a panel session, so the key focuses it and presses Enter / `2` Enter / Escape itself; otherwise ✓. Nothing pending: the normal Talk key. A recording in progress is never interrupted by a prompt.

### 7.1 Prompt key

`com.andriiklymiuk.corgi-agent-deck.prompt`: a canned prompt. Per-key settings (this action has them by nature): `preset` (`continue`, `tests` = "run the tests and fix what fails", `compact` = `/compact`, `commit` = "commit with a good message", `custom`), `text` (used with `custom`), `enter` (default on). The face is a dark key (`#1C2029`) with the first word or two of the text (`run the`, `/compact`) and `SEND` (`TYPE` when Enter is off). A press picks the session exactly like Talk and runs `corgi agent send <id> [--enter] -- <text>`; the same outcome rules as approve apply, with the panel fallback typing the text through `osascript` (`keystroke "…"`, then `key code 36`), `xdotool type` or SendKeys.

### 7.2 Budget key

`com.andriiklymiuk.corgi-agent-deck.budget`: one account's usage. Settings: `profile` (a dropdown fed by the plugin from `accounts[]` and the sessions' profiles, through sdpi-components' `datasource` = `getProfiles`) and `profileText` (typed; wins). Face: the profile name top-left; a ring for `limits.fiveHour.percent` with the number inside; a bar for `sevenDay.percent`; `resets 4:10pm` (local time; a weekday when more than a day away) for `fiveHour.resetsAt`. Colour: blue with a blue bar and `LIMIT` when any session under that profile is `limited`; red when `forecast.fiveHour.safe === false`; else white/amber/red by fill (60 / 85). `—` and `no usage yet` before any session under the account has fetched usage; dim `OFF` without the daemon. A press runs `corgi agent status --json` and opens `dashboardUrl` when there is one, else shows ✓.

---

## 8. Milestones and acceptance

| # | deliverable | done when |
|---|---|---|
| 1 | Scaffold; `corgi/cli.ts`; `BoardWatcher` logging parsed boards | Start a Claude session in a terminal → the plugin log shows a new slot within a second; quit the daemon → log shows `daemon:false` and recovers |
| 2 | `Layout` + static rendering | Six keys dragged onto the Mini in any order show the right labels and colours; `fixtures/sessions.json` renders identically to the golden SVGs in tests |
| 3 | Press to focus with ✓ / ⚠ feedback | Across two VS Code windows on two desktops, the right terminal tab comes up; a session with `host: unknown` shows ⚠ once |
| 4 | Pulse, chips, pins, pager | A permission prompt pulses red; long press pins and the key survives the session exiting; seven sessions produce a `+2` key that pages |
| 5 | Empty key `new`, no-daemon state, PI, board-size sync | `+` opens a new claude terminal that takes the key; quitting the daemon dims all keys and they return on restart; an XL shows 32 slots without config |
| 6 | `streamdeck pack`, GitHub release workflow, README with a GIF | Install from a release `.streamDeckPlugin` on a clean Mac |
| 7 | Talk key | Press, speak, press: the prompt is sent |
| 8 | Bigger type, context bar, SLOW, notes; approve on Talk; Prompt and Budget keys | A permission prompt turns Talk red and a press allows it; a Prompt key types into a terminal session and into a panel session; a Budget key matches `corgi agent usage` |

### Verify on the Mac before milestone 3

1. `corgi agent focus <id>` from a terminal raises the existing VS Code window across desktops. If not, the fix is on the corgi side (an Accessibility fallback), not in the plugin.
2. A session started in the Claude Code panel shows `host: vscode-panel` in `corgi agent sessions --json`. If it shows `unknown`, panel focus stays window-level.
3. `corgi.claudePanelCommand` in VS Code settings if runtime discovery picks the wrong command for the panel.
4. `terminal.integrated.tabs.title` set to `${sequence}` (the corgi extension offers this once): tabs read `▲ acme-api NEEDS YOU` without the deck.

---

## 9. Tests

- **layout**: coordinates in random order on a 3×2 and an 8×4 map to indexes 0…n−1; a removed instance re-packs; two devices are independent.
- **render**: golden SVG strings for each status, a two-line label, a pinned work-profile key, the pager, empty, off; the cache returns the same string for the same inputs and a new one when the elapsed bucket or frame changes; a label containing `<script>` is escaped; the context bar's thresholds and absence; `SLOW`; the note over the detail; the approve, prompt and budget faces.
- **prompt / answer / outcome**: `sendCommand` and `answerCommand` argument arrays; preset and Enter resolution; the fallback keys per answer; `typeTextCommands` escaping per platform; `outcomeOf` reading ok / error / keyboard and a fresh notice; the hold detector.
- **watcher**: an atomic rename of the fixture triggers exactly one `board` event; a corrupt file keeps the previous board; a `daemonDown` CLI result emits `daemon:false` and a later success emits `daemon:true`.
- **cli**: resolver order with a fake filesystem; `--json` parsing; exit 1 + "not running" → `daemonDown`; arguments are passed as an array, never joined.

---

## 10. Packaging

- `streamdeck pack com.andriiklymiuk.corgi-agent-deck.sdPlugin` produces the `.streamDeckPlugin`.
- GitHub Actions on tag `v*`: `npm ci`, `npm test`, `npm run build`, pack, attach to the release.
- README: what it shows, the three-line corgi setup (`brew install andriiklymiuk/homebrew-tools/corgi`, `corgi agent install`, `corgi agent track enable`), install the corgi VS Code extension, drop six `Slot` keys on the deck, optional talk-key setup.

---

## Kickoff prompt for a fresh Claude Code session in this repo

> Read SPEC.md and CLAUDE.md. Build milestone 1 exactly as specified: scaffold with the Elgato CLI (check its Node requirement first), implement `corgi/cli.ts` and `board/watcher.ts` with their tests, and wire `plugin.ts` so a parsed board is logged. corgi is installed on this machine; verify the contract with `corgi agent sessions --json` before writing the types. Do not add dependencies beyond `@elgato/streamdeck`. Stop after milestone 1 and report what you verified on the real device.
