import type {
	CompoundMediaClip,
	MediaElement,
	TimelineTrack,
} from "@/types/timeline";
import {
	getMediaSourceDuration,
	getMediaTimelineDuration,
	mapMediaTimelineTime,
} from "@/lib/video/video-timing";

export function materializeCompoundMediaClip({
	clip,
	container,
}: {
	clip: CompoundMediaClip;
	container: MediaElement;
}): MediaElement | null {
	const childDuration = getMediaTimelineDuration(clip.element);
	const childStart = clip.offset;
	const childEnd = childStart + childDuration;
	const windowStart = container.trimStart;
	const windowEnd = Math.max(
		windowStart,
		container.duration - container.trimEnd
	);
	const overlapStart = Math.max(childStart, windowStart);
	const overlapEnd = Math.min(childEnd, windowEnd);
	if (overlapEnd <= overlapStart) return null;

	const localStart = overlapStart - childStart;
	const localEnd = overlapEnd - childStart;
	const sourceDuration = getMediaSourceDuration(clip.element);
	const sourceAtStart = mapMediaTimelineTime({
		element: clip.element,
		localTimelineTime: localStart,
	}).sourceTime;
	const sourceAtEnd = mapMediaTimelineTime({
		element: clip.element,
		localTimelineTime: localEnd,
	}).sourceTime;
	const trimStart = clip.element.reverse
		? clip.element.trimStart + sourceAtEnd
		: clip.element.trimStart + sourceAtStart;
	const trimEnd = clip.element.reverse
		? clip.element.trimEnd + sourceDuration - sourceAtStart
		: clip.element.trimEnd + sourceDuration - sourceAtEnd;

	return {
		...clip.element,
		id: `${container.id}::${clip.id}`,
		groupId: undefined,
		compound: undefined,
		startTime: container.startTime + overlapStart - windowStart,
		trimStart: Math.max(0, trimStart),
		trimEnd: Math.max(0, trimEnd),
	};
}

function getRenderableCompoundClips({
	container,
}: {
	container: MediaElement;
}): CompoundMediaClip[] {
	const compound = container.compound;
	if (!compound) return [];
	if (compound.kind === "compound") {
		return [...compound.clips].sort((a, b) => a.layer - b.layer);
	}
	const activeClip = compound.clips.find(
		(clip) => clip.id === compound.activeClipId
	);
	return activeClip ? [activeClip] : compound.clips.slice(0, 1);
}

/** Expands timeline-only containers into ordinary media elements for preview/export. */
export function expandCompoundMediaTracks({
	tracks,
}: {
	tracks: TimelineTrack[];
}): TimelineTrack[] {
	return tracks.map((track) => ({
		...track,
		elements: track.elements.flatMap((element) => {
			if (element.type !== "media" || !element.compound) return [element];
			return getRenderableCompoundClips({ container: element }).flatMap(
				(clip) => {
					const materialized = materializeCompoundMediaClip({
						clip,
						container: element,
					});
					return materialized ? [materialized] : [];
				}
			);
		}),
	}));
}
