import type { EffectRenderProgram } from "@qcut/editor-core";
import { describe, expect, it } from "vitest";
import {
	getEffectPersonTrackingStages,
	hasDetectedPerson,
	resolvePersonEffectAlpha,
} from "../effect-person-rendering";

const PROGRAM: EffectRenderProgram = {
	version: 1,
	stages: [
		{ kind: "filter" },
		{
			kind: "person-tracking",
			target: "person",
			treatment: "outline",
			fallback: "disable",
		},
	],
};

describe("effect person rendering", () => {
	it("collects person stages without changing their order", () => {
		expect(getEffectPersonTrackingStages({ program: PROGRAM })).toEqual([
			PROGRAM.stages[1],
		]);
	});

	it("distinguishes a detected person from an empty mask", () => {
		expect(hasDetectedPerson({ alpha: new Float32Array(100) })).toBe(false);
		const detected = new Float32Array(100);
		detected[50] = 0.9;
		expect(hasDetectedPerson({ alpha: detected })).toBe(true);
	});

	it("applies deterministic absent-person fallbacks", () => {
		const mask = {
			alpha: new Float32Array(16),
			width: 4,
			height: 4,
			inferenceMs: 1,
		};
		expect(resolvePersonEffectAlpha({ mask, fallback: "disable" })).toBeNull();
		expect(resolvePersonEffectAlpha({ mask, fallback: "full-frame" })).toEqual(
			new Float32Array(16).fill(1)
		);
		const center = resolvePersonEffectAlpha({ mask, fallback: "center" });
		expect(center).not.toBeNull();
		expect(Math.max(...(center ?? []))).toBeGreaterThan(0);
		expect(center?.[0]).toBe(0);
	});
});
