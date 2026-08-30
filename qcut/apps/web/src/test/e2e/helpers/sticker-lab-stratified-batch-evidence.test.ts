import { describe, expect, test } from "vitest";
import type { FrameDifferenceEvidence } from "./sticker-lab-real-video-evidence";
import type { StickerSourceFrameMatchEvidence } from "./sticker-lab-source-frame-match";
import { hasStickerSourceContentProof } from "./sticker-lab-stratified-batch-evidence";

function difference({
	localized,
}: {
	localized: boolean;
}): FrameDifferenceEvidence {
	return {
		changedPixelRatio: localized ? 0.01 : 0,
		differenceHash: localized ? "changed" : "unchanged",
		meanAbsoluteDifference: localized ? 1 : 0,
		outsideStickerRegionChangedPixelRatio: 0,
		outsideStickerRegionMeanAbsoluteDifference: 0,
		stickerRegionChangedPixelRatio: localized ? 0.01 : 0,
		stickerRegionDifferenceHash: localized ? "localized" : "none",
		stickerRegionMeanAbsoluteDifference: localized ? 1 : 0,
		timeSeconds: 0,
	};
}

function match({
	matched,
	observable = true,
}: {
	matched: boolean;
	observable?: boolean;
}): StickerSourceFrameMatchEvidence {
	return {
		actualToExpectedCorrelation: matched ? 1 : 0,
		actualToExpectedMeanAbsoluteError: 0,
		actualToBaselineMeanAbsoluteError: matched ? 1 : 0,
		compositeErrorAdvantage: matched ? 1 : 0,
		expectedAlphaPixelRatio: 1,
		expectedChangedPixelRatio: observable ? 1 : 0,
		expectedMeanAbsoluteDifference: observable ? 1 : 0,
		expectedSourceFrameHash: "source",
		expectedSourceFrameIndex: 0,
		foregroundRecall: matched ? 1 : 0,
		identityCorrelationAdvantage: matched ? 1 : 0,
		matched,
		observableAgainstBaseline: observable,
		temporalAlternatives: [],
		temporalCompositeErrorAdvantage: null,
		temporalCorrelationAdvantage: null,
	};
}

describe("hasStickerSourceContentProof", () => {
	test("accepts a static sticker when one sampled frame proves localized identity", () => {
		expect(
			hasStickerSourceContentProof({
				differences: [
					difference({ localized: false }),
					difference({ localized: true }),
				],
				matches: [
					match({ matched: false, observable: false }),
					match({ matched: true }),
				],
				mimeType: "image/png",
			})
		).toBe(true);
	});

	test("requires static identity and localization on the same sampled frame", () => {
		expect(
			hasStickerSourceContentProof({
				differences: [
					difference({ localized: false }),
					difference({ localized: true }),
				],
				matches: [match({ matched: true }), match({ matched: false })],
				mimeType: "image/png",
			})
		).toBe(false);
	});

	test("rejects any dropped static frame that should be observable", () => {
		expect(
			hasStickerSourceContentProof({
				differences: [
					difference({ localized: true }),
					difference({ localized: true }),
				],
				matches: [match({ matched: true }), match({ matched: false })],
				mimeType: "image/png",
			})
		).toBe(false);
	});

	test("rejects a visible wrong draw on a static frame that should be invisible", () => {
		expect(
			hasStickerSourceContentProof({
				differences: [
					difference({ localized: true }),
					difference({ localized: true }),
				],
				matches: [
					match({ matched: false, observable: false }),
					match({ matched: true }),
				],
				mimeType: "image/png",
			})
		).toBe(false);
	});

	test("keeps animated sticker source samples strict", () => {
		expect(
			hasStickerSourceContentProof({
				differences: [
					difference({ localized: true }),
					difference({ localized: true }),
				],
				matches: [match({ matched: true }), match({ matched: false })],
				mimeType: "image/gif",
			})
		).toBe(false);
	});
});
