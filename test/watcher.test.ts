import { mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { BoardWatcher } from "../src/board/watcher";
import type { CliDeps, Corgi, JsonResult } from "../src/corgi/cli";
import type { Board, BoardReport } from "../src/corgi/types";

const fixture = JSON.parse(readFileSync(new URL("../fixtures/sessions.json", import.meta.url), "utf8")) as BoardReport;

/** A corgi whose `sessions --json` answer is scripted. */
function fakeCorgi(answer: () => JsonResult<BoardReport>): Corgi {
	return { runJson: async () => answer(), run: async () => ({ ok: true, daemonDown: false, stdout: "", stderr: "", code: 0 }) } as unknown as Corgi;
}

function publish(path: string, board: Board): void {
	const tmp = path + ".tmp";
	writeFileSync(tmp, JSON.stringify(board));
	renameSync(tmp, path);
}

const until = (cond: () => boolean, ms = 3000): Promise<void> =>
	new Promise((resolve, reject) => {
		const start = Date.now();
		const tick = (): void => {
			if (cond()) {
				resolve();
			} else if (Date.now() - start > ms) {
				reject(new Error("timed out"));
			} else {
				setTimeout(tick, 10);
			}
		};
		tick();
	});

let watcher: BoardWatcher | undefined;
afterEach(() => watcher?.stop());

describe("BoardWatcher", () => {
	it("takes the path from corgi, then follows atomic publishes", async () => {
		const dir = mkdtempSync(join(tmpdir(), "agent-deck-"));
		const path = join(dir, "sessions.json");
		publish(path, fixture);
		watcher = new BoardWatcher(
			fakeCorgi(() => ({ value: { ...fixture, path } })),
			{ pollMs: 60_000 },
		);
		const boards: Board[] = [];
		watcher.on("board", (b) => boards.push(b));
		await watcher.start();
		expect(boards).toHaveLength(1);
		expect(watcher.daemonRunning()).toBe(true);
		expect(watcher.boardPath()).toBe(path);

		publish(path, { ...fixture, updatedAt: "2026-09-08T00:00:01Z", needsInput: 2 });
		await until(() => boards.length === 2);
		expect(boards[1].needsInput).toBe(2);

		// Same updatedAt again: no redraw. A torn file: keep the last good board.
		publish(path, { ...fixture, updatedAt: "2026-09-08T00:00:01Z", needsInput: 2 });
		writeFileSync(path + ".tmp", "{ not json");
		renameSync(path + ".tmp", path);
		await new Promise((r) => setTimeout(r, 150));
		expect(boards).toHaveLength(2);
		expect(watcher.current()?.needsInput).toBe(2);
	});

	it("reports a daemon that is down and recovers when it is back", async () => {
		const dir = mkdtempSync(join(tmpdir(), "agent-deck-"));
		const path = join(dir, "sessions.json");
		let up = false;
		watcher = new BoardWatcher(
			fakeCorgi(() => (up ? { value: { ...fixture, path } } : { daemonDown: true })),
			{ retryMinMs: 20, retryMaxMs: 40, pollMs: 60_000 },
		);
		const daemon: boolean[] = [];
		watcher.on("daemon", (running) => daemon.push(running));
		await watcher.start();
		expect(watcher.daemonRunning()).toBe(false);
		expect(watcher.current()).toBeUndefined();
		publish(path, fixture);
		up = true;
		await until(() => watcher!.daemonRunning());
		expect(daemon).toEqual([true]); // false was the initial state, not a transition
		expect(watcher.current()?.size).toBe(6);
	});

	it("surfaces other failures as errors and keeps trying", async () => {
		watcher = new BoardWatcher(fakeCorgi(() => ({ error: "corgi printed something that is not JSON" })), { retryMinMs: 20, retryMaxMs: 20 });
		const errors: string[] = [];
		watcher.on("error", (m) => errors.push(m));
		await watcher.start();
		await until(() => errors.length >= 2);
	});
});

// CliDeps is imported only to keep the fake honest about the shape it stands in for.
export type _Unused = CliDeps;
