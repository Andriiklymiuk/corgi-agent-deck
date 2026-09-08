import streamDeck from "@elgato/streamdeck";

import { SlotAction, slotUUID } from "./actions/slot";
import { Layout } from "./board/layout";
import { BoardWatcher } from "./board/watcher";
import { Corgi } from "./corgi/cli";

/**
 * Agent Deck: corgi's Claude Code session board on keys. corgi tracks the
 * sessions, keeps the board and does the focusing; this plugin draws
 * sessions.json and turns presses into `corgi agent …` commands. It holds no
 * session state and never starts the daemon.
 */

interface GlobalSettings {
	corgiPath?: string;
	[key: string]: string | undefined;
}

const log = streamDeck.logger.createScope("agent-deck");
streamDeck.logger.setLevel("info");

const corgi = new Corgi();
const layout = new Layout();
const watcher = new BoardWatcher(corgi);
const slot = new SlotAction({ layout, watcher, corgi, log });

streamDeck.actions.registerAction(slot);

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

// Board-size sync: a device with more or fewer keys than the board gets the
// board resized once. corgi applies it live; the next board reflects it.
const sizedFor = new Map<string, number>();
async function syncBoardSize(): Promise<void> {
	const board = watcher.current();
	if (!board || !watcher.daemonRunning()) {
		return;
	}
	const pinned = board.slots.filter((s) => s.pinned).length;
	for (const deviceId of layout.devices()) {
		const count = layout.count(deviceId);
		if (count === 0 || count === board.size || sizedFor.get(deviceId) === count || count < pinned) {
			continue;
		}
		sizedFor.set(deviceId, count);
		log.info(`device ${deviceId} has ${count} keys; board has ${board.size} — resizing`);
		const result = await corgi.run(["agent", "board", "--slots", String(count)]);
		if (!result.ok) {
			log.warn(`resize failed: ${result.stderr.trim()}`);
		}
	}
}

watcher.on("board", () => {
	slot.redraw();
	syncPulse();
	void syncBoardSize();
});
watcher.on("daemon", (running) => {
	log.info(running ? "corgi agent is running" : "corgi agent is not running — keys go dim until it is");
	slot.redraw();
	syncPulse();
});
watcher.on("error", (message) => log.warn(message));

streamDeck.settings.onDidReceiveGlobalSettings<GlobalSettings>((ev) => {
	corgi.setOverride(ev.settings.corgiPath);
	void watcher.refreshFromCli();
});

await streamDeck.connect();
const settings = await streamDeck.settings.getGlobalSettings<GlobalSettings>();
corgi.setOverride(settings.corgiPath);
try {
	log.info(`corgi at ${await corgi.resolve()}`);
} catch (error) {
	log.warn(String((error as Error).message));
}
await watcher.start();
log.info(`board at ${watcher.boardPath() ?? "(unknown — corgi did not answer)"}`);
