import { describe, expect, it } from "vitest";
import { DEFAULT_MEDIA_PERSPECTIVE } from "@/lib/video/video-properties";
import type { MediaTransformSnapshot } from "../media-transform-geometry";
import { mutationFromSnapshot } from "../media-transform-overlay-helpers";

const item: MediaTransformSnapshot = {
	trackId: "t",
	elementId: "e",
	x: 12,
	y: -4,
	scaleX: 0.8,
	scaleY: 0.8,
	rotation: 15,
	maintainAspectRatio: true,
	flipHorizontal: false,
	flipVertical: false,
	crop: { top: 0.1, right: 0, bottom: 0, left: 0 },
	perspective: { ...DEFAULT_MEDIA_PERSPECTIVE, topLeftX: 0.2 },
};

/**
 * A move must never write crop or corner values back: with 变形 switched off
 * the overlay snapshot still carries the stored warp, and re-writing it on
 * every drag would also stamp corner keyframes onto unrelated interactions.
 */
describe("mutationFromSnapshot", () => {
	it("scopes drag/resize/rotate to the transform fields", () => {
		for (const kind of ["drag", "resize", "rotate"] as const) {
			expect(mutationFromSnapshot({ item, kind })).toEqual({
				x: 12,
				y: -4,
				scaleX: 0.8,
				scaleY: 0.8,
				rotation: 15,
			});
		}
	});

	it("scopes crop and perspective interactions to their own field", () => {
		expect(mutationFromSnapshot({ item, kind: "crop" })).toEqual({
			crop: item.crop,
		});
		expect(mutationFromSnapshot({ item, kind: "perspective" })).toEqual({
			perspective: item.perspective,
		});
	});
});
