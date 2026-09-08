import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { presets, promptEnter, promptText, sendCommand } from "../src/actions/prompt";
import { answerCommand, approveFor, fallbackChords } from "../src/actions/talk";
import type { BoardReport } from "../src/corgi/types";
import { appleScriptString, typeTextCommands } from "../src/talk/chord";

const fixture = JSON.parse(readFileSync(new URL("../fixtures/sessions.json", import.meta.url), "utf8")) as BoardReport;

describe("prompt settings", () => {
	it("takes the preset, else the text, and presses Enter unless told not to", () => {
		expect(promptText({ preset: "tests" })).toBe(presets.tests);
		expect(promptText({ preset: "compact", text: "ignored" })).toBe("/compact");
		expect(promptText({ preset: "custom", text: "  fix the flaky test  " })).toBe("fix the flaky test");
		expect(promptText({ text: "no preset at all" })).toBe("no preset at all");
		expect(promptText({ preset: "nope", text: "fallback" })).toBe("fallback");
		expect(promptText(undefined)).toBe("");
		expect(promptEnter(undefined)).toBe(true);
		expect(promptEnter({ enter: true })).toBe(true);
		expect(promptEnter({ enter: false })).toBe(false);
	});
});

describe("sendCommand", () => {
	it("builds corgi agent send with the text after a double dash", () => {
		expect(sendCommand("5b1c", "run the tests", true)).toEqual(["agent", "send", "5b1c", "--enter", "--", "run the tests"]);
		expect(sendCommand("5b1c", "/compact", false)).toEqual(["agent", "send", "5b1c", "--", "/compact"]);
		expect(sendCommand("5b1c", "--not-a-flag", true).at(-1)).toBe("--not-a-flag");
	});
});

describe("answer", () => {
	it("builds corgi agent answer and knows the keys to press when corgi cannot", () => {
		expect(answerCommand("5b1c", "allow")).toEqual(["agent", "answer", "5b1c", "allow"]);
		expect(answerCommand("5b1c", "deny")).toEqual(["agent", "answer", "5b1c", "deny"]);
		expect(fallbackChords("allow")).toEqual(["enter"]);
		expect(fallbackChords("always")).toEqual(["2", "enter"]);
		expect(fallbackChords("deny")).toEqual(["escape"]);
	});

	it("finds the permission the talk key would answer", () => {
		// The fixture's front session is acme-api, waiting on Bash.
		expect(approveFor(fixture, undefined)).toEqual({ sessionId: "5b1c2e7a-acme", tool: "Bash", subject: "go test" });
		// Another session in front: nothing to answer there.
		expect(approveFor({ ...fixture, frontSession: "9f30d1aa-web" }, undefined)).toBeUndefined();
		// A pending left on a session that moved on is not answerable.
		const moved = { ...fixture, sessions: fixture.sessions.map((s) => (s.id === "5b1c2e7a-acme" ? { ...s, status: "working" as const } : s)) };
		expect(approveFor(moved, undefined)).toBeUndefined();
		expect(approveFor(undefined, undefined)).toBeUndefined();
	});
});

describe("typeTextCommands", () => {
	it("types through osascript on macOS, with Enter as key code 36", () => {
		expect(typeTextCommands("run the tests", true, "darwin")).toEqual([{ file: "osascript", args: ["-e", 'tell application "System Events" to keystroke "run the tests"', "-e", 'tell application "System Events" to key code 36'] }]);
		expect(typeTextCommands("/compact", false, "darwin")).toEqual([{ file: "osascript", args: ["-e", 'tell application "System Events" to keystroke "/compact"'] }]);
		expect(typeTextCommands("", true, "darwin")).toEqual([{ file: "osascript", args: ["-e", 'tell application "System Events" to key code 36'] }]);
		expect(typeTextCommands("", false, "darwin")).toEqual([]);
	});

	it("escapes quotes, backslashes and line breaks for AppleScript", () => {
		expect(appleScriptString('say "hi" \\ there')).toBe('"say \\"hi\\" \\\\ there"');
		expect(appleScriptString("one\ntwo")).toBe('"one" & return & "two"');
		const [command] = typeTextCommands('echo "x"', false, "darwin") as { args: string[] }[];
		expect(command.args[1]).toBe('tell application "System Events" to keystroke "echo \\"x\\""');
	});

	it("uses xdotool and SendKeys elsewhere", () => {
		expect(typeTextCommands("hi there", true, "linux")).toEqual([
			{ file: "xdotool", args: ["type", "--clearmodifiers", "--", "hi there"] },
			{ file: "xdotool", args: ["key", "Return"] },
		]);
		const win = typeTextCommands("a+b (c)", true, "win32") as { args: string[] }[];
		expect(win[0].args[2]).toContain("SendWait('a{+}b {(}c{)}{ENTER}')");
		expect(typeTextCommands("x", true, "sunos" as NodeJS.Platform)).toBeUndefined();
	});
});
