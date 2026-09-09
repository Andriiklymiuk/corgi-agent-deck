import { action, type KeyAction, type KeyDownEvent, type KeyUpEvent, SingletonAction, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";

import { hiddenNeeds, indexSessions, liveElapsed, type SessionIndex } from "../board/elapsed";
import type { Layout } from "../board/layout";
import type { BoardWatcher } from "../board/watcher";
import type { Corgi } from "../corgi/cli";
import type { Board, Slot, Status } from "../corgi/types";
import { type Frame, KeyCache, type KeyInput, offKey } from "../render/key";
import { HoldDetector, longPressMs } from "./hold";
import { frontWindow, nextWindow, windowLabel } from "../board/windows";

export const slotUUID = "com.andriiklymiuk.corgi-agent-deck.slot";

export { longPressMs };

export interface SlotDeps {
	layout: Layout;
	watcher: BoardWatcher;
	corgi: Corgi;
	log: { info(msg: string): void; debug(msg: string): void; warn(msg: string): void };
}

/**
 * The board key. Every instance is one slot; which one is decided by its
 * coordinates (see Layout). Presses become corgi commands; the board coming
 * back is the feedback.
 */
@action({ UUID: slotUUID })
export class SlotAction extends SingletonAction {
	private readonly instances = new Map<string, KeyAction>();
	private readonly hold = new HoldDetector((actionId, kind, at) => {
		const key = this.instances.get(actionId);
		if (key) {
			void this.press(key, kind, at);
		}
	});
	private readonly drawn = new Map<string, string>();
	/** Per slot index: the focusAt already flashed, so a failure alerts once. */
	private readonly alerted = new Map<number, string>();
	private readonly cache = new KeyCache();
	private frame: Frame = 0;
	private lastPress: { index: number; at: number } | undefined;
	private lastFocusedId: string | undefined;

	/** The session the last press focused: where the talk key dictates. */
	lastFocused(): string | undefined {
		return this.lastFocusedId;
	}

	constructor(private readonly deps: SlotDeps) {
		super();
	}

	override onWillAppear(ev: WillAppearEvent): void {
		if (!ev.action.isKey() || !ev.action.coordinates) {
			return; // a dial, or inside a multi-action: no slot of its own
		}
		this.instances.set(ev.action.id, ev.action);
		this.deps.layout.set(ev.action.device.id, ev.action.id, ev.action.coordinates);
		this.redraw();
	}

	override onWillDisappear(ev: WillDisappearEvent): void {
		this.instances.delete(ev.action.id);
		this.drawn.delete(ev.action.id);
		this.deps.layout.remove(ev.action.id);
		this.hold.cancel(ev.action.id);
		this.redraw();
	}

	override onKeyDown(ev: KeyDownEvent): void {
		this.hold.down(ev.action.id);
	}

	override onKeyUp(ev: KeyUpEvent): void {
		this.hold.up(ev.action.id);
	}

	/** What a press means depends only on what the key shows. */
	async press(key: KeyAction, kind: "short" | "long", at: number): Promise<void> {
		const index = this.deps.layout.indexOf(key.id);
		if (index === undefined) {
			return;
		}
		if (!this.deps.watcher.daemonRunning()) {
			await this.deps.watcher.refreshFromCli();
			if (!this.deps.watcher.daemonRunning()) {
				await key.showAlert().catch(() => undefined);
			}
			return;
		}
		const slot = this.slotAt(index);
		const args = commandFor(slot, kind, this.deps.watcher.current());
		if (!args) {
			return;
		}
		this.lastPress = { index, at };
		this.deps.log.debug(`key ${index + 1} ${kind}: corgi ${args.join(" ")}`);
		const result = await this.deps.corgi.run(args);
		if (result.ok) {
			if (args[1] === "focus" && slot.sessionId) {
				this.lastFocusedId = slot.sessionId;
			}
			return;
		}
		this.deps.log.warn(`corgi ${args.join(" ")}: ${result.stderr.trim()}`);
		await key.showAlert().catch(() => undefined);
		if (result.daemonDown) {
			await this.deps.watcher.refreshFromCli();
		}
	}

	/** Called on every board and on every pulse frame. */
	setFrame(frame: Frame): void {
		this.frame = frame;
		this.redraw();
	}

	redraw(): void {
		if (this.instances.size === 0) {
			return;
		}
		const board = this.deps.watcher.current();
		const running = this.deps.watcher.daemonRunning();
		const now = Date.now();
		const hidden = board ? hiddenNeeds(board) : 0;
		const sessions = board ? indexSessions(board) : new Map();
		for (const [id, key] of this.instances) {
			const index = this.deps.layout.indexOf(id);
			const input: KeyInput = !running || !board || index === undefined ? offKey : this.inputFor(this.slotAt(index, board), board, hidden, now, sessions);
			const { key: cacheKey, image } = this.cache.get(input, this.frame);
			if (this.drawn.get(id) !== cacheKey) {
				this.drawn.set(id, cacheKey);
				void key.setImage(image).catch(() => undefined);
			}
			if (running && board && index !== undefined) {
				this.flashIfFailed(key, index, board);
			}
		}
	}

	/** A slot as drawn now: elapsed keeps counting between publishes, the pager knows what it hides. */
	private inputFor(slot: Slot, board: Board, hidden: number, now: number, sessions: SessionIndex): KeyInput {
		if (slot.pager) {
			return { ...slot, hiddenNeeds: hidden };
		}
		if (slot.sessionId) {
			return { ...slot, elapsedS: liveElapsed(slot, board, now, sessions) };
		}
		// The "+" says where a press opens a session: the window in front.
		return { ...slot, label: windowLabel(frontWindow(board)) };
	}

	/** Something on this key needs a pulse frame: a session needing a person, or a pager hiding one. */
	needsPulse(): boolean {
		const board = this.deps.watcher.current();
		if (!board || !this.deps.watcher.daemonRunning()) {
			return false;
		}
		const hidden = hiddenNeeds(board);
		for (const id of this.instances.keys()) {
			const index = this.deps.layout.indexOf(id);
			if (index === undefined) {
				continue;
			}
			const slot = this.slotAt(index, board);
			if (slot.status === "needs_input" || (slot.pager && hidden > 0)) {
				return true;
			}
		}
		return false;
	}

	/** A session is on screen, so elapsed times should keep counting. */
	showsSessions(): boolean {
		const board = this.deps.watcher.current();
		if (!board || !this.deps.watcher.daemonRunning()) {
			return false;
		}
		for (const id of this.instances.keys()) {
			const index = this.deps.layout.indexOf(id);
			if (index !== undefined && this.slotAt(index, board).sessionId) {
				return true;
			}
		}
		return false;
	}

	private slotAt(index: number, board: Board | undefined = this.deps.watcher.current()): Slot {
		return board?.slots[index] ?? { index, empty: true };
	}

	/** One alert per failed focus (or a failed `new`), never repeated. */
	private flashIfFailed(key: KeyAction, index: number, board: Board): void {
		const slot = board.slots[index];
		const press = this.lastPress;
		if (slot?.focusError && slot.focusAt && this.alerted.get(index) !== slot.focusAt && press?.index === index && Date.parse(slot.focusAt) >= press.at - 1000) {
			this.alerted.set(index, slot.focusAt);
			this.deps.log.info(`focus failed on key ${index + 1}: ${slot.focusError}`);
			void key.showAlert().catch(() => undefined);
		}
		if (slot?.empty && board.notice && board.noticeAt && press?.index === index && Date.parse(board.noticeAt) >= press.at - 1000 && this.alerted.get(index) !== board.noticeAt) {
			this.alerted.set(index, board.noticeAt);
			this.deps.log.info(`new session failed: ${board.notice}`);
			void key.showAlert().catch(() => undefined);
		}
	}
}

/** The corgi command for a press on a slot, or undefined for "nothing". */
export function commandFor(slot: Slot, kind: "short" | "long", board?: Board): string[] | undefined {
	if (slot.pager) {
		return ["agent", "page", kind === "short" ? "next" : "prev"];
	}
	if (slot.empty || !slot.sessionId) {
		// A hold walks the open windows: the next one comes forward and gets the session.
		const next = kind === "long" ? nextWindow(board) : undefined;
		return next ? ["agent", "new", "--window", next.id] : ["agent", "new"];
	}
	if (kind === "short") {
		return ["agent", "focus", slot.sessionId];
	}
	if (!slot.pinned && slot.status && finished.has(slot.status)) {
		// Nothing to protect on a finished key: a hold gives it back.
		return ["agent", "dismiss", slot.sessionId];
	}
	const args = ["agent", "pin", String(slot.index + 1)];
	if (slot.pinned) {
		args.push("--off");
	}
	return args;
}

const finished = new Set<Status>(["done", "stale", "gone", "limited"]);
