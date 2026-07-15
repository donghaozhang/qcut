import { describe, expect, it } from "vitest";
import {
	buildVideoEnhancementFilter,
	hasVideoEnhancements,
	normalizeVideoEnhancements,
} from "../ffmpeg/video-enhancement-filter";

describe("video enhancement filter", () => {
	it("keeps neutral values as a no-op", () => {
		expect(
			buildVideoEnhancementFilter({
				width: 1920,
				height: 1080,
			})
		).toBe("");
		expect(hasVideoEnhancements({})).toBe(false);
	});

	it("clamps persisted values before building filters", () => {
		expect(
			normalizeVideoEnhancements({
				enhancements: {
					stabilization: 150,
					denoise: -20,
					clarity: 200,
					upscale: 3 as 2,
					relight: -150,
					beauty: 120,
				},
			})
		).toEqual({
			stabilization: 100,
			denoise: 0,
			clarity: 100,
			upscale: 1,
			relight: -100,
			beauty: 100,
		});
	});

	it("builds stabilization, denoise, clarity, upscale, relight, and beauty", () => {
		const filter = buildVideoEnhancementFilter({
			width: 640,
			height: 360,
			enhancements: {
				stabilization: 100,
				denoise: 50,
				clarity: 75,
				upscale: 2,
				relight: 50,
				beauty: 40,
			},
		});
		expect(filter).toContain("deshake=rx=64:ry=64:edge=mirror");
		expect(filter).toContain("hqdn3d=");
		expect(filter).toContain("unsharp=5:5:1.5");
		expect(filter).toContain("scale=iw*2:ih*2:flags=lanczos");
		expect(filter).toContain("scale=640:360:flags=lanczos");
		expect(filter).toContain("eq=brightness=0.12:gamma=1.2:saturation=1.04");
		expect(hasVideoEnhancements({ enhancements: { clarity: 1 } })).toBe(true);
	});
});
