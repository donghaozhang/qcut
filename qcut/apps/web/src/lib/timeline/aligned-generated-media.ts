import { normalizeTrackOrder } from "@qcut/editor-core";
import { generateUUID } from "@/lib/utils";
import type { MediaItem } from "@/stores/media/media-store-types";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import { createTrack } from "@/stores/timeline/utils";
import type { MediaElement, TimelineTrack } from "@/types/timeline";

type GeneratedMediaItem = Pick<MediaItem, "id" | "name" | "type">;

export interface AlignedGeneratedMediaResult {
	tracks: TimelineTrack[];
	groupId: string;
	audioElementId?: string;
	videoElementId?: string;
	createdTrackIds: string[];
}

function alignedElement({
	media,
	startTime,
	duration,
	groupId,
}: {
	media: GeneratedMediaItem;
	startTime: number;
	duration: number;
	groupId: string;
}): MediaElement {
	return {
		id: generateUUID(),
		type: "media",
		mediaId: media.id,
		name: media.name,
		groupId,
		startTime,
		duration,
		trimStart: 0,
		trimEnd: 0,
	};
}

export function buildAlignedGeneratedMediaTracks({
	tracks,
	speechMedia,
	avatarMedia,
	startTime,
	duration,
	groupId = `aligned-avatar-${generateUUID()}`,
}: {
	tracks: readonly TimelineTrack[];
	speechMedia?: GeneratedMediaItem;
	avatarMedia?: GeneratedMediaItem;
	startTime: number;
	duration: number;
	groupId?: string;
}): AlignedGeneratedMediaResult {
	if (!speechMedia && !avatarMedia) {
		throw new Error("Add generated speech, avatar video, or both");
	}
	if (!Number.isFinite(startTime) || startTime < 0) {
		throw new Error("Caption start time is invalid");
	}
	if (!Number.isFinite(duration) || duration <= 0) {
		throw new Error("Caption duration is invalid");
	}
	if (speechMedia && speechMedia.type !== "audio") {
		throw new Error("Generated speech must be an audio asset");
	}
	if (avatarMedia && avatarMedia.type === "audio") {
		throw new Error("Generated avatar must be a visual asset");
	}

	const createdTracks: TimelineTrack[] = [];
	let audioElementId: string | undefined;
	let videoElementId: string | undefined;
	if (avatarMedia) {
		const element = alignedElement({
			media: avatarMedia,
			startTime,
			duration,
			groupId,
		});
		videoElementId = element.id;
		createdTracks.push({
			...createTrack("media"),
			name: "Aligned Digital Human",
			elements: [element],
		});
	}
	if (speechMedia) {
		const element = alignedElement({
			media: speechMedia,
			startTime,
			duration,
			groupId,
		});
		audioElementId = element.id;
		createdTracks.push({
			...createTrack("audio"),
			name: "Aligned Speech",
			elements: [element],
		});
	}

	const visualTracks = createdTracks.filter((track) => track.type === "media");
	const audioTracks = createdTracks.filter((track) => track.type === "audio");
	const nextTracks = normalizeTrackOrder({
		tracks: [...visualTracks, ...tracks, ...audioTracks].map(
			(track, order) => ({
				...track,
				order,
			})
		),
	});
	return {
		tracks: nextTracks,
		groupId,
		audioElementId,
		videoElementId,
		createdTrackIds: createdTracks.map((track) => track.id),
	};
}

export async function insertAlignedGeneratedMediaToEditor({
	speechMedia,
	avatarMedia,
	startTime,
	duration,
}: {
	speechMedia?: GeneratedMediaItem;
	avatarMedia?: GeneratedMediaItem;
	startTime: number;
	duration: number;
}): Promise<AlignedGeneratedMediaResult> {
	const timeline = useTimelineStore.getState();
	const result = buildAlignedGeneratedMediaTracks({
		tracks: timeline.tracks,
		speechMedia,
		avatarMedia,
		startTime,
		duration,
	});
	timeline.pushHistory();
	timeline.restoreTracks(result.tracks);
	await timeline.saveImmediate();
	return result;
}

export function rollbackAlignedGeneratedMediaTracks({
	tracks,
	groupId,
	createdTrackIds,
}: {
	tracks: readonly TimelineTrack[];
	groupId: string;
	createdTrackIds: string[];
}): TimelineTrack[] {
	const generatedTrackIds = new Set(createdTrackIds);
	return normalizeTrackOrder({
		tracks: tracks.flatMap((track) => {
			const elements = track.elements.filter(
				(element) => element.groupId !== groupId
			);
			if (generatedTrackIds.has(track.id) && elements.length === 0) return [];
			return [{ ...track, elements }];
		}),
	});
}
