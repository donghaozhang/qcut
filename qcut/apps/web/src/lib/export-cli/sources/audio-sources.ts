/**
 * Audio Source Extraction
 *
 * Resolves timeline audio candidates into FFmpeg-ready local file inputs.
 * Prefers stable filesystem/file-backed inputs and only falls back to URL fetch.
 */

import type {
	MediaElement,
	ProjectAudioMixSettings,
	TimelineTrack,
	TimelineElement,
} from "@/types/timeline";
import type { MediaItem } from "@/stores/media/media-store";
import type {
	AudioCrossfadeInput,
	AudioFileInput,
	AudioMixConfigInput,
} from "../types";
import { normalizeMediaAudioSettings } from "@/lib/audio/audio-properties";
import { selectMediaAudioSources } from "@/lib/audio/audio-source-selection";
import {
	normalizeProjectAudioMixSettings,
	normalizeTrackAudioSettings,
} from "@/lib/audio/audio-mix-settings";

type LogFn = (...args: unknown[]) => void;

interface SaveAudioResult {
	success: boolean;
	path?: string;
	error?: string;
}

export interface AudioSourceAPI {
	fileExists: (filePath: string) => Promise<boolean>;
	saveTemp: (params: {
		audioData: ArrayBuffer;
		filename: string;
	}) => Promise<SaveAudioResult>;
}

interface TimelineAudioCandidate {
	elementId: string;
	timelineElementId: string;
	trackId: string;
	mediaItem: MediaItem;
	startTime: number;
	volume: number;
	sourceGain: number;
	trimStart: number;
	trimEnd: number;
	duration: number;
	fadeIn: number;
	fadeOut: number;
	normalize: boolean;
	denoise: number;
	pan: number;
	audio: ReturnType<typeof normalizeMediaAudioSettings>;
	playbackRate: number;
	speedKeyframes: MediaElement["speedKeyframes"];
	reverse: boolean;
	freezeFrameTime: number | undefined;
	freezeFrameDuration: number;
	preservePitch: boolean;
}

function guessExtension(mediaItem: MediaItem): string {
	const fromName = mediaItem.name.split(".").pop();
	if (fromName && fromName.length <= 5) {
		return fromName.toLowerCase();
	}

	const mimeType = mediaItem.file?.type || "";
	if (mimeType.includes("wav")) return "wav";
	if (mimeType.includes("mpeg")) return "mp3";
	if (mimeType.includes("ogg")) return "ogg";
	if (mimeType.includes("aac")) return "aac";
	if (mimeType.includes("mp4")) return "m4a";
	return "mp3";
}

function collectAudioCandidates(
	tracks: TimelineTrack[],
	mediaItems: MediaItem[],
	includeEmbeddedVideoAudio: boolean
): TimelineAudioCandidate[] {
	const mediaMap = new Map(mediaItems.map((item) => [item.id, item]));
	const candidates: TimelineAudioCandidate[] = [];

	for (const track of tracks) {
		// Video-track audio stays in the base video stream during normal video
		// exports, but standalone audio export needs to collect it explicitly.
		if (
			track.type !== "audio" &&
			!(includeEmbeddedVideoAudio && track.type === "media")
		) {
			continue;
		}

		for (const element of track.elements) {
			if (element.type !== "media" || element.hidden) {
				continue;
			}

			const mediaElement = element as TimelineElement & { mediaId: string };
			const mediaItem = mediaMap.get(mediaElement.mediaId);
			if (!mediaItem) {
				continue;
			}

			if (mediaItem.type === "image") {
				continue;
			}

			if (mediaItem.type !== "video" && mediaItem.type !== "audio") {
				continue;
			}

			const audio = normalizeMediaAudioSettings({ element });
			const selectedSources = selectMediaAudioSources({ element });
			for (const selectedSource of selectedSources) {
				const selectedMediaItem = mediaMap.get(selectedSource.mediaId);
				if (!selectedMediaItem || selectedMediaItem.type === "image") continue;
				candidates.push({
					elementId: `${element.id}-${selectedSource.stem ?? selectedSource.source}`,
					timelineElementId: element.id,
					trackId: track.id,
					mediaItem: selectedMediaItem,
					startTime: element.startTime,
					volume: element.volume ?? 1.0,
					sourceGain: selectedSource.gain,
					trimStart: element.trimStart,
					trimEnd: element.trimEnd,
					duration: element.duration,
					fadeIn: element.audioFadeIn ?? 0,
					fadeOut: element.audioFadeOut ?? 0,
					normalize: element.audioNormalize ?? false,
					denoise: element.audioDenoise ?? 0,
					pan: element.audioPan ?? 0,
					audio:
						selectedSource.source === "ai-denoise"
							? { ...audio, denoise: { ...audio.denoise, enabled: false } }
							: audio,
					playbackRate: element.playbackRate ?? 1,
					speedKeyframes: element.speedKeyframes,
					reverse: element.reverse ?? false,
					freezeFrameTime: element.freezeFrameTime,
					freezeFrameDuration: element.freezeFrameDuration ?? 0,
					preservePitch: element.preservePitch ?? true,
				});
			}
		}
	}

	return candidates;
}

async function resolveCandidatePath(
	candidate: TimelineAudioCandidate,
	sessionId: string | null,
	api: AudioSourceAPI,
	logger: LogFn
): Promise<string | null> {
	const { mediaItem, elementId } = candidate;

	if (mediaItem.localPath) {
		try {
			const exists = await api.fileExists(mediaItem.localPath);
			if (exists) {
				logger(
					`[AudioSources] Using localPath for ${mediaItem.name}: ${mediaItem.localPath}`
				);
				return mediaItem.localPath;
			}
			logger(
				`[AudioSources] localPath missing on disk for ${mediaItem.name}: ${mediaItem.localPath}`
			);
		} catch (error) {
			logger(
				`[AudioSources] localPath check failed for ${mediaItem.name}:`,
				error
			);
		}
	}

	if (
		mediaItem.file &&
		mediaItem.file.size > 0 &&
		typeof mediaItem.file.arrayBuffer === "function"
	) {
		try {
			const audioData = await mediaItem.file.arrayBuffer();
			const ext = guessExtension(mediaItem);
			const filename = `audio_${sessionId ?? "nosession"}_${elementId}.${ext}`;
			const result = await api.saveTemp({ audioData, filename });
			if (result.success && result.path) {
				logger(`[AudioSources] Saved file-backed source: ${filename}`);
				return result.path;
			}
			logger(
				`[AudioSources] Failed to save file-backed source ${filename}: ${result.error || "Unknown error"}`
			);
		} catch (error) {
			logger(
				`[AudioSources] Failed file-backed extraction for ${mediaItem.name}:`,
				error
			);
		}
	} else if (mediaItem.file && mediaItem.file.size > 0) {
		logger(
			`[AudioSources] File-backed extraction skipped for ${mediaItem.name}: arrayBuffer() unavailable`
		);
	}

	if (mediaItem.url) {
		try {
			const response = await fetch(mediaItem.url);
			if (!response.ok) {
				throw new Error(`Fetch failed with status ${response.status}`);
			}
			const audioData = await response.arrayBuffer();
			const ext = guessExtension(mediaItem);
			const filename = `audio_${sessionId ?? "nosession"}_${elementId}.${ext}`;
			const result = await api.saveTemp({ audioData, filename });
			if (result.success && result.path) {
				logger(`[AudioSources] Saved URL-backed source: ${filename}`);
				return result.path;
			}
			logger(
				`[AudioSources] Failed to save URL-backed source ${filename}: ${result.error || "Unknown error"}`
			);
		} catch (error) {
			logger(
				`[AudioSources] URL fallback failed for ${mediaItem.name}:`,
				error
			);
		}
	}

	return null;
}

/**
 * Resolve timeline audio sources to FFmpeg-ready file inputs.
 */
export async function extractAudioFileInputs(
	tracks: TimelineTrack[],
	mediaItems: MediaItem[],
	sessionId: string | null,
	api: AudioSourceAPI,
	logger: LogFn = console.log,
	options: { includeEmbeddedVideoAudio?: boolean } = {}
): Promise<AudioFileInput[]> {
	try {
		const candidates = collectAudioCandidates(
			tracks,
			mediaItems,
			options.includeEmbeddedVideoAudio === true
		);
		logger(
			`[AudioSources] Collected ${candidates.length} audio candidate(s) from timeline`
		);

		const resolved = await Promise.all(
			candidates.map(async (candidate) => {
				try {
					const path = await resolveCandidatePath(
						candidate,
						sessionId,
						api,
						logger
					);
					if (!path) {
						logger(
							`[AudioSources] Could not resolve source for ${candidate.mediaItem.name}`
						);
						return null;
					}
					return {
						elementId: candidate.timelineElementId,
						trackId: candidate.trackId,
						path,
						startTime: candidate.startTime,
						volume: candidate.volume,
						sourceGain: candidate.sourceGain,
						trimStart: candidate.trimStart,
						trimEnd: candidate.trimEnd,
						duration: candidate.duration,
						fadeIn: candidate.fadeIn,
						fadeOut: candidate.fadeOut,
						normalize: candidate.normalize,
						denoise: candidate.denoise,
						pan: candidate.pan,
						audio: candidate.audio,
						playbackRate: candidate.playbackRate,
						speedKeyframes: candidate.speedKeyframes,
						reverse: candidate.reverse,
						freezeFrameTime: candidate.freezeFrameTime,
						freezeFrameDuration: candidate.freezeFrameDuration,
					} as AudioFileInput;
				} catch (error) {
					logger(
						`[AudioSources] Failed resolving candidate ${candidate.mediaItem.name}:`,
						error
					);
					return null;
				}
			})
		);

		const valid = resolved.filter(
			(item): item is AudioFileInput => item !== null
		);
		valid.sort((a, b) => a.startTime - b.startTime);
		logger(`[AudioSources] Resolved ${valid.length} audio file input(s)`);
		return valid;
	} catch (error) {
		logger("[AudioSources] Extraction failed:", error);
		return [];
	}
}

export function extractAudioCrossfadeInputs({
	tracks,
}: {
	tracks: TimelineTrack[];
}): AudioCrossfadeInput[] {
	return tracks.flatMap((track) => {
		if (
			track.hidden ||
			track.muted ||
			(track.type !== "media" && track.type !== "audio")
		) {
			return [];
		}
		return (track.audioCrossfades ?? []).map((crossfade) => ({
			...crossfade,
			trackId: track.id,
		}));
	});
}

export function extractAudioMixConfig({
	tracks,
	audioMix,
}: {
	tracks: TimelineTrack[];
	audioMix?: ProjectAudioMixSettings;
}): AudioMixConfigInput {
	const mix = normalizeProjectAudioMixSettings({ audioMix });
	return {
		master: mix.master,
		buses: mix.buses,
		tracks: tracks.flatMap((track) => {
			if (track.type !== "media" && track.type !== "audio") return [];
			return [
				{
					...normalizeTrackAudioSettings({ audio: track.audio }),
					trackId: track.id,
					muted: track.muted === true || track.hidden === true,
				},
			];
		}),
	};
}
