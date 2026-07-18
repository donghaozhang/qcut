import { describe, expect, it } from "vitest";
import {
	findEffectKeyframeAtTime,
	removeEffectKeyframe,
	resolveEffectAnimationValue,
	resolveEffectParametersAtTime,
	trimEffectAnimations,
	upsertEffectKeyframe,
} from "../keyframes.js";

describe("effect keyframes", () => {
	it("interpolates local effect time with easing", () => {
		const animation = {
			parameter: "brightness" as const,
			keyframes: [
				{ time: 0, value: 0, easing: "ease-in" as const },
				{ time: 2, value: 100 },
			],
			interpolation: "linear" as const,
		};
		expect(resolveEffectAnimationValue({ animation, time: 1 })).toBe(25);
		expect(
			resolveEffectParametersAtTime({
				parameters: { brightness: 8, contrast: 10 },
				animations: [animation],
				time: 2,
			})
		).toEqual({ brightness: 100, contrast: 10 });
	});

	it("upserts, finds, and removes a keyframe within frame tolerance", () => {
		const animations = upsertEffectKeyframe({
			parameter: "brightness",
			keyframe: { time: 1, value: 10 },
		});
		const updated = upsertEffectKeyframe({
			animations,
			parameter: "brightness",
			keyframe: { time: 1.01, value: 20 },
			tolerance: 0.02,
		});
		expect(updated[0].keyframes).toEqual([{ time: 1.01, value: 20 }]);
		expect(
			findEffectKeyframeAtTime({
				animations: updated,
				parameter: "brightness",
				time: 1,
				tolerance: 0.02,
			})?.value
		).toBe(20);
		expect(
			removeEffectKeyframe({
				animations: updated,
				parameter: "brightness",
				time: 1,
				tolerance: 0.02,
			})
		).toBeUndefined();
	});

	it("rebases animation time when an effect range is trimmed", () => {
		const animations = trimEffectAnimations({
			animations: [
				{
					parameter: "brightness",
					keyframes: [
						{ time: 0, value: 0 },
						{ time: 2, value: 20 },
						{ time: 4, value: 40 },
					],
					interpolation: "linear",
				},
			],
			startTime: 1,
			duration: 2,
		});

		expect(animations?.[0].keyframes).toEqual([
			{ time: 0, value: 10, easing: "linear" },
			{ time: 1, value: 20 },
			{ time: 2, value: 30 },
		]);
	});
});
