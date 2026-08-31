import { describe, expect, it } from "vitest";
import type { MediaFilterEffect, MediaFilterStack } from "@/types/timeline";
import {
	hasEnabledFilterStack,
	mediaFilterStackLayers,
} from "../color-filter-stack";
import { DEFAULT_MEDIA_COLOR_SETTINGS } from "../color-properties";

function lutEffect({
	id,
	intensity = 70,
	enabled = true,
}: {
	id: string;
	intensity?: number;
	enabled?: boolean;
}): MediaFilterEffect {
	return {
		id,
		enabled,
		resourceId: "111",
		version: "cafe0123",
		intensity,
		implementation: "lut",
		fidelity: "lut",
		color: {
			lut: {
				enabled: true,
				presetId: "filter-lab:111:cafe0123",
				name: "Filter 111",
				intensity,
				skinProtection: 0,
				cube: {
					size: 2,
					domainMin: [0, 0, 0],
					domainMax: [1, 1, 1],
					values: [0, 0, 0, 1, 1, 1],
				},
			},
		},
	};
}

function passthroughEffect({ id }: { id: string }): MediaFilterEffect {
	return {
		id,
		enabled: true,
		resourceId: "222",
		version: "cafe0123",
		intensity: 100,
		implementation: "shader",
		fidelity: "safe-passthrough",
		color: {},
	};
}

describe("mediaFilterStackLayers", () => {
	it("keeps effect order and skips disabled or payload-free effects", () => {
		const stack: MediaFilterStack = {
			enabled: true,
			effects: [
				lutEffect({ id: "a", intensity: 70 }),
				lutEffect({ id: "b", intensity: 30, enabled: false }),
				passthroughEffect({ id: "c" }),
				lutEffect({ id: "d", intensity: 40 }),
			],
		};
		const layers = mediaFilterStackLayers({ filterStack: stack });
		expect(layers).toHaveLength(2);
		expect(layers.map((layer) => layer.settings.lut.intensity)).toEqual([
			70, 40,
		]);
		for (const layer of layers) {
			expect(layer.settings.enabled).toBe(true);
			expect(layer.masks).toEqual([]);
			// Every non-lut slot stays at defaults so the layer only applies
			// its own effect.
			expect(layer.settings.basic).toEqual(DEFAULT_MEDIA_COLOR_SETTINGS.basic);
		}
	});

	it("returns nothing for disabled or legacy-absent stacks", () => {
		expect(mediaFilterStackLayers({ filterStack: undefined })).toEqual([]);
		expect(
			mediaFilterStackLayers({
				filterStack: { enabled: false, effects: [lutEffect({ id: "a" })] },
			})
		).toEqual([]);
	});
});

describe("hasEnabledFilterStack", () => {
	it("requires an enabled stack with at least one renderable effect", () => {
		expect(hasEnabledFilterStack({ filterStack: undefined })).toBe(false);
		expect(
			hasEnabledFilterStack({
				filterStack: {
					enabled: true,
					effects: [passthroughEffect({ id: "a" })],
				},
			})
		).toBe(false);
		expect(
			hasEnabledFilterStack({
				filterStack: { enabled: true, effects: [lutEffect({ id: "a" })] },
			})
		).toBe(true);
	});
});
