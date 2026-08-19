import { describe, expect, it } from "vitest";
import { buildCompositionPlan } from "../timeline/composition-plan";
import type { EffectInstance, TimelineTrack } from "../types/timeline";

function instance(): EffectInstance {
	return {
		id: "fx-instance",
		name: "Rain",
		effectType: "color",
		parameters: { saturation: 0.5 },
		duration: 0,
		enabled: true,
	} as EffectInstance;
}

function tracks(): TimelineTrack[] {
	return [
		{
			id: "fx",
			name: "特效轨道",
			type: "effect",
			elements: [
				{
					id: "region",
					name: "Rain",
					type: "effect",
					effect: instance(),
					duration: 3,
					startTime: 1,
					trimStart: 0,
					trimEnd: 0,
				},
			],
		},
		{
			id: "main",
			name: "主轨道",
			type: "media",
			isMain: true,
			elements: [
				{
					id: "clip",
					name: "clip",
					type: "media",
					mediaId: "m1",
					duration: 10,
					startTime: 0,
					trimStart: 0,
					trimEnd: 0,
				},
			],
		},
	];
}

describe("composition plan region effects", () => {
	it("extracts untargeted effect segments and keeps them out of the drawables", () => {
		const plan = buildCompositionPlan({ tracks: tracks(), currentTime: 2 });
		expect(plan.regionEffects).toHaveLength(1);
		expect(plan.regionEffects[0]).toMatchObject({
			startTime: 1,
			endTime: 4,
			trackOrder: 0,
		});
		// The segment stays in the visual walk as a marker layer — renderers
		// apply it to the composite below, the way adjustment layers work —
		// drawn after (above) the clip it covers.
		expect(plan.visualLayers.map(({ element }) => element.id)).toEqual([
			"clip",
			"region",
		]);
		// The covered clip sits below the effect track in UI order.
		expect(plan.visualLayers[0].trackOrder).toBeGreaterThan(
			plan.regionEffects[0].trackOrder
		);
	});

	it("drops inactive segments outside their time range", () => {
		const plan = buildCompositionPlan({ tracks: tracks(), currentTime: 5 });
		expect(plan.regionEffects).toHaveLength(0);
	});

	it("ignores targeted effect elements — those belong to the per-target collector", () => {
		const withTarget = tracks();
		const fxTrack = withTarget[0];
		const segment = fxTrack.elements[0];
		if (segment.type === "effect") segment.targetElementId = "clip";
		const plan = buildCompositionPlan({ tracks: withTarget, currentTime: 2 });
		expect(plan.regionEffects).toHaveLength(0);
	});
});
