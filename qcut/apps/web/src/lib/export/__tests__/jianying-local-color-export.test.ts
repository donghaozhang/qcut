import { describe, expect, it } from "vitest";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import { DEFAULT_MEDIA_ENHANCEMENTS } from "@/lib/video/video-properties";
import { requiresJianyingLocalColorExport } from "../jianying-local-color-export";
import { DEFAULT_MEDIA_COLOR_SETTINGS } from "@/lib/color/color-properties";
import { independentFogSettings } from "../../../../../../electron/qcut-independent-filter/contract";

function mediaElement({
	portraitEnabled,
}: {
	portraitEnabled: boolean;
}): MediaElement {
	return {
		id: "media-1",
		type: "media",
		mediaId: "asset-1",
		name: "Portrait",
		startTime: 0,
		duration: 1,
		trimStart: 0,
		trimEnd: 0,
		portraitAdjustments: {
			enabled: portraitEnabled,
			values: { face_adjust_TotalFace: 80 },
		},
	};
}

function tracks({ element }: { element: MediaElement }): TimelineTrack[] {
	return [
		{
			id: "track-1",
			name: "Media",
			type: "media",
			locked: false,
			muted: false,
			elements: [element],
		},
	];
}

describe("Jianying local export selection", () => {
	it.each([
		"qcut-metal-fog-v1",
		"qcut-metal-lut-v1",
	] as const)("routes %s media, stacks, and adjustment layers through canvas export", (provider) => {
		const color = {
			...structuredClone(DEFAULT_MEDIA_COLOR_SETTINGS),
			multiPass: independentFogSettings(),
		};
		color.multiPass.nativeEffect!.provider = provider;
		const element = mediaElement({ portraitEnabled: false });
		element.color = color;
		expect(
			requiresJianyingLocalColorExport({ tracks: tracks({ element }) })
		).toBe(true);
		element.color = undefined;
		element.filterStack = {
			enabled: true,
			effects: [
				{
					id: "own-fog",
					resourceId: color.multiPass.resourceId,
					version: color.multiPass.version,
					intensity: 100,
					implementation: "shader",
					fidelity: "native-local",
					enabled: true,
					color,
				},
			],
		};
		expect(
			requiresJianyingLocalColorExport({ tracks: tracks({ element }) })
		).toBe(true);
		element.filterStack.enabled = false;
		expect(
			requiresJianyingLocalColorExport({ tracks: tracks({ element }) })
		).toBe(false);
		const adjustmentTracks = tracks({ element });
		adjustmentTracks[0].elements = [
			{
				id: "grade",
				type: "adjustment",
				name: "Fog",
				startTime: 0,
				duration: 1,
				trimStart: 0,
				trimEnd: 0,
				color,
			},
		];
		expect(requiresJianyingLocalColorExport({ tracks: adjustmentTracks })).toBe(
			true
		);
	});
	it("forces fixed-timestamp canvas export for active binary retouch", () => {
		expect(
			requiresJianyingLocalColorExport({
				tracks: tracks({ element: mediaElement({ portraitEnabled: true }) }),
			})
		).toBe(true);
		expect(
			requiresJianyingLocalColorExport({
				tracks: tracks({ element: mediaElement({ portraitEnabled: false }) }),
			})
		).toBe(false);
	});

	it("tolerates a partial color object from a programmatic caller", () => {
		// addElementToTrack stores caller-provided elements verbatim; only a
		// project reload normalizes them. The policy walker must not crash on
		// a color grade that carries just the fields the caller set.
		const element = mediaElement({ portraitEnabled: false });
		element.color = {
			enabled: true,
			basic: { enabled: true, saturation: -100 },
		} as unknown as MediaElement["color"];

		expect(
			requiresJianyingLocalColorExport({ tracks: tracks({ element }) })
		).toBe(false);
	});

	it("keeps experimental eye correction on the fixed-timestamp renderer path", () => {
		const element = mediaElement({ portraitEnabled: false });
		element.enhancements = {
			...DEFAULT_MEDIA_ENHANCEMENTS,
			labEyeCorrection: 40,
		};

		expect(
			requiresJianyingLocalColorExport({ tracks: tracks({ element }) })
		).toBe(true);
	});
});
