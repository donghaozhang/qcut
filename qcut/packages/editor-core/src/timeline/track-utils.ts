/**
 * Track utility functions — sorting, creation, main track management.
 * Extracted from apps/web/src/types/timeline.ts
 *
 * @module @qcut/editor-core/timeline/track-utils
 */

import type { TrackType, TimelineTrack } from "../types/timeline.js";
import { generateUUID } from "../utils.js";

/** Track type display priority (lower = higher in the UI) */
const TRACK_PRIORITY: Record<TrackType, number> = {
	text: 1,
	captions: 2,
	markdown: 2.5,
	remotion: 3,
	sticker: 4,
	media: 5,
	audio: 6,
};

/** Sort tracks by type priority, main track first within same type. */
export function sortTracksByOrder(tracks: TimelineTrack[]): TimelineTrack[] {
	return [...tracks].sort((a, b) => {
		const priorityA = TRACK_PRIORITY[a.type];
		const priorityB = TRACK_PRIORITY[b.type];

		if (priorityA !== priorityB) {
			return priorityA - priorityB;
		}

		if (a.isMain && !b.isMain) return -1;
		if (b.isMain && !a.isMain) return 1;

		return 0;
	});
}

/** Find the main (default) track. */
export function getMainTrack(tracks: TimelineTrack[]): TimelineTrack | null {
	return tracks.find((track) => track.isMain) || null;
}

/** Ensure a main media track exists — creates one if missing. */
export function ensureMainTrack(tracks: TimelineTrack[]): TimelineTrack[] {
	const hasMainTrack = tracks.some((track) => track.isMain);

	if (!hasMainTrack) {
		const mainTrack: TimelineTrack = {
			id: generateUUID(),
			name: "Main Track",
			type: "media",
			elements: [],
			muted: false,
			isMain: true,
		};
		return [mainTrack, ...tracks];
	}

	return tracks;
}

/** Generate a display name for a track based on its type. */
export function getTrackName(type: TrackType): string {
	switch (type) {
		case "media":
			return "Media Track";
		case "text":
			return "Text Track";
		case "markdown":
			return "Markdown Track";
		case "audio":
			return "Audio Track";
		case "sticker":
			return "Sticker Track";
		case "captions":
			return "Captions Track";
		case "remotion":
			return "Remotion Track";
		default:
			return "Track";
	}
}

/** Create a new empty track of the specified type. */
export function createTrack(type: TrackType): TimelineTrack {
	return {
		id: generateUUID(),
		name: getTrackName(type),
		type,
		elements: [],
		muted: false,
	};
}
