import { planarQuadPoints } from "./planar-geometry.js";
import type {
	PlanarQuad,
	PlanarSampleStatus,
	PlanarTrackingSample,
	PlanarTrackingSidecarV1,
	PlanarTrackingValidationIssue,
	PlanarTrackingValidationResult,
} from "./planar-types.js";
import {
	addPlanarValidationIssue,
	invalidPlanarValidationResult,
	MAX_PLANAR_TRACKING_VALIDATION_ISSUES,
	PLANAR_TRACKING_DIRECTIONS,
	readPlanarArray,
	readPlanarDiagnostics,
	readPlanarLiteral,
	readPlanarNumber,
	readPlanarQuad,
	readPlanarRecord,
	readPlanarSha256,
	readPlanarString,
} from "./planar-validation-helpers.js";

export const MAX_PLANAR_TRACKING_SAMPLES = 1_000_000;

const SAMPLE_STATUSES = [
	"tracked",
	"lost",
	"corrected",
] as const satisfies readonly PlanarSampleStatus[];

function quadsMatch({
	left,
	right,
	epsilon = 1e-9,
}: {
	left: PlanarQuad;
	right: PlanarQuad;
	epsilon?: number;
}): boolean {
	const leftPoints = planarQuadPoints({ quad: left });
	const rightPoints = planarQuadPoints({ quad: right });
	return leftPoints.every(
		(point, index) =>
			Math.abs(point.x - rightPoints[index].x) <= epsilon &&
			Math.abs(point.y - rightPoints[index].y) <= epsilon
	);
}

function readTrackingSample({
	value,
	index,
	issues,
}: {
	value: unknown;
	index: number;
	issues: PlanarTrackingValidationIssue[];
}): {
	index: number;
	ptsUs: number;
	quad: PlanarQuad;
	sample: PlanarTrackingSample;
} | null {
	const path = `samples.${index}`;
	const issueCount = issues.length;
	const record = readPlanarRecord({ value, path, issues });
	if (!record) return null;
	const ptsUs = readPlanarNumber({
		value: record.ptsUs,
		path: `${path}.ptsUs`,
		issues,
		integer: true,
		min: 0,
	});
	const quad = readPlanarQuad({
		value: record.quad,
		path: `${path}.quad`,
		issues,
	});
	const status = readPlanarLiteral({
		value: record.status,
		allowed: SAMPLE_STATUSES,
		path: `${path}.status`,
		issues,
	});
	const confidence = readPlanarNumber({
		value: record.confidence,
		path: `${path}.confidence`,
		issues,
		min: 0,
		max: 1,
	});
	const diagnostics =
		record.diagnostics === undefined
			? undefined
			: readPlanarDiagnostics({
					value: record.diagnostics,
					path: `${path}.diagnostics`,
					issues,
				});
	if (
		issues.length !== issueCount ||
		ptsUs === null ||
		quad === null ||
		status === null ||
		confidence === null ||
		diagnostics === null
	) {
		return null;
	}
	const sample: PlanarTrackingSample = {
		ptsUs,
		quad,
		status,
		confidence,
		...(diagnostics ? { diagnostics } : {}),
	};
	return { index, ptsUs, quad, sample };
}

export function validatePlanarTrackingSidecar({
	value,
}: {
	value: unknown;
}): PlanarTrackingValidationResult<PlanarTrackingSidecarV1> {
	const issues: PlanarTrackingValidationIssue[] = [];
	const record = readPlanarRecord({ value, path: "$", issues });
	if (!record) return invalidPlanarValidationResult({ issues });

	readPlanarLiteral({
		value: record.schemaVersion,
		allowed: [1],
		path: "schemaVersion",
		issues,
	});
	readPlanarLiteral({
		value: record.coordinateSpace,
		allowed: ["source-display-normalized"],
		path: "coordinateSpace",
		issues,
	});
	readPlanarLiteral({
		value: record.timebase,
		allowed: ["microseconds"],
		path: "timebase",
		issues,
	});

	const source = readPlanarRecord({
		value: record.source,
		path: "source",
		issues,
	});
	if (source) {
		readPlanarString({ value: source.mediaId, path: "source.mediaId", issues });
		readPlanarSha256({
			value: source.contentSha256,
			path: "source.contentSha256",
			issues,
		});
		readPlanarNumber({
			value: source.displayWidth,
			path: "source.displayWidth",
			issues,
			integer: true,
			min: 1,
		});
		readPlanarNumber({
			value: source.displayHeight,
			path: "source.displayHeight",
			issues,
			integer: true,
			min: 1,
		});
	}

	const provider = readPlanarRecord({
		value: record.provider,
		path: "provider",
		issues,
	});
	if (provider) {
		readPlanarLiteral({
			value: provider.id,
			allowed: ["opencv-wasm"],
			path: "provider.id",
			issues,
		});
		readPlanarString({
			value: provider.version,
			path: "provider.version",
			issues,
		});
		readPlanarSha256({
			value: provider.parametersHash,
			path: "provider.parametersHash",
			issues,
		});
	}

	const seed = readPlanarRecord({ value: record.seed, path: "seed", issues });
	const seedPtsUs = seed
		? readPlanarNumber({
				value: seed.ptsUs,
				path: "seed.ptsUs",
				issues,
				integer: true,
				min: 0,
			})
		: null;
	const seedQuad = seed
		? readPlanarQuad({ value: seed.quad, path: "seed.quad", issues })
		: null;
	readPlanarLiteral({
		value: record.direction,
		allowed: PLANAR_TRACKING_DIRECTIONS,
		path: "direction",
		issues,
	});

	const samples = readPlanarArray({
		value: record.samples,
		path: "samples",
		issues,
	});
	if (!samples) return invalidPlanarValidationResult({ issues });
	if (samples.length === 0) {
		addPlanarValidationIssue({
			issues,
			code: "invalid-shape",
			path: "samples",
			message: "A tracking sidecar must contain at least the seed sample.",
		});
	}
	if (samples.length > MAX_PLANAR_TRACKING_SAMPLES) {
		addPlanarValidationIssue({
			issues,
			code: "sample-limit-exceeded",
			path: "samples",
			message: `Sample count exceeds the ${MAX_PLANAR_TRACKING_SAMPLES} sample safety limit.`,
		});
		return invalidPlanarValidationResult({ issues });
	}

	let previousPtsUs: number | undefined;
	let matchingSeedSample: NonNullable<
		ReturnType<typeof readTrackingSample>
	> | null = null;
	for (const [index, value] of samples.entries()) {
		if (issues.length >= MAX_PLANAR_TRACKING_VALIDATION_ISSUES) break;
		const validated = readTrackingSample({
			value,
			index,
			issues,
		});
		if (!validated) continue;
		if (previousPtsUs !== undefined && validated.ptsUs <= previousPtsUs) {
			addPlanarValidationIssue({
				issues,
				code: "invalid-sample-order",
				path: `samples.${index}.ptsUs`,
				message: "Sample PTS values must be strictly increasing and unique.",
			});
		}
		previousPtsUs = validated.ptsUs;
		if (seedPtsUs !== null && validated.ptsUs === seedPtsUs) {
			matchingSeedSample = validated;
		}
	}

	if (seedPtsUs !== null && !matchingSeedSample) {
		addPlanarValidationIssue({
			issues,
			code: "invalid-seed-sample",
			path: "samples",
			message: "Samples must contain an entry at the exact seed PTS.",
		});
	}
	if (
		seedQuad &&
		matchingSeedSample &&
		!quadsMatch({ left: seedQuad, right: matchingSeedSample.quad })
	) {
		addPlanarValidationIssue({
			issues,
			code: "invalid-seed-sample",
			path: `samples.${matchingSeedSample.index}.quad`,
			message: "The seed sample quad must match the declared seed quad.",
		});
	}

	if (issues.length > 0) return invalidPlanarValidationResult({ issues });
	return { valid: true, value: value as PlanarTrackingSidecarV1, issues: [] };
}
