import { getTimelineElementDuration } from "@/lib/timeline";
import { clampPlaybackRate } from "@/lib/video/video-timing";
import {
	resolveAudioCrossfade,
	type AudioCrossfade,
	type MediaElement,
	type TimelineTrack,
} from "@/types/timeline";

export interface AudioCrossfadePreviewState {
	crossfade: AudioCrossfade;
	role: "from" | "to";
	progress: number;
	gain: number;
	playbackWindow: { startTime: number; endTime: number };
	previewElement: MediaElement;
}

export interface ActiveAudioCrossfadePreview {
	forceActiveElementIds: ReadonlySet<string>;
	statesByElementId: ReadonlyMap<string, AudioCrossfadePreviewState>;
}

function crossfadeGain({
	role,
	progress,
	curve,
}: {
	role: "from" | "to";
	progress: number;
	curve: AudioCrossfade["curve"];
}) {
	if (curve === "linear") return role === "from" ? 1 - progress : progress;
	return role === "from"
		? Math.cos((progress * Math.PI) / 2)
		: Math.sin((progress * Math.PI) / 2);
}

function previewElements({
	fromElement,
	toElement,
	duration,
}: {
	fromElement: MediaElement;
	toElement: MediaElement;
	duration: number;
}): { from: MediaElement; to: MediaElement } | null {
	if (
		fromElement.reverse ||
		toElement.reverse ||
		(fromElement.speedKeyframes?.length ?? 0) > 0 ||
		(toElement.speedKeyframes?.length ?? 0) > 0
	) {
		return null;
	}
	const halfDuration = duration / 2;
	const fromRate = clampPlaybackRate(fromElement.playbackRate);
	const toRate = clampPlaybackRate(toElement.playbackRate);
	const fromHandle = halfDuration * fromRate;
	const toHandle = halfDuration * toRate;
	if (fromElement.trimEnd < fromHandle || toElement.trimStart < toHandle) {
		return null;
	}
	return {
		from: {
			...fromElement,
			trimEnd: fromElement.trimEnd - fromHandle,
		},
		to: {
			...toElement,
			startTime: toElement.startTime - halfDuration,
			trimStart: toElement.trimStart - toHandle,
		},
	};
}

export function resolveActiveAudioCrossfadePreview({
	tracks,
	currentTime,
	fps,
}: {
	tracks: TimelineTrack[];
	currentTime: number;
	fps: number;
}): ActiveAudioCrossfadePreview {
	const forceActiveElementIds = new Set<string>();
	const statesByElementId = new Map<string, AudioCrossfadePreviewState>();
	for (const track of tracks) {
		if (
			track.hidden ||
			track.muted ||
			(track.type !== "media" && track.type !== "audio")
		) {
			continue;
		}
		for (const crossfade of track.audioCrossfades ?? []) {
			const resolved = resolveAudioCrossfade({
				track,
				crossfade,
				getElementDuration: ({ element }) =>
					getTimelineElementDuration({ element, fps }),
			});
			if (
				!resolved ||
				currentTime < resolved.windowStart ||
				currentTime >= resolved.windowEnd
			) {
				continue;
			}
			const elements = previewElements({
				fromElement: resolved.fromElement,
				toElement: resolved.toElement,
				duration: resolved.crossfade.duration,
			});
			if (!elements) continue;
			const progress = Math.min(
				1,
				Math.max(
					0,
					(currentTime - resolved.windowStart) /
						Math.max(1 / Math.max(1, fps), resolved.crossfade.duration)
				)
			);
			const playbackWindow = {
				startTime: resolved.windowStart,
				endTime: resolved.windowEnd,
			};
			const fromState: AudioCrossfadePreviewState = {
				crossfade: resolved.crossfade,
				role: "from",
				progress,
				gain: crossfadeGain({
					role: "from",
					progress,
					curve: resolved.crossfade.curve,
				}),
				playbackWindow,
				previewElement: elements.from,
			};
			const toState: AudioCrossfadePreviewState = {
				...fromState,
				role: "to",
				gain: crossfadeGain({
					role: "to",
					progress,
					curve: resolved.crossfade.curve,
				}),
				previewElement: elements.to,
			};
			if (track.type === "audio") {
				forceActiveElementIds.add(resolved.fromElement.id);
				forceActiveElementIds.add(resolved.toElement.id);
			}
			statesByElementId.set(resolved.fromElement.id, fromState);
			statesByElementId.set(resolved.toElement.id, toState);
		}
	}
	return { forceActiveElementIds, statesByElementId };
}
