import { expect, type Page } from "@playwright/test";
import { ensureStickersTabActive } from "./electron-helpers";
import { updateStickerWithCli } from "./sticker-lab-cli-reference-commands";
import {
	type AddedStratifiedSticker,
	buildStickerTimelineSlots,
	mapSequentially,
	STICKER_BATCH_GEOMETRY,
} from "./sticker-lab-stratified-batch-model";
import type { StratifiedStickerSample } from "./sticker-lab-stratified-samples";
import {
	readRestrictedState,
	seekTimeline,
} from "./sticker-lab-lifecycle-harness";
import { waitForStickerCount } from "./sticker-lab-restricted-state-wait";

async function ensureStickerLabOpen({ page }: { page: Page }): Promise<void> {
	await ensureStickersTabActive(page);
	const entry = page.getByTestId("sticker-reference-lab-entry");
	await expect(entry).toBeVisible({ timeout: 60_000 });
	const button = entry.getByRole("button", { name: "贴纸实验室" });
	const active = (await button.getAttribute("aria-pressed")) === "true";
	const expanded = (await button.getAttribute("aria-expanded")) === "true";
	if (!(active && expanded)) await button.click();
}

async function assertPreviewDecoded({
	page,
	sample,
}: {
	page: Page;
	sample: StratifiedStickerSample;
}): Promise<void> {
	const image = page
		.locator(`[data-sticker-reference-id="${sample.itemId}"]`)
		.getByRole("img", { exact: true, name: sample.displayName });
	await expect(image).toBeVisible();
	await expect
		.poll(() =>
			image.evaluate(async (element) => {
				const preview = element as HTMLImageElement;
				await preview.decode();
				return (
					preview.complete &&
					preview.naturalHeight > 0 &&
					preview.naturalWidth > 0
				);
			})
		)
		.toBe(true);
}

export async function addStickerLabUiBatch({
	apiPort,
	page,
	projectId,
	samples,
}: {
	apiPort: number;
	page: Page;
	projectId: string;
	samples: StratifiedStickerSample[];
}): Promise<AddedStratifiedSticker[]> {
	await ensureStickerLabOpen({ page });
	const slots = buildStickerTimelineSlots({ samples });
	return mapSequentially({
		items: samples,
		worker: async ({ index, item: sample }) => {
			const slot = slots[index];
			await page
				.getByTestId(`sticker-lab-category-private-${sample.categoryId}`)
				.click();
			const referenceItem = page.locator(
				`[data-sticker-reference-id="${sample.itemId}"]`
			);
			await referenceItem.scrollIntoViewIfNeeded();
			await expect(referenceItem).toBeEnabled({ timeout: 30_000 });
			await expect(referenceItem).toHaveAccessibleName(
				`添加${sample.displayName}到时间线`
			);
			await assertPreviewDecoded({ page, sample });
			const before = await readRestrictedState({ page });
			await seekTimeline({ page, time: slot.startTime });
			await referenceItem.click();
			await waitForStickerCount({ count: before.stickers.length + 1, page });
			const after = await readRestrictedState({ page });
			const added = after.stickers.find(
				({ id }) => !before.stickers.some((sticker) => sticker.id === id)
			);
			if (!added) throw new Error(`UI did not add sticker ${sample.itemId}`);
			await updateStickerWithCli({
				apiPort,
				elementId: added.id,
				endTime: slot.endTime,
				geometry: STICKER_BATCH_GEOMETRY,
				projectId,
				startTime: slot.startTime,
			});
			return { elementId: added.id, sample, slot, trigger: "ui" as const };
		},
	});
}
