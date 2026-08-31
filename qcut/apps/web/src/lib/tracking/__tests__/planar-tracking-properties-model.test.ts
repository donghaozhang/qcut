import type {
	PlanarTrackingReference,
	StickerElement,
	StickerPlanarTracking,
	TimelineTrack,
} from "@qcut/editor-core";
import { describe, expect, it } from "vitest";
import {
	DEFAULT_PLANAR_SEED_QUAD,
	isPlanarTrackingReferenceUsedByAnotherSticker,
	readPlanarTrackingErrorCode,
	resolvePlanarTrackingReference,
	upsertPlanarTrackingReference,
} from "../planar-tracking-properties-model";

function createReference({ id }: { id: string }): PlanarTrackingReference {
	return {
		analysisHeight: 540,
		analysisWidth: 960,
		direction: "both",
		id,
		provider: "opencv-wasm",
		providerVersion: "test",
		schemaVersion: 1,
		seedPtsUs: 0,
		seedQuad: DEFAULT_PLANAR_SEED_QUAD,
		sourceMediaId: "media-1",
		status: "ready",
	};
}

function createBinding({
	referenceId,
}: {
	referenceId: string;
}): StickerPlanarTracking {
	return {
		lostBehavior: "hold",
		mode: "planar",
		seedPtsUs: 0,
		seedTargetQuad: DEFAULT_PLANAR_SEED_QUAD,
		sourceElementId: "media-element",
		surfaceTrackingId: referenceId,
	};
}

function createSticker({
	id,
	referenceId,
}: {
	id: string;
	referenceId: string;
}): StickerElement {
	return {
		duration: 1,
		id,
		mediaId: `${id}-media`,
		name: id,
		startTime: 0,
		stickerId: id,
		tracking: createBinding({ referenceId }),
		trimEnd: 1,
		trimStart: 0,
		type: "sticker",
	};
}

function createTrack({
	stickers,
}: {
	stickers: StickerElement[];
}): TimelineTrack {
	return {
		elements: stickers,
		id: "stickers",
		name: "Stickers",
		type: "sticker",
	};
}

describe("planar tracking properties model", () => {
	it("replaces a reference without changing unrelated entries", () => {
		const first = createReference({ id: "first" });
		const replacement = { ...first, status: "partial" as const };
		const second = createReference({ id: "second" });
		expect(
			upsertPlanarTrackingReference({
				reference: replacement,
				references: [first, second],
			})
		).toEqual([second, replacement]);
	});

	it("does not fall back when an explicit binding reference is missing", () => {
		const available = createReference({ id: "available" });
		expect(
			resolvePlanarTrackingReference({
				binding: createBinding({ referenceId: "missing" }),
				references: [available],
				sourceMediaId: available.sourceMediaId,
			})
		).toBeUndefined();
		expect(
			resolvePlanarTrackingReference({
				binding: undefined,
				references: [available],
				sourceMediaId: available.sourceMediaId,
			})
		).toBe(available);
	});

	it("detects when another sticker uses the same planar reference", () => {
		const tracks = [
			createTrack({
				stickers: [
					createSticker({ id: "selected", referenceId: "surface" }),
					createSticker({ id: "other", referenceId: "surface" }),
				],
			}),
		];

		expect(
			isPlanarTrackingReferenceUsedByAnotherSticker({
				referenceId: "surface",
				stickerElementId: "selected",
				tracks,
			})
		).toBe(true);
		expect(
			isPlanarTrackingReferenceUsedByAnotherSticker({
				referenceId: "unshared",
				stickerElementId: "selected",
				tracks,
			})
		).toBe(false);
	});

	it("maps aborts and provider error codes to terminal UI codes", () => {
		expect(
			readPlanarTrackingErrorCode({
				cause: new DOMException("cancelled", "AbortError"),
			})
		).toBe("cancelled");
		const providerError = Object.assign(new Error("texture"), {
			code: "insufficient-texture",
		});
		expect(readPlanarTrackingErrorCode({ cause: providerError })).toBe(
			"insufficient-texture"
		);
		expect(readPlanarTrackingErrorCode({ cause: new Error("unknown") })).toBe(
			"decode-failed"
		);
		expect(
			readPlanarTrackingErrorCode({
				cause: Object.assign(new Error("unknown code"), { code: "other" }),
			})
		).toBe("decode-failed");
	});
});
