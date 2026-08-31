import type {
	PlanarTrackingReference,
	StickerPlanarTracking,
} from "@qcut/editor-core";
import {
	validatePlanarTrackingReference,
	validateStickerPlanarTracking,
} from "@qcut/editor-core/tracking";
import {
	assertNoUnknownKeys,
	getArray,
	getRecord,
	type JsonValue,
	validationIssue,
} from "./runtime-json.js";
import { createAllowedKeySet } from "./snapshot-runtime-helpers.js";

const PLANAR_TRACKING_REFERENCE_KEYS =
	createAllowedKeySet<PlanarTrackingReference>({
		keys: {
			analysisHeight: true,
			analysisWidth: true,
			direction: true,
			errorCode: true,
			id: true,
			provider: true,
			providerVersion: true,
			resultSha256: true,
			resultUri: true,
			sampleCount: true,
			schemaVersion: true,
			seedPtsUs: true,
			seedQuad: true,
			sourceMediaId: true,
			status: true,
			trackedRange: true,
		},
	});

const STICKER_PLANAR_TRACKING_KEYS = createAllowedKeySet<StickerPlanarTracking>(
	{
		keys: {
			lostBehavior: true,
			mode: true,
			seedPtsUs: true,
			seedTargetQuad: true,
			sourceElementId: true,
			surfaceTrackingId: true,
		},
	}
);

function resolveIssuePath({
	basePath,
	issuePath,
}: {
	basePath: string;
	issuePath: string;
}): string {
	if (issuePath === "$") return basePath;
	return `${basePath}.${issuePath}`;
}

function throwFirstValidationIssue({
	basePath,
	issues,
}: {
	basePath: string;
	issues: readonly { message: string; path: string }[];
}): never {
	const issue = issues[0];
	throw validationIssue({
		message: issue?.message ?? "Invalid planar tracking value.",
		path: resolveIssuePath({
			basePath,
			issuePath: issue?.path ?? "$",
		}),
	});
}

export function validatePlanarTrackingReferencesRuntime({
	path,
	value,
}: {
	path: string;
	value: JsonValue;
}): void {
	const references = getArray({ path, value });
	for (const [index, referenceValue] of references.entries()) {
		const referencePath = `${path}[${index}]`;
		const reference = getRecord({
			path: referencePath,
			value: referenceValue,
		});
		assertNoUnknownKeys({
			allowed: PLANAR_TRACKING_REFERENCE_KEYS,
			path: referencePath,
			record: reference,
		});
		const result = validatePlanarTrackingReference({ value: reference });
		if (!result.valid) {
			throwFirstValidationIssue({
				basePath: referencePath,
				issues: result.issues,
			});
		}
	}
}

export function validateStickerPlanarTrackingRuntime({
	path,
	value,
}: {
	path: string;
	value: JsonValue;
}): void {
	const tracking = getRecord({ path, value });
	assertNoUnknownKeys({
		allowed: STICKER_PLANAR_TRACKING_KEYS,
		path,
		record: tracking,
	});
	const result = validateStickerPlanarTracking({ value: tracking });
	if (!result.valid) {
		throwFirstValidationIssue({ basePath: path, issues: result.issues });
	}
}
