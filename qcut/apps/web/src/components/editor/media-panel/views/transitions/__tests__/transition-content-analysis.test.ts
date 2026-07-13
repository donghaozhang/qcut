import { describe, expect, it } from "vitest";
import type { MediaItem } from "@/stores/media/media-store-types";
import {
	buildTransitionContentText,
	buildTransitionVisualSignals,
	calculateTransitionFrameMetrics,
} from "../transition-content-analysis";

function solidPixels({
	blue,
	green,
	red,
	count = 4,
}: {
	blue: number;
	count?: number;
	green: number;
	red: number;
}): Uint8ClampedArray {
	const pixels = new Uint8ClampedArray(count * 4);
	for (let index = 0; index < count; index++) {
		pixels.set([red, green, blue, 255], index * 4);
	}
	return pixels;
}

describe("transition content analysis", () => {
	it("extracts typed content metadata without serializing unrelated values", () => {
		const mediaItem: MediaItem = {
			file: new File([], "generated.mov", { type: "video/quicktime" }),
			id: "media-1",
			name: "generated.mov",
			metadata: {
				description: "人物采访",
				generationParams: {
					cameraMotion: "dolly_in",
					prompt: "Neon city at night",
				},
				ignoredPayload: { secret: "do-not-index" },
				tags: ["portrait", "dialogue"],
			},
			type: "video",
		};

		const text = buildTransitionContentText({
			fallbackName: "clip",
			mediaItem,
		});
		expect(text).toContain("人物采访");
		expect(text).toContain("Neon city at night");
		expect(text).toContain("dolly_in");
		expect(text).not.toContain("do-not-index");
	});

	it("measures luminance and saturation from real pixel channels", () => {
		const black = calculateTransitionFrameMetrics({
			height: 2,
			pixels: solidPixels({ blue: 0, green: 0, red: 0 }),
			width: 2,
		});
		const red = calculateTransitionFrameMetrics({
			height: 2,
			pixels: solidPixels({ blue: 0, green: 0, red: 255 }),
			width: 2,
		});

		expect(black.luminance).toBe(0);
		expect(red.luminance).toBeCloseTo(0.2126, 4);
		expect(red.saturation).toBe(1);
	});

	it("reports high visual difference between black and white frames", () => {
		const from = calculateTransitionFrameMetrics({
			height: 2,
			pixels: solidPixels({ blue: 0, green: 0, red: 0 }),
			width: 2,
		});
		const to = calculateTransitionFrameMetrics({
			height: 2,
			pixels: solidPixels({ blue: 255, green: 255, red: 255 }),
			width: 2,
		});

		expect(buildTransitionVisualSignals({ from, to })).toMatchObject({
			brightnessDelta: 1,
			colorDistance: 1,
			visualSimilarity: 0,
		});
	});

	it("rejects undersized pixel buffers", () => {
		expect(() =>
			calculateTransitionFrameMetrics({
				height: 2,
				pixels: new Uint8ClampedArray(4),
				width: 2,
			})
		).toThrow("do not match");
	});
});
