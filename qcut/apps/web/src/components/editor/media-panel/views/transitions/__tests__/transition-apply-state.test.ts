import { describe, expect, it } from "vitest";
import type { SelectedElement } from "@/stores/timeline/types";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import { getTransitionApplyState } from "../transition-apply-state";

function mediaElement({
	id,
	name,
	startTime,
	duration,
}: {
	id: string;
	name: string;
	startTime: number;
	duration: number;
}): MediaElement {
	return {
		id,
		name,
		type: "media",
		mediaId: `${id}-media`,
		startTime,
		duration,
		trimStart: 0,
		trimEnd: 0,
	};
}

function mediaTrack({
	id = "track-1",
	elements,
}: {
	id?: string;
	elements: MediaElement[];
}): TimelineTrack {
	return {
		id,
		name: "Media",
		type: "media",
		elements,
	};
}

function selection({
	trackId = "track-1",
	elementId,
}: {
	trackId?: string;
	elementId: string;
}): SelectedElement {
	return { trackId, elementId };
}

describe("transition apply state", () => {
	it("is ready for two touching media clips on the same track", () => {
		const tracks = [
			mediaTrack({
				elements: [
					mediaElement({
						id: "clip-a",
						name: "Clip A",
						startTime: 0,
						duration: 4,
					}),
					mediaElement({
						id: "clip-b",
						name: "Clip B",
						startTime: 4,
						duration: 3,
					}),
				],
			}),
		];

		const result = getTransitionApplyState({
			selectedElements: [
				selection({ elementId: "clip-b" }),
				selection({ elementId: "clip-a" }),
			],
			tracks,
		});

		expect(result.status).toBe("ready");
		expect(result).toMatchObject({
			fromElementId: "clip-a",
			toElementId: "clip-b",
			trackId: "track-1",
		});
	});

	it("requires exactly two selected clips", () => {
		const result = getTransitionApplyState({
			selectedElements: [selection({ elementId: "clip-a" })],
			tracks: [
				mediaTrack({
					elements: [
						mediaElement({
							id: "clip-a",
							name: "Clip A",
							startTime: 0,
							duration: 4,
						}),
					],
				}),
			],
		});

		expect(result).toEqual({
			status: "disabled",
			message: "Select two adjacent media clips to prepare a transition.",
		});
	});

	it("rejects clips with a gap between them", () => {
		const result = getTransitionApplyState({
			selectedElements: [
				selection({ elementId: "clip-a" }),
				selection({ elementId: "clip-b" }),
			],
			tracks: [
				mediaTrack({
					elements: [
						mediaElement({
							id: "clip-a",
							name: "Clip A",
							startTime: 0,
							duration: 4,
						}),
						mediaElement({
							id: "clip-b",
							name: "Clip B",
							startTime: 5,
							duration: 3,
						}),
					],
				}),
			],
		});

		expect(result).toEqual({
			status: "disabled",
			message: "The selected clips need to touch at a cut point.",
		});
	});
});
