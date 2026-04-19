/**
 * Visual Regression E2E Tests
 *
 * Captures baseline screenshots of critical UI states and compares
 * them against future runs to detect unintended visual changes.
 *
 * First run:  `bun run test:e2e:visual:update` — generates baselines
 * Later runs: `bun run test:e2e:visual`         — compares against baselines
 *
 * Config: see playwright.config.ts `expect.toHaveScreenshot`
 */

import {
	test,
	expect,
	createTestProject,
	importTestVideo,
	ensureMediaTabActive,
	waitForProjectLoad,
} from "./helpers/electron-helpers";
import {
	assertScreenshot,
	assertElementScreenshot,
} from "./utils/visual-regression";

// Lock the viewport before every visual-regression test so screenshots are
// reproducible regardless of what other tests in the same worker did
// earlier. Without this, earlier tests that resize the Electron window (or
// toggle dev chrome) leak their viewport into later runs and pixel-diff
// baselines fail despite the UI being identical.
const VISUAL_VIEWPORT = { width: 2048, height: 1024 } as const;
test.beforeEach(async ({ page }) => {
	await page.setViewportSize(VISUAL_VIEWPORT);
});

test.describe("Visual Regression — Projects Page", () => {
	test("projects page empty state", async ({ page }) => {
		// The fixture navigates to projects page automatically.
		// Wait for the page to settle before capturing.
		await page.waitForTimeout(1000);
		await assertScreenshot(page, "projects-page");
	});
});

test.describe("Visual Regression — Editor", () => {
	test("editor initial load (empty timeline)", async ({ page }) => {
		await createTestProject(page, "Visual Regression Test");
		await waitForProjectLoad(page);
		await page.waitForTimeout(1000);
		await assertScreenshot(page, "editor-empty-timeline");
	});

	test("editor with media imported", async ({ page }) => {
		await createTestProject(page, "Visual Regression Media Test");
		await waitForProjectLoad(page);
		await importTestVideo(page);

		// Wait for media to appear in the panel
		await expect(page.locator("text=sample-video.mp4").first()).toBeVisible({
			timeout: 5000,
		});
		await page.waitForTimeout(500);

		await assertScreenshot(page, "editor-with-media");
	});

	test("editor media panel", async ({ page }) => {
		await createTestProject(page, "Visual Regression Panel Test");
		await waitForProjectLoad(page);
		await ensureMediaTabActive(page);
		await page.waitForTimeout(500);

		await assertElementScreenshot(
			page,
			'[data-testid="media-panel"]',
			"media-panel"
		);
	});

	test("editor export dialog", async ({ page }) => {
		await createTestProject(page, "Visual Regression Export Test");
		await waitForProjectLoad(page);

		// Open export dialog
		const exportButton = page.getByTestId("export-button").first();
		await expect(exportButton).toBeVisible({ timeout: 5000 });
		await exportButton.click();
		await page.waitForTimeout(500);
		await assertScreenshot(page, "editor-export-dialog");
	});
});
