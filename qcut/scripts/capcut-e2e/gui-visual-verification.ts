import { isDeepStrictEqual } from "node:util";
import { join } from "node:path";
import { CAPCUT_GUI_CASE_EXPECTATIONS } from "./gui-regression-contract.js";
import { writeJsonEvidence } from "./gui-regression-evidence.js";
import {
	requireCanonicalPath,
	requireRecord,
} from "./gui-regression-filesystem.js";
import { loadCapCutNativeCjkReview } from "./gui-native-cjk-review.js";
import { loadCapCutGuiVisualCaptureManifest } from "./gui-visual-capture-manifest.js";
import {
	CAPCUT_GUI_VISUAL_VERIFICATION_SCHEMA,
	CAPCUT_GUI_VISUAL_VERIFICATION_SCHEMA_VERSION,
	CAPCUT_GUI_VISUAL_CHECK_IDS,
	type CapCutGuiVisualVerificationCheck,
	type CapCutGuiVisualVerificationManifest,
} from "./gui-visual-evidence-contract.js";
import {
	deriveOverallVisualStatus,
	type VisualOracleManifest,
	validateVisualOracleManifest,
} from "./visual-contract.js";
import { readVisualJsonFileSnapshot } from "./visual-files.js";

export const CAPCUT_GUI_VISUAL_VERIFICATION_FILE_NAME =
	"gui-visual-verification-manifest.json";

function requireCanonicalIsoTimestamp({
	label,
	value,
}: {
	label: string;
	value: string;
}) {
	const milliseconds = Date.parse(value);
	if (
		!Number.isFinite(milliseconds) ||
		new Date(milliseconds).toISOString() !== value
	) {
		throw new Error(`${label} must be a canonical ISO-8601 timestamp.`);
	}
}

export async function buildCapCutGuiVisualVerification({
	captureManifestPath,
	completedAt = new Date().toISOString(),
	nativeCjkReviewReceiptPath = null,
}: {
	captureManifestPath: string;
	completedAt?: string;
	nativeCjkReviewReceiptPath?: string | null;
}): Promise<CapCutGuiVisualVerificationManifest> {
	requireCanonicalIsoTimestamp({
		label: "Visual verification completedAt",
		value: completedAt,
	});
	const capture = await loadCapCutGuiVisualCaptureManifest({
		path: captureManifestPath,
	});
	await requireCanonicalPath({
		expectedKind: "file",
		label: "Visual oracle manifest",
		path: capture.manifest.visualOracle.path,
	});
	const oracleSnapshot = await readVisualJsonFileSnapshot({
		label: "Visual oracle manifest",
		path: capture.manifest.visualOracle.path,
	});
	if (
		!isDeepStrictEqual(oracleSnapshot.evidence, capture.manifest.visualOracle)
	) {
		throw new Error(
			"Visual oracle no longer matches the GUI capture manifest."
		);
	}
	const oracle = oracleSnapshot.value as VisualOracleManifest;
	validateVisualOracleManifest({ manifest: oracle });
	if (
		oracle.runId !== capture.manifest.runId ||
		oracle.capturesDirectory !== capture.manifest.capturesDirectory
	) {
		throw new Error("Visual oracle is not bound to the GUI capture manifest.");
	}
	const nativeReview = nativeCjkReviewReceiptPath
		? await loadCapCutNativeCjkReview({
				captureManifest: capture.manifest,
				captureManifestEvidence: capture.evidence,
				path: nativeCjkReviewReceiptPath,
			})
		: null;
	const expectedCheckIds = CAPCUT_GUI_CASE_EXPECTATIONS.flatMap(({ checks }) =>
		checks.map(({ id }) => id)
	);
	if (!isDeepStrictEqual(expectedCheckIds, CAPCUT_GUI_VISUAL_CHECK_IDS)) {
		throw new Error("GUI visual verification check coverage is inconsistent.");
	}
	const nativeExportPhaseStatuses = nativeReview
		? [
				nativeReview.phaseStatuses.title.export,
				nativeReview.phaseStatuses.caption.export,
			]
		: [];
	const nativeElementsExportStatus = nativeExportPhaseStatuses.includes(
		"failed"
	)
		? "failed"
		: "unverified";
	const stickerReopenStatus =
		oracle.sticker.status === "failed" ? "failed" : "unverified";
	const checks: CapCutGuiVisualVerificationCheck[] = [
		{
			id: "native-title-cjk-visible",
			provenance: "manual-native-cjk-review",
			reason:
				"Requires a hash-bound first-open full-preview review of the exact title text with no tofu glyphs.",
			status: nativeReview?.phaseStatuses.title["first-open"] ?? "unverified",
		},
		{
			id: "native-caption-cjk-visible",
			provenance: "manual-native-cjk-review",
			reason:
				"Requires a hash-bound first-open full-preview review of the exact caption text with no tofu glyphs.",
			status: nativeReview?.phaseStatuses.caption["first-open"] ?? "unverified",
		},
		{
			id: "transparent-sticker-reopen",
			provenance: "not-yet-proven",
			reason:
				"The asset oracle proves final icon.png alpha integrity only; a bound reopen full-preview appearance review is still required.",
			status: stickerReopenStatus,
		},
		{
			id: "native-elements-export",
			provenance: "not-yet-proven",
			reason:
				"Title and caption export review is insufficient until sticker appearance in the extracted export frame is also proven.",
			status: nativeElementsExportStatus,
		},
		{
			id: "dissolve-pre-frame",
			provenance: "not-yet-proven",
			reason:
				"Requires a phase-matched GUI preview oracle before the observed dissolve interval.",
			status: "unverified",
		},
		{
			id: "dissolve-mid-frame",
			provenance: "not-yet-proven",
			reason:
				"Requires a phase-matched GUI preview oracle inside the observed dissolve interval.",
			status: "unverified",
		},
		{
			id: "dissolve-post-frame",
			provenance: "not-yet-proven",
			reason:
				"Requires a phase-matched GUI preview oracle after the observed dissolve interval.",
			status: "unverified",
		},
		{
			id: "dissolve-reopen",
			provenance: "not-yet-proven",
			reason:
				"Requires a reopen-phase preview oracle bound to the GUI capture.",
			status: "unverified",
		},
		{
			id: "dissolve-export",
			provenance: "visual-oracle",
			reason:
				"Exact CFR export frames are bound, but verification requires a strictly parsed observed transition interval.",
			status: oracle.dissolve.status,
		},
		{
			id: "ellipse-mask-visible",
			provenance: "not-yet-proven",
			reason:
				"Requires a first-open GUI preview oracle for ellipse geometry and feathering.",
			status: "unverified",
		},
		{
			id: "invert-lut-visible",
			provenance: "not-yet-proven",
			reason:
				"Requires a first-open GUI preview oracle for the LUT inversion inside the mask.",
			status: "unverified",
		},
		{
			id: "lut-mask-reopen",
			provenance: "visual-oracle",
			reason:
				"The LUT/mask oracle is accepted only when its image is the exact GUI reopen capture evidence.",
			status: oracle.lutMask.status,
		},
		{
			id: "lut-mask-export",
			provenance: "not-yet-proven",
			reason:
				"A CFR export frame is extracted, but no LUT/mask visual comparison is bound to that export frame yet.",
			status: "unverified",
		},
	];
	return {
		checks,
		completedAt,
		inputs: {
			captureManifest: capture.evidence,
			nativeCjkReviewReceipt: nativeReview?.evidence ?? null,
			visualOracle: oracleSnapshot.evidence,
		},
		overallStatus: deriveOverallVisualStatus({
			statuses: checks.map(({ status }) => status),
		}),
		runId: capture.manifest.runId,
		schema: CAPCUT_GUI_VISUAL_VERIFICATION_SCHEMA,
		schemaVersion: CAPCUT_GUI_VISUAL_VERIFICATION_SCHEMA_VERSION,
		verifiedCheckIds: checks
			.filter(({ status }) => status === "verified")
			.map(({ id }) => id),
	};
}

export async function writeCapCutGuiVisualVerification({
	captureManifestPath,
	completedAt,
	nativeCjkReviewReceiptPath,
}: {
	captureManifestPath: string;
	completedAt?: string;
	nativeCjkReviewReceiptPath?: string | null;
}): Promise<{
	manifest: CapCutGuiVisualVerificationManifest;
	manifestPath: string;
}> {
	const manifest = await buildCapCutGuiVisualVerification({
		captureManifestPath,
		completedAt,
		nativeCjkReviewReceiptPath,
	});
	const loadedCapture = await loadCapCutGuiVisualCaptureManifest({
		path: captureManifestPath,
	});
	const manifestPath = join(
		loadedCapture.manifest.evidenceDirectory,
		CAPCUT_GUI_VISUAL_VERIFICATION_FILE_NAME
	);
	await writeJsonEvidence({ path: manifestPath, value: manifest });
	const loaded = await loadCapCutGuiVisualVerification({ path: manifestPath });
	return { manifest: loaded.manifest, manifestPath };
}

export async function loadCapCutGuiVisualVerification({
	path,
}: {
	path: string;
}) {
	const canonical = await requireCanonicalPath({
		expectedKind: "file",
		label: "GUI visual verification manifest",
		path,
	});
	const snapshot = await readVisualJsonFileSnapshot({
		label: "GUI visual verification manifest",
		path,
	});
	const record = requireRecord({
		label: "GUI visual verification manifest",
		value: snapshot.value,
	});
	if (
		record.schema !== CAPCUT_GUI_VISUAL_VERIFICATION_SCHEMA ||
		record.schemaVersion !== CAPCUT_GUI_VISUAL_VERIFICATION_SCHEMA_VERSION
	) {
		throw new Error("GUI visual verification manifest schema is unsupported.");
	}
	const manifest = record as unknown as CapCutGuiVisualVerificationManifest;
	const inputs = requireRecord({
		label: "GUI visual verification inputs",
		value: manifest.inputs,
	});
	const captureReference = requireRecord({
		label: "GUI visual capture-manifest reference",
		value: inputs.captureManifest,
	});
	if (typeof captureReference.path !== "string") {
		throw new Error("GUI visual capture-manifest reference path is invalid.");
	}
	const capture = await loadCapCutGuiVisualCaptureManifest({
		path: captureReference.path,
	});
	if (
		path !==
			join(
				capture.manifest.evidenceDirectory,
				CAPCUT_GUI_VISUAL_VERIFICATION_FILE_NAME
			) ||
		canonical.stats.uid !== BigInt(capture.manifest.ownerUid)
	) {
		throw new Error(
			"GUI visual verification manifest path or owner is inconsistent."
		);
	}
	const reviewReference = inputs.nativeCjkReviewReceipt;
	const reviewPath =
		reviewReference === null
			? null
			: requireRecord({
					label: "Native CJK review receipt reference",
					value: reviewReference,
				}).path;
	if (reviewPath !== null && typeof reviewPath !== "string") {
		throw new Error("Native CJK review receipt reference path is invalid.");
	}
	const rebuilt = await buildCapCutGuiVisualVerification({
		captureManifestPath: captureReference.path,
		completedAt: manifest.completedAt,
		nativeCjkReviewReceiptPath: reviewPath,
	});
	if (!isDeepStrictEqual(manifest, rebuilt)) {
		throw new Error("GUI visual verification manifest is not reproducible.");
	}
	return { evidence: snapshot.evidence, manifest };
}
