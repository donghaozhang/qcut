/**
 * @qcut/jianying-draft-import — read-only draft snapshot runtime (JYI-006).
 *
 * Main-process / CLI only: this package touches the filesystem and must
 * never be imported by renderer code. It produces immutable snapshots for
 * the editor-core interop layer and writes nothing.
 */

export {
	discoverDraftDirectory,
	MAX_DISCOVERY_DEPTH,
	MAX_DISCOVERY_ENTRIES,
	type DiscoveredDraftFile,
	type DraftDiscoveryResult,
	type SkippedDraftEntry,
} from "./discovery.js";

export {
	DEFAULT_MAX_FILE_BYTES,
	DEFAULT_MAX_TOTAL_BYTES,
	readDraftSourceSnapshot,
	verifyDraftSourceUnchanged,
	type DraftSourceFileIdentity,
	type DraftSourceSnapshot,
	type DraftSourceSnapshotFile,
} from "./snapshot-reader.js";

export {
	validateDraftInspectRequest,
	type DraftInspectRequest,
	type DraftRequestValidationIssue,
	type ValidateDraftInspectRequestResult,
} from "./runtime-validation.js";

export {
	createImportPlanArtifact,
	createImportPlanToken,
	IMPORT_PLAN_ARTIFACT_SCHEMA_VERSION,
	MAX_PLAN_TTL_MILLISECONDS,
	redactImportPlanArtifactForLog,
	validateImportPlanArtifact,
	type ImportPlanArtifactV1,
	type ImportPlanBuildIdentity,
	type ImportPlanDetectionOutcome,
	type ImportPlanInvalidReason,
	type RedactedImportPlanArtifact,
} from "./import-plan-artifact.js";

export {
	ImportPlanBuildMismatchError,
	ImportPlanConsumedError,
	ImportPlanExpiredError,
	ImportPlanNotFoundError,
	ImportPlanStore,
	ImportPlanStoreFullError,
} from "./import-plan-store.js";

export {
	buildQCutImportBundle,
	computeQCutImportBundleDigest,
	verifyQCutImportBundleDigest,
	type BuildQCutImportBundleResult,
} from "./qcut-import-bundle-builder.js";

export {
	resolveImportAssets,
	type AssetResolutionMethod,
	type AssetResolutionStatus,
	type AssetResolverInstrumentation,
	type ResolvedImportAsset,
	type ResolveImportAssetsInput,
} from "./asset-resolver.js";

export {
	ImportSessionError,
	JianyingDraftImportSession,
	type DraftImportCommitDto,
	type DraftImportEnvelopeCaptureDto,
	type DraftImportInspectDto,
	type DraftImportMediaPayloadDto,
	type DraftImportPlanDto,
} from "./import-session.js";

export {
	deleteDesktopImport,
	DesktopImportInboxMalformedError,
	DesktopImportInboxUnavailableError,
	enqueueDesktopImport,
	listDesktopImports,
	readDesktopImport,
	type DesktopImportInboxEntrySummary,
} from "./desktop-import-inbox.js";
