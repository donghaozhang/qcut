import { describe, expect, it } from "vitest";
import {
	buildStickerTimelineSlots,
	chunkStickerSamples,
	requiredStickerSlotFrameCount,
	STICKER_BATCH_HEAD_GUARD_FRAMES,
	STICKER_BATCH_MAX_GIF_CYCLE_DURATION_SECONDS,
	STICKER_BATCH_PROFILE,
	STICKER_BATCH_TAIL_GUARD_FRAMES,
} from "./sticker-lab-stratified-batch-model";
import type { StratifiedStickerSample } from "./sticker-lab-stratified-samples";

function sample({
	cycleDurationSeconds = 0,
	itemId,
	mimeType,
}: {
	cycleDurationSeconds?: number;
	itemId: string;
	mimeType: "image/gif" | "image/png";
}): StratifiedStickerSample {
	return {
		batchId: "jianying-test-batch",
		byteSize: 1,
		categoryId: itemId,
		categoryLabel: itemId,
		checksumSha256: itemId.padEnd(64, "0"),
		cycleDurationSeconds,
		displayName: itemId,
		frameCount: mimeType === "image/gif" ? 2 : 1,
		frameRate: mimeType === "image/gif" ? 2 : null,
		itemId,
		mimeType,
		sourceKind: mimeType === "image/gif" ? "preview-gif" : "static-image",
	};
}

describe("stratified Sticker Lab batch model", () => {
	it("builds non-equal minimum slots and gives the remainder to the last item", () => {
		const gif = sample({
			cycleDurationSeconds: 0.5,
			itemId: "gif",
			mimeType: "image/gif",
		});
		const png = sample({ itemId: "png", mimeType: "image/png" });
		const lastGif = sample({
			cycleDurationSeconds: 1,
			itemId: "last-gif",
			mimeType: "image/gif",
		});
		const samples = [gif, png, lastGif];
		const slots = buildStickerTimelineSlots({ samples });
		const totalFrames =
			STICKER_BATCH_PROFILE.durationSeconds * STICKER_BATCH_PROFILE.frameRate;

		expect(slots).toHaveLength(samples.length);
		expect(slots[0].startFrame).toBe(0);
		expect(slots.at(-1)?.endFrame).toBe(totalFrames);
		expect(
			slots.map(({ endFrame, startFrame }) => endFrame - startFrame)
		).toEqual([20, 6, 154]);
		expect(
			slots.every(
				(slot, index) =>
					index === 0 || slot.startFrame === slots[index - 1].endFrame
			)
		).toBe(true);
	});

	it("reserves a complete GIF cycle and both timeline guards", () => {
		const gif = sample({
			cycleDurationSeconds: 2.73,
			itemId: "slow-gif",
			mimeType: "image/gif",
		});

		expect(requiredStickerSlotFrameCount({ sample: gif })).toBe(
			Math.ceil(2.73 * STICKER_BATCH_PROFILE.frameRate) +
				STICKER_BATCH_HEAD_GUARD_FRAMES +
				STICKER_BATCH_TAIL_GUARD_FRAMES
		);
	});

	it("splits a batch when required frames exceed the video capacity", () => {
		const slowGifOne = sample({
			cycleDurationSeconds: 2.73,
			itemId: "slow-gif-1",
			mimeType: "image/gif",
		});
		const slowGifTwo = sample({
			cycleDurationSeconds: 2.73,
			itemId: "slow-gif-2",
			mimeType: "image/gif",
		});
		const pngOne = sample({ itemId: "png-1", mimeType: "image/png" });
		const pngTwo = sample({ itemId: "png-2", mimeType: "image/png" });

		const batches = chunkStickerSamples({
			items: [slowGifOne, slowGifTwo, pngOne, pngTwo],
			size: 8,
		});

		expect(batches.map((batch) => batch.map(({ itemId }) => itemId))).toEqual([
			["slow-gif-1", "slow-gif-2", "png-1"],
			["png-2"],
		]);
		for (const batch of batches) {
			const slots = buildStickerTimelineSlots({ samples: batch });
			for (const [index, sticker] of batch.entries()) {
				expect(
					slots[index].endFrame - slots[index].startFrame
				).toBeGreaterThanOrEqual(
					requiredStickerSlotFrameCount({ sample: sticker })
				);
			}
		}
	});

	it("allows a nearly six-second GIF only in a solo batch", () => {
		const gif = sample({
			cycleDurationSeconds: STICKER_BATCH_MAX_GIF_CYCLE_DURATION_SECONDS,
			itemId: "solo-gif",
			mimeType: "image/gif",
		});
		const png = sample({ itemId: "png", mimeType: "image/png" });

		expect(
			chunkStickerSamples({ items: [gif, png], size: 8 }).map((batch) =>
				batch.map(({ itemId }) => itemId)
			)
		).toEqual([["solo-gif"], ["png"]]);
	});

	it("honors the item-count limit when the frame budget has room", () => {
		const pngs = Array.from({ length: 9 }, (_, index) =>
			sample({ itemId: `png-${index}`, mimeType: "image/png" })
		);

		expect(
			chunkStickerSamples({ items: pngs, size: 8 }).map((batch) => batch.length)
		).toEqual([8, 1]);
	});

	it("rejects timeline slots for an unchunked over-capacity batch", () => {
		const gifs = Array.from({ length: 3 }, (_, index) =>
			sample({
				cycleDurationSeconds: 2.73,
				itemId: `gif-${index}`,
				mimeType: "image/gif",
			})
		);

		expect(() => buildStickerTimelineSlots({ samples: gifs })).toThrow(
			"Sticker batch requires 261 frames"
		);
	});

	it("rejects a GIF whose complete cycle cannot fit in six seconds", () => {
		const gif = sample({
			cycleDurationSeconds: 10.8,
			itemId: "oversized-gif",
			mimeType: "image/gif",
		});

		expect(() => chunkStickerSamples({ items: [gif], size: 8 })).toThrow(
			"requires 329 frames for one complete cycle plus guards"
		);
	});
});
