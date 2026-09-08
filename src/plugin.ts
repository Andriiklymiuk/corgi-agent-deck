import streamDeck from "@elgato/streamdeck";

import { SlotAction } from "./actions/slot";
import { sendKeystroke, TalkAction } from "./actions/talk";
import { Layout } from "./board/layout";
import { BoardWatcher } from "./board/watcher";
import { Corgi } from "./corgi/cli";
import { defaultChord } from "./talk/chord";

/**
 * Agent Deck: corgi's Claude Code session board on keys. corgi tracks the
 * sessions, keeps the board and does the focusing; this plugin draws
 * sessions.json and turns presses into `corgi agent …` commands. It holds no
 * session state and never starts the daemon.
 */

interface GlobalSettings {
	corgiPath?: string;
	talkChord?: string;
	[key: string]: string | undefined;
}

const log = streamDeck.logger.createScope("agent-deck");
streamDeck.logger.setLevel("info");

const corgi = new Corgi();
const layout = new Layout();
const watcher = new BoardWatcher(corgi);
const slot = new SlotAction({ layout, watcher, corgi, log });
let chord = defaultChord;
const talk = new TalkAction({ watcher, corgi, log, sendKeystroke, lastFocused: () => slot.lastFocused(), chord: () => chord });

streamDeck.actions.registerAction(slot);
streamDeck.actions.registerAction(talk);

// The pulse for keys that need a person: one timer for the whole board,
// running only while such a key is on screen.
let pulse: NodeJS.Timeout | undefined;
let frame: 0 | 1 = 0;
function syncPulse(): void {
	const want = slot.needsPulse();
	if (want && !pulse) {
		pulse = setInterval(() => {
			frame = frame === 0 ? 1 : 0;
			slot.setFrame(frame);
		}, 1000);
	} else if (!want && pulse) {
		clearInterval(pulse);
		pulse = undefined;
		frame = 0;
		slot.setFrame(0);
	}
}

// Elapsed times keep counting between publishes: a slow tick while any
// session is on a key. The renderer buckets to 5 s, so most ticks redraw
// nothing.
let ticker: NodeJS.Timeout | undefined;
function syncTicker(): void {
	const want = slot.showsSessions();
	if (want && !ticker) {
		ticker = setInterval(() => slot.redraw(), 5000);
	} else if (!want && ticker) {
		clearInterval(ticker);
		ticker = undefined;
	}
}

// Board-size sync: the board follows the largest deck that shows it, resized
// once per distinct size. corgi applies it live; the next board reflects it.
// Never below the number of pinned keys, which would drop a reserved seat.
let sizedTo: number | undefined;
async function syncBoardSize(): Promise<void> {
	const board = watcher.current();
	if (!board || !watcher.daemonRunning()) {
		return;
	}
	const pinned = board.slots.filter((s) => s.pinned).length;
	const want = Math.max(0, ...layout.devices().map((d) => layout.count(d)));
	if (want === 0 || want === board.size || sizedTo === want || want < pinned) {
		return;
	}
	sizedTo = want;
	log.info(`deck shows ${want} keys; board has ${board.size} — resizing`);
	const result = await corgi.run(["agent", "board", "--slots", String(want)]);
	if (!result.ok) {
		log.warn(`resize failed: ${result.stderr.trim()}`);
	}
}

watcher.on("board", (board) => {
	slot.redraw();
	talk.onBoard(board);
	syncPulse();
	syncTicker();
	void syncBoardSize();
});
watcher.on("daemon", (running) => {
	log.info(running ? "corgi agent is running" : "corgi agent is not running — keys go dim until it is");
	slot.redraw();
	talk.redraw();
	syncPulse();
	syncTicker();
});
watcher.on("error", (message) => log.warn(message));

function applySettings(settings: GlobalSettings): void {
	corgi.setOverride(settings.corgiPath);
	chord = settings.talkChord?.trim() || defaultChord;
}

streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>((ev) => {
	applySettings(ev.settings);
	void watcher.refreshFromCli();
});

await streamDeck.connect();
applySettings(await streamDeck.settings.getGlobalSettings<GlobalSettings>());
try {
	log.info(`corgi at ${await corgi.resolve()}`);
} catch (error) {
	log.warn(String((error as Error).message));
}
await watcher.start();
log.info(`board at ${watcher.boardPath() ?? "(unknown — corgi did not answer)"}`);
