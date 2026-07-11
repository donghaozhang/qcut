import { toast } from "sonner";
import { useMaskEditorStore } from "@/stores/editor/mask-editor-store";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useSegmentationStore } from "@/stores/ai/segmentation-store";
import type { SegmentationState } from "@/stores/ai/segmentation-store";
import { useProjectStore } from "@/stores/project-store";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type { MediaElement, MediaMask } from "@/types/timeline";
import { generateUUID } from "@/lib/utils";
import {
	createMediaMask,
	normalizeMediaMaskStack,
} from "@/lib/video/media-mask-stack";
import {
	applyMaskTrackingSamples,
	type MediaMaskTrackingSample,
} from "@/lib/video/media-mask-tracking";
import { resolveMediaMasks } from "@/lib/video/video-properties";
import { getMediaTimelineDuration } from "@/lib/video/video-timing";

type TrackingRequest = SegmentationState["trackingRequest"];

interface TimelineMediaTarget {
	trackId: string;
	element: MediaElement;
}

interface BuildGeneratedMaskStackOptions {
	element: MediaElement;
	existingMasks: MediaMask[];
	sourceMediaId: string;
	type: "person" | "object";
	source: "mediapipe" | "sam3";
	name: string;
	trackingSamples?: MediaMaskTrackingSample[];
	trackingRequest?: TrackingRequest;
	currentTime: number;
	fps: number;
	generatedId?: string;
}

export interface GeneratedMaskStackResult {
	masks: MediaMask[];
	selectedMaskId: string;
}

export function buildGeneratedMaskStack({
	element,
	existingMasks,
	sourceMediaId,
	type,
	source,
	name,
	trackingSamples = [],
	trackingRequest,
	currentTime,
	fps,
	generatedId = `mask-${generateUUID()}`,
}: BuildGeneratedMaskStackOptions): GeneratedMaskStackResult {
	const existingMask = trackingRequest
		? existingMasks.find((candidate) => candidate.id === trackingRequest.maskId)
		: undefined;
	const selectedMaskId = existingMask?.id ?? generatedId;
	const direction = trackingRequest?.direction ?? "both";
	const anchorFrame =
		trackingRequest?.anchorFrame ??
		Math.max(0, Math.round((currentTime - element.startTime) * fps));
	let mask: MediaMask = {
		...(existingMask ??
			createMediaMask({ id: selectedMaskId, type, index: 0, name })),
		sourceMediaId,
		tracking: {
			direction,
			status: "ready",
			source,
		},
	};

	if (trackingSamples.length > 0) {
		mask = applyMaskTrackingSamples({
			mask,
			samples: trackingSamples,
			direction,
			anchorFrame,
			source,
			sourceFrameOffset: Math.round(element.trimStart * fps),
			maxFrame: Math.round(getMediaTimelineDuration(element, fps) * fps),
		});
	}

	return {
		masks: normalizeMediaMaskStack(
			existingMask
				? existingMasks.map((candidate) =>
						candidate.id === existingMask.id ? mask : candidate
					)
				: [mask, ...existingMasks]
		),
		selectedMaskId,
	};
}

function selectedMediaTarget({
	elementId,
}: {
	elementId?: string;
}): TimelineMediaTarget | null {
	const state = useTimelineStore.getState();
	if (elementId) {
		for (const track of state.tracks) {
			const element = track.elements.find(
				(candidate) => candidate.id === elementId
			);
			if (element?.type === "media") return { trackId: track.id, element };
		}
	}

	for (const selection of state.selectedElements) {
		const track = state.tracks.find(
			(candidate) => candidate.id === selection.trackId
		);
		const element = track?.elements.find(
			(candidate) => candidate.id === selection.elementId
		);
		if (track && element?.type === "media") {
			return { trackId: track.id, element };
		}
	}
	return null;
}

export function attachGeneratedMask({
	sourceMediaId,
	type,
	source,
	name,
	trackingSamples = [],
	targetElementId,
}: {
	sourceMediaId: string;
	type: "person" | "object";
	source: "mediapipe" | "sam3";
	name: string;
	trackingSamples?: MediaMaskTrackingSample[];
	targetElementId?: string;
}): boolean {
	const segmentationState = useSegmentationStore.getState();
	const request = segmentationState.trackingRequest;
	const matchingRequest =
		request && (!targetElementId || request.elementId === targetElementId)
			? request
			: null;
	const target = selectedMediaTarget({
		elementId: targetElementId ?? matchingRequest?.elementId,
	});
	if (!target) {
		toast.info("Mask media was added, but no timeline clip is selected");
		return false;
	}

	const result = buildGeneratedMaskStack({
		element: target.element,
		existingMasks: resolveMediaMasks(target.element),
		sourceMediaId,
		type,
		source,
		name,
		trackingSamples,
		trackingRequest: matchingRequest,
		currentTime: usePlaybackStore.getState().currentTime,
		fps: useProjectStore.getState().activeProject?.fps ?? 30,
	});
	useTimelineStore
		.getState()
		.updateMediaElement(target.trackId, target.element.id, {
			masks: result.masks,
		});
	useMaskEditorStore
		.getState()
		.selectMask(target.element.id, result.selectedMaskId);
	useMaskEditorStore.getState().setEditing(true);
	if (matchingRequest) segmentationState.clearTrackingRequest();
	return true;
}

export function failGeneratedMaskTracking({ message }: { message: string }) {
	const segmentationState = useSegmentationStore.getState();
	const request = segmentationState.trackingRequest;
	if (!request) return;
	const target = selectedMediaTarget({ elementId: request.elementId });
	if (target) {
		const masks = resolveMediaMasks(target.element).map((mask) =>
			mask.id === request.maskId
				? {
						...mask,
						tracking: {
							...mask.tracking,
							direction: request.direction,
							status: "error" as const,
							error: message,
						},
					}
				: mask
		);
		useTimelineStore
			.getState()
			.updateMediaElement(target.trackId, target.element.id, { masks });
	}
	segmentationState.clearTrackingRequest();
}
