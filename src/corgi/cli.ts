import { execFile } from "node:child_process";
import { access } from "node:fs/promises";

/**
 * Running corgi. A plugin launched by the Stream Deck app has the Dock's PATH,
 * which rarely includes Homebrew, so the binary is resolved once — an
 * explicit override, the two Homebrew prefixes, then whatever the user's
 * login shell finds — and cached. Commands run with an argument array, never
 * a shell string: session ids and labels are data, not syntax.
 */

export interface ExecResult {
	stdout: string;
	stderr: string;
	code: number | null;
}

export interface CliDeps {
	exists(path: string): Promise<boolean>;
	exec(file: string, args: string[], timeoutMs: number): Promise<ExecResult>;
	/** The user's login shell, for `command -v corgi`. */
	shell: string;
}

export interface CliResult extends ExecResult {
	ok: boolean;
	/** Exit 1 with corgi's "not running" message: the daemon is down, not the command wrong. */
	daemonDown: boolean;
}

export type JsonResult<T> = { value: T } | { daemonDown: true } | { error: string };

export const candidates = ["/opt/homebrew/bin/corgi", "/usr/local/bin/corgi"];

const commandTimeoutMs = 3000;

export const defaultDeps: CliDeps = {
	exists: (path) =>
		access(path).then(
			() => true,
			() => false,
		),
	exec: (file, args, timeoutMs) =>
		new Promise((resolve) => {
			execFile(file, args, { timeout: timeoutMs, maxBuffer: 8 << 20 }, (error, stdout, stderr) => {
				// execFile's error.code is the exit status for a process that ran,
				// or a string like "ENOENT" for one that could not start.
				const raw = (error as NodeJS.ErrnoException | null)?.code;
				const code = error ? (typeof raw === "number" ? raw : 1) : 0;
				const message = error && typeof raw === "string" ? `${raw}: ${error.message}` : "";
				resolve({ stdout: String(stdout), stderr: String(stderr) + message, code });
			});
		}),
	shell: process.env.SHELL || "/bin/zsh",
};

export class Corgi {
	private resolved: string | undefined;

	constructor(
		private readonly deps: CliDeps = defaultDeps,
		private override: string | undefined = undefined,
	) {}

	/** Change the Property Inspector override; forgets the cached path. */
	setOverride(path: string | undefined): void {
		this.override = path?.trim() || undefined;
		this.resolved = undefined;
	}

	/** The corgi binary, resolved once. Throws when none is found. */
	async resolve(): Promise<string> {
		if (this.resolved) {
			return this.resolved;
		}
		const found = await resolveCorgi(this.deps, this.override);
		if (!found) {
			throw new Error("corgi not found — install it (brew install andriiklymiuk/homebrew-tools/corgi) or set its path in the key's settings");
		}
		this.resolved = found;
		return found;
	}

	/** Runs `corgi <args>`. A missing binary is re-resolved once. */
	async run(args: string[]): Promise<CliResult> {
		let file: string;
		try {
			file = await this.resolve();
		} catch (error) {
			return { ok: false, daemonDown: false, stdout: "", stderr: String((error as Error).message), code: null };
		}
		let result = await this.deps.exec(file, args, commandTimeoutMs);
		if (result.stderr.includes("ENOENT")) {
			this.resolved = undefined;
			file = await this.resolve().catch(() => file);
			result = await this.deps.exec(file, args, commandTimeoutMs);
		}
		return { ...result, ok: result.code === 0, daemonDown: isDaemonDown(result.code, result.stderr) };
	}

	/** Runs a command and parses its JSON output. */
	async runJson<T>(args: string[]): Promise<JsonResult<T>> {
		const result = await this.run(args);
		if (result.daemonDown) {
			return { daemonDown: true };
		}
		if (!result.ok) {
			return { error: result.stderr.trim() || `corgi exited with ${result.code}` };
		}
		try {
			return { value: JSON.parse(result.stdout) as T };
		} catch {
			return { error: "corgi printed something that is not JSON" };
		}
	}
}

/** corgi's board commands exit 1 with this phrase when no daemon is running. */
export function isDaemonDown(code: number | null, stderr: string): boolean {
	return code === 1 && /not running/i.test(stderr);
}

/** The resolution order, as a plain function so tests can drive it. */
export async function resolveCorgi(deps: CliDeps, override?: string): Promise<string | undefined> {
	if (override && (await deps.exists(override))) {
		return override;
	}
	for (const candidate of candidates) {
		if (await deps.exists(candidate)) {
			return candidate;
		}
	}
	const viaShell = await deps.exec(deps.shell, ["-lc", "command -v corgi"], commandTimeoutMs).catch(() => undefined);
	const line = viaShell?.stdout.trim().split("\n").pop()?.trim();
	if (viaShell?.code === 0 && line && line.startsWith("/")) {
		return line;
	}
	return undefined;
}
