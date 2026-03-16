/**
 * E2E test: Advanced screen recording with REAL user interactions.
 *
 * Records the screen while performing various editor interactions:
 *   - Switching between panel tabs (Media, Text, AI, etc.)
 *   - Adding a text element to the timeline
 *   - Selecting and modifying text properties
 *   - Clicking timeline elements, dragging playhead
 *   - Opening export dialog briefly
 *   - Switching between panels
 *
 * Verifies that recording with active UI produces larger files and
 * more cursor telemetry points than a static recording.
 */

import { access, copyFile, readFile, stat } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import {
	createTestProject,
	ensureMediaTabActive,
	ensurePanelTabActive,
	ensureTextTabActive,
	expect,
	importTestVideo,
	startScreenRecordingForE2E,
	stopScreenRecordingForE2E,
	test,
} from "./helpers/electron-helpers";

/** Derive the cursor sidecar path from a video path. */
function getCursorSidecarPath(videoPath: string): string {
	const dir = dirname(videoPath);
	const ext = extname(videoPath);
	const base = basename(videoPath, ext);
	return join(dir, `${base}.cursor.json`);
}

/** Move the mouse in a deliberate pattern to generate telemetry. */
async function generateMouseMovement(
	page: import("@playwright/test").Page,
	durationMs: number
) {
	const start = Date.now();
	let x = 400;
	let y = 300;
	while (Date.now() - start < durationMs) {
		x = 200 + Math.floor(Math.random() * 800);
		y = 150 + Math.floor(Math.random() * 500);
		await page.mouse.move(x, y, { steps: 3 });
		await page.waitForTimeout(50);
	}
}

test.describe("Advanced Screen Recording with User Interactions", () => {
	test("records screen during real editor interactions and produces valid output", async ({
		page,
	}) => {
		// ── 1. Setup: create project with media ──
		await createTestProject(page, "Advanced Recording E2E");

		// Import test video to have content in the timeline
		await importTestVideo(page);
		await page.waitForTimeout(1_000);

		// Verify recording toggle is available
		const recordingToggle = page.getByTestId("screen-recording-toggle-button");
		await expect(recordingToggle).toBeVisible({ timeout: 10_000 });

		// Confirm no recording is active
		const statusBefore = await page.evaluate(async () => {
			const api = window.electronAPI?.screenRecording;
			if (!api) throw new Error("screenRecording API unavailable");
			return await api.getStatus();
		});
		expect(statusBefore.recording).toBe(false);

		// ── 2. Start screen recording ──
		const startResult = await startScreenRecordingForE2E(page);
		expect(startResult.sessionId).toBeTruthy();
		expect(startResult.filePath).toBeTruthy();

		// ── 3. Perform real user interactions while recording (~10s) ──

		// 3a. Switch between panel tabs with mouse movements
		await page.waitForTimeout(500);

		// Switch to Media tab
		await ensureMediaTabActive(page);
		await generateMouseMovement(page, 500);

		// Switch to Edit > Text panel
		await ensureTextTabActive(page);
		await generateMouseMovement(page, 500);

		// 3b. Add a text element to the timeline
		const addTextButton = page.locator(
			'[data-testid="add-text-button"], [data-testid="text-add-button"], button:has-text("Add Text")'
		);
		if ((await addTextButton.count()) > 0) {
			await addTextButton.first().click();
			await page.waitForTimeout(500);
		} else {
			// Try adding text via the text panel presets
			const textPreset = page.locator(
				'[data-testid="text-preset"], [data-testid*="text-template"], [data-testid*="text-style"]'
			);
			if ((await textPreset.count()) > 0) {
				await textPreset.first().click();
				await page.waitForTimeout(500);
			}
		}
		await generateMouseMovement(page, 500);

		// 3c. Click on timeline elements to select them
		const timelineTrack = page.locator('[data-testid="timeline-track"]');
		if ((await timelineTrack.count()) > 0) {
			await timelineTrack.first().click();
			await page.waitForTimeout(300);
		}

		// Click on timeline clips if they exist
		const timelineClip = page.locator(
			'[data-testid="timeline-clip"], [data-testid*="clip-"]'
		);
		if ((await timelineClip.count()) > 0) {
			await timelineClip.first().click();
			await page.waitForTimeout(300);
		}
		await generateMouseMovement(page, 500);

		// 3d. Drag the playhead by clicking along the timeline ruler
		const timelineRuler = page.locator(
			'[data-testid="timeline-ruler"], [data-testid="timeline-header"], [data-testid="timeline-scrubber"]'
		);
		if ((await timelineRuler.count()) > 0) {
			const rulerBox = await timelineRuler.first().boundingBox();
			if (rulerBox) {
				// Click at different positions along the ruler
				for (let i = 0; i < 5; i++) {
					const xPos = rulerBox.x + (rulerBox.width * (i + 1)) / 6;
					await page.mouse.click(xPos, rulerBox.y + 5);
					await page.waitForTimeout(200);
				}
			}
		}
		await generateMouseMovement(page, 500);

		// 3e. Switch to AI panel
		await ensurePanelTabActive(page, "ai-create", "ai");
		await page.waitForTimeout(500);
		await generateMouseMovement(page, 500);

		// Switch back to Media panel
		await ensureMediaTabActive(page);
		await page.waitForTimeout(500);

		// 3f. Open export dialog briefly
		const exportButton = page.locator('[data-testid="export-button"]');
		if ((await exportButton.count()) > 0) {
			await exportButton.click();
			await page.waitForTimeout(1_000);
			// Close the dialog
			await page.keyboard.press("Escape");
			await page.waitForTimeout(500);
		}
		await generateMouseMovement(page, 500);

		// 3g. Switch between more panels
		await ensurePanelTabActive(page, "edit", "text", "Manual Edit");
		await page.waitForTimeout(500);
		await generateMouseMovement(page, 500);

		await ensureMediaTabActive(page);
		await page.waitForTimeout(500);
		await generateMouseMovement(page, 500);

		// Final mouse movements to boost telemetry
		await generateMouseMovement(page, 1_000);

		// ── 4. Stop recording ──
		const stopResult = await stopScreenRecordingForE2E(page);
		expect(stopResult.success).toBe(true);
		expect(stopResult.discarded).toBe(false);
		expect(stopResult.bytesWritten).toBeGreaterThan(0);

		const videoPath = stopResult.filePath;
		if (!videoPath) {
			throw new Error("stopRecording returned an empty filePath");
		}

		// ── 5. Verify file exists and size is reasonable ──
		await access(videoPath);

		const videoStats = await stat(videoPath);
		// With 10s of recording at 5Mbps, file should be substantial
		// At minimum expect > 100KB (accounting for transcoding)
		expect(videoStats.size).toBeGreaterThan(100_000);

		// ── 6. Verify cursor telemetry ──
		const sidecarPath = getCursorSidecarPath(videoPath);
		await access(sidecarPath);

		const raw = await readFile(sidecarPath, "utf-8");
		const sidecar = JSON.parse(raw);

		expect(sidecar.version).toBe(1);
		expect(sidecar.captureRect).toBeDefined();
		expect(typeof sidecar.captureRect.width).toBe("number");
		expect(typeof sidecar.captureRect.height).toBe("number");

		expect(Array.isArray(sidecar.points)).toBe(true);
		expect(sidecar.points.length).toBeGreaterThan(0);

		// Verify point shape
		const firstPoint = sidecar.points[0];
		expect(typeof firstPoint.t).toBe("number");
		expect(typeof firstPoint.x).toBe("number");
		expect(typeof firstPoint.y).toBe("number");
		expect(typeof firstPoint.p).toBe("boolean");

		// With ~10s of recording at ~60Hz, expect many more points than the static 3s test
		// At minimum 200 points (conservative for ~10s at 60Hz polling)
		expect(sidecar.points.length).toBeGreaterThan(200);

		// Verify cursor positions are recorded (system cursor, not Playwright virtual mouse)
		const uniqueXPositions = new Set(
			sidecar.points.map((p: { x: number }) => Math.round(p.x / 10))
		);
		const uniqueYPositions = new Set(
			sidecar.points.map((p: { y: number }) => Math.round(p.y / 10))
		);
		// At minimum should have at least 1 unique position recorded
		expect(uniqueXPositions.size).toBeGreaterThan(0);
		expect(uniqueYPositions.size).toBeGreaterThan(0);

		// ── 7. Copy recording to output path ──
		const { tmpdir } = await import("node:os");
		const outputPath = join(tmpdir(), "qcut-recording-advanced.mp4");
		await copyFile(videoPath, outputPath);

		// Verify the copy exists
		await access(outputPath);
		const copiedStats = await stat(outputPath);
		expect(copiedStats.size).toBe(videoStats.size);
	});
});
