import { isDeepStrictEqual } from "node:util";
import { join } from "node:path";
import {
	assertExactKeys,
	requireCanonicalPath,
	requireNonEmptyString,
	requireRecord,
} from "./gui-regression-filesystem.js";
import {
	CAPCUT_NATIVE_CJK_EXPECTED_TEXT,
	CAPCUT_NATIVE_CJK_PHASES,
	CAPCUT_NATIVE_CJK_REVIEW_SCHEMA,
	CAPCUT_NATIVE_CJK_REVIEW_SCHEMA_VERSION,
	CAPCUT_NATIVE_CJK_TARGETS,
	type CapCutGuiVisualCaptureManifest,
	type CapCutNativeCjkReviewReceipt,
	type CapCutNativeCjkPhase,
	type CapCutNativeCjkTarget,
} from "./gui-visual-evidence-contract.js";
import type {
	VisualFileEvidence,
	VisualVerificationStatus,
} from "./visual-contract.js";
import { readVisualJsonFileSnapshot } from "./visual-files.js";

export const CAPCUT_NATIVE_CJK_REVIEW_FILE_NAME =
	"native-cjk-review-receipt.json";

export interface LoadedCapCutNativeCjkReview {
	evidence: VisualFileEvidence;
	phaseStatuses: Readonly<
		Record<
			CapCutNativeCjkTarget,
			Readonly<Record<CapCutNativeCjkPhase, VisualVerificationStatus>>
		>
	>;
	receipt: CapCutNativeCjkReviewReceipt;
	statuses: Readonly<Record<CapCutNativeCjkTarget, VisualVerificationStatus>>;
}

function requireCanonicalIsoTimestamp({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): string {
	const timestamp = requireNonEmptyString({ label, value });
	const milliseconds = Date.parse(timestamp);
	if (
		!Number.isFinite(milliseconds) ||
		new Date(milliseconds).toISOString() !== timestamp
	) {
		throw new Error(`${label} must be a canonical ISO-8601 timestamp.`);
	}
	return timestamp;
}

function requireBoolean({ label, value }: { label: string; value: unknown }) {
	if (typeof value !== "boolean") throw new Error(`${label} must be boolean.`);
	return value;
}

function requireFileEvidence({
	label,
	value,
}: {
	label: string;
	value: unknown;
}): VisualFileEvidence {
	const record = requireRecord({ label, value });
	assertExactKeys({
		expectedKeys: ["bytes", "path", "sha256"],
		label,
		value: record,
	});
	if (
		!Number.isSafeInteger(record.bytes) ||
		Number(record.bytes) <= 0 ||
		typeof record.path !== "string" ||
		record.path.length === 0 ||
		typeof record.sha256 !== "string" ||
		!/^[a-f0-9]{64}$/u.test(record.sha256)
	) {
		throw new Error(`${label} is invalid.`);
	}
	return record as unknown as VisualFileEvidence;
}

function parseReceipt({
	captureManifest,
	captureManifestEvidence,
	value,
}: {
	captureManifest: CapCutGuiVisualCaptureManifest;
	captureManifestEvidence: VisualFileEvidence;
	value: unknown;
}): {
	phaseStatuses: Record<
		CapCutNativeCjkTarget,
		Record<CapCutNativeCjkPhase, VisualVerificationStatus>
	>;
	receipt: CapCutNativeCjkReviewReceipt;
	statuses: Record<CapCutNativeCjkTarget, VisualVerificationStatus>;
} {
	const root = requireRecord({ label: "Native CJK review receipt", value });
	assertExactKeys({
		expectedKeys: [
			"captureManifest",
			"observations",
			"reviewedAt",
			"reviewer",
			"runId",
			"schema",
			"schemaVersion",
		],
		label: "Native CJK review receipt",
		value: root,
	});
	if (
		root.schema !== CAPCUT_NATIVE_CJK_REVIEW_SCHEMA ||
		root.schemaVersion !== CAPCUT_NATIVE_CJK_REVIEW_SCHEMA_VERSION ||
		root.runId !== captureManifest.runId
	) {
		throw new Error("Native CJK review receipt is not bound to the GUI run.");
	}
	const manifestReference = requireFileEvidence({
		label: "Native CJK capture-manifest reference",
		value: root.captureManifest,
	});
	if (!isDeepStrictEqual(manifestReference, captureManifestEvidence)) {
		throw new Error(
			"Native CJK review receipt references a different capture manifest."
		);
	}
	requireCanonicalIsoTimestamp({
		label: "Native CJK reviewedAt",
		value: root.reviewedAt,
	});
	const reviewer = requireRecord({
		label: "Native CJK reviewer",
		value: root.reviewer,
	});
	assertExactKeys({
		expectedKeys: ["identity", "method"],
		label: "Native CJK reviewer",
		value: reviewer,
	});
	if (
		reviewer.method !== "human-visual-inspection" ||
		requireNonEmptyString({
			label: "Native CJK reviewer identity",
			value: reviewer.identity,
		}).trim().length === 0
	) {
		throw new Error(
			"Native CJK receipt requires an identified human reviewer."
		);
	}
	if (!Array.isArray(root.observations) || root.observations.length !== 2) {
		throw new Error("Native CJK receipt must review title and caption.");
	}
	const statuses = {} as Record<
		CapCutNativeCjkTarget,
		VisualVerificationStatus
	>;
	const phaseStatuses = {} as Record<
		CapCutNativeCjkTarget,
		Record<CapCutNativeCjkPhase, VisualVerificationStatus>
	>;
	for (const [
		targetIndex,
		expectedTarget,
	] of CAPCUT_NATIVE_CJK_TARGETS.entries()) {
		const observation = requireRecord({
			label: `Native CJK ${expectedTarget} observation`,
			value: root.observations[targetIndex],
		});
		assertExactKeys({
			expectedKeys: ["expectedText", "phases", "target"],
			label: `Native CJK ${expectedTarget} observation`,
			value: observation,
		});
		if (
			observation.target !== expectedTarget ||
			observation.expectedText !==
				CAPCUT_NATIVE_CJK_EXPECTED_TEXT[expectedTarget] ||
			!Array.isArray(observation.phases) ||
			observation.phases.length !== CAPCUT_NATIVE_CJK_PHASES.length
		) {
			throw new Error(
				`Native CJK ${expectedTarget} observation is incomplete.`
			);
		}
		let passes = true;
		phaseStatuses[expectedTarget] = {} as Record<
			CapCutNativeCjkPhase,
			VisualVerificationStatus
		>;
		for (const [
			phaseIndex,
			expectedPhase,
		] of CAPCUT_NATIVE_CJK_PHASES.entries()) {
			const phase = requireRecord({
				label: `Native CJK ${expectedTarget} ${expectedPhase}`,
				value: observation.phases[phaseIndex],
			});
			assertExactKeys({
				expectedKeys: [
					"evidence",
					"fullPreviewFrameVisible",
					"glyphsFullyRendered",
					"phase",
					"renderedTextExactly",
					"tofuAbsent",
				],
				label: `Native CJK ${expectedTarget} ${expectedPhase}`,
				value: phase,
			});
			if (phase.phase !== expectedPhase) {
				throw new Error(
					`Native CJK ${expectedTarget} phases are out of order.`
				);
			}
			const evidence = requireFileEvidence({
				label: `Native CJK ${expectedTarget} ${expectedPhase} evidence`,
				value: phase.evidence,
			});
			if (
				!isDeepStrictEqual(
					evidence,
					captureManifest.nativeText[expectedTarget][expectedPhase]
				)
			) {
				throw new Error(
					`Native CJK ${expectedTarget} ${expectedPhase} evidence hash is not bound.`
				);
			}
			const glyphsFullyRendered = requireBoolean({
				label: "glyphsFullyRendered",
				value: phase.glyphsFullyRendered,
			});
			const fullPreviewFrameVisible = requireBoolean({
				label: "fullPreviewFrameVisible",
				value: phase.fullPreviewFrameVisible,
			});
			const renderedTextExactly = requireBoolean({
				label: "renderedTextExactly",
				value: phase.renderedTextExactly,
			});
			const tofuAbsent = requireBoolean({
				label: "tofuAbsent",
				value: phase.tofuAbsent,
			});
			const phasePasses =
				fullPreviewFrameVisible &&
				glyphsFullyRendered &&
				renderedTextExactly &&
				tofuAbsent;
			phaseStatuses[expectedTarget][expectedPhase] = phasePasses
				? "verified"
				: "failed";
			passes = phasePasses && passes;
		}
		statuses[expectedTarget] = passes ? "verified" : "failed";
	}
	return {
		phaseStatuses,
		receipt: root as unknown as CapCutNativeCjkReviewReceipt,
		statuses,
	};
}

export async function loadCapCutNativeCjkReview({
	captureManifest,
	captureManifestEvidence,
	path,
}: {
	captureManifest: CapCutGuiVisualCaptureManifest;
	captureManifestEvidence: VisualFileEvidence;
	path: string;
}): Promise<LoadedCapCutNativeCjkReview> {
	const canonical = await requireCanonicalPath({
		expectedKind: "file",
		label: "Native CJK review receipt",
		path,
	});
	if (
		path !==
			join(
				captureManifest.evidenceDirectory,
				CAPCUT_NATIVE_CJK_REVIEW_FILE_NAME
			) ||
		canonical.stats.uid !== BigInt(captureManifest.ownerUid)
	) {
		throw new Error("Native CJK review receipt path or owner is inconsistent.");
	}
	const snapshot = await readVisualJsonFileSnapshot({
		label: "Native CJK review receipt",
		path,
	});
	const parsed = parseReceipt({
		captureManifest,
		captureManifestEvidence,
		value: snapshot.value,
	});
	return { evidence: snapshot.evidence, ...parsed };
}
