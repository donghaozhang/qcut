import type { StratifiedStickerTimelineItem } from "./sticker-lab-stratified-batch-evidence";
import {
	type AddedStratifiedSticker,
	STICKER_BATCH_CANVAS_SIZE,
} from "./sticker-lab-stratified-batch-model";
import type { RestrictedState } from "./sticker-lab-lifecycle-harness";
import { resolveStickerGeometry } from "../../../lib/stickers/sticker-geometry";

function closeTo({
	actual,
	expected,
}: {
	actual: number;
	expected: number;
}): boolean {
	return Math.abs(actual - expected) <= 0.000_001;
}

export function resolveNormalizedStickerEvidenceRegion({
	canvasSize,
	geometry,
}: {
	canvasSize: { height: number; width: number };
	geometry: { height: number; width: number; x: number; y: number };
}): StratifiedStickerTimelineItem["region"] {
	if (
		!Number.isFinite(canvasSize.width) ||
		!Number.isFinite(canvasSize.height) ||
		canvasSize.width <= 0 ||
		canvasSize.height <= 0
	) {
		throw new Error("Sticker evidence canvas dimensions must be positive");
	}
	const resolved = resolveStickerGeometry({
		canvasHeight: canvasSize.height,
		canvasWidth: canvasSize.width,
		position: { x: geometry.x, y: geometry.y },
		size: { height: geometry.height, width: geometry.width },
	});
	return {
		height: resolved.pixelHeight / canvasSize.height,
		width: resolved.pixelWidth / canvasSize.width,
		x: resolved.left / canvasSize.width,
		y: resolved.top / canvasSize.height,
	};
}

export function readStratifiedTimelineItem({
	added,
	state,
}: {
	added: AddedStratifiedSticker;
	state: RestrictedState;
}): StratifiedStickerTimelineItem {
	const sticker = state.stickers.find(({ id }) => id === added.elementId);
	if (!sticker) {
		throw new Error(`Timeline sticker ${added.elementId} is missing`);
	}
	const media = state.allMedia.find(({ id }) => id === sticker.mediaId);
	if (!media) {
		throw new Error(`Sticker media ${sticker.mediaId ?? "unknown"} is missing`);
	}
	const { sample, slot } = added;
	if (
		media.byteSize !== sample.byteSize ||
		media.metadata.batchId !== sample.batchId ||
		media.metadata.checksumSha256 !== sample.checksumSha256 ||
		media.metadata.itemId !== sample.itemId ||
		media.metadata.redistribution !== "prohibited" ||
		media.metadata.referenceOnly !== true ||
		media.metadata.source !== "sticker-lab" ||
		media.metadata.usage !== "internal-reference-only"
	) {
		throw new Error(`Sticker ${sample.itemId} media provenance is incomplete`);
	}
	if (media.metadata.animatedSticker !== (sample.mimeType === "image/gif")) {
		throw new Error(`Sticker ${sample.itemId} animation metadata is incorrect`);
	}
	if (sample.mimeType === "image/gif") {
		const runtime = media.metadata.stickerRuntime;
		if (!(runtime && typeof runtime === "object")) {
			throw new Error(`GIF ${sample.itemId} has no runtime descriptor`);
		}
		const frames = (runtime as Record<string, unknown>).frames;
		if (!Array.isArray(frames) || frames.length !== sample.frameCount) {
			throw new Error(`GIF ${sample.itemId} runtime frame count is incorrect`);
		}
	}
	const expectedStickerAssetId = `sticker-lab:${sample.batchId}:${sample.itemId}`;
	if (
		(added.trigger === "cli" &&
			sticker.stickerAssetId !== expectedStickerAssetId) ||
		!closeTo({ actual: sticker.startTime, expected: slot.startTime }) ||
		!closeTo({
			actual: sticker.duration,
			expected: slot.endTime - slot.startTime,
		}) ||
		sticker.opacity !== 1
	) {
		throw new Error(
			`Sticker ${sample.itemId} timeline state is incorrect: ${JSON.stringify({
				actual: {
					duration: sticker.duration,
					opacity: sticker.opacity,
					startTime: sticker.startTime,
					stickerAssetId: sticker.stickerAssetId,
				},
				expected: {
					duration: slot.endTime - slot.startTime,
					opacity: 1,
					startTime: slot.startTime,
					stickerAssetId:
						added.trigger === "cli" ? expectedStickerAssetId : "not required",
				},
			})}`
		);
	}
	const { height, width, x, y } = sticker;
	if (
		typeof height !== "number" ||
		typeof width !== "number" ||
		typeof x !== "number" ||
		typeof y !== "number"
	) {
		throw new Error(`Sticker ${sample.itemId} geometry is incomplete`);
	}
	return {
		elementId: added.elementId,
		endFrame: slot.endFrame,
		region: resolveNormalizedStickerEvidenceRegion({
			canvasSize: STICKER_BATCH_CANVAS_SIZE,
			geometry: { height, width, x, y },
		}),
		sample,
		startFrame: slot.startFrame,
	};
}
