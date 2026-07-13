import type { SelectedElement } from "./types";
import type { TimelineTrack } from "@/types/timeline";

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
		return tracks.map((track) =>
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
	}

	const groupElements = tracks.flatMap((track) =>
		track.elements.filter((element) => element.groupId === target.groupId)
	);
	const requestedDelta = startTime - target.startTime;
	const earliestStart = Math.min(
		...groupElements.map((element) => element.startTime)
	);
	const delta = Math.max(requestedDelta, -earliestStart);

	return tracks.map((track) => {
		let changed = false;
		const elements = track.elements.map((element) => {
			if (element.groupId !== target.groupId) return element;
			changed = true;
			return { ...element, startTime: element.startTime + delta };
		});
		return changed ? { ...track, elements } : track;
	});
}
