/**
 * E2E test: Automated screen recording with cursor telemetry verification.
 *
 * Records the screen for 3 seconds without user interaction (source is
 * auto-selected by the main process), then verifies:
 *   a) The recording file exists on disk
 *   b) A cursor telemetry sidecar JSON exists alongside it
 *   c) The sidecar contains valid data (version, captureRect, points array with entries)
 */

import { access, readFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import {
	createTestProject,
	expect,
	startScreenRecordingForE2E,
	stopScreenRecordingForE2E,
	test,
} from "./helpers/electron-helpers";

/** Derive the cursor sidecar path from a video path (mirrors cursor-telemetry-io.ts logic). */
function getCursorSidecarPath(videoPath: string): string {
	const dir = dirname(videoPath);
	const ext = extname(videoPath);
	const base = basename(videoPath, ext);
	return join(dir, `${base}.cursor.json`);
}

test.describe("Screen Recording with Cursor Telemetry", () => {
	test("records screen, produces video file and valid cursor sidecar", async ({
		page,
	}) => {
		// --- Setup: create a project so the editor (and recording bridge) is loaded ---
		await createTestProject(page, "Telemetry E2E");

		const recordingToggle = page.getByTestId("screen-recording-toggle-button");
		await expect(recordingToggle).toBeVisible({ timeout: 10_000 });

		// Confirm no recording is active before we start
		const statusBefore = await page.evaluate(async () => {
			const api = window.electronAPI?.screenRecording;
			if (!api) throw new Error("screenRecording API unavailable");
			return await api.getStatus();
		});
		expect(statusBefore.recording).toBe(false);

		// --- Start recording (auto-selects first available source) ---
		const startResult = await startScreenRecordingForE2E(page);
		expect(startResult.sessionId).toBeTruthy();
		expect(startResult.filePath).toBeTruthy();

		// --- Record for 3 seconds to accumulate cursor telemetry points ---
		await page.waitForTimeout(3_000);

		// --- Stop recording ---
		const stopResult = await stopScreenRecordingForE2E(page);
		expect(stopResult.success).toBe(true);
		expect(stopResult.discarded).toBe(false);
		expect(stopResult.bytesWritten).toBeGreaterThan(0);

		const videoPath = stopResult.filePath;
		if (!videoPath) {
			throw new Error("stopRecording returned an empty filePath");
		}

		// --- (a) Verify recording file exists ---
		await access(videoPath);

		// --- (b) Verify cursor sidecar JSON exists ---
		const sidecarPath = getCursorSidecarPath(videoPath);
		await access(sidecarPath);

		// --- (c) Verify sidecar has valid structure and data ---
		const raw = await readFile(sidecarPath, "utf-8");
		const sidecar = JSON.parse(raw);

		expect(sidecar.version).toBe(1);
		expect(sidecar.captureRect).toBeDefined();
		expect(typeof sidecar.captureRect.x).toBe("number");
		expect(typeof sidecar.captureRect.y).toBe("number");
		expect(typeof sidecar.captureRect.width).toBe("number");
		expect(typeof sidecar.captureRect.height).toBe("number");

		expect(Array.isArray(sidecar.points)).toBe(true);
		expect(sidecar.points.length).toBeGreaterThan(0);

		// Verify shape of the first point
		const firstPoint = sidecar.points[0];
		expect(typeof firstPoint.t).toBe("number");
		expect(typeof firstPoint.x).toBe("number");
		expect(typeof firstPoint.y).toBe("number");
		expect(typeof firstPoint.p).toBe("boolean");

		// With 3s recording at ~60Hz polling, expect at least ~50 points
		// (generous lower bound to account for timing variance)
		expect(sidecar.points.length).toBeGreaterThan(50);
	});
});
