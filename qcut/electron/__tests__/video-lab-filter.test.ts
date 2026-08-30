import { describe, expect, it } from "vitest";
import {
	buildVideoLabFilter,
	getVideoLabTemporalContextSeconds,
	hasVideoLabFilters,
	normalizeVideoLabFilterSettings,
	type NormalizedVideoLabFilterSettings,
} from "../ffmpeg/video-lab-filter";

const TARGET_VIDEO = {
	width: 1920,
	height: 1080,
	fps: 30,
};

describe("video lab filter", () => {
	it("keeps default settings as a no-op", () => {
		expect(normalizeVideoLabFilterSettings({})).toEqual({
			deflicker: 0,
			opticalFlowMotionBlur: 0,
			localSuperResolution: 1,
		});
		expect(hasVideoLabFilters({})).toBe(false);
		expect(buildVideoLabFilter({ ...TARGET_VIDEO })).toBe("");
	});

	it("normalizes percentages and rejects unsupported scale factors", () => {
		const invalidScale =
			3 as NormalizedVideoLabFilterSettings["localSuperResolution"];
		expect(
			normalizeVideoLabFilterSettings({
				settings: {
					deflicker: 160,
					opticalFlowMotionBlur: -20,
					localSuperResolution: invalidScale,
				},
			})
		).toEqual({
			deflicker: 100,
			opticalFlowMotionBlur: 0,
			localSuperResolution: 1,
		});
		expect(
			normalizeVideoLabFilterSettings({
				settings: {
					deflicker: Number.NaN,
					opticalFlowMotionBlur: Number.POSITIVE_INFINITY,
					localSuperResolution: 4,
				},
			})
		).toEqual({
			deflicker: 0,
			opticalFlowMotionBlur: 0,
			localSuperResolution: 4,
		});
	});

	it("detects only normalized active settings", () => {
		expect(
			hasVideoLabFilters({
				settings: { deflicker: -1, opticalFlowMotionBlur: Number.NaN },
			})
		).toBe(false);
		expect(hasVideoLabFilters({ settings: { deflicker: 1 } })).toBe(true);
		expect(hasVideoLabFilters({ settings: { opticalFlowMotionBlur: 1 } })).toBe(
			true
		);
		expect(hasVideoLabFilters({ settings: { localSuperResolution: 2 } })).toBe(
			true
		);
	});

	it("maps deflicker strength to a bounded odd window", () => {
		const cases = [
			{ strength: 1, expectedWindow: 3 },
			{ strength: 50, expectedWindow: 17 },
			{ strength: 100, expectedWindow: 31 },
			{ strength: 1_000, expectedWindow: 31 },
		];

		for (const { strength, expectedWindow } of cases) {
			const filter = buildVideoLabFilter({
				...TARGET_VIDEO,
				settings: { deflicker: strength },
			});
			expect(filter).toBe(`deflicker=size=${expectedWindow}:mode=am`);
			expect(expectedWindow).toBeGreaterThanOrEqual(3);
			expect(expectedWindow).toBeLessThanOrEqual(31);
			expect(expectedWindow % 2).toBe(1);
		}
	});

	it("interpolates, mixes, and restores the requested output fps", () => {
		expect(
			buildVideoLabFilter({
				width: 1280,
				height: 720,
				fps: 29.97,
				settings: { opticalFlowMotionBlur: 50 },
			})
		).toBe(
			"minterpolate=fps=119.88:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1," +
				"tmix=frames=5:weights='1 1 1 1 1',fps=29.97"
		);
	});

	it("bounds motion-blur mixing at eight interpolated frames", () => {
		const filter = buildVideoLabFilter({
			...TARGET_VIDEO,
			settings: { opticalFlowMotionBlur: 1_000 },
		});
		expect(filter).toContain("minterpolate=fps=120:");
		expect(filter).toContain("tmix=frames=8:weights='1 1 1 1 1 1 1 1',fps=30");
	});

	it("upscales with Lanczos, sharpens lightly, and returns to target size", () => {
		expect(
			buildVideoLabFilter({
				...TARGET_VIDEO,
				settings: { localSuperResolution: 2 },
			})
		).toBe(
			"scale=iw*2:ih*2:flags=lanczos," +
				"unsharp=5:5:0.35:5:5:0," +
				"scale=1920:1080:flags=lanczos"
		);
		expect(
			buildVideoLabFilter({
				width: 720,
				height: 1280,
				fps: 24,
				settings: { localSuperResolution: 4 },
			})
		).toContain("scale=iw*4:ih*4:flags=lanczos");
	});

	it("builds combined filters in a stable processing order", () => {
		const filter = buildVideoLabFilter({
			width: 640,
			height: 360,
			fps: 25,
			settings: {
				deflicker: 50,
				opticalFlowMotionBlur: 50,
				localSuperResolution: 2,
			},
		});
		expect(filter).toBe(
			"deflicker=size=17:mode=am," +
				"minterpolate=fps=100:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1," +
				"tmix=frames=5:weights='1 1 1 1 1',fps=25," +
				"scale=iw*2:ih*2:flags=lanczos," +
				"unsharp=5:5:0.35:5:5:0," +
				"scale=640:360:flags=lanczos"
		);
	});

	it("reports enough temporal context for the active local filters", () => {
		expect(getVideoLabTemporalContextSeconds({ fps: 30 })).toBe(0);
		expect(
			getVideoLabTemporalContextSeconds({
				fps: 30,
				settings: { deflicker: 100 },
			})
		).toBe(1.033333);
		expect(
			getVideoLabTemporalContextSeconds({
				fps: 30,
				settings: { opticalFlowMotionBlur: 100 },
			})
		).toBe(0.066667);
	});

	it("validates only parameters required by active filters", () => {
		expect(buildVideoLabFilter({ width: 0, height: 0, fps: 0 })).toBe("");
		expect(() =>
			buildVideoLabFilter({
				width: 1920,
				height: 1080,
				fps: 0,
				settings: { opticalFlowMotionBlur: 10 },
			})
		).toThrowError("fps must be a positive finite number");
		expect(() =>
			buildVideoLabFilter({
				width: 0,
				height: 1080,
				fps: 30,
				settings: { localSuperResolution: 2 },
			})
		).toThrowError("width must be a positive integer");
		expect(() =>
			buildVideoLabFilter({
				width: 1920,
				height: 1080.5,
				fps: 30,
				settings: { localSuperResolution: 2 },
			})
		).toThrowError("height must be a positive integer");
	});
});
