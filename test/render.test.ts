import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { BoardReport, Slot } from "../src/corgi/types";
import { chipLetters, escape, formatElapsed, KeyCache, keyCacheKey, offKey, renderKey, renderSvg, wrapLabel } from "../src/render/key";

const fixture = JSON.parse(readFileSync(new URL("../fixtures/sessions.json", import.meta.url), "utf8")) as BoardReport;
const slot = (index: number): Slot => fixture.slots[index];

describe("renderSvg", () => {
	it("draws a session key with bar, label, detail, word and chip", () => {
		const svg = renderSvg(slot(0), 0);
		expect(svg).toContain('height="5" fill="#E5484D"');
		expect(svg).toContain(">acme-api<");
		expect(svg).toContain("NEEDS YOU");
		expect(svg).toContain(">WK<"); // the work profile chip
		expect(svg).toContain("Claude needs your per…"); // detail truncated to 22 characters
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
		expect(wrapLabel("averyveryverylongprojectname")).toEqual(["averyvery", "verylongpr…"]);
		const svg = renderSvg(slot(3), 0);
		expect(svg).toContain('y="62"');
		expect(svg).toContain('y="84"');
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
		expect(keyCacheKey({ ...a, status: "needs_input" }, 0)).not.toBe(keyCacheKey({ ...a, status: "needs_input" }, 1));
		expect(keyCacheKey({ index: 1, empty: true }, 0)).toBe("empty");
		expect(keyCacheKey({ index: 5, pager: true, overflow: 2 }, 0)).toBe("pager|2");
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
