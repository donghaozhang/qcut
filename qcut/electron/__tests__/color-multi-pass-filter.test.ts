import { describe, expect, it } from "vitest";
import { buildVideoColorMultiPassGraph } from "../ffmpeg/color-multi-pass-filter";
import type { VideoColorMultiPassSettings } from "../ffmpeg/color-settings";

function identityCube() {
	return {
		size: 2,
		domainMin: [0, 0, 0] as [number, number, number],
		domainMax: [1, 1, 1] as [number, number, number],
		values: [
			0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1,
		],
	};
}

function settings({
	passes,
}: {
	passes: VideoColorMultiPassSettings["passes"];
}): VideoColorMultiPassSettings {
	return {
		enabled: true,
		presetId: "jianying:test:v1",
		name: "Test",
		intensity: 100,
		fidelity: "structural",
		passes,
	};
}

describe("multi-pass FFmpeg graph", () => {
	it("keeps food enhancement sharpen before LUT", () => {
		const graph = buildVideoColorMultiPassGraph({
			settings: settings({
				passes: [
					{ kind: "sharpen", amount: 1 },
					{ kind: "lut", cube: identityCube(), intensity: 100 },
				],
			}),
			inputLabel: "source",
			labelPrefix: "clip_1",
		});

		expect(graph.filterSteps).toHaveLength(2);
		expect(graph.filterSteps[0]).toContain("unsharp=5:5:1.0000");
		expect(graph.filterSteps[1]).toContain("lut3d=");
		expect(graph.outputLabel).toContain("multi_lut");
	});

	it("builds an actual blur branch for fog", () => {
		const graph = buildVideoColorMultiPassGraph({
			settings: settings({
				passes: [{ kind: "fog-blend", radius: 3.6, amount: 50 }],
			}),
			inputLabel: "source",
			labelPrefix: "clip_1",
		});

		expect(graph.filterSteps).toHaveLength(3);
		expect(graph.filterSteps[0]).toContain("split=2");
		expect(graph.filterSteps[1]).toContain("gblur=sigma=3.6000");
		expect(graph.filterSteps[2]).toContain("A*(1-0.500000)+B*0.500000");
	});

	it("does no work when the recipe is disabled", () => {
		const disabled = settings({ passes: [{ kind: "sharpen", amount: 1 }] });
		disabled.enabled = false;
		expect(
			buildVideoColorMultiPassGraph({
				settings: disabled,
				inputLabel: "source",
				labelPrefix: "clip_1",
			})
		).toEqual({ filterSteps: [], outputLabel: "source", applied: false });
	});

	it("builds long-tail grain, animated leak, aberration, and lens passes", () => {
		const graph = buildVideoColorMultiPassGraph({
			settings: settings({
				passes: [
					{
						kind: "grain-noise",
						amount: 20,
						size: 2,
						seed: 9,
						timeVarying: true,
					},
					{
						kind: "light-leak",
						amount: 40,
						color: [1, 0.3, 0.1],
						centerX: 0.2,
						centerY: 0.5,
						radius: 0.25,
						speed: 0.3,
						timeVarying: true,
					},
					{ kind: "chromatic-aberration", offset: 2, angle: 15 },
					{
						kind: "lens-distortion",
						distortion: -0.2,
						centerX: 0.5,
						centerY: 0.5,
					},
				],
			}),
			inputLabel: "source",
			labelPrefix: "clip_1",
		});

		expect(graph.filterSteps).toHaveLength(4);
		expect(graph.filterSteps[0]).toContain("floor(X/2)");
		expect(graph.filterSteps[0]).toContain("N*9973");
		expect(graph.filterSteps[1]).toContain("sin(T*0.3");
		expect(graph.filterSteps[2]).toContain("clip(X+");
		expect(graph.filterSteps[3]).toContain("lenscorrection=");
	});

	it("builds half-resolution float bloom with three mip levels", () => {
		const graph = buildVideoColorMultiPassGraph({
			settings: settings({
				passes: [
					{
						kind: "bloom",
						threshold: 0.72,
						radius: 2,
						amount: 65,
						scale: 0.5,
						pixelFormat: "float16",
						mipLevels: 3,
					},
				],
			}),
			inputLabel: "source",
			labelPrefix: "clip_1",
		});

		expect(graph.filterSteps.join("\n")).toContain("scale=iw*0.5:ih*0.5");
		expect(graph.filterSteps.join("\n")).toContain("format=gbrpf32le");
		expect(graph.filterSteps.join("\n")).toContain("split=3");
		expect(graph.filterSteps.join("\n")).toContain("gblur=sigma=2.0000");
		expect(graph.filterSteps.join("\n")).toContain("gblur=sigma=4.0000");
		expect(graph.filterSteps.join("\n")).toContain("gblur=sigma=8.0000");
		expect(graph.filterSteps.at(-1)).toContain("blend=all_mode=screen");
	});
});
