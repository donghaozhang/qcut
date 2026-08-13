import { describe, expect, it } from "vitest";
import {
	JIANYING_11_3_BETA4_PROFILE_ID,
	mapInteropDocumentToQCutPlan,
	normalizeRawDraft,
} from "../jianying-draft/index.js";
import {
	createJianying113CompoundSource,
	encodeJianyingCompoundContent,
} from "./support/jianying-11-3-compound-fixture.js";

const AUDIO_DURATION_US = 3_000_000;

interface AudioFixtureOptions {
	channelMappingEnabled?: boolean;
	volume?: number;
}

function createAudioMaterial({ id }: { id: string }): Record<string, unknown> {
	return {
		id,
		app_id: 0,
		check_flag: 1,
		duration: AUDIO_DURATION_US,
		is_ai_clone_tone: false,
		is_ai_clone_tone_post: false,
		is_text_edit_overdub: false,
		lyric_type: 0,
		name: "qcut-audio-3s.wav",
		path: "/private/qcut-audio-3s.wav",
		type: "extract_music",
		wave_points: [],
	};
}

function createCompanionMaterials({
	channelMappingEnabled = false,
}: {
	channelMappingEnabled?: boolean;
} = {}): Record<string, unknown[]> {
	return {
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
				is_config_open: channelMappingEnabled,
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
	};
}

function createInnerAudioDraft({
	channelMappingEnabled,
	volume = 1,
}: AudioFixtureOptions = {}): Record<string, unknown> {
	return {
		id: "inner-audio-draft",
		name: "Audio compound",
		canvas_config: { width: 1920, height: 1080 },
		duration: AUDIO_DURATION_US,
		fps: 30,
		materials: {
			...createCompanionMaterials({
				...(channelMappingEnabled === undefined
					? {}
					: { channelMappingEnabled }),
			}),
			audios: [createAudioMaterial({ id: "inner-audio" })],
		},
		tracks: [
			{ id: "empty-main-track", type: "mixed", segments: [] },
			{
				id: "inner-audio-track",
				type: "audio",
				segments: [
					{
						id: "inner-audio-segment",
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
						volume,
					},
				],
			},
		],
	};
}

function createBeta4AudioWrapper(
	options: AudioFixtureOptions = {}
): Record<string, unknown> {
	return {
		id: "outer-audio-wrapper",
		name: "",
		canvas_config: { width: 0, height: 0 },
		duration: 0,
		fps: 30,
		materials: {
			audios: [createAudioMaterial({ id: "outer-audio" })],
			drafts: [
				{
					id: "compound-material",
					draft: createInnerAudioDraft(options),
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
	};
}

function normalizeBeta4Audio(options: AudioFixtureOptions = {}) {
	const content = createBeta4AudioWrapper(options);
	const bytes = encodeJianyingCompoundContent({ content });
	return normalizeRawDraft({
		content,
		source: {
			...createJianying113CompoundSource({ bytes }),
			appVersion: "11.3.0-beta4",
			profileId: JIANYING_11_3_BETA4_PROFILE_ID,
		},
		contentFileName: "draft_content.json",
	});
}

describe("Jianying 11.3 beta4 static audio import", () => {
	it("imports the verified local WAV with default processing", () => {
		const result = normalizeBeta4Audio();
		const [mainTrack, audioTrack] = result.document.timelines[0]?.tracks ?? [];

		expect(result.document.project).toMatchObject({
			id: "inner-audio-draft",
			width: 1920,
			height: 1080,
			fps: 30,
			durationUs: AUDIO_DURATION_US,
		});
		expect(mainTrack).toMatchObject({
			id: "empty-main-track",
			kind: "video",
			isMain: true,
			capability: "exact",
			segments: [],
		});
		expect(audioTrack).toMatchObject({
			id: "inner-audio-track",
			kind: "audio",
			capability: "exact",
			segments: [
				{
					id: "inner-audio-segment",
					kind: "audio",
					resourceId: "inner-audio",
					capability: "exact",
					sourceRange: { startUs: 0, durationUs: AUDIO_DURATION_US },
					targetRange: { startUs: 0, durationUs: AUDIO_DURATION_US },
				},
			],
		});
		expect(result.document.resources).toMatchObject([
			{
				id: "inner-audio",
				kind: "audio",
				durationUs: AUDIO_DURATION_US,
				capability: "exact",
			},
		]);
		expect(result.document.issues).toEqual([]);
		expect(result.restrictedSourcePathsByResourceId).toEqual({
			"inner-audio": "/private/qcut-audio-3s.wav",
		});

		const plan = mapInteropDocumentToQCutPlan({ document: result.document });
		expect(plan.skipped).toEqual([]);
		expect(plan.resourceIds).toEqual(["inner-audio"]);
		expect(plan.tracks).toMatchObject([
			{ type: "media", isMain: true, elements: [] },
			{
				type: "audio",
				elements: [
					{
						type: "media",
						resourceId: "inner-audio",
						startTime: 0,
						duration: 3,
						trimStart: 0,
						trimEnd: 0,
					},
				],
			},
		]);
	});

	it("keeps unverified volume changes opaque", () => {
		const result = normalizeBeta4Audio({ volume: 0.5 });
		const audioSegment = result.document.timelines[0]?.tracks[1]?.segments[0];

		expect(audioSegment).toMatchObject({
			kind: "audio",
			capability: "opaque",
		});
		expect(
			result.document.issues.some(
				({ code, message, subjectId }) =>
					code === "FEATURE_OPAQUE" &&
					subjectId === "inner-audio-segment" &&
					message.includes("volume")
			)
		).toBe(true);
		expect(
			mapInteropDocumentToQCutPlan({ document: result.document }).resourceIds
		).toEqual([]);
	});

	it("keeps active channel mapping opaque", () => {
		const result = normalizeBeta4Audio({ channelMappingEnabled: true });
		const audioSegment = result.document.timelines[0]?.tracks[1]?.segments[0];

		expect(audioSegment).toMatchObject({ capability: "opaque" });
		expect(
			result.document.issues.some(({ message }) =>
				message.includes("companion processing")
			)
		).toBe(true);
	});

	it("does not unwrap an audio-shaped wrapper without nested audio", () => {
		const content = createBeta4AudioWrapper();
		const drafts = (
			content.materials as { drafts: Array<{ draft: Record<string, unknown> }> }
		).drafts;
		drafts[0].draft.tracks = [];
		const bytes = encodeJianyingCompoundContent({ content });
		const result = normalizeRawDraft({
			content,
			source: {
				...createJianying113CompoundSource({ bytes }),
				appVersion: "11.3.0-beta4",
				profileId: JIANYING_11_3_BETA4_PROFILE_ID,
			},
			contentFileName: "draft_content.json",
		});

		expect(result.document.project.id).toBe("outer-audio-wrapper");
		expect(result.document.timelines[0]?.tracks[0]?.capability).toBe("opaque");
	});
});
