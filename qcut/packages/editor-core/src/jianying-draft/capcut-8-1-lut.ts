import type { MediaElement } from "../types/timeline.js";
import { buildCapCut81PlaceholderAssetPath } from "./capcut-8-1-profile.js";
import { serializeColorCubeLut } from "./color-cube-lut.js";
import { createDeterministicJianyingId } from "./deterministic-id.js";
import { secondsToMicroseconds } from "./time.js";

export const CAPCUT_8_1_DEFAULT_ADJUST_BUNDLE_PATH_PLACEHOLDER =
	"##_capcut_default_adjust_bundle_##" as const;

export interface CapCut81CustomLutEffectMaterial {
	id: string;
	effect_id: "";
	resource_id: "";
	third_resource_id: "";
	name: string;
	report_name: "";
	type: "lut";
	sub_type: "none";
	path: string;
	value: number;
	visible: true;
	item_effect_type: 0;
	category_id: "";
	category_name: "";
	category_key: "";
	sub_category_id: "";
	sub_category_name: "";
	platform: "all";
	apply_target_type: 0;
	source_platform: 0;
	version: "";
	adjust_params: unknown[];
	time_range: null;
	formula_id: "";
	enable_skin_tone_correction: false;
	algorithm_artifact_path: "";
	intensity_key: "";
	face_adjust_params: unknown[];
	exclusion_group: unknown[];
	panel_id: "";
	bloom_params: null;
	request_id: "";
	color_match_info: {
		target_feature_path: "";
		source_feature_path: "";
		target_image_path: "";
	};
	multi_language_current: "";
	lumi_hub_path: string;
	covering_relation_change: 0;
	beauty_face_auto_preset_id: "";
	beauty_body_auto_preset_id: "";
	beauty_face_auto_retouch_info: {
		face_id: unknown[];
		beauty_face_auto_retouch_id: "";
	};
	smart_color_mode: 0;
}

export interface CapCut81AdjustPlaceholderMaterial {
	id: string;
	name: string;
	type: "adjust";
	material_resource_id: "";
}

export interface CapCut81AdjustSegment {
	id: string;
	source_timerange: null;
	target_timerange: {
		start: number;
		duration: number;
	};
	render_timerange: {
		start: 0;
		duration: 0;
	};
	desc: "";
	state: 0;
	speed: 1;
	is_loop: false;
	is_tone_modify: false;
	reverse: false;
	intensifies_audio: false;
	cartoon: false;
	volume: 1;
	last_nonzero_volume: 1;
	clip: null;
	uniform_scale: null;
	material_id: string;
	extra_material_refs: string[];
	render_index: 0;
	keyframe_refs: unknown[];
	enable_lut: true;
	enable_adjust: true;
	enable_hsl: true;
	visible: true;
	group_id: "";
	enable_color_curves: true;
	enable_hsl_curves: true;
	track_render_index: number;
	hdr_settings: null;
	enable_color_wheels: true;
	track_attribute: 0;
	is_placeholder: false;
	template_id: "";
	enable_smart_color_adjust: false;
	template_scene: "default";
	common_keyframes: unknown[];
	caption_info: null;
	responsive_layout: {
		enable: false;
		target_follow: "";
		size_layout: 0;
		horizontal_pos_layout: 0;
		vertical_pos_layout: 0;
	};
	enable_color_match_adjust: false;
	enable_color_correct_adjust: false;
	enable_adjust_mask: true;
	raw_segment_id: "";
	lyric_keyframes: null;
	enable_video_mask: true;
	digital_human_template_group_id: "";
	color_correct_alg_result: "";
	source: "segmentsourcenormal";
	enable_mask_stroke: false;
	enable_mask_shadow: false;
}

export interface CapCut81AdjustTrack {
	id: string;
	type: "adjust";
	segments: CapCut81AdjustSegment[];
	flag: 0;
	attribute: 0;
	name: "";
	is_default_name: true;
}

export interface CapCut81GeneratedLutAsset {
	kind: "generated-lut";
	content: string;
	effectMaterialId: string;
	placeholderPath: string;
	relativePath: string;
}

export interface CapCut81CustomLutMapping {
	asset: CapCut81GeneratedLutAsset;
	configPatch: {
		adjust_max_index: number;
	};
	effect: CapCut81CustomLutEffectMaterial;
	placeholder: CapCut81AdjustPlaceholderMaterial;
	track: CapCut81AdjustTrack;
}

function createSafeLutFileName({
	effectId,
	lutName,
}: {
	effectId: string;
	lutName: string;
}): string {
	const withoutExtension = lutName.replace(/\.cube$/i, "");
	const normalized = withoutExtension
		.normalize("NFKC")
		.replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, "-")
		.replace(/\s+/g, "-")
		.replace(/^\.+|\.+$/g, "");
	const truncated = Array.from(normalized).slice(0, 48).join("");
	const stem = truncated || "qcut-lut";
	return `${stem}-${effectId}.cube`;
}

function buildCapCut81LutPlaceholderPath({
	fileName,
	placeholderId,
}: {
	fileName: string;
	placeholderId: string;
}): string {
	const validatedVideoPath = buildCapCut81PlaceholderAssetPath({
		fileName,
		mediaFolder: "video",
		placeholderId,
	});
	return validatedVideoPath.replace("/assets/video/", "/assets/lut/");
}

function assertNonNegativeSafeInteger({
	label,
	value,
}: {
	label: string;
	value: number;
}): void {
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new RangeError(`${label} must be a non-negative safe integer.`);
	}
}

function hasEntries({
	value,
}: {
	value: Record<string, unknown[] | undefined> | undefined;
}): boolean {
	return Object.values(value ?? {}).some(
		(entries) => (entries?.length ?? 0) > 0
	);
}

function assertNoUnmappedColorExtras({
	element,
}: {
	element: MediaElement;
}): void {
	const color = element.color;
	if (!color) return;

	const hasLegacyAdjustments = Object.values(element.adjustments ?? {}).some(
		(value) => value !== 0
	);
	const hasBasicAdjustments = Object.entries(color.basic).some(
		([property, value]) =>
			property !== "enabled" && typeof value === "number" && value !== 0
	);
	const hasHslAdjustments = Object.values(color.hsl.ranges).some((range) =>
		Object.values(range).some((value) => value !== 0)
	);
	const hasGradeMask =
		color.mask.enabled || color.mask.invert || color.mask.maskIds.length > 0;
	const hasNonLutKeyframes = Object.entries(color.keyframes ?? {}).some(
		([property, keyframes]) =>
			!property.startsWith("lut.") && (keyframes?.length ?? 0) > 0
	);
	const hasUnsupportedColorModule =
		color.curves.enabled ||
		color.secondaryCurves.enabled ||
		color.wheels.enabled ||
		color.smart.enabled ||
		color.management.enabled;
	if (
		hasLegacyAdjustments ||
		hasBasicAdjustments ||
		hasHslAdjustments ||
		hasGradeMask ||
		hasNonLutKeyframes ||
		hasEntries({ value: color.curveShapeKeyframes }) ||
		hasUnsupportedColorModule
	) {
		throw new Error(
			"CapCut custom LUT export cannot preserve non-LUT QCut color edits."
		);
	}

	const filter = color.filter;
	if (
		filter.presetId !== "none" &&
		(color.lut.presetId !== `filter:${filter.presetId}` ||
			filter.intensity !== color.lut.intensity)
	) {
		throw new Error(
			"CapCut custom LUT export requires filter metadata to match the resolved LUT."
		);
	}
}

function resolveLutSource({ element }: { element: MediaElement }) {
	const color = element.color;
	const cube = color?.lut.cube;
	if (!(color?.enabled && color.lut.enabled && cube)) {
		throw new Error(
			"CapCut custom LUT export requires an enabled, resolved QCut LUT cube."
		);
	}
	if (
		!Number.isFinite(color.lut.intensity) ||
		color.lut.intensity < 0 ||
		color.lut.intensity > 100
	) {
		throw new RangeError("QCut LUT intensity must be between 0 and 100.");
	}
	if (color.lut.skinProtection !== 0) {
		throw new Error(
			"CapCut custom LUT export cannot preserve QCut LUT skin protection."
		);
	}
	const lutKeyframes = [
		...(color.keyframes?.["lut.intensity"] ?? []),
		...(color.keyframes?.["lut.skinProtection"] ?? []),
	];
	if (lutKeyframes.length > 0) {
		throw new Error(
			"CapCut custom LUT export does not support QCut LUT keyframes."
		);
	}
	assertNoUnmappedColorExtras({ element });
	return { ...color.lut, cube };
}

export function mapMediaElementLutToCapCut81({
	adjustIndex,
	element,
	placeholderId,
	timelineDuration = element.duration,
	trackRenderIndex,
}: {
	adjustIndex: number;
	element: MediaElement;
	placeholderId: string;
	timelineDuration?: number;
	trackRenderIndex: number;
}): CapCut81CustomLutMapping {
	if (!Number.isSafeInteger(adjustIndex) || adjustIndex < 1) {
		throw new RangeError("adjustIndex must be a positive safe integer.");
	}
	assertNonNegativeSafeInteger({
		label: "trackRenderIndex",
		value: trackRenderIndex,
	});
	if (!Number.isFinite(timelineDuration) || timelineDuration <= 0) {
		throw new RangeError("Timeline duration must be positive and finite.");
	}

	const lut = resolveLutSource({ element });
	const effectId = createDeterministicJianyingId({
		namespace: "capcut-8-1-lut-effect",
		sourceId: element.id,
	});
	const placeholderMaterialId = createDeterministicJianyingId({
		namespace: "capcut-8-1-adjust-placeholder",
		sourceId: element.id,
	});
	const trackId = createDeterministicJianyingId({
		namespace: "capcut-8-1-adjust-track",
		sourceId: element.id,
	});
	const segmentId = createDeterministicJianyingId({
		namespace: "capcut-8-1-adjust-segment",
		sourceId: element.id,
	});
	const fileName = createSafeLutFileName({
		effectId,
		lutName: lut.name || lut.presetId,
	});
	const relativePath = `assets/lut/${fileName}`;
	const placeholderPath = buildCapCut81LutPlaceholderPath({
		fileName,
		placeholderId,
	});
	const effectPath = `${placeholderPath};${CAPCUT_8_1_DEFAULT_ADJUST_BUNDLE_PATH_PLACEHOLDER}`;
	const effect: CapCut81CustomLutEffectMaterial = {
		id: effectId,
		effect_id: "",
		resource_id: "",
		third_resource_id: "",
		name: fileName,
		report_name: "",
		type: "lut",
		sub_type: "none",
		path: effectPath,
		value: lut.intensity / 100,
		visible: true,
		item_effect_type: 0,
		category_id: "",
		category_name: "",
		category_key: "",
		sub_category_id: "",
		sub_category_name: "",
		platform: "all",
		apply_target_type: 0,
		source_platform: 0,
		version: "",
		adjust_params: [],
		time_range: null,
		formula_id: "",
		enable_skin_tone_correction: false,
		algorithm_artifact_path: "",
		intensity_key: "",
		face_adjust_params: [],
		exclusion_group: [],
		panel_id: "",
		bloom_params: null,
		request_id: "",
		color_match_info: {
			target_feature_path: "",
			source_feature_path: "",
			target_image_path: "",
		},
		multi_language_current: "",
		lumi_hub_path: `${effectPath}/lumi_hub_path`,
		covering_relation_change: 0,
		beauty_face_auto_preset_id: "",
		beauty_body_auto_preset_id: "",
		beauty_face_auto_retouch_info: {
			face_id: [],
			beauty_face_auto_retouch_id: "",
		},
		smart_color_mode: 0,
	};
	const placeholder: CapCut81AdjustPlaceholderMaterial = {
		id: placeholderMaterialId,
		name: `Adjust${adjustIndex}`,
		type: "adjust",
		material_resource_id: "",
	};
	const track: CapCut81AdjustTrack = {
		id: trackId,
		type: "adjust",
		segments: [
			{
				id: segmentId,
				source_timerange: null,
				target_timerange: {
					start: secondsToMicroseconds({ seconds: element.startTime }),
					duration: secondsToMicroseconds({ seconds: timelineDuration }),
				},
				render_timerange: {
					start: 0,
					duration: 0,
				},
				desc: "",
				state: 0,
				speed: 1,
				is_loop: false,
				is_tone_modify: false,
				reverse: false,
				intensifies_audio: false,
				cartoon: false,
				volume: 1,
				last_nonzero_volume: 1,
				clip: null,
				uniform_scale: null,
				material_id: placeholderMaterialId,
				extra_material_refs: [effectId],
				render_index: 0,
				keyframe_refs: [],
				enable_lut: true,
				enable_adjust: true,
				enable_hsl: true,
				visible: true,
				group_id: "",
				enable_color_curves: true,
				enable_hsl_curves: true,
				track_render_index: trackRenderIndex,
				hdr_settings: null,
				enable_color_wheels: true,
				track_attribute: 0,
				is_placeholder: false,
				template_id: "",
				enable_smart_color_adjust: false,
				template_scene: "default",
				common_keyframes: [],
				caption_info: null,
				responsive_layout: {
					enable: false,
					target_follow: "",
					size_layout: 0,
					horizontal_pos_layout: 0,
					vertical_pos_layout: 0,
				},
				enable_color_match_adjust: false,
				enable_color_correct_adjust: false,
				enable_adjust_mask: true,
				raw_segment_id: "",
				lyric_keyframes: null,
				enable_video_mask: true,
				digital_human_template_group_id: "",
				color_correct_alg_result: "",
				source: "segmentsourcenormal",
				enable_mask_stroke: false,
				enable_mask_shadow: false,
			},
		],
		flag: 0,
		attribute: 0,
		name: "",
		is_default_name: true,
	};

	return {
		asset: {
			kind: "generated-lut",
			content: serializeColorCubeLut({
				cube: lut.cube,
				title: `QCut ${lut.name || lut.presetId}`,
			}),
			effectMaterialId: effectId,
			placeholderPath,
			relativePath,
		},
		configPatch: {
			adjust_max_index: adjustIndex + 1,
		},
		effect,
		placeholder,
		track,
	};
}
