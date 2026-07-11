import { getTimelineElementDuration } from "@/lib/timeline";
import {
	resolveClipTransition,
	type ClipTransition,
	type TimelineTrack,
} from "@/types/timeline";
import type { ClipTransitionRole } from "./clip-transition-presentation";

export interface ClipTransitionPreviewState {
	transition: ClipTransition;
	role: ClipTransitionRole;
	progress: number;
	cutTime: number;
	windowStart: number;
	windowEnd: number;
	playbackWindow: { startTime: number; endTime: number };
	isAudible: boolean;
}

export interface ActiveClipTransitionPreview {
	forceActiveElementIds: ReadonlySet<string>;
	statesByElementId: ReadonlyMap<string, ClipTransitionPreviewState>;
}

function quantizeDuration({
	duration,
	fps,
}: {
	duration: number;
	fps: number;
}): number {
	return Math.max(1, Math.round(duration * fps)) / fps;
}

export function resolveActiveClipTransitionPreview({
	tracks,
	currentTime,
	fps,
}: {
	tracks: TimelineTrack[];
	currentTime: number;
	fps: number;
}): ActiveClipTransitionPreview {
	const forceActiveElementIds = new Set<string>();
	const statesByElementId = new Map<string, ClipTransitionPreviewState>();
	const frameRate = Math.max(1, fps);

	for (const track of tracks) {
		if (track.hidden || track.type !== "media") continue;
		for (const transition of track.transitions ?? []) {
			const duration = quantizeDuration({
				duration: transition.duration,
				fps: frameRate,
			});
			const resolved = resolveClipTransition({
				track,
				transition: { ...transition, duration },
				getElementDuration: ({ element }) =>
					getTimelineElementDuration({ element, fps: frameRate }),
			});
			if (
				!resolved ||
				resolved.fromElement.hidden ||
				resolved.toElement.hidden ||
				currentTime < resolved.windowStart ||
				currentTime >= resolved.windowEnd ||
				statesByElementId.has(resolved.fromElement.id) ||
				statesByElementId.has(resolved.toElement.id)
			) {
				continue;
			}

			const progress = Math.min(
				1,
				Math.max(
					0,
					(currentTime - resolved.windowStart) /
						Math.max(1 / frameRate, resolved.transition.duration)
				)
			);
			const playbackWindow = {
				startTime: resolved.windowStart,
				endTime: resolved.windowEnd,
			};
			const fromState: ClipTransitionPreviewState = {
				transition: resolved.transition,
				role: "from",
				progress,
				cutTime: resolved.cutTime,
				windowStart: resolved.windowStart,
				windowEnd: resolved.windowEnd,
				playbackWindow,
				isAudible: currentTime < resolved.cutTime,
			};
			const toState: ClipTransitionPreviewState = {
				...fromState,
				role: "to",
				isAudible: currentTime >= resolved.cutTime,
			};

			forceActiveElementIds.add(resolved.fromElement.id);
			forceActiveElementIds.add(resolved.toElement.id);
			statesByElementId.set(resolved.fromElement.id, fromState);
			statesByElementId.set(resolved.toElement.id, toState);
		}
	}

	return { forceActiveElementIds, statesByElementId };
}
