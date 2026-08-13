import { createHash } from "node:crypto";

import {
	collectTransitionParityEvidence,
	type ParitySampleEvidence,
	type TransitionParityEvidence,
} from "./transition-parity-media";
import type { TransitionParityEntry } from "./transition-parity-plan";
import {
	compareTextForegroundAndGeometry,
	TEXT_PARITY_FOREGROUND_BACKGROUND_THRESHOLD,
	TEXT_PARITY_GEOMETRY_BACKGROUND_THRESHOLD,
	type TextForegroundDifferenceMetrics,
} from "./text-parity-foreground";
import {
	buildTextParityFrameWindow,
	type TextParityEntry,
	type TextParityMatrix,
} from "./text-parity-plan";

export interface TextParitySampleEvidence extends ParitySampleEvidence {
	foreground: TextForegroundDifferenceMetrics;
	geometry: TextForegroundDifferenceMetrics;
}

export type TextParityEvidence = Omit<TransitionParityEvidence, "samples"> & {
	packageHash: string;
	packageKind: TextParityEntry["packageKind"];
	contentSha256: string;
	contentCodePoints: number;
	fontAssetId?: string;
	fontSize: number;
	templateDuration: number;
	sourceStartSeconds: number;
	elementDurationSeconds: number;
	pixelThresholds: {
		foreground: number;
		geometry: number;
	};
	samples: TextParitySampleEvidence[];
	foregroundSummary: {
		meanRmse: number;
		worstRmse: number;
		minimumMaskIou: number;
		maximumCentroidDistance: number;
		maximumBoundsDelta: number;
	};
};

export interface TextParityThresholds {
	fullFrameRmse: number;
	foregroundRmse: number;
	maskIou: number;
	geometryPixels: number;
}

export interface TextParityMetricSummary {
	fullFrameRmse: number;
	foregroundRmse: number;
	maskIou: number;
	centroidDistance: number;
	maximumBoundsDelta: number;
}

export function classifyTextParityMetrics({
	metrics,
	thresholds,
}: {
	metrics: TextParityMetricSummary;
	thresholds: TextParityThresholds;
}): "pass" | "near" | "fail" {
	const isPass =
		metrics.fullFrameRmse <= thresholds.fullFrameRmse &&
		metrics.foregroundRmse <= thresholds.foregroundRmse &&
		metrics.maskIou >= thresholds.maskIou &&
		metrics.centroidDistance <= thresholds.geometryPixels &&
		metrics.maximumBoundsDelta <= thresholds.geometryPixels;
	if (isPass) return "pass";
	const isNear =
		metrics.fullFrameRmse <= thresholds.fullFrameRmse * 2 &&
		metrics.foregroundRmse <= thresholds.foregroundRmse * 2 &&
		metrics.maskIou >= Math.max(0, thresholds.maskIou - 0.15) &&
		metrics.centroidDistance <= thresholds.geometryPixels * 2 &&
		metrics.maximumBoundsDelta <= thresholds.geometryPixels * 2;
	return isNear ? "near" : "fail";
}

export function classifyTextParityResult({
	evidence,
	thresholds,
}: {
	evidence: TextParityEvidence;
	thresholds: TextParityThresholds;
}): "pass" | "near" | "fail" {
	return classifyTextParityMetrics({
		metrics: {
			fullFrameRmse: Math.max(
				evidence.fiveStopWorstRmse,
				evidence.fullInterval.rgbRmse
			),
			foregroundRmse: evidence.foregroundSummary.worstRmse,
			maskIou: evidence.foregroundSummary.minimumMaskIou,
			centroidDistance: evidence.foregroundSummary.maximumCentroidDistance,
			maximumBoundsDelta: evidence.foregroundSummary.maximumBoundsDelta,
		},
		thresholds,
	});
}

export async function collectTextParityEvidence({
	entry,
	matrix,
	candidateVideo,
	evidenceDirectory,
	ffmpegPath,
	ffprobePath,
	repositoryRoot,
}: {
	entry: TextParityEntry;
	matrix: TextParityMatrix;
	candidateVideo: string;
	evidenceDirectory: string;
	ffmpegPath: string;
	ffprobePath: string;
	repositoryRoot: string;
}): Promise<TextParityEvidence> {
	const comparisonEntry: TransitionParityEntry = {
		title: entry.title,
		resourceId: entry.resourceId,
		metadataMd5: entry.packageHash,
		packagePath: "",
		referenceVideo: entry.referenceVideo,
		durationSeconds: entry.captureDurationSeconds,
		packageFamily: entry.packageKind,
		formula: "jianying-private-text-runtime",
		holdExactEndpoints: false,
	};
	const comparison = await collectTransitionParityEvidence({
		entry: comparisonEntry,
		candidateVideo,
		window: buildTextParityFrameWindow({
			entry,
			frameRate: matrix.frameRate,
		}),
		evidenceDirectory,
		ffmpegPath,
		ffprobePath,
		cwd: repositoryRoot,
	});
	const foregroundTasks: Array<Promise<TextParitySampleEvidence>> = [];
	for (const sample of comparison.samples) {
		foregroundTasks.push(
			compareTextForegroundAndGeometry({
				referencePath: sample.referenceFrame,
				candidatePath: sample.candidateFrame,
				backgroundColor: matrix.canvas.backgroundColor,
				ffmpegPath,
			}).then(({ foreground, geometry }) => ({
				...sample,
				foreground,
				geometry,
			}))
		);
	}
	const samples = await Promise.all(foregroundTasks);
	const foregroundRmseValues = samples.map(
		(sample) => sample.foreground.foregroundRmse
	);
	return {
		...comparison,
		packageHash: entry.packageHash,
		packageKind: entry.packageKind,
		contentSha256: createHash("sha256").update(entry.content).digest("hex"),
		contentCodePoints: Array.from(entry.content).length,
		...(entry.fontAssetId ? { fontAssetId: entry.fontAssetId } : {}),
		fontSize: entry.fontSize,
		templateDuration: entry.templateDuration,
		sourceStartSeconds: entry.sourceStartSeconds,
		elementDurationSeconds: entry.elementDurationSeconds,
		pixelThresholds: {
			foreground: TEXT_PARITY_FOREGROUND_BACKGROUND_THRESHOLD,
			geometry: TEXT_PARITY_GEOMETRY_BACKGROUND_THRESHOLD,
		},
		samples,
		foregroundSummary: {
			meanRmse:
				foregroundRmseValues.reduce((total, value) => total + value, 0) /
				foregroundRmseValues.length,
			worstRmse: Math.max(...foregroundRmseValues),
			minimumMaskIou: Math.min(
				...samples.map((sample) => sample.foreground.maskIou)
			),
			maximumCentroidDistance: Math.max(
				...samples.map((sample) => sample.geometry.centroidDistance)
			),
			maximumBoundsDelta: Math.max(
				...samples.map((sample) => sample.geometry.maximumBoundsDelta)
			),
		},
	};
}
