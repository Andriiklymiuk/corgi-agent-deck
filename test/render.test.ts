import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { BoardReport, Slot } from "../src/corgi/types";
import { budgetBody, budgetColor, chipLetters, contextBar, contextColor, detailLine, escape, fonts, formatElapsed, formatResetTime, KeyCache, keyCacheKey, offKey, promptFace, renderKey, renderPromptKey, renderSvg, renderTalkKey, statusWord, wrapLabel } from "../src/render/key";

const fixture = JSON.parse(readFileSync(new URL("../fixtures/sessions.json", import.meta.url), "utf8")) as BoardReport;
const slot = (index: number): Slot => fixture.slots[index];

describe("renderSvg", () => {
	it("draws a session key with bar, label, detail, word and chip", () => {
		const svg = renderSvg(slot(0), 0);
		expect(svg).toContain('height="5" fill="#E5484D"');
		expect(svg).toContain(">acme-api<");
		expect(svg).toContain("NEEDS YOU");
		expect(svg).toContain(">WK<"); // the work profile chip
		expect(svg).toContain(">Bash go test<"); // the pending permission, without its prefix
		expect(svg).toContain('text-anchor="end">9m<'); // elapsed sits top right, left of the chip
		expect(svg).toContain('x="98" y="24"');
	});

	it("sets type large enough to read from a desk", () => {
		expect(fonts).toEqual({ label: 24, word: 14, detail: 13, elapsed: 12 });
		const svg = renderSvg(slot(0), 0);
		expect(svg).toContain('font-size="24" font-weight="600"'); // label
		expect(svg).toContain('font-size="14" font-weight="700" letter-spacing="1"'); // status word
		expect(svg).toContain('font-size="13" fill="#8F98A8"'); // detail
		// A long detail still ends inside the key.
		expect(detailLine({ detail: "Claude needs your permission to use Bash" })).toBe("Claude needs y…");
		expect(detailLine({ detail: "Edit registry.go" })).toBe("Edit registry.…");
		// Without a chip the elapsed text hugs the right margin.
		expect(renderSvg(slot(1), 0)).toContain('x="132" y="24"');
	});

	it("draws the context bar along the bottom, grey then amber then red, nothing when unknown", () => {
		expect(contextBar(undefined)).toBe("");
		expect(contextBar(0)).toBe("");
		expect(contextBar(42)).toContain('y="140" width="60" height="4" fill="#6E6E6E"');
		expect(contextBar(60)).toContain('fill="#6E6E6E"/>');
		expect(contextBar(61)).toContain('width="88" height="4" fill="#F5A623"');
		expect(contextBar(85)).toContain('fill="#F5A623"');
		expect(contextBar(86)).toContain('fill="#E5484D"');
		expect(contextBar(140)).toContain('width="144" height="4" fill="#E5484D"'); // clamped
		expect(contextColor(30)).toBe("#6E6E6E");
		expect(renderSvg(slot(0), 0)).toContain('y="140" width="60"'); // 42 % in the fixture
		expect(renderSvg(slot(2), 0)).toContain('width="130" height="4" fill="#E5484D"'); // 90 %
		expect(renderSvg(slot(4), 0)).not.toContain('y="140"'); // unknown
	});

	it("says SLOW for a working session that went quiet, still in amber", () => {
		expect(statusWord({ status: "working", stuck: true })).toBe("SLOW");
		expect(statusWord({ status: "working" })).toBe("WORKING");
		expect(statusWord({ status: "needs_input", stuck: true })).toBe("NEEDS YOU");
		expect(statusWord({ status: "unknown" })).toBe("?");
		const svg = renderSvg(slot(1), 0); // web is stuck in the fixture
		expect(svg).toContain(">SLOW<");
		expect(svg).toContain('fill="#F5A623" opacity="1">SLOW<');
		expect(svg).not.toContain("WORKING");
	});

	it("lets the owner's note replace the detail", () => {
		expect(detailLine({ detail: "Bash go test", note: "waiting on review" })).toBe("waiting on rev…");
		expect(detailLine({ detail: "Bash go test" })).toBe("Bash go test");
		expect(detailLine({ detail: "permission: Bash go test", pending: "Bash" })).toBe("Bash go test");
		expect(detailLine({ detail: "permission: Bash go test" })).toBe("permission: Ba…"); // no pending: shown as corgi wrote it
		expect(detailLine({})).toBe("");
		expect(renderSvg(slot(2), 0)).toContain(">waiting on rev…<");
	});

	it("pulses needs_input by dimming bar and word on frame 1", () => {
		expect(renderSvg(slot(0), 0)).toContain('opacity="1"');
		expect(renderSvg(slot(0), 1)).toContain('opacity="0.45"');
		// Other statuses never pulse.
		expect(renderSvg(slot(2), 1)).not.toContain('opacity="0.45"');
	});

	it("draws pin, pager, empty and off keys", () => {
		expect(renderSvg(slot(1), 0)).toContain("<circle"); // pinned
		const pager = renderSvg(slot(5), 0);
		expect(pager).toContain(">+2<");
		expect(pager).toContain("MORE");
		expect(renderSvg({ index: 3, empty: true }, 0)).toContain(">+<");
		const off = renderSvg(offKey, 0);
		expect(off).toContain(">corgi<");
		expect(off).toContain(">OFF<");
	});

	it("dims a gone session and marks an unknown host", () => {
		const gone = renderSvg({ index: 0, sessionId: "x", label: "old", status: "gone" }, 0);
		expect(gone).toContain('opacity="0.4"');
		expect(gone).toContain("CLOSED");
		const unknown = renderSvg({ index: 0, sessionId: "x", label: "mystery", status: "done", host: "unknown" }, 0);
		expect(unknown).toContain('fill="#8F98A8"'); // the word in dim, not green
		const adopted = renderSvg({ index: 0, sessionId: "x", label: "adopted", status: "unknown" }, 0);
		expect(adopted).toContain(">?<");
	});

	it("wraps long labels on a separator, else hard, and ellipsizes", () => {
		expect(wrapLabel("acme-api")).toEqual(["acme-api"]);
		expect(wrapLabel("infra-terraform")).toEqual(["infra-", "terraform"]);
		expect(wrapLabel("acme-api·zsh 2")).toEqual(["acme-api·", "zsh 2"]);
		expect(wrapLabel("averyveryverylongprojectname")).toEqual(["averyvery", "verylong…"]);
		const svg = renderSvg(slot(3), 0);
		expect(svg).toContain('y="58"');
		expect(svg).toContain('y="85"');
	});

	it("escapes everything that enters the SVG", () => {
		const svg = renderSvg({ index: 0, sessionId: "x", label: '<b>&"x"', status: "done", detail: "<img>", profile: "<x>" }, 0);
		expect(svg).not.toContain("<b>");
		expect(svg).not.toContain("<img>");
		expect(svg).toContain("&lt;b&gt;&amp;&quot;x&quot;");
		expect(svg).not.toMatch(/font-family=[^>]*font-family=/);
		expect(escape(`'`)).toBe("&#39;");
	});

	it("abbreviates profiles to two letters", () => {
		expect(chipLetters("work")).toBe("WK");
		expect(chipLetters("personal")).toBe("PL");
		expect(chipLetters("x")).toBe("X");
		expect(chipLetters("<>")).toBe("??");
	});

	it("formats elapsed time", () => {
		expect(formatElapsed(undefined)).toBe("");
		expect(formatElapsed(12)).toBe("12s");
		expect(formatElapsed(200)).toBe("3m");
		expect(formatElapsed(3840)).toBe("1h04m");
	});
});

describe("cache", () => {
	it("keys on what changes pixels, bucketing elapsed to 5 s", () => {
		const a: Slot = { index: 0, sessionId: "x", label: "web", status: "working", elapsedS: 11 };
		expect(keyCacheKey(a, 0)).toBe(keyCacheKey({ ...a, elapsedS: 14 }, 0));
		expect(keyCacheKey(a, 0)).not.toBe(keyCacheKey({ ...a, elapsedS: 15 }, 0));
		expect(keyCacheKey(a, 0)).toBe(keyCacheKey(a, 1)); // only needs_input pulses
		// The new fields change pixels, so they change the key.
		expect(keyCacheKey({ ...a, context: 50 }, 0)).not.toBe(keyCacheKey(a, 0));
		expect(keyCacheKey({ ...a, stuck: true }, 0)).not.toBe(keyCacheKey(a, 0));
		expect(keyCacheKey({ ...a, note: "hi" }, 0)).not.toBe(keyCacheKey(a, 0));
		expect(keyCacheKey({ ...a, pending: "Bash" }, 0)).not.toBe(keyCacheKey(a, 0));
		expect(keyCacheKey({ ...a, status: "needs_input" }, 0)).not.toBe(keyCacheKey({ ...a, status: "needs_input" }, 1));
		expect(keyCacheKey({ index: 1, empty: true }, 0)).toBe("empty");
		expect(keyCacheKey({ index: 5, pager: true, overflow: 2 }, 0)).toBe("pager|2|0|0");
		// A pager hiding a session that needs you pulses; one hiding none does not.
		expect(keyCacheKey({ index: 5, pager: true, overflow: 2, hiddenNeeds: 1 }, 1)).toBe("pager|2|1|1");
		expect(keyCacheKey({ index: 5, pager: true, overflow: 2 }, 1)).toBe("pager|2|0|0");
		const hot = renderSvg({ index: 5, pager: true, overflow: 2, hiddenNeeds: 1 }, 0);
		expect(hot).toContain("1 NEED YOU");
		expect(hot).toContain('fill="#E5484D"');
		expect(keyCacheKey(offKey, 1)).toBe("off");
	});

	it("returns the same image for the same key", () => {
		const cache = new KeyCache();
		const first = cache.get(slot(2), 0);
		const second = cache.get(slot(2), 0);
		expect(second.image).toBe(first.image);
		expect(first.image.startsWith("data:image/svg+xml;charset=utf8,")).toBe(true);
		expect(renderKey(slot(2), 0)).toBe(first.image);
	});
});

describe("talk key with a permission pending", () => {
	it("turns red with ALLOW, the tool and its subject, and says a hold denies", () => {
		const svg = decodeURIComponent(renderTalkKey("idle", { tool: "Bash", subject: "go test" }));
		expect(svg).toContain(">ALLOW<");
		expect(svg).toContain(">Bash<");
		expect(svg).toContain(">go test<");
		expect(svg).toContain("HOLD TO DENY");
		expect(svg).toContain('fill="#E5484D" opacity="0.22"');
		expect(svg).not.toContain(">TALK<");
		// Off stays off; without a subject the line is skipped; recording ignores it.
		expect(decodeURIComponent(renderTalkKey("off", { tool: "Bash" }))).toContain(">OFF<");
		expect(decodeURIComponent(renderTalkKey("idle", { tool: "Edit" }))).not.toContain('y="106"');
		expect(decodeURIComponent(renderTalkKey("idle", { tool: "<b>" }))).toContain("&lt;b&gt;");
	});
});

describe("prompt key", () => {
	it("shows the first word or two of the text", () => {
		expect(promptFace("run the tests and fix what fails")).toBe("run the");
		expect(promptFace("continue")).toBe("continue");
		expect(promptFace("/compact")).toBe("/compact");
		expect(promptFace("commit with a good message")).toBe("commit");
		expect(promptFace("supercalifragilistic")).toBe("supercal…");
		expect(promptFace("   ")).toBe("…");
	});

	it("draws on a dark key and says whether Enter follows", () => {
		const send = decodeURIComponent(renderPromptKey("run the tests", true));
		expect(send).toContain('fill="#1C2029"');
		expect(send).toContain(">run the<");
		expect(send).toContain(">SEND<");
		expect(decodeURIComponent(renderPromptKey("run the tests", false))).toContain(">TYPE<");
		expect(decodeURIComponent(renderPromptKey("x", true, "off"))).toContain(">OFF<");
	});
});

describe("budget key", () => {
	const now = new Date("2026-09-08T04:41:00Z");

	it("draws a ring for five hours, a bar for seven days and the reset time", () => {
		const svg = budgetBody({ profile: "default", fiveHour: 29, sevenDay: 15, resetsAt: "2026-09-08T09:30:00Z" }, now);
		expect(svg).toContain(">29%<");
		expect(svg).toContain(">15%<");
		expect(svg).toContain('stroke-dasharray="54.7 188.5"'); // 29 % of the circumference
		expect(svg).toContain(`>resets ${formatResetTime("2026-09-08T09:30:00Z", now)}<`);
		expect(svg).toContain('width="11" height="6" rx="3" fill="#8F98A8"'); // the 7 d bar
		expect(svg).toContain(">default<");
	});

	it("goes blue when limited, red when the window runs out first, amber and red by fill", () => {
		expect(budgetColor({ profile: "p", fiveHour: 20 })).toBe("#F2F4F7");
		expect(budgetColor({ profile: "p", fiveHour: 61 })).toBe("#F5A623");
		expect(budgetColor({ profile: "p", fiveHour: 86 })).toBe("#E5484D");
		expect(budgetColor({ profile: "p", fiveHour: 20, unsafe: true })).toBe("#E5484D");
		expect(budgetColor({ profile: "p", fiveHour: 99, limited: true })).toBe("#5B8DEF"); // limited wins
		expect(budgetColor({ profile: "p", off: true })).toBe("#8F98A8");
		const limited = budgetBody({ profile: "work", fiveHour: 100, sevenDay: 64, limited: true }, now);
		expect(limited).toContain(">LIMIT<");
		expect(limited).toContain('height="5" fill="#5B8DEF"');
	});

	it("has an unknown and an off look", () => {
		const unknown = budgetBody({ profile: "default" }, now);
		expect(unknown).toContain(">—<");
		expect(unknown).toContain("no usage yet");
		expect(unknown).not.toContain("stroke-dasharray");
		const off = budgetBody({ profile: "default", off: true }, now);
		expect(off).toContain(">OFF<");
		expect(off).toContain('opacity="0.5"');
	});

	it("formats the reset time in local clock time, with a weekday when it is days away", () => {
		const at = new Date(now.getTime() + 2 * 3600 * 1000);
		const hours = at.getHours();
		const expected = `${hours % 12 === 0 ? 12 : hours % 12}:${String(at.getMinutes()).padStart(2, "0")}${hours < 12 ? "am" : "pm"}`;
		expect(formatResetTime(at.toISOString(), now)).toBe(expected);
		const week = new Date(now.getTime() + 3 * 24 * 3600 * 1000);
		expect(formatResetTime(week.toISOString(), now)).toMatch(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d{1,2}:\d{2}(am|pm)$/);
		expect(formatResetTime("nope", now)).toBe("");
	});
});
