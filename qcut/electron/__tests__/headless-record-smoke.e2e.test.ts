/**
 * E2E — `qcut record` standalone smoke test.
 *
 * Runs the CLI record command against a real packaged QCut binary,
 * captures a short video, verifies the output file exists and is
 * non-empty. Uses ffprobe if available to confirm the MP4 is playable.
 *
 * Gated behind `E2E_STANDALONE=1` because it needs:
 *   - A packaged QCut binary (set `QCUT_BINARY_PATH=...`)
 *   - Screen-recording OS permission granted
 *   - A real display (not headless CI)
 *
 * Example (macOS):
 *   QCUT_BINARY_PATH=/Applications/QCut.app/Contents/MacOS/QCut \
 *   E2E_STANDALONE=1 \
 *   bun run test electron/__tests__/headless-record-smoke.e2e.ts
 */

import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, statSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearStateFiles } from "../headless-recorder/lifecycle.js";

const STANDALONE_ENABLED = process.env.E2E_STANDALONE === "1";
const describeOrSkip = STANDALONE_ENABLED ? describe : describe.skip;

function cleanup(path: string): void {
	try {
		unlinkSync(path);
	} catch {
		/* ignore */
	}
}

describeOrSkip("qcut record — standalone smoke", () => {
	const outputs: string[] = [];

	afterEach(() => {
		for (const p of outputs) cleanup(p);
		outputs.length = 0;
		clearStateFiles();
	});

	it("records a 2-second MP4 via the headless recorder", () => {
		const binary = process.env.QCUT_BINARY_PATH;
		if (!binary || !existsSync(binary)) {
			throw new Error("QCUT_BINARY_PATH must point at the Electron binary");
		}

		const outputPath = join(tmpdir(), `qcut-record-smoke-${Date.now()}.mp4`);
		outputs.push(outputPath);

		// Use the @qcut/pipeline CLI entry (bun run pipeline) with the
		// binary override so the launcher spawns the real app.
		const result = spawnSync(
			"bun",
			["run", "pipeline", "record", "--record-duration", "2", "-o", outputPath],
			{
				env: { ...process.env, QCUT_BINARY_PATH: binary },
				timeout: 60_000,
				stdio: "pipe",
				encoding: "utf8",
			}
		);

		expect(result.status).toBe(0);
		expect(existsSync(outputPath)).toBe(true);
		const size = statSync(outputPath).size;
		expect(size).toBeGreaterThan(1_000); // something was written

		// Optional ffprobe check — skip if ffprobe isn't in PATH.
		const probe = spawnSync(
			"ffprobe",
			[
				"-v",
				"error",
				"-show_entries",
				"format=duration",
				"-of",
				"default=noprint_wrappers=1:nokey=1",
				outputPath,
			],
			{ encoding: "utf8", timeout: 15_000 }
		);
		if (probe.status === 0) {
			const duration = Number.parseFloat(probe.stdout.trim());
			expect(duration).toBeGreaterThan(1); // at least a second of video
			expect(duration).toBeLessThan(5); // but not absurdly long
		}
	}, 90_000);
});
