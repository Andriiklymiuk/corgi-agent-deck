import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { chordFor, pickSession } from "../src/actions/talk";
import type { BoardReport } from "../src/corgi/types";
import { renderTalkKey } from "../src/render/key";
import { defaultChord, keystrokeCommand, keystrokeScript, parseChord } from "../src/talk/chord";

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
		expect(keystrokeScript(defaultChord)).toBe('tell application "System Events" to keystroke "y" using control down');
		expect(keystrokeScript("ctrl+shift+v")).toBe('tell application "System Events" to keystroke "v" using {control down, shift down}');
		expect(keystrokeScript("space")).toBe('tell application "System Events" to key code 49');
		expect(keystrokeScript("nope+nope")).toBeUndefined();
	});
});

describe("keystrokeCommand", () => {
	it("picks the platform's tool", () => {
		expect(keystrokeCommand("ctrl+y", "darwin")).toEqual({ file: "osascript", args: ["-e", 'tell application "System Events" to keystroke "y" using control down'] });
		expect(keystrokeCommand("ctrl+y", "linux")).toEqual({ file: "xdotool", args: ["key", "ctrl+y"] });
		expect(keystrokeCommand("cmd+d", "linux")).toEqual({ file: "xdotool", args: ["key", "super+d"] });
		expect(keystrokeCommand("alt+f5", "linux")).toEqual({ file: "xdotool", args: ["key", "alt+F5"] });
		const win = keystrokeCommand("ctrl+shift+y", "win32");
		expect(win?.file).toBe("powershell");
		expect(win?.args[2]).toContain("SendWait('^+y')");
		expect(keystrokeCommand("cmd+d", "win32")).toBeUndefined();
		expect(keystrokeCommand("ctrl+y", "sunos" as NodeJS.Platform)).toBeUndefined();
	});
});

describe("pickSession", () => {
	it("prefers the window in front, then the last press, then the only one needing a person, then the latest", () => {
		const web = fixture.sessions[1].id;
		expect(pickSession(fixture, web)).toBe(fixture.frontSession); // the fixture says who is in front
		const bare = { ...fixture, frontSession: undefined };
		expect(pickSession({ ...fixture, frontSession: "gone-id" }, web)).toBe(web);
		expect(pickSession(bare, web)).toBe(web);
		expect(pickSession(bare, "gone-id")).toBe(fixture.sessions[0].id); // exactly one needs_input in the fixture
		const two = { ...bare, sessions: bare.sessions.map((s, i) => (i === 1 ? { ...s, status: "needs_input" as const } : s)) };
		const latest = two.sessions.filter((s) => s.status !== "gone").sort((a, b) => Date.parse(b.lastActivity) - Date.parse(a.lastActivity))[0].id;
		expect(pickSession(two, undefined)).toBe(latest);
		expect(pickSession({ ...bare, sessions: [] }, undefined)).toBeUndefined();
		expect(pickSession(undefined, web)).toBeUndefined();
	});
});

describe("chordFor", () => {
	it("sends the panel its own shortcut and the terminal the keybindings chord", () => {
		const terminal = fixture.sessions[0];
		const panel = { ...terminal, id: "panel-1", host: { ...terminal.host, kind: "vscode-panel" as const } };
		const board = { ...fixture, sessions: [terminal, panel] };
		expect(chordFor(board, terminal.id, "ctrl+y", "cmd+d")).toBe("ctrl+y");
		expect(chordFor(board, panel.id, "ctrl+y", "cmd+d")).toBe("cmd+d");
		expect(chordFor(undefined, panel.id, "ctrl+y", "cmd+d")).toBe("ctrl+y");
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
