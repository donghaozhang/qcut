import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { ensureMediaTabActive } from "./e2e-panel-helpers";
import {
	portraitAuditFixturePath,
	type PortraitAuditFixture,
} from "./portrait-audit-fixtures";

interface ThumbnailMediaItem {
	thumbnailUrl?: string;
}

interface ThumbnailWindow extends Window {
	__mediaStore: {
		getState: () => { mediaItems: ThumbnailMediaItem[] };
	};
}

export async function importPortraitAuditFixtures({
	page,
	fixtures,
}: {
	page: Page;
	fixtures: PortraitAuditFixture[];
}) {
	await ensureMediaTabActive(page);
	await page.getByTestId("import-media-button").click();
	await page
		.locator('input[type="file"]')
		.setInputFiles(
			fixtures.map((fixture) => portraitAuditFixturePath({ fixture }))
		);
	await expect(page.getByTestId("media-item")).toHaveCount(fixtures.length, {
		timeout: 60_000,
	});
	await expect
		.poll(
			() =>
				page.evaluate(() =>
					(window as ThumbnailWindow).__mediaStore
						.getState()
						.mediaItems.every(
							(item) => item.thumbnailUrl?.startsWith("data:image/") === true
						)
				),
			{ timeout: 60_000 }
		)
		.toBe(true);
}
