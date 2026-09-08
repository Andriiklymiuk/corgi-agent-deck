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

	set(deviceId: string, actionId: string, coords: Coordinates): void {
		this.placed.set(actionId, { deviceId, coords: { column: coords.column, row: coords.row } });
	}

	remove(actionId: string): void {
		this.placed.delete(actionId);
	}

	/** 0-based slot index of an action on its device, or undefined when unknown. */
	indexOf(actionId: string): number | undefined {
		const entry = this.placed.get(actionId);
		if (!entry) {
			return undefined;
		}
		return this.ordered(entry.deviceId).indexOf(actionId);
	}

	/** Keys placed on a device. */
	count(deviceId: string): number {
		return this.ordered(deviceId).length;
	}

	/** Every device that has at least one key. */
	devices(): string[] {
		return [...new Set([...this.placed.values()].map((p) => p.deviceId))];
	}

	/** Action ids on a device in slot order. */
	ordered(deviceId: string): string[] {
		return [...this.placed.entries()]
			.filter(([, p]) => p.deviceId === deviceId)
			.sort(([, a], [, b]) => a.coords.row - b.coords.row || a.coords.column - b.coords.column)
			.map(([id]) => id);
	}
}
