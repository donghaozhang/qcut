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

function hasExplicitOrder(track: TimelineTrack): boolean {
	return Number.isFinite(track.order);
}

function sortLegacyTracks(tracks: TimelineTrack[]): TimelineTrack[] {
	return tracks
		.map((track, index) => ({ track, index }))
		.sort((a, b) => {
			const priorityA = TRACK_PRIORITY[a.track.type];
			const priorityB = TRACK_PRIORITY[b.track.type];

			if (priorityA !== priorityB) {
				return priorityA - priorityB;
			}

			if (a.track.isMain && !b.track.isMain) return -1;
			if (b.track.isMain && !a.track.isMain) return 1;

			return a.index - b.index;
		})
		.map(({ track }) => track);
}

/**
 * Resolve and compact explicit track order.
 *
 * Legacy projects have no order values and retain the historical type order.
 * Mixed arrays come from inserting a new track into an ordered project, so their
 * current array position is authoritative.
 */
export function normalizeTrackOrder({
	tracks,
}: {
	tracks: TimelineTrack[];
}): TimelineTrack[] {
	const explicitOrderCount = tracks.filter(hasExplicitOrder).length;
	let orderedTracks: TimelineTrack[];

	if (explicitOrderCount === 0) {
		orderedTracks = sortLegacyTracks(tracks);
	} else if (explicitOrderCount === tracks.length) {
		orderedTracks = tracks
			.map((track, index) => ({ track, index }))
			.sort((a, b) => {
				const orderDifference = (a.track.order ?? 0) - (b.track.order ?? 0);
				return orderDifference !== 0 ? orderDifference : a.index - b.index;
			})
			.map(({ track }) => track);
	} else {
		orderedTracks = [...tracks];
	}

	return orderedTracks.map((track, order) =>
		track.order === order ? track : { ...track, order }
	);
}

/** Sort tracks by explicit order, migrating legacy type ordering when needed. */
export function sortTracksByOrder(tracks: TimelineTrack[]): TimelineTrack[] {
	return normalizeTrackOrder({ tracks });
}

/** Move a track in UI order and return compact, immutable order values. */
export function moveTrack({
	tracks,
	trackId,
	toIndex,
}: {
	tracks: TimelineTrack[];
	trackId: string;
	toIndex: number;
}): TimelineTrack[] {
	const orderedTracks = normalizeTrackOrder({ tracks });
	const fromIndex = orderedTracks.findIndex((track) => track.id === trackId);
	if (fromIndex < 0) return orderedTracks;

	const clampedIndex = Math.min(
		Math.max(0, toIndex),
		Math.max(0, orderedTracks.length - 1)
	);
	if (fromIndex === clampedIndex) return orderedTracks;

	const nextTracks = [...orderedTracks];
	const [movedTrack] = nextTracks.splice(fromIndex, 1);
	nextTracks.splice(clampedIndex, 0, movedTrack);

	return nextTracks.map((track, order) => ({ ...track, order }));
}

/** Legacy comparator exposed for diagnostics and migration tests. */
export function compareTrackTypePriority({
	a,
	b,
}: {
	a: TimelineTrack;
	b: TimelineTrack;
}): number {
	const priorityA = TRACK_PRIORITY[a.type];
	const priorityB = TRACK_PRIORITY[b.type];

	if (priorityA !== priorityB) {
		return priorityA - priorityB;
	}

	if (a.isMain && !b.isMain) return -1;
	if (b.isMain && !a.isMain) return 1;

	return 0;
}

/** Find the main (default) track. */
export function getMainTrack(tracks: TimelineTrack[]): TimelineTrack | null {
	return tracks.find((track) => track.isMain) || null;
}

/** Ensure a main media track exists — creates one if missing. */
export function ensureMainTrack(tracks: TimelineTrack[]): TimelineTrack[] {
	const hasMainTrack = tracks.some((track) => track.isMain);

	if (!hasMainTrack) {
		const everyTrackHasOrder = tracks.every(hasExplicitOrder);
		const lastOrder = tracks.reduce(
			(maximum, track) => Math.max(maximum, track.order ?? -1),
			-1
		);
		const mainTrack: TimelineTrack = {
			id: generateUUID(),
			name: "Main Track",
			type: "media",
			elements: [],
			order: everyTrackHasOrder ? lastOrder + 1 : undefined,
			muted: false,
			hidden: false,
			locked: false,
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
		hidden: false,
		locked: false,
	};
}
