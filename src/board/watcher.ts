import { EventEmitter } from "node:events";
import { watch, type FSWatcher } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, dirname } from "node:path";

import type { Corgi } from "../corgi/cli";
import type { Board, BoardReport } from "../corgi/types";

/**
 * Keeps the latest board in memory and says when it changes.
 *
 * corgi is asked once where sessions.json lives (`corgi agent sessions
 * --json`); after that the file's directory is watched. The daemon writes
 * the file by rename, so one publish is one event. A slow poll is the safety
 * net, and a daemon that is down is reported as such and retried with
 * backoff — never started.
 */

export interface WatcherEvents {
	board: [board: Board & { daemonRunning: boolean }];
	daemon: [running: boolean];
	error: [message: string];
}

export interface WatcherOptions {
	debounceMs?: number;
	pollMs?: number;
	retryMinMs?: number;
	retryMaxMs?: number;
}

export class BoardWatcher extends EventEmitter<WatcherEvents> {
	private path: string | undefined;
	private board: Board | undefined;
	private running = false;
	private fsWatcher: FSWatcher | undefined;
	private debounce: NodeJS.Timeout | undefined;
	private poll: NodeJS.Timeout | undefined;
	private retry: NodeJS.Timeout | undefined;
	private retryMs: number;
	private stopped = false;
	private readonly opts: Required<WatcherOptions>;

	constructor(
		private readonly corgi: Corgi,
		opts: WatcherOptions = {},
	) {
		super();
		this.opts = { debounceMs: 50, pollMs: 5000, retryMinMs: 1000, retryMaxMs: 30000, ...opts };
		this.retryMs = this.opts.retryMinMs;
	}

	current(): Board | undefined {
		return this.board;
	}

	daemonRunning(): boolean {
		return this.running;
	}

	boardPath(): string | undefined {
		return this.path;
	}

	async start(): Promise<void> {
		this.stopped = false;
		await this.refreshFromCli();
		this.poll = setInterval(() => void this.readFile(), this.opts.pollMs);
		this.poll.unref?.();
	}

	stop(): void {
		this.stopped = true;
		this.fsWatcher?.close();
		this.fsWatcher = undefined;
		for (const t of [this.debounce, this.poll, this.retry]) {
			if (t) {
				clearTimeout(t);
			}
		}
		this.debounce = this.poll = this.retry = undefined;
	}

	/** Ask corgi for the board now (a press on a dim key, a settings change). */
	async refreshFromCli(): Promise<void> {
		const result = await this.corgi.runJson<BoardReport>(["agent", "sessions", "--json"]);
		if ("value" in result) {
			const { path, daemonRunning, ...board } = result.value;
			this.path = path;
			this.armWatch();
			this.setRunning(daemonRunning);
			this.setBoard(board, true);
			this.retryMs = this.opts.retryMinMs;
			return;
		}
		if ("daemonDown" in result) {
			this.setRunning(false);
		} else {
			this.emit("error", result.error);
		}
		this.scheduleRetry();
	}

	private scheduleRetry(): void {
		if (this.stopped || this.retry) {
			return;
		}
		this.retry = setTimeout(() => {
			this.retry = undefined;
			void this.refreshFromCli();
		}, this.retryMs);
		this.retry.unref?.();
		this.retryMs = Math.min(this.retryMs * 2, this.opts.retryMaxMs);
	}

	private armWatch(): void {
		if (this.fsWatcher || !this.path || this.stopped) {
			return;
		}
		const dir = dirname(this.path);
		const name = basename(this.path);
		try {
			this.fsWatcher = watch(dir, (_event, filename) => {
				if (!filename || filename.toString() === name) {
					this.scheduleRead();
				}
			});
			this.fsWatcher.on("error", () => {
				this.fsWatcher?.close();
				this.fsWatcher = undefined;
			});
		} catch {
			this.fsWatcher = undefined; // the poll still runs
		}
	}

	private scheduleRead(): void {
		if (this.debounce) {
			clearTimeout(this.debounce);
		}
		this.debounce = setTimeout(() => {
			this.debounce = undefined;
			void this.readFile();
		}, this.opts.debounceMs);
	}

	/** Re-read sessions.json; only a changed updatedAt is announced. */
	async readFile(): Promise<void> {
		if (!this.path || this.stopped) {
			return;
		}
		let text: string;
		try {
			text = await readFile(this.path, "utf8");
		} catch {
			// Not written yet, or the daemon cleaned up: ask corgi again on the
			// next poll and let it say whether the daemon is up.
			void this.refreshFromCli();
			return;
		}
		let board: Board;
		try {
			board = JSON.parse(text) as Board;
		} catch {
			return; // mid-rename or truncated: keep the last good board
		}
		this.setBoard(board, false);
	}

	private setBoard(board: Board, fromCli: boolean): void {
		if (this.board && this.board.updatedAt === board.updatedAt && !fromCli) {
			return;
		}
		this.board = board;
		this.emit("board", { ...board, daemonRunning: this.running });
	}

	private setRunning(running: boolean): void {
		if (this.running === running) {
			return;
		}
		this.running = running;
		this.emit("daemon", running);
		if (this.board) {
			this.emit("board", { ...this.board, daemonRunning: running });
		}
	}
}
