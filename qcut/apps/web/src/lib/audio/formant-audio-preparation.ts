import type { MediaItem } from "@/stores/media/media-store-types";
import type { MediaElement, TimelineTrack } from "@/types/timeline";
import type { AudioFileInput } from "@/lib/export-cli/types";
import { normalizeMediaAudioSettings } from "./audio-properties";
import { encodeAudioBufferAsWav } from "./audio-buffer-wav";
import { renderBrowserTimelineAudio } from "./browser-audio-export";

interface TempAudioResult {
	success: boolean;
	path?: string;
	error?: string;
}

function needsPreservedFormants({
	element,
}: {
	element: MediaElement;
}): boolean {
	const settings = normalizeMediaAudioSettings({ element });
	return Boolean(
		settings.pitch.enabled &&
			settings.pitch.preserveFormants &&
			(Math.abs(settings.pitch.semitones) >= 0.01 ||
				(settings.keyframes?.pitchSemitones?.length ?? 0) > 0)
	);
}

function partitionFormantTracks({ tracks }: { tracks: TimelineTrack[] }): {
	formantElements: Array<{ element: MediaElement; track: TimelineTrack }>;
	remainingTracks: TimelineTrack[];
} {
	const formantElements: Array<{
		element: MediaElement;
		track: TimelineTrack;
	}> = [];
	const remainingTracks = tracks.map((track) => {
		if (track.muted || (track.type !== "media" && track.type !== "audio")) {
			return track;
		}
		const remainingElements = track.elements.filter((element) => {
			if (element.type !== "media" || !needsPreservedFormants({ element })) {
				return true;
			}
			formantElements.push({ element, track });
			return false;
		});
		return { ...track, elements: remainingElements };
	});
	return { formantElements, remainingTracks };
}

async function renderFormantElement({
	element,
	track,
	mediaItems,
	fps,
	sessionId,
	saveTemp,
}: {
	element: MediaElement;
	track: TimelineTrack;
	mediaItems: MediaItem[];
	fps: number;
	sessionId: string | null;
	saveTemp: (params: {
		audioData: ArrayBuffer;
		filename: string;
	}) => Promise<TempAudioResult>;
}): Promise<AudioFileInput> {
	const localElement = { ...element, startTime: 0 };
	const rendered = await renderBrowserTimelineAudio({
		tracks: [{ ...track, muted: false, elements: [localElement] }],
		mediaItems,
		totalDuration: element.duration,
		fps,
	});
	if (!rendered) {
		throw new Error(`Formant render produced no audio for ${element.name}`);
	}
	const filename = `audio_${sessionId ?? "nosession"}_${element.id}_formant.wav`;
	const result = await saveTemp({
		audioData: encodeAudioBufferAsWav({ buffer: rendered }),
		filename,
	});
	if (!result.success || !result.path) {
		throw new Error(result.error || `Could not save ${filename}`);
	}
	return {
		path: result.path,
		startTime: element.startTime,
		volume: 1,
		sourceGain: 1,
		trimStart: 0,
		trimEnd: 0,
		duration: element.duration,
		fadeIn: 0,
		fadeOut: 0,
		normalize: false,
		denoise: 0,
		pan: 0,
		playbackRate: 1,
		reverse: false,
		freezeFrameDuration: 0,
	};
}

export async function preparePreservedFormantAudio({
	tracks,
	mediaItems,
	fps,
	sessionId,
	saveTemp,
}: {
	tracks: TimelineTrack[];
	mediaItems: MediaItem[];
	fps: number;
	sessionId: string | null;
	saveTemp: (params: {
		audioData: ArrayBuffer;
		filename: string;
	}) => Promise<TempAudioResult>;
}): Promise<{
	audioFiles: AudioFileInput[];
	remainingTracks: TimelineTrack[];
}> {
	const { formantElements, remainingTracks } = partitionFormantTracks({
		tracks,
	});
	const audioFiles = await Promise.all(
		formantElements.map(({ element, track }) =>
			renderFormantElement({
				element,
				track,
				mediaItems,
				fps,
				sessionId,
				saveTemp,
			})
		)
	);
	return { audioFiles, remainingTracks };
}
