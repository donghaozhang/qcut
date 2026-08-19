import {
	hasExactKeys,
	isDefaultPlaceholder,
	isDefaultSoundChannelMapping,
	isDefaultSpeed,
	isDefaultVocalSeparation,
	isEmptyArray,
	isEmptyString,
	isMissingOrEmptyArray,
	isZeroRange,
	type Beta4CompanionValidator,
} from "./beta4-default-companions.js";
import type { RawGraphSegmentNode } from "./graph-reader.js";
import { isRawRecord } from "./raw-types.js";
import type { Beta4PositionKeyframeResult } from "./beta4-position-keyframes.js";

const VERIFIED_SEGMENT_KEYS = new Set([
	"caption_info",
	"cartoon",
	"clip",
	"color_correct_alg_result",
	"common_keyframes",
	"desc",
	"digital_human_template_group_id",
	"enable_adjust",
	"enable_adjust_mask",
	"enable_color_adjust_pro",
	"enable_color_correct_adjust",
	"enable_color_curves",
	"enable_color_match_adjust",
	"enable_color_wheels",
	"enable_hsl",
	"enable_hsl_curves",
	"enable_lut",
	"enable_mask_shadow",
	"enable_mask_stroke",
	"enable_smart_color_adjust",
	"enable_video_mask",
	"extra_material_refs",
	"group_id",
	"hdr_settings",
	"id",
	"intensifies_audio",
	"is_loop",
	"is_placeholder",
	"is_tone_modify",
	"keyframe_refs",
	"last_nonzero_volume",
	"lyric_keyframes",
	"material_id",
	"raw_segment_id",
	"render_index",
	"render_timerange",
	"responsive_layout",
	"reverse",
	"segment_color_tag",
	"source",
	"source_timerange",
	"speed",
	"state",
	"target_timerange",
	"template_id",
	"template_scene",
	"track_attribute",
	"track_render_index",
	"uniform_scale",
	"visible",
	"volume",
]);
const CLIP_KEYS = new Set(["alpha", "flip", "rotation", "scale", "transform"]);
const FLIP_KEYS = new Set(["horizontal", "vertical"]);
const VECTOR_KEYS = new Set(["x", "y"]);
const HDR_KEYS = new Set(["intensity", "mode", "nits"]);
const RESPONSIVE_LAYOUT_KEYS = new Set([
	"enable",
	"horizontal_pos_layout",
	"size_layout",
	"target_follow",
	"vertical_pos_layout",
]);
const UNIFORM_SCALE_KEYS = new Set(["on", "value"]);
const RANGE_KEYS = new Set(["duration", "start"]);
const CANVAS_KEYS = new Set([
	"album_image",
	"blur",
	"color",
	"id",
	"image",
	"image_id",
	"image_name",
	"source_platform",
	"team_id",
	"type",
]);
const MATERIAL_COLOR_KEYS = new Set([
	"gradient_angle",
	"gradient_colors",
	"gradient_percents",
	"height",
	"id",
	"is_color_clip",
	"is_gradient",
	"solid_color",
	"width",
]);

/**
 * The verified static clip-transform subset (L2 relaxation). In JianYing's
 * own conventions: alpha 0..1, rotation degrees (UI-positive renders
 * counterclockwise on screen), 1-based uniform scale, transform in
 * half-canvas units.
 */
export interface Beta4ClipTransform {
	alpha: number;
	rotationDegrees: number;
	scaleX: number;
	scaleY: number;
	transformX: number;
	transformY: number;
}

/**
 * Reads a segment's clip transform when it sits inside the verified subset,
 * or null when anything is out of it (malformed shape, flips, non-uniform
 * scale, keyframe/static position mismatch). Uniform scale only: the UI's
 * 缩放 keeps scale.x === scale.y with uniform_scale mirroring the value;
 * 变形-driven non-uniform state stays opaque until separately verified.
 */
export function readBeta4ClipTransform({
	positionKeyframes,
	uniformScale,
	value,
}: {
	positionKeyframes: Beta4PositionKeyframeResult;
	uniformScale: unknown;
	value: unknown;
}): Beta4ClipTransform | null {
	if (!isRawRecord(value)) return null;
	const flip = isRawRecord(value.flip) ? value.flip : undefined;
	const scale = isRawRecord(value.scale) ? value.scale : undefined;
	const transform = isRawRecord(value.transform) ? value.transform : undefined;
	const uniform = isRawRecord(uniformScale) ? uniformScale : undefined;
	const isVerified =
		hasExactKeys({ value, keys: CLIP_KEYS }) &&
		typeof value.alpha === "number" &&
		Number.isFinite(value.alpha) &&
		value.alpha > 0 &&
		value.alpha <= 1 &&
		typeof value.rotation === "number" &&
		Number.isFinite(value.rotation) &&
		flip !== undefined &&
		hasExactKeys({ value: flip, keys: FLIP_KEYS }) &&
		flip.horizontal === false &&
		flip.vertical === false &&
		scale !== undefined &&
		hasExactKeys({ value: scale, keys: VECTOR_KEYS }) &&
		typeof scale.x === "number" &&
		Number.isFinite(scale.x) &&
		scale.x > 0 &&
		scale.y === scale.x &&
		uniform !== undefined &&
		hasExactKeys({ value: uniform, keys: UNIFORM_SCALE_KEYS }) &&
		uniform.on === true &&
		uniform.value === scale.x &&
		transform !== undefined &&
		hasExactKeys({ value: transform, keys: VECTOR_KEYS }) &&
		typeof transform.x === "number" &&
		Number.isFinite(transform.x) &&
		typeof transform.y === "number" &&
		Number.isFinite(transform.y) &&
		// A mapped keyframe channel owns the position: the static transform
		// must agree with the channel's final values (the app keeps them in
		// sync). Without keyframes any static position is fine.
		(positionKeyframes.kind !== "mapped" ||
			(transform.x === positionKeyframes.finalNormalizedX &&
				transform.y === positionKeyframes.finalNormalizedY));
	if (!isVerified) return null;
	return {
		alpha: value.alpha as number,
		rotationDegrees: value.rotation as number,
		scaleX: (scale as { x: number }).x,
		scaleY: (scale as { x: number }).x,
		transformX: (transform as { x: number }).x,
		transformY: (transform as { y: number }).y,
	};
}

function isDefaultCanvas({
	value,
}: {
	value: Record<string, unknown>;
}): boolean {
	return (
		hasExactKeys({ value, keys: CANVAS_KEYS }) &&
		typeof value.id === "string" &&
		value.id.length > 0 &&
		value.type === "canvas_color" &&
		isEmptyString({ value: value.album_image }) &&
		value.blur === 0 &&
		isEmptyString({ value: value.color }) &&
		isEmptyString({ value: value.image }) &&
		isEmptyString({ value: value.image_id }) &&
		isEmptyString({ value: value.image_name }) &&
		value.source_platform === 0 &&
		isEmptyString({ value: value.team_id })
	);
}

function isDefaultMaterialColor({
	value,
}: {
	value: Record<string, unknown>;
}): boolean {
	return (
		hasExactKeys({ value, keys: MATERIAL_COLOR_KEYS }) &&
		typeof value.id === "string" &&
		value.id.length > 0 &&
		value.gradient_angle === 90 &&
		isEmptyArray({ value: value.gradient_colors }) &&
		isEmptyArray({ value: value.gradient_percents }) &&
		value.height === 0 &&
		value.is_color_clip === false &&
		value.is_gradient === false &&
		isEmptyString({ value: value.solid_color }) &&
		value.width === 0
	);
}

function hasExactRangeShape({ value }: { value: unknown }): boolean {
	return isRawRecord(value) && hasExactKeys({ value, keys: RANGE_KEYS });
}

export const BETA4_VIDEO_COMPANION_VALIDATORS: Readonly<
	Record<string, Beta4CompanionValidator>
> = {
	canvases: isDefaultCanvas,
	material_colors: isDefaultMaterialColor,
	placeholder_infos: isDefaultPlaceholder,
	sound_channel_mappings: isDefaultSoundChannelMapping,
	speeds: isDefaultSpeed,
	vocal_separations: isDefaultVocalSeparation,
};

export function hasVerifiedBeta4VideoSegmentDefaults({
	positionKeyframes,
	segment,
	trackIndex,
}: {
	positionKeyframes: Beta4PositionKeyframeResult;
	segment: RawGraphSegmentNode;
	trackIndex: number;
}): boolean {
	const raw = segment.raw;
	const hdr = isRawRecord(raw.hdr_settings) ? raw.hdr_settings : undefined;
	const responsive = isRawRecord(raw.responsive_layout)
		? raw.responsive_layout
		: undefined;
	return (
		hasExactKeys({ value: raw, keys: VERIFIED_SEGMENT_KEYS }) &&
		raw.caption_info === null &&
		raw.cartoon === false &&
		readBeta4ClipTransform({
			positionKeyframes,
			uniformScale: raw.uniform_scale,
			value: raw.clip,
		}) !== null &&
		isEmptyString({ value: raw.color_correct_alg_result }) &&
		(positionKeyframes.kind === "mapped" ||
			isMissingOrEmptyArray({ value: raw.common_keyframes })) &&
		isEmptyString({ value: raw.desc }) &&
		isEmptyString({ value: raw.digital_human_template_group_id }) &&
		raw.enable_adjust === true &&
		raw.enable_adjust_mask === false &&
		raw.enable_color_adjust_pro === false &&
		raw.enable_color_correct_adjust === false &&
		raw.enable_color_curves === true &&
		raw.enable_color_match_adjust === false &&
		raw.enable_color_wheels === true &&
		raw.enable_hsl === false &&
		raw.enable_hsl_curves === true &&
		raw.enable_lut === true &&
		raw.enable_mask_shadow === false &&
		raw.enable_mask_stroke === false &&
		raw.enable_smart_color_adjust === false &&
		raw.enable_video_mask === true &&
		isEmptyString({ value: raw.group_id }) &&
		hdr !== undefined &&
		hasExactKeys({ value: hdr, keys: HDR_KEYS }) &&
		hdr.intensity === 1 &&
		hdr.mode === 1 &&
		hdr.nits === 1000 &&
		raw.intensifies_audio === false &&
		raw.is_loop === false &&
		raw.is_placeholder === false &&
		raw.is_tone_modify === false &&
		isMissingOrEmptyArray({ value: raw.keyframe_refs }) &&
		raw.last_nonzero_volume === 1 &&
		(raw.lyric_keyframes === null ||
			isEmptyArray({ value: raw.lyric_keyframes })) &&
		isEmptyString({ value: raw.raw_segment_id }) &&
		raw.render_index === trackIndex &&
		isZeroRange({ value: raw.render_timerange }) &&
		responsive !== undefined &&
		hasExactKeys({ value: responsive, keys: RESPONSIVE_LAYOUT_KEYS }) &&
		responsive.enable === false &&
		responsive.horizontal_pos_layout === 0 &&
		responsive.size_layout === 0 &&
		isEmptyString({ value: responsive.target_follow }) &&
		responsive.vertical_pos_layout === 0 &&
		raw.reverse === false &&
		isEmptyString({ value: raw.segment_color_tag }) &&
		raw.source === "segmentsourcenormal" &&
		raw.speed === 1 &&
		raw.state === 0 &&
		hasExactRangeShape({ value: raw.source_timerange }) &&
		hasExactRangeShape({ value: raw.target_timerange }) &&
		isEmptyString({ value: raw.template_id }) &&
		raw.template_scene === "default" &&
		raw.track_attribute === 0 &&
		raw.track_render_index === trackIndex &&
		raw.visible === true &&
		raw.volume === 1
	);
}
