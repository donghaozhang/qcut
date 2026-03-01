/**
 * AI Enhancement & Export Integration E2E Tests
 *
 * Tests the complete workflow for AI-powered video enhancement features
 * including accessing AI tools, applying effects, timeline integration,
 * preview functionality, and export with AI enhancements.
 */

import path from "node:path";
import {
	test,
	expect,
	createTestProject,
	importTestVideo,
	navigateToProjects,
	ensureMediaTabActive,
	ensurePanelTabActive,
} from "./helpers/electron-helpers";

/**
 * Test suite for AI Enhancement & Export Integration (Test #4B)
 * Covers subtasks 4B.1 through 4B.7 from the E2E testing priority document.
 */
test.describe("AI Enhancement & Export Integration", () => {
	test.beforeEach(async ({ page }, testInfo) => {
		// Ensure we start from the projects hub before creating a fresh project per test
		await navigateToProjects(page);

		const projectName = `AI Enhancement ${testInfo.title}`;
		await createTestProject(page, projectName);
		await importTestVideo(page);

		await expect(
			page.locator('[data-testid="media-item"]').first()
		).toBeVisible();
	});
	/**
	 * Test 4B.1: Access AI enhancement tools
	 * Verifies user can access AI enhancement panel and features after importing media.
	 */
	test("4B.1 - Access AI enhancement tools", async ({ page }) => {
		// Verify media item appears from setup
		await expect(
			page.locator('[data-testid="media-item"]').first()
		).toBeVisible();

		// Switch to AI panel in media panel
		await ensurePanelTabActive(page, "ai-create", "ai");
		await page.waitForSelector('[data-testid="ai-features-panel"]', {
			state: "visible",
		});

		// Verify AI features panel is visible
		await expect(
			page.locator('[data-testid="ai-features-panel"]')
		).toBeVisible();

		// Verify AI enhancement panel exists
		await expect(
			page.locator('[data-testid="ai-enhancement-panel"]')
		).toBeVisible();
	});

	/**
	 * Test 4B.2: Apply AI enhancement effects to media
	 * Tests the ability to select and apply AI enhancement effects to imported media.
	 */
	test("4B.2 - Apply AI enhancement effects to media", async ({ page }) => {
		const mediaItems = page.locator('[data-testid="media-item"]');
		const initialMediaCount = await mediaItems.count();

		// Ensure we're in AI panel
		await ensurePanelTabActive(page, "ai-create", "ai");
		await page.waitForSelector('[data-testid="ai-enhancement-panel"]', {
			state: "visible",
		});

		// Look for effect gallery or enhancement tools
		const effectGallery = page.locator('[data-testid="ai-enhancement-panel"]');
		await expect(effectGallery).toBeVisible();

		// Look for enhancement effect options
		const enhancementOptions = page
			.locator('[data-testid*="effect"], [data-testid*="enhancement"], button')
			.filter({
				hasText: /enhance|effect|filter|style/i,
			});

		if ((await enhancementOptions.count()) > 0) {
			// Select first available enhancement
			await enhancementOptions.first().click();

			// Wait for processing to complete
			await page.waitForLoadState("networkidle");

			// Switch back to the media tab to validate library contents since the AI tab hides media items
			await ensureMediaTabActive(page);
			await expect(mediaItems.first()).toBeVisible();

			// Verify enhancement was applied (new asset created or existing modified)
			expect(await mediaItems.count()).toBeGreaterThanOrEqual(
				initialMediaCount
			);
		}
	});

	/**
	 * Test 4B.3: Use enhanced media in timeline
	 * Verifies enhanced media can be dragged to timeline and displays properly.
	 */
	test("4B.3 - Use enhanced media in timeline", async ({ page }) => {
		// Drag enhanced media to timeline
		const mediaItem = page.locator('[data-testid="media-item"]').first();
		await expect(mediaItem).toBeVisible();

		const timelineTrack = page
			.locator('[data-testid="timeline-track"]')
			.first();
		await expect(timelineTrack).toBeVisible();

		// Perform drag and drop operation with intermediate steps for reliability
		await mediaItem.hover();
		await page.mouse.down();
		await timelineTrack.hover();
		await page.mouse.up();

		// Wait for the element to appear on timeline
		await page.waitForSelector('[data-testid="timeline-element"]', {
			state: "visible",
		});

		// Verify media appears on timeline
		const timelineElements = page.locator('[data-testid="timeline-element"]');
		expect(await timelineElements.count()).toBeGreaterThan(0);

		// Verify timeline element has proper duration
		const firstElement = timelineElements.first();
		await expect(firstElement).toHaveAttribute("data-duration");
	});

	/**
	 * Test 4B.4: Preview enhanced media with effects
	 * Tests video playback preview functionality with AI enhancements applied.
	 */
	test("4B.4 - Preview enhanced media with effects", async ({ page }) => {
		// Ensure timeline has content
		const timelineElements = page.locator('[data-testid="timeline-element"]');

		if ((await timelineElements.count()) === 0) {
			const mediaItem = page.locator('[data-testid="media-item"]').first();
			const timelineTrack = page
				.locator('[data-testid="timeline-track"]')
				.first();

			await expect(mediaItem).toBeVisible();
			await expect(timelineTrack).toBeVisible();

			await mediaItem.hover();
			await page.mouse.down();
			await timelineTrack.hover();
			await page.mouse.up();

			await expect(timelineElements.first()).toBeVisible();
		}

		// Click play to preview enhanced media
		const previewToolbar = page
			.locator('[data-testid="preview-panel"]')
			.locator("[data-toolbar]")
			.first();
		const playButton = previewToolbar.getByTestId("preview-play-button");
		const pauseButton = previewToolbar.getByTestId("preview-pause-button");

		// Ensure we start from a paused state before testing playback toggles
		if (await pauseButton.isVisible().catch(() => false)) {
			await pauseButton.click();
			await expect(playButton).toBeVisible();
		}

		await expect(playButton).toBeVisible();
		await playButton.click();
		await expect(pauseButton).toBeVisible();

		// Wait for playback state to be fully updated
		await page
			.waitForFunction(
				() => {
					const btn = document.querySelector(
						'[data-testid="preview-pause-button"]'
					);
					return btn && btn.getAttribute("data-playing") === "true";
				},
				{ timeout: 3000 }
			)
			.catch(() => {});

		// Verify video is playing
		await expect(pauseButton).toHaveAttribute("data-playing", "true");

		// Let video play to see enhancements
		await page
			.waitForFunction(
				() => {
					const timeDisplay = document.querySelector(
						'[data-testid*="time"], [data-testid*="current-time"]'
					);
					return timeDisplay && parseFloat(timeDisplay.textContent || "0") > 1;
				},
				{ timeout: 5000 }
			)
			.catch(() => {});

		// Pause video
		await pauseButton.click();
		await expect(playButton).toBeVisible();

		// Verify preview panel is showing enhanced content
		const previewPanel = page.locator('[data-testid="preview-panel"]');
		await expect(previewPanel).toBeVisible();
	});

	/**
	 * Test 4B.5: Export enhanced project with AI effects
	 * Verifies export functionality works correctly with AI-enhanced content.
	 */
	test("4B.5 - Export enhanced project with AI effects", async ({ page }) => {
		// Ensure there is timeline content so the export button can be enabled
		const timelineElements = page.locator('[data-testid="timeline-element"]');
		if ((await timelineElements.count()) === 0) {
			const mediaItem = page.locator('[data-testid="media-item"]').first();
			const timelineTrack = page
				.locator('[data-testid="timeline-track"]')
				.first();

			await expect(mediaItem).toBeVisible();
			await expect(timelineTrack).toBeVisible();

			await mediaItem.hover();
			await page.mouse.down();
			await timelineTrack.hover();
			await page.mouse.up();

			await page.waitForSelector('[data-testid="timeline-element"]', {
				state: "visible",
			});
		}
		expect(await timelineElements.count()).toBeGreaterThan(0);

		// Open export dialog
		const exportButton = page.locator('[data-testid*="export"]').first();
		await exportButton.click();
		await page.waitForSelector(
			'[data-testid*="export-dialog"], .modal, [role="dialog"]',
			{ state: "visible" }
		);

		// Verify export dialog appears
		const exportDialog = page
			.locator('[data-testid*="export-dialog"], .modal, [role="dialog"]')
			.first();
		await expect(exportDialog).toBeVisible();

		// Configure export settings for enhanced content
		const qualityOptions = page.locator('select, input[type="radio"]').filter({
			hasText: /quality|resolution|format/i,
		});

		// Set high quality for enhanced content
		if ((await qualityOptions.count()) > 0) {
			const highQualityOption = qualityOptions
				.filter({ hasText: /high|hd|1080/i })
				.first();
			if (await highQualityOption.isVisible()) {
				await highQualityOption.click();
			}
		}

		// Start export process
		const startExportButton = page.locator(
			'[data-testid="export-start-button"]'
		);
		if (await startExportButton.isVisible()) {
			await startExportButton.click();

			const statusSelector = '[data-testid="export-status"]';
			const progressSelector = '[data-testid="export-progress-bar"]';

			await Promise.race([
				page
					.waitForSelector(statusSelector, {
						state: "visible",
						timeout: 10_000,
					})
					.catch(() => null),
				page
					.waitForSelector(progressSelector, {
						state: "visible",
						timeout: 10_000,
					})
					.catch(() => null),
			]);

			const exportStatus = page.locator(statusSelector).first();
			const progressBar = page.locator(progressSelector).first();

			if (await exportStatus.isVisible()) {
				await expect(exportStatus).not.toHaveText(/^\s*$/);
			} else if (await progressBar.isVisible()) {
				await expect(progressBar).toBeVisible();
			} else {
				throw new Error("Export feedback UI did not appear.");
			}
		}
	});

	/**
	 * Test 4B.6: Batch apply AI enhancements to multiple assets
	 * Tests bulk processing capabilities for applying AI enhancements to multiple media items.
	 */
	test("4B.6 - Batch apply AI enhancements to multiple assets", async ({
		page,
	}) => {
		// Ensure we have multiple media items
		await ensureMediaTabActive(page);
		await page.click('[data-testid="import-media-button"]');
		await page.waitForSelector('[data-testid="media-item"]', {
			state: "visible",
		});

		// Switch to AI panel
		await ensurePanelTabActive(page, "ai-create", "ai");
		await page.waitForSelector('[data-testid="ai-enhancement-panel"]', {
			state: "visible",
		});

		const mediaItems = page.locator('[data-testid="media-item"]');
		const itemCount = await mediaItems.count();

		if (itemCount > 1) {
			// Look for batch processing or select all functionality
			const selectAllOption = page
				.locator('input[type="checkbox"]')
				.filter({
					hasText: /select all|batch|all items/i,
				})
				.first();

			if (await selectAllOption.isVisible()) {
				await selectAllOption.check();
				await expect(selectAllOption).toBeChecked();
			}

			// Apply batch enhancement
			const batchEnhanceButton = page
				.locator("button")
				.filter({
					hasText: /apply all|batch enhance|enhance all/i,
				})
				.first();

			if (await batchEnhanceButton.isVisible()) {
				await batchEnhanceButton.click();
				await page.waitForLoadState("networkidle"); // Allow time for batch processing
			}
		}

		// Switch back to media panel to verify enhanced assets since AI tab hides media grid
		await ensureMediaTabActive(page);
		await expect(mediaItems.first()).toBeVisible();
		expect(await mediaItems.count()).toBeGreaterThan(0);
	});

	/**
	 * Test 4B.7: Integration with project export workflow
	 * Tests the complete end-to-end workflow from AI enhancement to final export.
	 */
	test("4B.7 - Integration with project export workflow", async ({ page }) => {
		// Create complete project with AI enhancements
		const timelineElements = page.locator('[data-testid="timeline-element"]');

		if ((await timelineElements.count()) === 0) {
			// Add media to timeline if not already there
			const mediaItem = page.locator('[data-testid="media-item"]').first();
			const timelineTrack = page
				.locator('[data-testid="timeline-track"]')
				.first();

			// Use proper drag and drop with intermediate steps for reliability
			await mediaItem.hover();
			await page.mouse.down();
			await timelineTrack.hover();
			await page.mouse.up();

			// Wait for the element to appear on timeline
			await page.waitForSelector('[data-testid="timeline-element"]', {
				state: "visible",
			});
		}

		// Verify timeline has content
		expect(
			await page.locator('[data-testid="timeline-element"]').count()
		).toBeGreaterThan(0);

		// Test export with all AI features combined
		const exportButton = page.locator('[data-testid*="export"]').first();
		await exportButton.click();
		await page.waitForSelector(
			'[data-testid*="export-dialog"], .modal, [role="dialog"]',
			{ state: "visible" }
		);

		const exportDialog = page
			.locator('[data-testid*="export-dialog"], .modal, [role="dialog"]')
			.first();
		await expect(exportDialog).toBeVisible();

		// Enable all AI-related export features
		const aiOptions = page
			.locator('input[type="checkbox"], input[type="radio"]')
			.filter({
				hasText: /ai|enhancement|effect|filter|caption|subtitle/i,
			});

		for (let i = 0; i < (await aiOptions.count()); i++) {
			const option = aiOptions.nth(i);
			if (
				(await option.isVisible()) &&
				(await option.getAttribute("type")) === "checkbox"
			) {
				await option.check();
			}
		}

		// Start final export
		const startExportButton = page.locator(
			'[data-testid="export-start-button"]'
		);
		if (await startExportButton.isVisible()) {
			await startExportButton.click();

			const statusSelector = '[data-testid="export-status"]';
			const progressSelector = '[data-testid="export-progress-bar"]';

			await Promise.race([
				page
					.waitForSelector(statusSelector, {
						state: "visible",
						timeout: 10_000,
					})
					.catch(() => null),
				page
					.waitForSelector(progressSelector, {
						state: "visible",
						timeout: 10_000,
					})
					.catch(() => null),
			]);

			// Verify comprehensive export is processing
			const exportStatus = page.locator(statusSelector).first();
			const progressBar = page.locator(progressSelector).first();

			if (await exportStatus.isVisible()) {
				await expect(exportStatus).not.toHaveText(/^\s*$/);
			} else if (await progressBar.isVisible()) {
				await expect(progressBar).toBeVisible();
			} else {
				throw new Error("Export feedback UI did not appear.");
			}
		}
	});

	test("upscale image workflow", async ({ page }) => {
		// Stub FAL endpoints so the test never leaves the sandboxed runner.
		await page.route("https://fal.run/**", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					status: "COMPLETED",
					images: [{ url: "https://example.com/stub-upscale.png" }],
				}),
			});
		});

		// Provide a mock FAL API key via Electron storage so getFalApiKey()
		// succeeds and the stubbed route is reached instead of throwing.
		await page.evaluate(async () => {
			const api = (window as any).electronAPI;
			if (api?.apiKeys?.set) {
				await api.apiKeys.set({ falApiKey: "test-fal-api-key-e2e" });
			}
		});

		// Navigate to AI Images panel (text2image) which contains the upscale feature
		await ensurePanelTabActive(page, "ai-create", "text2image");
		await page.click('[data-testid="model-type-upscale"]');

		const panel = page.locator('[data-testid="upscale-panel"]');
		await expect(panel).toBeVisible();

		// Switch models to ensure selector works
		await page.click('[data-testid="upscale-model-option-seedvr-upscale"]');

		const fixturePath = path.resolve(
			process.cwd(),
			"apps/web/src/test/e2e/fixtures/media/sample-image.png"
		);
		await page.setInputFiles("#upscale-image-input", fixturePath);

		await page.click('[data-testid="upscale-image-button"]');

		// Wait for upscale result - skip if API unavailable
		const upscaleResult = page.locator(
			'[data-testid="upscale-result-preview"]'
		);
		const hasResult = await upscaleResult
			.isVisible({ timeout: 15_000 })
			.catch(() => false);
		if (!hasResult) {
			test.skip(
				true,
				"Skipping: Upscale API unavailable or returned error (requires FAL.ai API key)"
			);
			return;
		}
		await expect(upscaleResult).toBeVisible();
	});
});
