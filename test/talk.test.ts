import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { pickSession } from "../src/actions/talk";
import type { BoardReport } from "../src/corgi/types";
import { renderTalkKey } from "../src/render/key";
import { keystrokeScript, parseChord } from "../src/talk/chord";

const fixture = JSON.parse(readFileSync(new URL("../fixtures/sessions.json", import.meta.url), "utf8")) as BoardReport;

describe("chord", () => {
	it("turns Claude Code chords into System Events keystrokes", () => {
		expect(parseChord("alt+v")).toEqual({ action: 'keystroke "v"', modifiers: ["option down"] });
		expect(parseChord("meta+k")).toEqual({ action: 'keystroke "k"', modifiers: ["command down"] });
		expect(parseChord("ctrl+shift+v")).toEqual({ action: 'keystroke "v"', modifiers: ["control down", "shift down"] });
		expect(parseChord("space")).toEqual({ action: "key code 49", modifiers: [] });
		expect(parseChord("ALT + F5")).toEqual({ action: "key code 96", modifiers: ["option down"] });
		expect(parseChord("hyper+v")).toBeUndefined();
		expect(parseChord("alt+capslock")).toBeUndefined();
		expect(parseChord("")).toBeUndefined();
	});

	it("writes the AppleScript", () => {
		expect(keystrokeScript("alt+v")).toBe('tell application "System Events" to keystroke "v" using option down');
		expect(keystrokeScript("ctrl+shift+v")).toBe('tell application "System Events" to keystroke "v" using {control down, shift down}');
		expect(keystrokeScript("space")).toBe('tell application "System Events" to key code 49');
		expect(keystrokeScript("nope+nope")).toBeUndefined();
	});
});

describe("pickSession", () => {
	it("prefers the session last pressed, else the only one needing a person", () => {
		const web = fixture.sessions[1].id;
		expect(pickSession(fixture, web)).toBe(web);
		expect(pickSession(fixture, "gone-id")).toBe(fixture.sessions[0].id); // exactly one needs_input in the fixture
		const two = { ...fixture, sessions: fixture.sessions.map((s, i) => (i === 1 ? { ...s, status: "needs_input" as const } : s)) };
		expect(pickSession(two, undefined)).toBeUndefined();
		expect(pickSession(undefined, web)).toBeUndefined();
	});
});

describe("renderTalkKey", () => {
	it("has three looks", () => {
		const idle = decodeURIComponent(renderTalkKey("idle"));
		const rec = decodeURIComponent(renderTalkKey("rec"));
		const off = decodeURIComponent(renderTalkKey("off"));
		expect(idle).toContain(">TALK<");
		expect(rec).toContain("REC · PRESS TO SEND");
		expect(rec).toContain('fill="#E5484D"');
		expect(off).toContain(">OFF<");
		expect(new Set([idle, rec, off]).size).toBe(3);
	});
});
