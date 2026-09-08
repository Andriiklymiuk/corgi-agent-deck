import { action, type KeyAction, type KeyDownEvent, type KeyUpEvent, SingletonAction, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";
import { execFile } from "node:child_process";

import { awaitOutcome } from "../board/outcome";
import type { BoardWatcher } from "../board/watcher";
import type { Corgi } from "../corgi/cli";
import type { Board, Session } from "../corgi/types";
import { type Approve, renderTalkKey, type TalkState } from "../render/key";
import { defaultChord, defaultPanelChord, type KeystrokeCommand, keystrokeCommand, typeTextCommands } from "../talk/chord";
import { HoldDetector } from "./hold";

export const talkUUID = "com.andriiklymiuk.corgi-agent-deck.talk";

/** How long a focus or a send may take before the board is assumed silent. */
export const focusBudgetMs = 1500;
/** Claude Code stops a tap-mode recording after two minutes on its own. */
const recordingCapMs = 2 * 60 * 1000;

export type Answer = "allow" | "always" | "deny";

export interface TalkDeps {
	watcher: BoardWatcher;
	corgi: Corgi;
	/** The session the last slot press focused, if any. */
	lastFocused(): string | undefined;
	/** The keybindings.json chord for a terminal session, and the panel's own shortcut. */
	chord(): string;
	panelChord(): string;
	/** The panel stops recording on the second press but does not send; this key, after this pause, does. */
	panelSend(): { key: string; delayMs: number };
	/** Presses a chord ("ctrl+y") in the front window. */
	sendKeystroke(chord: string): Promise<void>;
	log: { info(msg: string): void; debug(msg: string): void; warn(msg: string): void };
}

/**
 * Dictate into a session, or answer its permission prompt.
 *
 * Talk: focus the session (the one in the window in front, else the one
 * last pressed on the deck, else the one that needs you when exactly one
 * does), wait for the board to confirm the focus landed, then tap Claude
 * Code's dictation chord. Press again: the same chord, which in tap mode
 * sends the prompt. Claude Code does the recording and transcription; corgi
 * does the focusing; this key only presses one chord in the right window.
 * It has no way to see the recording, so REC is optimistic: it clears when
 * the session starts working or after Claude Code's own two-minute cap.
 *
 * Approve: while that session waits on a permission, the key turns red with
 * the tool and its subject. A press allows (`corgi agent answer`), a hold
 * denies. corgi refuses a risky command, and a panel session takes no text
 * from corgi, so the key presses the keys itself once the window is up.
 */
@action({ UUID: talkUUID })
export class TalkAction extends SingletonAction {
	private readonly instances = new Map<string, KeyAction>();
	private state: TalkState = "idle";
	private recording: { sessionId: string; since: number; clear: NodeJS.Timeout } | undefined;
	private readonly drawn = new Map<string, string>();
	private readonly hold = new HoldDetector((actionId, kind, at) => {
		const key = this.instances.get(actionId);
		const target = this.approveTarget();
		if (key && target) {
			void this.answer(key, target.sessionId, kind === "long" ? "deny" : "allow", at);
		}
	});

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
		this.hold.cancel(ev.action.id);
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		if (!ev.action.isKey()) {
			return;
		}
		if (!this.deps.watcher.daemonRunning()) {
			await ev.action.showAlert().catch(() => undefined);
			return;
		}
		if (!this.recording && this.approveTarget()) {
			this.hold.down(ev.action.id); // allow on release, deny on a hold
			return;
		}
		if (this.recording) {
			// Second press: the same chord sends the prompt in tap mode. The
			// panel only stops recording on it, so a send key follows once
			// the transcript has landed.
			const sessionId = this.recording.sessionId;
			const sent = await this.tap(ev.action, sessionId);
			this.stopRecording();
			const send = this.deps.panelSend();
			if (sent && this.deps.watcher.current()?.sessions.find((s) => s.id === sessionId)?.host.kind === "vscode-panel" && send.key) {
				setTimeout(() => void this.tap(ev.action, sessionId, send.key), send.delayMs);
			}
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

	override onKeyUp(ev: KeyUpEvent): void {
		this.hold.up(ev.action.id);
	}

	/** The permission the key would answer now: the picked session's, while it waits on one. */
	private approveTarget(): (Approve & { sessionId: string }) | undefined {
		return approveFor(this.deps.watcher.current(), this.deps.lastFocused());
	}

	/** `corgi agent answer`; a panel session gets the same keys from here once its window is up. */
	private async answer(key: KeyAction, sessionId: string, answer: Answer, at: number): Promise<void> {
		this.deps.log.debug(`talk: answer ${answer} for ${sessionId}`);
		const result = await this.deps.corgi.run(answerCommand(sessionId, answer));
		if (!result.ok) {
			this.deps.log.warn(`talk: answer failed: ${result.stderr.trim()}`);
			await key.showAlert().catch(() => undefined);
			return;
		}
		const outcome = await awaitOutcome(this.deps.watcher, sessionId, at, focusBudgetMs);
		if (outcome.kind === "error") {
			this.deps.log.info(`talk: answer refused: ${outcome.message}`);
			await key.showAlert().catch(() => undefined);
			return;
		}
		if (outcome.kind === "keyboard") {
			if (!(await this.focus(sessionId))) {
				await key.showAlert().catch(() => undefined);
				return;
			}
			for (const chord of fallbackChords(answer)) {
				if (!(await this.tap(key, sessionId, chord))) {
					return;
				}
			}
		}
		await key.showOk().catch(() => undefined);
	}

	/** Focus the session and wait for the board to say it landed. */
	private async focus(sessionId: string): Promise<boolean> {
		const pressedAt = Date.now();
		const result = await this.deps.corgi.run(["agent", "focus", sessionId]);
		if (!result.ok) {
			this.deps.log.warn(`talk: focus failed: ${result.stderr.trim()}`);
			return false;
		}
		const outcome = await awaitOutcome(this.deps.watcher, sessionId, pressedAt, focusBudgetMs);
		if (outcome.kind === "error") {
			this.deps.log.warn(`talk: focus failed: ${outcome.message}`);
			return false;
		}
		return true;
	}

	private async tap(key: KeyAction, sessionId: string, override?: string): Promise<boolean> {
		const chord = override ?? chordFor(this.deps.watcher.current(), sessionId, this.deps.chord(), this.deps.panelChord());
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
		const running = this.deps.watcher.daemonRunning();
		const state: TalkState = running ? this.state : "off";
		const image = renderTalkKey(state, running && !this.recording ? this.approveTarget() : undefined);
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

/** The permission prompt the talk key answers: the picked session's, while it is what the session waits on. */
export function approveFor(board: Board | undefined, lastFocused: string | undefined): (Approve & { sessionId: string }) | undefined {
	const sessionId = pickSession(board, lastFocused);
	const session = sessionId ? board?.sessions.find((s) => s.id === sessionId) : undefined;
	if (!session?.pending || session.status !== "needs_input") {
		return undefined;
	}
	return { sessionId: session.id, tool: session.pending.tool, subject: session.pending.subject };
}

export function answerCommand(sessionId: string, answer: Answer): string[] {
	return ["agent", "answer", sessionId, answer];
}

/** What the key presses itself when corgi cannot type into the session: Claude Code's own permission keys. */
export function fallbackChords(answer: Answer): string[] {
	switch (answer) {
		case "allow":
			return ["enter"];
		case "always":
			return ["2", "enter"];
		case "deny":
			return ["escape"];
	}
}

/** The panel has its own dictation shortcut; a terminal session takes the keybindings.json chord. */
export function chordFor(board: Board | undefined, sessionId: string, chord: string, panelChord: string): string {
	const session = board?.sessions.find((s) => s.id === sessionId);
	return session?.host.kind === "vscode-panel" ? panelChord : chord;
}

function runCommand(command: KeystrokeCommand): Promise<void> {
	return new Promise((resolve, reject) => {
		execFile(command.file, command.args, { timeout: 5000 }, (error, _stdout, stderr) => {
			if (error) {
				reject(new Error(String(stderr || error.message).trim()));
			} else {
				resolve();
			}
		});
	});
}

/** Presses a chord with the platform's tool: osascript on macOS (needs Accessibility for the Stream Deck app), xdotool, or SendKeys. */
export function sendKeystroke(chord: string): Promise<void> {
	const command = keystrokeCommand(chord);
	if (!command) {
		return Promise.reject(new Error(`cannot send "${chord}" on ${process.platform}`));
	}
	return runCommand(command);
}

/** Types text into the front window, then Enter when asked, through the same tools as the chord. */
export async function typeText(text: string, enter: boolean): Promise<void> {
	const commands = typeTextCommands(text, enter);
	if (!commands) {
		throw new Error(`cannot type text on ${process.platform}`);
	}
	for (const command of commands) {
		await runCommand(command);
	}
}

export { defaultChord, defaultPanelChord };
