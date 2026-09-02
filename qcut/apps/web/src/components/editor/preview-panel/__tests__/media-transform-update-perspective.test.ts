import { describe, expect, it } from "vitest";
import type { MediaElement } from "@/types/timeline";
import { DEFAULT_MEDIA_PERSPECTIVE } from "@/lib/video/video-properties";
import { buildMediaCanvasUpdate } from "../media-transform-update";

function element(overrides: Partial<MediaElement> = {}): MediaElement {
	return {
		id: "clip-1",
		type: "media",
		name: "clip",
		mediaId: "media-1",
		startTime: 2,
		duration: 5,
		trimStart: 0,
		trimEnd: 0,
		...overrides,
	} as MediaElement;
}

describe("buildMediaCanvasUpdate perspective", () => {
	const warped = { ...DEFAULT_MEDIA_PERSPECTIVE, topLeftX: 0.2, topLeftY: 0.1 };

	it("passes the corner-pin straight through when nothing is keyframed", () => {
		const update = buildMediaCanvasUpdate({
			element: element(),
			mutation: { perspective: warped },
			currentTime: 3,
			fps: 30,
		});
		expect(update).toEqual({ perspective: warped });
	});

	it("upserts a keyframe at the current frame only for corners that already animate", () => {
		const update = buildMediaCanvasUpdate({
			element: element({
				keyframes: {
					topLeftX: [{ id: "k0", frame: 0, value: 0, easing: "linear" }],
				},
			}),
			mutation: { perspective: warped },
			currentTime: 3,
			fps: 30,
		});
		expect(update.perspective).toEqual(warped);
		expect(update.keyframes?.topLeftX?.map((k) => [k.frame, k.value])).toEqual([
			[0, 0],
			[30, 0.2],
		]);
		expect(update.keyframes?.topLeftY).toBeUndefined();
	});
});
