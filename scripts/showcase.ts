/**
 * Renders the README pictures from the plugin's own key renderer: every key
 * state on a Stream Deck mockup, as HTML that Chrome screenshots. No design
 * tool, so the pictures never drift from what the plugin draws.
 *
 *   npx -y tsx scripts/showcase.ts            # writes docs/media/showcase.html + keys/*.svg
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { renderBudgetKey, renderPromptKey, renderSvg, renderTalkKey, type KeyInput, type Frame } from "../src/render/key";

const keys: Record<string, KeyInput> = {
	working: { index: 0, sessionId: "a", label: "corgi", profile: "default", status: "working", elapsedS: 15, detail: "Bash go test", host: "vscode-panel", context: 42 },
	needs: { index: 1, sessionId: "b", label: "acme-api", profile: "work", status: "needs_input", elapsedS: 540, detail: "permission: Bash go test", pending: "Bash", host: "vscode-terminal", context: 67 },
	done: { index: 2, sessionId: "c", label: "agent-deck", profile: "default", status: "done", elapsedS: 660, host: "vscode-panel", context: 23 },
	limited: { index: 3, sessionId: "d", label: "mobile", profile: "work", status: "limited", elapsedS: 120, detail: "resets 1:10pm", host: "vscode-terminal", context: 91 },
	idle: { index: 4, sessionId: "e", label: "billing", profile: "default", status: "stale", elapsedS: 1900, host: "iterm", context: 12 },
	closed: { index: 5, sessionId: "f", label: "infra", profile: "default", status: "gone", pinned: true, elapsedS: 3000, host: "vscode-terminal" },
	slow: { index: 6, sessionId: "g", label: "web", profile: "default", status: "working", stuck: true, elapsedS: 800, detail: "Bash npm test", host: "vscode-terminal", context: 58 },
	noted: { index: 7, sessionId: "h", label: "docs", profile: "default", status: "done", note: "waiting on PR", elapsedS: 400, host: "vscode-terminal", context: 35 },
	pager: { index: 6, pager: true, overflow: 2, hiddenNeeds: 1 },
	pagerQuiet: { index: 6, pager: true, overflow: 2, hiddenNeeds: 0 },
	empty: { index: 7, empty: true },
	off: { kind: "off" },
};

const dir = "docs/media";
mkdirSync(`${dir}/keys`, { recursive: true });
const svg: Record<string, string> = {};
for (const [name, input] of Object.entries(keys)) {
	for (const frame of [0, 1] as Frame[]) {
		const s = renderSvg(input, frame);
		svg[`${name}${frame}`] = s;
		writeFileSync(`${dir}/keys/${name}${frame === 1 ? "-pulse" : ""}.svg`, s);
	}
}
const fromUri = (uri: string): string => decodeURIComponent(uri.replace(/^data:image\/svg\+xml[,;][^,]*,?/, ""));
for (const state of ["idle", "rec", "off"] as const) {
	svg[`talk-${state}`] = fromUri(renderTalkKey(state));
}
svg["talk-allow"] = fromUri(renderTalkKey("idle", { tool: "Bash", subject: "go test" }));
svg["prompt-tests"] = fromUri(renderPromptKey("run the tests and fix what fails", true));
svg["prompt-compact"] = fromUri(renderPromptKey("/compact", true));
const resetsIn = (hours: number): string => new Date(Date.now() + hours * 3600 * 1000).toISOString();
svg["budget-default"] = fromUri(renderBudgetKey({ profile: "default", fiveHour: 29, sevenDay: 15, resetsAt: resetsIn(2) }));
svg["budget-work"] = fromUri(renderBudgetKey({ profile: "work", fiveHour: 88, sevenDay: 64, resetsAt: resetsIn(1), unsafe: true }));
for (const name of ["talk-idle", "talk-rec", "talk-off", "talk-allow", "prompt-tests", "prompt-compact", "budget-default", "budget-work"]) {
	writeFileSync(`${dir}/keys/${name}.svg`, svg[name]);
}

const inline = (name: string): string => `data:image/svg+xml;utf8,${encodeURIComponent(svg[name])}`;

/** A key with a physical bezel; frame picks the pulse frame for red keys. */
const key = (name: string, frame: number): string => `<div class="key"><img src="${inline(svg[`${name}${frame}`] ? `${name}${frame}` : name)}"></div>`;

type Copy = { title: string; text: string; legend?: boolean };
const copies: Record<string, Copy> = {
	mk2: { title: "Corgi Agent Deck", text: "Every Claude Code session on your Mac on its own key, its context window along the bottom. Press to jump to its window and terminal tab. Hold to pin. Talk answers a permission or dictates; Prompt sends a canned line; Budget shows your usage.", legend: true },
	mini: { title: "Fits a Mini", text: "Five sessions and a Talk key. When more sessions run than keys, a +N key pages through the rest and turns red when one of them needs you.", legend: true },
	talk: { title: "Talk, Prompt, Budget", text: "Talk turns red while the session in front waits on a permission: press to allow, hold to deny. Press once to speak, again to send. Prompt keys type a line — continue, run the tests, /compact. Budget is the account's five-hour ring and seven-day bar.", legend: false },
	states: { title: "Six states, one glance", text: "Amber while it works, SLOW when it has gone quiet. Red and pulsing when it needs you: a permission prompt, a question, an API failure. Green when done. Blue with the reset time when the account hit its limit. Grey when idle or closed. The bar along the bottom is the context window.", legend: true },
};

const html = (view: string, frame: number, elapsedShift: number, height = 1080): string => {
	const f = frame % 2;
	const mk2 = ["working", "needs", "done", "limited", "idle", "closed", "slow", "noted", "pager", "empty", "talk-allow", "prompt-tests", "prompt-compact", "budget-default", "budget-work"];
	const mini = ["working", "needs", "done", "limited", "pager", "talk-rec"];
	const talk = ["needs", "talk-allow", "budget-work", "prompt-tests", "prompt-compact", "talk-rec"];
	const states = ["working", "needs", "done", "limited", "slow", "closed"];
	const names = view === "mini" ? mini : view === "talk" ? talk : view === "states" ? states : mk2;
	const cols = view === "mk2" ? 5 : 3;
	const copy = copies[view] ?? copies.mk2;
	return `<!doctype html><meta charset="utf-8"><title>Corgi Agent Deck</title>
<style>
  html,body{margin:0;background:#0b0d12;width:1920px;height:${height}px;overflow:hidden;font-family:-apple-system,Inter,Helvetica,Arial,sans-serif;color:#e8e8e8}
  .stage{position:relative;width:1920px;height:${height}px;display:flex;align-items:center;justify-content:center;gap:80px;background:radial-gradient(1200px 700px at 50% 40%,#171a22 0%,#0b0d12 70%)}
  .deck{background:linear-gradient(180deg,#2b2e35,#15171c);border-radius:38px;padding:54px 58px;box-shadow:0 40px 120px rgba(0,0,0,.7),inset 0 2px 0 rgba(255,255,255,.08)}
  .grid{display:grid;grid-template-columns:repeat(${cols},144px);gap:26px}
  .key{width:144px;height:144px;border-radius:22px;background:#000;box-shadow:0 0 0 6px #23262d,0 0 0 8px #0c0d10,0 10px 22px rgba(0,0,0,.6);overflow:hidden}
  .key img{width:144px;height:144px;display:block}
  .copy{max-width:560px}
  .copy h1{font-size:54px;margin:0 0 14px;letter-spacing:-.02em}
  .copy p{font-size:24px;line-height:1.45;color:#b8bcc6;margin:0 0 22px}
  .legend{display:flex;flex-wrap:wrap;gap:12px 22px;font-size:18px;color:#c9ccd3}
  .legend b{display:inline-block;width:12px;height:12px;border-radius:50%;margin-right:8px;vertical-align:-1px}
</style>
<div class="stage">
  <div class="deck"><div class="grid">${names.map((n) => key(n, f)).join("")}</div></div>
  <div class="copy">
    <h1>${copy.title}</h1>
    <p>${copy.text}</p>
    <div class="legend" ${copy.legend ? "" : 'style="display:none"'}>
      <span><b style="background:#F5A623"></b>working</span>
      <span><b style="background:#E5484D"></b>needs you</span>
      <span><b style="background:#30A46C"></b>done</span>
      <span><b style="background:#5B8DEF"></b>limit · resets</span>
      <span><b style="background:#6E6E6E"></b>idle / closed</span>
    </div>
  </div>
</div>`;
};

writeFileSync(`${dir}/showcase-mk2.html`, html("mk2", 0, 0));
writeFileSync(`${dir}/showcase-mini.html`, html("mini", 0, 0));
// Elgato Marketplace media: thumbnail and gallery at 1920×960.
mkdirSync(`${dir}/store`, { recursive: true });
for (const view of ["mk2", "mini", "talk", "states"]) {
	writeFileSync(`${dir}/store/${view}.html`, html(view, 0, 0, 960));
}
mkdirSync(`${dir}/frames`, { recursive: true });
for (let i = 0; i < 8; i++) {
	writeFileSync(`${dir}/frames/mini-${i}.html`, html("mini", i, i));
}
console.log("wrote", Object.keys(svg).length, "keys");
