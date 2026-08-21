import { describe, expect, it } from "vitest";
import {
	PREVIEW_QUALITY_OPTIONS,
	buildPreviewFrameCacheIdentity,
	getPreviewQualityOption,
	resolveEffectivePreviewQualityOption,
	resolvePreviewEffectRenderMode,
	resolveRuntimePreviewQuality,
	resolveRuntimePreviewQualityDecision,
} from "../preview-quality";

describe("preview quality options", () => {
	it("isolates frame cache identity by quality and rendered viewport size", () => {
		expect(
			buildPreviewFrameCacheIdentity({
				quality: "smooth",
				width: 854.4,
				height: 480.4,
			})
		).toBe("preview-quality:smooth:viewport:854x480");
		expect(
			buildPreviewFrameCacheIdentity({
				quality: "smooth",
				width: 1280,
				height: 720,
			})
		).not.toBe(
			buildPreviewFrameCacheIdentity({
				quality: "smooth",
				width: 854,
				height: 480,
			})
		);
		expect(
			buildPreviewFrameCacheIdentity({
				quality: "original",
				width: 854,
				height: 480,
			})
		).not.toBe(
			buildPreviewFrameCacheIdentity({
				quality: "smooth",
				width: 854,
				height: 480,
			})
		);
	});

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

	it("keeps high-resolution clips on the original source until the runtime downgrades", () => {
		// Resolution alone no longer forces a proxy — the playback health
		// monitor engages one (via runtimeQuality) only on measured pressure.
		expect(
			resolveEffectivePreviewQualityOption({
				quality: "auto",
				sourceWidth: 3840,
				sourceHeight: 2160,
				hasEnhancements: false,
			}).value
		).toBe("original");
		expect(
			resolveEffectivePreviewQualityOption({
				quality: "auto",
				sourceWidth: 3840,
				sourceHeight: 2160,
				runtimeQuality: "smooth",
				hasEnhancements: false,
			}).value
		).toBe("smooth");
	});

	it("uses the proxy automatically for enhancement-bearing clips", () => {
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

	it("uses presented video frame stalls as a runtime preview health signal", () => {
		expect(
			resolveRuntimePreviewQuality({
				selectedQuality: "auto",
				currentRuntimeQuality: null,
				averageFrameIntervalMs: 20,
				stutterFrameCount: 0,
				stableFrameCount: 0,
				averagePresentedFrameIntervalMs: 55,
				presentedFrameStallCount: 2,
			})
		).toBe("smooth");
		expect(
			resolveRuntimePreviewQuality({
				selectedQuality: "auto",
				currentRuntimeQuality: "smooth",
				averageFrameIntervalMs: 20,
				stutterFrameCount: 0,
				stableFrameCount: 0,
				averagePresentedFrameIntervalMs: 90,
				presentedFrameStallCount: 5,
			})
		).toBe("low");
	});

	it("attributes automatic downgrades to rendering, video frames, or both", () => {
		const mainThreadDecision = resolveRuntimePreviewQualityDecision({
			selectedQuality: "auto",
			currentRuntimeQuality: null,
			averageFrameIntervalMs: 50,
			stutterFrameCount: 3,
			stableFrameCount: 0,
			averagePresentedFrameIntervalMs: 20,
			presentedFrameStallCount: 0,
		});
		expect(mainThreadDecision.quality).toBe("smooth");
		expect(mainThreadDecision.diagnostic?.reason).toBe("main-thread");

		const videoFrameDecision = resolveRuntimePreviewQualityDecision({
			selectedQuality: "auto",
			currentRuntimeQuality: "smooth",
			averageFrameIntervalMs: 20,
			stutterFrameCount: 0,
			stableFrameCount: 0,
			averagePresentedFrameIntervalMs: 90,
			presentedFrameStallCount: 5,
		});
		expect(videoFrameDecision.quality).toBe("low");
		expect(videoFrameDecision.diagnostic).toMatchObject({
			reason: "video-frame",
			averagePresentedFrameIntervalMs: 90,
			presentedFrameStallCount: 5,
		});

		const combinedDecision = resolveRuntimePreviewQualityDecision({
			selectedQuality: "auto",
			currentRuntimeQuality: null,
			averageFrameIntervalMs: 50,
			stutterFrameCount: 3,
			stableFrameCount: 0,
			averagePresentedFrameIntervalMs: 55,
			presentedFrameStallCount: 3,
		});
		expect(combinedDecision.diagnostic?.reason).toBe("combined");
	});

	it("clears runtime diagnostics after sustained stable playback", () => {
		expect(
			resolveRuntimePreviewQualityDecision({
				selectedQuality: "auto",
				currentRuntimeQuality: "low",
				averageFrameIntervalMs: 20,
				stutterFrameCount: 0,
				stableFrameCount: 90,
				averagePresentedFrameIntervalMs: 20,
				presentedFrameStallCount: 0,
			})
		).toEqual({ quality: null, diagnostic: null });
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
