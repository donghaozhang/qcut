// @vitest-environment node
import { describe, expect, it } from "vitest";
import { compileFilterLabFfmpegPipeline } from "../native-pipeline/filters/filter-lab-pipeline-render.js";
import type { FilterLabRenderPlan } from "../native-pipeline/filters/filter-lab-render-plan.js";

function ffmpegPlan({
	resourceId,
	filterGraph,
	outputLabel = "filter_output",
}: {
	resourceId: string;
	filterGraph: string;
	outputLabel?: string;
}): Extract<FilterLabRenderPlan, { kind: "ffmpeg" }> {
	return {
		kind: "ffmpeg",
		filterGraph,
		outputLabel,
		evidence: {
			resourceId,
			title: resourceId,
			version: "v1",
			implementation: "single-lut",
			verification: "unverified",
			intensity: 100,
			backend: "ffmpeg-lut",
			fidelity: "lut",
		},
	};
}

describe("Filter Lab FFmpeg pipeline compiler", () => {
	it("keeps step order and isolates repeated labels", () => {
		const result = compileFilterLabFfmpegPipeline({
			prefix: "pipe",
			plans: [
				ffmpegPlan({
					resourceId: "one",
					filterGraph: "[0:v:0]hflip[filter_output]",
				}),
				ffmpegPlan({
					resourceId: "two",
					filterGraph: "[0:v:0]negate[filter_output]",
				}),
			],
		});

		expect(result).toEqual({
			filterGraph:
				"[0:v:0]hflip[pipe_0_filter_output];[pipe_0_filter_output]negate[pipe_1_filter_output]",
			outputLabel: "pipe_1_filter_output",
		});
	});

	it("namespaces internal multi-pass labels", () => {
		const result = compileFilterLabFfmpegPipeline({
			prefix: "multi",
			plans: [
				ffmpegPlan({
					resourceId: "one",
					filterGraph:
						"[0:v:0]split[left][right];[left][right]blend[filter_output]",
				}),
			],
		});

		expect(result.filterGraph).toBe(
			"[0:v:0]split[multi_0_left][multi_0_right];[multi_0_left][multi_0_right]blend[multi_0_filter_output]"
		);
	});

	it("rejects graphs that need another media input", () => {
		expect(() =>
			compileFilterLabFfmpegPipeline({
				plans: [
					ffmpegPlan({
						resourceId: "one",
						filterGraph: "[0:v:0][1:v:0]overlay[filter_output]",
					}),
				],
			})
		).toThrow("unsupported extra input");
	});
});
