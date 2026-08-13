import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	JIANYING_11_3_BETA4_APP_VERSION,
	JIANYING_11_3_BETA4_TOP_LEVEL_KEYS,
} from "@qcut/editor-core/jianying-draft";

const AUDIO_DURATION_US = 3_000_000;

function createAudioMaterial({
	id,
	path,
}: {
	id: string;
	path: string;
}): Record<string, unknown> {
	return {
		id,
		app_id: 0,
		check_flag: 1,
		duration: AUDIO_DURATION_US,
		is_ai_clone_tone: false,
		is_ai_clone_tone_post: false,
		is_text_edit_overdub: false,
		lyric_type: 0,
		name: "tone.wav",
		path,
		type: "extract_music",
		wave_points: [],
	};
}

function createInnerDraft({ audioPath }: { audioPath: string }) {
	return {
		id: "inner-audio-draft",
		name: "Audio compound",
		canvas_config: { width: 1920, height: 1080 },
		duration: AUDIO_DURATION_US,
		fps: 30,
		materials: {
			audios: [createAudioMaterial({ id: "inner-audio", path: audioPath })],
			beats: [
				{
					id: "inner-beats",
					ai_beats: {
						beat_speed_infos: [],
						beats_path: "",
						beats_url: "",
						melody_path: "",
						melody_percents: [0],
						melody_url: "",
					},
					enable_ai_beats: false,
					gear: 404,
					gear_count: 0,
					mode: 404,
					type: "beats",
					user_beats: [],
					user_delete_ai_beats: null,
				},
			],
			placeholder_infos: [
				{
					id: "inner-placeholder",
					error_path: "",
					error_text: "",
					meta_type: "none",
					res_path: "",
					res_text: "",
					type: "placeholder_info",
				},
			],
			sound_channel_mappings: [
				{
					id: "inner-channel",
					audio_channel_mapping: 0,
					is_config_open: false,
					type: "none",
				},
			],
			speeds: [
				{
					id: "inner-speed",
					curve_speed: null,
					mode: 0,
					speed: 1,
					type: "speed",
				},
			],
			vocal_separations: [
				{
					id: "inner-vocal",
					choice: 0,
					enter_from: "",
					final_algorithm: "",
					production_path: "",
					removed_sounds: [],
					time_range: null,
					type: "vocal_separation",
				},
			],
		},
		tracks: [
			{ id: "empty-main-track", type: "mixed", segments: [] },
			{
				id: "audio-track",
				type: "audio",
				segments: [
					{
						id: "audio-segment",
						common_keyframes: [],
						extra_material_refs: [
							"inner-beats",
							"inner-placeholder",
							"inner-channel",
							"inner-speed",
							"inner-vocal",
						],
						intensifies_audio: false,
						is_loop: false,
						is_tone_modify: false,
						keyframe_refs: [],
						last_nonzero_volume: 1,
						lyric_keyframes: null,
						material_id: "inner-audio",
						render_timerange: { duration: 0, start: 0 },
						reverse: false,
						source_timerange: {
							duration: AUDIO_DURATION_US,
							start: 0,
						},
						speed: 1,
						state: 0,
						target_timerange: {
							duration: AUDIO_DURATION_US,
							start: 0,
						},
						visible: true,
						volume: 1,
					},
				],
			},
		],
	};
}

function createOuterDraft({ audioPath }: { audioPath: string }) {
	const content: Record<string, unknown> = Object.fromEntries(
		JIANYING_11_3_BETA4_TOP_LEVEL_KEYS.map((key) => [key, null])
	);
	Object.assign(content, {
		id: "outer-audio-wrapper",
		name: "",
		canvas_config: { width: 0, height: 0 },
		duration: 0,
		fps: 30,
		version: 360_000,
		new_version: "183.0.0",
		platform: { app_id: 0, app_source: "", app_version: "" },
		last_modified_platform: {
			app_id: 3704,
			app_source: "lv",
			app_version: JIANYING_11_3_BETA4_APP_VERSION,
		},
		materials: {
			audios: [createAudioMaterial({ id: "outer-audio", path: audioPath })],
			drafts: [
				{
					id: "compound-material",
					draft: createInnerDraft({ audioPath }),
					draft_file_path: "##_subdraft_placeholder_##/draft_content.json",
					type: "combination",
				},
			],
		},
		tracks: [
			{
				id: "outer-audio-track",
				type: "audio",
				segments: [
					{
						id: "outer-audio-segment",
						material_id: "outer-audio",
						extra_material_refs: ["compound-material"],
						source_timerange: {
							duration: AUDIO_DURATION_US,
							start: 0,
						},
						target_timerange: {
							duration: AUDIO_DURATION_US,
							start: 0,
						},
					},
				],
			},
		],
	});
	return content;
}

export async function writeJianying113Beta4StaticAudioFixture({
	root,
}: {
	root: string;
}): Promise<{ audioBytes: Uint8Array }> {
	const audioBytes = new TextEncoder().encode("synthetic-wave-bytes");
	const audioPath = join(root, "tone.wav");
	await writeFile(audioPath, audioBytes);
	await writeFile(
		join(root, "draft_content.json"),
		JSON.stringify(createOuterDraft({ audioPath }))
	);
	await writeFile(
		join(root, "sub_draft_config.json"),
		JSON.stringify({
			draft_json_file: "draft_content.json",
			is_from_sub_draft: true,
			rough_cut_duration: AUDIO_DURATION_US,
			type: "audio",
		})
	);
	return { audioBytes };
}
