/** Hold this long for a long press (pin, previous page, rescan, deny). */
export const longPressMs = 600;

interface Pressed {
	at: number;
	timer: NodeJS.Timeout;
	fired: boolean;
}

/**
 * Tells a short press from a hold, per action instance. A hold fires on its
 * own once the key has been down long enough; the release after it is
 * ignored, and a release before it is the short press.
 */
export class HoldDetector {
	private readonly pressed = new Map<string, Pressed>();

	constructor(
		private readonly fire: (actionId: string, kind: "short" | "long", at: number) => void,
		private readonly holdMs = longPressMs,
	) {}

	down(actionId: string): void {
		this.cancel(actionId);
		const at = Date.now();
		const timer = setTimeout(() => {
			const p = this.pressed.get(actionId);
			if (p) {
				p.fired = true;
				this.fire(actionId, "long", at);
			}
		}, this.holdMs);
		this.pressed.set(actionId, { at, timer, fired: false });
	}

	up(actionId: string): void {
		const p = this.pressed.get(actionId);
		this.cancel(actionId);
		if (p && !p.fired) {
			this.fire(actionId, "short", p.at);
		}
	}

	cancel(actionId: string): void {
		const p = this.pressed.get(actionId);
		if (p) {
			clearTimeout(p.timer);
			this.pressed.delete(actionId);
		}
	}
}
