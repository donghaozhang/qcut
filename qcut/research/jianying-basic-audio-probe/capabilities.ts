export type AudioBasicCapabilityId =
	| "audio-translate"
	| "channel-mapping"
	| "fade"
	| "loudness"
	| "pitch-shift"
	| "realtime-denoise"
	| "stereo-panning"
	| "vocal-beautify"
	| "vocal-separation"
	| "volume";

export type StaticMarkerSource =
	| "creatorStrings"
	| "videoEditorStrings"
	| "videoEditorSymbols";

export interface AudioBasicCapabilityDefinition {
	draftCollections: string[];
	id: AudioBasicCapabilityId;
	labelEn: string;
	labelZh: string;
	segmentFields: string[];
	staticMarkers: Record<StaticMarkerSource, string[]>;
}

export const AUDIO_BASIC_CAPABILITIES: AudioBasicCapabilityDefinition[] = [
	{
		draftCollections: [],
		id: "volume",
		labelEn: "Volume",
		labelZh: "音量",
		segmentFields: ["volume", "last_nonzero_volume"],
		staticMarkers: {
			creatorStrings: [],
			videoEditorStrings: [],
			videoEditorSymbols: [
				"lvve::SegmentAudio::set_volume",
				"lvve::SegmentVideo::set_volume",
			],
		},
	},
	{
		draftCollections: ["audio_fades"],
		id: "fade",
		labelEn: "Fade in/out",
		labelZh: "淡入/淡出",
		segmentFields: [],
		staticMarkers: {
			creatorStrings: [],
			videoEditorStrings: ["AUDIO_FADE_IN_ACTION", "AUDIO_FADE_OUT_ACTION"],
			videoEditorSymbols: [
				"lvve::MaterialAudioFade::get_fade_in_duration",
				"lvve::MaterialAudioFade::get_fade_out_duration",
				"lvve::MaterialAudioFade::get_fade_type",
			],
		},
	},
	{
		draftCollections: ["loudnesses", "audio_balances"],
		id: "loudness",
		labelEn: "Loudness normalization",
		labelZh: "响度统一",
		segmentFields: [],
		staticMarkers: {
			creatorStrings: ["KAudioLoudness", "LoudnessManager"],
			videoEditorStrings: ["AUDIO_LOUDNESS_ACTION"],
			videoEditorSymbols: [
				"lvve::MaterialLoudness::get_target_loudness",
				"lvve::LoudnessParam::get_avg_loudness",
				"lvve::LoudnessParam::get_peak_loudness",
			],
		},
	},
	{
		draftCollections: ["realtime_denoises"],
		id: "realtime-denoise",
		labelEn: "Audio denoise",
		labelZh: "音频降噪",
		segmentFields: [],
		staticMarkers: {
			creatorStrings: [
				"KAudioDenoise",
				"unet_denoise_44k_music_model_v1.0.model",
			],
			videoEditorStrings: ["AUDIO_REALTIME_DENOISE"],
			videoEditorSymbols: [
				"lvve::MaterialRealtimeDenoise::get_is_denoise",
				"lvve::MaterialRealtimeDenoise::get_denoise_mode",
				"lvve::MaterialRealtimeDenoise::get_denoise_rate",
			],
		},
	},
	{
		draftCollections: ["vocal_beautifys"],
		id: "vocal-beautify",
		labelEn: "Vocal beautify",
		labelZh: "人声美化",
		segmentFields: [],
		staticMarkers: {
			creatorStrings: [
				"KAudioVocalBeautify",
				"vocal_beautify_task.cpp",
				"vocal_beautify_sami_service.cpp",
			],
			videoEditorStrings: [],
			videoEditorSymbols: [
				"lvve::MaterialVocalBeautify::get_enable",
				"lvve::MaterialVocalBeautify::get_production_path",
				"lvve::MaterialVocalBeautify::get_voice_change_mode",
			],
		},
	},
	{
		draftCollections: ["vocal_separations"],
		id: "vocal-separation",
		labelEn: "Vocal separation",
		labelZh: "声音分离",
		segmentFields: [],
		staticMarkers: {
			creatorStrings: [
				"vocal_separation_audio_alg_manager.cpp",
				"vocal_separation_sami_service.cpp",
			],
			videoEditorStrings: ["LVVE_UPDATE_VOCAL_SEPARATION_CHOICE_ACTION"],
			videoEditorSymbols: [
				"lvve::MaterialVocalSeparation::get_choice",
				"lvve::MaterialVocalSeparation::get_production_path",
				"lvve::MaterialVocalSeparation::get_removed_sounds",
			],
		},
	},
	{
		draftCollections: ["audio_pitch_shifts"],
		id: "pitch-shift",
		labelEn: "Pitch shift",
		labelZh: "变调",
		segmentFields: [],
		staticMarkers: {
			creatorStrings: ["AudioPitchShiftViewModel", "MaintainAudioPitch"],
			videoEditorStrings: [],
			videoEditorSymbols: [
				"lvve::MaterialAudioPitchShift::get_enable_pitch_shift",
				"lvve::MaterialAudioPitchShift::get_semitones",
				"lvve::MaterialAudioPitchShift::get_cents",
			],
		},
	},
	{
		draftCollections: ["audio_pannings"],
		id: "stereo-panning",
		labelEn: "Stereo panning",
		labelZh: "立体声平衡",
		segmentFields: [],
		staticMarkers: {
			creatorStrings: [],
			videoEditorStrings: [],
			videoEditorSymbols: [
				"lvve::MaterialAudioPanning::get_enable_panning",
				"lvve::MaterialAudioPanning::get_panning_value",
			],
		},
	},
	{
		draftCollections: ["sound_channel_mappings"],
		id: "channel-mapping",
		labelEn: "Channel configuration",
		labelZh: "声道配置",
		segmentFields: [],
		staticMarkers: {
			creatorStrings: [],
			videoEditorStrings: [],
			videoEditorSymbols: [
				"lvve::MaterialChannelConfig::get_audio_channel_mapping",
				"lvve::MaterialChannelConfig::get_is_config_open",
			],
		},
	},
	{
		draftCollections: ["ai_translates", "multi_language_refs"],
		id: "audio-translate",
		labelEn: "Audio translation",
		labelZh: "音频翻译",
		segmentFields: [],
		staticMarkers: {
			creatorStrings: [
				"Audio Effect Log AI Translate Task End",
				"upload_audio_cost",
				"web_task_cost",
				"download_cost",
			],
			videoEditorStrings: [],
			videoEditorSymbols: [
				"lvve::MaterialAiTranslate::get_source_language",
				"lvve::MaterialAiTranslate::get_target_language",
				"lvve::MaterialAiTranslate::get_production_path",
				"lvve::MaterialAiTranslate::get_mouth_shape_modify",
			],
		},
	},
];

export const AUDIO_MATERIAL_COLLECTIONS = [
	...new Set(
		AUDIO_BASIC_CAPABILITIES.flatMap(({ draftCollections }) => draftCollections)
	),
].sort();

function recordValue({
	value,
}: {
	value: unknown;
}): Record<string, unknown> | null {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function numberDiffersFrom({
	defaultValue,
	value,
}: {
	defaultValue: number;
	value: unknown;
}): boolean {
	return typeof value === "number" && value !== defaultValue;
}

function nonEmptyString({ value }: { value: unknown }): boolean {
	return typeof value === "string" && value.length > 0;
}

function nonEmptyArray({ value }: { value: unknown }): boolean {
	return Array.isArray(value) && value.length > 0;
}

export function isActiveAudioMaterial({
	capabilityId,
	collection,
	value,
}: {
	capabilityId: AudioBasicCapabilityId;
	collection: string;
	value: unknown;
}): boolean {
	const material = recordValue({ value });
	if (!material) return false;
	switch (capabilityId) {
		case "fade":
			return (
				numberDiffersFrom({
					defaultValue: 0,
					value: material.fade_in_duration,
				}) ||
				numberDiffersFrom({
					defaultValue: 0,
					value: material.fade_out_duration,
				})
			);
		case "loudness":
			return (
				material.enable === true ||
				material.enable_balance === true ||
				numberDiffersFrom({
					defaultValue: 0,
					value: material.target_loudness,
				}) ||
				recordValue({ value: material.loudness_param }) !== null
			);
		case "realtime-denoise":
			return material.is_denoise === true;
		case "vocal-beautify":
			return (
				material.enable === true ||
				nonEmptyString({ value: material.production_path })
			);
		case "vocal-separation":
			return (
				numberDiffersFrom({ defaultValue: 0, value: material.choice }) ||
				nonEmptyString({ value: material.production_path }) ||
				nonEmptyArray({ value: material.removed_sounds })
			);
		case "pitch-shift":
			return (
				material.enable_pitch_shift === true ||
				numberDiffersFrom({ defaultValue: 0, value: material.semitones }) ||
				numberDiffersFrom({ defaultValue: 0, value: material.cents })
			);
		case "stereo-panning":
			return (
				material.enable_panning === true ||
				numberDiffersFrom({
					defaultValue: 0,
					value: material.panning_value,
				})
			);
		case "channel-mapping":
			return (
				material.is_config_open === true ||
				numberDiffersFrom({
					defaultValue: 0,
					value: material.audio_channel_mapping,
				}) ||
				(nonEmptyString({ value: material.type }) && material.type !== "none")
			);
		case "audio-translate":
			return (
				collection === "multi_language_refs" ||
				material.enable === true ||
				nonEmptyString({ value: material.production_path }) ||
				material.is_contain_ai_translate_result === true
			);
		case "volume":
			return false;
	}
}

export function isActiveAudioSegment({
	capabilityId,
	segment,
}: {
	capabilityId: AudioBasicCapabilityId;
	segment: Record<string, unknown>;
}): boolean {
	if (capabilityId !== "volume") return false;
	return (
		numberDiffersFrom({ defaultValue: 1, value: segment.volume }) ||
		numberDiffersFrom({ defaultValue: 1, value: segment.last_nonzero_volume })
	);
}
