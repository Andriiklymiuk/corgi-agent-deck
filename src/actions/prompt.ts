import { action, type DidReceiveSettingsEvent, type KeyAction, type KeyDownEvent, SingletonAction, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";

import { awaitOutcome } from "../board/outcome";
import type { BoardWatcher } from "../board/watcher";
import type { Corgi } from "../corgi/cli";
import { type PromptState, renderPromptKey } from "../render/key";
import type { JsonValue } from "./settings";
import { focusBudgetMs, pickSession } from "./talk";

export const promptUUID = "com.andriiklymiuk.corgi-agent-deck.prompt";

/** The Property Inspector's presets; `custom` takes the text field. */
export const presets: Record<string, string> = {
	continue: "continue",
	tests: "run the tests and fix what fails",
	compact: "/compact",
	commit: "commit with a good message",
	custom: "",
};

export type PromptSettings = {
	text?: string;
	enter?: boolean;
	preset?: string;
	[key: string]: JsonValue;
};

/** The text a key sends: its preset, else its own text. */
export function promptText(settings: PromptSettings | undefined): string {
	const preset = settings?.preset ?? "custom";
	if (preset !== "custom" && presets[preset]) {
		return presets[preset];
	}
	return (settings?.text ?? "").trim();
}

/** Enter follows the text unless the checkbox was turned off. */
export function promptEnter(settings: PromptSettings | undefined): boolean {
	return settings?.enter !== false;
}

/** `corgi agent send <id> [--enter] -- <text>`; the dashes keep a prompt that starts with one out of the flags. */
export function sendCommand(sessionId: string, text: string, enter: boolean): string[] {
	return ["agent", "send", sessionId, ...(enter ? ["--enter"] : []), "--", text];
}

export interface PromptDeps {
	watcher: BoardWatcher;
	corgi: Corgi;
	lastFocused(): string | undefined;
	/** Types text into the front window, for a session corgi cannot type into. */
	typeText(text: string, enter: boolean): Promise<void>;
	log: { info(msg: string): void; debug(msg: string): void; warn(msg: string): void };
}

/**
 * A canned prompt on a key. A press picks the session the talk key would
 * (front window, last pressed, the one that needs you, the latest) and asks
 * corgi to type the text into it. The Claude Code panel takes no text from
 * corgi; when the board says so, the key focuses it and types the text
 * itself.
 */
@action({ UUID: promptUUID })
export class PromptAction extends SingletonAction<PromptSettings> {
	private readonly instances = new Map<string, { key: KeyAction<PromptSettings>; settings: PromptSettings }>();
	private readonly drawn = new Map<string, string>();

	constructor(private readonly deps: PromptDeps) {
		super();
	}

	override onWillAppear(ev: WillAppearEvent<PromptSettings>): void {
		if (ev.action.isKey()) {
			this.instances.set(ev.action.id, { key: ev.action, settings: ev.payload.settings ?? {} });
			this.redraw();
		}
	}

	override onWillDisappear(ev: WillDisappearEvent<PromptSettings>): void {
		this.instances.delete(ev.action.id);
		this.drawn.delete(ev.action.id);
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<PromptSettings>): void {
		const instance = this.instances.get(ev.action.id);
		if (instance) {
			instance.settings = ev.payload.settings ?? {};
			this.redraw();
		}
	}

	override async onKeyDown(ev: KeyDownEvent<PromptSettings>): Promise<void> {
		if (!ev.action.isKey()) {
			return;
		}
		const key = ev.action;
		if (!this.deps.watcher.daemonRunning()) {
			await key.showAlert().catch(() => undefined);
			return;
		}
		const settings = ev.payload.settings ?? this.instances.get(key.id)?.settings;
		const text = promptText(settings);
		const enter = promptEnter(settings);
		if (!text && !enter) {
			this.deps.log.info("prompt: nothing to send — set the text in the key's settings");
			await key.showAlert().catch(() => undefined);
			return;
		}
		const sessionId = pickSession(this.deps.watcher.current(), this.deps.lastFocused());
		if (!sessionId) {
			this.deps.log.info("prompt: no session to send to — no Claude Code session is running");
			await key.showAlert().catch(() => undefined);
			return;
		}
		const at = Date.now();
		const result = await this.deps.corgi.run(sendCommand(sessionId, text, enter));
		if (!result.ok) {
			this.deps.log.warn(`prompt: send failed: ${result.stderr.trim()}`);
			await key.showAlert().catch(() => undefined);
			return;
		}
		const outcome = await awaitOutcome(this.deps.watcher, sessionId, at, focusBudgetMs);
		if (outcome.kind === "error") {
			this.deps.log.warn(`prompt: send failed: ${outcome.message}`);
			await key.showAlert().catch(() => undefined);
			return;
		}
		if (outcome.kind === "keyboard" && !(await this.typeAfterFocus(key, sessionId, text, enter))) {
			return;
		}
		await key.showOk().catch(() => undefined);
	}

	/** The window is up but corgi could not type: reveal the session, then type from here. */
	private async typeAfterFocus(key: KeyAction, sessionId: string, text: string, enter: boolean): Promise<boolean> {
		const at = Date.now();
		const focus = await this.deps.corgi.run(["agent", "focus", sessionId]);
		if (focus.ok) {
			const outcome = await awaitOutcome(this.deps.watcher, sessionId, at, focusBudgetMs);
			if (outcome.kind === "error") {
				this.deps.log.warn(`prompt: focus failed: ${outcome.message}`);
				await key.showAlert().catch(() => undefined);
				return false;
			}
		}
		try {
			await this.deps.typeText(text, enter);
			this.deps.log.debug(`prompt: typed ${text.length} characters into ${sessionId}`);
			return true;
		} catch (error) {
			this.deps.log.warn(`prompt: typing failed (Accessibility for Stream Deck?): ${String((error as Error).message)}`);
			await key.showAlert().catch(() => undefined);
			return false;
		}
	}

	redraw(): void {
		const state: PromptState = this.deps.watcher.daemonRunning() ? "idle" : "off";
		for (const [id, { key, settings }] of this.instances) {
			const image = renderPromptKey(promptText(settings), promptEnter(settings), state);
			if (this.drawn.get(id) === image) {
				continue;
			}
			this.drawn.set(id, image);
			key.setImage(image).catch((error: unknown) => {
				this.drawn.delete(id);
				this.deps.log.warn(`prompt: setImage failed: ${String((error as Error)?.message ?? error)}`);
			});
		}
	}
}
