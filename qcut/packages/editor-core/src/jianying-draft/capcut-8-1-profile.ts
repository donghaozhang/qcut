export const CAPCUT_8_1_PROFILE_ID = "capcut-desktop-8.1-plaintext" as const;
export const CAPCUT_8_1_APP_ID = 359_289 as const;
export const CAPCUT_8_1_APP_SOURCE = "cc" as const;
export const CAPCUT_8_1_APP_VERSION = "8.1.1" as const;
export const CAPCUT_8_1_NEW_VERSION = "159.0.0" as const;
/** Value written by CapCut 8.1.1 after opening and saving a 159.0.0 draft. */
export const CAPCUT_8_1_SAVED_NEW_VERSION = "179.0.0" as const;
export const CAPCUT_8_1_SCHEMA_VERSION = 360_000 as const;

export const CAPCUT_8_1_TOP_LEVEL_KEYS = [
	"id",
	"version",
	"new_version",
	"name",
	"duration",
	"create_time",
	"update_time",
	"fps",
	"is_drop_frame_timecode",
	"color_space",
	"config",
	"canvas_config",
	"tracks",
	"group_container",
	"materials",
	"keyframes",
	"keyframe_graph_list",
	"platform",
	"last_modified_platform",
	"mutable_config",
	"cover",
	"retouch_cover",
	"extra_info",
	"relationships",
	"render_index_track_mode_on",
	"free_render_index_mode_on",
	"static_cover_image_path",
	"source",
	"time_marks",
	"path",
	"lyrics_effects",
	"uneven_animation_template_info",
	"draft_type",
	"smart_ads_info",
	"function_assistant_info",
] as const;

export const CAPCUT_8_1_CONFIG_KEYS = [
	"video_mute",
	"record_audio_last_index",
	"extract_audio_last_index",
	"original_sound_last_index",
	"subtitle_recognition_id",
	"subtitle_taskinfo",
	"lyrics_recognition_id",
	"lyrics_taskinfo",
	"subtitle_sync",
	"lyrics_sync",
	"sticker_max_index",
	"adjust_max_index",
	"material_save_mode",
	"export_range",
	"maintrack_adsorb",
	"combination_max_index",
	"attachment_info",
	"zoom_info_params",
	"system_font_list",
	"multi_language_mode",
	"multi_language_main",
	"multi_language_current",
	"multi_language_list",
	"subtitle_keywords_config",
	"use_float_render",
] as const;

export const CAPCUT_8_1_KEYFRAME_BUCKET_KEYS = [
	"videos",
	"audios",
	"texts",
	"stickers",
	"filters",
	"adjusts",
	"handwrites",
	"effects",
] as const;

export const CAPCUT_8_1_MATERIAL_BUCKET_KEYS = [
	"flowers",
	"videos",
	"tail_leaders",
	"audios",
	"images",
	"texts",
	"effects",
	"stickers",
	"canvases",
	"transitions",
	"audio_effects",
	"audio_fades",
	"beats",
	"material_animations",
	"placeholders",
	"placeholder_infos",
	"speeds",
	"common_mask",
	"chromas",
	"text_templates",
	"realtime_denoises",
	"audio_pannings",
	"audio_pitch_shifts",
	"video_trackings",
	"hsl",
	"drafts",
	"color_curves",
	"hsl_curves",
	"primary_color_wheels",
	"log_color_wheels",
	"video_effects",
	"audio_balances",
	"handwrites",
	"manual_deformations",
	"manual_beautys",
	"plugin_effects",
	"sound_channel_mappings",
	"green_screens",
	"shapes",
	"material_colors",
	"digital_humans",
	"digital_human_model_dressing",
	"smart_crops",
	"ai_translates",
	"audio_track_indexes",
	"loudnesses",
	"vocal_beautifys",
	"vocal_separations",
	"smart_relights",
	"time_marks",
	"multi_language_refs",
	"video_shadows",
	"video_strokes",
	"video_radius",
] as const;

export const CAPCUT_8_1_TIMELINE_ID_TOKEN = "{timelineId}" as const;

export const CAPCUT_8_1_ACTIVE_CONTENT_MIRROR_TEMPLATES = [
	"draft_info.json",
	"template-2.tmp",
	`Timelines/${CAPCUT_8_1_TIMELINE_ID_TOKEN}/draft_info.json`,
	`Timelines/${CAPCUT_8_1_TIMELINE_ID_TOKEN}/template-2.tmp`,
] as const;

export const CAPCUT_8_1_PLACEHOLDER_ASSET_PATH_TEMPLATE =
	"##_draftpath_placeholder_{placeholderId}_##/assets/{mediaFolder}/{fileName}" as const;

export const CAPCUT_8_1_EXCLUDED_PLATFORM_IDENTITY_FIELDS = [
	"device_id",
	"hard_disk_id",
	"mac_address",
	"os_version",
] as const;

export type CapCut81MaterialBucketKey =
	(typeof CAPCUT_8_1_MATERIAL_BUCKET_KEYS)[number];
export type CapCut81AssetMediaFolder = "audio" | "image" | "lut" | "video";
export type CapCut81EmptyMaterials = Record<
	CapCut81MaterialBucketKey,
	unknown[]
>;

export interface CapCut81PlaceholderAssetPath {
	fileName: string;
	mediaFolder: CapCut81AssetMediaFolder;
	placeholderId: string;
}

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLACEHOLDER_ASSET_PATH_PATTERN =
	/^##_draftpath_placeholder_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_##\/assets\/(audio|image|lut|video)\/([^/\\]+)$/i;

function assertUuid({ label, value }: { label: string; value: string }): void {
	if (!UUID_PATTERN.test(value)) {
		throw new Error(`${label} must be a UUID.`);
	}
}

function assertAssetFileName({ fileName }: { fileName: string }): void {
	const isPathSegment =
		fileName.trim().length > 0 &&
		fileName !== "." &&
		fileName !== ".." &&
		!fileName.includes("/") &&
		!fileName.includes("\\") &&
		!fileName.includes("\0");
	if (!isPathSegment) {
		throw new Error("fileName must be one safe path segment.");
	}
}

export function buildCapCut81ActiveContentMirrorPaths({
	timelineId,
}: {
	timelineId: string;
}): readonly [string, string, string, string] {
	assertUuid({ label: "timelineId", value: timelineId });
	return [
		"draft_info.json",
		"template-2.tmp",
		`Timelines/${timelineId}/draft_info.json`,
		`Timelines/${timelineId}/template-2.tmp`,
	];
}

export function buildCapCut81PlaceholderAssetPath({
	fileName,
	mediaFolder,
	placeholderId,
}: CapCut81PlaceholderAssetPath): string {
	assertUuid({ label: "placeholderId", value: placeholderId });
	assertAssetFileName({ fileName });
	return `##_draftpath_placeholder_${placeholderId}_##/assets/${mediaFolder}/${fileName}`;
}

export function parseCapCut81PlaceholderAssetPath({
	path,
}: {
	path: string;
}): CapCut81PlaceholderAssetPath | null {
	const match = PLACEHOLDER_ASSET_PATH_PATTERN.exec(path);
	if (!match) {
		return null;
	}
	const [, placeholderId, mediaFolder, fileName] = match;
	if (!(placeholderId && mediaFolder && fileName)) {
		return null;
	}
	return {
		fileName,
		mediaFolder: mediaFolder.toLowerCase() as CapCut81AssetMediaFolder,
		placeholderId,
	};
}

export function createEmptyCapCut81Materials(): CapCut81EmptyMaterials {
	const materials = {} as CapCut81EmptyMaterials;
	for (const key of CAPCUT_8_1_MATERIAL_BUCKET_KEYS) {
		materials[key] = [];
	}
	return materials;
}

export const CAPCUT_8_1_SCAFFOLD_PROFILE = {
	app: {
		id: CAPCUT_8_1_APP_ID,
		source: CAPCUT_8_1_APP_SOURCE,
		version: CAPCUT_8_1_APP_VERSION,
	},
	content: {
		configKeys: CAPCUT_8_1_CONFIG_KEYS,
		keyframeBuckets: CAPCUT_8_1_KEYFRAME_BUCKET_KEYS,
		materialBuckets: CAPCUT_8_1_MATERIAL_BUCKET_KEYS,
		newVersion: CAPCUT_8_1_NEW_VERSION,
		schemaVersion: CAPCUT_8_1_SCHEMA_VERSION,
		topLevelKeys: CAPCUT_8_1_TOP_LEVEL_KEYS,
	},
	evidence: {
		observations: [
			"official-empty-draft",
			"official-single-video-save-round-trip",
		],
		payloadIncluded: false,
	},
	identity: {
		excludedPlatformFields: CAPCUT_8_1_EXCLUDED_PLATFORM_IDENTITY_FIELDS,
	},
	profileId: CAPCUT_8_1_PROFILE_ID,
	storage: {
		activeContentMirrors: CAPCUT_8_1_ACTIVE_CONTENT_MIRROR_TEMPLATES,
		placeholderAssetPath: CAPCUT_8_1_PLACEHOLDER_ASSET_PATH_TEMPLATE,
		timelineIdToken: CAPCUT_8_1_TIMELINE_ID_TOKEN,
	},
} as const;
