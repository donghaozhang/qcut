/**
 * E2E — headless daemon idle self-exit.
 *
 * Spawns the real QCut binary with `--headless-recorder --daemon` and an
 * artificially short idle timeout, then confirms the process exits on its
 * own. Gated behind `E2E_STANDALONE=1` because it needs a packaged or
 * dev-built Electron binary on disk — not available in unit-test CI.
 *
 * To run:
 *   QCUT_BINARY_PATH=/path/to/QCut.app/Contents/MacOS/QCut \
 *   QCUT_HEADLESS_IDLE_TIMEOUT_MS=3000 \
 *   E2E_STANDALONE=1 \
 *   bun run test electron/__tests__/headless-idle-exit.e2e.ts
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { clearStateFiles } from "../headless-recorder/lifecycle.js";

const STANDALONE_ENABLED = process.env.E2E_STANDALONE === "1";
const describeOrSkip = STANDALONE_ENABLED ? describe : describe.skip;

function resolveBinary(): string | null {
	return process.env.QCUT_BINARY_PATH ?? null;
}

async function waitForExit(
	child: ChildProcess,
	timeoutMs: number
): Promise<{ code: number | null; signal: NodeJS.Signals | null } | null> {
	return new Promise((resolve) => {
		const timer = setTimeout(() => resolve(null), timeoutMs);
		child.once("exit", (code, signal) => {
			clearTimeout(timer);
			resolve({ code, signal });
		});
	});
}

describeOrSkip("headless daemon — idle self-exit", () => {
	let child: ChildProcess | null = null;

	beforeEach(() => {
		clearStateFiles();
	});

	afterEach(async () => {
		if (child && !child.killed) {
			try {
				child.kill("SIGKILL");
			} catch {
				/* ignore */
			}
			await delay(200);
		}
		child = null;
		clearStateFiles();
	});

	it("exits on its own after the idle timeout", async () => {
		const binary = resolveBinary();
		if (!binary || !existsSync(binary)) {
			throw new Error(
				"QCUT_BINARY_PATH not set or missing. Point it at the Electron binary."
			);
		}

		child = spawn(binary, ["--headless-recorder", "--daemon"], {
			env: {
				...process.env,
				// If the recorder respects this env var (wired via main.ts in a
				// future iteration) we can shorten the idle timer for the test.
				// Without the hook this test may need a real 30s wait.
				QCUT_HEADLESS_IDLE_TIMEOUT_MS:
					process.env.QCUT_HEADLESS_IDLE_TIMEOUT_MS ?? "3000",
			},
			stdio: ["ignore", "pipe", "pipe"],
			detached: false,
		});

		// Give the daemon a chance to boot + write its pid/port file, then
		// stay quiet and let the idle timer fire.
		const result = await waitForExit(child, 45_000);
		expect(result).not.toBeNull();
		// Clean exit = code 0 AND no signal. Asserting only on signal would
		// let a crash-exit (code 1) pass as success.
		expect(result?.signal).toBeNull();
		expect(result?.code).toBe(0);
	}, 60_000);
});
