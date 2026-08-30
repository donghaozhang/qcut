import { expect, type Page } from "@playwright/test";
import { readRestrictedState } from "./sticker-lab-lifecycle-harness";

export async function waitForStickerCount({
	count,
	page,
}: {
	count: number;
	page: Page;
}): Promise<void> {
	await expect
		.poll(async () => (await readRestrictedState({ page })).stickers.length, {
			intervals: [100, 250, 500],
			timeout: 30_000,
		})
		.toBe(count);
}
