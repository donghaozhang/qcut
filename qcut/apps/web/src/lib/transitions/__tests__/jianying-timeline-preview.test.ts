import { describe, expect, it } from "vitest";
import type { MediaItem } from "@/stores/media/media-store-types";
import type {
	ClipTransition,
	MediaElement,
	TimelineTrack,
} from "@/types/timeline";
import {
	resolveJianyingTimelinePreviewCandidate,
	resolveJianyingTimelinePreviewDimensions,
} from "../jianying-timeline-preview";

const PACKAGE_HASH = "a".repeat(32);

function mediaElement({
	id,
	startTime,
	reverse = false,
	speedKeyframes,
}: {
	id: string;
	startTime: number;
	reverse?: boolean;
	speedKeyframes?: MediaElement["speedKeyframes"];
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
		reverse,
		speedKeyframes,
	};
}

function mediaItem({ id }: { id: string }): MediaItem {
	return {
		id: `${id}-media`,
		name: `${id}.mp4`,
		type: "video",
		file: new File([new Uint8Array(128)], `${id}.mp4`, {
			lastModified: 1_700_000_000_000,
		}),
	};
}

function timeline({
	reverseFrom = false,
	packageHash = PACKAGE_HASH,
	speedKeyframes,
}: {
	reverseFrom?: boolean;
	packageHash?: string;
	speedKeyframes?: MediaElement["speedKeyframes"];
} = {}): { tracks: TimelineTrack[]; mediaItems: MediaItem[] } {
	const transition: ClipTransition = {
		id: "transition-ab",
		fromElementId: "a",
		toElementId: "b",
		presetId: "jianying-local-3d-space",
		engine: "jianying-local",
		packageHash,
		type: "dissolve",
		duration: 1,
		easing: "linear",
	};
	return {
		tracks: [
			{
				id: "track-1",
				name: "Media",
				type: "media",
				elements: [
					mediaElement({
						id: "a",
						startTime: 0,
						reverse: reverseFrom,
						speedKeyframes,
					}),
					mediaElement({ id: "b", startTime: 2 }),
				],
				transitions: [transition],
			},
		],
		mediaItems: [mediaItem({ id: "a" }), mediaItem({ id: "b" })],
	};
}

function candidateFor({
	reverseFrom = false,
	packageHash = PACKAGE_HASH,
	speedKeyframes,
}: {
	reverseFrom?: boolean;
	packageHash?: string;
	speedKeyframes?: MediaElement["speedKeyframes"];
} = {}) {
	const fixture = timeline({ reverseFrom, packageHash, speedKeyframes });
	return resolveJianyingTimelinePreviewCandidate({
		...fixture,
		currentTime: 0,
		fps: 30,
		canvasSize: { width: 3840, height: 2160 },
		resolveMediaPath: ({ mediaItem: item }) => `/private/media/${item.name}`,
	});
}

describe("Jianying timeline transition preview", () => {
	it("builds a local two-sided proxy request before the transition starts", () => {
		const candidate = candidateFor();

		expect(candidate).not.toBeNull();
		expect(candidate).toMatchObject({
			transitionId: "transition-ab",
			windowStart: 1.5,
			windowEnd: 2.5,
			request: {
				presetId: "jianying-local-3d-space",
				packageHash: PACKAGE_HASH,
				duration: 1,
				fps: 30,
				width: 960,
				height: 540,
				inputA: {
					kind: "video",
					sourceStart: 1.5,
					sourceDuration: 0.5,
					playbackRate: 1,
					reverse: false,
				},
				inputB: {
					kind: "video",
					sourceStart: 0,
					sourceDuration: 0.5,
					playbackRate: 1,
					reverse: false,
				},
			},
		});
		expect(candidate?.cacheKey).not.toContain("/private/media");
	});

	it("preserves reverse playback for the outgoing source", () => {
		const candidate = candidateFor({ reverseFrom: true });

		expect(candidate?.request.inputA).toMatchObject({
			sourceStart: 0,
			sourceDuration: 0.5,
			playbackRate: 1,
			reverse: true,
		});
	});

	it("rejects invalid package identities and nonlinear speed windows", () => {
		expect(candidateFor({ packageHash: "/local/package/path" })).toBeNull();
		expect(
			candidateFor({
				speedKeyframes: [{ id: "speed", frame: 0, value: 1, easing: "linear" }],
			})
		).toBeNull();
	});

	it("bounds preview dimensions without changing aspect ratio", () => {
		expect(
			resolveJianyingTimelinePreviewDimensions({ width: 1080, height: 1920 })
		).toEqual({ width: 540, height: 960 });
		expect(
			resolveJianyingTimelinePreviewDimensions({ width: 639, height: 359 })
		).toEqual({ width: 640, height: 360 });
	});
});
