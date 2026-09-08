import { describe, expect, it } from "vitest";

import { commandFor } from "../src/actions/slot";

describe("commandFor", () => {
	it("maps every kind of key and press to its corgi command", () => {
		const session = { index: 2, sessionId: "5b1c", label: "acme-api", status: "done" as const };
		expect(commandFor(session, "short")).toEqual(["agent", "focus", "5b1c"]);
		expect(commandFor(session, "long")).toEqual(["agent", "pin", "3"]); // 1-based
		expect(commandFor({ ...session, pinned: true }, "long")).toEqual(["agent", "pin", "3", "--off"]);
		expect(commandFor({ index: 5, pager: true, overflow: 2 }, "short")).toEqual(["agent", "page", "next"]);
		expect(commandFor({ index: 5, pager: true, overflow: 2 }, "long")).toEqual(["agent", "page", "prev"]);
		expect(commandFor({ index: 4, empty: true }, "short")).toEqual(["agent", "new"]);
		expect(commandFor({ index: 4, empty: true }, "long")).toEqual(["agent", "rescan"]);
	});
});
