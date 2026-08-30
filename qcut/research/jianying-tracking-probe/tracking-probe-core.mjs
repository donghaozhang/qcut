import { summarizeMotion } from "./tracking-probe-motion.mjs";
import { summarizePlanar } from "./tracking-probe-planar.mjs";
import {
	createIssue,
	formatHistogram,
	hasFields,
	isFiniteNumber,
	isRecord,
	MAX_REPORTED_SAMPLE_INDICES,
	MOTION_FIELDS,
	maximum,
	median,
	minimum,
	PLANAR_FIELDS,
	round,
} from "./tracking-probe-shared.mjs";

const DEFAULT_EPSILON = 1e-8;
const DEFAULT_MIN_PLANAR_AREA = 1e-6;

function extractPayloadArrays({ dataPayload }) {
	if (Array.isArray(dataPayload)) {
		return { baseline: [], samples: dataPayload, wrapper: "array" };
	}

	if (!isRecord({ value: dataPayload })) {
		return { baseline: [], samples: [], wrapper: "unknown" };
	}

	return {
		baseline: Array.isArray(dataPayload.baseline) ? dataPayload.baseline : [],
		samples: Array.isArray(dataPayload.data) ? dataPayload.data : [],
		wrapper: "object",
	};
}

function classifyTracking({ desc, samples }) {
	const planarSamples = samples.filter((sample) =>
		hasFields({ value: sample, fields: PLANAR_FIELDS }),
	).length;
	const motionSamples = samples.filter((sample) =>
		hasFields({ value: sample, fields: MOTION_FIELDS }),
	).length;
	const total = samples.length;
	const descHint =
		desc?.resType === 4 ? "planar" : desc?.resType === 1 ? "motion" : null;
	const evidence = [];

	if (planarSamples > 0) {
		evidence.push(`${planarSamples}/${total} samples expose p_x1..p_y4`);
	}
	if (motionSamples > 0) {
		evidence.push(
			`${motionSamples}/${total} samples expose left/top/right/bottom`,
		);
	}
	if (descHint) {
		evidence.push(
			`desc.resType=${desc.resType} hints ${descHint} for the observed profile`,
		);
	}

	if (
		total > 0 &&
		planarSamples / total >= 0.8 &&
		planarSamples > motionSamples
	) {
		return { kind: "planar", confidence: "strong", evidence, descHint };
	}

	if (
		total > 0 &&
		motionSamples / total >= 0.8 &&
		motionSamples > planarSamples
	) {
		return { kind: "motion", confidence: "strong", evidence, descHint };
	}

	if (total === 0 && descHint) {
		return { kind: descHint, confidence: "weak", evidence, descHint };
	}

	return { kind: "unknown", confidence: "none", evidence, descHint };
}

function analyzePts({ samples }) {
	const ptsEntries = [];
	const invalidIndices = [];

	for (const [index, sample] of samples.entries()) {
		if (
			!isRecord({ value: sample }) ||
			!isFiniteNumber({ value: sample.pts })
		) {
			invalidIndices.push(index);
			continue;
		}
		ptsEntries.push({ index, pts: sample.pts });
	}

	const nonIncreasingIndices = [];
	const steps = [];
	for (let index = 1; index < ptsEntries.length; index += 1) {
		const previous = ptsEntries[index - 1];
		const current = ptsEntries[index];
		const step = current.pts - previous.pts;
		steps.push(step);
		if (step <= 0) {
			nonIncreasingIndices.push(current.index);
		}
	}

	const positiveSteps = steps.filter((step) => step > 0);
	const uniqueSteps = [
		...new Set(positiveSteps.map((step) => round({ value: step, digits: 3 }))),
	];

	return {
		present: ptsEntries.length,
		missingOrInvalid: invalidIndices.length,
		invalidIndices: invalidIndices.slice(0, MAX_REPORTED_SAMPLE_INDICES),
		first: ptsEntries[0]?.pts ?? null,
		last: ptsEntries.at(-1)?.pts ?? null,
		minimum: minimum({ values: ptsEntries.map(({ pts }) => pts) }),
		maximum: maximum({ values: ptsEntries.map(({ pts }) => pts) }),
		medianPositiveStep:
			positiveSteps.length > 0
				? round({ value: median({ values: positiveSteps }), digits: 3 })
				: null,
		uniquePositiveSteps: uniqueSteps.slice(0, 20),
		nonIncreasing: nonIncreasingIndices.length,
		nonIncreasingIndices: nonIncreasingIndices.slice(
			0,
			MAX_REPORTED_SAMPLE_INDICES,
		),
	};
}

function summarizeDescriptor({ desc }) {
	if (!isRecord({ value: desc })) {
		return null;
	}

	return {
		resType: desc.resType ?? null,
		startTime: desc.startTime ?? null,
		endTime: desc.endTime ?? null,
		baselinePtsCount: Array.isArray(desc.baselinePts)
			? desc.baselinePts.length
			: null,
	};
}

function addCrossChecks({ classification, desc, pts, samples, issues }) {
	if (
		classification.descHint &&
		classification.kind !== "unknown" &&
		classification.descHint !== classification.kind
	) {
		issues.push(
			createIssue({
				severity: "warning",
				code: "descriptor-schema-conflict",
				message: `desc.resType hints ${classification.descHint}, but sample fields classify as ${classification.kind}`,
			}),
		);
	}

	if (samples.length === 0) {
		issues.push(
			createIssue({
				severity: "error",
				code: "empty-track",
				message: "tracking payload contains no data samples",
			}),
		);
	}

	if (pts.missingOrInvalid > 0) {
		issues.push(
			createIssue({
				severity: "warning",
				code: "invalid-pts",
				message: `${pts.missingOrInvalid}/${samples.length} samples have missing or non-finite pts`,
				sampleIndices: pts.invalidIndices,
			}),
		);
	}

	if (pts.nonIncreasing > 0) {
		issues.push(
			createIssue({
				severity: "warning",
				code: "non-increasing-pts",
				message: `${pts.nonIncreasing} samples do not advance monotonically in input order`,
				sampleIndices: pts.nonIncreasingIndices,
			}),
		);
	}

	if (
		isRecord({ value: desc }) &&
		isFiniteNumber({ value: desc.startTime }) &&
		isFiniteNumber({ value: desc.endTime }) &&
		pts.first !== null &&
		pts.last !== null
	) {
		const tolerance = pts.medianPositiveStep ?? 1;
		const startsOutside = Math.abs(desc.startTime - pts.first) > tolerance;
		const endsOutside = Math.abs(desc.endTime - pts.last) > tolerance;
		if (startsOutside || endsOutside) {
			issues.push(
				createIssue({
					severity: "info",
					code: "descriptor-pts-range-differs",
					message:
						"desc start/end do not exactly match sample PTS coverage; preserve both until the profile time contract is known",
				}),
			);
		}
	}
}

export function analyzeTrackingBundle({
	desc = null,
	data,
	cache = null,
	sourceLabel = "input",
	epsilon = DEFAULT_EPSILON,
	minimumPlanarArea = DEFAULT_MIN_PLANAR_AREA,
}) {
	const issues = [];
	const { baseline, samples, wrapper } = extractPayloadArrays({
		dataPayload: data,
	});
	const classification = classifyTracking({ desc, samples });
	const pts = analyzePts({ samples });

	let analysis = null;
	if (classification.kind === "planar") {
		analysis = summarizePlanar({
			samples,
			epsilon,
			minimumArea: minimumPlanarArea,
			issues,
		});
	}
	if (classification.kind === "motion") {
		analysis = summarizeMotion({ samples, baseline, cache, epsilon, issues });
	}
	if (classification.kind === "unknown") {
		issues.push(
			createIssue({
				severity: "error",
				code: "unknown-track-schema",
				message:
					"sample fields do not match the known planar or motion tracking shapes",
			}),
		);
	}

	addCrossChecks({ classification, desc, pts, samples, issues });

	return {
		schemaVersion: 1,
		sourceLabel,
		payload: {
			wrapper,
			sampleCount: samples.length,
			baselineCount: baseline.length,
			hasCache: cache !== null,
		},
		descriptor: summarizeDescriptor({ desc }),
		classification: {
			kind: classification.kind,
			confidence: classification.confidence,
			evidence: classification.evidence,
		},
		pts,
		analysis,
		issues,
		outcome: {
			errors: issues.filter(({ severity }) => severity === "error").length,
			warnings: issues.filter(({ severity }) => severity === "warning").length,
			information: issues.filter(({ severity }) => severity === "info").length,
			valid: issues.every(({ severity }) => severity !== "error"),
		},
	};
}

export function formatHumanReport({ report }) {
	const lines = [
		`Tracking probe: ${report.sourceLabel}`,
		`Kind: ${report.classification.kind} (${report.classification.confidence})`,
		`Samples: ${report.payload.sampleCount}; baseline: ${report.payload.baselineCount}; cache: ${report.payload.hasCache ? "yes" : "no"}`,
		`PTS: ${report.pts.first ?? "n/a"} -> ${report.pts.last ?? "n/a"}; median positive step: ${report.pts.medianPositiveStep ?? "n/a"}`,
	];

	if (report.analysis) {
		const control =
			report.analysis.control > 0 ? `; ${report.analysis.control} control` : "";
		lines.push(
			`Geometry validity: ${report.analysis.valid}/${report.analysis.evaluated} evaluated samples valid; ${report.analysis.invalid} invalid${control}`,
			`Statuses: ${formatHistogram({ histogram: report.analysis.statusHistogram })}`,
		);
	}

	if (report.classification.kind === "planar" && report.analysis) {
		lines.push(
			`Planar area: min=${report.analysis.geometry.area.minimum ?? "n/a"}, median=${report.analysis.geometry.area.median ?? "n/a"}, max=${report.analysis.geometry.area.maximum ?? "n/a"}`,
			`Maximum corner jump: ${report.analysis.geometry.maximumCornerJump?.distance ?? "n/a"}`,
		);
	}

	if (report.classification.kind === "motion" && report.analysis) {
		lines.push(
			`Motion area: min=${report.analysis.geometry.area.minimum ?? "n/a"}, median=${report.analysis.geometry.area.median ?? "n/a"}, max=${report.analysis.geometry.area.maximum ?? "n/a"}`,
			`Maximum center jump: ${report.analysis.geometry.maximumCenterJump?.distance ?? "n/a"}`,
			`Dense cache: ${report.analysis.denseCache ? `${report.analysis.denseCache.valid}/${report.analysis.denseCache.total} valid` : "none"}`,
		);
	}

	lines.push(
		`Outcome: ${report.outcome.valid ? "VALID" : "INVALID"}; errors=${report.outcome.errors}, warnings=${report.outcome.warnings}, info=${report.outcome.information}`,
	);

	if (report.issues.length > 0) {
		lines.push("Issues:");
		for (const issue of report.issues) {
			const indices =
				issue.sampleIndices.length > 0
					? ` [samples ${issue.sampleIndices.join(", ")}]`
					: "";
			lines.push(
				`  ${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}${indices}`,
			);
		}
	}

	return lines.join("\n");
}

export const probeDefaults = Object.freeze({
	epsilon: DEFAULT_EPSILON,
	minimumPlanarArea: DEFAULT_MIN_PLANAR_AREA,
});
