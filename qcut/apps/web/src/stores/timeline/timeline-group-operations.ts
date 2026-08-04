import type { SelectedElement } from "./types";
import type { TimelineElement, TimelineTrack } from "@/types/timeline";
import { getTimelineElementEndTime } from "@/lib/timeline";
import { findRangeCollisions } from "@qcut/editor-core/timeline";

export function groupTimelineElements({
	tracks,
	selectedElements,
	groupId,
}: {
	tracks: TimelineTrack[];
	selectedElements: SelectedElement[];
	groupId: string;
}): { tracks: TimelineTrack[]; groupedCount: number } {
	const selected = new Set(
		selectedElements.map(({ trackId, elementId }) => `${trackId}:${elementId}`)
	);
	let groupedCount = 0;
	const nextTracks = tracks.map((track) => {
		let changed = false;
		const elements = track.elements.map((element) => {
			if (!selected.has(`${track.id}:${element.id}`)) return element;
			changed = true;
			groupedCount += 1;
			return { ...element, groupId };
		});
		return changed ? { ...track, elements } : track;
	});
	return { tracks: nextTracks, groupedCount };
}

export function ungroupTimelineElements({
	tracks,
	groupId,
}: {
	tracks: TimelineTrack[];
	groupId: string;
}): { tracks: TimelineTrack[]; ungroupedCount: number } {
	let ungroupedCount = 0;
	const nextTracks = tracks.map((track) => {
		let changed = false;
		const elements = track.elements.map((element) => {
			if (element.groupId !== groupId) return element;
			changed = true;
			ungroupedCount += 1;
			const { groupId: _groupId, ...ungrouped } = element;
			return ungrouped;
		});
		return changed ? { ...track, elements } : track;
	});
	return { tracks: nextTracks, ungroupedCount };
}

function collidesOnTrack({
	track,
	movedElements,
	excludeIds,
}: {
	track: TimelineTrack;
	movedElements: readonly TimelineElement[];
	excludeIds: ReadonlySet<string>;
}): boolean {
	const occupancy = track.elements
		.filter((element) => !excludeIds.has(element.id))
		.map((element) => ({
			id: element.id,
			startTime: element.startTime,
			endTime: getTimelineElementEndTime({ element }),
		}));
	return movedElements.some(
		(element) =>
			findRangeCollisions({
				items: occupancy,
				range: {
					startTime: element.startTime,
					endTime: getTimelineElementEndTime({ element }),
				},
			}).length > 0
	);
}

/**
 * Move an element (and its whole group) to a new start time. Returns the
 * unchanged input array when the move would create a same-track overlap
 * (QTL-002) — callers detect the rejection by reference equality.
 */
export function moveTimelineElementGroup({
	tracks,
	trackId,
	elementId,
	startTime,
}: {
	tracks: TimelineTrack[];
	trackId: string;
	elementId: string;
	startTime: number;
}): TimelineTrack[] {
	const target = tracks
		.find((track) => track.id === trackId)
		?.elements.find((element) => element.id === elementId);
	if (!target) return tracks;
	if (!target.groupId) {
		const nextTracks = tracks.map((track) =>
			track.id === trackId
				? {
						...track,
						elements: track.elements.map((element) =>
							element.id === elementId
								? { ...element, startTime: Math.max(0, startTime) }
								: element
						),
					}
				: track
		);
		const movedTrack = nextTracks.find((track) => track.id === trackId);
		const movedElement = movedTrack?.elements.find(
			(element) => element.id === elementId
		);
		if (
			movedTrack &&
			movedElement &&
			collidesOnTrack({
				track: movedTrack,
				movedElements: [movedElement],
				excludeIds: new Set([elementId]),
			})
		) {
			return tracks;
		}
		return nextTracks;
	}

	const groupElements = tracks.flatMap((track) =>
		track.elements.filter((element) => element.groupId === target.groupId)
	);
	const requestedDelta = startTime - target.startTime;
	const earliestStart = Math.min(
		...groupElements.map((element) => element.startTime)
	);
	const delta = Math.max(requestedDelta, -earliestStart);

	const groupElementIds = new Set(groupElements.map((element) => element.id));
	const nextTracks = tracks.map((track) => {
		let changed = false;
		const elements = track.elements.map((element) => {
			if (element.groupId !== target.groupId) return element;
			changed = true;
			return { ...element, startTime: element.startTime + delta };
		});
		return changed ? { ...track, elements } : track;
	});

	const wouldCollide = nextTracks.some((track) =>
		collidesOnTrack({
			track,
			movedElements: track.elements.filter((element) =>
				groupElementIds.has(element.id)
			),
			excludeIds: groupElementIds,
		})
	);
	return wouldCollide ? tracks : nextTracks;
}
