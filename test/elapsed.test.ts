import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { hiddenNeeds, liveElapsed } from "../src/board/elapsed";
import type { BoardReport } from "../src/corgi/types";

const fixture = JSON.parse(readFileSync(new URL("../fixtures/sessions.json", import.meta.url), "utf8")) as BoardReport;

describe("liveElapsed", () => {
	it("keeps counting from the session's statusSince between publishes", () => {
		const slot = fixture.slots[0];
		const session = fixture.sessions.find((s) => s.id === slot.sessionId)!;
		const now = Date.parse(session.statusSince) + 90_000;
		expect(liveElapsed(slot, fixture, now)).toBe(90);
		expect(liveElapsed(slot, fixture, Date.parse(session.statusSince) - 1000)).toBe(slot.elapsedS); // a clock behind the daemon: fall back
	});

	it("falls back to the snapshot when the session is not in the board", () => {
		const orphan = { index: 0, sessionId: "nope", elapsedS: 7 };
		expect(liveElapsed(orphan, fixture)).toBe(7);
		expect(liveElapsed({ index: 1, empty: true }, fixture)).toBeUndefined();
	});
});

describe("hiddenNeeds", () => {
	it("counts sessions needing a person that no key shows", () => {
		expect(hiddenNeeds(fixture)).toBe(0); // the one that needs input is on key 1
		const hidden = { ...fixture, needsInput: 3 };
		expect(hiddenNeeds(hidden)).toBe(2);
		expect(hiddenNeeds({ ...fixture, needsInput: 0 })).toBe(0);
	});
});
