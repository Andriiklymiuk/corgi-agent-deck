import type { Slot, Status } from "../corgi/types";

/**
 * One key as an SVG data URI, 144×144 (a Mini's 80×80 keys are scaled by the
 * Stream Deck app). Pure and synchronous: the layout is fixed, text width
 * comes from an advance table, and everything that reaches the SVG is
 * escaped — labels are directory names and details are Claude's own words.
 */

export const colors = {
	ground: "#000000",
	text: "#F2F4F7",
	dim: "#8F98A8",
	working: "#F5A623",
	needs_input: "#E5484D",
	done: "#30A46C",
	stale: "#6E6E6E",
	gone: "#6E6E6E",
	unknown: "#6E6E6E",
} as const;

export const words: Record<Status, string> = {
	working: "WORKING",
	needs_input: "NEEDS YOU",
	done: "DONE",
	stale: "IDLE",
	gone: "CLOSED",
	unknown: "",
};

export type Frame = 0 | 1;

/** The daemon is not running: every key draws this. */
export const offKey = { kind: "off" } as const;
/** A slot as the key should draw it now: live elapsed, and for the pager how many hidden sessions need you. */
export type KeyInput = (Slot & { hiddenNeeds?: number }) | typeof offKey;

const size = 144;
const labelSize = 18;
/** Approximate advance of the label face at 18 px semibold. */
const labelAdvance = 10.5;
const labelWidth = size - 24;
const hardWrapAt = 9;

/** Elapsed bucketed to 5 s: a working key redraws at most that often. */
export function elapsedBucket(elapsedS: number | undefined): number {
	return Math.floor((elapsedS ?? 0) / 5);
}

/** The cache key for a rendered image: everything that changes pixels. */
export function keyCacheKey(input: KeyInput, frame: Frame): string {
	if ("kind" in input) {
		return "off";
	}
	if (input.pager) {
		return `pager|${input.overflow ?? 0}|${input.hiddenNeeds ?? 0}|${input.hiddenNeeds ? frame : 0}`;
	}
	if (input.empty || !input.sessionId) {
		return "empty";
	}
	const pulse = input.status === "needs_input" ? frame : 0;
	return [input.label, input.status, input.profile, input.pinned ? 1 : 0, input.detail ?? "", elapsedBucket(input.elapsedS), input.host ?? "", pulse].join("|");
}

export function renderKey(input: KeyInput, frame: Frame): string {
	return toDataUri(renderSvg(input, frame));
}

/** The SVG markup itself, for golden tests. */
export function renderSvg(input: KeyInput, frame: Frame): string {
	const body = "kind" in input ? offBody() : input.pager ? pagerBody(input.overflow ?? 0, input.hiddenNeeds ?? 0, frame) : input.empty || !input.sessionId ? emptyBody() : sessionBody(input, frame);
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${colors.ground}"/>${body}</svg>`;
}

function sessionBody(slot: Slot, frame: Frame): string {
	const status = slot.status ?? "unknown";
	const color = colors[status];
	const pulsing = status === "needs_input" && frame === 1;
	const barOpacity = pulsing ? 0.45 : 1;
	const dimAll = status === "gone" ? ' opacity="0.4"' : "";
	const lines = wrapLabel(slot.label ?? "?");
	const parts: string[] = [];
	parts.push(`<g${dimAll}>`);
	parts.push(`<rect width="${size}" height="5" fill="${color}" opacity="${barOpacity}"/>`);
	if (slot.pinned) {
		parts.push(pinGlyph());
	}
	if (slot.profile && slot.profile !== "default") {
		parts.push(chip(slot.profile));
	}
	if (lines.length === 1) {
		parts.push(text(12, 72, lines[0], `font-size="${labelSize}" font-weight="600" fill="${colors.text}"`));
	} else {
		parts.push(text(12, 62, lines[0], `font-size="${labelSize}" font-weight="600" fill="${colors.text}"`));
		parts.push(text(12, 84, lines[1], `font-size="${labelSize}" font-weight="600" fill="${colors.text}"`));
	}
	const detail = detailLine(slot);
	if (detail) {
		parts.push(text(12, 98, detail, `font-family="ui-monospace, Menlo, monospace" font-size="10" fill="${colors.dim}"`));
	}
	const word = status === "unknown" ? "?" : words[status];
	if (slot.host === "unknown" && status !== "unknown") {
		parts.push(text(12, 128, word, `font-size="11" font-weight="700" letter-spacing="1" fill="${colors.dim}"`));
	} else {
		parts.push(text(12, 128, word, `font-size="11" font-weight="700" letter-spacing="1" fill="${color}" opacity="${barOpacity}"`));
	}
	parts.push("</g>");
	return parts.join("");
}

/**
 * The "+N" key. When a hidden session needs a person, the bar goes red and
 * pulses and the word says so: the one thing the pager must not hide.
 */
function pagerBody(overflow: number, hiddenNeeds: number, frame: Frame): string {
	const hot = hiddenNeeds > 0;
	const bar = hot ? `<rect width="${size}" height="5" fill="${colors.needs_input}" opacity="${frame === 1 ? 0.45 : 1}"/>` : `<rect width="${size}" height="5" fill="${colors.dim}" opacity="0.5"/>`;
	const word = hot ? `${hiddenNeeds} NEED YOU` : "MORE";
	const wordColor = hot ? colors.needs_input : colors.dim;
	return [
		bar,
		text(72, 84, `+${overflow}`, `font-size="40" font-weight="700" fill="${colors.text}" text-anchor="middle"`),
		text(72, 128, word, `font-size="11" font-weight="700" letter-spacing="1" fill="${wordColor}" text-anchor="middle"`),
	].join("");
}

/** The talk key's three looks. */
export type TalkState = "idle" | "rec" | "off";

export function renderTalkKey(state: TalkState): string {
	const dim = state === "off";
	const color = state === "rec" ? colors.needs_input : dim ? colors.dim : colors.text;
	const body = [
		state === "rec" ? `<rect width="${size}" height="5" fill="${colors.needs_input}"/>` : "",
		// A microphone: capsule, stand, base.
		`<g fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round"${dim ? ' opacity="0.5"' : ""}>`,
		`<rect x="60" y="30" width="24" height="44" rx="12" fill="${state === "rec" ? colors.needs_input : "none"}"/>`,
		`<path d="M48 62 a24 24 0 0 0 48 0"/><path d="M72 86 v14"/><path d="M58 102 h28"/>`,
		"</g>",
		text(72, 128, state === "rec" ? "REC · PRESS TO SEND" : state === "off" ? "OFF" : "TALK", `font-size="11" font-weight="700" letter-spacing="1" fill="${color}" text-anchor="middle"`),
	].join("");
	return toDataUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${colors.ground}"/>${body}</svg>`);
}

function emptyBody(): string {
	return text(72, 84, "+", `font-size="34" font-weight="300" fill="${colors.dim}" opacity="0.35" text-anchor="middle"`);
}

function offBody(): string {
	return [
		text(12, 72, "corgi", `font-size="${labelSize}" font-weight="600" fill="${colors.dim}"`),
		text(12, 128, "OFF", `font-size="11" font-weight="700" letter-spacing="1" fill="${colors.dim}"`),
	].join("");
}

/** Two letters for a profile: first and last ("work" → WK, "personal" → PL). */
export function chipLetters(profile: string): string {
	const clean = profile.replace(/[^a-z0-9]/gi, "").toUpperCase();
	if (clean.length < 2) {
		return clean || "??";
	}
	return clean[0] + clean[clean.length - 1];
}

function chip(profile: string): string {
	const letters = escape(chipLetters(profile));
	return `<rect x="104" y="12" width="28" height="16" rx="3" fill="none" stroke="${colors.dim}" stroke-width="1.2"/>` + text(118, 24, letters, `font-family="ui-monospace, Menlo, monospace" font-size="10" font-weight="500" fill="${colors.dim}" text-anchor="middle"`);
}

function pinGlyph(): string {
	// A simple pin: head, needle. No emoji, since the renderer may lack a colour font.
	return `<g fill="${colors.dim}"><circle cx="17" cy="17" r="4"/><rect x="16" y="20" width="2" height="8"/></g>`;
}

function detailLine(slot: Slot): string {
	const parts: string[] = [];
	if (slot.detail) {
		parts.push(slot.detail);
	}
	const elapsed = formatElapsed(slot.elapsedS);
	if (elapsed) {
		parts.push(elapsed);
	}
	return truncate(parts.join(" · "), 22);
}

export function formatElapsed(elapsedS: number | undefined): string {
	if (!elapsedS || elapsedS < 1) {
		return "";
	}
	if (elapsedS < 60) {
		return `${Math.floor(elapsedS)}s`;
	}
	if (elapsedS < 3600) {
		return `${Math.floor(elapsedS / 60)}m`;
	}
	const hours = Math.floor(elapsedS / 3600);
	const minutes = Math.floor((elapsedS % 3600) / 60);
	return `${hours}h${String(minutes).padStart(2, "0")}m`;
}

/**
 * Two lines at most. Break at -, _, · or /; otherwise hard-wrap; ellipsize
 * the second line. Widths come from the advance table, so this never waits
 * on a font.
 */
export function wrapLabel(label: string): string[] {
	const fits = (s: string): boolean => s.length * labelAdvance <= labelWidth;
	if (fits(label)) {
		return [label];
	}
	let breakAt = -1;
	for (let i = 0; i < label.length; i++) {
		if ("-_·/".includes(label[i]) && fits(label.slice(0, i + 1))) {
			breakAt = i + 1;
		}
	}
	if (breakAt <= 0) {
		breakAt = hardWrapAt;
	}
	const first = label.slice(0, breakAt);
	const rest = label.slice(breakAt);
	return [first, fits(rest) ? rest : truncate(rest, Math.floor(labelWidth / labelAdvance))];
}

function truncate(s: string, max: number): string {
	return s.length > max ? s.slice(0, Math.max(0, max - 1)) + "…" : s;
}

function text(x: number, y: number, content: string, attrs: string): string {
	const family = attrs.includes("font-family=") ? "" : ` font-family="-apple-system, 'Helvetica Neue', Arial, sans-serif"`;
	return `<text x="${x}" y="${y}"${family} ${attrs}>${escape(content)}</text>`;
}

/** Everything that enters the SVG goes through here. */
export function escape(s: string): string {
	return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

function toDataUri(svg: string): string {
	return "data:image/svg+xml;charset=utf8," + encodeURIComponent(svg);
}

/** A tiny memo so a board of unchanged keys costs no string building. */
export class KeyCache {
	private readonly images = new Map<string, string>();

	get(input: KeyInput, frame: Frame): { key: string; image: string } {
		const key = keyCacheKey(input, frame);
		let image = this.images.get(key);
		if (!image) {
			image = renderKey(input, frame);
			this.images.set(key, image);
			if (this.images.size > 512) {
				this.images.delete(this.images.keys().next().value as string);
			}
		}
		return { key, image };
	}
}
