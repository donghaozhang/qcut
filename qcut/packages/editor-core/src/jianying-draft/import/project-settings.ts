import { isRawRecord, type RawDraftContent } from "./raw-types.js";

export interface DraftProjectSettings {
	durationUs?: number;
	fps?: number;
	height?: number;
	width?: number;
}

function readPositiveNumber({ value }: { value: unknown }): number | undefined {
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? value
		: undefined;
}

function readNonNegativeInteger({
	value,
}: {
	value: unknown;
}): number | undefined {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
		? value
		: undefined;
}

function readSettings({
	content,
}: {
	content: Record<string, unknown>;
}): DraftProjectSettings {
	const canvas = isRawRecord(content.canvas_config)
		? content.canvas_config
		: {};
	return {
		width: readPositiveNumber({ value: canvas.width }),
		height: readPositiveNumber({ value: canvas.height }),
		fps: readPositiveNumber({ value: content.fps }),
		durationUs: readNonNegativeInteger({ value: content.duration }),
	};
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
				if (typeof ref === "string" && ref.length > 0) refs.add(ref);
			}
		}
	}
	return refs;
}

function selectCompoundDraft({
	content,
}: {
	content: RawDraftContent;
}): Record<string, unknown> | undefined {
	const materials = isRawRecord(content.materials) ? content.materials : {};
	const draftMaterials = Array.isArray(materials.drafts)
		? materials.drafts.filter(isRawRecord)
		: [];
	const compoundRefs = collectCompoundMaterialRefs({ content });
	const referenced = draftMaterials.filter(
		(material) =>
			typeof material.id === "string" && compoundRefs.has(material.id)
	);
	const selected =
		referenced.length === 1
			? referenced[0]
			: draftMaterials.length === 1
				? draftMaterials[0]
				: undefined;
	return selected !== undefined && isRawRecord(selected.draft)
		? selected.draft
		: undefined;
}

/** Resolves wrapper metadata without interpreting compound timeline edits. */
export function readDraftProjectSettings({
	content,
}: {
	content: RawDraftContent;
}): DraftProjectSettings {
	const root = readSettings({ content });
	const compoundDraft = selectCompoundDraft({ content });
	if (compoundDraft === undefined) return root;

	const compound = readSettings({ content: compoundDraft });
	return {
		width: root.width ?? compound.width,
		height: root.height ?? compound.height,
		fps: root.fps ?? compound.fps,
		durationUs:
			root.durationUs === undefined || root.durationUs === 0
				? (compound.durationUs ?? root.durationUs)
				: root.durationUs,
	};
}
