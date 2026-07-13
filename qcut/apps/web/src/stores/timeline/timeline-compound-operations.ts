import { getTimelineElementEndTime } from "@/lib/timeline";
import { materializeCompoundMediaClip } from "@/lib/timeline/compound-media";
import type {
	MediaCompound,
	MediaElement,
	TimelineTrack,
} from "@/types/timeline";
import type { SelectedElement } from "./types";

interface ResolvedMediaSelection {
	trackId: string;
	trackIndex: number;
	elementIndex: number;
	element: MediaElement;
}

export interface CreateMediaContainerResult {
	tracks: TimelineTrack[];
	container: MediaElement | null;
	trackId: string | null;
	error?: string;
}

function resolveMediaSelection({
	tracks,
	selectedElements,
}: {
	tracks: TimelineTrack[];
	selectedElements: SelectedElement[];
}): ResolvedMediaSelection[] {
	const selectedKeys = new Set(
		selectedElements.map(({ trackId, elementId }) => `${trackId}:${elementId}`)
	);
	const resolved: ResolvedMediaSelection[] = [];
	for (let trackIndex = 0; trackIndex < tracks.length; trackIndex++) {
		const track = tracks[trackIndex];
		for (
			let elementIndex = 0;
			elementIndex < track.elements.length;
			elementIndex++
		) {
			const element = track.elements[elementIndex];
			if (!selectedKeys.has(`${track.id}:${element.id}`)) continue;
			if (element.type !== "media") continue;
			resolved.push({
				trackId: track.id,
				trackIndex,
				elementIndex,
				element,
			});
		}
	}
	return resolved;
}

function removeContainerSourceReferences({
	track,
	selectedIds,
}: {
	track: TimelineTrack;
	selectedIds: ReadonlySet<string>;
}): TimelineTrack {
	return {
		...track,
		elements: track.elements.filter((element) => !selectedIds.has(element.id)),
		transitions: track.transitions?.filter(
			(transition) =>
				!selectedIds.has(transition.fromElementId) &&
				!selectedIds.has(transition.toElementId)
		),
		audioCrossfades: track.audioCrossfades?.filter(
			(crossfade) =>
				!selectedIds.has(crossfade.fromElementId) &&
				!selectedIds.has(crossfade.toElementId)
		),
	};
}

export function createMediaContainer({
	tracks,
	selectedElements,
	containerId,
	kind,
}: {
	tracks: TimelineTrack[];
	selectedElements: SelectedElement[];
	containerId: string;
	kind: MediaCompound["kind"];
}): CreateMediaContainerResult {
	if (selectedElements.length < 2) {
		return {
			tracks,
			container: null,
			trackId: null,
			error: "请至少选择两个媒体片段",
		};
	}
	const resolved = resolveMediaSelection({ tracks, selectedElements });
	if (resolved.length !== selectedElements.length) {
		return {
			tracks,
			container: null,
			trackId: null,
			error: "复合片段和多机位片段只能包含媒体片段",
		};
	}
	if (resolved.some(({ element }) => element.compound)) {
		return {
			tracks,
			container: null,
			trackId: null,
			error: "暂不支持嵌套复合片段",
		};
	}

	const target =
		resolved.find(
			({ trackId, element }) =>
				trackId === selectedElements[0].trackId &&
				element.id === selectedElements[0].elementId
		) ?? resolved[0];
	const startTime = Math.min(
		...resolved.map(({ element }) => element.startTime)
	);
	const endTime = Math.max(
		...resolved.map(({ element }) => getTimelineElementEndTime({ element }))
	);
	const ordered = [...resolved].sort(
		(a, b) => b.trackIndex - a.trackIndex || a.elementIndex - b.elementIndex
	);
	const clips = ordered.map(({ element, trackId }, layer) => ({
		id: element.id,
		offset: element.startTime - startTime,
		layer,
		sourceTrackId: trackId,
		element: {
			...element,
			startTime: 0,
			groupId: undefined,
		},
	}));
	const activeClip =
		clips.find((clip) => clip.id === target.element.id) ?? clips[0];
	const container: MediaElement = {
		...target.element,
		id: containerId,
		name:
			kind === "multicam"
				? `多机位（${clips.length} 个机位）`
				: `复合片段（${clips.length} 个片段）`,
		mediaId: activeClip.element.mediaId,
		startTime,
		duration: Math.max(0, endTime - startTime),
		trimStart: 0,
		trimEnd: 0,
		groupId: undefined,
		playbackRate: 1,
		speedKeyframes: [],
		reverse: false,
		freezeFrameTime: undefined,
		freezeFrameDuration: 0,
		compound: {
			kind,
			clips,
			activeClipId: kind === "multicam" ? activeClip.id : undefined,
		},
	};
	const selectedIds = new Set(resolved.map(({ element }) => element.id));
	const nextTracks = tracks.map((track) => {
		const withoutSources = removeContainerSourceReferences({
			track,
			selectedIds,
		});
		return track.id === target.trackId
			? {
					...withoutSources,
					elements: [...withoutSources.elements, container],
				}
			: withoutSources;
	});

	return { tracks: nextTracks, container, trackId: target.trackId };
}

export function breakApartMediaContainer({
	tracks,
	trackId,
	elementId,
}: {
	tracks: TimelineTrack[];
	trackId: string;
	elementId: string;
}): { tracks: TimelineTrack[]; restoredCount: number } {
	const sourceTrack = tracks.find((track) => track.id === trackId);
	const container = sourceTrack?.elements.find(
		(element) => element.id === elementId
	);
	if (!container || container.type !== "media" || !container.compound) {
		return { tracks, restoredCount: 0 };
	}
	const restoredByTrack = new Map<string, MediaElement[]>();
	for (const clip of container.compound.clips) {
		const restored = materializeCompoundMediaClip({ clip, container });
		if (!restored) continue;
		const originalId = restored.id.slice(`${container.id}::`.length);
		const restoredElement = { ...restored, id: originalId };
		const destinationTrackId = tracks.some(
			(track) => track.id === clip.sourceTrackId
		)
			? clip.sourceTrackId
			: trackId;
		const current = restoredByTrack.get(destinationTrackId) ?? [];
		restoredByTrack.set(destinationTrackId, [...current, restoredElement]);
	}
	const nextTracks = tracks.map((track) => ({
		...track,
		elements: [
			...track.elements.filter((element) => element.id !== elementId),
			...(restoredByTrack.get(track.id) ?? []),
		],
	}));
	return {
		tracks: nextTracks,
		restoredCount: [...restoredByTrack.values()].reduce(
			(total, elements) => total + elements.length,
			0
		),
	};
}

export function selectMulticamClip({
	tracks,
	trackId,
	elementId,
	clipId,
}: {
	tracks: TimelineTrack[];
	trackId: string;
	elementId: string;
	clipId: string;
}): { tracks: TimelineTrack[]; changed: boolean } {
	let changed = false;
	const nextTracks = tracks.map((track) => {
		if (track.id !== trackId) return track;
		return {
			...track,
			elements: track.elements.map((element) => {
				if (
					element.id !== elementId ||
					element.type !== "media" ||
					element.compound?.kind !== "multicam"
				) {
					return element;
				}
				const clip = element.compound.clips.find(
					(candidate) => candidate.id === clipId
				);
				if (!clip || element.compound.activeClipId === clipId) return element;
				changed = true;
				return {
					...element,
					mediaId: clip.element.mediaId,
					compound: { ...element.compound, activeClipId: clipId },
				};
			}),
		};
	});
	return { tracks: changed ? nextTracks : tracks, changed };
}
