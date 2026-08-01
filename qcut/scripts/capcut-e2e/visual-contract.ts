import { isDeepStrictEqual } from "node:util";
import {
	DEFAULT_STICKER_ALPHA_THRESHOLDS,
	type StickerAlphaComparison,
} from "./visual-alpha.js";
import {
	DISSOLVE_SAMPLE_PROGRESS,
	type DissolveFramePlan,
} from "./visual-frame-plan.js";
import type { RgbImageComparison } from "./visual-ffmpeg.js";
import {
	LUT_MASK_PROBES,
	type LutMaskProbeComparison,
} from "./visual-lut-mask.js";
import type { RgbErrorMetrics } from "./visual-metrics.js";
import type { CapCutE2eSourceFrameCalibrationReport } from "./manifest.js";
import { CAPCUT_E2E_FIXTURE_SPEC } from "./spec.js";

export const VISUAL_ORACLE_SCHEMA_VERSION = 2;
export const VISUAL_ORACLE_RMSE_THRESHOLD = 8 as const;

export type VisualVerificationStatus = "failed" | "unverified" | "verified";

export interface VisualFileEvidence {
	bytes: number;
	path: string;
	sha256: string;
}

export type VisualCaptureEvidence =
	| { exists: false; path: string }
	| ({ exists: true } & VisualFileEvidence);

export interface VisualDissolveSample {
	capture: VisualCaptureEvidence;
	comparison: RgbImageComparison | null;
	expected: VisualFileEvidence;
	frameOffset: number;
	id: string;
	nominalProgress: number;
	realizedProgress: number;
	status: VisualVerificationStatus;
	timelineFrameIndex: number;
	timelineFrameNumber: number;
	transitionFrameNumber: number;
}

export type VisualSourceFrameCalibration =
	CapCutE2eSourceFrameCalibrationReport & {
		fixtureSchemaVersion: 2;
		reason: string;
		status: "verified";
	};

export interface VisualOracleManifest {
	capturesDirectory: string;
	createdAt: string;
	dissolve: {
		framePlan: DissolveFramePlan;
		mixSpace: "encoded-rgb-0-255-linear-weight";
		rmseThreshold: typeof VISUAL_ORACLE_RMSE_THRESHOLD;
		samples: VisualDissolveSample[];
		sourceFrameCalibration: VisualSourceFrameCalibration;
		status: VisualVerificationStatus;
	};
	lutMask: {
		capture: VisualCaptureEvidence;
		comparison: LutMaskProbeComparison | null;
		expected: VisualFileEvidence;
		status: VisualVerificationStatus;
	};
	overallStatus: VisualVerificationStatus;
	runId: string;
	schemaVersion: typeof VISUAL_ORACLE_SCHEMA_VERSION;
	source: {
		bundleManifest: VisualFileEvidence;
		fixtureManifest: VisualFileEvidence;
		frameA: VisualFileEvidence;
		frameB: VisualFileEvidence;
	};
	sticker: {
		comparison: StickerAlphaComparison | null;
		reopenedAsset: VisualCaptureEvidence;
		source: VisualFileEvidence;
		status: VisualVerificationStatus;
	};
	toolchain: {
		ffmpeg: { banner: string; path: string; version: "8.1.2" };
		ffprobe: { banner: string; path: string; version: "8.1.2" };
	};
}

export function deriveVerificationStatus({
	pass,
	present,
}: {
	pass: boolean | null;
	present: boolean;
}): VisualVerificationStatus {
	if (!present) return "unverified";
	return pass ? "verified" : "failed";
}

export function deriveOverallVisualStatus({
	statuses,
}: {
	statuses: readonly VisualVerificationStatus[];
}): VisualVerificationStatus {
	if (statuses.some((status) => status === "failed")) return "failed";
	if (statuses.every((status) => status === "verified")) return "verified";
	return "unverified";
}

function validateFileEvidence({
	evidence,
	label,
}: {
	evidence: VisualFileEvidence;
	label: string;
}): void {
	if (
		!Number.isSafeInteger(evidence.bytes) ||
		evidence.bytes <= 0 ||
		evidence.path.length === 0 ||
		!/^[a-f0-9]{64}$/.test(evidence.sha256)
	) {
		throw new Error(`${label} file evidence is invalid.`);
	}
}

function validateRgbErrorMetrics({
	expectedPixelCount,
	label,
	metrics,
}: {
	expectedPixelCount?: number;
	label: string;
	metrics: RgbErrorMetrics;
}): void {
	const { mae, max, p95, rmse } = metrics;
	if (
		!Number.isSafeInteger(metrics.channelSampleCount) ||
		!Number.isSafeInteger(metrics.pixelCount) ||
		metrics.channelSampleCount !== metrics.pixelCount * 3 ||
		metrics.pixelCount <= 0 ||
		(expectedPixelCount !== undefined &&
			metrics.pixelCount !== expectedPixelCount) ||
		[mae, max, p95, rmse].some(
			(value) => !Number.isFinite(value) || value < 0 || value > 255
		) ||
		mae > rmse ||
		rmse > max ||
		p95 > max
	) {
		throw new Error(`${label} RGB metrics are inconsistent.`);
	}
}

function validateRgbComparison({
	comparison,
	comparisonRoi,
	label,
}: {
	comparison: RgbImageComparison;
	comparisonRoi: VisualSourceFrameCalibration["comparisonRoi"];
	label: string;
}): void {
	if (comparison.rmseThreshold !== VISUAL_ORACLE_RMSE_THRESHOLD) {
		throw new Error(`${label} must use the locked RGB RMSE threshold.`);
	}
	const expectedFrameGeometry = {
		height: CAPCUT_E2E_FIXTURE_SPEC.height,
		width: CAPCUT_E2E_FIXTURE_SPEC.width,
	};
	if (
		comparison.expectedGeometry.height !== expectedFrameGeometry.height ||
		comparison.expectedGeometry.width !== expectedFrameGeometry.width ||
		(comparison.dimensionsMatch &&
			(comparison.actualGeometry.height !== expectedFrameGeometry.height ||
				comparison.actualGeometry.width !== expectedFrameGeometry.width))
	) {
		throw new Error(`${label} source geometry is not locked to fixture v2.`);
	}
	if (!comparison.dimensionsMatch) {
		if (comparison.metrics !== null || comparison.pass) {
			throw new Error(`${label} dimension mismatch cannot pass.`);
		}
		return;
	}
	if (!comparison.metrics) {
		throw new Error(`${label} is missing RGB metrics.`);
	}
	validateRgbErrorMetrics({
		expectedPixelCount: comparisonRoi.width * comparisonRoi.height,
		label,
		metrics: comparison.metrics,
	});
	const expectedPass = comparison.metrics.rmse <= comparison.rmseThreshold;
	if (comparison.pass !== expectedPass) {
		throw new Error(`${label} RGB metrics are inconsistent.`);
	}
}

function validateCaptureStatus({
	capture,
	comparisonPass,
	label,
	status,
}: {
	capture: VisualCaptureEvidence;
	comparisonPass: boolean | null;
	label: string;
	status: VisualVerificationStatus;
}): void {
	if (capture.exists) validateFileEvidence({ evidence: capture, label });
	if (capture.exists !== (comparisonPass !== null)) {
		throw new Error(
			`${label} must have a comparison if and only if its observed file exists.`
		);
	}
	const expectedStatus = deriveVerificationStatus({
		pass: comparisonPass,
		present: capture.exists,
	});
	if (status !== expectedStatus) {
		throw new Error(
			`${label} status must be ${expectedStatus}; received ${status}.`
		);
	}
}

function validateDissolveFramePlan({
	framePlan,
}: {
	framePlan: DissolveFramePlan;
}): void {
	if (
		framePlan.sampleFormula !== "k=round(p*(N-1))" ||
		framePlan.samples.length !== DISSOLVE_SAMPLE_PROGRESS.length ||
		!Number.isSafeInteger(framePlan.transitionFrameCount) ||
		framePlan.transitionFrameCount < 2 ||
		!Number.isSafeInteger(framePlan.transitionStartFrameIndex) ||
		framePlan.transitionStartFrameIndex < 0 ||
		framePlan.intervalReason.length === 0
	) {
		throw new Error(
			"Dissolve frame plan must contain the locked five samples."
		);
	}
	for (const [index, sample] of framePlan.samples.entries()) {
		const nominalProgress = DISSOLVE_SAMPLE_PROGRESS[index];
		const expectedOffset = Math.round(
			(nominalProgress ?? -1) * (framePlan.transitionFrameCount - 1)
		);
		const expectedTimelineIndex =
			framePlan.transitionStartFrameIndex + expectedOffset;
		if (
			sample.nominalProgress !== nominalProgress ||
			sample.frameOffset !== expectedOffset ||
			sample.realizedProgress !==
				Number(
					(expectedOffset / (framePlan.transitionFrameCount - 1)).toFixed(9)
				) ||
			sample.timelineFrameIndex !== expectedTimelineIndex ||
			sample.timelineFrameNumber !== expectedTimelineIndex + 1 ||
			sample.transitionFrameNumber !== expectedOffset + 1
		) {
			throw new Error(`Dissolve frame-plan sample ${index} is inconsistent.`);
		}
	}
	const hasEvidence = framePlan.intervalEvidence !== null;
	if (framePlan.intervalStatus === "verified") {
		throw new Error(
			"Verified dissolve intervals are unsupported until numbered-export evidence has a strict parsed schema."
		);
	}
	if (
		framePlan.intervalStatus === "unverified" &&
		(framePlan.intervalSource !== "expected-seam-candidate" || hasEvidence)
	) {
		throw new Error(
			"Unverified dissolve interval is not an expected-model candidate."
		);
	}
	if (framePlan.intervalEvidence) {
		validateFileEvidence({
			evidence: framePlan.intervalEvidence,
			label: "Dissolve interval evidence",
		});
	}
}

function validateStickerComparison({
	comparison,
}: {
	comparison: StickerAlphaComparison;
}): void {
	const thresholds = comparison.thresholds;
	const defaults = DEFAULT_STICKER_ALPHA_THRESHOLDS;
	if (
		thresholds.alphaMae !== defaults.alphaMae ||
		thresholds.boundsDeltaPixels !== defaults.boundsDeltaPixels ||
		thresholds.visiblePixelRelativeDelta !==
			defaults.visiblePixelRelativeDelta ||
		thresholds.visibleRgbRmse !== defaults.visibleRgbRmse ||
		comparison.visibleRgb.rmseThreshold !== thresholds.visibleRgbRmse
	) {
		throw new Error("Sticker reopened-asset thresholds are inconsistent.");
	}
	for (const [label, shape] of [
		["source", comparison.source],
		["reopened asset", comparison.reopenedAsset],
	] as const) {
		if (
			!Number.isSafeInteger(shape.visiblePixelCount) ||
			shape.visiblePixelCount < 0 ||
			!Number.isFinite(shape.coverageRatio) ||
			shape.coverageRatio < 0 ||
			shape.coverageRatio > 1 ||
			(shape.visiblePixelCount === 0) !== (shape.bounds === null)
		) {
			throw new Error(`Sticker ${label} alpha-shape evidence is inconsistent.`);
		}
		if (shape.bounds) {
			const { height, maxX, maxY, minX, minY, width } = shape.bounds;
			if (
				![height, maxX, maxY, minX, minY, width].every(
					(value) => Number.isSafeInteger(value) && value >= 0
				) ||
				width <= 0 ||
				height <= 0 ||
				width !== maxX - minX + 1 ||
				height !== maxY - minY + 1
			) {
				throw new Error(`Sticker ${label} alpha bounds are inconsistent.`);
			}
		}
	}
	if (
		comparison.source.visiblePixelCount <= 0 ||
		!Number.isFinite(comparison.alphaMae) ||
		comparison.alphaMae < 0 ||
		comparison.alphaMae > 255 ||
		!Number.isFinite(comparison.visiblePixelRelativeDelta) ||
		comparison.visiblePixelRelativeDelta < 0 ||
		(comparison.boundsMaxDeltaPixels !== null &&
			(!Number.isSafeInteger(comparison.boundsMaxDeltaPixels) ||
				comparison.boundsMaxDeltaPixels < 0))
	) {
		throw new Error("Sticker alpha comparison metrics are inconsistent.");
	}
	validateRgbErrorMetrics({
		expectedPixelCount: comparison.source.visiblePixelCount,
		label: "Sticker visible pixels",
		metrics: comparison.visibleRgb.metrics,
	});
	const expectedVisibleRgbPass =
		comparison.visibleRgb.metrics.rmse <= thresholds.visibleRgbRmse;
	if (comparison.visibleRgb.pass !== expectedVisibleRgbPass) {
		throw new Error("Sticker visible RGB result is inconsistent.");
	}
	const expectedPass =
		comparison.dimensionsMatch &&
		comparison.boundsMaxDeltaPixels !== null &&
		comparison.boundsMaxDeltaPixels <=
			comparison.thresholds.boundsDeltaPixels &&
		comparison.visiblePixelRelativeDelta <=
			comparison.thresholds.visiblePixelRelativeDelta &&
		comparison.alphaMae <= comparison.thresholds.alphaMae &&
		comparison.visibleRgb.pass;
	if (comparison.pass !== expectedPass) {
		throw new Error("Sticker reopened-asset comparison is inconsistent.");
	}
}

function validateLutMaskComparison({
	comparison,
}: {
	comparison: LutMaskProbeComparison;
}): void {
	if (
		comparison.rmseThreshold !== VISUAL_ORACLE_RMSE_THRESHOLD ||
		![
			comparison.candidateGeometry.width,
			comparison.candidateGeometry.height,
			comparison.expectedGeometry.width,
			comparison.expectedGeometry.height,
		].every((value) => Number.isSafeInteger(value) && value > 0) ||
		comparison.dimensionsMatch !==
			(comparison.candidateGeometry.width ===
				comparison.expectedGeometry.width &&
				comparison.candidateGeometry.height ===
					comparison.expectedGeometry.height) ||
		comparison.expectedGeometry.width !== CAPCUT_E2E_FIXTURE_SPEC.width ||
		comparison.expectedGeometry.height !== CAPCUT_E2E_FIXTURE_SPEC.height ||
		comparison.probes.length !== LUT_MASK_PROBES.length
	) {
		throw new Error("LUT/mask probe comparison is inconsistent.");
	}
	for (const [index, probe] of comparison.probes.entries()) {
		const definition = LUT_MASK_PROBES[index];
		if (!definition) {
			throw new Error("LUT/mask probe definition is missing.");
		}
		const expectedPixel = {
			x: Math.round(definition.x * (comparison.expectedGeometry.width - 1)),
			y: Math.round(definition.y * (comparison.expectedGeometry.height - 1)),
		};
		const expectedRule =
			definition.region === "inside"
				? "inside-rgb-rmse"
				: "outside-transparent-or-black";
		const rgbaValues = [...probe.candidateRgba, ...probe.expectedRgba];
		if (
			probe.candidateRgba.length !== 4 ||
			probe.expectedRgba.length !== 4 ||
			rgbaValues.some(
				(value) => !Number.isSafeInteger(value) || value < 0 || value > 255
			) ||
			probe.id !== definition.id ||
			probe.region !== definition.region ||
			probe.rule !== expectedRule ||
			probe.pixel.x !== expectedPixel.x ||
			probe.pixel.y !== expectedPixel.y
		) {
			throw new Error(`LUT/mask probe ${definition.id} is inconsistent.`);
		}
		if (definition.region === "inside") {
			if (!probe.rgbMetrics) {
				throw new Error(`LUT/mask probe ${definition.id} lacks RGB metrics.`);
			}
			validateRgbErrorMetrics({
				expectedPixelCount: 1,
				label: `LUT/mask probe ${definition.id}`,
				metrics: probe.rgbMetrics,
			});
			const expectedPass =
				probe.expectedRgba[3] > 0 &&
				probe.candidateRgba[3] > 0 &&
				probe.rgbMetrics.rmse <= comparison.rmseThreshold;
			if (probe.pass !== expectedPass) {
				throw new Error(`LUT/mask probe ${definition.id} pass is forged.`);
			}
			continue;
		}
		if (probe.rgbMetrics !== null) {
			throw new Error(
				`LUT/mask outside probe ${definition.id} must not have RGB metrics.`
			);
		}
		const candidateIsTransparent =
			probe.candidateRgba[3] <= comparison.rmseThreshold;
		const candidateIsBlack =
			Math.max(...probe.candidateRgba.slice(0, 3)) <= comparison.rmseThreshold;
		const expectedPass =
			probe.expectedRgba[3] === 0 &&
			(candidateIsTransparent || candidateIsBlack);
		if (probe.pass !== expectedPass) {
			throw new Error(`LUT/mask probe ${definition.id} pass is forged.`);
		}
	}
	if (
		comparison.pass !==
		(comparison.dimensionsMatch && comparison.probes.every(({ pass }) => pass))
	) {
		throw new Error("LUT/mask aggregate pass is inconsistent.");
	}
}

export function validateVisualOracleManifest({
	manifest,
}: {
	manifest: VisualOracleManifest;
}): void {
	if (manifest.schemaVersion !== VISUAL_ORACLE_SCHEMA_VERSION) {
		throw new Error(
			`Unsupported visual oracle schema ${manifest.schemaVersion}.`
		);
	}
	if (
		manifest.dissolve.rmseThreshold !== VISUAL_ORACLE_RMSE_THRESHOLD ||
		manifest.dissolve.mixSpace !== "encoded-rgb-0-255-linear-weight" ||
		manifest.toolchain.ffmpeg.version !== "8.1.2" ||
		manifest.toolchain.ffprobe.version !== "8.1.2"
	) {
		throw new Error(
			"Visual oracle uses an unsupported metric or toolchain contract."
		);
	}
	for (const [label, evidence] of Object.entries(manifest.source)) {
		validateFileEvidence({ evidence, label: `Source ${label}` });
	}
	validateFileEvidence({
		evidence: manifest.sticker.source,
		label: "Sticker source",
	});
	validateDissolveFramePlan({ framePlan: manifest.dissolve.framePlan });
	const calibration = manifest.dissolve.sourceFrameCalibration;
	const {
		evidence: calibrationPixelEvidence,
		fixtureSchemaVersion,
		reason,
		status,
		...calibrationEvidence
	} = calibration;
	const calibrationHashes = [
		calibrationPixelEvidence.clipARoiSha256,
		calibrationPixelEvidence.clipBRoiSha256,
		...calibrationPixelEvidence.ordinalStripSha256,
	];
	if (
		fixtureSchemaVersion !== 2 ||
		status !== "verified" ||
		!isDeepStrictEqual(
			calibrationEvidence,
			CAPCUT_E2E_FIXTURE_SPEC.sourceFrameCalibration
		) ||
		calibrationHashes.some((sha256) => !/^[a-f0-9]{64}$/.test(sha256)) ||
		calibrationPixelEvidence.clipARoiSha256 ===
			calibrationPixelEvidence.clipBRoiSha256 ||
		calibrationPixelEvidence.ordinalStripSha256[0] ===
			calibrationPixelEvidence.ordinalStripSha256[1] ||
		reason.length === 0
	) {
		throw new Error("Fixture v2 source-frame calibration is inconsistent.");
	}
	if (manifest.dissolve.samples.length !== 5) {
		throw new Error("Dissolve oracle must contain exactly five samples.");
	}
	for (const [index, sample] of manifest.dissolve.samples.entries()) {
		const planned = manifest.dissolve.framePlan.samples[index];
		if (
			!planned ||
			sample.frameOffset !== planned.frameOffset ||
			sample.nominalProgress !== planned.nominalProgress ||
			sample.realizedProgress !== planned.realizedProgress ||
			sample.timelineFrameIndex !== planned.timelineFrameIndex ||
			sample.timelineFrameNumber !== planned.timelineFrameNumber ||
			sample.transitionFrameNumber !== planned.transitionFrameNumber
		) {
			throw new Error(
				`Dissolve sample ${index} does not match its frame plan.`
			);
		}
		validateFileEvidence({
			evidence: sample.expected,
			label: `Dissolve expected ${sample.id}`,
		});
		if (sample.comparison) {
			validateRgbComparison({
				comparison: sample.comparison,
				comparisonRoi: calibration.comparisonRoi,
				label: `Dissolve sample ${sample.id}`,
			});
		}
		validateCaptureStatus({
			capture: sample.capture,
			comparisonPass: sample.comparison?.pass ?? null,
			label: `Dissolve sample ${sample.id}`,
			status: sample.status,
		});
	}
	if (manifest.sticker.comparison) {
		validateStickerComparison({ comparison: manifest.sticker.comparison });
	}
	validateCaptureStatus({
		capture: manifest.sticker.reopenedAsset,
		comparisonPass: manifest.sticker.comparison?.pass ?? null,
		label: "Sticker reopened asset",
		status: manifest.sticker.status,
	});
	if (manifest.lutMask.comparison) {
		validateLutMaskComparison({ comparison: manifest.lutMask.comparison });
	}
	validateCaptureStatus({
		capture: manifest.lutMask.capture,
		comparisonPass: manifest.lutMask.comparison?.pass ?? null,
		label: "LUT/mask capture",
		status: manifest.lutMask.status,
	});
	validateFileEvidence({
		evidence: manifest.lutMask.expected,
		label: "LUT/mask expected",
	});
	const expectedDissolveStatus = deriveOverallVisualStatus({
		statuses: [
			...manifest.dissolve.samples.map(({ status }) => status),
			manifest.dissolve.framePlan.intervalStatus,
			manifest.dissolve.sourceFrameCalibration.status,
		],
	});
	const expectedOverall = deriveOverallVisualStatus({
		statuses: [
			expectedDissolveStatus,
			manifest.sticker.status,
			manifest.lutMask.status,
		],
	});
	if (
		manifest.dissolve.status !== expectedDissolveStatus ||
		manifest.overallStatus !== expectedOverall
	) {
		throw new Error("Visual oracle aggregate status is inconsistent.");
	}
}
