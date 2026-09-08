import { describe, expect, it } from "vitest";

import { candidates, type CliDeps, Corgi, type ExecResult, isDaemonDown, resolveCorgi } from "../src/corgi/cli";

function fakeDeps(present: string[], exec: (file: string, args: string[]) => ExecResult): CliDeps & { calls: string[][] } {
	const calls: string[][] = [];
	return {
		calls,
		shell: "/bin/zsh",
		exists: async (path) => present.includes(path),
		exec: async (file, args) => {
			calls.push([file, ...args]);
			return exec(file, args);
		},
	};
}

describe("resolveCorgi", () => {
	it("prefers the override, then Homebrew, then the login shell", async () => {
		const deps = fakeDeps(["/custom/corgi", candidates[1]], () => ({ stdout: "", stderr: "", code: 0 }));
		expect(await resolveCorgi(deps, "/custom/corgi")).toBe("/custom/corgi");
		expect(await resolveCorgi(deps)).toBe(candidates[1]);

		const viaShell = fakeDeps([], (file) => (file === "/bin/zsh" ? { stdout: "hello\n/Users/me/bin/corgi\n", stderr: "", code: 0 } : { stdout: "", stderr: "", code: 1 }));
		expect(await resolveCorgi(viaShell)).toBe("/Users/me/bin/corgi");
		expect(viaShell.calls[0]).toEqual(["/bin/zsh", "-lc", "command -v corgi"]);

		const nowhere = fakeDeps([], () => ({ stdout: "", stderr: "", code: 1 }));
		expect(await resolveCorgi(nowhere)).toBeUndefined();
	});
});

describe("Corgi", () => {
	it("runs with an argument array and parses --json", async () => {
		const deps = fakeDeps([candidates[0]], (_file, args) => (args.includes("--json") ? { stdout: '{"ok":true,"size":6}', stderr: "", code: 0 } : { stdout: "asked\n", stderr: "", code: 0 }));
		const corgi = new Corgi(deps);
		const result = await corgi.runJson<{ size: number }>(["agent", "board", "--json"]);
		expect(result).toEqual({ value: { ok: true, size: 6 } });
		expect(deps.calls.at(-1)).toEqual([candidates[0], "agent", "board", "--json"]);
		const focus = await corgi.run(["agent", "focus", "acme-api·zsh 2"]);
		expect(focus.ok).toBe(true);
		expect(deps.calls.at(-1)?.at(-1)).toBe("acme-api·zsh 2");
	});

	it("tells a daemon that is down from a command that failed", async () => {
		const deps = fakeDeps([candidates[0]], () => ({ stdout: "", stderr: "corgi agent is not running — `corgi agent serve`\n", code: 1 }));
		const corgi = new Corgi(deps);
		expect(await corgi.runJson(["agent", "sessions", "--json"])).toEqual({ daemonDown: true });
		const other = fakeDeps([candidates[0]], () => ({ stdout: "", stderr: "boom", code: 2 }));
		expect(await new Corgi(other).runJson(["agent", "sessions", "--json"])).toEqual({ error: "boom" });
		expect(isDaemonDown(1, "not running")).toBe(true);
		expect(isDaemonDown(2, "not running")).toBe(false);
		expect(isDaemonDown(1, "no such session")).toBe(false);
	});

	it("reports a missing binary without throwing, and re-resolves after ENOENT", async () => {
		const none = new Corgi(fakeDeps([], () => ({ stdout: "", stderr: "", code: 1 })));
		const result = await none.run(["agent", "status"]);
		expect(result.ok).toBe(false);
		expect(result.stderr).toContain("corgi not found");

		let present = [candidates[0]];
		const deps: CliDeps & { calls: string[][] } = {
			calls: [],
			shell: "/bin/zsh",
			exists: async (path) => present.includes(path),
			exec: async (file, args) => {
				deps.calls.push([file, ...args]);
				if (file === candidates[0]) {
					present = [candidates[1]];
					return { stdout: "", stderr: "ENOENT: no such file", code: 1 };
				}
				return { stdout: "ok", stderr: "", code: 0 };
			},
		};
		const corgi = new Corgi(deps);
		const second = await corgi.run(["agent", "status"]);
		expect(second.ok).toBe(true);
		expect(deps.calls.map((c) => c[0])).toEqual([candidates[0], candidates[1]]);
	});

	it("bad JSON is an error, not a crash", async () => {
		const corgi = new Corgi(fakeDeps([candidates[0]], () => ({ stdout: "not json", stderr: "", code: 0 })));
		expect(await corgi.runJson(["agent", "sessions", "--json"])).toEqual({ error: "corgi printed something that is not JSON" });
	});
});
