import type { TranslationKey } from "@/lib/i18n";
import type { AudioKeyframeProperty, AudioStemName } from "@/types/timeline";

export const AUDIO_KEYFRAME_LABEL_KEYS: Record<
	AudioKeyframeProperty,
	TranslationKey
> = {
	volumeDb: "audioProperties.label.volume",
	fadeIn: "audioProperties.label.fadeIn",
	fadeOut: "audioProperties.label.fadeOut",
	pan: "audioProperties.section.pan",
	denoiseAmount: "audioProperties.label.denoiseAmount",
	voiceClarity: "audioProperties.label.voiceClarity",
	voiceWarmth: "audioProperties.label.voiceWarmth",
	voicePresence: "audioProperties.label.voicePresence",
	pitchSemitones: "audioProperties.label.pitchSemitones",
	eqLowGainDb: "audioProperties.label.eqLowGainDb",
	eqMidGainDb: "audioProperties.label.eqMidGainDb",
	eqHighGainDb: "audioProperties.label.eqHighGainDb",
	compressorThresholdDb: "audioProperties.label.compressorThresholdDb",
	compressorRatio: "audioProperties.label.compressorRatio",
	reverbMix: "audioProperties.label.reverbMix",
	echoMix: "audioProperties.label.echoMix",
};

export const AUDIO_STEM_LABEL_KEYS: Partial<
	Record<AudioStemName, TranslationKey>
> = {
	vocals: "audioProperties.stem.vocals",
	instrumental: "audioProperties.stem.instrumental",
	drums: "audioProperties.stem.drums",
	bass: "audioProperties.stem.bass",
	other: "audioProperties.stem.other",
	guitar: "audioProperties.stem.guitar",
	piano: "audioProperties.stem.piano",
};

export const AUDIO_PRESET_NAME_KEYS: Partial<Record<string, TranslationKey>> = {
	"audio-preset-clean-voice": "audioProperties.preset.name.cleanVoice",
	"audio-preset-podcast": "audioProperties.preset.name.podcast",
	"audio-preset-warm-narration": "audioProperties.preset.name.warmNarration",
	"audio-preset-music-polish": "audioProperties.preset.name.musicPolish",
	"audio-preset-telephone": "audioProperties.preset.name.telephone",
	"audio-preset-large-room": "audioProperties.preset.name.largeRoom",
};
