import { action, type KeyAction, type KeyDownEvent, SingletonAction, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import { execFile } from "node:child_process";

import type { BoardWatcher } from "../board/watcher";
import type { Corgi } from "../corgi/cli";
import type { Board, Session } from "../corgi/types";
import { renderTalkKey, type TalkState } from "../render/key";
import { defaultChord, defaultPanelChord, keystrokeCommand } from "../talk/chord";

export const talkUUID = "com.andriiklymiuk.agent-deck.talk";

/** How long a focus may take before the chord is not sent. */
const focusBudgetMs = 1500;
/** Claude Code stops a tap-mode recording after two minutes on its own. */
const recordingCapMs = 2 * 60 * 1000;

export interface TalkDeps {
	watcher: BoardWatcher;
	corgi: Corgi;
	/** The session the last slot press focused, if any. */
	lastFocused(): string | undefined;
	/** The keybindings.json chord for a terminal session, and the panel's own shortcut. */
	chord(): string;
	panelChord(): string;
	/** Presses a chord ("ctrl+y") in the front window. */
	sendKeystroke(chord: string): Promise<void>;
	log: { info(msg: string): void; debug(msg: string): void; warn(msg: string): void };
}

/**
 * Dictate into a session. Press: focus the session (the one in the window
 * in front, else the one last pressed on the deck, else the one that needs
 * you when exactly one does), wait for the board to confirm the focus
 * landed, then tap Claude Code's dictation chord. Press again: the same chord, which in tap mode sends the prompt.
 *
 * Claude Code does the recording and transcription; corgi does the
 * focusing; this key only presses one chord in the right window. It has no
 * way to see the recording, so REC is optimistic: it clears when the
 * session starts working or after Claude Code's own two-minute cap.
 */
@action({ UUID: talkUUID })
export class TalkAction extends SingletonAction {
	private readonly instances = new Map<string, KeyAction>();
	private state: TalkState = "idle";
	private recording: { sessionId: string; since: number; clear: NodeJS.Timeout } | undefined;
	private readonly drawn = new Map<string, string>();

	constructor(private readonly deps: TalkDeps) {
		super();
	}

	override onWillAppear(ev: WillAppearEvent): void {
		if (ev.action.isKey()) {
			this.instances.set(ev.action.id, ev.action);
			this.redraw();
		}
	}

	override onWillDisappear(ev: WillDisappearEvent): void {
		this.instances.delete(ev.action.id);
		this.drawn.delete(ev.action.id);
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		if (!ev.action.isKey()) {
			return;
		}
		if (!this.deps.watcher.daemonRunning()) {
			await ev.action.showAlert().catch(() => undefined);
			return;
		}
		if (this.recording) {
			// Second press: the same chord sends the prompt in tap mode.
			await this.tap(ev.action, this.recording.sessionId);
			this.stopRecording();
			return;
		}
		const sessionId = pickSession(this.deps.watcher.current(), this.deps.lastFocused());
		if (!sessionId) {
			this.deps.log.info("talk: no session to dictate into — no Claude Code session is running");
			await ev.action.showAlert().catch(() => undefined);
			return;
		}
		const focused = await this.focus(sessionId);
		if (!focused) {
			await ev.action.showAlert().catch(() => undefined);
			return;
		}
		if (await this.tap(ev.action, sessionId)) {
			this.startRecording(sessionId);
		}
	}

	/** Focus the session and wait for the board to say it landed. */
	private async focus(sessionId: string): Promise<boolean> {
		const pressedAt = Date.now();
		const result = await this.deps.corgi.run(["agent", "focus", sessionId]);
		if (!result.ok) {
			this.deps.log.warn(`talk: focus failed: ${result.stderr.trim()}`);
			return false;
		}
		return new Promise<boolean>((resolve) => {
			const done = (ok: boolean): void => {
				clearTimeout(timer);
				this.deps.watcher.off("board", check);
				resolve(ok);
			};
			const check = (board: Board): void => {
				const session = board.sessions.find((s) => s.id === sessionId);
				if (!session?.focusAt || Date.parse(session.focusAt) < pressedAt - 1000) {
					return;
				}
				done(!session.focusError);
			};
			const timer = setTimeout(() => done(true), focusBudgetMs); // no word from corgi: assume the window is up
			this.deps.watcher.on("board", check);
		});
	}

	private async tap(key: KeyAction, sessionId: string): Promise<boolean> {
		const chord = chordFor(this.deps.watcher.current(), sessionId, this.deps.chord(), this.deps.panelChord());
		if (!keystrokeCommand(chord)) {
			this.deps.log.warn(`talk: cannot send chord "${chord}" on ${process.platform}`);
			await key.showAlert().catch(() => undefined);
			return false;
		}
		try {
			await this.deps.sendKeystroke(chord);
			this.deps.log.debug(`talk: sent ${chord} to ${sessionId}`);
			return true;
		} catch (error) {
			this.deps.log.warn(`talk: keystroke failed (Accessibility for Stream Deck?): ${String((error as Error).message)}`);
			await key.showAlert().catch(() => undefined);
			return false;
		}
	}

	private startRecording(sessionId: string): void {
		const clear = setTimeout(() => this.stopRecording(), recordingCapMs);
		clear.unref?.();
		this.recording = { sessionId, since: Date.now(), clear };
		this.setState("rec");
	}

	private stopRecording(): void {
		if (this.recording) {
			clearTimeout(this.recording.clear);
			this.recording = undefined;
		}
		this.setState("idle");
	}

	/** The board moved: a recording session that started working was sent. */
	onBoard(board: Board & { daemonRunning: boolean }): void {
		if (!board.daemonRunning) {
			this.stopRecording();
			this.setState("off");
			return;
		}
		if (this.recording) {
			const session = board.sessions.find((s) => s.id === this.recording?.sessionId);
			if (!session || (session.status === "working" && Date.parse(session.statusSince) > this.recording.since)) {
				this.stopRecording();
				return;
			}
		}
		if (this.state === "off") {
			this.setState("idle");
		}
		this.redraw();
	}

	private setState(state: TalkState): void {
		this.state = state;
		this.redraw();
	}

	redraw(): void {
		const state: TalkState = this.deps.watcher.daemonRunning() ? this.state : "off";
		const image = renderTalkKey(state);
		for (const [id, key] of this.instances) {
			if (this.drawn.get(id) === image) {
				continue;
			}
			this.drawn.set(id, image);
			key.setImage(image).catch((error: unknown) => {
				this.drawn.delete(id);
				this.deps.log.warn(`talk: setImage failed: ${String((error as Error)?.message ?? error)}`);
			});
		}
	}
}

/**
 * The session to dictate into: the one in the window in front (corgi's
 * `frontSession`), else the last one pressed on the deck, else the only one
 * that needs you, else the one that moved last.
 */
export function pickSession(board: Board | undefined, lastFocused: string | undefined): string | undefined {
	if (!board) {
		return undefined;
	}
	const live = board.sessions.filter((s) => s.status !== "gone");
	if (board.frontSession && live.some((s) => s.id === board.frontSession)) {
		return board.frontSession;
	}
	if (lastFocused && live.some((s) => s.id === lastFocused)) {
		return lastFocused;
	}
	const needing = live.filter((s) => s.status === "needs_input");
	if (needing.length === 1) {
		return needing[0].id;
	}
	let latest: Session | undefined;
	for (const s of live) {
		if (!latest || Date.parse(s.lastActivity) > Date.parse(latest.lastActivity)) {
			latest = s;
		}
	}
	return latest?.id;
}

/** The panel has its own dictation shortcut; a terminal session takes the keybindings.json chord. */
export function chordFor(board: Board | undefined, sessionId: string, chord: string, panelChord: string): string {
	const session = board?.sessions.find((s) => s.id === sessionId);
	return session?.host.kind === "vscode-panel" ? panelChord : chord;
}

/** Presses a chord with the platform's tool: osascript on macOS (needs Accessibility for the Stream Deck app), xdotool, or SendKeys. */
export function sendKeystroke(chord: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const command = keystrokeCommand(chord);
		if (!command) {
			reject(new Error(`cannot send "${chord}" on ${process.platform}`));
			return;
		}
		execFile(command.file, command.args, { timeout: 3000 }, (error, _stdout, stderr) => {
			if (error) {
				reject(new Error(String(stderr || error.message).trim()));
			} else {
				resolve();
			}
		});
	});
}

export { defaultChord, defaultPanelChord };
