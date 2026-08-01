import {
	CAPCUT_NATIVE_CJK_EXPECTED_TEXT,
	CAPCUT_NATIVE_CJK_PHASES,
	CAPCUT_NATIVE_CJK_REVIEW_SCHEMA,
	CAPCUT_NATIVE_CJK_REVIEW_SCHEMA_VERSION,
	CAPCUT_NATIVE_CJK_TARGETS,
	type CapCutGuiVisualCaptureManifest,
	type CapCutNativeCjkReviewReceipt,
} from "../capcut-e2e/gui-visual-evidence-contract.js";
import type { VisualFileEvidence } from "../capcut-e2e/visual-contract.js";

export function buildNativeCjkReviewReceipt({
	captureManifest,
	captureManifestEvidence,
	tofuAbsent = true,
}: {
	captureManifest: CapCutGuiVisualCaptureManifest;
	captureManifestEvidence: VisualFileEvidence;
	tofuAbsent?: boolean;
}): CapCutNativeCjkReviewReceipt {
	return {
		captureManifest: captureManifestEvidence,
		observations: CAPCUT_NATIVE_CJK_TARGETS.map((target) => ({
			expectedText: CAPCUT_NATIVE_CJK_EXPECTED_TEXT[target],
			phases: CAPCUT_NATIVE_CJK_PHASES.map((phase, phaseIndex) => ({
				evidence: captureManifest.nativeText[target][phase],
				fullPreviewFrameVisible: true,
				glyphsFullyRendered: true,
				phase,
				renderedTextExactly: true,
				tofuAbsent: tofuAbsent || phaseIndex !== 0 || target !== "title",
			})),
			target,
		})),
		reviewedAt: "2026-08-01T00:03:00.000Z",
		reviewer: {
			identity: "Fixture Reviewer",
			method: "human-visual-inspection",
		},
		runId: captureManifest.runId,
		schema: CAPCUT_NATIVE_CJK_REVIEW_SCHEMA,
		schemaVersion: CAPCUT_NATIVE_CJK_REVIEW_SCHEMA_VERSION,
	};
}
