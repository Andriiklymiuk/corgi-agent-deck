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
/** The Claude Code VS Code panel has its own dictation shortcut. */
export const defaultPanelChord = "cmd+d";

/** What runs to press a chord on each platform, for execFile. */
export interface KeystrokeCommand {
	file: string;
	args: string[];
}

const xdotoolModifiers: Record<string, string> = { ctrl: "ctrl", control: "ctrl", alt: "alt", option: "alt", opt: "alt", shift: "shift", meta: "super", cmd: "super", command: "super" };
const sendKeysModifiers: Record<string, string> = { ctrl: "^", control: "^", alt: "%", option: "%", opt: "%", shift: "+" };

/**
 * The command that presses a chord: osascript on macOS, xdotool on Linux,
 * SendKeys through PowerShell on Windows. Undefined when the platform cannot
 * send it (a cmd chord on Windows, a key none of them names).
 */
export function keystrokeCommand(chord: string, platform: NodeJS.Platform = process.platform): KeystrokeCommand | undefined {
	const parts = chord.toLowerCase().split("+").map((p) => p.trim()).filter(Boolean);
	if (parts.length === 0) {
		return undefined;
	}
	const key = parts.pop() as string;
	const modifiers = parts;
	switch (platform) {
		case "darwin": {
			const script = keystrokeScript(chord);
			return script ? { file: "osascript", args: ["-e", script] } : undefined;
		}
		case "linux": {
			const mods = modifiers.map((m) => xdotoolModifiers[m]);
			if (mods.some((m) => !m)) {
				return undefined;
			}
			const name = key === "escape" || key === "esc" ? "Escape" : key === "enter" || key === "return" ? "Return" : /^f\d{1,2}$/.test(key) ? key.toUpperCase() : key;
			return { file: "xdotool", args: ["key", [...mods, name].join("+")] };
		}
		case "win32": {
			const mods = modifiers.map((m) => sendKeysModifiers[m]);
			if (mods.some((m) => !m)) {
				return undefined;
			}
			const name = key.length === 1 ? key : /^f\d{1,2}$/.test(key) ? `{${key.toUpperCase()}}` : key === "space" ? " " : key === "enter" || key === "return" ? "{ENTER}" : key === "escape" || key === "esc" ? "{ESC}" : key === "tab" ? "{TAB}" : undefined;
			if (name === undefined) {
				return undefined;
			}
			const keys = mods.join("") + name;
			return { file: "powershell", args: ["-NoProfile", "-Command", `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${keys.replace(/'/g, "''")}')`] };
		}
		default:
			return undefined;
	}
}
