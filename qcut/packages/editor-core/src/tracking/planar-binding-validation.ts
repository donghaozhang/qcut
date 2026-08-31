import type {
	PlanarTrackingValidationIssue,
	PlanarTrackingValidationResult,
	StickerPlanarTracking,
} from "./planar-types.js";
import {
	invalidPlanarValidationResult,
	readPlanarLiteral,
	readPlanarNumber,
	readPlanarQuad,
	readPlanarRecord,
	readPlanarString,
} from "./planar-validation-helpers.js";

export function validateStickerPlanarTracking({
	value,
}: {
	value: unknown;
}): PlanarTrackingValidationResult<StickerPlanarTracking> {
	const issues: PlanarTrackingValidationIssue[] = [];
	const record = readPlanarRecord({ value, path: "$", issues });
	if (!record) return invalidPlanarValidationResult({ issues });

	readPlanarLiteral({
		value: record.mode,
		allowed: ["planar"],
		path: "mode",
		issues,
	});
	readPlanarString({
		value: record.sourceElementId,
		path: "sourceElementId",
		issues,
	});
	readPlanarString({
		value: record.surfaceTrackingId,
		path: "surfaceTrackingId",
		issues,
	});
	readPlanarNumber({
		value: record.seedPtsUs,
		path: "seedPtsUs",
		issues,
		integer: true,
		min: 0,
	});
	readPlanarQuad({
		value: record.seedTargetQuad,
		path: "seedTargetQuad",
		issues,
	});
	readPlanarLiteral({
		value: record.lostBehavior,
		allowed: ["hold", "hide"],
		path: "lostBehavior",
		issues,
	});

	if (issues.length > 0) return invalidPlanarValidationResult({ issues });
	return { valid: true, value: value as StickerPlanarTracking, issues: [] };
}
