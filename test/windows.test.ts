import { describe, expect, it } from "vitest";
import { frontWindow, nextWindow, nextWindowSession, windowLabel } from "../src/board/windows";
import { emptyBoard } from "../src/corgi/types";
import type { Board, Session, Window } from "../src/corgi/types";

const win = (id: string, folder: string, focusedAt = ""): Window => ({ id, extHostPid: 1, folders: [folder], focusedAt, updatedAt: "" });
const session = (id: string, windowId: string, status: Session["status"] = "working"): Session =>
	({ id, label: id, status, statusSince: "2026-09-09T10:00:00Z", host: { kind: "vscode-terminal", windowId } }) as Session;

const board = (): Board => ({
	...emptyBoard(),
	windows: [win("w-b", "/Users/me/dev/web"), win("w-a", "/Users/me/dev/api"), win("w-c", "/Users/me/dev/corgi/")],
	frontWindow: "w-a",
	sessions: [session("s1", "w-a"), session("s2", "w-c"), session("s3", "w-b", "gone")],
});

describe("windows", () => {
	it("names a window by its folder", () => {
		expect(windowLabel(win("w", "/Users/me/dev/corgi/"))).toBe("corgi");
		expect(windowLabel({ id: "w", extHostPid: 1, app: "Cursor", updatedAt: "" })).toBe("Cursor");
		expect(windowLabel(undefined)).toBe("");
	});

	it("walks the windows by name and wraps", () => {
		const b = board();
		expect(frontWindow(b)?.id).toBe("w-a");
		expect(nextWindow(b)?.id).toBe("w-c"); // api → corgi → web → api
		expect(nextWindow({ ...b, frontWindow: "w-b" })?.id).toBe("w-a");
		expect(nextWindow(b, "w-c")?.id).toBe("w-b"); // from a picked window, not the front one
		expect(nextWindow({ ...b, windows: [win("w-a", "/a")] })).toBeUndefined();
	});

	it("falls back to the last focused window", () => {
		const b = { ...board(), frontWindow: undefined, windows: [win("w-b", "/b", "2026-09-09T10:00:00Z"), win("w-a", "/a", "2026-09-09T11:00:00Z")] };
		expect(frontWindow(b)?.id).toBe("w-a");
	});

	it("finds the next window that has a live session", () => {
		const b = board();
		expect(nextWindowSession(b)?.id).toBe("s2");
		expect(nextWindowSession({ ...b, frontWindow: "w-c" })?.id).toBe("s1"); // web only has a closed one
		expect(nextWindowSession({ ...b, sessions: [] })).toBeUndefined();
	});
});
