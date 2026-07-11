import { describe, expect, it } from "vitest";
import type {
	ClipTransition,
	MediaElement,
	TimelineTrack,
} from "@/types/timeline";
import { resolveActiveClipTransitionPreview } from "../clip-transition-preview";

function mediaElement({
	id,
	startTime,
}: {
	id: string;
	startTime: number;
}): MediaElement {
	return {
		id,
		name: id,
		type: "media",
		mediaId: `${id}-media`,
		startTime,
		duration: 2,
		trimStart: 0,
		trimEnd: 0,
	};
}

function track(): TimelineTrack {
	const transition: ClipTransition = {
		id: "ab",
		fromElementId: "a",
		toElementId: "b",
		presetId: "dissolve",
		type: "dissolve",
		duration: 0.5,
		easing: "linear",
	};
	return {
		id: "track-1",
		name: "Media",
		type: "media",
		elements: [
			mediaElement({ id: "a", startTime: 0 }),
			mediaElement({ id: "b", startTime: 2 }),
		],
		transitions: [transition],
	};
}

describe("active clip transition preview", () => {
	it("forces both clips active inside the centered window", () => {
		const result = resolveActiveClipTransitionPreview({
			tracks: [track()],
			currentTime: 1.9,
			fps: 30,
		});

		expect([...result.forceActiveElementIds]).toEqual(["a", "b"]);
		const outgoing = result.statesByElementId.get("a");
		expect(outgoing).toMatchObject({
			role: "from",
			isAudible: true,
			playbackWindow: { startTime: 1.75, endTime: 2.25 },
		});
		expect(outgoing?.progress).toBeCloseTo(0.3);
		expect(result.statesByElementId.get("b")).toMatchObject({
			role: "to",
			isAudible: false,
		});
	});

	it("switches audio ownership at the cut", () => {
		const result = resolveActiveClipTransitionPreview({
			tracks: [track()],
			currentTime: 2,
			fps: 30,
		});

		expect(result.statesByElementId.get("a")?.isAudible).toBe(false);
		expect(result.statesByElementId.get("b")?.isAudible).toBe(true);
	});

	it("does not force clips outside the transition window", () => {
		const result = resolveActiveClipTransitionPreview({
			tracks: [track()],
			currentTime: 1.7,
			fps: 30,
		});

		expect(result.forceActiveElementIds.size).toBe(0);
		expect(result.statesByElementId.size).toBe(0);
	});
});
