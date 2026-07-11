import type {
	AudioKeyframeProperty,
	MediaAudioSettings,
	MediaElement,
	MediaPropertyKeyframe,
} from "@/types/timeline";
import {
	interpolateNumber,
	type Keyframe,
} from "@/lib/remotion/keyframe-converter";
import {
	AUDIO_KEYFRAME_DEFINITIONS,
	normalizeMediaAudioSettings,
} from "./audio-properties";

export function getAudioKeyframePropertyValue({
	settings,
	property,
}: {
	settings: MediaAudioSettings;
	property: AudioKeyframeProperty;
}): number {
	switch (property) {
		case "volumeDb":
			return settings.volumeDb;
		case "fadeIn":
			return settings.fadeIn;
		case "fadeOut":
			return settings.fadeOut;
		case "pan":
			return settings.pan * 100;
		case "denoiseAmount":
			return settings.denoise.amount;
		case "voiceClarity":
			return settings.voiceEnhance.clarity;
		case "voiceWarmth":
			return settings.voiceEnhance.warmth;
		case "voicePresence":
			return settings.voiceEnhance.presence;
		case "pitchSemitones":
			return settings.pitch.semitones;
		case "eqLowGainDb":
			return settings.equalizer.lowGainDb;
		case "eqMidGainDb":
			return settings.equalizer.midGainDb;
		case "eqHighGainDb":
			return settings.equalizer.highGainDb;
		case "compressorThresholdDb":
			return settings.compressor.thresholdDb;
		case "compressorRatio":
			return settings.compressor.ratio;
		case "reverbMix":
			return settings.reverb.mix;
		case "echoMix":
			return settings.echo.mix;
	}
	return 0;
}

export function setAudioKeyframePropertyValue({
	settings,
	property,
	value,
}: {
	settings: MediaAudioSettings;
	property: AudioKeyframeProperty;
	value: number;
}): MediaAudioSettings {
	const definition = AUDIO_KEYFRAME_DEFINITIONS[property];
	const next = Math.min(definition.max, Math.max(definition.min, value));
	switch (property) {
		case "volumeDb":
			return { ...settings, volumeDb: next };
		case "fadeIn":
			return { ...settings, fadeIn: next };
		case "fadeOut":
			return { ...settings, fadeOut: next };
		case "pan":
			return { ...settings, pan: next / 100 };
		case "denoiseAmount":
			return { ...settings, denoise: { ...settings.denoise, amount: next } };
		case "voiceClarity":
			return {
				...settings,
				voiceEnhance: { ...settings.voiceEnhance, clarity: next },
			};
		case "voiceWarmth":
			return {
				...settings,
				voiceEnhance: { ...settings.voiceEnhance, warmth: next },
			};
		case "voicePresence":
			return {
				...settings,
				voiceEnhance: { ...settings.voiceEnhance, presence: next },
			};
		case "pitchSemitones":
			return { ...settings, pitch: { ...settings.pitch, semitones: next } };
		case "eqLowGainDb":
			return {
				...settings,
				equalizer: { ...settings.equalizer, lowGainDb: next },
			};
		case "eqMidGainDb":
			return {
				...settings,
				equalizer: { ...settings.equalizer, midGainDb: next },
			};
		case "eqHighGainDb":
			return {
				...settings,
				equalizer: { ...settings.equalizer, highGainDb: next },
			};
		case "compressorThresholdDb":
			return {
				...settings,
				compressor: { ...settings.compressor, thresholdDb: next },
			};
		case "compressorRatio":
			return {
				...settings,
				compressor: { ...settings.compressor, ratio: next },
			};
		case "reverbMix":
			return { ...settings, reverb: { ...settings.reverb, mix: next } };
		case "echoMix":
			return { ...settings, echo: { ...settings.echo, mix: next } };
	}
	return settings;
}

export function resolveMediaAudioSettings({
	element,
	currentTime,
	fps,
}: {
	element: MediaElement;
	currentTime: number;
	fps: number;
}): MediaAudioSettings {
	let resolved = normalizeMediaAudioSettings({ element });
	const localFrame = Math.max(
		0,
		Math.round((currentTime - element.startTime) * fps)
	);
	for (const property of Object.keys(
		AUDIO_KEYFRAME_DEFINITIONS
	) as AudioKeyframeProperty[]) {
		const keyframes = resolved.keyframes?.[property];
		if (!keyframes?.length) continue;
		resolved = setAudioKeyframePropertyValue({
			settings: resolved,
			property,
			value: interpolateNumber(keyframes as Keyframe[], localFrame),
		});
	}
	return resolved;
}

export function upsertAudioKeyframe({
	keyframes,
	keyframe,
}: {
	keyframes: MediaPropertyKeyframe[];
	keyframe: MediaPropertyKeyframe;
}): MediaPropertyKeyframe[] {
	return [
		...keyframes.filter(
			(item) => item.id !== keyframe.id && item.frame !== keyframe.frame
		),
		keyframe,
	].sort((left, right) => left.frame - right.frame);
}

export function removeAudioKeyframeProperties({
	settings,
	properties,
}: {
	settings: MediaAudioSettings;
	properties: AudioKeyframeProperty[];
}): MediaAudioSettings {
	const removed = new Set<AudioKeyframeProperty>(properties);
	const keyframes = Object.fromEntries(
		Object.entries(settings.keyframes ?? {}).filter(
			([property]) => !removed.has(property as AudioKeyframeProperty)
		)
	) as MediaAudioSettings["keyframes"];
	return { ...settings, keyframes };
}
