/**
 * Panel navigation and media import helpers for E2E tests.
 */

import { Page } from "@playwright/test";
import { resolve as pathResolve } from "path";

const mediaPath = (file: string) =>
	pathResolve(process.cwd(), "apps/web/src/test/e2e/fixtures/media", file);

/**
 * Ensures the Library group and Media tab are active in the media panel.
 */
export async function ensureMediaTabActive(page: Page) {
	const libraryGroup = page.locator('[data-testid="group-media"]');
	if ((await libraryGroup.count()) > 0) {
		await libraryGroup.click();
		await page.waitForTimeout(300);
	}
	const mediaTab = page.locator('[data-testid="media-panel-tab"]');
	if ((await mediaTab.count()) > 0) {
		await mediaTab.click();
		await page.waitForTimeout(300);
	}
	await page.waitForSelector('[data-testid="import-media-button"]', {
		timeout: 5000,
	});
}

/**
 * Ensures the specified panel tab is active by clicking its group and tab.
 * @param page - The Playwright page instance
 * @param groupKey - The group key (e.g., 'media', 'edit', 'ai-create', 'agents')
 * @param tabKey - The tab key (e.g., 'text', 'stickers', 'pty', 'remotion')
 */
export async function ensurePanelTabActive(
	page: Page,
	groupKey: string,
	tabKey: string,
	subgroupLabel?: string
) {
	const groupButton = page.locator(`[data-testid="group-${groupKey}"]`);
	if ((await groupButton.count()) > 0) {
		await groupButton.click();
	}
	if (subgroupLabel) {
		const subgroupButton = page.locator(`button:has-text("${subgroupLabel}")`);
		if ((await subgroupButton.count()) > 0) {
			await subgroupButton.click();
		}
	}
	const tab = page.locator(`[data-testid="${tabKey}-panel-tab"]`);
	if ((await tab.count()) > 0) {
		await tab.click();
	}
}

/** Navigate to the text panel (Edit > Manual Edit > Text). */
export async function ensureTextTabActive(page: Page) {
	await ensurePanelTabActive(page, "edit", "text", "Manual Edit");
	await page.waitForSelector('[data-testid="text-panel"]', { timeout: 5000 });
}

/** Navigate to the stickers panel (Edit > Manual Edit > Stickers). */
export async function ensureStickersTabActive(page: Page) {
	await ensurePanelTabActive(page, "edit", "stickers", "Manual Edit");
	await page.waitForSelector('[data-testid="stickers-panel"]', {
		timeout: 5000,
	});
}

/**
 * Uploads test media file through the import media interface.
 */
export async function uploadTestMedia(page: Page, filePath: string) {
	await ensureMediaTabActive(page);

	const mediaItems = page.locator('[data-testid="media-item"]');
	const initialCount = await mediaItems.count();

	await page.getByTestId("import-media-button").click();

	const fileInput = page.locator('input[type="file"]');
	await fileInput.setInputFiles(filePath);

	await page.waitForFunction(
		(expectedCount) => {
			const items = document.querySelectorAll('[data-testid="media-item"]');
			return items.length > expectedCount;
		},
		initialCount,
		{ timeout: 15_000 }
	);
}

/** Imports the standard test video file (sample-video.mp4). */
export async function importTestVideo(page: Page) {
	await uploadTestMedia(page, mediaPath("sample-video.mp4"));
}

/** Imports the standard test audio file (sample-audio.mp3). */
export async function importTestAudio(page: Page) {
	await uploadTestMedia(page, mediaPath("sample-audio.mp3"));
}

/** Imports the standard test image file (sample-image.png). */
export async function importTestImage(page: Page) {
	await uploadTestMedia(page, mediaPath("sample-image.png"));
}

/**
 * Adds a sticker from the sticker panel to the canvas overlay.
 */
export async function addStickerToCanvas(
	page: Page,
	options?: {
		position?: { x: number; y: number };
		waitForRender?: boolean;
	}
): Promise<boolean> {
	try {
		// Mock Iconify API so sticker items load without network access.
		const MOCK_SVG =
			'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>';
		const MOCK_COLLECTIONS = JSON.stringify({
			"simple-icons": {
				prefix: "simple-icons",
				name: "Simple Icons",
				total: 20,
			},
			tabler: { prefix: "tabler", name: "Tabler Icons", total: 20 },
		});

		for (const host of [
			"https://api.iconify.design",
			"https://api.simplesvg.com",
			"https://api.unisvg.com",
		]) {
			await page.route(`${host}/**`, (route) => {
				const url = route.request().url();
				if (url.includes(".svg")) {
					route.fulfill({
						status: 200,
						contentType: "image/svg+xml",
						body: MOCK_SVG,
					});
				} else {
					route.fulfill({
						status: 200,
						contentType: "application/json",
						body: MOCK_COLLECTIONS,
					});
				}
			});
		}

		const editGroup = page.locator('[data-testid="group-edit"]');
		await editGroup
			.waitFor({ state: "attached", timeout: 10_000 })
			.catch(() => {
				console.warn("Edit group tab not attached");
				return null;
			});

		if ((await editGroup.count()) === 0) {
			console.warn("Edit group tab not found");
			return false;
		}

		await editGroup.click({ force: true });
		await page.waitForTimeout(300);

		const stickerTab = page.locator('[data-testid="stickers-panel-tab"]');
		await stickerTab.waitFor({ state: "attached", timeout: 5000 }).catch(() => {
			console.warn("Stickers panel tab not attached");
			return null;
		});

		if ((await stickerTab.count()) === 0) {
			console.warn(
				"Stickers panel tab not found - stickers feature may not be available"
			);
			return false;
		}

		await stickerTab.click({ force: true });

		const stickersPanel = page.locator('[data-testid="stickers-panel"]');
		await stickersPanel
			.waitFor({ state: "visible", timeout: 5000 })
			.catch(() => {
				console.warn("Stickers panel did not become visible");
			});

		const stickerItems = page.locator('[data-testid="sticker-item"]');

		const panelHtml = await page
			.locator('[data-testid="stickers-panel"]')
			.innerHTML()
			.catch(() => "panel not found");
		console.log(
			`[addStickerToCanvas] Panel HTML length: ${panelHtml.length}, first 200: ${panelHtml.substring(0, 200)}`
		);

		await stickerItems
			.first()
			.waitFor({ state: "visible", timeout: 15_000 })
			.catch(() => null);

		const itemCount = await stickerItems.count();
		if (itemCount === 0) {
			console.warn(
				"No sticker items found in panel - Iconify API may be unreachable"
			);
			return false;
		}
		console.log(`[addStickerToCanvas] Found ${itemCount} sticker items`);

		await stickerItems.first().click({ force: true });

		await page.waitForTimeout(2000);

		await page.waitForFunction(
			() => (window as any).stickerTestReady instanceof Promise,
			{ timeout: 5000 }
		);
		await page.evaluate(() => (window as any).stickerTestReady);

		const added = await page.evaluate(async () => {
			const stickerTest = (window as any).stickerTest;
			if (!stickerTest?.getStores) {
				console.error("[addStickerToCanvas] window.stickerTest not available");
				return false;
			}

			const stores = stickerTest.getStores();
			if (!stores?.media?.mediaItems || !stores?.stickers?.addOverlaySticker) {
				console.error("[addStickerToCanvas] stores not ready");
				return false;
			}

			const imageItems = stores.media.mediaItems.filter(
				(item: any) => item.type === "image"
			);
			if (imageItems.length === 0) {
				console.error("[addStickerToCanvas] no image media items found");
				return false;
			}

			const latestImage = imageItems[imageItems.length - 1];
			console.log(
				`[addStickerToCanvas] Adding overlay sticker for media: ${latestImage.name} (${latestImage.id})`
			);

			await stores.stickers.addOverlaySticker(latestImage.id);
			return true;
		});

		if (!added) {
			console.warn(
				"Could not add sticker to overlay via store - stores may not be exposed"
			);
			return false;
		}

		await page
			.locator("[data-sticker-id]")
			.first()
			.waitFor({ state: "visible", timeout: 10_000 });

		if (options?.waitForRender) {
			await page.waitForTimeout(500);
		}

		return true;
	} catch (error) {
		console.error("Failed to add sticker to canvas:", error);
		return false;
	}
}
