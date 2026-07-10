import type { MediaItem } from "@/stores/media/media-store";
import type { TimelineTrack } from "@/types/timeline";
import { platform } from "@qcut/platform-core";
import { extractAudioFileInputs } from "../export-cli/sources";
import { fileExists, invokeIfAvailable } from "./export-engine-cli-utils";
import { resolveAudioPreparationInputs } from "./export-engine-cli-audio";

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

	const hydrated = await resolveAudioPreparationInputs({ tracks, mediaItems });
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
