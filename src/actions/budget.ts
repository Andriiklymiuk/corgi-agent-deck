import { action, type DidReceiveSettingsEvent, type KeyAction, type KeyDownEvent, type SendToPluginEvent, SingletonAction, type WillAppearEvent, type WillDisappearEvent } from "@elgato/streamdeck";

import type { BoardWatcher } from "../board/watcher";
import type { Corgi } from "../corgi/cli";
import type { Account, Board } from "../corgi/types";
import { type BudgetFace, renderBudgetKey } from "../render/key";
import type { JsonValue } from "./settings";

export const budgetUUID = "com.andriiklymiuk.corgi-agent-deck.budget";

export type BudgetSettings = {
	/** The account picked from the board's list. */
	profile?: string;
	/** A profile typed by hand; wins over the list when set. */
	profileText?: string;
	[key: string]: JsonValue;
};

/** The profile a key shows: typed, else picked, else the board's first account, else default. */
export function chosenProfile(settings: BudgetSettings | undefined, board: Board | undefined): string {
	return settings?.profileText?.trim() || settings?.profile?.trim() || board?.accounts?.[0]?.profile || "default";
}

/** The account's face: limits, whether a session under it is limited, and whether the window runs out first. */
export function budgetFace(board: Board | undefined, profile: string, running: boolean): BudgetFace {
	if (!running) {
		return { profile, off: true };
	}
	const account: Account | undefined = board?.accounts?.find((a) => a.profile === profile);
	const limited = board?.sessions.some((s) => (s.profile ?? "default") === profile && s.status === "limited") ?? false;
	return {
		profile,
		fiveHour: account?.limits?.fiveHour.percent,
		sevenDay: account?.limits?.sevenDay.percent,
		resetsAt: account?.limits?.fiveHour.resetsAt,
		limited,
		unsafe: account?.forecast?.fiveHour?.safe === false,
	};
}

/** The dropdown's items: every account the board knows, for the Property Inspector's data source. */
export function profileItems(board: Board | undefined): { label: string; value: string }[] {
	const profiles = new Set<string>((board?.accounts ?? []).map((a) => a.profile));
	for (const s of board?.sessions ?? []) {
		profiles.add(s.profile || "default");
	}
	if (profiles.size === 0) {
		profiles.add("default");
	}
	return [...profiles].sort().map((p) => ({ label: p, value: p }));
}

export interface BudgetDeps {
	watcher: BoardWatcher;
	corgi: Corgi;
	openUrl(url: string): Promise<void>;
	sendToPropertyInspector(payload: JsonValue): Promise<void>;
	log: { info(msg: string): void; debug(msg: string): void; warn(msg: string): void };
}

/**
 * One Claude account's usage on a key: a ring for the five-hour window, a
 * bar for the seven-day one, and when the five-hour window resets. Blue when
 * a session under the account hit its limit, red when the window will run
 * out before it resets. A press opens corgi's dashboard when the daemon
 * publishes one.
 */
@action({ UUID: budgetUUID })
export class BudgetAction extends SingletonAction<BudgetSettings> {
	private readonly instances = new Map<string, { key: KeyAction<BudgetSettings>; settings: BudgetSettings }>();
	private readonly drawn = new Map<string, string>();

	constructor(private readonly deps: BudgetDeps) {
		super();
	}

	override onWillAppear(ev: WillAppearEvent<BudgetSettings>): void {
		if (ev.action.isKey()) {
			this.instances.set(ev.action.id, { key: ev.action, settings: ev.payload.settings ?? {} });
			this.redraw();
		}
	}

	override onWillDisappear(ev: WillDisappearEvent<BudgetSettings>): void {
		this.instances.delete(ev.action.id);
		this.drawn.delete(ev.action.id);
	}

	override onDidReceiveSettings(ev: DidReceiveSettingsEvent<BudgetSettings>): void {
		const instance = this.instances.get(ev.action.id);
		if (instance) {
			instance.settings = ev.payload.settings ?? {};
			this.redraw();
		}
	}

	/** The Property Inspector asks for the account list (sdpi-select's datasource). */
	override async onSendToPlugin(ev: SendToPluginEvent<JsonValue, BudgetSettings>): Promise<void> {
		const payload = ev.payload as { event?: string } | null;
		if (payload?.event === "getProfiles") {
			await this.deps.sendToPropertyInspector({ event: "getProfiles", items: profileItems(this.deps.watcher.current()) });
		}
	}

	override async onKeyDown(ev: KeyDownEvent<BudgetSettings>): Promise<void> {
		if (!ev.action.isKey()) {
			return;
		}
		const status = await this.deps.corgi.runJson<{ dashboardUrl?: string }>(["agent", "status", "--json"]);
		const url = "value" in status ? status.value.dashboardUrl : undefined;
		if (!url) {
			await ev.action.showOk().catch(() => undefined);
			return;
		}
		try {
			await this.deps.openUrl(url);
		} catch (error) {
			this.deps.log.warn(`budget: could not open ${url}: ${String((error as Error).message)}`);
			await ev.action.showAlert().catch(() => undefined);
		}
	}

	redraw(): void {
		const board = this.deps.watcher.current();
		const running = this.deps.watcher.daemonRunning();
		for (const [id, { key, settings }] of this.instances) {
			const image = renderBudgetKey(budgetFace(board, chosenProfile(settings, board), running));
			if (this.drawn.get(id) === image) {
				continue;
			}
			this.drawn.set(id, image);
			key.setImage(image).catch((error: unknown) => {
				this.drawn.delete(id);
				this.deps.log.warn(`budget: setImage failed: ${String((error as Error)?.message ?? error)}`);
			});
		}
	}
}
