import type { MediaPortraitFaceAdjustments } from "@qcut/editor-core";
import type { JsonValue } from "./runtime-json.js";
import {
	assertNoUnknownKeys,
	getFiniteNumber,
	getRecord,
	validationIssue,
} from "./runtime-json.js";

const PORTRAIT_FACE_ENTRY_KEYS: ReadonlySet<string> = new Set<
	keyof MediaPortraitFaceAdjustments
>(["trackId", "values", "makeup"]);

/**
 * Validates the optional per-face portrait adjustment entries. Value and
 * makeup payloads are checked by the callbacks so this module never
 * duplicates the container's field rules; it owns only the array structure:
 * entry keys, trackId shape, and duplicate rejection. Lives outside
 * snapshot-media-runtime-validation.ts because that file already exceeds the
 * repository size cap.
 */
export function validatePortraitFaceEntries({
	path,
	value,
	validateValues,
	validateMakeup,
}: {
	path: string;
	value: JsonValue;
	validateValues: (input: { path: string; value: JsonValue }) => void;
	validateMakeup: (input: { path: string; value: JsonValue }) => void;
}): void {
	if (!Array.isArray(value)) {
		throw validationIssue({ message: "Expected an array.", path });
	}
	const seenTrackIds = new Set<number>();
	for (const [index, entry] of value.entries()) {
		const entryPath = `${path}[${index}]`;
		const record = getRecord({ path: entryPath, value: entry });
		assertNoUnknownKeys({
			allowed: PORTRAIT_FACE_ENTRY_KEYS,
			path: entryPath,
			record,
		});
		const trackId = getFiniteNumber({
			path: `${entryPath}.trackId`,
			value: record.trackId,
		});
		if (!Number.isSafeInteger(trackId) || trackId < 0) {
			throw validationIssue({
				message: "Expected a non-negative integer track id.",
				path: `${entryPath}.trackId`,
			});
		}
		if (seenTrackIds.has(trackId)) {
			throw validationIssue({
				message: "Expected unique track ids.",
				path: `${entryPath}.trackId`,
			});
		}
		seenTrackIds.add(trackId);
		validateValues({ path: `${entryPath}.values`, value: record.values });
		if (record.makeup !== undefined) {
			validateMakeup({ path: `${entryPath}.makeup`, value: record.makeup });
		}
	}
}
