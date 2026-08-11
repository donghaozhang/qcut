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
});
