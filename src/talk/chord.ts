/**
 * Turning a Claude Code keybinding chord ("alt+v", "meta+k", "ctrl+shift+v")
 * into the keystroke macOS System Events sends. Pure, so the mapping is
 * tested without a Mac; the osascript itself runs only from the talk key.
 */

const modifierNames: Record<string, string> = {
	alt: "option down",
	option: "option down",
	opt: "option down",
	meta: "command down",
	cmd: "command down",
	command: "command down",
	ctrl: "control down",
	control: "control down",
	shift: "shift down",
};

/** Keys System Events addresses by code rather than character. */
const keyCodes: Record<string, number> = {
	space: 49,
	enter: 36,
	return: 36,
	tab: 48,
	escape: 53,
	esc: 53,
	f1: 122,
	f2: 120,
	f3: 99,
	f4: 118,
	f5: 96,
	f6: 97,
	f7: 98,
	f8: 100,
	f9: 101,
	f10: 109,
	f11: 103,
	f12: 111,
};

export interface Keystroke {
	/** `keystroke "v"` or `key code 49`. */
	action: string;
	modifiers: string[];
}

/** Parses a chord; undefined when it names nothing System Events can send. */
export function parseChord(chord: string): Keystroke | undefined {
	const parts = chord
		.toLowerCase()
		.split("+")
		.map((p) => p.trim())
		.filter(Boolean);
	if (parts.length === 0) {
		return undefined;
	}
	const key = parts.pop() as string;
	const modifiers: string[] = [];
	for (const part of parts) {
		const name = modifierNames[part];
		if (!name) {
			return undefined;
		}
		if (!modifiers.includes(name)) {
			modifiers.push(name);
		}
	}
	if (key in keyCodes) {
		return { action: `key code ${keyCodes[key]}`, modifiers };
	}
	if (/^[a-z0-9`\-=[\]\\;',./]$/.test(key)) {
		return { action: `keystroke "${key === '"' ? '\\"' : key}"`, modifiers };
	}
	return undefined;
}

/** The AppleScript for one press of the chord. */
export function keystrokeScript(chord: string): string | undefined {
	const parsed = parseChord(chord);
	if (!parsed) {
		return undefined;
	}
	const using = parsed.modifiers.length === 0 ? "" : parsed.modifiers.length === 1 ? ` using ${parsed.modifiers[0]}` : ` using {${parsed.modifiers.join(", ")}}`;
	return `tell application "System Events" to ${parsed.action}${using}`;
}

export const defaultChord = "ctrl+y";
