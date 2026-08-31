import type {
	PlanarTrackingErrorCode,
	PlanarTrackingReference,
	PlanarTrackingReferenceStatus,
	PlanarTrackingValidationIssue,
	PlanarTrackingValidationResult,
} from "./planar-types.js";
import {
	addPlanarValidationIssue,
	invalidPlanarValidationResult,
	PLANAR_TRACKING_DIRECTIONS,
	readPlanarLiteral,
	readPlanarNumber,
	readPlanarQuad,
	readPlanarRecord,
	readPlanarSha256,
	readPlanarString,
} from "./planar-validation-helpers.js";
import { MAX_PLANAR_TRACKING_SAMPLES } from "./planar-sidecar-validation.js";

const REFERENCE_STATUSES = [
	"idle",
	"processing",
	"paused",
	"ready",
	"partial",
	"stale",
	"error",
] as const satisfies readonly PlanarTrackingReferenceStatus[];
const ERROR_CODES = [
	"provider-unavailable",
	"decode-failed",
	"invalid-seed-quad",
	"insufficient-texture",
	"tracking-lost",
	"degenerate-homography",
	"result-write-failed",
	"result-corrupt",
	"cancelled",
] as const satisfies readonly PlanarTrackingErrorCode[];

function isUnsafeResultUri({ resultUri }: { resultUri: string }): boolean {
	if (resultUri.includes("\0")) return true;
	if (resultUri.startsWith("project-tracking:")) {
		return !/^project-tracking:[a-z\d][a-z\d._-]*$/i.test(resultUri);
	}
	if (/^[a-z][a-z\d+.-]*:/i.test(resultUri)) return true;
	if (/^(?:\/|\\|[a-z]:[\\/])/i.test(resultUri)) return true;

	let decodedPath: string;
	try {
		decodedPath = decodeURIComponent(resultUri);
	} catch {
		return true;
	}
	return decodedPath.replaceAll("\\", "/").split("/").includes("..");
}

export function validatePlanarTrackingReference({
	value,
}: {
	value: unknown;
}): PlanarTrackingValidationResult<PlanarTrackingReference> {
	const issues: PlanarTrackingValidationIssue[] = [];
	const record = readPlanarRecord({ value, path: "$", issues });
	if (!record) return invalidPlanarValidationResult({ issues });

	readPlanarLiteral({
		value: record.schemaVersion,
		allowed: [1],
		path: "schemaVersion",
		issues,
	});
	readPlanarString({ value: record.id, path: "id", issues });
	readPlanarString({
		value: record.sourceMediaId,
		path: "sourceMediaId",
		issues,
	});
	const seedPtsUs = readPlanarNumber({
		value: record.seedPtsUs,
		path: "seedPtsUs",
		issues,
		integer: true,
		min: 0,
	});
	readPlanarQuad({ value: record.seedQuad, path: "seedQuad", issues });
	readPlanarLiteral({
		value: record.direction,
		allowed: PLANAR_TRACKING_DIRECTIONS,
		path: "direction",
		issues,
	});
	readPlanarLiteral({
		value: record.provider,
		allowed: ["opencv-wasm"],
		path: "provider",
		issues,
	});
	readPlanarString({
		value: record.providerVersion,
		path: "providerVersion",
		issues,
	});
	readPlanarNumber({
		value: record.analysisWidth,
		path: "analysisWidth",
		issues,
		integer: true,
		min: 1,
	});
	readPlanarNumber({
		value: record.analysisHeight,
		path: "analysisHeight",
		issues,
		integer: true,
		min: 1,
	});
	const status = readPlanarLiteral({
		value: record.status,
		allowed: REFERENCE_STATUSES,
		path: "status",
		issues,
	});

	const hasResultUri = record.resultUri !== undefined;
	const hasResultSha256 = record.resultSha256 !== undefined;
	const resultUri = hasResultUri
		? readPlanarString({ value: record.resultUri, path: "resultUri", issues })
		: null;
	if (resultUri && isUnsafeResultUri({ resultUri })) {
		addPlanarValidationIssue({
			issues,
			code: "unsafe-result-uri",
			path: "resultUri",
			message:
				"Result URI must be a project-tracking URI or a safe relative path.",
		});
	}
	if (hasResultSha256) {
		readPlanarSha256({
			value: record.resultSha256,
			path: "resultSha256",
			issues,
		});
	}
	const sampleCount =
		record.sampleCount === undefined
			? null
			: readPlanarNumber({
					value: record.sampleCount,
					path: "sampleCount",
					issues,
					integer: true,
					min: 0,
					max: MAX_PLANAR_TRACKING_SAMPLES,
				});

	if (record.trackedRange !== undefined) {
		const range = readPlanarRecord({
			value: record.trackedRange,
			path: "trackedRange",
			issues,
		});
		if (range) {
			const startPtsUs = readPlanarNumber({
				value: range.startPtsUs,
				path: "trackedRange.startPtsUs",
				issues,
				integer: true,
				min: 0,
			});
			const endPtsUs = readPlanarNumber({
				value: range.endPtsUs,
				path: "trackedRange.endPtsUs",
				issues,
				integer: true,
				min: 0,
			});
			if (startPtsUs !== null && endPtsUs !== null && endPtsUs < startPtsUs) {
				addPlanarValidationIssue({
					issues,
					code: "invalid-reference-state",
					path: "trackedRange",
					message: "Tracked range end must be at or after its start.",
				});
			}
			if (
				startPtsUs !== null &&
				endPtsUs !== null &&
				seedPtsUs !== null &&
				(seedPtsUs < startPtsUs || seedPtsUs > endPtsUs)
			) {
				addPlanarValidationIssue({
					issues,
					code: "invalid-reference-state",
					path: "trackedRange",
					message: "Tracked range must contain the seed PTS.",
				});
			}
		}
	}

	const errorCode =
		record.errorCode === undefined
			? null
			: readPlanarLiteral({
					value: record.errorCode,
					allowed: ERROR_CODES,
					path: "errorCode",
					issues,
				});
	if (hasResultUri !== hasResultSha256) {
		addPlanarValidationIssue({
			issues,
			code: "invalid-reference-state",
			path: "resultUri",
			message: "Result URI and SHA-256 must be present together.",
		});
	}
	if (status === "ready" || status === "partial") {
		if (
			!(
				hasResultUri &&
				hasResultSha256 &&
				sampleCount !== null &&
				sampleCount > 0
			)
		) {
			addPlanarValidationIssue({
				issues,
				code: "invalid-reference-state",
				path: "status",
				message: `${status} references require a stored result and positive sample count.`,
			});
		}
	}
	if (status === "error" && !errorCode) {
		addPlanarValidationIssue({
			issues,
			code: "invalid-reference-state",
			path: "errorCode",
			message: "Error references require an error code.",
		});
	}

	if (issues.length > 0) return invalidPlanarValidationResult({ issues });
	return { valid: true, value: value as PlanarTrackingReference, issues: [] };
}
