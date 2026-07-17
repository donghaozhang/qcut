import {
	buildAudioLoopSegments,
	getAutomaticDuckingSourceTrackIds,
	getVisualTimelineEnd,
	snapTimeToAudioBeatGrid,
	type AudioBeatAlignment,
} from "@/lib/audio/audio-library-placement";
import { createDefaultTrackAudioSettings } from "@/lib/audio/audio-mix-settings";
import type {
	CreateTimelineElement,
	TimelineTrack,
	TimelineTrackAudioSettings,
} from "@/types/timeline";
import type { MediaItem } from "./media-store-types";

export type AudioTimelineAddMode = "single" | "fit-project";

interface AudioTimelineInsertionTarget {
	tracks: TimelineTrack[];
	addMediaAtTime: (item: MediaItem, currentTime?: number) => boolean;
	addTrack: (type: "audio") => string;
	addElementToTrack: (
		trackId: string,
		element: CreateTimelineElement,
		options?: { pushHistory?: boolean; selectElement?: boolean }
	) => string | null;
	removeElementFromTrack: (
		trackId: string,
		elementId: string,
		pushHistory?: boolean
	) => void;
	removeTrack: (trackId: string) => void;
	updateTrackAudio: (
		trackId: string,
		updates: Partial<TimelineTrackAudioSettings>,
		pushHistory?: boolean
	) => void;
}

export interface AudioTimelineInsertionResult {
	success: boolean;
	segmentCount: number;
	duckingSourceCount: number;
	reason?: "no-visual-content" | "insert-failed";
}

export function insertAudioLibraryMedia({
	timeline,
	mediaItem,
	mode,
	startTime,
	autoDucking,
	bpm,
	beatAlignment,
	fps,
}: {
	timeline: AudioTimelineInsertionTarget;
	mediaItem: MediaItem;
	mode: AudioTimelineAddMode;
	startTime: number;
	autoDucking: boolean;
	bpm?: number;
	beatAlignment?: AudioBeatAlignment;
	fps?: number;
}): AudioTimelineInsertionResult {
	if (mode === "single") {
		const resolvedStartTime = beatAlignment
			? snapTimeToAudioBeatGrid({
					time: startTime,
					bpm: bpm ?? 0,
					alignment: beatAlignment,
				})
			: startTime;
		return {
			success: timeline.addMediaAtTime(mediaItem, resolvedStartTime),
			segmentCount: 1,
			duckingSourceCount: 0,
		};
	}

	const targetEnd = getVisualTimelineEnd({ tracks: timeline.tracks, fps });
	const sourceDuration = mediaItem.duration ?? 0;
	const segments = buildAudioLoopSegments({
		sourceDuration,
		targetEnd,
	});
	if (segments.length === 0) {
		return {
			success: false,
			segmentCount: 0,
			duckingSourceCount: 0,
			reason: "no-visual-content",
		};
	}

	const targetTrackId = timeline.addTrack("audio");
	const insertedElementIds: string[] = [];
	for (const [index, segment] of segments.entries()) {
		const elementId = timeline.addElementToTrack(
			targetTrackId,
			{
				type: "media",
				mediaId: mediaItem.id,
				name: mediaItem.name,
				duration: sourceDuration,
				startTime: segment.startTime,
				trimStart: 0,
				trimEnd: segment.trimEnd,
				audioFadeOut: segment.fadeOut,
			},
			{
				pushHistory: false,
				selectElement: index === segments.length - 1,
			}
		);
		if (!elementId) {
			// Roll back the partial insertion so a failed fit-project add does
			// not leave a dangling track or orphaned segments behind. The track
			// is removed unconditionally because element removal is not
			// guaranteed to drop the emptied track.
			for (const insertedId of insertedElementIds) {
				timeline.removeElementFromTrack(targetTrackId, insertedId, false);
			}
			timeline.removeTrack(targetTrackId);
			return {
				success: false,
				segmentCount: 0,
				duckingSourceCount: 0,
				reason: "insert-failed",
			};
		}
		insertedElementIds.push(elementId);
	}

	const sourceTrackIds = autoDucking
		? getAutomaticDuckingSourceTrackIds({
				tracks: timeline.tracks,
				targetTrackId,
			})
		: [];
	if (sourceTrackIds.length > 0) {
		const defaults = createDefaultTrackAudioSettings();
		timeline.updateTrackAudio(
			targetTrackId,
			{
				ducking: {
					...defaults.ducking,
					enabled: true,
					sourceTrackIds,
				},
			},
			false
		);
	}

	return {
		success: true,
		segmentCount: segments.length,
		duckingSourceCount: sourceTrackIds.length,
	};
}
