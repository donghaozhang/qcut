import type { MediaItem } from "@/stores/media/media-store";
import type { TimelineTrack } from "@/types/timeline";
import { platform } from "@qcut/platform-core";
import { selectMediaAudioSources } from "@/lib/audio/audio-source-selection";
import { extractAudioFileInputs } from "../export-cli/sources";
import { fileExists, invokeIfAvailable } from "./export-engine-cli-utils";
import { resolveAudioPreparationInputs } from "./export-engine-cli-audio";
import { assertRestrictedMediaExportAllowed } from "../../../../../electron/types/restricted-media-export-policy";

export const AUDIO_EXPORT_BITRATES = [128, 192, 256, 320] as const;
export type AudioExportBitrate = (typeof AUDIO_EXPORT_BITRATES)[number];

export const AUDIO_EXPORT_SAMPLE_RATES = [44_100, 48_000] as const;
export type AudioExportSampleRate = (typeof AUDIO_EXPORT_SAMPLE_RATES)[number];

export interface StandaloneAudioExportOptions {
	tracks: TimelineTrack[];
	mediaItems: MediaItem[];
	duration: number;
	outputPath: string;
	bitrate: AudioExportBitrate;
	sampleRate: AudioExportSampleRate;
}

function buildStandaloneAudioPolicyTracks({
	mediaItems,
	tracks,
}: {
	mediaItems: MediaItem[];
	tracks: TimelineTrack[];
}): TimelineTrack[] {
	const mediaById = new Map(mediaItems.map((item) => [item.id, item]));

	return tracks.flatMap((track) => {
		if (track.type !== "audio" && track.type !== "media") return [];

		const elements = track.elements.flatMap((element) => {
			if (element.type !== "media" || element.hidden) return [];

			return selectMediaAudioSources({ element }).flatMap((source, index) => {
				const mediaItem = mediaById.get(source.mediaId);
				if (mediaItem?.type === "image") return [];

				return [
					{
						duration: element.duration,
						id: `${element.id}-audio-policy-${index}`,
						mediaId: source.mediaId,
						name: element.name,
						startTime: element.startTime,
						trimEnd: element.trimEnd,
						trimStart: element.trimStart,
						type: "media" as const,
					},
				];
			});
		});

		return elements.length > 0 ? [{ ...track, elements }] : [];
	});
}

/** Mix all audible timeline sources into a standalone MP3 file. */
export async function exportTimelineAudio({
	tracks,
	mediaItems,
	duration,
	outputPath,
	bitrate,
	sampleRate,
}: StandaloneAudioExportOptions): Promise<{
	outputPath: string;
	fileSize: number;
}> {
	if (!platform().isElectron) {
		throw new Error("Standalone audio export requires the desktop app");
	}
	const audioPolicyTracks = buildStandaloneAudioPolicyTracks({
		mediaItems,
		tracks,
	});
	assertRestrictedMediaExportAllowed({
		mediaItems,
		operation: "standalone-audio",
		scope: "timeline",
		tracks: audioPolicyTracks,
	});

	const hydrated = await resolveAudioPreparationInputs({ tracks, mediaItems });
	const hydratedAudioPolicyTracks = buildStandaloneAudioPolicyTracks({
		mediaItems: hydrated.mediaItems,
		tracks: hydrated.tracks,
	});
	assertRestrictedMediaExportAllowed({
		mediaItems: hydrated.mediaItems,
		operation: "standalone-audio",
		scope: "timeline",
		tracks: hydratedAudioPolicyTracks,
	});
	const audioFiles = await extractAudioFileInputs(
		hydrated.tracks,
		hydrated.mediaItems,
		null,
		{
			fileExists: async (filePath) => fileExists({ filePath }),
			saveTemp: async ({ audioData, filename }) => {
				try {
					const savedPath = await platform().audio.saveTemp(
						new Uint8Array(audioData),
						filename
					);
					return { success: true, path: savedPath };
				} catch {
					const result = await invokeIfAvailable({
						channel: "save-audio-for-export",
						args: [{ audioData, filename }],
					});
					return result && typeof result === "object"
						? (result as {
								success: boolean;
								path?: string;
								error?: string;
							})
						: { success: false, error: "Could not persist audio source" };
				}
			},
		},
		undefined,
		{ includeEmbeddedVideoAudio: true }
	);

	if (audioFiles.length === 0) {
		throw new Error("No audio sources are available on the timeline");
	}

	return platform().ffmpeg.exportAudioCLI({
		outputPath,
		duration,
		audioFiles,
		bitrate,
		sampleRate,
		channels: 2,
	});
}
