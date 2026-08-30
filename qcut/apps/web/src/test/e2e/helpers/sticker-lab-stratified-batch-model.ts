import type { StickerLabCliGeometry } from "./sticker-lab-cli-reference-commands";
import { REAL_VIDEO_PROFILE } from "./sticker-lab-cli-cache-lifecycle";
import type { StratifiedStickerSample } from "./sticker-lab-stratified-samples";

export const STICKER_BATCH_PROFILE = REAL_VIDEO_PROFILE;
export const STICKER_BATCH_CANVAS_SIZE = { height: 1080, width: 1920 } as const;
const STICKER_BATCH_TOTAL_FRAMES = Math.round(
	STICKER_BATCH_PROFILE.durationSeconds * STICKER_BATCH_PROFILE.frameRate
);
export const STICKER_BATCH_HEAD_GUARD_FRAMES = 2;
export const STICKER_BATCH_TAIL_GUARD_FRAMES = 3;
export const STICKER_BATCH_MAX_GIF_CYCLE_DURATION_SECONDS =
	(STICKER_BATCH_TOTAL_FRAMES -
		STICKER_BATCH_HEAD_GUARD_FRAMES -
		STICKER_BATCH_TAIL_GUARD_FRAMES) /
	STICKER_BATCH_PROFILE.frameRate;
export const STICKER_BATCH_GEOMETRY: StickerLabCliGeometry = {
	height: 500,
	width: 500,
	x: 710,
	y: 290,
};

export interface StickerBatchTimelineSlot {
	endFrame: number;
	endTime: number;
	startFrame: number;
	startTime: number;
}

export interface AddedStratifiedSticker {
	elementId: string;
	sample: StratifiedStickerSample;
	slot: StickerBatchTimelineSlot;
	trigger: "cli" | "ui";
}

export async function mapSequentially<T, R>({
	index = 0,
	items,
	results = [],
	worker,
}: {
	index?: number;
	items: T[];
	results?: R[];
	worker: (options: { index: number; item: T }) => Promise<R>;
}): Promise<R[]> {
	if (index >= items.length) return results;
	const result = await worker({ index, item: items[index] });
	return mapSequentially({
		index: index + 1,
		items,
		results: [...results, result],
		worker,
	});
}

export function requiredStickerSlotFrameCount({
	sample,
}: {
	sample: StratifiedStickerSample;
}): number {
	const guardFrames =
		STICKER_BATCH_HEAD_GUARD_FRAMES + STICKER_BATCH_TAIL_GUARD_FRAMES;
	if (sample.mimeType === "image/png") return guardFrames + 1;
	if (
		!Number.isFinite(sample.cycleDurationSeconds) ||
		sample.cycleDurationSeconds <= 0
	) {
		throw new Error(
			`Sticker ${sample.itemId} has an invalid GIF cycle duration`
		);
	}
	return (
		Math.ceil(sample.cycleDurationSeconds * STICKER_BATCH_PROFILE.frameRate) +
		guardFrames
	);
}

function batchFitsTimeline({
	items,
}: {
	items: StratifiedStickerSample[];
}): boolean {
	const requiredFrames = items.reduce(
		(total, sample) => total + requiredStickerSlotFrameCount({ sample }),
		0
	);
	return requiredFrames <= STICKER_BATCH_TOTAL_FRAMES;
}

function assertStickerFitsVideo({
	sample,
}: {
	sample: StratifiedStickerSample;
}): void {
	const requiredFrames = requiredStickerSlotFrameCount({ sample });
	const availableFrames = STICKER_BATCH_TOTAL_FRAMES;
	if (requiredFrames <= availableFrames) return;
	throw new Error(
		`Sticker ${sample.itemId} requires ${requiredFrames} frames for one complete cycle plus guards, but the ${STICKER_BATCH_PROFILE.durationSeconds}s video has ${availableFrames}`
	);
}

export function chunkStickerSamples({
	items,
	size,
}: {
	items: StratifiedStickerSample[];
	size: number;
}): StratifiedStickerSample[][] {
	if (!Number.isInteger(size) || size <= 0) {
		throw new Error("Sticker batch size must be a positive integer");
	}
	const batches: StratifiedStickerSample[][] = [];
	let currentBatch: StratifiedStickerSample[] = [];
	for (const sample of items) {
		assertStickerFitsVideo({ sample });
		const candidate = [...currentBatch, sample];
		const exceedsItemLimit = candidate.length > size;
		if (
			currentBatch.length > 0 &&
			(exceedsItemLimit || !batchFitsTimeline({ items: candidate }))
		) {
			batches.push(currentBatch);
			currentBatch = [sample];
			continue;
		}
		currentBatch = candidate;
	}
	if (currentBatch.length > 0) batches.push(currentBatch);
	return batches;
}

export function buildStickerTimelineSlots({
	samples,
}: {
	samples: StratifiedStickerSample[];
}): StickerBatchTimelineSlot[] {
	const totalFrames = STICKER_BATCH_TOTAL_FRAMES;
	const minimumFrameCounts = samples.map((sample) => {
		assertStickerFitsVideo({ sample });
		return requiredStickerSlotFrameCount({ sample });
	});
	const requiredFrames = minimumFrameCounts.reduce(
		(total, frameCount) => total + frameCount,
		0
	);
	if (requiredFrames > totalFrames) {
		throw new Error(
			`Sticker batch requires ${requiredFrames} frames, but the ${STICKER_BATCH_PROFILE.durationSeconds}s video has ${totalFrames}`
		);
	}
	const slots: StickerBatchTimelineSlot[] = [];
	let startFrame = 0;
	for (const [index, minimumFrameCount] of minimumFrameCounts.entries()) {
		const isLastSlot = index === minimumFrameCounts.length - 1;
		const endFrame = isLastSlot ? totalFrames : startFrame + minimumFrameCount;
		slots.push({
			endFrame,
			endTime: endFrame / STICKER_BATCH_PROFILE.frameRate,
			startFrame,
			startTime: startFrame / STICKER_BATCH_PROFILE.frameRate,
		});
		startFrame = endFrame;
	}
	return slots;
}
