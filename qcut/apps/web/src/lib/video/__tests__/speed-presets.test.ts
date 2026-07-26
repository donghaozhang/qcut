import { describe, expect, it } from "vitest";
import { getEffectPresetById } from "@/lib/effects/effect-catalog";
import {
	createSpeedPresetKeyframes,
	getSpeedCurvePreset,
	identifySpeedCurvePreset,
	SPEED_CURVE_PRESETS,
	SPEED_POINT_PRESETS,
} from "../speed-presets";

describe("speed presets", () => {
	it("provides all six curve presets from the reference UI", () => {
		expect(SPEED_CURVE_PRESETS.map((preset) => preset.id)).toEqual([
			"montage",
			"hero",
			"bullet",
			"jump",
			"flash-in",
			"flash-out",
		]);
	});

	it("scales normalized presets to the selected clip", () => {
		const keyframes = createSpeedPresetKeyframes({
			preset: getSpeedCurvePreset({ id: "bullet" }),
			durationInFrames: 300,
		});

		expect(keyframes[0].frame).toBe(0);
		expect(keyframes.at(-1)?.frame).toBe(300);
		expect(Math.min(...keyframes.map((keyframe) => keyframe.value))).toBe(0.2);
	});

	it("recognizes presets regardless of keyframe order and detects edits", () => {
		const keyframes = createSpeedPresetKeyframes({
			preset: getSpeedCurvePreset({ id: "hero" }),
			durationInFrames: 300,
		});

		expect(
			identifySpeedCurvePreset({
				keyframes: [...keyframes].reverse(),
				durationInFrames: 300,
			})
		).toBe("hero");
		expect(
			identifySpeedCurvePreset({
				keyframes: keyframes.map((keyframe, index) =>
					index === 2 ? { ...keyframe, value: 3.5 } : keyframe
				),
				durationInFrames: 300,
			})
		).toBe("custom");
		expect(
			identifySpeedCurvePreset({
				keyframes: [],
				durationInFrames: 300,
			})
		).toBe("none");
	});

	it("composes every speed-point preset from a curve and existing effects", () => {
		expect(SPEED_POINT_PRESETS).toHaveLength(5);
		for (const preset of SPEED_POINT_PRESETS) {
			expect(
				SPEED_CURVE_PRESETS.some((curve) => curve.id === preset.curvePresetId)
			).toBe(true);
			expect(preset.effectIds.length).toBeGreaterThan(0);
			for (const presetId of preset.effectIds) {
				expect(getEffectPresetById({ presetId })?.id).toBe(presetId);
			}
		}
	});
});
