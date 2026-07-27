/**
 * Process-level helpers for the narration batch.
 *
 * Everything that spawns a child process or moves a file lives here, so the
 * planning and prompt logic in vo.ts stays unit-testable without a TTS call.
 */

import { spawn } from "node:child_process";
import { copyFileSync, renameSync, rmSync } from "node:fs";

export interface SpawnOutcome {
	exitCode: number;
	stdout: string;
	stderr: string;
}

/**
 * A hosted TTS call that never answers would otherwise pin one concurrency
 * lane for the whole batch, so children are given a deadline.
 */
export const DEFAULT_SPAWN_TIMEOUT_MS = 300_000;

/** Never rejects: a spawn error or timeout is reported as a non-zero exit. */
export function spawnCollect({
	executable,
	args,
	cwd,
	env,
	timeoutMs = DEFAULT_SPAWN_TIMEOUT_MS,
}: {
	executable: string;
	args: string[];
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	/** Kill the child after this long; 0 or negative disables the deadline. */
	timeoutMs?: number;
}): Promise<SpawnOutcome> {
	return new Promise<SpawnOutcome>((resolveOutcome) => {
		const out: Buffer[] = [];
		const err: Buffer[] = [];
		const child = spawn(executable, args, {
			cwd,
			env,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let settled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
		child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
		const finish = (exitCode: number, extra = "") => {
			if (settled) return;
			settled = true;
			if (timer) clearTimeout(timer);
			resolveOutcome({
				exitCode,
				stdout: Buffer.concat(out).toString("utf8"),
				stderr: `${Buffer.concat(err).toString("utf8")}${extra}`,
			});
		};
		if (timeoutMs > 0) {
			timer = setTimeout(() => {
				child.kill("SIGKILL");
				finish(124, `\ntimed out after ${timeoutMs}ms`);
			}, timeoutMs);
			timer.unref?.();
		}
		child.once("error", (error: Error) => finish(1, error.message));
		child.once("close", (code) => finish(code ?? 1));
	});
}

/** Explicit override wins, then PATH lookup, then a bare-name fallback. */
export function resolveExecutable({
	override,
	name,
	fallback,
}: {
	override?: string;
	name: string;
	fallback: string;
}): string {
	if (override) return override;
	const found = typeof Bun === "undefined" ? undefined : Bun.which(name);
	return found ?? fallback;
}

/** Last few lines of child output, collapsed into one error-sized string. */
export function tailMessage({
	text,
	lines = 3,
}: {
	text: string;
	lines?: number;
}): string {
	return text.trim().split("\n").slice(-lines).join(" | ");
}

/** Rename, falling back to copy+unlink when temp and assets differ by device. */
export function moveFile({ from, to }: { from: string; to: string }): void {
	try {
		renameSync(from, to);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
		copyFileSync(from, to);
		rmSync(from, { force: true });
	}
}
