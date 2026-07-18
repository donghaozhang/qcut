import { describe, expect, it } from "vitest";
import type { EffectRenderProgram } from "@qcut/editor-core";
import { getEffectMotionState } from "../effect-motion-preview";

describe("getEffectMotionState", () => {
	it("returns identity without a render program", () => {
		expect(
			getEffectMotionState({
				localTime: 0,
				duration: 2,
				canvasWidth: 1920,
				canvasHeight: 1080,
			})
		).toEqual({
			offsetX: 0,
			offsetY: 0,
			scale: 1,
			rotation: 0,
			opacity: 1,
		});
	});

	it("samples periodic channels in canvas-relative units", () => {
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
							property: "rotation",
							waveform: "sine",
							amplitude: 10,
							frequencyHz: 1,
						},
					],
				},
			],
		};

		const state = getEffectMotionState({
			program,
			localTime: 0.25,
			duration: 2,
			canvasWidth: 1000,
			canvasHeight: 500,
		});

		expect(state.offsetX).toBeCloseTo(50);
		expect(state.rotation).toBeCloseTo(5);
	});

	it("uses clip progress for linear camera motion", () => {
		const program: EffectRenderProgram = {
			version: 1,
			stages: [
				{
					kind: "motion",
					intensity: 1,
					channels: [
						{
							property: "scale",
							waveform: "linear",
							amplitude: 0.2,
						},
					],
				},
			],
		};

		expect(
			getEffectMotionState({
				program,
				localTime: 2,
				duration: 4,
				canvasWidth: 1920,
				canvasHeight: 1080,
			}).scale
		).toBeCloseTo(1.1);
	});

	it("samples motion stages only within their render window", () => {
		const program: EffectRenderProgram = {
			version: 1,
			stages: [
				{
					kind: "motion",
					intensity: 1,
					window: { startSeconds: 1, endSeconds: 3 },
					channels: [
						{
							property: "scale",
							waveform: "linear",
							amplitude: 0.2,
						},
					],
				},
			],
		};
		const scaleAt = (localTime: number) =>
			getEffectMotionState({
				program,
				localTime,
				duration: 4,
				canvasWidth: 1920,
				canvasHeight: 1080,
			}).scale;

		expect(scaleAt(0.5)).toBe(1);
		expect(scaleAt(2)).toBeCloseTo(1.1);
		expect(scaleAt(3)).toBe(1);
	});
});
