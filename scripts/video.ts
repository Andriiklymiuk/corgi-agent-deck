/**
 * The demo video, from the plugin's own key renderer: each beat of the story is
 * a Stream Deck mockup with the keys the plugin really draws for that state.
 * It shows what the keys do; it is not a film of a device.
 *
 *   npm run video     # docs/media/store/demo.mp4, 1920×1080
 */
import { createHash } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { renderBudgetKey, renderMuteKey, renderPromptKey, renderSvg, renderTalkKey, type Frame, type KeyInput } from "../src/render/key";

const out = "docs/media/video";
const NOW = new Date("2026-11-06T14:00:00");
const inHours = (h: number): string => new Date(NOW.getTime() + h * 3600 * 1000).toISOString();
const decode = (uri: string): string => decodeURIComponent(uri.replace(/^data:image\/svg\+xml[,;][^,]*,?/, ""));

type Session = KeyInput;
const session = (index: number, label: string, status: KeyInput["status"], elapsedS: number, detail: string, context: number, extra: Partial<KeyInput> = {}): Session => ({
	index, sessionId: label, label, profile: "default", status, elapsedS, detail, context, host: "vscode-terminal", ...extra,
});

interface Deck {
	sessions: Session[];
	allow?: { tool: string; subject: string; risk: string };
	muted?: boolean;
}

const start: Deck = {
	sessions: [
		session(0, "acme-api", "working", 95, "Edit auth.go", 34),
		session(1, "web", "working", 40, "Bash npm test", 52),
		session(2, "mobile", "working", 210, "Read Home.tsx", 21),
		session(3, "docs", "working", 15, "Write guide.md", 12),
		session(4, "billing", "done", 660, "", 44),
		session(5, "infra", "stale", 2400, "", 68),
		session(6, "shop", "working", 130, "Bash go test", 71, { profile: "work" }),
		{ index: 7, empty: true, label: "acme-api" },
	],
};

const change = (deck: Deck, edits: Partial<Deck>, ...sessions: Session[]): Deck => {
	const next = { ...deck, ...edits, sessions: [...deck.sessions] };
	for (const s of sessions) {
		next.sessions[s.index] = s;
	}
	return next;
};

const needs = change(start, { allow: { tool: "Bash", subject: "go test", risk: "reads" } },
	session(1, "web", "needs_input", 45, "permission: Bash go test", 52, { pending: "Bash", risk: "reads" }));
const allowed = change(start, {}, session(1, "web", "working", 50, "Bash go test", 53));
const finished = change(allowed, {}, session(3, "docs", "done", 80, "", 14));
const sent = change(finished, {}, session(1, "web", "working", 70, "Bash npm test", 55));
const opened = change(sent, {}, session(7, "acme-api", "working", 5, "starting", 1, { sessionId: "new" }));
const quiet = change(opened, { muted: true });

/** Grid order on a Stream Deck MK.2: the board, then the keys you place. */
const faces = (deck: Deck, frame: Frame): string[] => {
	const talk = decode(renderTalkKey("idle", deck.allow));
	return [
		...deck.sessions.slice(0, 5).map((s) => renderSvg(s, frame)),
		...deck.sessions.slice(5, 8).map((s) => renderSvg(s, frame)),
		decode(renderPromptKey("/compact", true)),
		decode(renderPromptKey("commit with a good message", true)),
		talk,
		decode(renderPromptKey("run the tests and fix what fails", true)),
		decode(renderBudgetKey({ profile: "default", fiveHour: 38, sevenDay: 21, resetsAt: inHours(2) }, NOW)),
		decode(renderBudgetKey({ profile: "work", fiveHour: 88, sevenDay: 64, resetsAt: inHours(1), unsafe: true }, NOW)),
		decode(renderMuteKey(deck.muted ? inHours(1) : undefined, true, NOW)),
	];
};

const TALK = 10;
const PROMPT_TESTS = 11;
const MUTE = 14;
const NEW_SESSION = 7;
const MOBILE = 2;

interface Beat {
	deck: Deck;
	title: string;
	text: string;
	seconds: number;
	press?: number;
	pulse?: boolean;
}

const beats: Beat[] = [
	{ deck: start, seconds: 5, title: "Every session on its own key", text: "Each Claude Code session on your Mac gets a key: indigo while it works, green when it is done, its context window along the bottom." },
	{ deck: needs, seconds: 5, pulse: true, title: "It needs you", text: "A session waiting on a permission pulses amber. The Talk key turns into ALLOW, with the tool and what it wants." },
	{ deck: needs, seconds: 0.7, press: TALK, title: "Press to allow, hold to deny", text: "Answer it right from the deck, without leaving what you are doing." },
	{ deck: allowed, seconds: 3.3, title: "Press to allow, hold to deny", text: "Answer it right from the deck, without leaving what you are doing." },
	{ deck: allowed, seconds: 0.7, press: MOBILE, title: "Press a key to jump there", text: "That session's window and terminal tab come to the front." },
	{ deck: allowed, seconds: 3.3, title: "Press a key to jump there", text: "That session's window and terminal tab come to the front." },
	{ deck: finished, seconds: 3.5, title: "Green when it is done", text: "Glance down and see what finished. Hold a finished key to dismiss it until its next event." },
	{ deck: finished, seconds: 0.7, press: PROMPT_TESTS, title: "Prompt keys", text: "Keep the lines you type most on a key. A press types it into the session in front, then Enter." },
	{ deck: sent, seconds: 3.3, title: "Prompt keys", text: "Keep the lines you type most on a key. A press types it into the session in front, then Enter." },
	{ deck: sent, seconds: 0.7, press: NEW_SESSION, title: "A new session", text: "Press + for a new Claude Code session in the editor window in front." },
	{ deck: opened, seconds: 3.3, title: "A new session", text: "Press + for a new Claude Code session in the editor window in front." },
	{ deck: opened, seconds: 4, title: "Your usage, at a glance", text: "A Budget key per account: the five-hour window as a ring, the seven-day one as a bar, and when it resets." },
	{ deck: opened, seconds: 0.7, press: MUTE, title: "Quiet when you need it", text: "Mute stops every ring for an hour, and the key counts down." },
	{ deck: quiet, seconds: 3.3, title: "Quiet when you need it", text: "Mute stops every ring for an hour, and the key counts down." },
	{ deck: quiet, seconds: 5, title: "Corgi Agent Deck", text: "It draws the board that corgi keeps. Install corgi with Homebrew, run corgi agent track enable, and the keys fill in." },
];

const inline = (svg: string): string => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
const page = (beat: Beat, frame: Frame): string => `<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;width:1920px;height:1080px;overflow:hidden;background:#0b0d12;color:#f2f4f7;font-family:-apple-system,Inter,Helvetica,Arial,sans-serif}
  .stage{width:1920px;height:1080px;display:flex;align-items:center;justify-content:center;gap:64px}
  .deck{zoom:1.2;background:linear-gradient(180deg,#2b2e35,#15171c);border-radius:38px;padding:54px 58px;box-shadow:0 40px 120px rgba(0,0,0,.7),inset 0 2px 0 rgba(255,255,255,.08)}
  .grid{display:grid;grid-template-columns:repeat(5,144px);gap:26px}
  .key{width:144px;height:144px;border-radius:22px;background:#000;box-shadow:0 0 0 6px #23262d,0 0 0 8px #0c0d10,0 10px 22px rgba(0,0,0,.6);overflow:hidden}
  .key img{width:144px;height:144px;display:block}
  .press{transform:scale(.93);box-shadow:0 0 0 6px #fff,0 0 0 16px rgba(255,255,255,.28)}
  .copy{width:520px}
  h1{font-size:54px;line-height:1.1;margin:0 0 18px;letter-spacing:-.02em}
  p{font-size:27px;line-height:1.45;color:#b8bcc6;margin:0}
</style>
<div class="stage">
  <div class="deck"><div class="grid">${faces(beat.deck, frame).map((svg, i) => `<div class="key${beat.press === i ? " press" : ""}"><img src="${inline(svg)}"></div>`).join("")}</div></div>
  <div class="copy"><h1>${beat.title}</h1><p>${beat.text}</p></div>
</div>`;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const pulseEvery = 0.55;
const list: string[] = [];
const seen = new Set<string>();
const shot = (beat: Beat, frame: Frame, seconds: number): void => {
	const html = page(beat, frame);
	const name = createHash("sha1").update(html).digest("hex").slice(0, 12);
	if (!seen.has(name)) {
		seen.add(name);
		writeFileSync(`${out}/${name}.html`, html);
	}
	list.push(`file '${name}.png'\nduration ${seconds.toFixed(3)}`);
};
for (const beat of beats) {
	if (!beat.pulse) {
		shot(beat, 0, beat.seconds);
		continue;
	}
	for (let t = 0, f = 0; t < beat.seconds; t += pulseEvery, f++) {
		shot(beat, (f % 2) as Frame, Math.min(pulseEvery, beat.seconds - t));
	}
}
writeFileSync(`${out}/list.txt`, list.join("\n") + "\n");
console.log(`${seen.size} frames, ${beats.reduce((n, b) => n + b.seconds, 0)} seconds`);
