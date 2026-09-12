/**
 * The board corgi publishes as sessions.json. Mirrors utils/agent/sessions in
 * the corgi repository; `corgi agent sessions --json` adds `path` and
 * `daemonRunning` on top. Refresh fixtures/sessions.json when this changes.
 */

export type Status = "working" | "needs_input" | "done" | "stale" | "gone" | "unknown" | "limited";

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
	/** Context window used, in percent; 0 or absent when unknown. */
	context?: number;
	/** Tool of the permission prompt waiting, while status is needs_input. */
	pending?: string;
	/** The owner's own line (`corgi agent note`). */
	note?: string;
	/** Working but silent for 12 minutes or more. */
	stuck?: boolean;
	/** The first reason the daemon thinks a person should look. */
	drift?: string;
	/** The first other session on the same files — "api·2 on registry.go". */
	overlap?: string;
	/** What the session has cost, in one word — "52.3M" — and whether it passed its budget. */
	spend?: string;
	overCap?: boolean;
}

export interface SessionContext {
	tokens: number;
	window: number;
	percent: number;
	model?: string;
	at: string;
}

/** One permission prompt: the tool, the one safe word about its input, and when it was raised. */
export interface Pending {
	tool: string;
	subject?: string;
	at: string;
}

export interface LimitWindow {
	percent: number;
	resetsAt?: string;
}

/** The account's rate limits as Claude Code last fetched them. */
export interface Limits {
	fetchedAt: string;
	fiveHour: LimitWindow;
	sevenDay: LimitWindow;
}

/** Where one limit is heading; `safe: false` means it runs out before it resets. */
export interface WindowForecast {
	percentPerHour: number;
	exhaustAt?: string;
	safe: boolean;
	samples: number;
}

export interface Forecast {
	fiveHour?: WindowForecast;
	sevenDay?: WindowForecast;
}

/** One Claude account the board's sessions run under. */
export interface Account {
	profile: string;
	configDir?: string;
	limits?: Limits;
	forecast?: Forecast;
	/** Live sessions under it. */
	sessions: number;
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
	context?: SessionContext;
	pending?: Pending;
	/** The chat's title, as its panel tab shows it. */
	title?: string;
	note?: string;
	stuck?: boolean;
}

export interface Window {
	id: string;
	app?: string;
	extHostPid: number;
	folders?: string[];
	terminals?: { name: string; shellPid: number }[];
	focusedAt?: string;
	activeShellPid?: number;
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
	/** The window in front and the session the user sees in it, as corgi worked it out. */
	frontWindow?: string;
	frontSession?: string;
	notice?: string;
	noticeAt?: string;
	/** Every account the sessions run under, with its limits. */
	accounts?: Account[];
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
