/**
 * Visual Regression Testing Helpers
 *
 * Provides assertion-based screenshot comparison using Playwright's
 * built-in toHaveScreenshot(). Builds on screenshot-helper.ts but adds
 * the comparison layer for automated visual regression detection.
 *
 * Baselines are stored alongside test files and committed to git.
 * Run `bun run test:e2e:visual:update` to regenerate baselines.
 *
 * @module test/e2e/utils/visual-regression
 */

import { expect, type Page, type Locator } from "@playwright/test";

/**
 * Assert that the current page matches a baseline screenshot.
 *
 * On first run, creates the baseline. On subsequent runs, compares
 * against it using the maxDiffPixelRatio from playwright.config.ts.
 *
 * @param page - Playwright page instance
 * @param name - Unique screenshot name (e.g., "projects-empty")
 */
export async function assertScreenshot(
	page: Page,
	name: string
): Promise<void> {
	await expect(page).toHaveScreenshot(`${name}.png`, {
		fullPage: false,
	});
}

/**
 * Assert that a specific element matches a baseline screenshot.
 *
 * @param page - Playwright page instance
 * @param selector - CSS selector or data-testid for the element
 * @param name - Unique screenshot name
 */
export async function assertElementScreenshot(
	page: Page,
	selector: string,
	name: string
): Promise<void> {
	const locator: Locator = page.locator(selector);
	await expect(locator).toHaveScreenshot(`${name}.png`);
}
