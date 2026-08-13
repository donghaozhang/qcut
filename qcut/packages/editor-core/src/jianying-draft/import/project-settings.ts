import { selectCompoundDraft } from "./compound-draft.js";
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

/** Resolves wrapper metadata without interpreting compound timeline edits. */
export function readDraftProjectSettings({
	content,
}: {
	content: RawDraftContent;
}): DraftProjectSettings {
	const root = readSettings({ content });
	const compoundSelection = selectCompoundDraft({ content });
	if (compoundSelection === undefined) return root;

	const compound = readSettings({ content: compoundSelection.content });
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
