import type { AudioComparisonManifest } from "./audio-comparison.js";
import type { FrameComparisonManifest } from "./frame-comparison.js";
import type { FrameSamplePlan } from "./frame-sample-plan.js";
import type { PreviewFrameComparisonManifest } from "./preview-frame-comparison.js";
import type { QCutImportVerificationManifest } from "./qcut-import-verification-contract.js";
import type { SemanticDiffCaseManifest } from "./semantic-diff.js";

export const ROUNDTRIP_CASE_MANIFEST_SCHEMA = "qcut.capcut-e2e.roundtrip-case";
export const ROUNDTRIP_CASE_MANIFEST_FILE_NAME = "roundtrip-case-manifest.json";

export type RoundtripCaseVerdict =
	| "pass"
	| "fail"
	| "not-comparable"
	| "unverified";

export type RoundtripCaseGateStatus =
	| "pass"
	| "fail"
	| "not-comparable"
	| "unverified";

export interface RoundtripCaseGate {
	id:
		| "semantic"
		| "qcut-import"
		| "native-frames"
		| "preview-frames"
		| "audio"
		| "native-frame-thresholds"
		| "preview-frame-thresholds"
		| "audio-thresholds"
		| "keyframe-samples"
		| "transition-window-samples"
		| "provenance";
	reason: string;
	status: RoundtripCaseGateStatus;
}

export interface RoundtripCaseProvenance {
	evidenceStatus: "candidate-unverified" | "verified";
	id: string;
	receiptSha256?: string;
}

export const UNBOUND_ROUNDTRIP_CASE_PROVENANCE = Object.freeze({
	evidenceStatus: "candidate-unverified" as const,
	id: "unbound-local-evidence-v1",
});

export interface RoundtripCaseEvidence {
	audio: AudioComparisonManifest;
	nativeFrames?: FrameComparisonManifest;
	previewFrames?: PreviewFrameComparisonManifest;
	qcutImport: QCutImportVerificationManifest;
	semantic: SemanticDiffCaseManifest;
}

export interface RoundtripCaseManifest {
	caseId: string;
	evidence: RoundtripCaseEvidence;
	generatedAtIso: string;
	gates: RoundtripCaseGate[];
	provenance: RoundtripCaseProvenance;
	roles: {
		audio: { left: "reference"; right: "qcut" };
		nativeFrames: { left: "reference"; right: "qcut" };
		previewFrames: { left: "reference"; right: "qcut" };
		qcutImport: { expected: "import-bundle"; actual: "qcut-renderer-snapshot" };
		semantic: { left: "source-draft"; right: "roundtrip-draft" };
	};
	samplePlan?: FrameSamplePlan;
	schema: typeof ROUNDTRIP_CASE_MANIFEST_SCHEMA;
	schemaVersion: 2;
	verdict: RoundtripCaseVerdict;
}

function comparisonGate({
	id,
	label,
	verdict,
}: {
	id: "native-frames" | "preview-frames" | "audio";
	label: string;
	verdict: "pass" | "fail" | "not-comparable" | undefined;
}): RoundtripCaseGate {
	if (verdict === "pass") {
		return { id, reason: `${label} passed.`, status: "pass" };
	}
	if (verdict === "fail") {
		return { id, reason: `${label} failed.`, status: "fail" };
	}
	return {
		id,
		reason:
			verdict === "not-comparable"
				? `${label} is not comparable.`
				: `${label} did not run.`,
		status: "not-comparable",
	};
}

function thresholdGate({
	evidenceStatus,
	id,
	label,
}: {
	evidenceStatus: "candidate-unverified" | "verified" | undefined;
	id:
		| "native-frame-thresholds"
		| "preview-frame-thresholds"
		| "audio-thresholds";
	label: string;
}): RoundtripCaseGate {
	if (evidenceStatus === "verified") {
		return { id, reason: `${label} are verified.`, status: "pass" };
	}
	if (evidenceStatus === "candidate-unverified") {
		return {
			id,
			reason: `${label} are candidate-unverified.`,
			status: "unverified",
		};
	}
	return {
		id,
		reason: `${label} are unavailable.`,
		status: "not-comparable",
	};
}

function semanticGate({
	verdict,
}: {
	verdict: SemanticDiffCaseManifest["verdict"];
}): RoundtripCaseGate {
	if (verdict === "identical" || verdict === "tolerable") {
		return {
			id: "semantic",
			reason: `Semantic comparison is ${verdict}.`,
			status: "pass",
		};
	}
	return {
		id: "semantic",
		reason:
			verdict === "breaking"
				? "Semantic comparison contains breaking differences."
				: "Semantic comparison is not comparable.",
		status: verdict === "breaking" ? "fail" : "not-comparable",
	};
}

function qcutImportGate({
	verdict,
}: {
	verdict: QCutImportVerificationManifest["verdict"];
}): RoundtripCaseGate {
	if (verdict === "pass") {
		return {
			id: "qcut-import",
			reason: "QCut import materialization passed.",
			status: "pass",
		};
	}
	if (verdict === "fail") {
		return {
			id: "qcut-import",
			reason: "QCut import materialization failed.",
			status: "fail",
		};
	}
	return {
		id: "qcut-import",
		reason: "QCut import materialization is not comparable.",
		status: "not-comparable",
	};
}

function sampleCoverageGates({
	plan,
}: {
	plan?: FrameSamplePlan;
}): RoundtripCaseGate[] {
	if (!plan) {
		return [
			{
				id: "keyframe-samples",
				reason: "A frame sample plan is unavailable.",
				status: "not-comparable",
			},
			{
				id: "transition-window-samples",
				reason: "A frame sample plan is unavailable.",
				status: "not-comparable",
			},
		];
	}
	return [
		{
			id: "keyframe-samples",
			reason:
				plan.coverage.keyframes === "verified"
					? "Keyframe sample coverage is verified."
					: "Keyframe samples are unsupported by interop v1.",
			status: plan.coverage.keyframes === "verified" ? "pass" : "unverified",
		},
		{
			id: "transition-window-samples",
			reason:
				plan.coverage.transitionInterval === "verified"
					? "Transition-window sample coverage is verified."
					: "Transition windows use semantic seam candidates.",
			status:
				plan.coverage.transitionInterval === "verified" ? "pass" : "unverified",
		},
	];
}

function provenanceGate({
	provenance,
}: {
	provenance: RoundtripCaseProvenance;
}): RoundtripCaseGate {
	return provenance.evidenceStatus === "verified"
		? {
				id: "provenance",
				reason:
					"Application, resource, and export-setting provenance is verified.",
				status: "pass",
			}
		: {
				id: "provenance",
				reason:
					"Application, resource, and export-setting provenance is not yet verified.",
				status: "unverified",
			};
}

export function validateRoundtripCaseProvenance({
	provenance,
}: {
	provenance: RoundtripCaseProvenance;
}): void {
	if (!/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(provenance.id)) {
		throw new Error("Round-trip provenance ID is invalid.");
	}
	if (
		provenance.receiptSha256 !== undefined &&
		!/^[a-f0-9]{64}$/.test(provenance.receiptSha256)
	) {
		throw new Error("Round-trip provenance receipt SHA-256 is invalid.");
	}
	if (
		provenance.evidenceStatus === "verified" &&
		provenance.receiptSha256 === undefined
	) {
		throw new Error(
			"Verified round-trip provenance requires a receipt SHA-256."
		);
	}
}

export function assessRoundtripCase({
	evidence,
	provenance,
	samplePlan,
}: {
	evidence: RoundtripCaseEvidence;
	provenance: RoundtripCaseProvenance;
	samplePlan?: FrameSamplePlan;
}): { gates: RoundtripCaseGate[]; verdict: RoundtripCaseVerdict } {
	validateRoundtripCaseProvenance({ provenance });
	const gates = [
		semanticGate({ verdict: evidence.semantic.verdict }),
		qcutImportGate({ verdict: evidence.qcutImport.verdict }),
		comparisonGate({
			id: "native-frames",
			label: "Native frame comparison",
			verdict: evidence.nativeFrames?.verdict,
		}),
		comparisonGate({
			id: "preview-frames",
			label: "Preview frame comparison",
			verdict: evidence.previewFrames?.verdict,
		}),
		comparisonGate({
			id: "audio",
			label: "Audio comparison",
			verdict: evidence.audio.verdict,
		}),
		thresholdGate({
			evidenceStatus: evidence.nativeFrames?.thresholds.evidenceStatus,
			id: "native-frame-thresholds",
			label: "Native frame thresholds",
		}),
		thresholdGate({
			evidenceStatus: evidence.previewFrames?.thresholds.evidenceStatus,
			id: "preview-frame-thresholds",
			label: "Preview frame thresholds",
		}),
		thresholdGate({
			evidenceStatus: evidence.audio.thresholds.evidenceStatus,
			id: "audio-thresholds",
			label: "Audio thresholds",
		}),
		...sampleCoverageGates({ plan: samplePlan }),
		provenanceGate({ provenance }),
	];
	const statuses = new Set(gates.map(({ status }) => status));
	const verdict: RoundtripCaseVerdict = statuses.has("fail")
		? "fail"
		: statuses.has("not-comparable")
			? "not-comparable"
			: statuses.has("unverified")
				? "unverified"
				: "pass";
	return { gates, verdict };
}
