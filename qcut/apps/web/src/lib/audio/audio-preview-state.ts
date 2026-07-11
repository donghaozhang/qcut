import type { MediaAudioSettings, MediaElement } from "@/types/timeline";
import { DEFAULT_MEDIA_AUDIO_SETTINGS, dbToGain } from "./audio-properties";
import { resolveMediaAudioSettings } from "./audio-keyframe-properties";

export interface AudioPreviewState {
	settings: MediaAudioSettings;
	outputGain: number;
	pan: number;
	localTime: number;
	duration: number;
}

export function calculateAudioPreviewState({
	element,
	timelineTime,
	fps,
	duration,
	masterVolume,
	muted,
	trackMuted,
	forceMuted,
	bypassed = false,
}: {
	element: MediaElement;
	timelineTime: number;
	fps: number;
	duration: number;
	masterVolume: number;
	muted: boolean;
	trackMuted: boolean;
	forceMuted: boolean;
	bypassed?: boolean;
}): AudioPreviewState {
	const settings = bypassed
		? DEFAULT_MEDIA_AUDIO_SETTINGS
		: resolveMediaAudioSettings({
				element,
				currentTime: timelineTime,
				fps,
			});
	const localTime = Math.min(
		duration,
		Math.max(0, timelineTime - element.startTime)
	);
	const fadeInGain =
		settings.fadeIn > 0 ? Math.min(1, localTime / settings.fadeIn) : 1;
	const remaining = Math.max(0, duration - localTime);
	const fadeOutGain =
		settings.fadeOut > 0 ? Math.min(1, remaining / settings.fadeOut) : 1;
	const measuredLufs = settings.loudness.measuredLufs;
	const loudnessGain =
		settings.loudness.enabled && measuredLufs !== undefined
			? dbToGain({
					db: Math.min(
						24,
						Math.max(-24, settings.loudness.targetLufs - measuredLufs)
					),
				})
			: 1;
	const audible = settings.enabled && !muted && !trackMuted && !forceMuted;
	const outputGain = audible
		? Math.min(
				16,
				Math.max(
					0,
					masterVolume *
						dbToGain({ db: settings.volumeDb }) *
						fadeInGain *
						fadeOutGain *
						loudnessGain
				)
			)
		: 0;
	return {
		settings,
		outputGain,
		pan: settings.panEnabled ? settings.pan : 0,
		localTime,
		duration,
	};
}
