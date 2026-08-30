import { isValidPlanarQuad } from "./planar-geometry.js";
import type {
	NormalizedPoint,
	PlanarQuad,
	PlanarTrackingDiagnostics,
	PlanarTrackingDirection,
	PlanarTrackingValidationIssue,
	PlanarTrackingValidationIssueCode,
	PlanarTrackingValidationResult,
} from "./planar-types.js";

export const MAX_PLANAR_TRACKING_VALIDATION_ISSUES = 100;

export const PLANAR_TRACKING_DIRECTIONS = [
	"forward",
	"backward",
	"both",
] as const satisfies readonly PlanarTrackingDirection[];

type UnknownRecord = Record<string, unknown>;

export function invalidPlanarValidationResult<T>({
	issues,
}: {
	issues: PlanarTrackingValidationIssue[];
}): PlanarTrackingValidationResult<T> {
	return { valid: false, issues };
}

export function addPlanarValidationIssue({
	issues,
	code,
	path,
	message,
}: {
	issues: PlanarTrackingValidationIssue[];
	code: PlanarTrackingValidationIssueCode;
	path: string;
	message: string;
}): void {
	if (issues.length >= MAX_PLANAR_TRACKING_VALIDATION_ISSUES) return;
	issues.push({ code, path, message });
}

export function readPlanarRecord({
	value,
	path,
	issues,
}: {
	value: unknown;
	path: string;
	issues: PlanarTrackingValidationIssue[];
}): UnknownRecord | null {
	if (typeof value === "object" && value !== null && !Array.isArray(value)) {
		return value as UnknownRecord;
	}
	addPlanarValidationIssue({
		issues,
		code: "invalid-shape",
		path,
		message: "Expected an object.",
	});
	return null;
}

export function readPlanarArray({
	value,
	path,
	issues,
}: {
	value: unknown;
	path: string;
	issues: PlanarTrackingValidationIssue[];
}): unknown[] | null {
	if (Array.isArray(value)) return value;
	addPlanarValidationIssue({
		issues,
		code: "invalid-shape",
		path,
		message: "Expected an array.",
	});
	return null;
}

export function readPlanarLiteral<T extends string | number>({
	value,
	allowed,
	path,
	issues,
}: {
	value: unknown;
	allowed: readonly T[];
	path: string;
	issues: PlanarTrackingValidationIssue[];
}): T | null {
	if (allowed.includes(value as T)) return value as T;
	addPlanarValidationIssue({
		issues,
		code: "invalid-literal",
		path,
		message: `Expected one of: ${allowed.join(", ")}.`,
	});
	return null;
}

export function readPlanarString({
	value,
	path,
	issues,
}: {
	value: unknown;
	path: string;
	issues: PlanarTrackingValidationIssue[];
}): string | null {
	if (typeof value === "string" && value.trim().length > 0) return value;
	addPlanarValidationIssue({
		issues,
		code: "invalid-string",
		path,
		message: "Expected a non-empty string.",
	});
	return null;
}

export function readPlanarNumber({
	value,
	path,
	issues,
	integer = false,
	min = Number.NEGATIVE_INFINITY,
	max = Number.POSITIVE_INFINITY,
}: {
	value: unknown;
	path: string;
	issues: PlanarTrackingValidationIssue[];
	integer?: boolean;
	min?: number;
	max?: number;
}): number | null {
	const isValidInteger =
		!integer || (typeof value === "number" && Number.isSafeInteger(value));
	if (
		typeof value === "number" &&
		Number.isFinite(value) &&
		isValidInteger &&
		value >= min &&
		value <= max
	) {
		return value;
	}
	addPlanarValidationIssue({
		issues,
		code: "invalid-number",
		path,
		message: integer
			? `Expected a safe integer from ${min} to ${max}.`
			: `Expected a finite number from ${min} to ${max}.`,
	});
	return null;
}

export function readPlanarSha256({
	value,
	path,
	issues,
}: {
	value: unknown;
	path: string;
	issues: PlanarTrackingValidationIssue[];
}): string | null {
	if (typeof value === "string" && /^[a-f\d]{64}$/i.test(value)) return value;
	addPlanarValidationIssue({
		issues,
		code: "invalid-hash",
		path,
		message: "Expected a 64-character SHA-256 hex digest.",
	});
	return null;
}

function readNormalizedPoint({
	value,
	path,
	issues,
}: {
	value: unknown;
	path: string;
	issues: PlanarTrackingValidationIssue[];
}): NormalizedPoint | null {
	const record = readPlanarRecord({ value, path, issues });
	if (!record) return null;
	const x = readPlanarNumber({ value: record.x, path: `${path}.x`, issues });
	const y = readPlanarNumber({ value: record.y, path: `${path}.y`, issues });
	if (x === null || y === null) return null;
	return { x, y };
}

export function readPlanarQuad({
	value,
	path,
	issues,
}: {
	value: unknown;
	path: string;
	issues: PlanarTrackingValidationIssue[];
}): PlanarQuad | null {
	const record = readPlanarRecord({ value, path, issues });
	if (!record) return null;
	const topLeft = readNormalizedPoint({
		value: record.topLeft,
		path: `${path}.topLeft`,
		issues,
	});
	const topRight = readNormalizedPoint({
		value: record.topRight,
		path: `${path}.topRight`,
		issues,
	});
	const bottomRight = readNormalizedPoint({
		value: record.bottomRight,
		path: `${path}.bottomRight`,
		issues,
	});
	const bottomLeft = readNormalizedPoint({
		value: record.bottomLeft,
		path: `${path}.bottomLeft`,
		issues,
	});
	if (!(topLeft && topRight && bottomRight && bottomLeft)) return null;
	const quad = { topLeft, topRight, bottomRight, bottomLeft };
	if (isValidPlanarQuad({ quad })) return quad;
	addPlanarValidationIssue({
		issues,
		code: "invalid-quad",
		path,
		message:
			"Expected a finite, clockwise, convex quad above the minimum area.",
	});
	return null;
}

export function readPlanarDiagnostics({
	value,
	path,
	issues,
}: {
	value: unknown;
	path: string;
	issues: PlanarTrackingValidationIssue[];
}): PlanarTrackingDiagnostics | null {
	const issueCount = issues.length;
	const record = readPlanarRecord({ value, path, issues });
	if (!record) return null;
	const trackedPoints = readPlanarNumber({
		value: record.trackedPoints,
		path: `${path}.trackedPoints`,
		issues,
		integer: true,
		min: 0,
	});
	const inliers = readPlanarNumber({
		value: record.inliers,
		path: `${path}.inliers`,
		issues,
		integer: true,
		min: 0,
	});
	const inlierRatio = readPlanarNumber({
		value: record.inlierRatio,
		path: `${path}.inlierRatio`,
		issues,
		min: 0,
		max: 1,
	});
	const medianSymmetricErrorPx = readPlanarNumber({
		value: record.medianSymmetricErrorPx,
		path: `${path}.medianSymmetricErrorPx`,
		issues,
		min: 0,
	});
	const coverage = readPlanarNumber({
		value: record.coverage,
		path: `${path}.coverage`,
		issues,
		min: 0,
		max: 1,
	});
	if (trackedPoints !== null && inliers !== null && inliers > trackedPoints) {
		addPlanarValidationIssue({
			issues,
			code: "invalid-diagnostics",
			path: `${path}.inliers`,
			message: "Inlier count cannot exceed tracked point count.",
		});
	}
	if (
		issues.length !== issueCount ||
		trackedPoints === null ||
		inliers === null ||
		inlierRatio === null ||
		medianSymmetricErrorPx === null ||
		coverage === null
	) {
		return null;
	}
	return {
		trackedPoints,
		inliers,
		inlierRatio,
		medianSymmetricErrorPx,
		coverage,
	};
}
