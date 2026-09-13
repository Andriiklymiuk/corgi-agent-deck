import { action, type KeyAction, type KeyDownEvent, SingletonAction, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";

import type { BoardWatcher } from "../board/watcher";
import type { Corgi } from "../corgi/cli";
import { muteCacheKey, renderMuteKey } from "../render/key";

export const muteUUID = "com.andriiklymiuk.corgi-agent-deck.mute";

type MuteDeps = {
	watcher: BoardWatcher;
	corgi: Corgi;
	log: { warn(msg: string): void; info(msg: string): void };
};

/**
 * Nothing rings for an hour: a press mutes (corgi agent mute), the key
 * crosses the bell out and counts the minutes down; a press while muted
 * ends it. The board carries mutedUntil, so a mute set from the phone or
 * the CLI shows here too.
 */
@action({ UUID: muteUUID })
export class MuteAction extends SingletonAction {
	private readonly instances = new Map<string, KeyAction>();
	private readonly drawn = new Map<string, string>();
	private tick: NodeJS.Timeout | undefined;

	constructor(private readonly deps: MuteDeps) {
		super();
	}

	override onWillAppear(ev: WillAppearEvent): void {
		if (ev.action.isKey()) {
			this.instances.set(ev.action.id, ev.action);
			this.redraw();
			this.tick ??= setInterval(() => this.redraw(), 30_000);
		}
	}

	override onWillDisappear(ev: WillDisappearEvent): void {
		this.instances.delete(ev.action.id);
		this.drawn.delete(ev.action.id);
		if (this.instances.size === 0 && this.tick) {
			clearInterval(this.tick);
			this.tick = undefined;
		}
	}

	override async onKeyDown(ev: KeyDownEvent): Promise<void> {
		if (!ev.action.isKey()) {
			return;
		}
		const muted = isMuted(this.deps.watcher.current()?.mutedUntil);
		const result = await this.deps.corgi.run(["agent", "mute", muted ? "off" : "1h"]);
		if (!result.ok) {
			this.deps.log.warn(`mute: ${result.stderr.trim()}`);
			await ev.action.showAlert().catch(() => undefined);
			return;
		}
		await this.deps.watcher.refreshFromCli();
		this.redraw();
	}

	redraw(): void {
		const board = this.deps.watcher.current();
		const running = this.deps.watcher.daemonRunning();
		const cacheKey = muteCacheKey(board?.mutedUntil, running);
		for (const [id, key] of this.instances) {
			if (this.drawn.get(id) === cacheKey) {
				continue;
			}
			this.drawn.set(id, cacheKey);
			key.setImage(renderMuteKey(board?.mutedUntil, running)).catch((error: unknown) => {
				this.drawn.delete(id);
				this.deps.log.warn(`mute: setImage failed: ${String((error as Error)?.message ?? error)}`);
			});
		}
	}
}

export function isMuted(mutedUntil: string | undefined, now = new Date()): boolean {
	const until = mutedUntil ? Date.parse(mutedUntil) : NaN;
	return Number.isFinite(until) && until > now.getTime();
}
