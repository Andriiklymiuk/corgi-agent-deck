import type { Slot, Status } from "../corgi/types";

/**
 * One key as an SVG data URI, 144×144 (a Mini's 80×80 keys are scaled by the
 * Stream Deck app). Pure and synchronous: the layout is fixed, text width
 * comes from an advance table, and everything that reaches the SVG is
 * escaped — labels are directory names and details are Claude's own words.
 */

export const colors = {
	ground: "#000000",
	promptGround: "#1C2029",
	text: "#F2F4F7",
	dim: "#8F98A8",
	working: "#F5A623",
	needs_input: "#E5484D",
	done: "#30A46C",
	stale: "#6E6E6E",
	gone: "#6E6E6E",
	unknown: "#6E6E6E",
	limited: "#5B8DEF",
} as const;

export const words: Record<Status, string> = {
	working: "WORKING",
	needs_input: "NEEDS YOU",
	done: "DONE",
	stale: "IDLE",
	gone: "CLOSED",
	unknown: "",
	limited: "LIMIT",
};

export type Frame = 0 | 1;

/** The daemon is not running: every key draws this. */
export const offKey = { kind: "off" } as const;
/** A slot as the key should draw it now: live elapsed, and for the pager how many hidden sessions need you. */
export type KeyInput = (Slot & { hiddenNeeds?: number }) | typeof offKey;

const size = 144;
/** Type sizes, in px on the 144 px canvas. */
export const fonts = { label: 24, labelSmall: 20, word: 14, detail: 13, elapsed: 12 } as const;
/** Approximate advance of the label face at 24 px semibold. */
const labelAdvance = 13;
/** …and at 20 px. */
const smallAdvance = 11;
const labelWidth = size - 24;
const hardWrapAt = 9;
/** Characters of 13 px monospace that fit between the margins. */
const detailChars = 15;
const mono = `font-family="ui-monospace, Menlo, monospace"`;

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
		return `empty|${input.label ?? ""}|${input.pinned ? 1 : 0}`;
	}
	const pulse = input.status === "needs_input" ? frame : 0;
	return [input.label, input.status, input.profile, input.pinned ? 1 : 0, input.detail ?? "", elapsedBucket(input.elapsedS), input.host ?? "", pulse, input.context ?? 0, input.pending ?? "", input.note ?? "", input.stuck ? 1 : 0, input.drift ?? "", input.overlap ?? "", input.spend ?? "", input.overCap ? 1 : 0].join("|");
}

export function renderKey(input: KeyInput, frame: Frame): string {
	return toDataUri(renderSvg(input, frame));
}

/** The SVG markup itself, for golden tests. */
export function renderSvg(input: KeyInput, frame: Frame): string {
	const body = "kind" in input ? offBody() : input.pager ? pagerBody(input.overflow ?? 0, input.hiddenNeeds ?? 0, frame) : input.empty || !input.sessionId ? emptyBody(input.label, input.pinned) : sessionBody(input, frame);
	return svg(body);
}

function svg(body: string, ground: string = colors.ground): string {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="${ground}"/>${body}</svg>`;
}

function sessionBody(slot: Slot, frame: Frame): string {
	const status = slot.status ?? "unknown";
	const color = colors[status];
	const pulsing = status === "needs_input" && frame === 1;
	const barOpacity = pulsing ? 0.45 : 1;
	const dimAll = status === "gone" ? ' opacity="0.4"' : "";
	const lines = wrapLabel(slot.label ?? "?");
	const hasChip = !!slot.profile && slot.profile !== "default";
	const parts: string[] = [];
	parts.push(`<g${dimAll}>`);
	parts.push(`<rect width="${size}" height="5" fill="${color}" opacity="${barOpacity}"/>`);
	if (slot.pinned) {
		parts.push(pinGlyph());
	}
	if (hasChip) {
		parts.push(chip(slot.profile as string));
	}
	const elapsed = formatElapsed(slot.elapsedS);
	if (elapsed) {
		parts.push(text(hasChip ? 98 : 132, 24, elapsed, `${mono} font-size="${fonts.elapsed}" fill="${colors.dim}" text-anchor="end"`));
	}
	const labelAttrs = (s: string): string => `font-size="${labelFont(s)}" font-weight="600" fill="${colors.text}"`;
	if (lines.length === 1) {
		parts.push(text(12, 72, lines[0], labelAttrs(lines[0])));
	} else {
		parts.push(text(12, 58, lines[0], labelAttrs(lines[0])));
		parts.push(text(12, 85, lines[1], labelAttrs(lines[1])));
	}
	const detail = detailLine(slot);
	if (detail) {
		// A warning line — over budget, drifting, crossing streams — is red so
		// it reads from across the desk; the rest stays dim.
		const warn = !slot.note && (slot.overCap || !!slot.drift || !!slot.overlap);
		parts.push(text(12, 106, detail, `${mono} font-size="${fonts.detail}" fill="${warn ? colors.needs_input : colors.dim}"`));
	}
	const word = statusWord(slot);
	if (slot.host === "unknown" && status !== "unknown") {
		parts.push(text(12, 128, word, `font-size="${fonts.word}" font-weight="700" letter-spacing="1" fill="${colors.dim}"`));
	} else {
		parts.push(text(12, 128, word, `font-size="${fonts.word}" font-weight="700" letter-spacing="1" fill="${color}" opacity="${barOpacity}"`));
	}
	parts.push(contextBar(slot.context));
	parts.push("</g>");
	return parts.join("");
}

/** WORKING becomes SLOW when the session has gone quiet; the colour stays amber. */
export function statusWord(slot: Pick<Slot, "status" | "stuck">): string {
	const status = slot.status ?? "unknown";
	if (status === "unknown") {
		return "?";
	}
	if (status === "working" && slot.stuck) {
		return "SLOW";
	}
	return words[status];
}

/**
 * Grey until 85 %, red above. Amber here read as the status colour next to
 * the status word, so only the near-full warning gets a colour.
 */
export function contextColor(percent: number): string {
	return percent > 85 ? colors.needs_input : colors.stale;
}

/** A 4 px bar along the bottom, filled to the context window used. Nothing when unknown. */
export function contextBar(percent: number | undefined): string {
	if (!percent || percent <= 0) {
		return "";
	}
	const width = Math.round((size * Math.min(100, percent)) / 100);
	return `<rect y="${size - 4}" width="${size}" height="4" fill="${colors.stale}" opacity="0.25"/><rect y="${size - 4}" width="${width}" height="4" fill="${contextColor(percent)}"/>`;
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
		text(72, 128, word, `font-size="${fonts.word}" font-weight="700" letter-spacing="1" fill="${wordColor}" text-anchor="middle"`),
	].join("");
}

/** The talk key's three looks. */
export type TalkState = "idle" | "rec" | "off";

/** A permission prompt the talk key can answer: the tool and the one word about its input. */
export interface Approve {
	tool: string;
	subject?: string;
}

export function renderTalkKey(state: TalkState, approve?: Approve): string {
	if (approve && state !== "off") {
		return toDataUri(svg(approveBody(approve)));
	}
	const dim = state === "off";
	const color = state === "rec" ? colors.needs_input : dim ? colors.dim : colors.text;
	const body = [
		state === "rec" ? `<rect width="${size}" height="5" fill="${colors.needs_input}"/>` : "",
		// A microphone: capsule, stand, base.
		`<g fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round"${dim ? ' opacity="0.5"' : ""}>`,
		`<rect x="60" y="30" width="24" height="44" rx="12" fill="${state === "rec" ? colors.needs_input : "none"}"/>`,
		`<path d="M48 62 a24 24 0 0 0 48 0"/><path d="M72 86 v14"/><path d="M58 102 h28"/>`,
		"</g>",
		text(72, 128, state === "rec" ? "REC · PRESS TO SEND" : state === "off" ? "OFF" : "TALK", `font-size="${fonts.word}" font-weight="700" letter-spacing="1" fill="${color}" text-anchor="middle"`),
	].join("");
	return toDataUri(svg(body));
}

/** Red, with the tool and its subject: press allows, a hold denies. */
function approveBody(approve: Approve): string {
	return [
		`<rect width="${size}" height="${size}" fill="${colors.needs_input}" opacity="0.22"/>`,
		`<rect width="${size}" height="5" fill="${colors.needs_input}"/>`,
		text(72, 60, "ALLOW", `font-size="28" font-weight="700" letter-spacing="1" fill="${colors.text}" text-anchor="middle"`),
		text(72, 86, truncate(approve.tool, 12), `font-size="${fonts.word}" font-weight="600" fill="${colors.needs_input}" text-anchor="middle"`),
		approve.subject ? text(72, 106, truncate(approve.subject, detailChars), `${mono} font-size="${fonts.detail}" fill="${colors.text}" text-anchor="middle"`) : "",
		text(72, 130, "HOLD TO DENY", `font-size="11" font-weight="700" letter-spacing="1" fill="${colors.dim}" text-anchor="middle"`),
	].join("");
}

/** The first word or two of a prompt, as the key shows it. */
export function promptFace(promptText: string): string {
	const tokens = promptText.trim().split(/\s+/).filter(Boolean);
	if (tokens.length === 0) {
		return "…";
	}
	const pair = tokens.slice(0, 2).join(" ");
	return truncate(pair.length <= hardWrapAt ? pair : tokens[0], hardWrapAt);
}

export type PromptState = "idle" | "off";

/** A dark key with the start of the prompt; the word says whether Enter follows. */
export function renderPromptKey(promptText: string, enter: boolean, state: PromptState = "idle"): string {
	const dim = state === "off";
	const body = [
		`<g${dim ? ' opacity="0.4"' : ""}>`,
		text(12, 34, "›", `font-size="30" font-weight="700" fill="${colors.dim}"`),
		text(72, 88, promptFace(promptText), `font-size="22" font-weight="600" fill="${colors.text}" text-anchor="middle"`),
		text(72, 128, dim ? "OFF" : enter ? "SEND" : "TYPE", `font-size="${fonts.word}" font-weight="700" letter-spacing="1" fill="${colors.dim}" text-anchor="middle"`),
		"</g>",
	].join("");
	return toDataUri(svg(body, colors.promptGround));
}

/** One account's budget as the key draws it. */
export interface BudgetFace {
	profile: string;
	/** Absent until a session under the account has fetched usage. */
	fiveHour?: number;
	sevenDay?: number;
	resetsAt?: string;
	/** A session under the account hit its limit. */
	limited?: boolean;
	/** The five-hour window runs out before it resets. */
	unsafe?: boolean;
	off?: boolean;
}

/** The ring's colour: blue when limited, red when the window will run out, else by fill. */
export function budgetColor(face: BudgetFace): string {
	if (face.off) {
		return colors.dim;
	}
	if (face.limited) {
		return colors.limited;
	}
	if (face.unsafe) {
		return colors.needs_input;
	}
	const pct = face.fiveHour ?? 0;
	return pct > 85 ? colors.needs_input : pct > 60 ? colors.working : colors.text;
}

export function renderBudgetKey(face: BudgetFace, now = new Date()): string {
	return toDataUri(svg(budgetBody(face, now)));
}

/** The SVG for the budget key, for tests. */
export function budgetBody(face: BudgetFace, now = new Date()): string {
	const color = budgetColor(face);
	const known = face.fiveHour !== undefined && !face.off;
	const five = Math.max(0, Math.min(100, face.fiveHour ?? 0));
	const seven = Math.max(0, Math.min(100, face.sevenDay ?? 0));
	const radius = 30;
	const circumference = 2 * Math.PI * radius;
	const arc = ((known ? five : 0) / 100) * circumference;
	const reset = known && face.resetsAt ? formatResetTime(face.resetsAt, now) : "";
	return [
		`<g${face.off ? ' opacity="0.5"' : ""}>`,
		text(12, 22, truncate(face.profile, 8), `${mono} font-size="${fonts.elapsed}" fill="${colors.dim}"`),
		face.limited ? `<rect width="${size}" height="5" fill="${colors.limited}"/>` : "",
		`<circle cx="72" cy="60" r="${radius}" fill="none" stroke="${colors.stale}" stroke-opacity="0.3" stroke-width="8"/>`,
		arc > 0 ? `<circle cx="72" cy="60" r="${radius}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${arc.toFixed(1)} ${circumference.toFixed(1)}" transform="rotate(-90 72 60)"/>` : "",
		text(72, 67, known ? `${five}%` : "—", `font-size="20" font-weight="700" fill="${known ? colors.text : colors.dim}" text-anchor="middle"`),
		text(12, 106, "7d", `${mono} font-size="11" fill="${colors.dim}"`),
		text(132, 106, known ? `${seven}%` : "", `${mono} font-size="11" fill="${colors.dim}" text-anchor="end"`),
		`<rect x="30" y="100" width="76" height="6" rx="3" fill="${colors.stale}" opacity="0.3"/>`,
		known && seven > 0 ? `<rect x="30" y="100" width="${Math.max(6, Math.round((76 * seven) / 100))}" height="6" rx="3" fill="${seven > 85 ? colors.needs_input : seven > 60 ? colors.working : colors.dim}"/>` : "",
		text(72, 130, face.off ? "OFF" : face.limited ? "LIMIT" : reset ? `resets ${reset}` : known ? "" : "no usage yet", `font-size="${fonts.detail}" font-weight="${face.limited ? 700 : 500}" fill="${face.limited ? colors.limited : colors.dim}" text-anchor="middle"`),
		"</g>",
	].join("");
}

/** "4:10pm" in local time, or "Tue 6:00am" when the reset is more than a day away. */
export function formatResetTime(iso: string, now = new Date()): string {
	const at = new Date(iso);
	if (Number.isNaN(at.getTime())) {
		return "";
	}
	const hours = at.getHours();
	const minutes = String(at.getMinutes()).padStart(2, "0");
	const clock = `${hours % 12 === 0 ? 12 : hours % 12}:${minutes}${hours < 12 ? "am" : "pm"}`;
	if (at.getTime() - now.getTime() > 24 * 3600 * 1000) {
		return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][at.getDay()]} ${clock}`;
	}
	return clock;
}

/** A big plus, and under it the workspace a press opens the session in; picked by a hold, the name goes bright. */
function emptyBody(label?: string, picked = false): string {
	const parts = [text(72, label ? 78 : 92, "+", `font-size="${label ? 60 : 72}" font-weight="300" fill="${colors.dim}" opacity="0.6" text-anchor="middle"`)];
	if (label) {
		parts.push(text(72, 122, (picked ? "▸ " : "") + fitName(label), `font-size="${fonts.detail}" font-weight="600" fill="${picked ? colors.text : colors.dim}" opacity="${picked ? 1 : 0.8}" text-anchor="middle"`));
	}
	return parts.join("");
}

function offBody(): string {
	return [
		text(12, 72, "corgi", `font-size="${fonts.label}" font-weight="600" fill="${colors.dim}"`),
		text(12, 128, "OFF", `font-size="${fonts.word}" font-weight="700" letter-spacing="1" fill="${colors.dim}"`),
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
	return `<rect x="104" y="12" width="28" height="16" rx="3" fill="none" stroke="${colors.dim}" stroke-width="1.2"/>` + text(118, 24, letters, `${mono} font-size="10" font-weight="500" fill="${colors.dim}" text-anchor="middle"`);
}

function pinGlyph(): string {
	// A simple pin: head, needle. No emoji, since the renderer may lack a colour font.
	return `<g fill="${colors.dim}"><circle cx="17" cy="17" r="4"/><rect x="16" y="20" width="2" height="8"/></g>`;
}

/**
 * The owner's note wins over everything; then what the daemon wants a person
 * to see — over budget, drifting, another session on the same files — then
 * the transient detail. A pending permission drops its prefix, the red word
 * already says it.
 */
export function detailLine(slot: Pick<Slot, "detail" | "note" | "pending" | "drift" | "overlap" | "spend" | "overCap">): string {
	if (slot.note) {
		return truncate(slot.note, detailChars);
	}
	if (slot.overCap) {
		return truncate(`over budget ${slot.spend ?? ""}`.trim(), detailChars);
	}
	if (slot.drift) {
		return truncate(slot.drift, detailChars);
	}
	if (slot.overlap) {
		return truncate(`⚠ ${slot.overlap}`, detailChars);
	}
	let detail = slot.detail ?? "";
	if (slot.pending && detail.startsWith("permission: ")) {
		detail = detail.slice("permission: ".length);
	}
	return truncate(detail, detailChars);
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
 * Two lines at most. A twin suffix ("acme-api·zsh 2") takes the second line.
 * Otherwise break at -, _ or / when the head fits; a long single word is
 * never split, it gets a middle ellipsis ("onboa…tion") and the smaller
 * face. Widths come from the advance table, so this never waits on a font.
 */
export function wrapLabel(label: string): string[] {
	const dot = label.indexOf("·");
	if (dot > 0) {
		return [fitName(label.slice(0, dot)), fitTail(label.slice(dot + 1))];
	}
	if (fitsBig(label)) {
		return [label];
	}
	// The last separator whose head fits; the separator stays on line one
	// when there is room for it.
	let head = "";
	let tailStart = -1;
	for (let i = 0; i < label.length; i++) {
		if (!"-_/".includes(label[i])) {
			continue;
		}
		if (fitsSmall(label.slice(0, i + 1))) {
			head = label.slice(0, i + 1);
			tailStart = i + 1;
		} else if (fitsSmall(label.slice(0, i))) {
			head = label.slice(0, i);
			tailStart = i + 1;
		}
	}
	if (tailStart <= 0) {
		return [fitName(label)];
	}
	return [head, fitTail(label.slice(tailStart))];
}

/** Characters that fit a line at the big face, and at the smaller one. */
const bigChars = Math.floor(labelWidth / labelAdvance);
const smallChars = Math.floor(labelWidth / smallAdvance);
const fitsBig = (s: string): boolean => s.length <= bigChars;
const fitsSmall = (s: string): boolean => s.length <= smallChars;
/** The face a line gets: big when it fits, else the smaller one. */
export function labelFont(s: string): number {
	return fitsBig(s) ? fonts.label : fonts.labelSmall;
}

/** A repo name keeps its start and end: "onboarding-service" → "onboa…rvice". */
function fitName(s: string): string {
	if (s.length <= smallChars) {
		return s;
	}
	const keep = smallChars - 1;
	const head = Math.ceil(keep / 2);
	return s.slice(0, head) + "…" + s.slice(s.length - (keep - head));
}

/** A title or tab name keeps its start. */
function fitTail(s: string): string {
	return truncate(s, smallChars);
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
