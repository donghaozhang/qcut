export const QCUT_IMPORT_VERIFICATION_MANIFEST_SCHEMA =
	"qcut.capcut-e2e.import-verification" as const;

export const QCUT_IMPORT_VERIFICATION_MANIFEST_FILE_NAME =
	"qcut-import-verification-manifest.json";

export interface QCutImportVerificationFileEvidence {
	byteLength: number;
	sha256: string;
}

export interface QCutImportVerificationIssueEvidence {
	code:
		| "EXPECTED_STATE_INVALID"
		| "MEDIA_DUPLICATE"
		| "MEDIA_MISMATCH"
		| "MEDIA_MISSING"
		| "MEDIA_UNEXPECTED"
		| "TRACK_DUPLICATE"
		| "TRACK_MISMATCH"
		| "TRACK_MISSING"
		| "TRACK_UNEXPECTED";
	path: string;
}

export interface QCutImportMaterializationEvidence {
	actual: { mediaCount: number; trackCount: number };
	bundleDigest: string;
	expected: { mediaCount: number; trackCount: number };
	issues: QCutImportVerificationIssueEvidence[];
	schema: "qcut.draft-interop.import-verification";
	schemaVersion: 1;
	verdict: "pass" | "fail";
}

export interface QCutImportVerificationManifest {
	bundle: QCutImportVerificationFileEvidence & { bundleDigest?: string };
	checks: {
		bundleDigest: boolean;
		captureTrusted: boolean;
		importId: boolean;
		profileId: boolean;
		projectFps: boolean;
		projectGeometry: boolean;
		projectName: boolean;
	};
	capture: {
		appVersion?: string;
		source:
			| "manual-path-snapshot"
			| "qcut-renderer-persisted-storage"
			| "unknown";
	};
	generatedAtIso: string;
	mediaSetSha256?: string;
	notComparableReason?: string;
	qcutSnapshot: QCutImportVerificationFileEvidence;
	roles: { expected: "import-bundle"; actual: "qcut-renderer-snapshot" };
	schema: typeof QCUT_IMPORT_VERIFICATION_MANIFEST_SCHEMA;
	schemaVersion: 2;
	verification?: QCutImportMaterializationEvidence;
	verdict: "pass" | "fail" | "not-comparable";
}
