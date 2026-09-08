# Agent Deck

Stream Deck plugin that draws corgi's Claude Code session board and turns key presses into `corgi agent …` commands. The full spec is `SPEC.md`; read it before changing anything.

## What this repo is, in one paragraph

corgi (`corgi agent track`) already tracks every Claude Code session on the machine, keeps them on a fixed board of keys, publishes the board as `sessions.json`, and does the focusing, pinning, paging and new-session opening. This plugin only renders that file onto keys and shells out to corgi on a press. It holds no session state, never decides slot order, never spawns the daemon, and never talks to Claude Code directly.

## Conventions

- TypeScript strict; ESLint from the Elgato scaffold; vitest for tests. `npm test` must pass before every commit.
- Dependencies: `@elgato/streamdeck` and Node built-ins only. No image libraries; keys are inline SVG.
- Run corgi with `execFile` and an argument array, never a shell string.
- Every pure module (`board/layout.ts`, `render/key.ts`, `corgi/cli.ts` parsing, watcher event logic) has unit tests against `fixtures/sessions.json`. Refresh the fixture with `corgi agent sessions --json` when corgi's contract changes.
- Escape every string that enters an SVG. Labels and details come from directory names and Claude's own messages.
- Log through `streamDeck.logger`; no labels or details at info level.
- Commit per milestone (SPEC.md section 8) with the acceptance check written into the commit message.

## Useful commands

```bash
corgi agent sessions --json     # the board, plus the path of sessions.json and daemonRunning
corgi agent focus <session>     # id, id prefix, label, or key number
corgi agent pin <key> [--off]   # keys are 1-based here
corgi agent page next|prev
corgi agent new [--window ID]   # a fresh terminal running claude in the last-focused window
corgi agent board --slots N     # resize the board, applied live
corgi agent doctor --json       # hooks installed? sessions with no known window?
streamdeck dev                  # enable developer mode once
streamdeck link <plugin dir>    # symlink the plugin into Stream Deck
streamdeck restart <uuid>       # reload after a build
streamdeck pack <plugin dir>    # produce the .streamDeckPlugin
```

## Things not to do

- Don't work around a missing corgi capability inside the plugin; say what's missing instead.
- Don't add per-key settings. Slot indexes come from key coordinates.
- Don't poll `sessions.json` faster than the 5 s fallback; the directory watch is the primary signal.
- Don't send keystrokes for anything but the talk key, and only after the focus has been confirmed by the board.
