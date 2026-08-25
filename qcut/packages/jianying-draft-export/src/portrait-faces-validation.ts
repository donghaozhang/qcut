import type { MediaPortraitFaceAdjustments } from "@qcut/editor-core";
import type { JsonValue } from "./runtime-json.js";
import {
	assertNoUnknownKeys,
	getFiniteNumber,
	getRecord,
	getString,
	validationIssue,
} from "./runtime-json.js";

const PORTRAIT_FACE_ENTRY_KEYS: ReadonlySet<string> = new Set<
	keyof MediaPortraitFaceAdjustments
>(["trackId", "personBindingId", "bindingAnchor", "values", "makeup"]);

const PORTRAIT_BINDING_ANCHOR_KEYS = new Set(["rect", "frameNumber"]);
const PORTRAIT_BINDING_RECT_KEYS = new Set(["x", "y", "width", "height"]);
const PERSON_BINDING_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * The native runtime tracks at most ten faces, and both editor normalization
 * and the IPC parser cap entries there. Accepting more here would let a
 * snapshot pass export validation and then lose face data downstream.
 */
const MAXIMUM_PORTRAIT_FACE_ENTRIES = 10;

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
	if (value.length > MAXIMUM_PORTRAIT_FACE_ENTRIES) {
		throw validationIssue({
			message: `Expected at most ${MAXIMUM_PORTRAIT_FACE_ENTRIES} entries.`,
			path,
		});
	}
	const seenBindings = new Set<string>();
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
		const personBindingId =
			record.personBindingId === undefined
				? undefined
				: getString({
						path: `${entryPath}.personBindingId`,
						value: record.personBindingId,
					});
		if (personBindingId && !PERSON_BINDING_ID.test(personBindingId)) {
			throw validationIssue({
				message: "Expected a valid project person binding id.",
				path: `${entryPath}.personBindingId`,
			});
		}
		const bindingKey = personBindingId
			? `person:${personBindingId}`
			: `legacy-track:${trackId}`;
		if (seenBindings.has(bindingKey)) {
			throw validationIssue({
				message: "Expected unique project person bindings.",
				path: personBindingId
					? `${entryPath}.personBindingId`
					: `${entryPath}.trackId`,
			});
		}
		seenBindings.add(bindingKey);
		if (personBindingId) {
			const anchorPath = `${entryPath}.bindingAnchor`;
			const anchor = getRecord({
				path: anchorPath,
				value: record.bindingAnchor,
			});
			assertNoUnknownKeys({
				allowed: PORTRAIT_BINDING_ANCHOR_KEYS,
				path: anchorPath,
				record: anchor,
			});
			const rectPath = `${anchorPath}.rect`;
			const rect = getRecord({ path: rectPath, value: anchor.rect });
			assertNoUnknownKeys({
				allowed: PORTRAIT_BINDING_RECT_KEYS,
				path: rectPath,
				record: rect,
			});
			const x = getFiniteNumber({ path: `${rectPath}.x`, value: rect.x });
			const y = getFiniteNumber({ path: `${rectPath}.y`, value: rect.y });
			const width = getFiniteNumber({
				path: `${rectPath}.width`,
				value: rect.width,
			});
			const height = getFiniteNumber({
				path: `${rectPath}.height`,
				value: rect.height,
			});
			if (
				x < 0 ||
				y < 0 ||
				width <= 0 ||
				height <= 0 ||
				x + width > 1 ||
				y + height > 1
			) {
				throw validationIssue({
					message: "Expected a normalized person binding rectangle.",
					path: rectPath,
				});
			}
			if (anchor.frameNumber !== undefined) {
				const frameNumber = getFiniteNumber({
					path: `${anchorPath}.frameNumber`,
					value: anchor.frameNumber,
				});
				if (!Number.isSafeInteger(frameNumber) || frameNumber < 0) {
					throw validationIssue({
						message: "Expected a non-negative binding frame number.",
						path: `${anchorPath}.frameNumber`,
					});
				}
			}
		} else if (record.bindingAnchor !== undefined) {
			throw validationIssue({
				message: "A binding anchor requires a project person binding id.",
				path: `${entryPath}.bindingAnchor`,
			});
		}
		validateValues({ path: `${entryPath}.values`, value: record.values });
		if (record.makeup !== undefined) {
			validateMakeup({ path: `${entryPath}.makeup`, value: record.makeup });
		}
	}
}
