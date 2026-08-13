import type { InteropCapability } from "../../draft-interop/capability.js";
import type { InteropIssueCode } from "../../draft-interop/issues.js";
import { JIANYING_11_3_BETA4_PROFILE_ID } from "../profiles/jianying-11-3-beta4.js";
import type {
	RawDraftGraph,
	RawGraphMaterialNode,
	RawGraphSegmentNode,
} from "./graph-reader.js";
import { isRawRecord } from "./raw-types.js";

const BETA4_AUDIO_COMPANION_BUCKETS = new Set([
	"beats",
	"placeholder_infos",
	"sound_channel_mappings",
	"speeds",
	"vocal_separations",
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

function isEmptyArray(value: unknown): boolean {
	return Array.isArray(value) && value.length === 0;
}

function isMissingOrEmptyArray(value: unknown): boolean {
	return value === undefined || value === null || isEmptyArray(value);
}

function isEmptyString(value: unknown): boolean {
	return value === "";
}

function isZeroRange(value: unknown): boolean {
	return isRawRecord(value) && value.start === 0 && value.duration === 0;
}

function blocked(reason: string): MappedStaticAudio {
	return { capability: "blocked", issueCode: "FEATURE_OPAQUE", reason };
}

function opaque(reason: string): MappedStaticAudio {
	return { capability: "opaque", issueCode: "FEATURE_OPAQUE", reason };
}

function isDefaultBeats(value: Record<string, unknown>): boolean {
	const aiBeats = isRawRecord(value.ai_beats) ? value.ai_beats : undefined;
	return (
		value.type === "beats" &&
		value.enable_ai_beats === false &&
		value.gear === 404 &&
		value.gear_count === 0 &&
		value.mode === 404 &&
		isEmptyArray(value.user_beats) &&
		value.user_delete_ai_beats === null &&
		aiBeats !== undefined &&
		isEmptyArray(aiBeats.beat_speed_infos) &&
		isEmptyString(aiBeats.beats_path) &&
		isEmptyString(aiBeats.beats_url) &&
		isEmptyString(aiBeats.melody_path) &&
		Array.isArray(aiBeats.melody_percents) &&
		aiBeats.melody_percents.length === 1 &&
		aiBeats.melody_percents[0] === 0 &&
		isEmptyString(aiBeats.melody_url)
	);
}

function isDefaultPlaceholder(value: Record<string, unknown>): boolean {
	return (
		value.type === "placeholder_info" &&
		value.meta_type === "none" &&
		isEmptyString(value.error_path) &&
		isEmptyString(value.error_text) &&
		isEmptyString(value.res_path) &&
		isEmptyString(value.res_text)
	);
}

function isDefaultSoundChannelMapping(value: Record<string, unknown>): boolean {
	return (
		value.type === "none" &&
		value.audio_channel_mapping === 0 &&
		value.is_config_open === false
	);
}

function isDefaultSpeed(value: Record<string, unknown>): boolean {
	return (
		value.type === "speed" &&
		value.curve_speed === null &&
		value.mode === 0 &&
		value.speed === 1
	);
}

function isDefaultVocalSeparation(value: Record<string, unknown>): boolean {
	return (
		value.type === "vocal_separation" &&
		value.choice === 0 &&
		isEmptyString(value.enter_from) &&
		isEmptyString(value.final_algorithm) &&
		isEmptyString(value.production_path) &&
		isEmptyArray(value.removed_sounds) &&
		value.time_range === null
	);
}

function isDefaultCompanion({
	bucket,
	value,
}: {
	bucket: string;
	value: Record<string, unknown>;
}): boolean {
	if (bucket === "beats") return isDefaultBeats(value);
	if (bucket === "placeholder_infos") return isDefaultPlaceholder(value);
	if (bucket === "sound_channel_mappings") {
		return isDefaultSoundChannelMapping(value);
	}
	if (bucket === "speeds") return isDefaultSpeed(value);
	return bucket === "vocal_separations" && isDefaultVocalSeparation(value);
}

function hasVerifiedDefaultCompanions({
	graph,
	segment,
}: {
	graph: RawDraftGraph;
	segment: RawGraphSegmentNode;
}): boolean {
	if (segment.extraMaterialRefs.length !== BETA4_AUDIO_COMPANION_BUCKETS.size) {
		return false;
	}
	const observedBuckets = new Set<string>();
	for (const ref of segment.extraMaterialRefs) {
		const companion = graph.materialsById.get(ref);
		if (
			companion === undefined ||
			!BETA4_AUDIO_COMPANION_BUCKETS.has(companion.bucket) ||
			observedBuckets.has(companion.bucket) ||
			!isDefaultCompanion({
				bucket: companion.bucket,
				value: companion.raw,
			})
		) {
			return false;
		}
		observedBuckets.add(companion.bucket);
	}
	return observedBuckets.size === BETA4_AUDIO_COMPANION_BUCKETS.size;
}

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
		isEmptyArray(material.raw.wave_points)
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
		isZeroRange(segment.raw.render_timerange) &&
		isMissingOrEmptyArray(segment.raw.common_keyframes) &&
		isMissingOrEmptyArray(segment.raw.keyframe_refs) &&
		isMissingOrEmptyArray(segment.raw.lyric_keyframes)
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
		return blocked("audio material is outside the verified beta4 profile");
	}
	if (!hasVerifiedAudioMaterial({ material, segment })) {
		return opaque(
			"audio source, trim, or material type is outside the verified beta4 local-audio subset"
		);
	}
	if (!hasVerifiedSegmentDefaults({ segment })) {
		return opaque(
			"audio playback, volume, loop, reverse, or keyframe state is preserved but not editable"
		);
	}
	if (!hasVerifiedDefaultCompanions({ graph, segment })) {
		return opaque(
			"audio companion processing is preserved but falls outside the verified beta4 defaults"
		);
	}
	return { capability: "exact" };
}
