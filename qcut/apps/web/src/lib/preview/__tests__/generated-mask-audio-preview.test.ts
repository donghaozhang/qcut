import { describe, expect, it } from "vitest";
import { usesOriginalAudioFallbackForGeneratedMask } from "../generated-mask-audio-preview";

describe("usesOriginalAudioFallbackForGeneratedMask", () => {
	it("does not start a second media decoder when the generated result is silent", () => {
		expect(
			usesOriginalAudioFallbackForGeneratedMask({
				generatedMaskHasAudio: false,
				hasDerivedAudio: false,
				hasGeneratedMaskSource: true,
			})
		).toBe(false);
	});

	it("keeps the original-audio fallback for legacy results without metadata", () => {
		expect(
			usesOriginalAudioFallbackForGeneratedMask({
				generatedMaskHasAudio: undefined,
				hasDerivedAudio: false,
				hasGeneratedMaskSource: true,
			})
		).toBe(true);
	});

	it("does not duplicate an active derived-audio path", () => {
		expect(
			usesOriginalAudioFallbackForGeneratedMask({
				generatedMaskHasAudio: true,
				hasDerivedAudio: true,
				hasGeneratedMaskSource: true,
			})
		).toBe(false);
	});

	it("does not render an audio fallback without a generated mask", () => {
		expect(
			usesOriginalAudioFallbackForGeneratedMask({
				generatedMaskHasAudio: true,
				hasDerivedAudio: false,
				hasGeneratedMaskSource: false,
			})
		).toBe(false);
	});
});
