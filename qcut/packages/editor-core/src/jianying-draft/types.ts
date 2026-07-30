import type {
	ProjectAudioMixSettings,
	TimelineTrack,
} from "../types/timeline.js";

export type JianyingDraftTargetPlatform = "macos" | "windows";
export type JianyingDraftMediaType = "video" | "image" | "audio";
export type JianyingDraftIssueSeverity = "info" | "warning" | "error";

interface QCutDraftExportMediaBase {
	id: string;
	name: string;
	sourcePath: string;
}

export interface QCutDraftExportVideoMedia extends QCutDraftExportMediaBase {
	type: "video";
	duration: number;
	width: number;
	height: number;
}

export interface QCutDraftExportImageMedia extends QCutDraftExportMediaBase {
	type: "image";
	width: number;
	height: number;
}

export interface QCutDraftExportAudioMedia extends QCutDraftExportMediaBase {
	type: "audio";
	duration: number;
}

export type QCutDraftExportMedia =
	| QCutDraftExportVideoMedia
	| QCutDraftExportImageMedia
	| QCutDraftExportAudioMedia;

export interface QCutDraftExportProject {
	audioMix?: ProjectAudioMixSettings;
	id: string;
	name: string;
	sceneId: string;
	width: number;
	height: number;
	fps: number;
	backgroundColor: string;
	backgroundType: "color" | "blur";
}

/**
 * Renderer-owned, serializable source of truth for draft export.
 * Timeline durations must come from QCut's playback-aware timing helpers.
 */
export interface QCutDraftExportSnapshotV1 {
	schemaVersion: 1;
	project: QCutDraftExportProject;
	tracks: TimelineTrack[];
	media: QCutDraftExportMedia[];
	timelineDurationByElementId: Record<string, number>;
}

export interface JianyingDraftIssue {
	code: string;
	severity: JianyingDraftIssueSeverity;
	message: string;
	elementId?: string;
	trackId?: string;
	mediaId?: string;
}

export interface JianyingTimeRange {
	duration: number;
	start: number;
}

export interface JianyingClipSettings {
	alpha: number;
	flip: {
		horizontal: boolean;
		vertical: boolean;
	};
	rotation: number;
	scale: {
		x: number;
		y: number;
	};
	transform: {
		x: number;
		y: number;
	};
}

export interface JianyingSpeedMaterial {
	curve_speed: null;
	id: string;
	mode: 0;
	speed: number;
	type: "speed";
}

export interface JianyingVideoMaterial {
	audio_fade: null;
	category_id: "";
	category_name: "local";
	check_flag: 63487;
	crop: {
		upper_left_x: 0;
		upper_left_y: 0;
		upper_right_x: 1;
		upper_right_y: 0;
		lower_left_x: 0;
		lower_left_y: 1;
		lower_right_x: 1;
		lower_right_y: 1;
	};
	crop_ratio: "free";
	crop_scale: 1;
	duration: number;
	height: number;
	id: string;
	local_material_id: "";
	material_id: string;
	material_name: string;
	media_path: "";
	path: string;
	type: "video" | "photo";
	width: number;
}

export interface JianyingAudioMaterial {
	app_id: 0;
	category_id: "";
	category_name: "local";
	check_flag: 3;
	copyright_limit_type: "none";
	duration: number;
	effect_id: "";
	formula_id: "";
	id: string;
	local_material_id: string;
	music_id: string;
	name: string;
	path: string;
	source_platform: 0;
	type: "extract_music";
	wave_points: unknown[];
}

export interface JianyingDraftMaterials {
	audios: JianyingAudioMaterial[];
	speeds: JianyingSpeedMaterial[];
	videos: JianyingVideoMaterial[];
	[key: string]: unknown[];
}

export interface JianyingDraftSegment {
	clip: JianyingClipSettings | null;
	common_keyframes: unknown[];
	enable_adjust: true;
	enable_color_correct_adjust: false;
	enable_color_curves: true;
	enable_color_match_adjust: false;
	enable_color_wheels: true;
	enable_lut: true;
	enable_smart_color_adjust: false;
	extra_material_refs: string[];
	hdr_settings: {
		intensity: 1;
		mode: 1;
		nits: 1000;
	} | null;
	id: string;
	is_tone_modify: boolean;
	keyframe_refs: unknown[];
	last_nonzero_volume: number;
	material_id: string;
	render_index: number;
	reverse: false;
	source_timerange: JianyingTimeRange;
	speed: number;
	target_timerange: JianyingTimeRange;
	track_attribute: 0;
	track_render_index: 0;
	uniform_scale?: {
		on: boolean;
		value: 1;
	};
	visible: true;
	volume: number;
}

export interface JianyingDraftTrack {
	attribute: 0 | 1;
	flag: 0;
	id: string;
	is_default_name: boolean;
	name: string;
	segments: JianyingDraftSegment[];
	type: "video" | "audio";
}

export interface JianyingDraftPlatform {
	app_id: 3704;
	app_source: "lv";
	app_version: "5.9.0";
	os: "mac" | "windows";
}

export interface JianyingDraftContent {
	canvas_config: {
		height: number;
		ratio: "original";
		width: number;
	};
	color_space: 0;
	config: Record<string, unknown>;
	cover: null;
	create_time: number;
	duration: number;
	extra_info: null;
	fps: number;
	free_render_index_mode_on: false;
	group_container: null;
	id: string;
	keyframe_graph_list: unknown[];
	keyframes: Record<string, unknown[]>;
	last_modified_platform: JianyingDraftPlatform;
	materials: JianyingDraftMaterials;
	mutable_config: null;
	name: string;
	new_version: "110.0.0";
	platform: JianyingDraftPlatform;
	relationships: unknown[];
	render_index_track_mode_on: false;
	retouch_cover: null;
	source: "default";
	static_cover_image_path: "";
	time_marks: null;
	tracks: JianyingDraftTrack[];
	update_time: number;
	version: 360000;
}

export interface JianyingDraftAssetCopy {
	draftMediaPath: string;
	materialId: string;
	mediaId: string;
	relativePath: string;
	sourcePath: string;
	type: JianyingDraftMediaType;
}

export interface JianyingDraftCompatibility {
	appSource: "lv";
	appVersion: "5.9.0";
	baseline: "synthetic-plaintext-5.9";
	contentFileName: "draft_info.json" | "draft_content.json";
	contentFileNameEvidence: "plaintext-5.9-reference";
	registeredWithApp: false;
	verifiedWithInstalledApp: false;
}

export interface JianyingDraftBuildResult {
	assets: JianyingDraftAssetCopy[];
	canWrite: boolean;
	compatibility: JianyingDraftCompatibility;
	content: JianyingDraftContent;
	issues: JianyingDraftIssue[];
}
