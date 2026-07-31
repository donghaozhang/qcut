import { describe, expect, it } from "vitest";
import {
	createDeterministicJianyingId,
	secondsToMicroseconds,
} from "../jianying-draft/index.js";
import { collectLossyMediaFeatureIssues } from "../jianying-draft/unsupported-features.js";
import type { MediaElement } from "../types/timeline.js";

function createNeutralMediaElement(): MediaElement {
	return {
		adjustments: {
			brightness: 0,
			contrast: 0,
			fade: 0,
			saturation: 0,
			sharpness: 0,
			temperature: 0,
			tint: 0,
			vignette: 0,
		},
		audioDenoise: 0,
		audioFadeIn: 0,
		audioFadeOut: 0,
		audioNormalize: false,
		audioPan: 0,
		chromaKey: {
			blend: 0,
			cleanup: 0,
			color: "#00ff00",
			enabled: false,
			shadow: 0,
			similarity: 0,
			spill: 0,
		},
		crop: { bottom: 0, left: 0, right: 0, top: 0 },
		customCutout: {
			applyStrokes: false,
			enabled: false,
			strokes: [],
		},
		duration: 2,
		enhancements: {
			beauty: 0,
			clarity: 0,
			denoise: 0,
			relight: 0,
			stabilization: 0,
			upscale: 1,
		},
		fitMode: "cover",
		id: "neutral-clip",
		mask: {
			centerX: 0.5,
			centerY: 0.5,
			enabled: true,
			feather: 0,
			height: 0.8,
			invert: false,
			rotation: 0,
			type: "none",
			width: 0.8,
		},
		masks: [],
		mediaId: "media-1",
		name: "neutral-clip",
		perspective: {
			bottomLeftX: 0,
			bottomLeftY: 1,
			bottomRightX: 1,
			bottomRightY: 1,
			topLeftX: 0,
			topLeftY: 0,
			topRightX: 1,
			topRightY: 0,
		},
		startTime: 0,
		trimEnd: 0,
		trimStart: 0,
		type: "media",
	};
}

describe("JianYing draft primitives", () => {
	it("creates stable namespace-separated ids", () => {
		const first = createDeterministicJianyingId({
			namespace: "segment",
			sourceId: "source-1",
		});
		const repeated = createDeterministicJianyingId({
			namespace: "segment",
			sourceId: "source-1",
		});
		const otherNamespace = createDeterministicJianyingId({
			namespace: "material",
			sourceId: "source-1",
		});

		expect(first).toBe(repeated);
		expect(first).not.toBe(otherNamespace);
		expect(first).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
		);
	});

	it("rounds seconds to integer microseconds and rejects invalid time", () => {
		expect(secondsToMicroseconds({ seconds: 1.2345678 })).toBe(1_234_568);
		expect(() => secondsToMicroseconds({ seconds: -1 })).toThrow(RangeError);
	});

	it("does not warn for neutral normalized visual settings", () => {
		const element = createNeutralMediaElement();
		expect(collectLossyMediaFeatureIssues({ element })).toEqual([]);

		element.audioFadeIn = 0.5;
		expect(collectLossyMediaFeatureIssues({ element })).toContainEqual(
			expect.objectContaining({
				code: "UNSUPPORTED_MEDIA_FEATURE",
				message: "Advanced QCut audio processing is not mapped yet.",
				severity: "error",
			})
		);
	});

	it("reports explicit media bounds instead of silently dropping them", () => {
		const element = {
			...createNeutralMediaElement(),
			height: 360,
			width: 640,
		};

		expect(collectLossyMediaFeatureIssues({ element })).toContainEqual(
			expect.objectContaining({
				code: "UNSUPPORTED_MEDIA_FEATURE",
				message:
					"Explicit media bounds need a verified JianYing scale mapping.",
				severity: "error",
			})
		);
	});
});
