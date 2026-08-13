import { createHash } from "node:crypto";
import type { DraftSourceDescriptor } from "../../draft-interop/document.js";
import {
	JIANYING_11_3_BETA4_APP_VERSION,
	JIANYING_11_3_BETA4_PROFILE_ID,
	JIANYING_11_3_BETA4_TOP_LEVEL_KEYS,
} from "../../jianying-draft/index.js";

export const BETA4_VIDEO_DURATION_US = 3_000_000;
export const BETA4_ADJACENT_DURATION_US = BETA4_VIDEO_DURATION_US * 2;

function createVideoAlgorithm(): Record<string, unknown> {
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

function createVideoMaterial({
	hasAudio,
	id,
	localMaterialId,
	name,
	path,
}: {
	hasAudio: boolean;
	id: string;
	localMaterialId: string;
	name: string;
	path: string;
}): Record<string, unknown> {
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
		duration: BETA4_VIDEO_DURATION_US,
		extra_type_option: 0,
		formula_id: "",
		freeze: null,
		has_audio: hasAudio,
		has_sound_separated: false,
		height: 360,
		id,
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
		local_material_id: localMaterialId,
		material_id: "",
		material_name: name,
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
		path,
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
		width: 640,
		workflow_node_id: "",
	};
}

function createCompanions({
	prefix,
}: {
	prefix: string;
}): Record<string, Record<string, unknown>> {
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

function createVideoSegment({
	id,
	materialId,
	prefix,
	startUs,
}: {
	id: string;
	materialId: string;
	prefix: string;
	startUs: number;
}): Record<string, unknown> {
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
		id,
		intensifies_audio: false,
		is_loop: false,
		is_placeholder: false,
		is_tone_modify: false,
		keyframe_refs: [],
		last_nonzero_volume: 1,
		lyric_keyframes: null,
		material_id: materialId,
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
		source_timerange: { duration: BETA4_VIDEO_DURATION_US, start: 0 },
		speed: 1,
		state: 0,
		target_timerange: { duration: BETA4_VIDEO_DURATION_US, start: startUs },
		template_id: "",
		template_scene: "default",
		track_attribute: 0,
		track_render_index: 0,
		uniform_scale: { on: true, value: 1 },
		visible: true,
		volume: 1,
	};
}

function createInnerDraft({
	firstPath,
	secondPath,
}: {
	firstPath: string;
	secondPath: string;
}): Record<string, unknown> {
	const first = createCompanions({ prefix: "first" });
	const second = createCompanions({ prefix: "second" });
	return {
		canvas_config: {
			background: null,
			height: 360,
			ratio: "original",
			width: 640,
		},
		duration: BETA4_ADJACENT_DURATION_US,
		fps: 30,
		id: "inner-adjacent-draft",
		materials: {
			canvases: [first.canvas, second.canvas],
			material_colors: [first.color, second.color],
			placeholder_infos: [first.placeholder, second.placeholder],
			sound_channel_mappings: [first.sound, second.sound],
			speeds: [first.speed, second.speed],
			videos: [
				createVideoMaterial({
					hasAudio: false,
					id: "first-video",
					localMaterialId: "first-local-media",
					name: "blue.mp4",
					path: firstPath,
				}),
				createVideoMaterial({
					hasAudio: false,
					id: "second-video",
					localMaterialId: "second-local-media",
					name: "red.mp4",
					path: secondPath,
				}),
			],
			vocal_separations: [first.vocal, second.vocal],
		},
		name: "Adjacent video compound",
		tracks: [
			{
				id: "inner-video-track",
				segments: [
					createVideoSegment({
						id: "first-segment",
						materialId: "first-video",
						prefix: "first",
						startUs: 0,
					}),
					createVideoSegment({
						id: "second-segment",
						materialId: "second-video",
						prefix: "second",
						startUs: BETA4_VIDEO_DURATION_US,
					}),
				],
				type: "mixed",
			},
		],
	};
}

export function createJianying113Beta4AdjacentVideoFixture({
	firstPath = "/private/blue.mp4",
	secondPath = "/private/red.mp4",
}: {
	firstPath?: string;
	secondPath?: string;
} = {}): Record<string, unknown> {
	const content: Record<string, unknown> = Object.fromEntries(
		JIANYING_11_3_BETA4_TOP_LEVEL_KEYS.map((key) => [key, null])
	);
	Object.assign(content, {
		canvas_config: { background: null, height: 0, ratio: "original", width: 0 },
		duration: 0,
		fps: 30,
		id: "outer-adjacent-wrapper",
		last_modified_platform: {
			app_id: 3704,
			app_source: "lv",
			app_version: JIANYING_11_3_BETA4_APP_VERSION,
		},
		materials: {
			drafts: [
				{
					draft: createInnerDraft({ firstPath, secondPath }),
					draft_file_path: "##_subdraft_placeholder_##/draft_content.json",
					id: "compound-material",
					type: "combination",
				},
			],
			videos: [
				{
					duration: BETA4_ADJACENT_DURATION_US,
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
						source_timerange: {
							duration: BETA4_ADJACENT_DURATION_US,
							start: 0,
						},
						target_timerange: {
							duration: BETA4_ADJACENT_DURATION_US,
							start: 0,
						},
					},
				],
				type: "mixed",
			},
		],
		version: 360_000,
	});
	return content;
}

export function createJianying113Beta4AdjacentVideoSource({
	content,
}: {
	content: Record<string, unknown>;
}): DraftSourceDescriptor {
	const bytes = new TextEncoder().encode(JSON.stringify(content));
	return {
		appVersion: JIANYING_11_3_BETA4_APP_VERSION,
		files: [
			{
				byteLength: bytes.byteLength,
				classification: "plaintext-json",
				relativePath: "draft_content.json",
				role: "content",
				sha256: createHash("sha256").update(bytes).digest("hex"),
			},
		],
		platform: "macos",
		product: "jianying",
		profileId: JIANYING_11_3_BETA4_PROFILE_ID,
	};
}

export function readInnerBeta4AdjacentDraft({
	content,
}: {
	content: Record<string, unknown>;
}): Record<string, unknown> {
	const materials = content.materials as {
		drafts: Array<{ draft: Record<string, unknown> }>;
	};
	const inner = materials.drafts[0]?.draft;
	if (inner === undefined) throw new Error("fixture has no inner draft");
	return inner;
}
