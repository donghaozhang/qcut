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

interface FileEvidenceShape {
	bytes: number;
	path: string;
	sha256: string;
}

type CaptureEvidenceShape =
	| { exists: false; path: string }
	| ({ exists: true } & FileEvidenceShape);

type VerificationStatus = "failed" | "unverified" | "verified";

export function validateFileEvidence({
	evidence,
	label,
}: {
	evidence: FileEvidenceShape;
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

export function validateRgbComparison({
	comparison,
	comparisonRoi,
	label,
	rmseThreshold,
}: {
	comparison: RgbImageComparison;
	comparisonRoi: CapCutE2eSourceFrameCalibrationReport["comparisonRoi"];
	label: string;
	rmseThreshold: number;
}): void {
	if (comparison.rmseThreshold !== rmseThreshold) {
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

export function validateCaptureStatus({
	capture,
	comparisonPass,
	deriveStatus,
	label,
	status,
}: {
	capture: CaptureEvidenceShape;
	comparisonPass: boolean | null;
	deriveStatus: ({
		pass,
		present,
	}: {
		pass: boolean | null;
		present: boolean;
	}) => VerificationStatus;
	label: string;
	status: VerificationStatus;
}): void {
	if (capture.exists) validateFileEvidence({ evidence: capture, label });
	if (capture.exists !== (comparisonPass !== null)) {
		throw new Error(
			`${label} must have a comparison if and only if its observed file exists.`
		);
	}
	const expectedStatus = deriveStatus({
		pass: comparisonPass,
		present: capture.exists,
	});
	if (status !== expectedStatus) {
		throw new Error(
			`${label} status must be ${expectedStatus}; received ${status}.`
		);
	}
}

export function validateDissolveFramePlan({
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

export function validateSourceFrameCalibration({
	calibration,
}: {
	calibration: CapCutE2eSourceFrameCalibrationReport & {
		fixtureSchemaVersion: number;
		reason: string;
		status: VerificationStatus;
	};
}): void {
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
}

export function validateStickerComparison({
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

export function validateLutMaskComparison({
	comparison,
	rmseThreshold,
}: {
	comparison: LutMaskProbeComparison;
	rmseThreshold: number;
}): void {
	if (
		comparison.rmseThreshold !== rmseThreshold ||
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
