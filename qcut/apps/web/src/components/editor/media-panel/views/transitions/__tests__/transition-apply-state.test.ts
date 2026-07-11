import { describe, expect, it } from "vitest";
import type { SelectedElement } from "@/stores/timeline/types";
import type {
	MediaElement,
	TextElement,
	TimelineTrack,
} from "@/types/timeline";
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

function textElement({
	id,
	name,
	startTime,
	duration,
}: {
	id: string;
	name: string;
	startTime: number;
	duration: number;
}): TextElement {
	return {
		id,
		name,
		type: "text",
		content: name,
		fontSize: 24,
		fontFamily: "Arial",
		color: "#ffffff",
		backgroundColor: "transparent",
		textAlign: "center",
		fontWeight: "normal",
		fontStyle: "normal",
		textDecoration: "none",
		x: 0,
		y: 0,
		rotation: 0,
		opacity: 1,
		startTime,
		duration,
		trimStart: 0,
		trimEnd: 0,
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

	it("rejects selections that include non-media elements", () => {
		const result = getTransitionApplyState({
			selectedElements: [
				selection({ elementId: "clip-a" }),
				selection({ trackId: "track-text", elementId: "title-a" }),
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
					],
				}),
				{
					id: "track-text",
					name: "Text",
					type: "text",
					elements: [
						textElement({
							id: "title-a",
							name: "Title A",
							startTime: 0,
							duration: 4,
						}),
					],
				},
			],
		});

		expect(result).toEqual({
			status: "disabled",
			message: "Transitions can be prepared only between media clips.",
		});
	});

	it("rejects selections referencing elements missing from the tracks", () => {
		const result = getTransitionApplyState({
			selectedElements: [
				selection({ elementId: "clip-a" }),
				selection({ elementId: "clip-missing" }),
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
					],
				}),
			],
		});

		expect(result).toEqual({
			status: "disabled",
			message: "Transitions can be prepared only between media clips.",
		});
	});

	it("rejects media clips selected on different tracks", () => {
		const result = getTransitionApplyState({
			selectedElements: [
				selection({ trackId: "track-1", elementId: "clip-a" }),
				selection({ trackId: "track-2", elementId: "clip-b" }),
			],
			tracks: [
				mediaTrack({
					id: "track-1",
					elements: [
						mediaElement({
							id: "clip-a",
							name: "Clip A",
							startTime: 0,
							duration: 4,
						}),
					],
				}),
				mediaTrack({
					id: "track-2",
					elements: [
						mediaElement({
							id: "clip-b",
							name: "Clip B",
							startTime: 4,
							duration: 3,
						}),
					],
				}),
			],
		});

		expect(result).toEqual({
			status: "disabled",
			message: "Select two adjacent clips on the same media track.",
		});
	});

	it("reports the max duration and clip names when ready", () => {
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
							startTime: 4,
							duration: 3,
						}),
					],
				}),
			],
		});

		expect(result.status).toBe("ready");
		if (result.status !== "ready") return;
		// 2 * min(fromDuration = 4, toDuration = 3)
		expect(result.maxDuration).toBe(6);
		expect(result.fromMediaId).toBe("clip-a-media");
		expect(result.toMediaId).toBe("clip-b-media");
		expect(result.message).toBe("Ready between Clip A and Clip B.");
	});
});
