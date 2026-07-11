import type { MediaItem } from "@/stores/media/media-store-types";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import {
	createDerivedAudioElement,
	selectMediaAudioSources,
} from "./audio-source-selection";

export interface BrowserAudioExportClip {
	element: MediaElement;
	mediaItem: MediaItem;
}

export interface DecodedBrowserAudioExportClip extends BrowserAudioExportClip {
	buffer: AudioBuffer;
}

function isPlayableAudioItem({ mediaItem }: { mediaItem: MediaItem }): boolean {
	return mediaItem.type === "audio" || mediaItem.type === "video";
}

export function collectBrowserAudioExportClips({
	tracks,
	mediaItems,
}: {
	tracks: TimelineTrack[];
	mediaItems: MediaItem[];
}): BrowserAudioExportClip[] {
	const mediaById = new Map(
		mediaItems.map((mediaItem) => [mediaItem.id, mediaItem])
	);
	const clips: BrowserAudioExportClip[] = [];

	for (const track of tracks) {
		if (track.muted || (track.type !== "audio" && track.type !== "media")) {
			continue;
		}
		for (const timelineElement of track.elements) {
			if (timelineElement.type !== "media" || timelineElement.hidden) continue;
			const originalMediaItem = mediaById.get(timelineElement.mediaId);
			if (
				!originalMediaItem ||
				!isPlayableAudioItem({ mediaItem: originalMediaItem })
			) {
				continue;
			}

			const selectedSources = selectMediaAudioSources({
				element: timelineElement,
			});
			for (const [index, selectedSource] of selectedSources.entries()) {
				const mediaItem = mediaById.get(selectedSource.mediaId);
				if (!mediaItem || !isPlayableAudioItem({ mediaItem })) continue;
				clips.push({
					element: createDerivedAudioElement({
						element: timelineElement,
						selectedSource,
						index,
					}),
					mediaItem,
				});
			}
		}
	}

	return clips.sort(
		(left, right) => left.element.startTime - right.element.startTime
	);
}

async function readMediaBytes({
	mediaItem,
}: {
	mediaItem: MediaItem;
}): Promise<ArrayBuffer> {
	if (
		mediaItem.file?.size > 0 &&
		typeof mediaItem.file.arrayBuffer === "function"
	) {
		return mediaItem.file.arrayBuffer();
	}

	const sourceUrl =
		mediaItem.url ?? mediaItem.originalUrl ?? mediaItem.localPath;
	if (!sourceUrl) {
		throw new Error(`Audio source has no readable data: ${mediaItem.name}`);
	}
	const response = await fetch(sourceUrl);
	if (!response.ok) {
		throw new Error(
			`Audio source request failed (${response.status}): ${mediaItem.name}`
		);
	}
	return response.arrayBuffer();
}

export async function decodeBrowserAudioExportClips({
	context,
	clips,
	onDecodeError = console.warn,
}: {
	context: BaseAudioContext;
	clips: BrowserAudioExportClip[];
	onDecodeError?: (message: string, error: unknown) => void;
}): Promise<DecodedBrowserAudioExportClip[]> {
	const decodedByMediaId = new Map<string, Promise<AudioBuffer>>();
	const decode = ({
		mediaItem,
	}: BrowserAudioExportClip): Promise<AudioBuffer> => {
		const existing = decodedByMediaId.get(mediaItem.id);
		if (existing) return existing;
		const pending = readMediaBytes({ mediaItem }).then((bytes) =>
			context.decodeAudioData(bytes.slice(0))
		);
		decodedByMediaId.set(mediaItem.id, pending);
		return pending;
	};

	const decoded = await Promise.all(
		clips.map(async (clip) => {
			try {
				return { ...clip, buffer: await decode(clip) };
			} catch (error) {
				onDecodeError(
					`[BrowserAudioExport] Failed to decode ${clip.mediaItem.name}`,
					error
				);
				return null;
			}
		})
	);
	return decoded.filter(
		(clip): clip is DecodedBrowserAudioExportClip => clip !== null
	);
}
