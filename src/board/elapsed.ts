import type { Board, Session, Slot } from "../corgi/types";

export type SessionIndex = Map<string, Session>;

/** Sessions by id, built once per redraw rather than searched once per key. */
export function indexSessions(board: Board): SessionIndex {
	return new Map(board.sessions.map((s) => [s.id, s]));
}

/**
 * Elapsed time as the key should show it right now. corgi publishes only
 * when something visible changes, so a slot's `elapsedS` is a snapshot from
 * the last publish; the session's `statusSince` lets the key keep counting
 * between publishes. Bucketed to 5 s by the renderer, so a ticker at that
 * rate costs one cache lookup per key.
 */
export function liveElapsed(slot: Slot, board: Board, now = Date.now(), sessions: SessionIndex = indexSessions(board)): number | undefined {
	if (!slot.sessionId) {
		return undefined;
	}
	const session = sessions.get(slot.sessionId);
	const since = session ? Date.parse(session.statusSince) : NaN;
	if (Number.isFinite(since) && since <= now) {
		return Math.floor((now - since) / 1000);
	}
	return slot.elapsedS;
}

/** Sessions needing a person that no visible key shows: what the pager should say. */
export function hiddenNeeds(board: Board): number {
	const visible = board.slots.filter((s) => s.sessionId && s.status === "needs_input").length;
	return Math.max(0, board.needsInput - visible);
}
