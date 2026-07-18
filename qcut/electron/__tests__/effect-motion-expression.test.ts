import { describe, expect, it } from "vitest";
import type { EffectRenderProgram } from "../ffmpeg/effect-render-types";
import {
	buildEffectMotionExpressions,
	hasEffectMotionProperty,
} from "../ffmpeg/effect-motion-expression";

describe("effect motion FFmpeg expressions", () => {
	it("returns identity expressions without motion stages", () => {
		expect(
			buildEffectMotionExpressions({
				timeVariable: "t",
				duration: 4,
				width: 1920,
				height: 1080,
			})
		).toEqual({
			x: "0",
			y: "0",
			scale: "1",
			rotation: "0",
			opacity: "1",
		});
	});

	it("builds canvas-relative and scalar expressions from one program", () => {
		const program: EffectRenderProgram = {
			version: 1,
			stages: [
				{
					kind: "motion",
					intensity: 0.5,
					channels: [
						{
							property: "x",
							waveform: "sine",
							amplitude: 0.1,
							frequencyHz: 1,
						},
						{
							property: "scale",
							waveform: "linear",
							amplitude: 0.2,
						},
					],
				},
			],
		};

		const expressions = buildEffectMotionExpressions({
			program,
			timeVariable: "t",
			duration: 4,
			width: 1000,
			height: 500,
		});

		expect(expressions.x).toContain("(1000)");
		expect(expressions.x).toContain("sin((t)*2*PI*1+0)");
		expect(expressions.scale).toContain("min(1,max(0,(t)/4))");
		expect(hasEffectMotionProperty({ program, property: "x" })).toBe(true);
		expect(hasEffectMotionProperty({ program, property: "rotation" })).toBe(
			false
		);
	});
});
