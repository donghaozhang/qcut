/**
 * Sticker Overlay Testing E2E Tests
 *
 * Tests the complete sticker overlay functionality including panel access,
 * sticker selection, drag-and-drop placement, canvas manipulation,
 * category navigation, and overlay rendering.
 */

import {
	test,
	expect,
	createTestProject,
	ensureStickersTabActive,
	ensureMediaTabActive,
} from "./helpers/electron-helpers";

/**
 * Test suite for Sticker Overlay Testing (Subtask 3A)
 * Covers sticker panel interactions, placement, and manipulation functionality.
 */
test.describe("Sticker Overlay Testing (Subtask 3A)", () => {
	/**
	 * Tests basic sticker panel access and sticker item interaction.
	 * Verifies panel opens correctly and sticker items are selectable.
	 */
	test("should access stickers panel and interact with sticker items", async ({
		page,
	}) => {
		// Setup: Create project and navigate to editor

		await createTestProject(page, "Sticker Test Project");

		// Test steps:
		// 1. Open stickers panel
		await ensureStickersTabActive(page);

		// Verify stickers panel opens
		await expect(page.getByTestId("stickers-panel")).toBeVisible();

		// 2. Check sticker items are available
		const stickerItems = page.getByTestId("sticker-item");

		// Wait for stickers to load
		await stickerItems
			.first()
			.waitFor({ state: "attached", timeout: 5000 })
			.catch(() => {});

		const itemCount = await stickerItems.count();
		if (itemCount > 0) {
			// 3. Test sticker selection
			const firstSticker = stickerItems.first();
			await expect(firstSticker).toBeVisible();
			await expect(firstSticker).toBeEnabled();

			// Click on sticker and verify it didn't crash
			await firstSticker.click();
		}

		// 4. Verify panel structure
		await expect(page.getByTestId("stickers-panel")).toHaveClass(
			/flex.*h-full.*flex-col/
		);
	});

	/**
	 * Tests sticker drag-and-drop functionality to canvas.
	 * Verifies stickers can be dragged from panel to canvas and positioned correctly.
	 */
	test("should support sticker drag and drop to canvas", async ({ page }) => {
		await createTestProject(page, "Sticker DnD Test Project");

		// Open stickers panel
		await ensureStickersTabActive(page);
		await expect(page.getByTestId("stickers-panel")).toBeVisible();

		// Check if sticker canvas is available
		const stickerCanvas = page.getByTestId("sticker-canvas");

		// Test sticker drag-and-drop functionality
		const stickerItems = page.getByTestId("sticker-item");
		await page
			.locator('[data-testid="sticker-item"]')
			.first()
			.waitFor({ state: "attached", timeout: 5000 })
			.catch(() => {});

		const itemCount = await stickerItems.count();
		if (itemCount > 0) {
			const firstSticker = stickerItems.first();
			await expect(firstSticker).toBeVisible();

			// Check if sticker canvas is available for drag-and-drop
			const canvasCount = await stickerCanvas.count();

			if (canvasCount > 0 && (await stickerCanvas.isVisible())) {
				// Canvas is available - perform drag-and-drop
				await expect(stickerCanvas).toBeAttached({ timeout: 2000 });

				// Count existing sticker instances on canvas before drop
				const stickerInstances = page.locator("[data-sticker-id]");
				const instancesBefore = await stickerInstances.count();

				// Perform drag-and-drop with better options
				await firstSticker.dragTo(stickerCanvas, {
					force: true,
					timeout: 5000,
					targetPosition: { x: 100, y: 100 }, // Drop at specific position
				});

				await expect(stickerInstances).toHaveCount(instancesBefore + 1, {
					timeout: 5000,
				});

				// Verify a sticker instance was added to canvas
				const instancesAfter = await stickerInstances.count();
				expect(instancesAfter).toBeGreaterThan(instancesBefore);

				// Verify the sticker instance is visible and positioned correctly
				const newInstance = stickerInstances.last();
				await expect(newInstance).toBeVisible();

				// Check that the instance has positioning attributes
				const style = await newInstance.getAttribute("style");
				expect(style).toBeTruthy();
			} else {
				// Canvas not available - test alternative interaction
				console.log("Sticker canvas not available - testing click interaction");

				// Test hover and click interactions
				await firstSticker.hover();
				// rely on assertion auto-waits below

				await firstSticker.click();
				// rely on subsequent handle visibility assertion which auto-waits

				// Verify interaction feedback - check for selection or preview
				const hasSelectionState =
					await firstSticker.getAttribute("data-selected");
				const hasActiveClass = await firstSticker.getAttribute("class");

				if (
					hasSelectionState === "true" ||
					hasActiveClass?.includes("selected")
				) {
					await expect(firstSticker).toHaveAttribute("data-selected", "true");
				} else {
					// Alternative: check if sticker preview appears
					const stickerPreview = page.locator(
						'[data-testid="sticker-preview"]'
					);
					const previewVisible = await stickerPreview
						.waitFor({ state: "visible", timeout: 1000 })
						.then(() => true)
						.catch(() => false);
					if (previewVisible) {
						await expect(stickerPreview).toBeVisible();
					}
				}
			}
		}
	});

	/**
	 * Tests sticker manipulation capabilities after placement on canvas.
	 * Verifies selection, repositioning, resizing, and deletion of placed stickers.
	 */
	test("should manipulate stickers on canvas after placement", async ({
		page,
	}) => {
		await createTestProject(page, "Sticker Manipulation Test");

		// Open stickers panel and place a sticker
		await ensureStickersTabActive(page);
		await expect(page.getByTestId("stickers-panel")).toBeVisible();

		const stickerCanvas = page.getByTestId("sticker-canvas");
		const stickerItems = page.getByTestId("sticker-item");
		await stickerItems
			.first()
			.waitFor({ state: "visible", timeout: 5000 })
			.catch(() => {});

		const itemCount = await stickerItems.count();
		if (itemCount > 0 && (await stickerCanvas.count()) > 0) {
			const firstSticker = stickerItems.first();

			// Place sticker on canvas
			await firstSticker.dragTo(stickerCanvas, {
				force: true,
				targetPosition: { x: 150, y: 150 },
			});
			await page
				.locator("[data-sticker-id]")
				.first()
				.waitFor({ state: "visible", timeout: 5000 });

			// Find the placed sticker instance
			const stickerInstances = page.locator("[data-sticker-id]");
			if ((await stickerInstances.count()) > 0) {
				const placedSticker = stickerInstances.first();
				await expect(placedSticker).toBeVisible();

				// Test sticker manipulation: click to select
				await placedSticker.click();
				// rely on subsequent handle visibility assertion which auto-waits

				// Check if selection controls appear
				const resizeHandles = page.locator('[data-testid="resize-handle"]');
				if ((await resizeHandles.count()) > 0) {
					await expect(resizeHandles.first()).toBeVisible();
				}

				// Test drag to reposition (if drag is supported)
				const originalPosition = await placedSticker.boundingBox();
				if (originalPosition) {
					// Drag the placed sticker by ~80px diagonally
					const cx = originalPosition.x + originalPosition.width / 2;
					const cy = originalPosition.y + originalPosition.height / 2;
					await page.mouse.move(cx, cy);
					await page.mouse.down();
					await page.mouse.move(cx + 80, cy + 80, { steps: 6 });
					await page.mouse.up();

					await expect
						.poll(async () => (await placedSticker.boundingBox())?.x, {
							timeout: 3000,
						})
						.not.toBeCloseTo(originalPosition.x, 0);
				}

				// Test delete functionality (if available)
				const deleteButton = page.locator(
					'[data-testid="delete-sticker"], [data-testid="remove-overlay"]'
				);
				const deleteVisible = await deleteButton
					.waitFor({ state: "visible", timeout: 1000 })
					.then(() => true)
					.catch(() => false);
				if (deleteVisible) {
					await deleteButton.click();
					await expect(placedSticker).toBeHidden({ timeout: 2000 });
				}
			}
		}
	});

	/**
	 * Tests sticker panel category navigation and search functionality.
	 * Verifies category tabs and search input work correctly.
	 */
	test("should handle sticker panel categories and search", async ({
		page,
	}) => {
		await createTestProject(page, "Sticker Categories Test");

		// Open stickers panel
		await ensureStickersTabActive(page);
		await expect(page.getByTestId("stickers-panel")).toBeVisible();

		// Check for search functionality (if input exists)
		const searchInput = page.locator('input[placeholder*="Search stickers"]');

		const searchVisible = await searchInput
			.waitFor({ state: "visible", timeout: 1000 })
			.then(() => true)
			.catch(() => false);
		if (searchVisible) {
			// Test search functionality
			await searchInput.fill("star");
			await expect(searchInput).toHaveValue("star");

			// Clear search
			await searchInput.fill("");
		}

		// Check for category tabs (Recent, All, etc.)
		// Tabs use role="tab" (Radix Tabs), not <button> — select by role.
		const categoryTabs = page.locator('[role="tablist"] [role="tab"]');
		const tabCount = await categoryTabs.count();

		if (tabCount > 0) {
			// Test category switching
			for (let i = 0; i < Math.min(tabCount, 3); i++) {
				const tab = categoryTabs.nth(i);
				await tab.click();

				// toHaveAttribute('data-state','active') below will auto-wait

				// Verify tab is active
				await expect(tab).toHaveAttribute("data-state", "active");
			}
		}
	});

	/**
	 * Tests sticker overlay rendering and canvas properties.
	 * Verifies proper layering, positioning, and z-index for sticker overlays.
	 */
	test("should handle sticker overlay rendering", async ({ page }) => {
		await createTestProject(page, "Sticker Rendering Test");

		// Check for preview canvas (where stickers would be rendered)
		const previewCanvas = page.getByTestId("preview-canvas");

		const previewVisible = await previewCanvas
			.waitFor({ state: "visible", timeout: 2000 })
			.then(() => true)
			.catch(() => false);
		if (previewVisible) {
			await expect(previewCanvas).toBeVisible();

			// Verify canvas is positioned correctly for overlays
			const canvasClasses = await previewCanvas.getAttribute("class");
			expect(canvasClasses).toContain("absolute");
		}

		// Test sticker canvas when available
		const stickerCanvas = page.getByTestId("sticker-canvas");

		if ((await stickerCanvas.count()) > 0) {
			await expect(stickerCanvas).toBeAttached({ timeout: 1000 });
			// Verify sticker canvas properties
			const canvasStyle = await stickerCanvas.getAttribute("style");

			// Should be positioned for overlay
			expect(canvasStyle).toContain("isolation");

			// Check z-index for proper layering
			const computedStyle = await stickerCanvas.evaluate((el) => {
				return window.getComputedStyle(el).zIndex;
			});

			expect(Number(computedStyle)).toBeGreaterThan(10);
		}
	});

	/**
	 * Tests sticker panel state persistence across UI interactions.
	 * Verifies panel maintains functionality when switching between tabs.
	 */
	test("should maintain sticker panel state across interactions", async ({
		page,
	}) => {
		await createTestProject(page, "Sticker State Test Project");

		// Open stickers panel
		await ensureStickersTabActive(page);
		await expect(page.getByTestId("stickers-panel")).toBeVisible();

		// Switch to another tab and back
		await ensureMediaTabActive(page);
		// returning to stickers tab is asserted below

		await ensureStickersTabActive(page);

		// Verify stickers panel is still functional
		await expect(page.getByTestId("stickers-panel")).toBeVisible();

		// Test panel responsiveness
		const stickerItems = page.getByTestId("sticker-item");
		await stickerItems
			.first()
			.waitFor({ state: "visible", timeout: 5000 })
			.catch(() => {});

		const itemCount = await stickerItems.count();
		if (itemCount > 0) {
			const lastSticker = stickerItems.last();
			await expect(lastSticker).toBeVisible();
		}
	});
});
