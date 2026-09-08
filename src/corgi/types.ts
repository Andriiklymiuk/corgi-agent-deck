/**
 * The board corgi publishes as sessions.json. Mirrors utils/agent/sessions in
 * the corgi repository; `corgi agent sessions --json` adds `path` and
 * `daemonRunning` on top. Refresh fixtures/sessions.json when this changes.
 */

export type Status = "working" | "needs_input" | "done" | "stale" | "gone" | "unknown";

export type HostKind = "vscode-terminal" | "vscode-panel" | "iterm" | "terminal" | "unknown";

export interface Slot {
	index: number;
	empty?: boolean;
	pager?: boolean;
	overflow?: number;
	sessionId?: string;
	label?: string;
	profile?: string;
	status?: Status;
	pinned?: boolean;
	elapsedS?: number;
	detail?: string;
	host?: HostKind;
	focusError?: string;
	focusAt?: string;
}

export interface SessionHost {
	kind: HostKind;
	windowId?: string;
	app?: string;
	folder?: string;
	shellPid?: number;
	terminal?: string;
	connected?: boolean;
}

export interface Session {
	id: string;
	label: string;
	display?: string;
	cwd?: string;
	profile?: string;
	status: Status;
	statusSince: string;
	detail?: string;
	tool?: string;
	startedAt: string;
	lastActivity: string;
	host: SessionHost;
	focusError?: string;
	focusAt?: string;
}

export interface Window {
	id: string;
	app?: string;
	extHostPid: number;
	folders?: string[];
	terminals?: { name: string; shellPid: number }[];
	updatedAt: string;
}

export interface Board {
	updatedAt: string;
	size: number;
	overflow: number;
	needsInput: number;
	working: number;
	slots: Slot[];
	sessions: Session[];
	windows?: Window[];
	lastFocusWindow?: string;
	notice?: string;
	noticeAt?: string;
}

/** What `corgi agent sessions --json` prints. */
export interface BoardReport extends Board {
	path: string;
	daemonRunning: boolean;
}

/** A board with nothing on it, for the moment before corgi has answered. */
export function emptyBoard(size = 6): Board {
	return {
		updatedAt: "",
		size,
		overflow: 0,
		needsInput: 0,
		working: 0,
		slots: Array.from({ length: size }, (_, index) => ({ index, empty: true })),
		sessions: [],
	};
}
