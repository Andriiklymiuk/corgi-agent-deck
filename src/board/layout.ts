/**
 * Which key is which slot. Never ask the user to number keys: every action
 * instance reports its (row, column) when it appears, and reading order on
 * each device is the slot index. Six copies dragged onto a Mini in any order
 * make a board; a second device gets its own numbering and the same board.
 */

export interface Coordinates {
	readonly column: number;
	readonly row: number;
}

interface Placed {
	deviceId: string;
	coords: Coordinates;
}

export class Layout {
	private readonly placed = new Map<string, Placed>();
	/** Slot index per action, rebuilt only when a key appears or disappears: redraws run every second. */
	private indexes = new Map<string, number>();
	private counts = new Map<string, number>();

	set(deviceId: string, actionId: string, coords: Coordinates): void {
		this.placed.set(actionId, { deviceId, coords: { column: coords.column, row: coords.row } });
		this.rebuild();
	}

	remove(actionId: string): void {
		if (this.placed.delete(actionId)) {
			this.rebuild();
		}
	}

	/** 0-based slot index of an action on its device, or undefined when unknown. */
	indexOf(actionId: string): number | undefined {
		return this.indexes.get(actionId);
	}

	/** Keys placed on a device. */
	count(deviceId: string): number {
		return this.counts.get(deviceId) ?? 0;
	}

	/** Every device that has at least one key. */
	devices(): string[] {
		return [...this.counts.keys()];
	}

	private rebuild(): void {
		this.indexes = new Map();
		this.counts = new Map();
		for (const deviceId of new Set([...this.placed.values()].map((p) => p.deviceId))) {
			const ids = this.ordered(deviceId);
			ids.forEach((id, index) => this.indexes.set(id, index));
			this.counts.set(deviceId, ids.length);
		}
	}

	/** Action ids on a device in slot order. */
	ordered(deviceId: string): string[] {
		return [...this.placed.entries()]
			.filter(([, p]) => p.deviceId === deviceId)
			.sort(([, a], [, b]) => a.coords.row - b.coords.row || a.coords.column - b.coords.column)
			.map(([id]) => id);
	}
}
