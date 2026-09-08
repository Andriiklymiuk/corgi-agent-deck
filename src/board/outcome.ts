import type { Board } from "../corgi/types";

/**
 * What the board says became of a command sent for a session: the daemon
 * records a focus (or a send, which focuses first) on the session as
 * focusAt/focusError, and a command it refused as a board notice. A panel
 * session's send fails with a message naming the keyboard: the window is
 * up, and the key types the text itself.
 */
export type Outcome = { kind: "ok" } | { kind: "keyboard"; message: string } | { kind: "error"; message: string };

interface Boards {
	on(event: "board", fn: (board: Board) => void): unknown;
	off(event: "board", fn: (board: Board) => void): unknown;
}

/** Reads one board for the outcome of a command sent at `since`; undefined when it has nothing to say yet. */
export function outcomeOf(board: Board, sessionId: string, since: number): Outcome | undefined {
	const recent = (at: string | undefined): boolean => !!at && Date.parse(at) >= since - 1000;
	if (board.notice && recent(board.noticeAt)) {
		return { kind: "error", message: board.notice };
	}
	const session = board.sessions.find((s) => s.id === sessionId);
	if (!session || !recent(session.focusAt)) {
		return undefined;
	}
	if (!session.focusError) {
		return { kind: "ok" };
	}
	return /keyboard/i.test(session.focusError) ? { kind: "keyboard", message: session.focusError } : { kind: "error", message: session.focusError };
}

/** Waits for the board to report; no word within the budget means the window is assumed up. */
export function awaitOutcome(boards: Boards, sessionId: string, since: number, budgetMs: number): Promise<Outcome> {
	return new Promise((resolve) => {
		const done = (outcome: Outcome): void => {
			clearTimeout(timer);
			boards.off("board", check);
			resolve(outcome);
		};
		const check = (board: Board): void => {
			const outcome = outcomeOf(board, sessionId, since);
			if (outcome) {
				done(outcome);
			}
		};
		const timer = setTimeout(() => done({ kind: "ok" }), budgetMs);
		boards.on("board", check);
	});
}
