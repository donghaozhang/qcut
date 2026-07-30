import type { JianyingDraftMaterials } from "./types.js";

export const JIANYING_PLAINTEXT_APP_VERSION = "5.9.0" as const;
export const JIANYING_PLAINTEXT_SCHEMA_VERSION = 360000 as const;
export const JIANYING_IMAGE_SOURCE_DURATION_MICROSECONDS =
	10_800_000_000 as const;

export function createEmptyJianyingMaterials(): JianyingDraftMaterials {
	return {
		ai_translates: [],
		audio_balances: [],
		audio_effects: [],
		audio_fades: [],
		audio_track_indexes: [],
		audios: [],
		beats: [],
		canvases: [],
		chromas: [],
		color_curves: [],
		digital_humans: [],
		drafts: [],
		effects: [],
		flowers: [],
		green_screens: [],
		handwrites: [],
		hsl: [],
		images: [],
		log_color_wheels: [],
		loudnesses: [],
		manual_deformations: [],
		masks: [],
		material_animations: [],
		material_colors: [],
		multi_language_refs: [],
		placeholders: [],
		plugin_effects: [],
		primary_color_wheels: [],
		realtime_denoises: [],
		shapes: [],
		smart_crops: [],
		smart_relights: [],
		sound_channel_mappings: [],
		speeds: [],
		stickers: [],
		tail_leaders: [],
		text_templates: [],
		texts: [],
		time_marks: [],
		transitions: [],
		video_effects: [],
		video_trackings: [],
		videos: [],
		vocal_beautifys: [],
		vocal_separations: [],
	};
}

export function createEmptyJianyingKeyframes(): Record<string, unknown[]> {
	return {
		adjusts: [],
		audios: [],
		effects: [],
		filters: [],
		handwrites: [],
		stickers: [],
		texts: [],
		videos: [],
	};
}

export function createJianyingConfig(): Record<string, unknown> {
	return {
		adjust_max_index: 1,
		attachment_info: [],
		combination_max_index: 1,
		export_range: null,
		extract_audio_last_index: 1,
		lyrics_recognition_id: "",
		lyrics_sync: true,
		lyrics_taskinfo: [],
		maintrack_adsorb: true,
		material_save_mode: 0,
		multi_language_current: "none",
		multi_language_list: [],
		multi_language_main: "none",
		multi_language_mode: "none",
		original_sound_last_index: 1,
		record_audio_last_index: 1,
		sticker_max_index: 1,
		subtitle_keywords_config: null,
		subtitle_recognition_id: "",
		subtitle_sync: true,
		subtitle_taskinfo: [],
		system_font_list: [],
		video_mute: false,
		zoom_info_params: null,
	};
}
