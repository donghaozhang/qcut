import { describe, expect, it } from "vitest";
import type { EffectRenderProgram } from "../types/effect-render";
import {
	collectEffectRenderStageKinds,
	combineEffectRenderPrograms,
	validateEffectRenderProgram,
} from "../effects/render-program";

describe("effect render programs", () => {
	it("combines stages without changing their order", () => {
		const filter: EffectRenderProgram = {
			version: 1,
			stages: [{ kind: "filter" }],
		};
		const motion: EffectRenderProgram = {
			version: 1,
			stages: [
				{
					kind: "motion",
					intensity: 1,
					channels: [{ property: "scale", waveform: "linear", amplitude: 0.1 }],
				},
			],
		};

		const combined = combineEffectRenderPrograms({
			programs: [filter, motion],
		});

		expect(combined?.stages.map((stage) => stage.kind)).toEqual([
			"filter",
			"motion",
		]);
	});

	it("reports all capability kinds in a composite program", () => {
		const program: EffectRenderProgram = {
			version: 1,
			stages: [
				{ kind: "filter" },
				{
					kind: "overlay",
					resourceId: "effects/light-leak",
					blendMode: "screen",
					opacity: 0.7,
					fit: "cover",
				},
			],
		};

		expect([...collectEffectRenderStageKinds({ program })]).toEqual([
			"filter",
			"overlay",
		]);
	});

	it("rejects invalid stage parameters", () => {
		const result = validateEffectRenderProgram({
			program: {
				version: 1,
				stages: [
					{
						kind: "motion",
						intensity: -1,
						channels: [],
					},
					{
						kind: "overlay",
						resourceId: " ",
						blendMode: "screen",
						opacity: 2,
						fit: "cover",
					},
				],
			},
		});

		expect(result.valid).toBe(false);
		expect(result.errors).toHaveLength(4);
	});
});
