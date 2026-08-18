import { describe, expect, it } from "vitest";
import type {
	CompositionLayer,
	CompositionRegionEffect,
	EffectInstance,
} from "@qcut/editor-core";
import { buildRegionParametersByElementId } from "../region-effects";

function instance({
	enabled = true,
	parameters = { saturation: 0.5 },
}: {
	enabled?: boolean;
	parameters?: Record<string, number>;
} = {}): EffectInstance {
	return {
		id: "fx",
		name: "Rain",
		effectType: "color",
		parameters,
		duration: 0,
		enabled,
	} as unknown as EffectInstance;
}

function region({
	trackOrder = 0,
	startTime = 1,
	endTime = 4,
	effect = instance(),
}: Partial<{
	trackOrder: number;
	startTime: number;
	endTime: number;
	effect: EffectInstance;
}> = {}): CompositionRegionEffect {
	return {
		trackOrder,
		startTime,
		endTime,
		element: {
			id: `region-${trackOrder}`,
			name: "Rain",
			type: "effect",
			effect,
			duration: endTime - startTime,
			startTime,
			trimStart: 0,
			trimEnd: 0,
		},
		track: { id: "fx", name: "fx", type: "effect", elements: [] },
	} as CompositionRegionEffect;
}

function layer({
	id,
	trackOrder,
}: {
	id: string;
	trackOrder: number;
}): CompositionLayer {
	return {
		element: { id },
		trackOrder,
	} as CompositionLayer;
}

describe("buildRegionParametersByElementId", () => {
	it("covers only layers on tracks below the region's own", () => {
		const map = buildRegionParametersByElementId({
			plan: {
				regionEffects: [region({ trackOrder: 1 })],
				visualLayers: [
					layer({ id: "above", trackOrder: 0 }),
					layer({ id: "below", trackOrder: 2 }),
				],
			},
			currentTime: 2,
		});
		expect([...map.keys()]).toEqual(["below"]);
		expect(map.get("below")).toMatchObject({ saturation: 0.5 });
	});

	it("respects the time window and the enabled flag", () => {
		const plan = {
			regionEffects: [
				region({ trackOrder: 0 }),
				region({
					trackOrder: 0,
					startTime: 10,
					endTime: 12,
					effect: instance({ parameters: { contrast: 2 } }),
				}),
				region({ trackOrder: 0, effect: instance({ enabled: false }) }),
			],
			visualLayers: [layer({ id: "clip", trackOrder: 1 })],
		};
		expect(
			buildRegionParametersByElementId({ plan, currentTime: 2 }).get("clip")
		).toMatchObject({ saturation: 0.5 });
		expect(
			buildRegionParametersByElementId({ plan, currentTime: 11 }).get("clip")
		).toMatchObject({ contrast: 2 });
		expect(
			buildRegionParametersByElementId({ plan, currentTime: 20 }).size
		).toBe(0);
	});

	it("merges stacked regions covering the same layer", () => {
		const map = buildRegionParametersByElementId({
			plan: {
				regionEffects: [
					region({
						trackOrder: 0,
						effect: instance({ parameters: { saturation: 0.5 } }),
					}),
					region({
						trackOrder: 1,
						effect: instance({ parameters: { contrast: 2 } }),
					}),
				],
				visualLayers: [layer({ id: "clip", trackOrder: 2 })],
			},
			currentTime: 2,
		});
		expect(map.get("clip")).toMatchObject({ saturation: 0.5, contrast: 2 });
	});
});
