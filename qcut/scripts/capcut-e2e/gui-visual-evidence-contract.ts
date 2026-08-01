import type {
	VisualCaptureEvidence,
	VisualFileEvidence,
	VisualVerificationStatus,
} from "./visual-contract.js";

export const CAPCUT_GUI_VISUAL_CAPTURE_SCHEMA =
	"qcut.capcut-e2e.gui-visual-capture-manifest" as const;
export const CAPCUT_GUI_VISUAL_CAPTURE_SCHEMA_VERSION = 1 as const;
export const CAPCUT_NATIVE_CJK_REVIEW_SCHEMA =
	"qcut.capcut-e2e.native-cjk-review-receipt" as const;
export const CAPCUT_NATIVE_CJK_REVIEW_SCHEMA_VERSION = 1 as const;
export const CAPCUT_GUI_VISUAL_VERIFICATION_SCHEMA =
	"qcut.capcut-e2e.gui-visual-verification-manifest" as const;
export const CAPCUT_GUI_VISUAL_VERIFICATION_SCHEMA_VERSION = 1 as const;
export const CAPCUT_GUI_VISUAL_EXTRACTION_SCHEMA =
	"qcut.capcut-e2e.gui-visual-extraction-manifest" as const;
export const CAPCUT_GUI_VISUAL_EXTRACTION_SCHEMA_VERSION = 1 as const;

export const CAPCUT_NATIVE_CJK_TARGETS = ["title", "caption"] as const;
export type CapCutNativeCjkTarget = (typeof CAPCUT_NATIVE_CJK_TARGETS)[number];

export const CAPCUT_NATIVE_CJK_PHASES = [
	"first-open",
	"reopen",
	"export",
] as const;
export type CapCutNativeCjkPhase = (typeof CAPCUT_NATIVE_CJK_PHASES)[number];

export const CAPCUT_NATIVE_CJK_EXPECTED_TEXT = Object.freeze({
	caption: "原生字幕验证 ABC123",
	title: "剪映真实导入测试 ABC123",
}) satisfies Readonly<Record<CapCutNativeCjkTarget, string>>;

export const CAPCUT_GUI_VISUAL_CHECK_IDS = [
	"native-title-cjk-visible",
	"native-caption-cjk-visible",
	"transparent-sticker-reopen",
	"native-elements-export",
	"dissolve-pre-frame",
	"dissolve-mid-frame",
	"dissolve-post-frame",
	"dissolve-reopen",
	"dissolve-export",
	"ellipse-mask-visible",
	"invert-lut-visible",
	"lut-mask-reopen",
	"lut-mask-export",
] as const;
export type CapCutGuiVisualCheckId =
	(typeof CAPCUT_GUI_VISUAL_CHECK_IDS)[number];

export interface CapCutGuiNativeTextEvidence {
	caption: Record<CapCutNativeCjkPhase, VisualFileEvidence>;
	title: Record<CapCutNativeCjkPhase, VisualFileEvidence>;
}

export interface CapCutGuiVisualCaptureManifest {
	capturesDirectory: string;
	createdAt: string;
	evidenceDirectory: string;
	exports: {
		dissolve: VisualFileEvidence;
		lutMask: VisualFileEvidence;
		nativeTextSticker: VisualFileEvidence;
	};
	extractionManifest: VisualFileEvidence;
	guiExecutionResult: VisualFileEvidence;
	guiPlan: VisualFileEvidence;
	nativeText: CapCutGuiNativeTextEvidence;
	oracleCaptures: {
		dissolve: readonly {
			capture: VisualCaptureEvidence;
			id: string;
		}[];
		lutMask: VisualCaptureEvidence;
		sticker: VisualCaptureEvidence;
	};
	ownerUid: number;
	runId: string;
	schema: typeof CAPCUT_GUI_VISUAL_CAPTURE_SCHEMA;
	schemaVersion: typeof CAPCUT_GUI_VISUAL_CAPTURE_SCHEMA_VERSION;
	visualOracle: VisualFileEvidence;
}

export interface CapCutNativeCjkReviewPhaseObservation {
	evidence: VisualFileEvidence;
	fullPreviewFrameVisible: boolean;
	glyphsFullyRendered: boolean;
	phase: CapCutNativeCjkPhase;
	renderedTextExactly: boolean;
	tofuAbsent: boolean;
}

export interface CapCutGuiVisualExtractionFrame {
	caseId: "native-text-sticker" | "dissolve" | "lut-mask";
	command: {
		args: readonly string[];
		contract: "ffmpeg-select-zero-based-frame-v1";
		crop: null;
		filter: string;
	};
	frameRate: { denominator: 1; numerator: 30 };
	id: string;
	output: VisualFileEvidence;
	sourceExport: VisualFileEvidence;
	timestamp: {
		microsecondsRounded: number;
		rational: string;
	};
	zeroBasedFrameIndex: number;
}

export interface CapCutGuiVisualToolReport {
	banner: string;
	binary: VisualFileEvidence;
	path: string;
	version: "8.1.2";
}

export interface CapCutGuiVisualExportProbe {
	caseId: "native-text-sticker" | "dissolve" | "lut-mask";
	command: {
		args: readonly string[];
		contract: "ffprobe-cfr-30-frames-v1";
	};
	durationTicks: readonly string[];
	frameCount: number;
	frameRate: { denominator: 1; numerator: 30 };
	sourceExport: VisualFileEvidence;
	timestampTicks: readonly string[];
	timeBase: string;
}

export interface CapCutGuiVisualExtractionManifest {
	capturesDirectory: string;
	createdAt: string;
	exportProbes: readonly CapCutGuiVisualExportProbe[];
	frames: readonly CapCutGuiVisualExtractionFrame[];
	guiExecutionResult: VisualFileEvidence;
	guiPlan: VisualFileEvidence;
	ownerUid: number;
	runId: string;
	schema: typeof CAPCUT_GUI_VISUAL_EXTRACTION_SCHEMA;
	schemaVersion: typeof CAPCUT_GUI_VISUAL_EXTRACTION_SCHEMA_VERSION;
	toolchain: {
		ffmpeg: CapCutGuiVisualToolReport;
		ffprobe: CapCutGuiVisualToolReport;
	};
}

export interface CapCutNativeCjkReviewTargetObservation {
	expectedText: string;
	phases: readonly CapCutNativeCjkReviewPhaseObservation[];
	target: CapCutNativeCjkTarget;
}

export interface CapCutNativeCjkReviewReceipt {
	captureManifest: VisualFileEvidence;
	observations: readonly CapCutNativeCjkReviewTargetObservation[];
	reviewedAt: string;
	reviewer: {
		identity: string;
		method: "human-visual-inspection";
	};
	runId: string;
	schema: typeof CAPCUT_NATIVE_CJK_REVIEW_SCHEMA;
	schemaVersion: typeof CAPCUT_NATIVE_CJK_REVIEW_SCHEMA_VERSION;
}

export interface CapCutGuiVisualVerificationCheck {
	id: CapCutGuiVisualCheckId;
	provenance: "manual-native-cjk-review" | "not-yet-proven" | "visual-oracle";
	reason: string;
	status: VisualVerificationStatus;
}

export interface CapCutGuiVisualVerificationManifest {
	checks: readonly CapCutGuiVisualVerificationCheck[];
	completedAt: string;
	inputs: {
		captureManifest: VisualFileEvidence;
		nativeCjkReviewReceipt: VisualFileEvidence | null;
		visualOracle: VisualFileEvidence;
	};
	overallStatus: VisualVerificationStatus;
	runId: string;
	schema: typeof CAPCUT_GUI_VISUAL_VERIFICATION_SCHEMA;
	schemaVersion: typeof CAPCUT_GUI_VISUAL_VERIFICATION_SCHEMA_VERSION;
	verifiedCheckIds: readonly CapCutGuiVisualCheckId[];
}
