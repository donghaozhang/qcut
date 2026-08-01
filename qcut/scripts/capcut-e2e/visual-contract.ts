import type { StickerAlphaComparison } from "./visual-alpha.js";
import { validateVisualOracleManifestValue } from "./visual-contract-manifest-validation.js";
import type { DissolveFramePlan } from "./visual-frame-plan.js";
import type { RgbImageComparison } from "./visual-ffmpeg.js";
import type { LutMaskProbeComparison } from "./visual-lut-mask.js";
import type { CapCutE2eSourceFrameCalibrationReport } from "./manifest.js";

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

export function validateVisualOracleManifest({
	manifest,
}: {
	manifest: VisualOracleManifest;
}): void {
	validateVisualOracleManifestValue({
		dependencies: {
			deriveOverallStatus: deriveOverallVisualStatus,
			deriveStatus: deriveVerificationStatus,
			rmseThreshold: VISUAL_ORACLE_RMSE_THRESHOLD,
			schemaVersion: VISUAL_ORACLE_SCHEMA_VERSION,
		},
		manifest,
	});
}
