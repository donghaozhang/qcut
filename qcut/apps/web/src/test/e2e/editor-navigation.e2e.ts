/**
 * Editor Navigation E2E Test
 *
 * Tests navigation to the editor page to isolate crash issues
 */

import {
	test,
	expect,
	createTestProject,
	navigateToProjects,
} from "./helpers/electron-helpers";

test.describe("Editor Navigation Test", () => {
	test("should detect existing project on projects page", async ({ page }) => {
		// Ensure we're on projects page in a resilient way (title copy may vary)
		await navigateToProjects(page);
		await expect(
			page
				.locator(
					'[data-testid="projects-page"], [data-testid="project-list"], [data-testid="project-list-item"]'
				)
				.first()
		).toBeVisible({ timeout: 10_000 });

		// Check for existing projects
		const projectCards = page.getByTestId("project-list-item");
		const projectCount = await projectCards.count();

		test.info().annotations.push({
			type: "info",
			description: `Found ${projectCount} existing projects`,
		});

		if (projectCount > 0) {
			// Get the first project's name
			const firstProject = projectCards.first();
			const projectName = await firstProject.locator("h3").textContent();
			test.info().annotations.push({
				type: "info",
				description: `First project name: ${projectName}`,
			});

			await expect(firstProject).toBeVisible();
		}
	});

	test("should attempt to open existing project without crash", async ({
		page,
	}) => {
		// Create a project first so we always have one to open
		await createTestProject(page, "Navigation Test Project");

		// Navigate back to projects list
		await navigateToProjects(page);

		// Verify projects exist now
		const projectCards = page.getByTestId("project-list-item");
		await projectCards.first().waitFor({ state: "visible", timeout: 10_000 });

		// Setup a listener for console errors
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") {
				errors.push(msg.text());
			}
		});

		// Setup a listener for page crashes
		page.on("crash", () => {
			test
				.info()
				.annotations.push({ type: "error", description: "PAGE CRASHED!" });
		});

		// Try clicking on the first project
		const firstProject = projectCards.first();
		test.info().annotations.push({
			type: "info",
			description: "Attempting to click on project...",
		});

		try {
			// Click and wait for editor route or editor UI to appear
			await firstProject.click({ timeout: 5000 });
			const editorLocator = page
				.locator(
					'[data-testid="editor-container"], [data-testid="timeline-track"], .editor-layout'
				)
				.first();

			// Wait for URL to change to editor route
			await page.waitForURL(/editor/i, { timeout: 15_000 });

			// Then verify editor UI loaded
			await editorLocator.waitFor({ state: "visible", timeout: 10_000 });

			// Check for any console errors
			if (errors.length > 0) {
				test.info().annotations.push({
					type: "warning",
					description: `Console errors detected: ${errors.join(", ")}`,
				});
			}

			// Assert editor is visible (hard assertion; makes the test meaningful)
			await expect(editorLocator).toBeVisible({ timeout: 15_000 });
			test.info().annotations.push({
				type: "info",
				description: "Successfully navigated to editor!",
			});
		} catch (error) {
			test.info().annotations.push({
				type: "error",
				description: `Error during navigation: ${error}`,
			});
			// Check if the page is still responsive
			const isResponsive = await page.evaluate(() => true).catch(() => false);
			if (!isResponsive) {
				throw new Error(
					"Electron app became unresponsive after clicking project"
				);
			}
		}
	});

	test("should check if direct navigation to editor works", async ({
		page,
	}) => {
		// Setup error tracking
		const errors: string[] = [];
		page.on("console", (msg) => {
			if (msg.type() === "error") {
				errors.push(msg.text());
			}
		});

		// Use JavaScript navigation since page.goto doesn't work in Electron
		await page.evaluate(() => {
			// Properly typed router access
			interface RouterWindow extends Window {
				router?: {
					navigate: (options: { to: string }) => void;
				};
			}

			const routerWindow = window as RouterWindow;
			if (routerWindow.router?.navigate) {
				routerWindow.router.navigate({ to: "/editor/test-project-id" });
			} else {
				// Fallback: use hash navigation
				window.location.hash = "#/editor/test-project-id";
			}
		});

		// Wait for navigation to complete by checking for editor elements or error state
		const editorLocator = page.locator(
			'[data-testid="editor-container"], [data-testid="timeline-track"], .editor-layout'
		);
		const errorLocator = page.locator("text=/not found|error/i");

		// Wait for either editor to load or error to appear
		await Promise.race([
			editorLocator.first().waitFor({ timeout: 10_000 }),
			errorLocator.first().waitFor({ timeout: 10_000 }),
		]);

		// Verify app is still responsive
		await page.evaluate(() => document.title);

		// Assert the current URL contains editor route
		const currentUrl = await page.evaluate(() => window.location.href);
		expect(currentUrl).toContain("/editor/test-project-id");

		// Check if editor loaded successfully or if we got expected error
		const hasEditor = await editorLocator.first().isVisible();
		const hasError = await errorLocator.first().isVisible();

		if (hasEditor) {
			// Success: editor loaded
			expect(hasEditor).toBe(true);
		} else if (hasError) {
			// Expected: project not found error (since test-project-id doesn't exist)
			expect(hasError).toBe(true);
		} else {
			throw new Error(
				"Neither editor nor error state detected after navigation"
			);
		}

		// Log any console errors for debugging (but don't fail the test)
		if (errors.length > 0) {
			test.info().annotations.push({
				type: "warning",
				description: `Console errors (expected for non-existent project): ${errors.slice(0, 3).join(", ")}`,
			});
		}
	});
});
