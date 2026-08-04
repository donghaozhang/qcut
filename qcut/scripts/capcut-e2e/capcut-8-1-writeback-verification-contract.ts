import type { CapCut81WritebackAppVerification } from "./capcut-8-1-writeback-app-receipt-contract.js";

export const CAPCUT_8_1_WRITEBACK_VERIFICATION_SCHEMA =
	"qcut.capcut-8.1-same-profile-writeback-verification" as const;
export const CAPCUT_8_1_WRITEBACK_VERIFICATION_FILE_NAME =
	"capcut-8.1-same-profile-writeback-verification.json" as const;

export type CapCut81WritebackVerificationVerdict =
	| "pass"
	| "fail"
	| "unverified";

export interface CapCut81WritebackVerificationChecks {
	activeMirrorsMatchOutput: boolean;
	backupMirrorsUnchanged: boolean;
	onlyPlannedPointersChanged: boolean;
	originalSourceUnchanged: boolean;
	recoveryStateClean: boolean;
	unknownSentinelPreserved: boolean;
}

interface CapCut81WritebackVerificationManifestBase {
	schema: typeof CAPCUT_8_1_WRITEBACK_VERIFICATION_SCHEMA;
	caseId: string;
	generatedAtIso: string;
	profile: {
		profileId: string;
		appVersion?: string;
		detectionOutcome: "exact";
	};
	importEvidence: {
		fileCount: number;
		trackCount: number;
		segmentCount: number;
		resourceCount: number;
		warningCount: number;
	};
	transactionEvidence: {
		activeMirrorCount: 4;
		activeMirrorTemplates: readonly [string, string, string, string];
		backupMirrorCount: 2;
		changedJsonPointers: string[];
		plannedPatchCount: number;
		originalSourceContentSha256: string;
		isolatedSourceContentSha256: string;
		outputContentSha256: string;
		recoveryAction:
			| "none"
			| "rolled-back"
			| "committed-cleanup"
			| "cleared-stale-lock";
	};
	checks: CapCut81WritebackVerificationChecks;
	verdict: CapCut81WritebackVerificationVerdict;
	notVerifiedReason?: string;
}

interface CapCut81WritebackVerificationProvenanceBase {
	controlledUnknownSentinel: true;
	isolation: "copy-before-mutation";
	source: "real-capcut-saved-draft";
	sourceReceiptId: string;
}

export interface CapCut81WritebackVerificationManifestV1
	extends CapCut81WritebackVerificationManifestBase {
	provenance: CapCut81WritebackVerificationProvenanceBase & {
		realAppOpenSaveReopenVerified: boolean;
	};
	schemaVersion: 1;
}

export interface CapCut81WritebackVerificationManifestV2
	extends CapCut81WritebackVerificationManifestBase {
	provenance: CapCut81WritebackVerificationProvenanceBase & {
		appVerification: CapCut81WritebackAppVerification | null;
	};
	schemaVersion: 2;
}

export type CapCut81WritebackVerificationManifest =
	| CapCut81WritebackVerificationManifestV1
	| CapCut81WritebackVerificationManifestV2;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function encodeJsonPointerToken({ token }: { token: string }): string {
	return token.replaceAll("~", "~0").replaceAll("/", "~1");
}

export function collectChangedJsonPointers({
	left,
	path = "",
	right,
}: {
	left: unknown;
	path?: string;
	right: unknown;
}): string[] {
	if (Object.is(left, right)) return [];
	if (Array.isArray(left) && Array.isArray(right)) {
		if (left.length !== right.length) return [path];
		return left.flatMap((value, index) =>
			collectChangedJsonPointers({
				left: value,
				path: `${path}/${index}`,
				right: right[index],
			})
		);
	}
	if (isRecord(left) && isRecord(right)) {
		const keys = [
			...new Set([...Object.keys(left), ...Object.keys(right)]),
		].sort();
		return keys.flatMap((key) =>
			collectChangedJsonPointers({
				left: left[key],
				path: `${path}/${encodeJsonPointerToken({ token: key })}`,
				right: right[key],
			})
		);
	}
	return [path];
}

export function assessCapCut81WritebackVerification({
	appVerification,
	checks,
}: {
	appVerification: CapCut81WritebackAppVerification | undefined;
	checks: CapCut81WritebackVerificationChecks;
}): {
	verdict: CapCut81WritebackVerificationVerdict;
	notVerifiedReason?: string;
} {
	if (Object.values(checks).some((check) => !check)) {
		return { verdict: "fail" };
	}
	if (appVerification === undefined) {
		return {
			verdict: "unverified",
			notVerifiedReason:
				"The isolated-copy transaction passed, but CapCut 8.1 has not opened, saved, and reopened the written draft.",
		};
	}
	return { verdict: "pass" };
}

export function assertWritebackManifestIsPathFree({
	forbiddenAbsolutePaths,
	manifest,
}: {
	forbiddenAbsolutePaths: readonly string[];
	manifest: CapCut81WritebackVerificationManifest;
}): void {
	const serialized = JSON.stringify(manifest);
	for (const forbiddenPath of forbiddenAbsolutePaths) {
		if (forbiddenPath.length > 0 && serialized.includes(forbiddenPath)) {
			throw new Error("Writeback evidence manifest contains an absolute path.");
		}
	}
}
