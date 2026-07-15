import { describe, expect, it } from "vitest";
import {
	clipTransitionSupportsDirection,
	getClipTransitionTuningControls,
	removeClipTransitionTuningKeyframe,
	resolveClipTransitionTuning,
	transitionTuningDefaults,
	upsertClipTransitionTuningKeyframe,
} from "../timeline/transition-tuning.js";
import type { ClipTransition } from "../types/timeline.js";

function transition({
	tuningKeyframes,
}: {
	tuningKeyframes?: ClipTransition["tuningKeyframes"];
} = {}): ClipTransition {
	return {
		id: "transition-1",
		fromElementId: "a",
		toElementId: "b",
		presetId: "lens-flare",
		type: "lens-flare",
		duration: 1,
		easing: "easeInOut",
		tuning: {
			frequency: 2,
			intensity: 0.5,
			tint: "#000000",
		},
		tuningKeyframes,
	};
}

describe("transition tuning", () => {
	it("resolves numeric and color keyframes at normalized progress", () => {
		const result = resolveClipTransitionTuning({
			progress: 0.5,
			transition: transition({
				tuningKeyframes: {
					intensity: [
						{ id: "a", easing: "linear", position: 0, value: 0.5 },
						{ id: "b", easing: "linear", position: 1, value: 1.5 },
					],
					tint: [
						{ id: "c", easing: "linear", position: 0, value: "#000000" },
						{ id: "d", easing: "linear", position: 1, value: "#ffffff" },
					],
				},
			}),
		});

		expect(result).toEqual({
			frequency: 2,
			intensity: 1,
			tint: "#808080",
		});
	});

	it("clamps tuning values and keyframe positions", () => {
		const result = resolveClipTransitionTuning({
			progress: 2,
			transition: transition({
				tuningKeyframes: {
					frequency: [
						{ id: "a", easing: "linear", position: -1, value: 0 },
						{ id: "b", easing: "linear", position: 2, value: 8 },
					],
					intensity: [
						{ id: "c", easing: "linear", position: 0, value: 0 },
						{ id: "d", easing: "linear", position: 1, value: 4 },
					],
				},
			}),
		});

		expect(result.frequency).toBe(4);
		expect(result.intensity).toBe(2);
	});

	it("upserts, sorts, and removes keyframes by property", () => {
		const inserted = upsertClipTransitionTuningKeyframe({
			keyframe: { id: "late", easing: "linear", position: 0.9, value: 1.4 },
			keyframes: undefined,
			property: "intensity",
		});
		const replaced = upsertClipTransitionTuningKeyframe({
			keyframe: { id: "middle", easing: "easeOut", position: 0.4, value: 0.8 },
			keyframes: inserted,
			property: "intensity",
		});
		const removed = removeClipTransitionTuningKeyframe({
			keyframes: replaced,
			position: 0.9,
			property: "intensity",
		});

		expect(replaced.intensity?.map((keyframe) => keyframe.id)).toEqual([
			"middle",
			"late",
		]);
		expect(removed.intensity?.map((keyframe) => keyframe.id)).toEqual([
			"middle",
		]);
	});

	it("publishes controls, defaults, and directional support metadata", () => {
		expect(
			getClipTransitionTuningControls({ type: "lens-flare" }).map(
				(control) => control.property
			)
		).toEqual(["intensity", "tint"]);
		expect(transitionTuningDefaults({ type: "light-leak" })).toEqual({
			frequency: 1,
			intensity: 1,
			tint: "#ff5a1f",
		});
		expect(clipTransitionSupportsDirection({ type: "slide" })).toBe(true);
		expect(clipTransitionSupportsDirection({ type: "dissolve" })).toBe(false);
	});
});
