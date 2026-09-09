import type { Board, Session, Window } from "../corgi/types";

/** The workspace a window shows: its first folder's name. */
export function windowLabel(w: Window | undefined): string {
	const folder = w?.folders?.[0];
	if (folder) {
		return folder.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || folder;
	}
	return w?.app ?? "";
}

/** Windows in a stable order, so "next" means the same thing on every press. */
function ordered(board: Board | undefined): Window[] {
	return [...(board?.windows ?? [])].sort((a, b) => windowLabel(a).localeCompare(windowLabel(b)) || a.id.localeCompare(b.id));
}

/** The window in front: what corgi worked out, else the one focused last. */
export function frontWindow(board: Board | undefined): Window | undefined {
	const windows = board?.windows ?? [];
	const byId = windows.find((w) => w.id === board?.frontWindow) ?? windows.find((w) => w.id === board?.lastFocusWindow);
	if (byId) {
		return byId;
	}
	return [...windows].sort((a, b) => (b.focusedAt ?? "").localeCompare(a.focusedAt ?? ""))[0];
}

/** The window after `fromId` (default: the front one), wrapping; undefined with fewer than two. */
export function nextWindow(board: Board | undefined, fromId?: string): Window | undefined {
	const windows = ordered(board);
	if (windows.length < 2) {
		return undefined;
	}
	const from = fromId ?? frontWindow(board)?.id;
	const at = windows.findIndex((w) => w.id === from);
	return windows[(at + 1) % windows.length];
}

/** The live session in a window, newest first; closed ones do not count. */
export function sessionInWindow(board: Board | undefined, windowId: string): Session | undefined {
	return (board?.sessions ?? [])
		.filter((s) => s.host.windowId === windowId && s.status !== "gone")
		.sort((a, b) => (b.statusSince ?? "").localeCompare(a.statusSince ?? ""))[0];
}

/** The first session in the windows after the front one, wrapping. */
export function nextWindowSession(board: Board | undefined): Session | undefined {
	const windows = ordered(board);
	if (windows.length < 2) {
		return undefined;
	}
	const front = frontWindow(board);
	const at = windows.findIndex((w) => w.id === front?.id);
	for (let step = 1; step < windows.length; step++) {
		const session = sessionInWindow(board, windows[(at + step) % windows.length].id);
		if (session) {
			return session;
		}
	}
	return undefined;
}
