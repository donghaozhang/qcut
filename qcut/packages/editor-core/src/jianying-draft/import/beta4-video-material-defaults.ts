import {
	hasExactKeys,
	isEmptyArray,
	isEmptyString,
	isZeroRange,
} from "./beta4-default-companions.js";
import type {
	RawGraphMaterialNode,
	RawGraphSegmentNode,
} from "./graph-reader.js";
import { isRawRecord } from "./raw-types.js";

const VERIFIED_MATERIAL_KEYS = new Set([
	"aigc_history_id",
	"aigc_item_id",
	"aigc_type",
	"audio_fade",
	"beauty_body_auto_preset",
	"beauty_body_preset_id",
	"beauty_face_auto_preset",
	"beauty_face_auto_preset_infos",
	"beauty_face_preset_infos",
	"cartoon_path",
	"category_id",
	"category_name",
	"check_flag",
	"content_feature_info",
	"corner_pin",
	"crop",
	"crop_ratio",
	"crop_scale",
	"duration",
	"extra_type_option",
	"formula_id",
	"freeze",
	"has_audio",
	"has_sound_separated",
	"height",
	"id",
	"intensifies_audio_path",
	"intensifies_path",
	"is_ai_generate_content",
	"is_copyright",
	"is_set_beauty_mode",
	"is_text_edit_overdub",
	"is_unified_beauty_mode",
	"live_photo_cover_path",
	"live_photo_timestamp",
	"local_id",
	"local_material_from",
	"local_material_id",
	"material_id",
	"material_name",
	"material_url",
	"matting",
	"media_path",
	"multi_camera_info",
	"object_locked",
	"origin_material_id",
	"path",
	"picture_from",
	"picture_set_category_id",
	"picture_set_category_name",
	"pre_applied_vip_materials",
	"request_id",
	"reverse_intensifies_path",
	"reverse_path",
	"smart_match_info",
	"smart_motion",
	"source",
	"source_platform",
	"stable",
	"surface_trackings",
	"team_id",
	"type",
	"unique_id",
	"video_algorithm",
	"video_mask_shadow",
	"video_mask_stroke",
	"width",
	"workflow_node_id",
]);
const BEAUTY_FACE_AUTO_PRESET_KEYS = new Set([
	"name",
	"preset_id",
	"rate_map",
	"scene",
]);
const CROP_KEYS = new Set([
	"lower_left_x",
	"lower_left_y",
	"lower_right_x",
	"lower_right_y",
	"upper_left_x",
	"upper_left_y",
	"upper_right_x",
	"upper_right_y",
]);
const MATTING_KEYS = new Set([
	"cloud_product_fps",
	"custom_matting_id",
	"enable_matting_stroke",
	"expansion",
	"feather",
	"flag",
	"has_use_quick_brush",
	"has_use_quick_eraser",
	"interactiveTime",
	"is_clould",
	"mask_video_path",
	"path",
	"reverse",
	"strokes",
]);
const STABLE_KEYS = new Set(["matrix_path", "stable_level", "time_range"]);
const VIDEO_ALGORITHM_KEYS = new Set([
	"ai_background_configs",
	"ai_expression_driven",
	"ai_in_painting_config",
	"ai_motion_driven",
	"aigc_generate",
	"aigc_generate_list",
	"algorithms",
	"complement_frame_config",
	"deflicker",
	"gameplay_configs",
	"image_interpretation",
	"motion_blur_config",
	"mouth_shape_driver",
	"noise_reduction",
	"path",
	"quality_enhance",
	"skip_algorithm_index",
	"smart_complement_frame",
	"story_video_modify_video_config",
	"super_resolution",
	"time_range",
]);
const STORY_VIDEO_CONFIG_KEYS = new Set([
	"generate_card_id",
	"generate_id",
	"is_overwrite_last_video",
	"task_id",
	"tracker_task_id",
]);
const VIDEO_MASK_SHADOW_KEYS = new Set([
	"alpha",
	"angle",
	"blur",
	"color",
	"distance",
	"path",
	"resource_id",
]);
const VIDEO_MASK_STROKE_KEYS = new Set([
	"alpha",
	"color",
	"distance",
	"horizontal_shift",
	"path",
	"resource_id",
	"size",
	"texture",
	"type",
	"vertical_shift",
]);
const RANGE_KEYS = new Set(["duration", "start"]);

function isPositiveInteger({ value }: { value: unknown }): boolean {
	return Number.isSafeInteger(value) && (value as number) > 0;
}

function isDefaultCrop({ value }: { value: unknown }): boolean {
	return (
		isRawRecord(value) &&
		hasExactKeys({ value, keys: CROP_KEYS }) &&
		value.lower_left_x === 0 &&
		value.lower_left_y === 1 &&
		value.lower_right_x === 1 &&
		value.lower_right_y === 1 &&
		value.upper_left_x === 0 &&
		value.upper_left_y === 0 &&
		value.upper_right_x === 1 &&
		value.upper_right_y === 0
	);
}

function isDefaultMatting({ value }: { value: unknown }): boolean {
	return (
		isRawRecord(value) &&
		hasExactKeys({ value, keys: MATTING_KEYS }) &&
		value.cloud_product_fps === 0 &&
		isEmptyString({ value: value.custom_matting_id }) &&
		value.enable_matting_stroke === false &&
		value.expansion === 0 &&
		value.feather === 0 &&
		value.flag === 0 &&
		value.has_use_quick_brush === false &&
		value.has_use_quick_eraser === false &&
		isEmptyArray({ value: value.interactiveTime }) &&
		value.is_clould === false &&
		isEmptyString({ value: value.mask_video_path }) &&
		isEmptyString({ value: value.path }) &&
		value.reverse === false &&
		isEmptyArray({ value: value.strokes })
	);
}

function isDefaultStable({ value }: { value: unknown }): boolean {
	return (
		isRawRecord(value) &&
		hasExactKeys({ value, keys: STABLE_KEYS }) &&
		isEmptyString({ value: value.matrix_path }) &&
		value.stable_level === 0 &&
		isZeroRange({ value: value.time_range })
	);
}

function isDefaultVideoAlgorithm({ value }: { value: unknown }): boolean {
	if (!isRawRecord(value)) return false;
	const story = isRawRecord(value.story_video_modify_video_config)
		? value.story_video_modify_video_config
		: undefined;
	return (
		hasExactKeys({ value, keys: VIDEO_ALGORITHM_KEYS }) &&
		isEmptyArray({ value: value.ai_background_configs }) &&
		value.ai_expression_driven === null &&
		isEmptyArray({ value: value.ai_in_painting_config }) &&
		value.ai_motion_driven === null &&
		value.aigc_generate === null &&
		isEmptyArray({ value: value.aigc_generate_list }) &&
		isEmptyArray({ value: value.algorithms }) &&
		value.complement_frame_config === null &&
		value.deflicker === null &&
		isEmptyArray({ value: value.gameplay_configs }) &&
		value.image_interpretation === null &&
		value.motion_blur_config === null &&
		value.mouth_shape_driver === null &&
		value.noise_reduction === null &&
		isEmptyString({ value: value.path }) &&
		value.quality_enhance === null &&
		isEmptyArray({ value: value.skip_algorithm_index }) &&
		value.smart_complement_frame === null &&
		story !== undefined &&
		hasExactKeys({ value: story, keys: STORY_VIDEO_CONFIG_KEYS }) &&
		isEmptyString({ value: story.generate_card_id }) &&
		isEmptyString({ value: story.generate_id }) &&
		story.is_overwrite_last_video === false &&
		isEmptyString({ value: story.task_id }) &&
		isEmptyString({ value: story.tracker_task_id }) &&
		value.super_resolution === null &&
		value.time_range === null
	);
}

function isDefaultVideoMaskShadow({ value }: { value: unknown }): boolean {
	return (
		isRawRecord(value) &&
		hasExactKeys({ value, keys: VIDEO_MASK_SHADOW_KEYS }) &&
		value.alpha === 0 &&
		value.angle === 0 &&
		value.blur === 0 &&
		isEmptyString({ value: value.color }) &&
		value.distance === 0 &&
		isEmptyString({ value: value.path }) &&
		isEmptyString({ value: value.resource_id })
	);
}

function isDefaultVideoMaskStroke({ value }: { value: unknown }): boolean {
	return (
		isRawRecord(value) &&
		hasExactKeys({ value, keys: VIDEO_MASK_STROKE_KEYS }) &&
		value.alpha === 0 &&
		isEmptyString({ value: value.color }) &&
		value.distance === 0 &&
		value.horizontal_shift === 0 &&
		isEmptyString({ value: value.path }) &&
		isEmptyString({ value: value.resource_id }) &&
		value.size === 0 &&
		value.texture === 0 &&
		isEmptyString({ value: value.type }) &&
		value.vertical_shift === 0
	);
}

function hasExactRangeShape({ value }: { value: unknown }): boolean {
	return isRawRecord(value) && hasExactKeys({ value, keys: RANGE_KEYS });
}

export function hasVerifiedBeta4VideoMaterial({
	material,
	segment,
}: {
	material: RawGraphMaterialNode;
	segment: RawGraphSegmentNode;
}): boolean {
	const raw = material.raw;
	const duration = raw.duration;
	const beautyPreset = isRawRecord(raw.beauty_face_auto_preset)
		? raw.beauty_face_auto_preset
		: undefined;
	return (
		material.bucket === "videos" &&
		hasExactKeys({ value: raw, keys: VERIFIED_MATERIAL_KEYS }) &&
		raw.type === "video" &&
		raw.category_name === "local" &&
		raw.check_flag === 62_978_047 &&
		isPositiveInteger({ value: duration }) &&
		isPositiveInteger({ value: raw.width }) &&
		isPositiveInteger({ value: raw.height }) &&
		typeof raw.has_audio === "boolean" &&
		raw.has_sound_separated === false &&
		typeof raw.path === "string" &&
		raw.path.length > 0 &&
		typeof raw.material_name === "string" &&
		raw.material_name.length > 0 &&
		typeof raw.local_material_id === "string" &&
		raw.local_material_id.length > 0 &&
		raw.aigc_type === "none" &&
		isEmptyString({ value: raw.aigc_history_id }) &&
		isEmptyString({ value: raw.aigc_item_id }) &&
		raw.audio_fade === null &&
		raw.beauty_body_auto_preset === null &&
		isEmptyString({ value: raw.beauty_body_preset_id }) &&
		beautyPreset !== undefined &&
		hasExactKeys({ value: beautyPreset, keys: BEAUTY_FACE_AUTO_PRESET_KEYS }) &&
		isEmptyString({ value: beautyPreset.name }) &&
		isEmptyString({ value: beautyPreset.preset_id }) &&
		isEmptyString({ value: beautyPreset.rate_map }) &&
		isEmptyString({ value: beautyPreset.scene }) &&
		isEmptyArray({ value: raw.beauty_face_auto_preset_infos }) &&
		isEmptyArray({ value: raw.beauty_face_preset_infos }) &&
		isEmptyString({ value: raw.cartoon_path }) &&
		isEmptyString({ value: raw.category_id }) &&
		raw.content_feature_info === null &&
		raw.corner_pin === null &&
		isDefaultCrop({ value: raw.crop }) &&
		raw.crop_ratio === "free" &&
		raw.crop_scale === 1 &&
		raw.extra_type_option === 0 &&
		isEmptyString({ value: raw.formula_id }) &&
		raw.freeze === null &&
		isEmptyString({ value: raw.intensifies_audio_path }) &&
		isEmptyString({ value: raw.intensifies_path }) &&
		raw.is_ai_generate_content === false &&
		raw.is_copyright === false &&
		raw.is_set_beauty_mode === false &&
		raw.is_text_edit_overdub === false &&
		raw.is_unified_beauty_mode === false &&
		isEmptyString({ value: raw.live_photo_cover_path }) &&
		raw.live_photo_timestamp === -1 &&
		isEmptyString({ value: raw.local_id }) &&
		isEmptyString({ value: raw.local_material_from }) &&
		isEmptyString({ value: raw.material_id }) &&
		isEmptyString({ value: raw.material_url }) &&
		isDefaultMatting({ value: raw.matting }) &&
		isEmptyString({ value: raw.media_path }) &&
		raw.multi_camera_info === null &&
		raw.object_locked === null &&
		isEmptyString({ value: raw.origin_material_id }) &&
		raw.picture_from === "none" &&
		isEmptyString({ value: raw.picture_set_category_id }) &&
		isEmptyString({ value: raw.picture_set_category_name }) &&
		isEmptyArray({ value: raw.pre_applied_vip_materials }) &&
		isEmptyString({ value: raw.request_id }) &&
		isEmptyString({ value: raw.reverse_intensifies_path }) &&
		isEmptyString({ value: raw.reverse_path }) &&
		raw.smart_match_info === null &&
		raw.smart_motion === null &&
		raw.source === 0 &&
		raw.source_platform === 0 &&
		isDefaultStable({ value: raw.stable }) &&
		isEmptyArray({ value: raw.surface_trackings }) &&
		isEmptyString({ value: raw.team_id }) &&
		isEmptyString({ value: raw.unique_id }) &&
		isDefaultVideoAlgorithm({ value: raw.video_algorithm }) &&
		isDefaultVideoMaskShadow({ value: raw.video_mask_shadow }) &&
		isDefaultVideoMaskStroke({ value: raw.video_mask_stroke }) &&
		isEmptyString({ value: raw.workflow_node_id }) &&
		hasExactRangeShape({ value: segment.raw.source_timerange }) &&
		hasExactRangeShape({ value: segment.raw.target_timerange }) &&
		segment.sourceRange?.start === 0 &&
		segment.sourceRange.duration === duration &&
		segment.targetRange !== undefined &&
		segment.targetRange.start >= 0 &&
		segment.targetRange.duration === duration
	);
}
