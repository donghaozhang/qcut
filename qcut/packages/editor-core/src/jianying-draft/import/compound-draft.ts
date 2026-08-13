import { isRawRecord, type RawDraftContent } from "./raw-types.js";

export interface CompoundDraftSelection {
	content: RawDraftContent;
	jsonPointerPrefix: string;
	materialId: string;
	referencedByRoot: boolean;
}

export interface EditableDraftContent {
	content: RawDraftContent;
	isCompoundWrapper: boolean;
	jsonPointerPrefix: string;
}

function readString({ value }: { value: unknown }): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function collectCompoundMaterialRefs({
	content,
}: {
	content: RawDraftContent;
}): Set<string> {
	const refs = new Set<string>();
	const tracks = Array.isArray(content.tracks) ? content.tracks : [];
	for (const track of tracks) {
		if (!isRawRecord(track) || !Array.isArray(track.segments)) continue;
		for (const segment of track.segments) {
			if (
				!isRawRecord(segment) ||
				!Array.isArray(segment.extra_material_refs)
			) {
				continue;
			}
			for (const ref of segment.extra_material_refs) {
				const materialId = readString({ value: ref });
				if (materialId !== undefined) refs.add(materialId);
			}
		}
	}
	return refs;
}

/** Selects a uniquely referenced compound draft, or the sole draft material. */
export function selectCompoundDraft({
	content,
}: {
	content: RawDraftContent;
}): CompoundDraftSelection | undefined {
	const materials = isRawRecord(content.materials) ? content.materials : {};
	const entries = Array.isArray(materials.drafts) ? materials.drafts : [];
	const referencedIds = collectCompoundMaterialRefs({ content });
	const candidates: CompoundDraftSelection[] = [];

	for (const [index, entry] of entries.entries()) {
		if (!isRawRecord(entry) || !isRawRecord(entry.draft)) continue;
		const materialId = readString({ value: entry.id });
		if (materialId === undefined) continue;
		candidates.push({
			content: entry.draft,
			jsonPointerPrefix: `/materials/drafts/${index}/draft`,
			materialId,
			referencedByRoot: referencedIds.has(materialId),
		});
	}

	const referenced = candidates.filter(
		(candidate) => candidate.referencedByRoot
	);
	if (referenced.length === 1) return referenced[0];
	return candidates.length === 1 ? candidates[0] : undefined;
}

interface SingleRootSegment {
	segment: Record<string, unknown>;
	trackType: string;
}

function readOnlyRootSegment({
	content,
}: {
	content: RawDraftContent;
}): SingleRootSegment | undefined {
	if (!Array.isArray(content.tracks) || content.tracks.length !== 1) {
		return undefined;
	}
	const [track] = content.tracks;
	if (
		!isRawRecord(track) ||
		(track.type !== "mixed" && track.type !== "audio") ||
		!Array.isArray(track.segments) ||
		track.segments.length !== 1
	) {
		return undefined;
	}
	const [segment] = track.segments;
	return isRawRecord(segment) ? { segment, trackType: track.type } : undefined;
}

function hasMaterialId({
	content,
	bucket,
	materialId,
}: {
	content: RawDraftContent;
	bucket: string;
	materialId: string;
}): boolean {
	if (!isRawRecord(content.materials)) return false;
	const entries = content.materials[bucket];
	return (
		Array.isArray(entries) &&
		entries.some((entry) => isRawRecord(entry) && entry.id === materialId)
	);
}

function hasNestedAudioSegment({
	content,
}: {
	content: RawDraftContent;
}): boolean {
	if (!Array.isArray(content.tracks)) return false;
	for (const track of content.tracks) {
		if (
			!isRawRecord(track) ||
			track.type !== "audio" ||
			!Array.isArray(track.segments)
		) {
			continue;
		}
		for (const segment of track.segments) {
			if (
				isRawRecord(segment) &&
				typeof segment.material_id === "string" &&
				hasMaterialId({
					content,
					bucket: "audios",
					materialId: segment.material_id,
				})
			) {
				return true;
			}
		}
	}
	return false;
}

function isVerifiedRootTrackShape({
	content,
	selection,
	root,
}: {
	content: RawDraftContent;
	selection: CompoundDraftSelection;
	root: SingleRootSegment;
}): boolean {
	if (root.trackType === "mixed") return true;
	const materialId = readString({ value: root.segment.material_id });
	return (
		root.trackType === "audio" &&
		materialId !== undefined &&
		hasMaterialId({ content, bucket: "audios", materialId }) &&
		hasNestedAudioSegment({ content: selection.content })
	);
}

function isNeutralWrapperCanvas({
	content,
}: {
	content: RawDraftContent;
}): boolean {
	if (content.duration !== 0 || !isRawRecord(content.canvas_config)) {
		return false;
	}
	return (
		content.canvas_config.width === 0 && content.canvas_config.height === 0
	);
}

function readRangeDuration({ value }: { value: unknown }): number | undefined {
	if (!isRawRecord(value)) return undefined;
	return typeof value.duration === "number" &&
		Number.isSafeInteger(value.duration) &&
		value.duration > 0
		? value.duration
		: undefined;
}

function isVerifiedSingleCompoundWrapper({
	content,
	selection,
}: {
	content: RawDraftContent;
	selection: CompoundDraftSelection;
}): boolean {
	if (!selection.referencedByRoot || !isNeutralWrapperCanvas({ content })) {
		return false;
	}
	const root = readOnlyRootSegment({ content });
	if (
		root === undefined ||
		!isVerifiedRootTrackShape({ content, selection, root }) ||
		!Array.isArray(root.segment.extra_material_refs)
	) {
		return false;
	}
	if (!root.segment.extra_material_refs.includes(selection.materialId)) {
		return false;
	}

	const nestedDuration =
		typeof selection.content.duration === "number" &&
		Number.isSafeInteger(selection.content.duration) &&
		selection.content.duration > 0
			? selection.content.duration
			: undefined;
	const targetDuration = readRangeDuration({
		value: root.segment.target_timerange,
	});
	return (
		nestedDuration !== undefined &&
		targetDuration !== undefined &&
		targetDuration <= nestedDuration &&
		Array.isArray(selection.content.tracks)
	);
}

/**
 * Enters only the neutral one-segment wrapper emitted by Jianying's
 * "new compound clip (subdraft)" action. Ordinary timelines that happen to
 * own compound materials remain rooted at their outer document.
 */
export function resolveEditableDraftContent({
	content,
}: {
	content: RawDraftContent;
}): EditableDraftContent {
	const selection = selectCompoundDraft({ content });
	if (
		selection === undefined ||
		!isVerifiedSingleCompoundWrapper({ content, selection })
	) {
		return { content, isCompoundWrapper: false, jsonPointerPrefix: "" };
	}
	return {
		content: selection.content,
		isCompoundWrapper: true,
		jsonPointerPrefix: selection.jsonPointerPrefix,
	};
}
