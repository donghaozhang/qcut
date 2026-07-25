import { afterEach, describe, expect, it } from "vitest";
import { useSegmentationStore } from "@/stores/ai/segmentation-store";
import { createMediaMask } from "@/lib/video/media-mask-stack";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import {
	attachGeneratedMask,
	buildGeneratedMaskStack,
	detachGeneratedMask,
	pauseGeneratedMaskTracking,
	updateGeneratedMaskTrackingProgress,
} from "../generated-mask-attachment";

function mediaElement(overrides: Partial<MediaElement> = {}): MediaElement {
	return {
		id: "clip-1",
		type: "media",
		mediaId: "source-1",
		name: "Source clip",
		duration: 5,
		startTime: 5,
		trimStart: 0,
		trimEnd: 0,
		...overrides,
	};
}

describe("generated mask attachment", () => {
	afterEach(() => {
		useTimelineStore.setState({
			_tracks: [],
			tracks: [],
			history: [],
			redoStack: [],
		});
		useSegmentationStore.setState({ trackingRequest: null });
	});

	it("prepends a generated mask without disturbing the existing stack", () => {
		const existing = createMediaMask({
			id: "existing",
			type: "ellipse",
			index: 0,
		});
		const result = buildGeneratedMaskStack({
			element: mediaElement(),
			existingMasks: [existing],
			sourceMediaId: "person-alpha",
			type: "person",
			source: "mediapipe",
			name: "Person",
			currentTime: 6,
			fps: 30,
			generatedId: "person-mask",
		});

		expect(result.selectedMaskId).toBe("person-mask");
		expect(result.masks.map((mask) => mask.id)).toEqual([
			"person-mask",
			"existing",
		]);
		expect(result.masks[0]).toMatchObject({
			sourceMediaId: "person-alpha",
			type: "person",
			tracking: {
				direction: "both",
				status: "ready",
				source: "mediapipe",
			},
		});
	});

	it("replaces the requested mask in place when retracking", () => {
		const base = createMediaMask({ id: "base", type: "ellipse", index: 0 });
		const tracked = {
			...createMediaMask({ id: "tracked", type: "rectangle", index: 1 }),
			name: "Keep this name",
			blendMode: "subtract" as const,
		};
		const result = buildGeneratedMaskStack({
			element: mediaElement(),
			existingMasks: [base, tracked],
			sourceMediaId: "sam3-alpha",
			type: "object",
			source: "sam3",
			name: "Ignored replacement name",
			trackingRequest: {
				requestId: "request-1",
				elementId: "clip-1",
				maskId: "tracked",
				direction: "forward",
				anchorFrame: 12,
			},
			currentTime: 6,
			fps: 30,
			generatedId: "unused-id",
		});

		expect(result.selectedMaskId).toBe("tracked");
		expect(result.masks).toHaveLength(2);
		expect(result.masks[0].id).toBe("base");
		expect(result.masks[1]).toMatchObject({
			id: "tracked",
			name: "Keep this name",
			blendMode: "subtract",
			sourceMediaId: "sam3-alpha",
			tracking: {
				direction: "forward",
				status: "ready",
				source: "sam3",
			},
		});
	});

	it("maps source tracking samples into the trimmed clip frame range", () => {
		const samples = [0, 10, 20, 30, 40, 50, 60].map((frame) => ({
			frame,
			centerX: 0.3 + frame / 1000,
			centerY: 0.5,
			width: 0.25,
			height: 0.7,
		}));
		const result = buildGeneratedMaskStack({
			element: mediaElement({ duration: 6, trimStart: 1, trimEnd: 1 }),
			existingMasks: [],
			sourceMediaId: "person-alpha",
			type: "person",
			source: "mediapipe",
			name: "Person",
			trackingSamples: samples,
			currentTime: 5,
			fps: 10,
			generatedId: "person-mask",
		});

		expect(
			result.masks[0].keyframes?.centerX?.map((keyframe) => keyframe.frame)
		).toEqual([0, 40]);
		expect(result.masks[0].tracking?.status).toBe("ready");
	});

	it("detaches only matching generated masks and records one undo snapshot", () => {
		const generatedMask = {
			...createMediaMask({ id: "generated", type: "person", index: 0 }),
			sourceMediaId: "person-alpha",
		};
		const retainedMask = {
			...createMediaMask({ id: "retained", type: "ellipse", index: 1 }),
			sourceMediaId: "other-alpha",
		};
		const targetedTrack: TimelineTrack = {
			id: "track-1",
			name: "Main Track",
			type: "media",
			isMain: true,
			elements: [
				mediaElement({
					id: "clip-1",
					masks: [generatedMask, retainedMask],
				}),
				mediaElement({
					id: "clip-2",
					masks: [{ ...generatedMask, id: "other-generated" }],
				}),
			],
		};
		useTimelineStore.setState({
			_tracks: [targetedTrack],
			tracks: [targetedTrack],
			history: [],
			redoStack: [],
		});

		const detached = detachGeneratedMask({
			sourceMediaId: "person-alpha",
			targetElementId: "clip-1",
		});

		const state = useTimelineStore.getState();
		const firstClip = state._tracks[0].elements[0] as MediaElement;
		const secondClip = state._tracks[0].elements[1] as MediaElement;
		expect(detached).toBe(1);
		expect(firstClip.masks?.map((mask) => mask.id)).toEqual(["retained"]);
		expect(secondClip.masks?.map((mask) => mask.id)).toEqual([
			"other-generated",
		]);
		expect(state.history).toHaveLength(1);
		expect(state.history[0][0].elements[0]).toMatchObject({
			id: "clip-1",
			masks: [{ id: "generated" }, { id: "retained" }],
		});
	});

	it("pauses the requested generated mask tracking job", () => {
		const trackedMask = {
			...createMediaMask({ id: "tracked", type: "object", index: 0 }),
			tracking: {
				direction: "forward" as const,
				status: "processing" as const,
				source: "sam3" as const,
				progress: 44,
				anchorFrame: 12,
			},
		};
		const targetedTrack: TimelineTrack = {
			id: "track-1",
			name: "Main Track",
			type: "media",
			isMain: true,
			elements: [
				mediaElement({
					id: "clip-1",
					masks: [trackedMask],
				}),
			],
		};
		useTimelineStore.setState({
			_tracks: [targetedTrack],
			tracks: [targetedTrack],
			history: [],
			redoStack: [],
		});
		useSegmentationStore.setState({
			trackingRequest: {
				requestId: "request-1",
				elementId: "clip-1",
				maskId: "tracked",
				direction: "forward",
				anchorFrame: 12,
			},
		});

		pauseGeneratedMaskTracking({ message: "物体跟踪已暂停" });

		const state = useTimelineStore.getState();
		const clip = state._tracks[0].elements[0] as MediaElement;
		expect(clip.masks?.[0].tracking).toMatchObject({
			status: "paused",
			progress: 44,
			anchorFrame: 12,
			error: "物体跟踪已暂停",
		});
		expect(useSegmentationStore.getState().trackingRequest).toBeNull();
	});

	it("uses the active request direction and source for progress updates", () => {
		const trackedMask = {
			...createMediaMask({ id: "tracked", type: "object", index: 0 }),
			tracking: {
				direction: "backward" as const,
				status: "ready" as const,
				source: "mediapipe" as const,
				progress: 20,
				anchorFrame: 4,
			},
		};
		const targetedTrack: TimelineTrack = {
			id: "track-1",
			name: "Main Track",
			type: "media",
			isMain: true,
			elements: [mediaElement({ id: "clip-1", masks: [trackedMask] })],
		};
		useTimelineStore.setState({
			_tracks: [targetedTrack],
			tracks: [targetedTrack],
			history: [],
			redoStack: [],
		});
		useSegmentationStore.setState({
			trackingRequest: {
				requestId: "request-1",
				elementId: "clip-1",
				maskId: "tracked",
				direction: "forward",
				anchorFrame: 12,
			},
		});

		updateGeneratedMaskTrackingProgress({ progress: 120, source: "sam3" });

		const clip = useTimelineStore.getState()._tracks[0]
			.elements[0] as MediaElement;
		expect(clip.masks?.[0].tracking).toMatchObject({
			direction: "forward",
			source: "sam3",
			status: "processing",
			progress: 99,
			anchorFrame: 12,
		});
		expect(useTimelineStore.getState().history).toHaveLength(0);
	});

	it("ignores stale generated tracking results after the request changes", () => {
		const trackedMask = {
			...createMediaMask({ id: "tracked", type: "object", index: 0 }),
			name: "Tracked object",
		};
		const targetedTrack: TimelineTrack = {
			id: "track-1",
			name: "Main Track",
			type: "media",
			isMain: true,
			elements: [
				mediaElement({
					id: "clip-1",
					masks: [trackedMask],
				}),
			],
		};
		useTimelineStore.setState({
			_tracks: [targetedTrack],
			tracks: [targetedTrack],
			selectedElements: [{ trackId: "track-1", elementId: "clip-1" }],
			history: [],
			redoStack: [],
		});
		useSegmentationStore.setState({
			trackingRequest: {
				requestId: "current-request",
				elementId: "clip-1",
				maskId: "tracked",
				direction: "both",
				anchorFrame: 6,
			},
		});

		const attached = attachGeneratedMask({
			sourceMediaId: "late-alpha",
			type: "object",
			source: "sam3",
			name: "Late result",
			targetElementId: "clip-1",
			trackingRequestId: "stale-request",
		});

		const clip = useTimelineStore.getState()._tracks[0]
			.elements[0] as MediaElement;
		expect(attached).toBe(false);
		expect(clip.masks).toHaveLength(1);
		expect(clip.masks?.[0]).toMatchObject({
			id: "tracked",
			name: "Tracked object",
		});
		expect(clip.masks?.[0].sourceMediaId).toBeUndefined();
		expect(useSegmentationStore.getState().trackingRequest?.requestId).toBe(
			"current-request"
		);
	});
});
