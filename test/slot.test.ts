import { describe, expect, it } from "vitest";

import { commandFor } from "../src/actions/slot";
import { emptyBoard } from "../src/corgi/types";

describe("commandFor", () => {
	it("maps every kind of key and press to its corgi command", () => {
		const session = { index: 2, sessionId: "5b1c", label: "acme-api", status: "done" as const };
		expect(commandFor(session, "short")).toEqual(["agent", "focus", "5b1c"]);
		expect(commandFor({ ...session, status: "working" }, "long")).toEqual(["agent", "pin", "3"]); // 1-based
		expect(commandFor({ ...session, status: "needs_input" }, "long")).toEqual(["agent", "pin", "3"]);
		expect(commandFor({ ...session, pinned: true }, "long")).toEqual(["agent", "pin", "3", "--off"]);
		expect(commandFor({ ...session, status: "done" }, "long")).toEqual(["agent", "dismiss", "5b1c"]);
		expect(commandFor({ ...session, status: "limited" }, "long")).toEqual(["agent", "dismiss", "5b1c"]);
		expect(commandFor({ ...session, status: "done", pinned: true }, "long")).toEqual(["agent", "pin", "3", "--off"]);
		expect(commandFor({ index: 5, pager: true, overflow: 2 }, "short")).toEqual(["agent", "page", "next"]);
		expect(commandFor({ index: 5, pager: true, overflow: 2 }, "long")).toEqual(["agent", "page", "prev"]);
		expect(commandFor({ index: 4, empty: true }, "short")).toEqual(["agent", "new"]);
		expect(commandFor({ index: 4, empty: true }, "long")).toEqual(["agent", "new"]); // no other window to walk to
	});
});

describe("the + key", () => {
	const board = { ...emptyBoard(), frontWindow: "w-a", windows: [
		{ id: "w-a", extHostPid: 1, folders: ["/dev/api"], updatedAt: "" },
		{ id: "w-b", extHostPid: 2, folders: ["/dev/web"], updatedAt: "" },
	] };
	it("opens in the front window on a press and walks to the next on a hold", () => {
		expect(commandFor({ index: 0, empty: true }, "short", board)).toEqual(["agent", "new"]);
		expect(commandFor({ index: 0, empty: true }, "long", board)).toEqual(["agent", "new", "--window", "w-b"]);
		expect(commandFor({ index: 0, empty: true }, "long", { ...board, windows: board.windows.slice(0, 1) })).toEqual(["agent", "new"]);
	});
});
