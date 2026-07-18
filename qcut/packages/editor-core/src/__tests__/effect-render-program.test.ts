import { describe, expect, it } from "vitest";
import type { EffectRenderProgram } from "../types/effect-render";
import {
	collectEffectRenderStageKinds,
	combineEffectRenderPrograms,
	validateEffectRenderProgram,
	withEffectRenderWindow,
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

	it("applies a clip-local window without mutating the source", () => {
		const program: EffectRenderProgram = {
			version: 1,
			stages: [
				{ kind: "filter" },
				{
					kind: "overlay",
					resourceId: "light",
					blendMode: "screen",
					opacity: 0.8,
					fit: "cover",
				},
			],
		};
		const scheduled = withEffectRenderWindow({
			program,
			window: { startSeconds: 1.25, endSeconds: 3.5 },
		});

		expect(
			scheduled.stages.every(
				(stage) => stage.window?.startSeconds === 1.25
			)
		).toBe(true);
		expect(program.stages.every((stage) => stage.window === undefined)).toBe(
			true
		);
		expect(validateEffectRenderProgram({ program: scheduled }).valid).toBe(
			true
		);
	});
});
