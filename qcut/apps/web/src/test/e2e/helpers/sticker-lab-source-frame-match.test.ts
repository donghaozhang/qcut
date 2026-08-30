import { describe, expect, test } from "vitest";
import {
	calculateStickerSourceFrameMatch,
	calculateTemporalSourceSequenceEvidence,
	type StickerSourceFrameMatchEvidence,
} from "./sticker-lab-source-frame-match";
import type {
	PreparedStickerSource,
	StickerEvidencePixelRect,
	StickerSourceFrameSelection,
} from "./sticker-lab-source-frame-evidence";
import { STICKER_SOURCE_MATCH_FRAME_SIZE } from "./sticker-lab-source-frame-evidence";

const RECT: StickerEvidencePixelRect = {
	height: 8,
	left: 20,
	top: 20,
	width: 8,
};

function sample({ itemId }: { itemId: string }) {
	return {
		batchId: "jianying-2026-08-30",
		byteSize: 256,
		categoryId: "1",
		categoryLabel: "test",
		checksumSha256: itemId.padEnd(64, "0"),
		cycleDurationSeconds: 1,
		displayName: itemId,
		frameCount: 2,
		frameRate: 2,
		itemId,
		mimeType: "image/gif" as const,
		sourceKind: "preview-gif" as const,
	};
}

function rgbaFrame({
	color,
	pattern,
}: {
	color: [number, number, number];
	pattern: "left" | "right";
}): Buffer {
	const frame = Buffer.alloc(RECT.width * RECT.height * 4);
	for (let y = 0; y < RECT.height; y += 1) {
		for (let x = 0; x < RECT.width; x += 1) {
			const offset = (y * RECT.width + x) * 4;
			const visible = pattern === "left" ? x < 6 : x >= 2;
			frame[offset] = color[0];
			frame[offset + 1] = color[1];
			frame[offset + 2] = color[2];
			frame[offset + 3] = visible ? 255 : 0;
		}
	}
	return frame;
}

function preparedSource({
	frames,
	itemId,
}: {
	frames: Buffer[];
	itemId: string;
}): PreparedStickerSource {
	return {
		descriptor: null,
		frameHashes: frames.map((_, index) => `${itemId}-frame-${index}`),
		frames,
		item: {
			endFrame: 30,
			region: { height: 0.1, width: 0.1, x: 0.1, y: 0.1 },
			sample: sample({ itemId }),
			startFrame: 0,
		},
		pixelRect: RECT,
	};
}

function solidVideoFrame({ value }: { value: number }): Buffer {
	return Buffer.alloc(
		STICKER_SOURCE_MATCH_FRAME_SIZE.width *
			STICKER_SOURCE_MATCH_FRAME_SIZE.height *
			3,
		value
	);
}

function composite({
	baseline,
	sourceFrame,
}: {
	baseline: Buffer;
	sourceFrame: Buffer;
}): Buffer {
	const output = Buffer.from(baseline);
	for (let y = 0; y < RECT.height; y += 1) {
		for (let x = 0; x < RECT.width; x += 1) {
			const sourceOffset = (y * RECT.width + x) * 4;
			const outputOffset =
				((RECT.top + y) * STICKER_SOURCE_MATCH_FRAME_SIZE.width +
					RECT.left +
					x) *
				3;
			const alpha = sourceFrame[sourceOffset + 3];
			for (let channel = 0; channel < 3; channel += 1) {
				output[outputOffset + channel] = Math.round(
					(sourceFrame[sourceOffset + channel] * alpha +
						baseline[outputOffset + channel] * (255 - alpha)) /
						255
				);
			}
		}
	}
	return output;
}

function selection({
	source,
	sourceFrameIndex,
}: {
	source: PreparedStickerSource;
	sourceFrameIndex: number;
}): StickerSourceFrameSelection {
	return {
		outputFrame: sourceFrameIndex * 15,
		sourceFrameHash: source.frameHashes[sourceFrameIndex],
		sourceFrameIndex,
	};
}

describe("Sticker Lab source frame evidence", () => {
	test("matches the exported pixels to the expected private source", () => {
		const baseline = solidVideoFrame({ value: 90 });
		const expected = preparedSource({
			frames: [
				rgbaFrame({ color: [230, 40, 30], pattern: "left" }),
				rgbaFrame({ color: [30, 40, 230], pattern: "right" }),
			],
			itemId: "expected",
		});
		const wrong = preparedSource({
			frames: [rgbaFrame({ color: [30, 220, 40], pattern: "right" })],
			itemId: "wrong",
		});
		const chosen = selection({ source: expected, sourceFrameIndex: 0 });
		const match = calculateStickerSourceFrameMatch({
			alternativeSources: [{ frameIndex: 0, itemId: "wrong", source: wrong }],
			baseline,
			expectedSource: expected,
			output: composite({ baseline, sourceFrame: expected.frames[0] }),
			selection: chosen,
		});
		expect(match.matched).toBe(true);
		expect(match.actualToExpectedCorrelation).toBeCloseTo(1, 6);
		expect(match.actualToExpectedMeanAbsoluteError).toBe(0);
		expect(match.compositeErrorAdvantage).toBeGreaterThan(20);
		expect(match.identityCorrelationAdvantage).toBeGreaterThan(0.5);
	});

	test("rejects a different sticker rendered in the expected slot", () => {
		const baseline = solidVideoFrame({ value: 90 });
		const expected = preparedSource({
			frames: [rgbaFrame({ color: [230, 40, 30], pattern: "left" })],
			itemId: "expected",
		});
		const wrong = preparedSource({
			frames: [rgbaFrame({ color: [30, 220, 40], pattern: "right" })],
			itemId: "wrong",
		});
		const match = calculateStickerSourceFrameMatch({
			alternativeSources: [{ frameIndex: 0, itemId: "wrong", source: wrong }],
			baseline,
			expectedSource: expected,
			output: composite({ baseline, sourceFrame: wrong.frames[0] }),
			selection: selection({ source: expected, sourceFrameIndex: 0 }),
		});
		expect(match.matched).toBe(false);
		expect(match.compositeErrorAdvantage).toBeLessThan(0);
		expect(match.identityCorrelationAdvantage).toBeLessThan(0);
	});

	test("marks a black sticker on a black baseline as unobservable", () => {
		const baseline = solidVideoFrame({ value: 0 });
		const expected = preparedSource({
			frames: [rgbaFrame({ color: [0, 0, 0], pattern: "left" })],
			itemId: "black-bar",
		});
		const match = calculateStickerSourceFrameMatch({
			alternativeSources: [],
			baseline,
			expectedSource: expected,
			output: composite({ baseline, sourceFrame: expected.frames[0] }),
			selection: selection({ source: expected, sourceFrameIndex: 0 }),
		});
		expect(match).toMatchObject({
			expectedChangedPixelRatio: 0,
			matched: false,
			observableAgainstBaseline: false,
		});
	});

	test("matches low-contrast source pixels without treating a dropped frame as invisible", () => {
		const baseline = solidVideoFrame({ value: 90 });
		const expected = preparedSource({
			frames: [rgbaFrame({ color: [100, 100, 100], pattern: "left" })],
			itemId: "low-contrast",
		});
		const chosen = selection({ source: expected, sourceFrameIndex: 0 });
		const correct = calculateStickerSourceFrameMatch({
			alternativeSources: [],
			baseline,
			expectedSource: expected,
			output: composite({ baseline, sourceFrame: expected.frames[0] }),
			selection: chosen,
		});
		const dropped = calculateStickerSourceFrameMatch({
			alternativeSources: [],
			baseline,
			expectedSource: expected,
			output: baseline,
			selection: chosen,
		});
		expect(correct).toMatchObject({
			expectedChangedPixelRatio: 0,
			matched: true,
			observableAgainstBaseline: true,
		});
		expect(correct.expectedMeanAbsoluteDifference).toBeGreaterThan(0.1);
		expect(dropped).toMatchObject({
			expectedChangedPixelRatio: 0,
			matched: false,
			observableAgainstBaseline: true,
		});
	});

	test("rejects a GIF frozen on one source frame", () => {
		const selections: StickerSourceFrameSelection[] = [
			{ outputFrame: 2, sourceFrameHash: "red", sourceFrameIndex: 0 },
			{ outputFrame: 17, sourceFrameHash: "blue", sourceFrameIndex: 1 },
		];
		const matches: StickerSourceFrameMatchEvidence[] = selections.map(
			(selectionItem, index) => ({
				actualToExpectedCorrelation: index === 0 ? 1 : -0.4,
				actualToExpectedMeanAbsoluteError: index === 0 ? 0 : 80,
				actualToBaselineMeanAbsoluteError: 50,
				compositeErrorAdvantage: index === 0 ? 50 : -30,
				expectedAlphaPixelRatio: 0.75,
				expectedChangedPixelRatio: 0.75,
				expectedMeanAbsoluteDifference: 30,
				expectedSourceFrameHash: selectionItem.sourceFrameHash,
				expectedSourceFrameIndex: selectionItem.sourceFrameIndex,
				foregroundRecall: 0.75,
				identityCorrelationAdvantage: 0.5,
				matched: index === 0,
				observableAgainstBaseline: true,
				temporalCompositeErrorAdvantage: index === 0 ? 20 : -20,
				temporalCorrelationAdvantage: index === 0 ? 0.7 : -0.7,
				temporalAlternatives: [
					{
						compositeErrorAdvantage: index === 0 ? 20 : -20,
						correlationAdvantage: index === 0 ? 0.7 : -0.7,
						sourceFrameHash: index === 0 ? "blue" : "red",
					},
				],
			})
		);
		expect(
			calculateTemporalSourceSequenceEvidence({ matches, selections })
		).toMatchObject({ supportsExpectedSequence: false });
	});

	test("accepts a sequence that beats every constant source frame", () => {
		const selections: StickerSourceFrameSelection[] = [
			{ outputFrame: 2, sourceFrameHash: "red", sourceFrameIndex: 0 },
			{ outputFrame: 17, sourceFrameHash: "blue", sourceFrameIndex: 1 },
		];
		const matches: StickerSourceFrameMatchEvidence[] = selections.map(
			(selectionItem, index) => ({
				actualToExpectedCorrelation: 0.95,
				actualToExpectedMeanAbsoluteError: 3,
				actualToBaselineMeanAbsoluteError: 40,
				compositeErrorAdvantage: 37,
				expectedAlphaPixelRatio: 0.75,
				expectedChangedPixelRatio: 0.75,
				expectedMeanAbsoluteDifference: 30,
				expectedSourceFrameHash: selectionItem.sourceFrameHash,
				expectedSourceFrameIndex: selectionItem.sourceFrameIndex,
				foregroundRecall: 0.9,
				identityCorrelationAdvantage: 0.5,
				matched: true,
				observableAgainstBaseline: true,
				temporalCompositeErrorAdvantage: 12,
				temporalCorrelationAdvantage: 0.3,
				temporalAlternatives: [
					{
						compositeErrorAdvantage: 12,
						correlationAdvantage: 0.3,
						sourceFrameHash: index === 0 ? "blue" : "red",
					},
				],
			})
		);
		expect(
			calculateTemporalSourceSequenceEvidence({ matches, selections })
		).toMatchObject({
			distinctExpectedFrameCount: 2,
			minimumFrozenCompositeErrorAdvantage: 12,
			supportsExpectedSequence: true,
		});
	});
});
