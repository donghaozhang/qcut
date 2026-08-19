// Beta4-shaped parity case drafts for the JianYing (剪映专业版) ground-truth
// harness (L1). Each case is one single-variable mutation of an otherwise
// verified-default draft, plus its untouched "off" twin — the isolation pair
// the comparator needs. The draft shape mirrors the real-app persistence
// captured in packages/editor-core/src/__tests__/support/
// jianying-11-3-beta4-video-fixture.ts (compound wrapper + inner draft).
//
// Run under bun. Outputs never leave .local/ — see README.md.

import {
	JIANYING_11_3_BETA4_APP_VERSION,
	JIANYING_11_3_BETA4_TOP_LEVEL_KEYS,
} from "@qcut/editor-core/jianying-draft";

export const PARITY_CANVAS_WIDTH = 640;
export const PARITY_CANVAS_HEIGHT = 360;
export const PARITY_FPS = 30;
export const PARITY_DURATION_US = 3_000_000;

export type ParityVariant = "on" | "off";

type Json = Record<string, unknown>;

export interface ParityCase {
	id: string;
	description: string;
	/** Mutates the inner segment (and companions) for the "on" variant. */
	mutate: ({
		segment,
		companions,
		innerDraft,
	}: {
		segment: Json;
		companions: Record<string, Json>;
		innerDraft: Json;
	}) => void;
}

export const PARITY_CASES: readonly ParityCase[] = [
	{
		id: "transform-rotation",
		description: "clip.rotation = 30 (剪映 UI 旋转 30°)",
		mutate: ({ segment }) => {
			(segment.clip as Json).rotation = 30;
		},
	},
	{
		id: "transform-scale",
		description: "clip.scale = 0.5 (剪映 UI 缩放 50%)",
		mutate: ({ segment }) => {
			(segment.clip as Json).scale = { x: 0.5, y: 0.5 };
			segment.uniform_scale = { on: true, value: 0.5 };
		},
	},
	{
		id: "transform-alpha",
		description: "clip.alpha = 0.5 (剪映 UI 不透明度 50%)",
		mutate: ({ segment }) => {
			(segment.clip as Json).alpha = 0.5;
		},
	},
	{
		id: "transform-position",
		description:
			"clip.transform.x = 0.25 (向右平移 1/4 画布,遵循 UI X=50→x/width 的归一化)",
		mutate: ({ segment }) => {
			const clip = segment.clip as Json;
			clip.transform = { x: 0.25, y: 0 };
		},
	},
	{
		id: "speed-scalar",
		description: "speed = 2.0 (source 3s → target 1.5s,常速倍率)",
		mutate: ({ segment, companions, innerDraft }) => {
			segment.speed = 2;
			companions.speed.speed = 2;
			(segment.source_timerange as Json).duration = PARITY_DURATION_US;
			(segment.target_timerange as Json).duration = PARITY_DURATION_US / 2;
			innerDraft.duration = PARITY_DURATION_US / 2;
		},
	},
	{
		id: "keyframe-position-x",
		description: "位置 X 关键帧 0→0.25(0s→2s 线性,真机双通道形状,Y 全零)",
		mutate: ({ segment }) => {
			applyLinearPositionKeyframes({
				segment,
				endX: 0.25,
				endY: 0,
			});
		},
	},
	{
		id: "keyframe-position-xy",
		description: "位置双轴关键帧 X 0→0.25 / Y 0→-0.2(0s→2s 线性)",
		mutate: ({ segment }) => {
			applyLinearPositionKeyframes({
				segment,
				endX: 0.25,
				endY: -0.2,
			});
		},
	},
];

const KEYFRAME_END_US = 2_000_000;

function createLinearChannel({
	endValue,
	prefix,
	propertyType,
}: {
	endValue: number;
	prefix: string;
	propertyType: "KFTypePositionX" | "KFTypePositionY";
}): Json {
	const keyframe = ({
		id,
		timeOffsetUs,
		value,
	}: {
		id: string;
		timeOffsetUs: number;
		value: number;
	}) => ({
		curveType: "Line",
		graphID: "",
		id,
		left_control: { x: 0, y: 0 },
		right_control: { x: 0, y: 0 },
		string_value: "",
		time_offset: timeOffsetUs,
		values: [value],
	});
	return {
		id: `${prefix}-group`,
		keyframe_list: [
			keyframe({ id: `${prefix}-start`, timeOffsetUs: 0, value: 0 }),
			keyframe({
				id: `${prefix}-end`,
				timeOffsetUs: KEYFRAME_END_US,
				value: endValue,
			}),
		],
		material_id: "",
		property_type: propertyType,
	};
}

/**
 * Reproduces the real two-channel persisted shape: paired X/Y groups with
 * Line curves, and the static clip transform resting on the final values.
 */
function applyLinearPositionKeyframes({
	segment,
	endX,
	endY,
}: {
	segment: Json;
	endX: number;
	endY: number;
}): void {
	(segment.clip as Json).transform = { x: endX, y: endY };
	segment.common_keyframes = [
		createLinearChannel({
			endValue: endX,
			prefix: "kf-x",
			propertyType: "KFTypePositionX",
		}),
		createLinearChannel({
			endValue: endY,
			prefix: "kf-y",
			propertyType: "KFTypePositionY",
		}),
	];
}

export function getParityCase({ caseId }: { caseId: string }): ParityCase {
	const found = PARITY_CASES.find(({ id }) => id === caseId);
	if (!found) {
		const known = PARITY_CASES.map(({ id }) => id).join(", ");
		throw new Error(`Unknown parity case "${caseId}". Known: ${known}`);
	}
	return found;
}

function createVideoAlgorithm(): Json {
	return {
		ai_background_configs: [],
		ai_expression_driven: null,
		ai_in_painting_config: [],
		ai_motion_driven: null,
		aigc_generate: null,
		aigc_generate_list: [],
		algorithms: [],
		complement_frame_config: null,
		deflicker: null,
		gameplay_configs: [],
		image_interpretation: null,
		motion_blur_config: null,
		mouth_shape_driver: null,
		noise_reduction: null,
		path: "",
		quality_enhance: null,
		skip_algorithm_index: [],
		smart_complement_frame: null,
		story_video_modify_video_config: {
			generate_card_id: "",
			generate_id: "",
			is_overwrite_last_video: false,
			task_id: "",
			tracker_task_id: "",
		},
		super_resolution: null,
		time_range: null,
	};
}

function createVideoMaterial({ assetPath }: { assetPath: string }): Json {
	return {
		aigc_history_id: "",
		aigc_item_id: "",
		aigc_type: "none",
		audio_fade: null,
		beauty_body_auto_preset: null,
		beauty_body_preset_id: "",
		beauty_face_auto_preset: {
			name: "",
			preset_id: "",
			rate_map: "",
			scene: "",
		},
		beauty_face_auto_preset_infos: [],
		beauty_face_preset_infos: [],
		cartoon_path: "",
		category_id: "",
		category_name: "local",
		check_flag: 62_978_047,
		content_feature_info: null,
		corner_pin: null,
		crop: {
			lower_left_x: 0,
			lower_left_y: 1,
			lower_right_x: 1,
			lower_right_y: 1,
			upper_left_x: 0,
			upper_left_y: 0,
			upper_right_x: 1,
			upper_right_y: 0,
		},
		crop_ratio: "free",
		crop_scale: 1,
		duration: PARITY_DURATION_US,
		extra_type_option: 0,
		formula_id: "",
		freeze: null,
		has_audio: false,
		has_sound_separated: false,
		height: PARITY_CANVAS_HEIGHT,
		id: "parity-video",
		intensifies_audio_path: "",
		intensifies_path: "",
		is_ai_generate_content: false,
		is_copyright: false,
		is_set_beauty_mode: false,
		is_text_edit_overdub: false,
		is_unified_beauty_mode: false,
		live_photo_cover_path: "",
		live_photo_timestamp: -1,
		local_id: "",
		local_material_from: "",
		local_material_id: "parity-local-media",
		material_id: "",
		material_name: "parity-plate.mp4",
		material_url: "",
		matting: {
			cloud_product_fps: 0,
			custom_matting_id: "",
			enable_matting_stroke: false,
			expansion: 0,
			feather: 0,
			flag: 0,
			has_use_quick_brush: false,
			has_use_quick_eraser: false,
			interactiveTime: [],
			is_clould: false,
			mask_video_path: "",
			path: "",
			reverse: false,
			strokes: [],
		},
		media_path: "",
		multi_camera_info: null,
		object_locked: null,
		origin_material_id: "",
		path: assetPath,
		picture_from: "none",
		picture_set_category_id: "",
		picture_set_category_name: "",
		pre_applied_vip_materials: [],
		request_id: "",
		reverse_intensifies_path: "",
		reverse_path: "",
		smart_match_info: null,
		smart_motion: null,
		source: 0,
		source_platform: 0,
		stable: {
			matrix_path: "",
			stable_level: 0,
			time_range: { duration: 0, start: 0 },
		},
		surface_trackings: [],
		team_id: "",
		type: "video",
		unique_id: "",
		video_algorithm: createVideoAlgorithm(),
		video_mask_shadow: {
			alpha: 0,
			angle: 0,
			blur: 0,
			color: "",
			distance: 0,
			path: "",
			resource_id: "",
		},
		video_mask_stroke: {
			alpha: 0,
			color: "",
			distance: 0,
			horizontal_shift: 0,
			path: "",
			resource_id: "",
			size: 0,
			texture: 0,
			type: "",
			vertical_shift: 0,
		},
		width: PARITY_CANVAS_WIDTH,
		workflow_node_id: "",
	};
}

function createCompanions(): Record<string, Json> {
	const prefix = "parity";
	return {
		canvas: {
			album_image: "",
			blur: 0,
			color: "",
			id: `${prefix}-canvas`,
			image: "",
			image_id: "",
			image_name: "",
			source_platform: 0,
			team_id: "",
			type: "canvas_color",
		},
		color: {
			gradient_angle: 90,
			gradient_colors: [],
			gradient_percents: [],
			height: 0,
			id: `${prefix}-color`,
			is_color_clip: false,
			is_gradient: false,
			solid_color: "",
			width: 0,
		},
		placeholder: {
			error_path: "",
			error_text: "",
			id: `${prefix}-placeholder`,
			meta_type: "none",
			res_path: "",
			res_text: "",
			type: "placeholder_info",
		},
		sound: {
			audio_channel_mapping: 0,
			id: `${prefix}-sound`,
			is_config_open: false,
			type: "",
		},
		speed: {
			curve_speed: null,
			id: `${prefix}-speed`,
			mode: 0,
			speed: 1,
			type: "speed",
		},
		vocal: {
			choice: 0,
			enter_from: "",
			final_algorithm: "",
			id: `${prefix}-vocal`,
			production_path: "",
			removed_sounds: [],
			time_range: null,
			type: "vocal_separation",
		},
	};
}

function createVideoSegment(): Json {
	const prefix = "parity";
	return {
		caption_info: null,
		cartoon: false,
		clip: {
			alpha: 1,
			flip: { horizontal: false, vertical: false },
			rotation: 0,
			scale: { x: 1, y: 1 },
			transform: { x: 0, y: 0 },
		},
		color_correct_alg_result: "",
		common_keyframes: [],
		desc: "",
		digital_human_template_group_id: "",
		enable_adjust: true,
		enable_adjust_mask: false,
		enable_color_adjust_pro: false,
		enable_color_correct_adjust: false,
		enable_color_curves: true,
		enable_color_match_adjust: false,
		enable_color_wheels: true,
		enable_hsl: false,
		enable_hsl_curves: true,
		enable_lut: true,
		enable_mask_shadow: false,
		enable_mask_stroke: false,
		enable_smart_color_adjust: false,
		enable_video_mask: true,
		extra_material_refs: [
			`${prefix}-speed`,
			`${prefix}-placeholder`,
			`${prefix}-canvas`,
			`${prefix}-sound`,
			`${prefix}-color`,
			`${prefix}-vocal`,
		],
		group_id: "",
		hdr_settings: { intensity: 1, mode: 1, nits: 1000 },
		id: "parity-segment",
		intensifies_audio: false,
		is_loop: false,
		is_placeholder: false,
		is_tone_modify: false,
		keyframe_refs: [],
		last_nonzero_volume: 1,
		lyric_keyframes: null,
		material_id: "parity-video",
		raw_segment_id: "",
		render_index: 0,
		render_timerange: { duration: 0, start: 0 },
		responsive_layout: {
			enable: false,
			horizontal_pos_layout: 0,
			size_layout: 0,
			target_follow: "",
			vertical_pos_layout: 0,
		},
		reverse: false,
		segment_color_tag: "",
		source: "segmentsourcenormal",
		source_timerange: { duration: PARITY_DURATION_US, start: 0 },
		speed: 1,
		state: 0,
		target_timerange: { duration: PARITY_DURATION_US, start: 0 },
		template_id: "",
		template_scene: "default",
		track_attribute: 0,
		track_render_index: 0,
		uniform_scale: { on: true, value: 1 },
		visible: true,
		volume: 1,
	};
}

/**
 * Builds one parity draft's draft_content.json object. Deterministic: the
 * same case/variant/asset always serializes to the same bytes.
 */
export function buildParityDraftContent({
	caseId,
	variant,
	assetPath,
}: {
	caseId: string;
	variant: ParityVariant;
	assetPath: string;
}): Json {
	const parityCase = getParityCase({ caseId });
	const companions = createCompanions();
	const segment = createVideoSegment();
	const innerDraft: Json = {
		canvas_config: {
			background: null,
			height: PARITY_CANVAS_HEIGHT,
			ratio: "original",
			width: PARITY_CANVAS_WIDTH,
		},
		duration: PARITY_DURATION_US,
		fps: PARITY_FPS,
		id: `parity-${caseId}-${variant}`,
		materials: {
			canvases: [companions.canvas],
			material_colors: [companions.color],
			placeholder_infos: [companions.placeholder],
			sound_channel_mappings: [companions.sound],
			speeds: [companions.speed],
			videos: [createVideoMaterial({ assetPath })],
			vocal_separations: [companions.vocal],
		},
		name: `QCUT-PARITY ${caseId} ${variant}`,
		tracks: [
			{
				id: "parity-video-track",
				segments: [segment],
				type: "mixed",
			},
		],
	};
	if (variant === "on") {
		parityCase.mutate({ segment, companions, innerDraft });
	}
	const durationUs = innerDraft.duration as number;

	const content: Json = Object.fromEntries(
		JIANYING_11_3_BETA4_TOP_LEVEL_KEYS.map((key) => [key, null])
	);
	Object.assign(content, {
		canvas_config: { background: null, height: 0, ratio: "original", width: 0 },
		duration: 0,
		fps: PARITY_FPS,
		id: `parity-${caseId}-${variant}-wrapper`,
		last_modified_platform: {
			app_id: 3704,
			app_source: "lv",
			app_version: JIANYING_11_3_BETA4_APP_VERSION,
		},
		materials: {
			drafts: [
				{
					draft: innerDraft,
					draft_file_path: "##_subdraft_placeholder_##/draft_content.json",
					id: "compound-material",
					type: "combination",
				},
			],
			videos: [
				{
					duration: durationUs,
					id: "outer-video",
					path: "",
					type: "video",
				},
			],
		},
		name: "",
		new_version: "183.0.0",
		platform: { app_id: 0, app_source: "", app_version: "" },
		tracks: [
			{
				id: "outer-track",
				segments: [
					{
						extra_material_refs: ["compound-material"],
						id: "outer-segment",
						material_id: "outer-video",
						source_timerange: { duration: durationUs, start: 0 },
						target_timerange: { duration: durationUs, start: 0 },
					},
				],
				type: "mixed",
			},
		],
		version: 360_000,
	});
	return content;
}
