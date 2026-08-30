import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
	evaluateStickerRuntime,
	parseDirectGifRuntimeDescriptor,
	type DirectGifRuntimeDescriptor,
} from "@qcut/editor-core/sticker-lab";
import type { LocalStickerLabMimeType } from "../../../../../../electron/preload-types/api-types/sticker-lab-api";
import { getFFmpegPath } from "../../../../../../electron/ffmpeg/paths";
import {
	type NormalizedFrameRegion,
	runStickerVideoEvidenceBinary,
} from "./sticker-lab-real-video-evidence";
import type { StratifiedStickerSample } from "./sticker-lab-stratified-samples";

export const STICKER_SOURCE_MATCH_FRAME_SIZE = {
	height: 360,
	width: 640,
} as const;
export const STICKER_SOURCE_VISIBLE_ALPHA_THRESHOLD = 16;

export interface StratifiedStickerSourceReference {
	bytes: Uint8Array;
	checksumSha256: string;
	mimeType: LocalStickerLabMimeType;
}

export interface StickerSourceFrameSelection {
	outputFrame: number;
	sourceFrameHash: string;
	sourceFrameIndex: number;
}

export interface PreparedStickerSource {
	descriptor: DirectGifRuntimeDescriptor | null;
	frameHashes: string[];
	frames: Buffer[];
	item: StratifiedStickerTimelineSource;
	pixelRect: StickerEvidencePixelRect;
}

export interface StratifiedStickerTimelineSource {
	endFrame: number;
	region: NormalizedFrameRegion;
	sample: StratifiedStickerSample;
	startFrame: number;
}

export interface StickerEvidencePixelRect {
	height: number;
	left: number;
	top: number;
	width: number;
}

function evidencePixelRect({
	region,
}: {
	region: NormalizedFrameRegion;
}): StickerEvidencePixelRect {
	const frameWidth = STICKER_SOURCE_MATCH_FRAME_SIZE.width;
	const frameHeight = STICKER_SOURCE_MATCH_FRAME_SIZE.height;
	const width = Math.max(1, Math.round(region.width * frameWidth));
	const height = Math.max(1, Math.round(region.height * frameHeight));
	const left = Math.round(region.x * frameWidth);
	const top = Math.round(region.y * frameHeight);
	if (
		left < 0 ||
		top < 0 ||
		left + width > frameWidth ||
		top + height > frameHeight
	) {
		throw new Error("Sticker source evidence rectangle leaves the video frame");
	}
	return { height, left, top, width };
}

function sourceFrameHash({ frame }: { frame: Buffer }): string {
	const visiblePixels = Buffer.allocUnsafe(frame.byteLength);
	for (let offset = 0; offset < frame.byteLength; offset += 4) {
		const alpha = frame[offset + 3];
		for (let channel = 0; channel < 3; channel += 1) {
			visiblePixels[offset + channel] = Math.round(
				(frame[offset + channel] * alpha) / 255
			);
		}
		visiblePixels[offset + 3] = alpha;
	}
	return createHash("sha256").update(visiblePixels).digest("hex");
}

async function decodeSourceFrames({
	filePath,
	mimeType,
	pixelRect,
}: {
	filePath: string;
	mimeType: LocalStickerLabMimeType;
	pixelRect: StickerEvidencePixelRect;
}): Promise<Buffer[]> {
	const pixels = await runStickerVideoEvidenceBinary({
		args: [
			"-v",
			"error",
			"-i",
			filePath,
			"-vf",
			`scale=${pixelRect.width}:${pixelRect.height}:force_original_aspect_ratio=decrease:flags=bicubic,pad=${pixelRect.width}:${pixelRect.height}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`,
			...(mimeType === "image/gif" ? ["-fps_mode", "passthrough"] : []),
			"-pix_fmt",
			"rgba",
			"-f",
			"rawvideo",
			"-",
		],
		binaryPath: getFFmpegPath(),
	});
	const frameByteSize = pixelRect.width * pixelRect.height * 4;
	if (pixels.byteLength === 0 || pixels.byteLength % frameByteSize !== 0) {
		throw new Error(
			`Decoded Sticker Lab source has ${pixels.byteLength} bytes for ${frameByteSize}-byte frames`
		);
	}
	return Array.from({ length: pixels.byteLength / frameByteSize }, (_, index) =>
		pixels.subarray(index * frameByteSize, (index + 1) * frameByteSize)
	);
}

async function prepareStickerSource({
	item,
	reference,
	temporaryDirectory,
}: {
	item: StratifiedStickerTimelineSource;
	reference: StratifiedStickerSourceReference;
	temporaryDirectory: string;
}): Promise<PreparedStickerSource> {
	const { sample } = item;
	if (
		reference.mimeType !== sample.mimeType ||
		reference.checksumSha256 !== sample.checksumSha256
	) {
		throw new Error(`Sticker ${sample.itemId} source provenance is incorrect`);
	}
	const bytes = Buffer.from(reference.bytes);
	const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
	if (checksumSha256 !== sample.checksumSha256) {
		throw new Error(`Sticker ${sample.itemId} source bytes failed SHA-256`);
	}
	const descriptor =
		sample.mimeType === "image/gif"
			? parseDirectGifRuntimeDescriptor({ bytes })
			: null;
	const extension = sample.mimeType === "image/gif" ? "gif" : "png";
	const sourcePath = path.join(
		temporaryDirectory,
		`${sample.itemId}.${extension}`
	);
	await writeFile(sourcePath, bytes, { flag: "wx", mode: 0o600 });
	const pixelRect = evidencePixelRect({ region: item.region });
	const frames = await decodeSourceFrames({
		filePath: sourcePath,
		mimeType: sample.mimeType,
		pixelRect,
	});
	const expectedFrameCount = descriptor?.frames.length ?? 1;
	if (
		frames.length !== expectedFrameCount ||
		expectedFrameCount !== sample.frameCount
	) {
		throw new Error(
			`Sticker ${sample.itemId} decoded ${frames.length} source frames, expected ${sample.frameCount}`
		);
	}
	return {
		descriptor,
		frameHashes: frames.map((frame) => sourceFrameHash({ frame })),
		frames,
		item,
		pixelRect,
	};
}

export async function prepareStickerSources({
	items,
	sourceReferences,
	temporaryDirectory,
}: {
	items: StratifiedStickerTimelineSource[];
	sourceReferences: ReadonlyMap<string, StratifiedStickerSourceReference>;
	temporaryDirectory: string;
}): Promise<Map<string, PreparedStickerSource>> {
	const prepared = await Promise.all(
		items.map(async (item) => {
			const reference = sourceReferences.get(item.sample.itemId);
			if (!reference) {
				throw new Error(
					`Sticker ${item.sample.itemId} source bytes are missing`
				);
			}
			return prepareStickerSource({ item, reference, temporaryDirectory });
		})
	);
	return new Map(prepared.map((source) => [source.item.sample.itemId, source]));
}

function sourceFrameIndexAtOutputFrame({
	frameRate,
	outputFrame,
	source,
}: {
	frameRate: number;
	outputFrame: number;
	source: PreparedStickerSource;
}): number {
	if (!source.descriptor) return 0;
	const state = evaluateStickerRuntime({
		descriptor: source.descriptor,
		timeline: {
			sourceOffsetSeconds: 0,
			timelineDurationSeconds:
				(source.item.endFrame - source.item.startFrame) / frameRate,
			timelineStartSeconds: source.item.startFrame / frameRate,
		},
		timelineTimeSeconds: outputFrame / frameRate,
	});
	if (!(state.active && state.kind === "direct-gif")) {
		throw new Error(
			`Sticker ${source.item.sample.itemId} source runtime is inactive at frame ${outputFrame}`
		);
	}
	return state.frameIndex;
}

function sourceFrameVisualDistance({
	left,
	right,
}: {
	left: Buffer;
	right: Buffer;
}): number {
	let absoluteDifference = 0;
	for (let offset = 0; offset < left.byteLength; offset += 4) {
		const leftAlpha = left[offset + 3] / 255;
		const rightAlpha = right[offset + 3] / 255;
		for (let channel = 0; channel < 3; channel += 1) {
			absoluteDifference += Math.abs(
				left[offset + channel] * leftAlpha -
					right[offset + channel] * rightAlpha
			);
		}
		absoluteDifference += Math.abs(left[offset + 3] - right[offset + 3]);
	}
	return absoluteDifference / left.byteLength;
}

function sourceFrameHasVisiblePixels({ frame }: { frame: Buffer }): boolean {
	for (let offset = 3; offset < frame.byteLength; offset += 4) {
		if (frame[offset] >= STICKER_SOURCE_VISIBLE_ALPHA_THRESHOLD) return true;
	}
	return false;
}

function mostDistinctSelections({
	selections,
	source,
}: {
	selections: StickerSourceFrameSelection[];
	source: PreparedStickerSource;
}): StickerSourceFrameSelection[] {
	if (selections.length <= 3) return selections;
	let farthestPair: [StickerSourceFrameSelection, StickerSourceFrameSelection] =
		[selections[0], selections[1]];
	let farthestPairDistance = -1;
	for (let leftIndex = 0; leftIndex < selections.length - 1; leftIndex += 1) {
		for (
			let rightIndex = leftIndex + 1;
			rightIndex < selections.length;
			rightIndex += 1
		) {
			const left = selections[leftIndex];
			const right = selections[rightIndex];
			const distance = sourceFrameVisualDistance({
				left: source.frames[left.sourceFrameIndex],
				right: source.frames[right.sourceFrameIndex],
			});
			if (distance > farthestPairDistance) {
				farthestPair = [left, right];
				farthestPairDistance = distance;
			}
		}
	}
	let third: StickerSourceFrameSelection | null = null;
	let thirdDistance = -1;
	for (const candidate of selections) {
		if (farthestPair.includes(candidate)) continue;
		const candidateFrame = source.frames[candidate.sourceFrameIndex];
		const distance = Math.min(
			...farthestPair.map((selected) =>
				sourceFrameVisualDistance({
					left: candidateFrame,
					right: source.frames[selected.sourceFrameIndex],
				})
			)
		);
		if (distance > thirdDistance) {
			third = candidate;
			thirdDistance = distance;
		}
	}
	return [...farthestPair, ...(third ? [third] : [])].sort(
		(left, right) => left.outputFrame - right.outputFrame
	);
}

function centeredSelection({
	selections,
}: {
	selections: StickerSourceFrameSelection[];
}): StickerSourceFrameSelection {
	let longestRun: StickerSourceFrameSelection[] = [];
	let currentRun: StickerSourceFrameSelection[] = [];
	for (const selection of selections) {
		const previous = currentRun.at(-1);
		if (previous && selection.outputFrame !== previous.outputFrame + 1) {
			if (currentRun.length > longestRun.length) longestRun = currentRun;
			currentRun = [];
		}
		currentRun.push(selection);
	}
	if (currentRun.length > longestRun.length) longestRun = currentRun;
	const centered = longestRun[Math.floor(longestRun.length / 2)];
	if (!centered) throw new Error("Sticker source frame selection is empty");
	return centered;
}

export function selectStickerSourceEvidenceFrames({
	frameRate,
	source,
}: {
	frameRate: number;
	source: PreparedStickerSource;
}): StickerSourceFrameSelection[] {
	const { endFrame, sample, startFrame } = source.item;
	if (sample.mimeType === "image/png") {
		const firstSafeFrame = startFrame + 2;
		const lastSafeFrame = endFrame - 3;
		if (firstSafeFrame > lastSafeFrame) {
			throw new Error(
				`Sticker ${sample.itemId} has no safe static evidence window`
			);
		}
		const guardedOutputFrames = [
			firstSafeFrame,
			firstSafeFrame + Math.floor((lastSafeFrame - firstSafeFrame) / 2),
			lastSafeFrame,
		].filter(
			(outputFrame, index, frames) => frames.indexOf(outputFrame) === index
		);
		return guardedOutputFrames.map((outputFrame) => ({
			outputFrame,
			sourceFrameHash: source.frameHashes[0],
			sourceFrameIndex: 0,
		}));
	}
	const firstSafeFrame = startFrame + 2;
	const lastSafeFrame = endFrame - 3;
	const selectionsByHash = new Map<string, StickerSourceFrameSelection[]>();
	for (
		let outputFrame = firstSafeFrame;
		outputFrame <= lastSafeFrame;
		outputFrame += 1
	) {
		const sourceFrameIndex = sourceFrameIndexAtOutputFrame({
			frameRate,
			outputFrame,
			source,
		});
		if (
			!sourceFrameHasVisiblePixels({ frame: source.frames[sourceFrameIndex] })
		) {
			continue;
		}
		const sourceFrameHash = source.frameHashes[sourceFrameIndex];
		const selections = selectionsByHash.get(sourceFrameHash) ?? [];
		selections.push({ outputFrame, sourceFrameHash, sourceFrameIndex });
		selectionsByHash.set(sourceFrameHash, selections);
	}
	if (selectionsByHash.size === 0) {
		throw new Error(
			`Sticker ${sample.itemId} has no observable source frame inside its safe evidence window`
		);
	}
	return mostDistinctSelections({
		selections: [...selectionsByHash.values()].map((selections) =>
			centeredSelection({ selections })
		),
		source,
	});
}
