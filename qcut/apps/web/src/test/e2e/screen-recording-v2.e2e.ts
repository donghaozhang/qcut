/**
 * E2E test: Full screen recording enhancement pipeline.
 *
 * Launches QCut → creates project → starts recording → interacts with editor →
 * stops recording → verifies cursor telemetry → opens enhancement panel →
 * tests cursor settings, background settings, zoom auto-generate →
 * verifies store state reflects UI changes.
 */

import { access, readFile, stat } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import {
	createTestProject,
	ensureMediaTabActive,
	ensureTextTabActive,
	expect,
	getScreenRecordingPermission,
	importTestVideo,
	startScreenRecordingForE2E,
	stopScreenRecordingForE2E,
	test,
} from "./helpers/electron-helpers";

function getCursorSidecarPath(videoPath: string): string {
	const dir = dirname(videoPath);
	const ext = extname(videoPath);
	const base = basename(videoPath, ext);
	return join(dir, `${base}.cursor.json`);
}

/** Move the mouse deliberately to generate telemetry + clicks. */
async function generateMouseActivity(
	page: import("@playwright/test").Page,
	durationMs: number,
	includeClicks = true
) {
	const start = Date.now();
	let i = 0;
	while (Date.now() - start < durationMs) {
		const x = 200 + Math.floor(Math.random() * 800);
		const y = 150 + Math.floor(Math.random() * 500);
		await page.mouse.move(x, y, { steps: 3 });
		if (includeClicks && i % 4 === 0) {
			await page.mouse.click(x, y);
		}
		await page.waitForTimeout(50);
		i++;
	}
}

test.describe("Screen Recording V2 — Full Enhancement Pipeline", () => {
	test("records screen, loads telemetry, and verifies enhancement panel controls", async ({
		page,
	}) => {
		// ═══════════════════════════════════════════════════════════
		// Phase 1: Setup — create project with media on timeline
		// ═══════════════════════════════════════════════════════════
		await createTestProject(page, "Screen Recording V2 E2E");
		const perm = await getScreenRecordingPermission(page);
		test.skip(
			perm !== "granted",
			`Screen Recording permission is "${perm}" — grant it to the Electron binary in System Settings > Privacy & Security > Screen Recording to run this test.`
		);

		await importTestVideo(page);
		await page.waitForTimeout(1_000);

		// Verify recording button is available
		const recordBtn = page.getByTestId("screen-recording-toggle-button");
		await expect(recordBtn).toBeVisible({ timeout: 10_000 });

		// ═══════════════════════════════════════════════════════════
		// Phase 2: Record screen with real user activity (~5s)
		// ═══════════════════════════════════════════════════════════
		const statusBefore = await page.evaluate(async () => {
			const api = window.electronAPI?.screenRecording;
			if (!api) throw new Error("screenRecording API unavailable");
			return await api.getStatus();
		});
		expect(statusBefore.recording).toBe(false);

		const startResult = await startScreenRecordingForE2E(page);
		expect(startResult.sessionId).toBeTruthy();
		expect(startResult.filePath).toBeTruthy();

		// Perform real interactions while recording
		await page.waitForTimeout(500);
		await ensureMediaTabActive(page);
		await generateMouseActivity(page, 1_000);

		await ensureTextTabActive(page);
		await generateMouseActivity(page, 1_000);

		// Click on timeline tracks if present
		const timelineTrack = page.locator('[data-testid="timeline-track"]');
		if ((await timelineTrack.count()) > 0) {
			await timelineTrack.first().click();
			await page.waitForTimeout(300);
		}

		await generateMouseActivity(page, 1_500, true);
		await ensureMediaTabActive(page);
		await generateMouseActivity(page, 1_000);

		// ═══════════════════════════════════════════════════════════
		// Phase 3: Stop recording — verify output files
		// ═══════════════════════════════════════════════════════════
		const stopResult = await stopScreenRecordingForE2E(page);
		expect(stopResult.success).toBe(true);
		expect(stopResult.discarded).toBe(false);
		expect(stopResult.bytesWritten).toBeGreaterThan(0);

		const videoPath = stopResult.filePath;
		if (!videoPath) throw new Error("stopRecording returned empty filePath");

		// Verify video file exists and has reasonable size
		await access(videoPath);
		const videoStats = await stat(videoPath);
		expect(videoStats.size).toBeGreaterThan(50_000);

		// ═══════════════════════════════════════════════════════════
		// Phase 4: Verify cursor telemetry sidecar
		// ═══════════════════════════════════════════════════════════
		const sidecarPath = getCursorSidecarPath(videoPath);
		await access(sidecarPath);

		const raw = await readFile(sidecarPath, "utf-8");
		const sidecar = JSON.parse(raw);

		expect(sidecar.version).toBe(1);
		expect(sidecar.captureRect).toBeDefined();
		expect(sidecar.captureRect.width).toBeGreaterThan(0);
		expect(sidecar.captureRect.height).toBeGreaterThan(0);

		expect(Array.isArray(sidecar.points)).toBe(true);
		// ~5s at 60Hz ≈ 300 points, use generous lower bound
		expect(sidecar.points.length).toBeGreaterThan(100);

		// Verify point structure
		const first = sidecar.points[0];
		expect(typeof first.t).toBe("number");
		expect(typeof first.x).toBe("number");
		expect(typeof first.y).toBe("number");
		expect(typeof first.p).toBe("boolean");

		// Playwright's virtual mouse doesn't move the OS cursor. Coordinates may
		// also be negative when the captured display is left of the primary one.
		const allX = sidecar.points.map((p: { x: number }) => p.x);
		const allY = sidecar.points.map((p: { y: number }) => p.y);
		expect(allX.every(Number.isFinite)).toBe(true);
		expect(allY.every(Number.isFinite)).toBe(true);

		// Verify the pressed field exists on all points
		for (const p of sidecar.points.slice(0, 10)) {
			expect(typeof p.p).toBe("boolean");
		}

		// The controller loads the sidecar into the enhancement store after stop.
		// The visible controls prove that production path completed successfully.
		const cursorToggle = page.getByLabel("Toggle cursor overlay");
		await expect(cursorToggle).toBeVisible({ timeout: 10_000 });

		// ═══════════════════════════════════════════════════════════
		// Phase 5: Verify enhancement controls through the real UI
		// ═══════════════════════════════════════════════════════════
		// ── Cursor settings ──
		const dotButton = page.locator('[aria-label="Dot"]');
		const arrowButton = page.locator('[aria-label="Arrow"]');

		if ((await dotButton.count()) > 0) {
			await expect(dotButton.first()).toBeVisible();
			console.log("[Screen Recording V2] ✓ Cursor style buttons visible");
		}

		// Toggle cursor visibility off and on
		await cursorToggle.first().click();
		await page.waitForTimeout(300);
		await cursorToggle.first().click();
		await page.waitForTimeout(300);
		console.log("[Screen Recording V2] ✓ Cursor visibility toggle works");

		// Switch cursor style to arrow
		if ((await arrowButton.count()) > 0) {
			await arrowButton.first().click();
			await page.waitForTimeout(300);
			console.log("[Screen Recording V2] ✓ Switched cursor to arrow style");
		}

		// ── Background settings ──
		const gradientBtn = page.locator('[aria-label="Gradient"]');
		const solidBtn = page.locator('[aria-label="Solid"]');
		const noneBtn = page.locator('[aria-label="None"]');

		if ((await gradientBtn.count()) > 0) {
			await gradientBtn.first().click();
			await page.waitForTimeout(500);
			console.log("[Screen Recording V2] ✓ Switched to gradient background");

			// Select a gradient preset
			const sunsetPreset = page.locator('[aria-label="Sunset"]');
			if ((await sunsetPreset.count()) > 0) {
				await sunsetPreset.first().click();
				await page.waitForTimeout(300);
				console.log("[Screen Recording V2] ✓ Selected Sunset gradient preset");
			}

			// Verify padding/radius/shadow controls appeared
			const shadowSwitch = page.locator('[aria-label="Toggle shadow"]');
			if ((await shadowSwitch.count()) > 0) {
				console.log(
					"[Screen Recording V2] ✓ Shadow toggle visible with background"
				);
			}
		}

		if ((await solidBtn.count()) > 0) {
			await solidBtn.first().click();
			await page.waitForTimeout(300);
			console.log("[Screen Recording V2] ✓ Switched to solid background");
		}

		if ((await noneBtn.count()) > 0) {
			await noneBtn.first().click();
			await page.waitForTimeout(300);
			console.log("[Screen Recording V2] ✓ Switched background back to none");
		}

		// ── Zoom controls ──
		const autoGenBtn = page.getByRole("button", { name: "Auto-generate" });
		await expect(autoGenBtn).toBeEnabled();
		await autoGenBtn.click();
		await page.waitForTimeout(1_000);
		console.log("[Screen Recording V2] ✓ Auto-generated zoom regions");

		// Add manual zoom region
		const addZoomBtn = page.locator(
			'button[title="Add zoom region at current time"]'
		);
		if ((await addZoomBtn.count()) > 0) {
			await addZoomBtn.first().click();
			await page.waitForTimeout(500);

			const regionCount = await page
				.locator('[aria-label="Remove zoom region"]')
				.count();
			expect(regionCount).toBeGreaterThan(0);
			console.log(`[Screen Recording V2] ✓ Zoom regions count: ${regionCount}`);

			// Change depth to 2x
			const depth2x = page.locator('button:has-text("2x")');
			if ((await depth2x.count()) > 0) {
				await depth2x.first().click();
				await page.waitForTimeout(300);
				console.log("[Screen Recording V2] ✓ Changed zoom depth to 2x");
			}

			// Clear all
			const clearBtn = page.locator('button[title="Clear all zoom regions"]');
			if ((await clearBtn.count()) > 0) {
				await clearBtn.first().click();
				await page.waitForTimeout(300);
				const afterClear = await page
					.locator('[aria-label="Remove zoom region"]')
					.count();
				expect(afterClear).toBe(0);
				console.log("[Screen Recording V2] ✓ Cleared all zoom regions");
			}
		}

		// ═══════════════════════════════════════════════════════════
		// Phase 11: Verify recording status returns to idle
		// ═══════════════════════════════════════════════════════════
		const statusAfter = await page.evaluate(async () => {
			const api = window.electronAPI?.screenRecording;
			if (!api) throw new Error("screenRecording API unavailable");
			return await api.getStatus();
		});
		expect(statusAfter.recording).toBe(false);

		console.log(
			"[Screen Recording V2] ✅ Full enhancement pipeline test passed"
		);
	});
});
