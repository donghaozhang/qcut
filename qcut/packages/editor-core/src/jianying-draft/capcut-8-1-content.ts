import {
	buildCapCut81ActiveContentMirrorPaths,
	buildCapCut81PlaceholderAssetPath,
	CAPCUT_8_1_APP_ID,
	CAPCUT_8_1_APP_SOURCE,
	CAPCUT_8_1_APP_VERSION,
	CAPCUT_8_1_CONFIG_KEYS,
	CAPCUT_8_1_KEYFRAME_BUCKET_KEYS,
	CAPCUT_8_1_MATERIAL_BUCKET_KEYS,
	CAPCUT_8_1_NEW_VERSION,
	CAPCUT_8_1_SCHEMA_VERSION,
	CAPCUT_8_1_TOP_LEVEL_KEYS,
	createEmptyCapCut81Materials,
	parseCapCut81PlaceholderAssetPath,
	type CapCut81EmptyMaterials,
	type CapCut81MaterialBucketKey,
} from "./capcut-8-1-profile.js";
import {
	CAPCUT_NATIVE_DISSOLVE_METADATA,
	JIANYING_NATIVE_DISSOLVE_METADATA,
} from "./transition-mapping.js";
import {
	isVerifiedCapCut81TransitionMaterial,
	isVerifiedJianyingTransitionMaterial,
} from "./transition-validation.js";
import { CAPCUT_8_1_DEFAULT_ADJUST_BUNDLE_PATH_PLACEHOLDER } from "./capcut-8-1-lut.js";
import type {
	JianyingAudioMaterial,
	JianyingDraftAssetCopy,
	JianyingDraftBuildResult,
	JianyingDraftContent,
	JianyingDraftSegment,
	JianyingDraftTargetPlatform,
	JianyingDraftTrack,
	JianyingSpeedMaterial,
	JianyingTimeRange,
	JianyingTransitionMaterial,
	JianyingVideoMaterial,
} from "./types.js";

type CapCut81ConfigKey = (typeof CAPCUT_8_1_CONFIG_KEYS)[number];
type CapCut81KeyframeBucketKey =
	(typeof CAPCUT_8_1_KEYFRAME_BUCKET_KEYS)[number];

export interface CapCut81Platform {
	app_id: typeof CAPCUT_8_1_APP_ID;
	app_source: typeof CAPCUT_8_1_APP_SOURCE;
	app_version: typeof CAPCUT_8_1_APP_VERSION;
	device_id: "";
	hard_disk_id: "";
	mac_address: "";
	os: "mac" | "windows";
	os_version: "";
}

export type CapCut81DraftMaterials = Omit<
	CapCut81EmptyMaterials,
	"audios" | "speeds" | "transitions" | "videos"
> & {
	audios: JianyingAudioMaterial[];
	speeds: JianyingSpeedMaterial[];
	transitions: JianyingTransitionMaterial[];
	videos: JianyingVideoMaterial[];
};

export type CapCut81DraftSegment = Omit<
	JianyingDraftSegment,
	"source_timerange" | "track_render_index"
> & {
	source_timerange: JianyingTimeRange | null;
	track_render_index: number;
};

export type CapCut81DraftTrack = Omit<
	JianyingDraftTrack,
	"flag" | "segments" | "type"
> & {
	flag: 0 | 2;
	segments: CapCut81DraftSegment[];
	type: JianyingDraftTrack["type"] | "adjust" | "filter";
};

export interface CapCut81DraftContent {
	id: string;
	version: typeof CAPCUT_8_1_SCHEMA_VERSION;
	new_version: typeof CAPCUT_8_1_NEW_VERSION;
	name: string;
	duration: number;
	create_time: number;
	update_time: number;
	fps: number;
	is_drop_frame_timecode: false;
	color_space: -1;
	config: Record<CapCut81ConfigKey, unknown>;
	canvas_config: JianyingDraftContent["canvas_config"] & {
		background: null;
	};
	tracks: CapCut81DraftTrack[];
	group_container: JianyingDraftContent["group_container"];
	materials: CapCut81DraftMaterials;
	keyframes: Record<CapCut81KeyframeBucketKey, unknown[]>;
	keyframe_graph_list: JianyingDraftContent["keyframe_graph_list"];
	platform: CapCut81Platform;
	last_modified_platform: CapCut81Platform;
	mutable_config: JianyingDraftContent["mutable_config"];
	cover: JianyingDraftContent["cover"];
	retouch_cover: JianyingDraftContent["retouch_cover"];
	extra_info: JianyingDraftContent["extra_info"];
	relationships: JianyingDraftContent["relationships"];
	render_index_track_mode_on: true;
	free_render_index_mode_on: false;
	static_cover_image_path: "";
	source: JianyingDraftContent["source"];
	time_marks: JianyingDraftContent["time_marks"];
	path: "";
	lyrics_effects: unknown[];
	uneven_animation_template_info: {
		composition: "";
		content: "";
		order: "";
		sub_template_info_list: unknown[];
	};
	draft_type: "video";
	smart_ads_info: {
		draft_url: "";
		page_from: "";
		routine: "";
	};
	function_assistant_info: Record<string, unknown>;
}

const CAPCUT_8_1_CONFIG_DEFAULTS: Record<CapCut81ConfigKey, unknown> = {
	video_mute: false,
	record_audio_last_index: 1,
	extract_audio_last_index: 1,
	original_sound_last_index: 1,
	subtitle_recognition_id: "",
	subtitle_taskinfo: [],
	lyrics_recognition_id: "",
	lyrics_taskinfo: [],
	subtitle_sync: true,
	lyrics_sync: true,
	sticker_max_index: 1,
	adjust_max_index: 1,
	material_save_mode: 0,
	export_range: null,
	maintrack_adsorb: true,
	combination_max_index: 1,
	attachment_info: [],
	zoom_info_params: null,
	system_font_list: [],
	multi_language_mode: "none",
	multi_language_main: "none",
	multi_language_current: "none",
	multi_language_list: [],
	subtitle_keywords_config: null,
	use_float_render: false,
};

const MATERIAL_BUCKET_KEY_SET = new Set<string>(
	CAPCUT_8_1_MATERIAL_BUCKET_KEYS
);
const CONFIG_KEY_SET = new Set<string>(CAPCUT_8_1_CONFIG_KEYS);
const KEYFRAME_BUCKET_KEY_SET = new Set<string>(
	CAPCUT_8_1_KEYFRAME_BUCKET_KEYS
);
const TOP_LEVEL_KEY_SET = new Set<string>(CAPCUT_8_1_TOP_LEVEL_KEYS);
const ASSET_RELATIVE_PATH_PATTERN = /^assets\/(audio|image|video)\/([^/\\]+)$/;
const CAPCUT_8_1_CANVAS_CONFIG_KEYS = [
	"ratio",
	"width",
	"height",
	"background",
] as const;
const CAPCUT_8_1_MASK_RESOURCE_IDS = {
	circle: "7374021188315517456",
	rectangle: "7374021450748924432",
} as const;

function cloneValue<Value>({ value }: { value: Value }): Value {
	return structuredClone(value);
}

function assertExactKeyOrder({
	actual,
	expected,
	label,
}: {
	actual: string[];
	expected: readonly string[];
	label: string;
}): void {
	if (
		actual.length !== expected.length ||
		actual.some((key, index) => key !== expected[index])
	) {
		throw new Error(`${label} does not match the CapCut 8.1 profile.`);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): Record<string, unknown> {
	if (!isRecord(value)) {
		throw new Error(`${label} must be an object.`);
	}
	return value;
}

function requireString({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): string {
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`${label} must be a non-empty string.`);
	}
	return value;
}

function validateCapCut81MaskReferences({
	content,
}: {
	content: CapCut81DraftContent;
}): void {
	const masksById = new Map<string, Record<string, unknown>>();
	for (const value of content.materials.common_mask) {
		const mask = requireRecord({ label: "common_mask material", value });
		const id = requireString({ label: "common_mask id", value: mask.id });
		if (masksById.has(id)) {
			throw new Error(`Duplicate common_mask material: ${id}.`);
		}
		const resourceType = mask.resource_type;
		if (resourceType !== "circle" && resourceType !== "rectangle") {
			throw new Error(`Mask ${id} is outside the verified CapCut 8.1 subset.`);
		}
		if (
			mask.type !== "mask" ||
			mask.resource_id !== CAPCUT_8_1_MASK_RESOURCE_IDS[resourceType] ||
			mask.path !== ""
		) {
			throw new Error(`Mask ${id} does not match its CapCut 8.1 resource.`);
		}
		masksById.set(id, mask);
	}

	const referenceCounts = new Map([...masksById.keys()].map((id) => [id, 0]));
	for (const track of content.tracks) {
		for (const segment of track.segments) {
			for (const reference of segment.extra_material_refs) {
				if (!masksById.has(reference)) continue;
				if (track.type !== "video") {
					throw new Error(
						`Mask ${reference} is referenced by a non-video track.`
					);
				}
				referenceCounts.set(
					reference,
					(referenceCounts.get(reference) ?? 0) + 1
				);
			}
		}
	}
	for (const [id, count] of referenceCounts) {
		if (count !== 1) {
			throw new Error(`Mask ${id} must be referenced by exactly one segment.`);
		}
	}
}

function validateCapCut81CustomLuts({
	content,
	placeholderIds,
}: {
	content: CapCut81DraftContent;
	placeholderIds: Set<string>;
}): void {
	const lutEffects = new Map<string, Record<string, unknown>>();
	for (const value of content.materials.effects) {
		const effect = requireRecord({ label: "effect material", value });
		if (effect.type !== "lut" || effect.source_platform !== 0) continue;
		const id = requireString({
			label: "custom LUT effect id",
			value: effect.id,
		});
		const name = requireString({
			label: `custom LUT ${id} name`,
			value: effect.name,
		});
		const path = requireString({
			label: `custom LUT ${id} path`,
			value: effect.path,
		});
		const [assetPath, adjustBundlePath, ...remainingPaths] = path.split(";");
		const parsedAssetPath = assetPath
			? parseCapCut81PlaceholderAssetPath({ path: assetPath })
			: null;
		if (
			!parsedAssetPath ||
			parsedAssetPath.mediaFolder !== "lut" ||
			parsedAssetPath.fileName !== name ||
			adjustBundlePath !== CAPCUT_8_1_DEFAULT_ADJUST_BUNDLE_PATH_PLACEHOLDER ||
			remainingPaths.length > 0
		) {
			throw new Error(
				`Custom LUT ${id} does not use both portable path tokens.`
			);
		}
		if (
			effect.effect_id !== "" ||
			effect.resource_id !== "" ||
			effect.lumi_hub_path !== `${path}/lumi_hub_path`
		) {
			throw new Error(
				`Custom LUT ${id} does not match the import-time oracle.`
			);
		}
		placeholderIds.add(parsedAssetPath.placeholderId);
		if (lutEffects.has(id)) {
			throw new Error(`Duplicate custom LUT effect: ${id}.`);
		}
		lutEffects.set(id, effect);
	}

	const adjustPlaceholders = new Map<string, Record<string, unknown>>();
	for (const value of content.materials.placeholders) {
		const placeholder = requireRecord({ label: "placeholder material", value });
		if (placeholder.type !== "adjust") continue;
		const id = requireString({
			label: "adjust placeholder id",
			value: placeholder.id,
		});
		if (
			placeholder.material_resource_id !== "" ||
			typeof placeholder.name !== "string"
		) {
			throw new Error(`Adjust placeholder ${id} is invalid.`);
		}
		adjustPlaceholders.set(id, placeholder);
	}

	const referencedLuts = new Set<string>();
	const referencedPlaceholders = new Set<string>();
	for (const track of content.tracks) {
		if (track.type !== "adjust") continue;
		for (const segment of track.segments) {
			if (!adjustPlaceholders.has(segment.material_id)) {
				throw new Error(
					`Adjust segment ${segment.id} has no matching placeholder.`
				);
			}
			if (referencedPlaceholders.has(segment.material_id)) {
				throw new Error(
					`Adjust placeholder ${segment.material_id} is referenced more than once.`
				);
			}
			referencedPlaceholders.add(segment.material_id);
			const customLutReferences = segment.extra_material_refs.filter((id) =>
				lutEffects.has(id)
			);
			if (customLutReferences.length !== 1) {
				throw new Error(
					`Adjust segment ${segment.id} must reference exactly one custom LUT.`
				);
			}
			const [lutId] = customLutReferences;
			if (!lutId || referencedLuts.has(lutId)) {
				throw new Error(
					`Custom LUT ${lutId ?? ""} is referenced more than once.`
				);
			}
			referencedLuts.add(lutId);
		}
	}
	if (
		referencedLuts.size !== lutEffects.size ||
		referencedPlaceholders.size !== adjustPlaceholders.size
	) {
		throw new Error(
			"Custom LUT effects and adjust placeholders must not be orphaned."
		);
	}
}

function assertKnownTopLevelKeys({
	content,
}: {
	content: JianyingDraftContent;
}): void {
	for (const key of Object.keys(content)) {
		if (!TOP_LEVEL_KEY_SET.has(key)) {
			throw new Error(`Unsupported source content key: ${key}.`);
		}
	}
}

function createCapCut81Config({
	source,
}: {
	source: Record<string, unknown>;
}): Record<CapCut81ConfigKey, unknown> {
	for (const key of Object.keys(source)) {
		if (!CONFIG_KEY_SET.has(key)) {
			throw new Error(`Unsupported source config key: ${key}.`);
		}
	}
	const config = {} as Record<CapCut81ConfigKey, unknown>;
	for (const key of CAPCUT_8_1_CONFIG_KEYS) {
		const value = Object.hasOwn(source, key)
			? source[key]
			: CAPCUT_8_1_CONFIG_DEFAULTS[key];
		config[key] = cloneValue({ value });
	}
	return config;
}

function createCapCut81Keyframes({
	source,
}: {
	source: Record<string, unknown[]>;
}): Record<CapCut81KeyframeBucketKey, unknown[]> {
	for (const [key, value] of Object.entries(source)) {
		if (!Array.isArray(value)) {
			throw new Error(`Source keyframe bucket ${key} must be an array.`);
		}
		if (!(KEYFRAME_BUCKET_KEY_SET.has(key) || value.length === 0)) {
			throw new Error(`Unsupported non-empty keyframe bucket: ${key}.`);
		}
	}
	const keyframes = {} as Record<CapCut81KeyframeBucketKey, unknown[]>;
	for (const key of CAPCUT_8_1_KEYFRAME_BUCKET_KEYS) {
		keyframes[key] = cloneValue({ value: source[key] ?? [] });
	}
	return keyframes;
}

function copyModernMaterialBuckets({
	source,
}: {
	source: JianyingDraftContent["materials"];
}): CapCut81DraftMaterials {
	const materials = createEmptyCapCut81Materials() as CapCut81DraftMaterials;
	const materialBuckets = materials as CapCut81EmptyMaterials;
	for (const [key, value] of Object.entries(source)) {
		if (!Array.isArray(value)) {
			throw new Error(`Source material bucket ${key} must be an array.`);
		}
		if (key === "masks") {
			if (value.length > 0) {
				throw new Error(
					"Cannot compose CapCut 8.1 content with non-empty legacy masks."
				);
			}
			continue;
		}
		if (!MATERIAL_BUCKET_KEY_SET.has(key)) {
			if (value.length > 0) {
				throw new Error(`Unsupported non-empty material bucket: ${key}.`);
			}
			continue;
		}
		materialBuckets[key as CapCut81MaterialBucketKey] = cloneValue({ value });
	}
	return materials;
}

function translateVerifiedTransitions({
	materials,
}: {
	materials: CapCut81DraftMaterials;
}): void {
	materials.transitions = materials.transitions.map((material) => {
		if (!isVerifiedJianyingTransitionMaterial({ material })) {
			throw new Error(
				`Transition ${material.id} is not in the verified JianYing source subset.`
			);
		}
		return {
			...material,
			duration:
				material.duration === JIANYING_NATIVE_DISSOLVE_METADATA.defaultDuration
					? CAPCUT_NATIVE_DISSOLVE_METADATA.defaultDuration
					: material.duration,
			effect_id: CAPCUT_NATIVE_DISSOLVE_METADATA.effectId,
			is_overlap: CAPCUT_NATIVE_DISSOLVE_METADATA.isOverlap,
			name: CAPCUT_NATIVE_DISSOLVE_METADATA.name,
			resource_id: CAPCUT_NATIVE_DISSOLVE_METADATA.resourceId,
		};
	});
}

function createCapCut81Tracks({
	source,
}: {
	source: JianyingDraftTrack[];
}): CapCut81DraftTrack[] {
	let hasPrimaryVideoTrack = false;

	return source.map((track, trackIndex) => {
		const isPrimaryVideoTrack = track.type === "video" && !hasPrimaryVideoTrack;
		if (track.type === "video") hasPrimaryVideoTrack = true;

		return {
			...cloneValue({ value: track }),
			flag: track.type === "video" && !isPrimaryVideoTrack ? 2 : 0,
			segments: track.segments.map((segment) => ({
				...cloneValue({ value: segment }),
				render_index: track.type === "audio" ? 0 : segment.render_index,
				source_timerange:
					track.type === "text"
						? null
						: cloneValue({ value: segment.source_timerange }),
				track_render_index: trackIndex,
			})),
		};
	});
}

function parseAssetRelativePath({ asset }: { asset: JianyingDraftAssetCopy }): {
	fileName: string;
	mediaFolder: JianyingDraftAssetCopy["type"];
} {
	const match = ASSET_RELATIVE_PATH_PATTERN.exec(asset.relativePath);
	if (!match) {
		throw new Error(
			`Asset ${asset.materialId} has an invalid relative path: ${asset.relativePath}.`
		);
	}
	const [, mediaFolder, fileName] = match;
	if (!(mediaFolder && fileName) || mediaFolder !== asset.type) {
		throw new Error(
			`Asset ${asset.materialId} relative path does not match its media type.`
		);
	}
	return {
		fileName,
		mediaFolder,
	};
}

function indexAssetsByMaterialId({
	assets,
}: {
	assets: readonly JianyingDraftAssetCopy[];
}): Map<string, JianyingDraftAssetCopy> {
	const assetsByMaterialId = new Map<string, JianyingDraftAssetCopy>();
	for (const asset of assets) {
		if (assetsByMaterialId.has(asset.materialId)) {
			throw new Error(`Duplicate asset material id: ${asset.materialId}.`);
		}
		parseAssetRelativePath({ asset });
		assetsByMaterialId.set(asset.materialId, asset);
	}
	return assetsByMaterialId;
}

function claimAsset({
	allowedTypes,
	assetsByMaterialId,
	materialId,
	referencedMaterialIds,
}: {
	allowedTypes: readonly JianyingDraftAssetCopy["type"][];
	assetsByMaterialId: Map<string, JianyingDraftAssetCopy>;
	materialId: string;
	referencedMaterialIds: Set<string>;
}): JianyingDraftAssetCopy {
	const asset = assetsByMaterialId.get(materialId);
	if (!asset) {
		throw new Error(`Material ${materialId} has no matching asset.`);
	}
	if (!allowedTypes.includes(asset.type)) {
		throw new Error(
			`Material ${materialId} does not match asset type ${asset.type}.`
		);
	}
	if (referencedMaterialIds.has(materialId)) {
		throw new Error(`Material ${materialId} is referenced more than once.`);
	}
	referencedMaterialIds.add(materialId);
	return asset;
}

function createPlaceholderPath({
	asset,
	placeholderId,
}: {
	asset: JianyingDraftAssetCopy;
	placeholderId: string;
}): string {
	const { fileName, mediaFolder } = parseAssetRelativePath({ asset });
	return buildCapCut81PlaceholderAssetPath({
		fileName,
		mediaFolder,
		placeholderId,
	});
}

function assertPlaceholderId({
	placeholderId,
}: {
	placeholderId: string;
}): void {
	buildCapCut81PlaceholderAssetPath({
		fileName: "placeholder",
		mediaFolder: "video",
		placeholderId,
	});
}

function rewriteMaterialAssetPaths({
	assets,
	materials,
	placeholderId,
}: {
	assets: readonly JianyingDraftAssetCopy[];
	materials: CapCut81DraftMaterials;
	placeholderId: string;
}): void {
	const assetsByMaterialId = indexAssetsByMaterialId({ assets });
	const referencedMaterialIds = new Set<string>();

	materials.videos = materials.videos.map((material) => {
		const asset = claimAsset({
			allowedTypes: ["image", "video"],
			assetsByMaterialId,
			materialId: material.id,
			referencedMaterialIds,
		});
		const expectedMaterialType = asset.type === "image" ? "photo" : "video";
		if (material.type !== expectedMaterialType) {
			throw new Error(
				`Material ${material.id} does not match its ${asset.type} asset.`
			);
		}
		return {
			...cloneValue({ value: material }),
			media_path: "",
			path: createPlaceholderPath({ asset, placeholderId }),
		};
	});

	materials.audios = materials.audios.map((material) => {
		const asset = claimAsset({
			allowedTypes: ["audio"],
			assetsByMaterialId,
			materialId: material.id,
			referencedMaterialIds,
		});
		return {
			...cloneValue({ value: material }),
			path: createPlaceholderPath({ asset, placeholderId }),
		};
	});

	for (const materialId of assetsByMaterialId.keys()) {
		if (!referencedMaterialIds.has(materialId)) {
			throw new Error(`Asset ${materialId} has no matching material.`);
		}
	}
}

function createPlatform({
	targetPlatform,
}: {
	targetPlatform: JianyingDraftTargetPlatform;
}): CapCut81Platform {
	return {
		os: targetPlatform === "macos" ? "mac" : "windows",
		os_version: "",
		app_id: CAPCUT_8_1_APP_ID,
		app_version: CAPCUT_8_1_APP_VERSION,
		app_source: CAPCUT_8_1_APP_SOURCE,
		device_id: "",
		hard_disk_id: "",
		mac_address: "",
	};
}

function createFunctionAssistantInfo(): Record<string, unknown> {
	return {
		smart_rec_applied: false,
		fixed_rec_applied: false,
		auto_adjust: false,
		auto_adjust_segid_list: [],
		color_correction: false,
		color_correction_segid_list: [],
		enhance_quality: false,
		smooth_slow_motion: false,
		deflicker_segid_list: [],
		video_noise_segid_list: [],
		enhance_quality_segid_list: [],
		smart_segid_list: [],
		retouch: false,
		retouch_segid_list: [],
		enhande_voice: false,
		enhance_voice_segid_list: [],
		audio_noise_segid_list: [],
		auto_caption: false,
		auto_caption_segid_list: [],
		auto_caption_template_id: "",
		caption_opt: false,
		caption_opt_segid_list: [],
		eye_correction: false,
		eye_correction_segid_list: [],
		normalize_loudness: false,
		normalize_loudness_segid_list: [],
		normalize_loudness_audio_denoise_segid_list: [],
		auto_adjust_fixed: false,
		auto_adjust_fixed_value: 50,
		color_correction_fixed: false,
		color_correction_fixed_value: 50,
		normalize_loudness_fixed: false,
		enhande_voice_fixed: false,
		retouch_fixed: false,
		enhance_quality_fixed: false,
		smooth_slow_motion_fixed: false,
		fps: {
			num: 0,
			den: 1,
		},
	};
}

export function validateCapCut81Content({
	content,
}: {
	content: CapCut81DraftContent;
}): void {
	assertExactKeyOrder({
		actual: Object.keys(content),
		expected: CAPCUT_8_1_TOP_LEVEL_KEYS,
		label: "Content keys",
	});
	assertExactKeyOrder({
		actual: Object.keys(content.config),
		expected: CAPCUT_8_1_CONFIG_KEYS,
		label: "Config keys",
	});
	assertExactKeyOrder({
		actual: Object.keys(content.canvas_config),
		expected: CAPCUT_8_1_CANVAS_CONFIG_KEYS,
		label: "Canvas config keys",
	});
	assertExactKeyOrder({
		actual: Object.keys(content.keyframes),
		expected: CAPCUT_8_1_KEYFRAME_BUCKET_KEYS,
		label: "Keyframe buckets",
	});
	assertExactKeyOrder({
		actual: Object.keys(content.materials),
		expected: CAPCUT_8_1_MATERIAL_BUCKET_KEYS,
		label: "Material buckets",
	});
	buildCapCut81ActiveContentMirrorPaths({ timelineId: content.id });

	if (
		content.version !== CAPCUT_8_1_SCHEMA_VERSION ||
		content.new_version !== CAPCUT_8_1_NEW_VERSION ||
		!content.render_index_track_mode_on
	) {
		throw new Error(
			"Content version markers do not match the CapCut 8.1 profile."
		);
	}

	for (const platform of [content.platform, content.last_modified_platform]) {
		if (
			platform.app_id !== CAPCUT_8_1_APP_ID ||
			platform.app_source !== CAPCUT_8_1_APP_SOURCE ||
			platform.app_version !== CAPCUT_8_1_APP_VERSION
		) {
			throw new Error("Platform markers do not match the CapCut 8.1 profile.");
		}
		if (
			platform.device_id ||
			platform.hard_disk_id ||
			platform.mac_address ||
			platform.os_version
		) {
			throw new Error("Platform identity fields must be empty.");
		}
	}

	if (content.platform.os !== content.last_modified_platform.os) {
		throw new Error("Platform targets must match.");
	}
	let hasPrimaryVideoTrack = false;
	for (let trackIndex = 0; trackIndex < content.tracks.length; trackIndex++) {
		const track = content.tracks[trackIndex];
		const isPrimaryVideoTrack = track.type === "video" && !hasPrimaryVideoTrack;
		if (track.type === "video") hasPrimaryVideoTrack = true;
		const expectedFlag = track.type === "video" && !isPrimaryVideoTrack ? 2 : 0;
		if (track.flag !== expectedFlag) {
			throw new Error(`Track ${track.id} does not use the CapCut 8.1 flag.`);
		}
		for (const segment of track.segments) {
			if (segment.track_render_index !== trackIndex) {
				throw new Error(
					`Segment ${segment.id} does not use its CapCut 8.1 track render index.`
				);
			}
			if (
				(track.type === "text" || track.type === "adjust") &&
				segment.source_timerange !== null
			) {
				throw new Error(
					`${track.type} segment ${segment.id} must use a null source timerange.`
				);
			}
			if (track.type === "audio" && segment.render_index !== 0) {
				throw new Error(
					`Audio segment ${segment.id} must use render index zero.`
				);
			}
		}
	}
	for (const transition of content.materials.transitions) {
		if (!isVerifiedCapCut81TransitionMaterial({ material: transition })) {
			throw new Error(
				`Transition ${transition.id} does not match the CapCut 8.1 native subset.`
			);
		}
	}

	const placeholderIds = new Set<string>();
	for (const material of content.materials.videos) {
		const parsedPath = parseCapCut81PlaceholderAssetPath({
			path: material.path,
		});
		const expectedMediaFolder = material.type === "photo" ? "image" : "video";
		if (!parsedPath || parsedPath.mediaFolder !== expectedMediaFolder) {
			throw new Error(
				`Material ${material.id} does not use a placeholder path.`
			);
		}
		placeholderIds.add(parsedPath.placeholderId);
	}
	for (const material of content.materials.audios) {
		const parsedPath = parseCapCut81PlaceholderAssetPath({
			path: material.path,
		});
		if (!parsedPath || parsedPath.mediaFolder !== "audio") {
			throw new Error(
				`Material ${material.id} does not use a placeholder path.`
			);
		}
		placeholderIds.add(parsedPath.placeholderId);
	}
	validateCapCut81MaskReferences({ content });
	validateCapCut81CustomLuts({ content, placeholderIds });
	if (placeholderIds.size > 1) {
		throw new Error("Material paths use multiple placeholder namespaces.");
	}
}

export function composeCapCut81Content({
	assets,
	content,
	placeholderId,
	targetPlatform,
	timelineId,
}: {
	assets: readonly JianyingDraftAssetCopy[];
	content: JianyingDraftContent;
	placeholderId: string;
	targetPlatform: JianyingDraftTargetPlatform;
	timelineId: string;
}): CapCut81DraftContent {
	assertKnownTopLevelKeys({ content });
	buildCapCut81ActiveContentMirrorPaths({ timelineId });
	assertPlaceholderId({ placeholderId });
	const config = createCapCut81Config({ source: content.config });
	const keyframes = createCapCut81Keyframes({ source: content.keyframes });
	const materials = copyModernMaterialBuckets({ source: content.materials });
	translateVerifiedTransitions({ materials });
	rewriteMaterialAssetPaths({ assets, materials, placeholderId });
	const platform = createPlatform({ targetPlatform });

	const modernContent: CapCut81DraftContent = {
		id: timelineId,
		version: CAPCUT_8_1_SCHEMA_VERSION,
		new_version: CAPCUT_8_1_NEW_VERSION,
		name: content.name,
		duration: content.duration,
		create_time: content.create_time,
		update_time: content.update_time,
		fps: content.fps,
		is_drop_frame_timecode: false,
		color_space: -1,
		config,
		canvas_config: {
			ratio: content.canvas_config.ratio,
			width: content.canvas_config.width,
			height: content.canvas_config.height,
			background: null,
		},
		tracks: createCapCut81Tracks({ source: content.tracks }),
		group_container: cloneValue({ value: content.group_container }),
		materials,
		keyframes,
		keyframe_graph_list: cloneValue({ value: content.keyframe_graph_list }),
		platform,
		last_modified_platform: { ...platform },
		mutable_config: cloneValue({ value: content.mutable_config }),
		cover: cloneValue({ value: content.cover }),
		retouch_cover: cloneValue({ value: content.retouch_cover }),
		extra_info: cloneValue({ value: content.extra_info }),
		relationships: cloneValue({ value: content.relationships }),
		render_index_track_mode_on: true,
		free_render_index_mode_on: false,
		static_cover_image_path: "",
		source: content.source,
		time_marks: cloneValue({ value: content.time_marks }),
		path: "",
		lyrics_effects: [],
		uneven_animation_template_info: {
			composition: "",
			content: "",
			order: "",
			sub_template_info_list: [],
		},
		draft_type: "video",
		smart_ads_info: {
			page_from: "",
			routine: "",
			draft_url: "",
		},
		function_assistant_info: createFunctionAssistantInfo(),
	};
	validateCapCut81Content({ content: modernContent });
	return modernContent;
}

export function composeCapCut81BuildResultContent({
	buildResult,
	placeholderId,
	targetPlatform,
	timelineId,
}: {
	buildResult: JianyingDraftBuildResult;
	placeholderId: string;
	targetPlatform: JianyingDraftTargetPlatform;
	timelineId: string;
}): CapCut81DraftContent {
	if (!buildResult.canWrite) {
		throw new Error(
			"Cannot compose a CapCut 8.1 draft from a blocked build result."
		);
	}
	return composeCapCut81Content({
		assets: buildResult.assets,
		content: buildResult.content,
		placeholderId,
		targetPlatform,
		timelineId,
	});
}
