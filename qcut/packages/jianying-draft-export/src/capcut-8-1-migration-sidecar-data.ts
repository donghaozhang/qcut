export interface CapCut81DraftMetadataOptions {
	createdAtMicroseconds: number;
	draftCoverPath: string;
	draftDirectoryPath: string;
	draftId: string;
	draftInfoPath: string;
	draftName: string;
	durationMicroseconds: number;
	rootPath: string;
	timelineMaterialsSize: number;
	updatedAtMicroseconds: number;
}

export interface CapCut81TimelineProjectOptions {
	createdAtMicroseconds: number;
	projectId: string;
	timelineId: string;
	updatedAtMicroseconds: number;
}

function createEmptyDraftMaterials(): Array<{
	type: number;
	value: unknown[];
}> {
	return [0, 1, 2, 3, 6, 7, 8].map((type) => ({ type, value: [] }));
}

export function createCapCut81RootDraftStoreEntry({
	createdAtMicroseconds,
	draftCoverPath,
	draftDirectoryPath,
	draftId,
	draftInfoPath,
	draftName,
	durationMicroseconds,
	rootPath,
	timelineMaterialsSize,
	updatedAtMicroseconds,
}: CapCut81DraftMetadataOptions): Record<string, unknown> {
	return {
		cloud_draft_cover: false,
		cloud_draft_sync: false,
		draft_cloud_last_action_download: false,
		draft_cloud_purchase_info: "",
		draft_cloud_template_id: "",
		draft_cloud_tutorial_info: "",
		draft_cloud_videocut_purchase_info: "",
		draft_cover: draftCoverPath,
		draft_fold_path: draftDirectoryPath,
		draft_id: draftId,
		draft_is_ai_shorts: false,
		draft_is_cloud_temp_draft: false,
		draft_is_invisible: false,
		draft_is_web_article_video: false,
		draft_json_file: draftInfoPath,
		draft_name: draftName,
		draft_new_version: "",
		draft_root_path: rootPath,
		draft_timeline_materials_size: timelineMaterialsSize,
		draft_type: "",
		draft_web_article_video_enter_from: "",
		streaming_edit_draft_ready: true,
		tm_draft_cloud_completed: "",
		tm_draft_cloud_entry_id: -1,
		tm_draft_cloud_modified: 0,
		tm_draft_cloud_parent_entry_id: -1,
		tm_draft_cloud_space_id: -1,
		tm_draft_cloud_user_id: -1,
		tm_draft_create: createdAtMicroseconds,
		tm_draft_modified: updatedAtMicroseconds,
		tm_draft_removed: 0,
		tm_duration: durationMicroseconds,
	};
}

export function createCapCut81RootMetaInfo({
	entry,
	rootPath,
}: {
	entry: Record<string, unknown>;
	rootPath: string;
}): Record<string, unknown> {
	return {
		all_draft_store: [entry],
		draft_ids: 1,
		root_path: rootPath,
	};
}

export function createCapCut81DraftMetaInfo({
	createdAtMicroseconds,
	draftDirectoryPath,
	draftId,
	draftName,
	durationMicroseconds,
	rootPath,
	timelineMaterialsSize,
	updatedAtMicroseconds,
}: CapCut81DraftMetadataOptions): Record<string, unknown> {
	return {
		cloud_draft_cover: false,
		cloud_draft_sync: false,
		cloud_package_completed_time: "",
		draft_cloud_capcut_purchase_info: "",
		draft_cloud_last_action_download: false,
		draft_cloud_package_type: "",
		draft_cloud_purchase_info: "",
		draft_cloud_template_id: "",
		draft_cloud_tutorial_info: "",
		draft_cloud_videocut_purchase_info: "",
		draft_cover: "draft_cover.jpg",
		draft_deeplink_url: "",
		draft_enterprise_info: {
			draft_enterprise_extra: "",
			draft_enterprise_id: "",
			draft_enterprise_name: "",
			enterprise_material: [],
		},
		draft_fold_path: draftDirectoryPath,
		draft_id: draftId,
		draft_is_ae_produce: false,
		draft_is_ai_packaging_used: false,
		draft_is_ai_shorts: false,
		draft_is_ai_translate: false,
		draft_is_article_video_draft: false,
		draft_is_cloud_temp_draft: false,
		draft_is_from_deeplink: "false",
		draft_is_invisible: false,
		draft_is_web_article_video: false,
		draft_materials: createEmptyDraftMaterials(),
		draft_materials_copied_info: [],
		draft_name: draftName,
		draft_need_rename_folder: false,
		draft_new_version: "",
		draft_removable_storage_device: "",
		draft_root_path: rootPath,
		draft_segment_extra_info: [],
		draft_timeline_materials_size_: timelineMaterialsSize,
		draft_type: "",
		draft_web_article_video_enter_from: "",
		tm_draft_cloud_completed: "",
		tm_draft_cloud_entry_id: -1,
		tm_draft_cloud_modified: 0,
		tm_draft_cloud_parent_entry_id: -1,
		tm_draft_cloud_space_id: -1,
		tm_draft_cloud_user_id: -1,
		tm_draft_create: createdAtMicroseconds,
		tm_draft_modified: updatedAtMicroseconds,
		tm_draft_removed: 0,
		tm_duration: durationMicroseconds,
	};
}

export function createCapCut81PcCommonAttachment(): Record<string, unknown> {
	const reportInfo = {
		caption_id_list: [],
		commercial_material: "",
		material_source: "",
		method: "",
		page_from: "",
		style: "",
		task_id: "",
		text_style: "",
		tos_id: "",
		video_category: "",
	};
	return {
		ai_packaging_infos: [],
		ai_packaging_report_info: reportInfo,
		broll: {
			ai_packaging_infos: [],
			ai_packaging_report_info: structuredClone(reportInfo),
		},
		commercial_music_category_ids: [],
		pc_feature_flag: 0,
		recognize_tasks: [],
		reference_lines_config: {
			horizontal_lines: [],
			is_lock: false,
			is_visible: false,
			vertical_lines: [],
		},
		safe_area_type: 0,
		template_item_infos: [],
		unlock_template_ids: [],
	};
}

export function createCapCut81EditingAttachment(): Record<string, unknown> {
	return {
		editing_draft: {
			ai_remove_filter_words: {
				enter_source: "",
				right_id: "",
			},
			ai_shorts_info: {
				report_params: "",
				type: 0,
			},
			crop_info_extra: {
				crop_mirror_type: 0,
				crop_rotate: 0,
				crop_rotate_total: 0,
			},
			digital_human_template_to_video_info: {
				has_upload_material: false,
				template_type: 0,
			},
			draft_used_recommend_function: "",
			edit_type: 0,
			eye_correct_enabled_multi_face_time: 0,
			has_adjusted_render_layer: false,
			image_ai_chat_info: {
				before_chat_edit: false,
				draft_modify_time: 0,
				message_id: "",
				model_name: "",
				need_restore: false,
				picture_id: "",
				prompt_from: "",
				sugs_info: [],
			},
			is_open_expand_player: false,
			is_template_text_ai_generate: false,
			is_use_adjust: false,
			is_use_ai_expand: false,
			is_use_ai_remove: false,
			is_use_audio_separation: false,
			is_use_chroma_key: false,
			is_use_curve_speed: false,
			is_use_digital_human: false,
			is_use_edit_multi_camera: false,
			is_use_lip_sync: false,
			is_use_lock_object: false,
			is_use_loudness_unify: false,
			is_use_noise_reduction: false,
			is_use_one_click_beauty: false,
			is_use_one_click_ultra_hd: false,
			is_use_retouch_face: false,
			is_use_smart_adjust_color: false,
			is_use_smart_body_beautify: false,
			is_use_smart_motion: false,
			is_use_subtitle_recognition: false,
			is_use_text_to_audio: false,
			material_edit_session: {
				material_edit_info: [],
				session_id: "",
				session_time: 0,
			},
			paste_segment_list: [],
			profile_entrance_type: "",
			publish_enter_from: "",
			publish_type: "",
			single_function_type: 0,
			text_convert_case_types: [],
			version: "1.0.0",
			video_recording_create_draft: "",
		},
	};
}

export function createCapCut81ActionSceneAttachment(): Record<string, unknown> {
	return {
		action_scene: {
			removed_segments: [],
			segment_infos: [],
		},
	};
}

export function createCapCut81GenAiAttachment(): Record<string, unknown> {
	return {
		gen_ai: {
			ai_func_config: {
				ai_common_configs: [],
				ai_effect_configs: [],
				ai_func_list: [],
				aigc_generation_configs: [],
			},
			cc_agent_info: {
				agent_stringent_used_tool_list: [],
				is_agent_stringent_used: false,
				is_agent_used: false,
				tool_list: [],
			},
			id: "",
			scene: "",
			version: "1.0.0",
		},
	};
}

export function createCapCut81PcTimelineAttachment(): Record<string, unknown> {
	return {
		reference_lines_config: {
			horizontal_lines: [],
			is_lock: false,
			is_visible: false,
			vertical_lines: [],
		},
		safe_area_type: 0,
	};
}

export function createCapCut81ScriptVideoAttachment(): Record<string, unknown> {
	return {
		script_video: {
			attachment_valid: false,
			language: "",
			overdub_recover: [],
			overdub_sentence_ids: [],
			parts: [],
			sync_subtitle: false,
			translate_segments: [],
			translate_type: "",
			version: "1.0.0",
		},
	};
}

export function createCapCut81AgencyConfig({
	canvasHeight,
}: {
	canvasHeight: number;
}): Record<string, unknown> {
	return {
		is_auto_agency_enabled: false,
		is_auto_agency_popup: false,
		is_single_agency_mode: false,
		marterials: null,
		use_converter: false,
		video_resolution: canvasHeight,
	};
}

export function createCapCut81PerformanceInfo(): Record<string, unknown> {
	return {
		manual_cancle_precombine_segs: null,
		need_auto_precombine_segs: null,
	};
}

export function createCapCut81TimelineLayout({
	timelineId,
}: {
	timelineId: string;
}): Record<string, unknown> {
	return {
		dockItems: [
			{
				dockIndex: 0,
				ratio: 1,
				timelineIds: [timelineId],
				timelineNames: ["Timeline 01"],
			},
		],
		layoutOrientation: 1,
	};
}

export function createCapCut81TimelineProject({
	createdAtMicroseconds,
	projectId,
	timelineId,
	updatedAtMicroseconds,
}: CapCut81TimelineProjectOptions): Record<string, unknown> {
	return {
		config: {
			color_space: -1,
			render_index_track_mode_on: false,
			use_float_render: false,
		},
		create_time: createdAtMicroseconds,
		id: projectId,
		main_timeline_id: timelineId,
		timelines: [
			{
				create_time: createdAtMicroseconds,
				id: timelineId,
				is_marked_delete: false,
				name: "Timeline 01",
				update_time: updatedAtMicroseconds,
			},
		],
		update_time: updatedAtMicroseconds,
		version: 0,
	};
}
