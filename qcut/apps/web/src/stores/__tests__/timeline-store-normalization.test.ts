import { describe, expect, it } from "vitest";
import type { MediaElement } from "@/types/timeline";
import { normalizeMediaElement } from "../timeline/timeline-store-normalization";

function mediaElement(overrides: Partial<MediaElement> = {}): MediaElement {
	return {
		id: "media-1",
		type: "media",
		mediaId: "asset-1",
		name: "Video",
		duration: 5,
		startTime: 0,
		trimStart: 0,
		trimEnd: 0,
		...overrides,
	};
}

describe("timeline media mask normalization", () => {
	it("materializes a legacy single mask as the first stack item", () => {
		const normalized = normalizeMediaElement({
			element: mediaElement({
				mask: {
					type: "rectangle",
					centerX: 0.3,
					centerY: 0.4,
					width: 0.5,
					height: 0.6,
					rotation: 8,
					feather: 0.1,
					invert: false,
				},
			}),
		}) as MediaElement;

		expect(normalized.masks).toHaveLength(1);
		expect(normalized.masks?.[0]).toMatchObject({
			id: "mask-1",
			name: "Mask 1",
			type: "rectangle",
			centerX: 0.3,
		});
		expect(normalized.mask).toEqual(normalized.masks?.[0]);
	});

	it("preserves an ordered stack without duplicating the legacy field", () => {
		const normalized = normalizeMediaElement({
			element: mediaElement({
				mask: {
					type: "ellipse",
					centerX: 0.1,
					centerY: 0.1,
					width: 0.2,
					height: 0.2,
					rotation: 0,
					feather: 0,
					invert: false,
				},
				masks: [
					{
						id: "main",
						name: "Main",
						type: "star",
						blendMode: "add",
						centerX: 0.5,
						centerY: 0.5,
						width: 0.8,
						height: 0.8,
						rotation: 0,
						feather: 0,
						invert: false,
					},
					{
						id: "hole",
						name: "Hole",
						type: "heart",
						blendMode: "subtract",
						centerX: 0.5,
						centerY: 0.5,
						width: 0.3,
						height: 0.3,
						rotation: 0,
						feather: 0,
						invert: false,
					},
				],
			}),
		}) as MediaElement;

		expect(normalized.masks?.map((mask) => mask.id)).toEqual(["main", "hole"]);
		expect(normalized.mask?.id).toBe("main");
	});
});
