import type {
	AudioStemName,
	MediaAudioSettings,
	MediaElement,
} from "@/types/timeline";
import { normalizeMediaAudioSettings } from "./audio-properties";

export interface SelectedAudioSource {
	mediaId: string;
	gain: number;
	stem?: AudioStemName;
	source: "original" | "ai-denoise" | "separation" | "voice-conversion";
}

const STEM_ORDER: AudioStemName[] = [
	"vocals",
	"instrumental",
	"drums",
	"bass",
	"other",
	"guitar",
	"piano",
];

function separatedSources({
	settings,
}: {
	settings: MediaAudioSettings;
}): SelectedAudioSource[] {
	if (!settings.separation.enabled || settings.separation.status !== "ready") {
		return [];
	}
	const sources: SelectedAudioSource[] = [];
	for (const stem of STEM_ORDER) {
		const mediaId = settings.separation.stemMediaIds?.[stem];
		if (!mediaId) continue;
		sources.push({
			mediaId,
			gain: Math.max(0, settings.separation.stemGains?.[stem] ?? 1),
			stem,
			source: "separation",
		});
	}
	return sources;
}

export function selectMediaAudioSources({
	element,
	bypassed = false,
}: {
	element: Pick<
		MediaElement,
		| "mediaId"
		| "audio"
		| "volume"
		| "audioFadeIn"
		| "audioFadeOut"
		| "audioNormalize"
		| "audioDenoise"
		| "audioPan"
	>;
	bypassed?: boolean;
}): SelectedAudioSource[] {
	if (bypassed) {
		return [{ mediaId: element.mediaId, gain: 1, source: "original" }];
	}
	const settings = normalizeMediaAudioSettings({ element });
	const stems = separatedSources({ settings });
	if (stems.length > 0) return stems;

	if (
		settings.voiceConversion.enabled &&
		settings.voiceConversion.status === "ready" &&
		settings.voiceConversion.sourceMediaId
	) {
		return [
			{
				mediaId: settings.voiceConversion.sourceMediaId,
				gain: 1,
				source: "voice-conversion",
			},
		];
	}
	if (
		settings.denoise.enabled &&
		settings.denoise.mode === "ai" &&
		settings.denoise.status === "ready" &&
		settings.denoise.processedMediaId
	) {
		return [
			{
				mediaId: settings.denoise.processedMediaId,
				gain: 1,
				source: "ai-denoise",
			},
		];
	}
	return [{ mediaId: element.mediaId, gain: 1, source: "original" }];
}

export function usesDerivedAudioSource({
	element,
}: {
	element: Parameters<typeof selectMediaAudioSources>[0]["element"];
}): boolean {
	return selectMediaAudioSources({ element }).some(
		(source) => source.source !== "original"
	);
}

export function createDerivedAudioElement({
	element,
	selectedSource,
	index,
}: {
	element: MediaElement;
	selectedSource: SelectedAudioSource;
	index: number;
}): MediaElement {
	const settings = normalizeMediaAudioSettings({ element });
	const gainDb =
		selectedSource.gain <= 0 ? -60 : 20 * Math.log10(selectedSource.gain);
	const volumeKeyframes = settings.keyframes?.volumeDb?.map((keyframe) => ({
		...keyframe,
		value: Math.max(-60, Math.min(12, keyframe.value + gainDb)),
	}));
	return {
		...element,
		id: `${element.id}-derived-audio-${index}`,
		mediaId: selectedSource.mediaId,
		audio: {
			...settings,
			volumeDb: Math.max(-60, Math.min(12, settings.volumeDb + gainDb)),
			denoise:
				selectedSource.source === "ai-denoise"
					? { ...settings.denoise, enabled: false }
					: settings.denoise,
			separation: { ...settings.separation, enabled: false },
			voiceConversion: { ...settings.voiceConversion, enabled: false },
			keyframes: {
				...settings.keyframes,
				...(volumeKeyframes ? { volumeDb: volumeKeyframes } : {}),
			},
		},
	};
}
