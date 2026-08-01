import type { StickerAlphaComparison } from "./visual-alpha.js";
import {
	validateCaptureStatus,
	validateDissolveFramePlan,
	validateFileEvidence,
	validateLutMaskComparison,
	validateRgbComparison,
	validateSourceFrameCalibration,
	validateStickerComparison,
} from "./visual-contract-validation.js";
import type { DissolveFramePlan } from "./visual-frame-plan.js";
import type { RgbImageComparison } from "./visual-ffmpeg.js";
import type { LutMaskProbeComparison } from "./visual-lut-mask.js";
import type { CapCutE2eSourceFrameCalibrationReport } from "./manifest.js";

type VerificationStatus = "failed" | "unverified" | "verified";

interface FileEvidenceShape {
	bytes: number;
	path: string;
	sha256: string;
}

type CaptureEvidenceShape =
	| { exists: false; path: string }
	| ({ exists: true } & FileEvidenceShape);

interface DissolveSampleShape {
	capture: CaptureEvidenceShape;
	comparison: RgbImageComparison | null;
	expected: FileEvidenceShape;
	frameOffset: number;
	id: string;
	nominalProgress: number;
	realizedProgress: number;
	status: VerificationStatus;
	timelineFrameIndex: number;
	timelineFrameNumber: number;
	transitionFrameNumber: number;
}

interface ManifestValidationShape {
	dissolve: {
		framePlan: DissolveFramePlan;
		mixSpace: string;
		rmseThreshold: number;
		samples: DissolveSampleShape[];
		sourceFrameCalibration: CapCutE2eSourceFrameCalibrationReport & {
			fixtureSchemaVersion: number;
			reason: string;
			status: "verified";
		};
		status: VerificationStatus;
	};
	lutMask: {
		capture: CaptureEvidenceShape;
		comparison: LutMaskProbeComparison | null;
		expected: FileEvidenceShape;
		status: VerificationStatus;
	};
	overallStatus: VerificationStatus;
	schemaVersion: number;
	source: {
		bundleManifest: FileEvidenceShape;
		fixtureManifest: FileEvidenceShape;
		frameA: FileEvidenceShape;
		frameB: FileEvidenceShape;
	};
	sticker: {
		comparison: StickerAlphaComparison | null;
		reopenedAsset: CaptureEvidenceShape;
		source: FileEvidenceShape;
		status: VerificationStatus;
	};
	toolchain: {
		ffmpeg: { version: string };
		ffprobe: { version: string };
	};
}

interface ManifestValidationDependencies {
	deriveOverallStatus: ({
		statuses,
	}: {
		statuses: readonly VerificationStatus[];
	}) => VerificationStatus;
	deriveStatus: ({
		pass,
		present,
	}: {
		pass: boolean | null;
		present: boolean;
	}) => VerificationStatus;
	rmseThreshold: number;
	schemaVersion: number;
}

export function validateVisualOracleManifestValue({
	dependencies,
	manifest,
}: {
	dependencies: ManifestValidationDependencies;
	manifest: ManifestValidationShape;
}): void {
	const { deriveOverallStatus, deriveStatus, rmseThreshold, schemaVersion } =
		dependencies;
	if (manifest.schemaVersion !== schemaVersion) {
		throw new Error(
			`Unsupported visual oracle schema ${manifest.schemaVersion}.`
		);
	}
	if (
		manifest.dissolve.rmseThreshold !== rmseThreshold ||
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
	validateSourceFrameCalibration({ calibration });
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
				rmseThreshold,
			});
		}
		validateCaptureStatus({
			capture: sample.capture,
			comparisonPass: sample.comparison?.pass ?? null,
			deriveStatus,
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
		deriveStatus,
		label: "Sticker reopened asset",
		status: manifest.sticker.status,
	});
	if (manifest.lutMask.comparison) {
		validateLutMaskComparison({
			comparison: manifest.lutMask.comparison,
			rmseThreshold,
		});
	}
	validateCaptureStatus({
		capture: manifest.lutMask.capture,
		comparisonPass: manifest.lutMask.comparison?.pass ?? null,
		deriveStatus,
		label: "LUT/mask capture",
		status: manifest.lutMask.status,
	});
	validateFileEvidence({
		evidence: manifest.lutMask.expected,
		label: "LUT/mask expected",
	});
	const expectedDissolveStatus = deriveOverallStatus({
		statuses: [
			...manifest.dissolve.samples.map(({ status }) => status),
			manifest.dissolve.framePlan.intervalStatus,
			manifest.dissolve.sourceFrameCalibration.status,
		],
	});
	const expectedOverall = deriveOverallStatus({
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
