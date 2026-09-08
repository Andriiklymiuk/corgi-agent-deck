import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { budgetFace, chosenProfile, profileItems } from "../src/actions/budget";
import type { BoardReport } from "../src/corgi/types";

const fixture = JSON.parse(readFileSync(new URL("../fixtures/sessions.json", import.meta.url), "utf8")) as BoardReport;

describe("chosenProfile", () => {
	it("prefers a typed profile, then the picked one, then the board's first account", () => {
		expect(chosenProfile({ profile: "work", profileText: " personal " }, fixture)).toBe("personal");
		expect(chosenProfile({ profile: "work" }, fixture)).toBe("work");
		expect(chosenProfile({}, fixture)).toBe("default");
		expect(chosenProfile(undefined, { ...fixture, accounts: [fixture.accounts![1]] })).toBe("work");
		expect(chosenProfile(undefined, undefined)).toBe("default");
	});
});

describe("budgetFace", () => {
	it("reads the account's limits and forecast off the board", () => {
		expect(budgetFace(fixture, "default", true)).toEqual({ profile: "default", fiveHour: 29, sevenDay: 15, resetsAt: "2026-09-08T09:30:00.000000000Z", limited: false, unsafe: false });
		const work = budgetFace(fixture, "work", true);
		expect(work.fiveHour).toBe(88);
		expect(work.unsafe).toBe(true); // the fixture's forecast says the window runs out first
		expect(work.limited).toBe(false);
	});

	it("is blue when a session under the account is limited, and off without the daemon", () => {
		const limited = { ...fixture, sessions: fixture.sessions.map((s) => (s.profile === "work" ? { ...s, status: "limited" as const } : s)) };
		expect(budgetFace(limited, "work", true).limited).toBe(true);
		expect(budgetFace(limited, "default", true).limited).toBe(false);
		expect(budgetFace(fixture, "nobody", true)).toEqual({ profile: "nobody", limited: false, unsafe: false });
		expect(budgetFace(fixture, "default", false)).toEqual({ profile: "default", off: true });
	});
});

describe("profileItems", () => {
	it("lists every account and every session's profile, sorted", () => {
		expect(profileItems(fixture)).toEqual([
			{ label: "default", value: "default" },
			{ label: "work", value: "work" },
		]);
		expect(profileItems(undefined)).toEqual([{ label: "default", value: "default" }]);
	});
});
