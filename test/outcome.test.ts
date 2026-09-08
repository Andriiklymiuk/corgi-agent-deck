import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { HoldDetector } from "../src/actions/hold";
import { awaitOutcome, outcomeOf } from "../src/board/outcome";
import type { Board, BoardReport } from "../src/corgi/types";

const fixture = JSON.parse(readFileSync(new URL("../fixtures/sessions.json", import.meta.url), "utf8")) as BoardReport;
const id = "5b1c2e7a-acme";
const since = Date.parse("2026-09-08T05:00:00Z");
const withSession = (patch: Record<string, unknown>, board: Partial<Board> = {}): Board => ({
	...fixture,
	...board,
	sessions: fixture.sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)),
});

describe("outcomeOf", () => {
	it("reads a landed focus, a failure, and the panel's keyboard-only answer", () => {
		expect(outcomeOf(fixture, id, since)).toBeUndefined(); // the fixture's focusAt is the zero time
		expect(outcomeOf(withSession({ focusAt: "2026-09-08T05:00:01Z" }), id, since)).toEqual({ kind: "ok" });
		expect(outcomeOf(withSession({ focusAt: "2026-09-08T05:00:01Z", focusError: "no window known" }), id, since)).toEqual({ kind: "error", message: "no window known" });
		const panel = withSession({ focusAt: "2026-09-08T05:00:01Z", focusError: "corgi runs in the Claude Code panel, which takes text only from the keyboard" });
		expect(outcomeOf(panel, id, since).kind).toBe("keyboard");
		// An older outcome is not this press's.
		expect(outcomeOf(withSession({ focusAt: "2026-09-08T04:00:00Z", focusError: "old" }), id, since)).toBeUndefined();
		expect(outcomeOf(withSession({}), "nope", since)).toBeUndefined();
	});

	it("treats a fresh board notice as the command being refused", () => {
		const refused = withSession({}, { notice: "acme-api asks to run \"rm -rf\" — look at it before allowing", noticeAt: "2026-09-08T05:00:00.5Z" });
		expect(outcomeOf(refused, id, since)).toEqual({ kind: "error", message: refused.notice });
		expect(outcomeOf(withSession({}, { notice: "stale", noticeAt: "2026-09-08T04:00:00Z" }), id, since)).toBeUndefined();
	});
});

describe("awaitOutcome", () => {
	it("resolves on the first board that answers and stops listening", async () => {
		const boards = new EventEmitter();
		const pending = awaitOutcome(boards as never, id, since, 1000);
		boards.emit("board", fixture); // nothing yet
		boards.emit("board", withSession({ focusAt: "2026-09-08T05:00:01Z" }));
		expect(await pending).toEqual({ kind: "ok" });
		expect(boards.listenerCount("board")).toBe(0);
	});

	it("assumes the window is up when the board stays silent", async () => {
		const boards = new EventEmitter();
		expect(await awaitOutcome(boards as never, id, since, 20)).toEqual({ kind: "ok" });
		expect(boards.listenerCount("board")).toBe(0);
	});
});

describe("HoldDetector", () => {
	it("tells a short press from a hold", async () => {
		const fired: string[] = [];
		const hold = new HoldDetector((actionId, kind) => fired.push(`${actionId}:${kind}`), 30);
		hold.down("a");
		hold.up("a");
		expect(fired).toEqual(["a:short"]);
		hold.down("b");
		await new Promise((r) => setTimeout(r, 60));
		hold.up("b"); // the release after a hold is nothing
		expect(fired).toEqual(["a:short", "b:long"]);
		hold.down("c");
		hold.cancel("c");
		await new Promise((r) => setTimeout(r, 60));
		hold.up("c");
		expect(fired).toEqual(["a:short", "b:long"]);
	});
});
