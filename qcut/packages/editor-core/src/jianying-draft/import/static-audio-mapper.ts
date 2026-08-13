import type { InteropCapability } from "../../draft-interop/capability.js";
import type { InteropIssueCode } from "../../draft-interop/issues.js";
import { JIANYING_11_3_BETA4_PROFILE_ID } from "../profiles/jianying-11-3-beta4.js";
import {
	hasExactKeys,
	hasVerifiedBeta4DefaultCompanions,
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
import type {
	RawDraftGraph,
	RawGraphMaterialNode,
	RawGraphSegmentNode,
} from "./graph-reader.js";
import { isRawRecord } from "./raw-types.js";

const BEATS_KEYS = new Set([
	"ai_beats",
	"enable_ai_beats",
	"gear",
	"gear_count",
	"id",
	"mode",
	"type",
	"user_beats",
	"user_delete_ai_beats",
]);
const AI_BEATS_KEYS = new Set([
	"beat_speed_infos",
	"beats_path",
	"beats_url",
	"melody_path",
	"melody_percents",
	"melody_url",
]);

export interface MapStaticAudioInput {
	profileId: string;
	material: RawGraphMaterialNode;
	segment: RawGraphSegmentNode;
	graph: RawDraftGraph;
}

export interface MappedStaticAudio {
	capability: InteropCapability;
	issueCode?: InteropIssueCode;
	reason?: string;
}

function blocked({ reason }: { reason: string }): MappedStaticAudio {
	return { capability: "blocked", issueCode: "FEATURE_OPAQUE", reason };
}

function opaque({ reason }: { reason: string }): MappedStaticAudio {
	return { capability: "opaque", issueCode: "FEATURE_OPAQUE", reason };
}

function isDefaultBeats({
	value,
}: {
	value: Record<string, unknown>;
}): boolean {
	const aiBeats = isRawRecord(value.ai_beats) ? value.ai_beats : undefined;
	return (
		hasExactKeys({ value, keys: BEATS_KEYS }) &&
		typeof value.id === "string" &&
		value.id.length > 0 &&
		value.type === "beats" &&
		value.enable_ai_beats === false &&
		value.gear === 404 &&
		value.gear_count === 0 &&
		value.mode === 404 &&
		isEmptyArray({ value: value.user_beats }) &&
		value.user_delete_ai_beats === null &&
		aiBeats !== undefined &&
		hasExactKeys({ value: aiBeats, keys: AI_BEATS_KEYS }) &&
		isEmptyArray({ value: aiBeats.beat_speed_infos }) &&
		isEmptyString({ value: aiBeats.beats_path }) &&
		isEmptyString({ value: aiBeats.beats_url }) &&
		isEmptyString({ value: aiBeats.melody_path }) &&
		Array.isArray(aiBeats.melody_percents) &&
		aiBeats.melody_percents.length === 1 &&
		aiBeats.melody_percents[0] === 0 &&
		isEmptyString({ value: aiBeats.melody_url })
	);
}

const AUDIO_COMPANION_VALIDATORS: Readonly<
	Record<string, Beta4CompanionValidator>
> = {
	beats: isDefaultBeats,
	placeholder_infos: isDefaultPlaceholder,
	sound_channel_mappings: isDefaultSoundChannelMapping,
	speeds: isDefaultSpeed,
	vocal_separations: isDefaultVocalSeparation,
};

function hasVerifiedAudioMaterial({
	material,
	segment,
}: {
	material: RawGraphMaterialNode;
	segment: RawGraphSegmentNode;
}): boolean {
	const duration = material.raw.duration;
	return (
		material.bucket === "audios" &&
		material.raw.type === "extract_music" &&
		typeof material.raw.path === "string" &&
		material.raw.path.length > 0 &&
		typeof duration === "number" &&
		Number.isSafeInteger(duration) &&
		duration > 0 &&
		segment.sourceRange?.start === 0 &&
		segment.sourceRange.duration === duration &&
		segment.targetRange !== undefined &&
		segment.targetRange.start >= 0 &&
		segment.targetRange.duration === duration &&
		material.raw.is_ai_clone_tone === false &&
		material.raw.is_ai_clone_tone_post === false &&
		material.raw.is_text_edit_overdub === false &&
		material.raw.lyric_type === 0 &&
		isEmptyArray({ value: material.raw.wave_points })
	);
}

function hasVerifiedSegmentDefaults({
	segment,
}: {
	segment: RawGraphSegmentNode;
}): boolean {
	return (
		segment.raw.speed === 1 &&
		segment.raw.volume === 1 &&
		segment.raw.last_nonzero_volume === 1 &&
		segment.raw.reverse === false &&
		segment.raw.is_loop === false &&
		segment.raw.is_tone_modify === false &&
		segment.raw.intensifies_audio === false &&
		segment.raw.visible === true &&
		segment.raw.state === 0 &&
		isZeroRange({ value: segment.raw.render_timerange }) &&
		isMissingOrEmptyArray({ value: segment.raw.common_keyframes }) &&
		isMissingOrEmptyArray({ value: segment.raw.keyframe_refs }) &&
		isMissingOrEmptyArray({ value: segment.raw.lyric_keyframes })
	);
}

/** Classifies the real beta4 single local-audio, default-processing subset. */
export function mapStaticAudio({
	profileId,
	material,
	segment,
	graph,
}: MapStaticAudioInput): MappedStaticAudio {
	if (profileId !== JIANYING_11_3_BETA4_PROFILE_ID) {
		return blocked({
			reason: "audio material is outside the verified beta4 profile",
		});
	}
	if (!hasVerifiedAudioMaterial({ material, segment })) {
		return opaque({
			reason:
				"audio source, trim, or material type is outside the verified beta4 local-audio subset",
		});
	}
	if (!hasVerifiedSegmentDefaults({ segment })) {
		return opaque({
			reason:
				"audio playback, volume, loop, reverse, or keyframe state is preserved but not editable",
		});
	}
	if (
		!hasVerifiedBeta4DefaultCompanions({
			graph,
			segment,
			validators: AUDIO_COMPANION_VALIDATORS,
		})
	) {
		return opaque({
			reason:
				"audio companion processing is preserved but falls outside the verified beta4 defaults",
		});
	}
	return { capability: "exact" };
}
