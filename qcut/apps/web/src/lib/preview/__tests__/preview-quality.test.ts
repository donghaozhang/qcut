import { describe, expect, it } from "vitest";
import {
	PREVIEW_QUALITY_OPTIONS,
	getPreviewQualityOption,
	resolveEffectivePreviewQualityOption,
	resolvePreviewEffectRenderMode,
	resolveRuntimePreviewQuality,
} from "../preview-quality";

describe("preview quality options", () => {
	it("matches Jianying-style tiers with proxy dimensions", () => {
		expect(PREVIEW_QUALITY_OPTIONS.map((option) => option.value)).toEqual([
			"auto",
			"original",
			"clear",
			"smooth",
			"low",
		]);
		expect(getPreviewQualityOption({ quality: "original" }).forceProxy).toBe(
			false
		);
		expect(getPreviewQualityOption({ quality: "clear" }).maxDimension).toBe(
			1280
		);
		expect(getPreviewQualityOption({ quality: "smooth" }).maxDimension).toBe(
			854
		);
		expect(getPreviewQualityOption({ quality: "low" }).maxDimension).toBe(480);
	});

	it("keeps manual quality choices unchanged", () => {
		expect(
			resolveEffectivePreviewQualityOption({
				quality: "low",
				sourceWidth: 3840,
				sourceHeight: 2160,
				hasEnhancements: false,
			}).value
		).toBe("low");
		expect(
			resolveEffectivePreviewQualityOption({
				quality: "original",
				sourceWidth: 3840,
				sourceHeight: 2160,
				hasEnhancements: true,
			}).value
		).toBe("original");
	});

	it("uses proxy automatically for high-resolution or effect-heavy clips", () => {
		expect(
			resolveEffectivePreviewQualityOption({
				quality: "auto",
				sourceWidth: 3840,
				sourceHeight: 2160,
				hasEnhancements: false,
			}).value
		).toBe("smooth");
		expect(
			resolveEffectivePreviewQualityOption({
				quality: "auto",
				sourceWidth: 1920,
				sourceHeight: 1080,
				hasEnhancements: false,
			}).value
		).toBe("clear");
		expect(
			resolveEffectivePreviewQualityOption({
				quality: "auto",
				sourceWidth: 1280,
				sourceHeight: 720,
				hasEnhancements: true,
			}).value
		).toBe("clear");
	});

	it("keeps lightweight clips on the original source in automatic mode", () => {
		const effectiveOption = resolveEffectivePreviewQualityOption({
			quality: "auto",
			sourceWidth: 1280,
			sourceHeight: 720,
			hasEnhancements: false,
		});

		expect(effectiveOption.value).toBe("original");
		expect(effectiveOption.forceProxy).toBe(false);
	});

	it("allows automatic mode to use a runtime downgrade while playing", () => {
		expect(
			resolveEffectivePreviewQualityOption({
				quality: "auto",
				runtimeQuality: "low",
				sourceWidth: 1280,
				sourceHeight: 720,
				hasEnhancements: false,
			}).value
		).toBe("low");
		expect(
			resolveEffectivePreviewQualityOption({
				quality: "original",
				runtimeQuality: "low",
				sourceWidth: 3840,
				sourceHeight: 2160,
				hasEnhancements: true,
			}).value
		).toBe("original");
	});

	it("selects runtime preview quality from playback health", () => {
		expect(
			resolveRuntimePreviewQuality({
				selectedQuality: "auto",
				currentRuntimeQuality: null,
				averageFrameIntervalMs: 50,
				stutterFrameCount: 3,
				stableFrameCount: 0,
			})
		).toBe("smooth");
		expect(
			resolveRuntimePreviewQuality({
				selectedQuality: "auto",
				currentRuntimeQuality: "smooth",
				averageFrameIntervalMs: 75,
				stutterFrameCount: 5,
				stableFrameCount: 0,
			})
		).toBe("low");
		expect(
			resolveRuntimePreviewQuality({
				selectedQuality: "auto",
				currentRuntimeQuality: "low",
				averageFrameIntervalMs: 20,
				stutterFrameCount: 0,
				stableFrameCount: 90,
			})
		).toBeNull();
		expect(
			resolveRuntimePreviewQuality({
				selectedQuality: "original",
				currentRuntimeQuality: "low",
				averageFrameIntervalMs: 75,
				stutterFrameCount: 5,
				stableFrameCount: 0,
			})
		).toBeNull();
	});

	it("reduces preview-only effect rendering while lower quality playback is active", () => {
		expect(
			resolvePreviewEffectRenderMode({ quality: "smooth", isPlaying: true })
		).toBe("reduced");
		expect(
			resolvePreviewEffectRenderMode({ quality: "low", isPlaying: true })
		).toBe("minimal");
		expect(
			resolvePreviewEffectRenderMode({ quality: "low", isPlaying: false })
		).toBe("full");
		expect(
			resolvePreviewEffectRenderMode({ quality: "clear", isPlaying: true })
		).toBe("full");
	});
});
