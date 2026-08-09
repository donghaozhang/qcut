import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
	numberValue,
	objectArray,
	objectValue,
	stringValue,
} from "./json-values";
import {
	compareCaptureImages,
	type PixelDifferenceMetrics,
} from "./image-difference";

export { compareCaptureImages } from "./image-difference";
export type { PixelDifferenceMetrics } from "./image-difference";

export const PARITY_PROGRESS_STOPS = [0, 0.25, 0.5, 0.75, 1] as const;

type ParityCandidate = "qcutPreview" | "qcutExport";

interface ParitySample {
	progress: number;
	jianying: string;
	jianyingPreview: string;
	jianyingExport: string;
	qcutPreview: string;
	qcutExport: string;
}

export interface ParityComparison {
	progress: number;
	candidate: ParityCandidate;
	referencePath: string;
	candidatePath: string;
	metrics: PixelDifferenceMetrics;
}

export interface ParityCaptureReport {
	manifestPath: string;
	transitionTitle: string;
	formula: string;
	expectedProgressStops: number[];
	presentProgressStops: number[];
	missingProgressStops: number[];
	comparisons: ParityComparison[];
	issues: string[];
	preview: {
		comparisonCount: number;
		worstRmse: number | null;
		meanRmse: number | null;
	};
	export: {
		comparisonCount: number;
		worstRmse: number | null;
		meanRmse: number | null;
	};
	complete: boolean;
}

export interface TransitionParityReport {
	transitionTitle: string;
	evidence: {
		catalogVersionCount: number;
		draftInstanceCount: number;
		packageCount: number;
		packageFamilies: string[];
		formula: string | null;
	};
	capture: ParityCaptureReport | null;
	thresholds: {
		highConfidenceRmse: number;
		mediumConfidenceRmse: number;
	};
	confidence: "high" | "medium" | "low" | "unverified";
	reasons: string[];
	ambiguities: string[];
}

interface ComparisonAttempt {
	comparison: ParityComparison | null;
	issue: string;
}

function progressKey({ progress }: { progress: number }) {
	return progress.toFixed(4);
}

function resolveCapturePath({
	manifestDirectory,
	value,
}: {
	manifestDirectory: string;
	value: unknown;
}) {
	const filePath = stringValue({ value });
	if (!filePath) return "";
	return path.resolve(manifestDirectory, filePath);
}

function parseSamples({
	manifest,
	manifestDirectory,
}: {
	manifest: Record<string, unknown>;
	manifestDirectory: string;
}): ParitySample[] {
	const seenProgress = new Set<string>();
	const samples = objectArray({ value: manifest.samples }).map((sample) => {
		const progress = numberValue({ value: sample.progress });
		if (progress === null || progress < 0 || progress > 1) {
			throw new Error("Each parity sample requires progress between 0 and 1");
		}
		const key = progressKey({ progress });
		if (seenProgress.has(key)) {
			throw new Error(`Duplicate parity progress stop: ${progress}`);
		}
		seenProgress.add(key);
		return {
			progress,
			jianying: resolveCapturePath({
				manifestDirectory,
				value: sample.jianying,
			}),
			jianyingPreview: resolveCapturePath({
				manifestDirectory,
				value: sample.jianyingPreview,
			}),
			jianyingExport: resolveCapturePath({
				manifestDirectory,
				value: sample.jianyingExport,
			}),
			qcutPreview: resolveCapturePath({
				manifestDirectory,
				value: sample.qcutPreview,
			}),
			qcutExport: resolveCapturePath({
				manifestDirectory,
				value: sample.qcutExport,
			}),
		};
	});
	return samples.sort((left, right) => left.progress - right.progress);
}

function referenceForCandidate({
	sample,
	candidate,
}: {
	sample: ParitySample;
	candidate: ParityCandidate;
}) {
	return candidate === "qcutPreview"
		? sample.jianyingPreview || sample.jianying
		: sample.jianyingExport || sample.jianying;
}

function channelSummary({
	comparisons,
	candidate,
}: {
	comparisons: ParityComparison[];
	candidate: ParityCandidate;
}) {
	const channelComparisons = comparisons.filter(
		(comparison) => comparison.candidate === candidate
	);
	if (channelComparisons.length === 0) {
		return { comparisonCount: 0, worstRmse: null, meanRmse: null };
	}
	const values = channelComparisons.map((comparison) => comparison.metrics.rmse);
	return {
		comparisonCount: values.length,
		worstRmse: Math.max(...values),
		meanRmse: values.reduce((total, value) => total + value, 0) / values.length,
	};
}

async function compareSampleCandidate({
	sample,
	candidate,
	ffmpegPath,
}: {
	sample: ParitySample;
	candidate: ParityCandidate;
	ffmpegPath?: string;
}): Promise<ParityComparison> {
	const referencePath = referenceForCandidate({ sample, candidate });
	return {
		progress: sample.progress,
		candidate,
		referencePath,
		candidatePath: sample[candidate],
		metrics: await compareCaptureImages({
			referencePath,
			candidatePath: sample[candidate],
			ffmpegPath,
		}),
	};
}

async function attemptSampleComparison({
	sample,
	candidate,
	ffmpegPath,
}: {
	sample: ParitySample;
	candidate: ParityCandidate;
	ffmpegPath?: string;
}): Promise<ComparisonAttempt> {
	const referencePath = referenceForCandidate({ sample, candidate });
	if (!referencePath || !existsSync(referencePath)) {
		return {
			comparison: null,
			issue: `Missing Jianying ${candidate === "qcutPreview" ? "preview" : "export"} reference at progress ${sample.progress}`,
		};
	}
	const candidatePath = sample[candidate];
	if (!candidatePath || !existsSync(candidatePath)) {
		return {
			comparison: null,
			issue: `Missing ${candidate} capture at progress ${sample.progress}`,
		};
	}
	try {
		return {
			comparison: await compareSampleCandidate({
				sample,
				candidate,
				ffmpegPath,
			}),
			issue: "",
		};
	} catch (error) {
		return {
			comparison: null,
			issue: `${candidate} comparison failed at progress ${sample.progress}: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}

export async function compareParityManifest({
	manifestPath,
	ffmpegPath,
}: {
	manifestPath: string;
	ffmpegPath?: string;
}): Promise<ParityCaptureReport> {
	const resolvedManifestPath = path.resolve(manifestPath);
	const manifest = objectValue({
		value: JSON.parse(readFileSync(resolvedManifestPath, "utf8")),
	});
	if (!manifest) throw new Error("Parity manifest must contain a JSON object");
	const samples = parseSamples({
		manifest,
		manifestDirectory: path.dirname(resolvedManifestPath),
	});
	const presentKeys = new Set(samples.map((sample) => progressKey(sample)));
	const missingProgressStops = PARITY_PROGRESS_STOPS.filter(
		(progress) => !presentKeys.has(progressKey({ progress }))
	);
	const issues: string[] = [];
	const comparisonTasks: Promise<ComparisonAttempt>[] = [];
	for (const sample of samples) {
		for (const candidate of ["qcutPreview", "qcutExport"] as const) {
			comparisonTasks.push(
				attemptSampleComparison({ sample, candidate, ffmpegPath })
			);
		}
	}
	const attempts = await Promise.all(comparisonTasks);
	const comparisons = attempts.flatMap((attempt) =>
		attempt.comparison ? [attempt.comparison] : []
	);
	issues.push(
		...attempts.flatMap((attempt) => (attempt.issue ? [attempt.issue] : []))
	);
	const preview = channelSummary({ comparisons, candidate: "qcutPreview" });
	const exportSummary = channelSummary({ comparisons, candidate: "qcutExport" });
	return {
		manifestPath: resolvedManifestPath,
		transitionTitle: stringValue({ value: manifest.transitionTitle }),
		formula: stringValue({ value: manifest.formula }),
		expectedProgressStops: [...PARITY_PROGRESS_STOPS],
		presentProgressStops: samples.map((sample) => sample.progress),
		missingProgressStops,
		comparisons,
		issues,
		preview,
		export: exportSummary,
		complete:
			missingProgressStops.length === 0 &&
			issues.length === 0 &&
			preview.comparisonCount === PARITY_PROGRESS_STOPS.length &&
			exportSummary.comparisonCount === PARITY_PROGRESS_STOPS.length,
	};
}

function worstCaptureRmse({ capture }: { capture: ParityCaptureReport }) {
	return Math.max(capture.preview.worstRmse ?? 0, capture.export.worstRmse ?? 0);
}

export function buildTransitionParityReport({
	transitionTitle,
	catalogVersionCount,
	draftInstanceCount,
	packageCount,
	packageFamilies,
	formula,
	ambiguities = [],
	capture = null,
}: {
	transitionTitle: string;
	catalogVersionCount: number;
	draftInstanceCount: number;
	packageCount: number;
	packageFamilies: string[];
	formula?: string;
	ambiguities?: string[];
	capture?: ParityCaptureReport | null;
}): TransitionParityReport {
	const highConfidenceRmse = 8;
	const mediumConfidenceRmse = 16;
	const resolvedFormula = formula || capture?.formula || "";
	const reasons: string[] = [];
	const hasStructuralEvidence =
		catalogVersionCount > 0 && draftInstanceCount > 0 && packageCount > 0;
	if (!hasStructuralEvidence) reasons.push("catalog, draft, and package evidence are not all present");
	if (!resolvedFormula) reasons.push("mathematical formula has not been recorded");
	if (ambiguities.length > 0) reasons.push("identity or ownership remains ambiguous");
	if (!capture || capture.comparisons.length === 0) {
		reasons.push("no comparable frame captures were provided");
		return {
			transitionTitle,
			evidence: {
				catalogVersionCount,
				draftInstanceCount,
				packageCount,
				packageFamilies,
				formula: resolvedFormula || null,
			},
			capture,
			thresholds: { highConfidenceRmse, mediumConfidenceRmse },
			confidence: "unverified",
			reasons,
			ambiguities,
		};
	}
	const worstRmse = worstCaptureRmse({ capture });
	let confidence: TransitionParityReport["confidence"] = "low";
	if (
		hasStructuralEvidence &&
		resolvedFormula &&
		ambiguities.length === 0 &&
		capture.complete &&
		worstRmse <= highConfidenceRmse
	) {
		confidence = "high";
	} else if (
		hasStructuralEvidence &&
		resolvedFormula &&
		ambiguities.length === 0 &&
		// worstCaptureRmse scores a missing channel as 0, so without this an
		// incomplete capture set looked as good as a perfect one.
		capture.complete &&
		worstRmse <= mediumConfidenceRmse
	) {
		confidence = "medium";
	}
	if (!capture.complete) reasons.push("the five-stop preview/export capture set is incomplete");
	if (worstRmse > mediumConfidenceRmse) {
		reasons.push(`worst frame RMSE ${worstRmse.toFixed(3)} exceeds ${mediumConfidenceRmse}`);
	} else if (worstRmse > highConfidenceRmse) {
		reasons.push(`worst frame RMSE ${worstRmse.toFixed(3)} exceeds ${highConfidenceRmse}`);
	}
	if (confidence === "high") reasons.push("all structural evidence and frame thresholds passed");
	return {
		transitionTitle,
		evidence: {
			catalogVersionCount,
			draftInstanceCount,
			packageCount,
			packageFamilies,
			formula: resolvedFormula || null,
		},
		capture,
		thresholds: { highConfidenceRmse, mediumConfidenceRmse },
		confidence,
		reasons,
		ambiguities,
	};
}
