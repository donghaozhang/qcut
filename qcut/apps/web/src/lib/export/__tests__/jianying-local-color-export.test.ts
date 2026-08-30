import { describe, expect, it } from "vitest";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import { DEFAULT_MEDIA_ENHANCEMENTS } from "@/lib/video/video-properties";
import { requiresJianyingLocalColorExport } from "../jianying-local-color-export";

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
