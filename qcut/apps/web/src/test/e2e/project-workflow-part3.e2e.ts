import { test, expect, createTestProject } from "./helpers/electron-helpers";

test.describe("Project Persistence & Export (Subtask 1C)", () => {
	test("should handle project persistence", async ({ page }) => {
		// Setup: Create project and navigate to editor
		await createTestProject(page, "Persistence Test Project");

		// Test project state management
		// Projects are automatically saved in QCut, so we test the persistence layer

		// 1. Verify project is in active state
		const timeline = page.getByTestId("timeline-track");
		await expect(timeline).toBeVisible();

		// 2. Navigate back to projects to test persistence
		await page.evaluate(() => {
			window.location.hash = "#/projects";
		});
		await page.waitForLoadState("networkidle");

		// 3. Verify project appears in project list
		await page.waitForSelector('[data-testid="project-list-item"]');
		const projectItems = page.getByTestId("project-list-item");
		await expect(projectItems.first()).toBeVisible();

		// 4. Test opening project from list
		await projectItems.first().click();

		// 5. Verify we're back in the editor with persisted state
		await page.waitForSelector('[data-testid="timeline-track"]', {
			timeout: 10_000,
		});
		await expect(page.getByTestId("timeline-track")).toBeVisible();
	});

	test("should access export functionality", async ({ page }) => {
		// Setup project with proper state

		await createTestProject(page, "Export Test Project");

		// Ensure timeline is ready for export testing
		await expect(page.getByTestId("timeline-track")).toBeVisible();

		// Test export button accessibility in primary location
		const exportButton = page.getByTestId("export-start-button");
		const exportButtonVisible = await exportButton.isVisible();

		if (exportButtonVisible) {
			// Export button is available - verify it's reachable.
			// Do NOT assert toBeEnabled: an empty project correctly disables the
			// Export action via canExport validation. Reachability is the feature.
			await expect(exportButton).toBeVisible();
		} else {
			// Export functionality may be in a menu or dialog - test alternative access
			const exportMenuTrigger = page
				.locator('[data-testid*="export"], button')
				.filter({ hasText: /export/i })
				.first();

			if (await exportMenuTrigger.isVisible()) {
				await exportMenuTrigger.click();
				// After clicking, the export button should appear
				await expect(exportButton).toBeVisible({ timeout: 5000 });
			} else {
				// If no export UI is found, this is a valid test failure
				throw new Error(
					"Export functionality is not accessible in the current UI state"
				);
			}
		}
	});

	test("should maintain project state across sessions", async ({ page }) => {
		// Test 1: Create project with some state
		await createTestProject(page, "Session Test Project");

		const timeline = page.getByTestId("timeline-track");
		await expect(timeline).toBeVisible();

		// Get the track type for state verification
		const trackType = await timeline.getAttribute("data-track-type");

		// Test 2: Navigate away and back
		await page.evaluate(() => {
			window.location.hash = "#/projects";
		});
		await page.waitForLoadState("networkidle");
		await page.waitForSelector('[data-testid="project-list-item"]');

		// Test 3: Reopen project
		await page.getByTestId("project-list-item").first().click();
		await page.waitForSelector('[data-testid="timeline-track"]');

		// Test 4: Verify state is maintained
		const reopenedTimeline = page.getByTestId("timeline-track");
		await expect(reopenedTimeline).toBeVisible();

		const reopenedTrackType =
			await reopenedTimeline.getAttribute("data-track-type");
		expect(reopenedTrackType).toBe(trackType);
	});

	test("should handle export configuration", async ({ page }) => {
		await createTestProject(page, "Export Config Test Project");

		// Verify timeline is ready for export operations
		await expect(page.getByTestId("timeline-track")).toBeVisible();

		// Test export configuration UI
		const exportButton = page.getByTestId("export-start-button");
		const exportButtonExists = await exportButton.isVisible();

		if (exportButtonExists) {
			// Export button is directly accessible - verify it's reachable.
			// Do NOT assert toBeEnabled: canExport correctly returns false for an
			// empty project, which disables the button — that is correct behavior.
			await expect(exportButton).toBeVisible();

			// Verify export button is properly configured for user interaction
			const buttonText = await exportButton.textContent();
			expect(buttonText).toBeTruthy();
		} else {
			// Export functionality may be behind a menu or different UI pattern
			// Look for export-related UI elements
			const exportTriggers = page
				.locator('[data-testid*="export"], button')
				.filter({ hasText: /export/i });
			const exportTriggerCount = await exportTriggers.count();

			if (exportTriggerCount > 0) {
				// Found export-related UI elements - verify they're functional
				const firstExportTrigger = exportTriggers.first();
				await expect(firstExportTrigger).toBeVisible();
				await expect(firstExportTrigger).toBeEnabled();
			} else {
				// No export UI found - this indicates the export feature may not be implemented
				// The test should fail to highlight missing functionality
				throw new Error(
					"Export configuration UI is not accessible - feature may not be implemented"
				);
			}
		}
	});
});
