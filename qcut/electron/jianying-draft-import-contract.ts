/**
 * JianYing draft import IPC contract (JYI-012).
 *
 * The live Electron bridge for inspect/plan/commit. The bundle crosses the
 * boundary as `unknown` on purpose: the renderer re-validates it with the
 * SAME shared parser (`parseQCutImportBundleV1`) the runtime used — one
 * validator, no transport-side trust.
 *
 * Zero electron imports: preload, handler, renderer types, and tests all
 * share this file.
 */

export const JIANYING_IMPORT_INSPECT_CHANNEL = "jianying-draft:import:inspect";
export const JIANYING_IMPORT_CHOOSE_DIRECTORY_CHANNEL =
	"jianying-draft:import:choose-directory";
export const JIANYING_IMPORT_PLAN_CHANNEL = "jianying-draft:import:plan";
export const JIANYING_IMPORT_COMMIT_CHANNEL = "jianying-draft:import:commit";
export const JIANYING_IMPORT_MEDIA_CHUNK_CHANNEL =
	"jianying-draft:import:media:chunk";
export const JIANYING_IMPORT_MEDIA_RELEASE_CHANNEL =
	"jianying-draft:import:media:release";
export const JIANYING_IMPORT_INBOX_LIST_CHANNEL =
	"jianying-draft:import:inbox:list";
export const JIANYING_IMPORT_INBOX_READ_CHANNEL =
	"jianying-draft:import:inbox:read";
export const JIANYING_IMPORT_INBOX_ACK_CHANNEL =
	"jianying-draft:import:inbox:ack";

export type JianyingDraftImportErrorCode =
	| "invalid-request"
	| "no-content-file"
	| "profile-not-exact"
	| "plan-blocked"
	| "warning-acceptance-mismatch"
	| "source-changed"
	| "payload-too-large"
	| "grant-store-full"
	| "grant-not-found"
	| "grant-expired"
	| "plan-not-found"
	| "plan-expired"
	| "plan-consumed"
	| "plan-build-mismatch"
	| "plan-store-full"
	| "plan-store-corrupt"
	| "plan-store-unavailable"
	| "inbox-malformed"
	| "inbox-unavailable"
	| "untrusted-sender"
	| "import-failed";

export interface JianyingDraftImportErrorDto {
	code: JianyingDraftImportErrorCode;
	name: string;
	message: string;
}

export type JianyingDraftImportResultDto<Value> =
	| { ok: true; value: Value }
	| { ok: false; error: JianyingDraftImportErrorDto };

export interface DraftImportIssueDto {
	code: string;
	severity: "info" | "warning" | "error";
	message: string;
	path?: string;
	subjectId?: string;
}

export interface DraftImportInspectRequestDto {
	draftPath: string;
}

export interface DraftImportInspectDto {
	outcome: "exact" | "ambiguous" | "unsupported" | "encrypted";
	profileId?: string;
	canWrite: boolean;
	fileCount: number;
	skippedEntryCount: number;
	hasContentFile: boolean;
	semantic?: {
		trackCount: number;
		segmentCount: number;
		resourceCount: number;
		capabilityCounts: Record<string, number>;
	};
	issues: DraftImportIssueDto[];
}

export interface DraftImportPlanRequestDto {
	draftPath: string;
}

export interface DraftImportPlanDto {
	plan: {
		planToken: string;
		createdAtUnixMilliseconds: number;
		expiresAtUnixMilliseconds: number;
		detectionOutcome: string;
		profileId?: string;
		canCommit: boolean;
		warningFingerprints: string[];
		blockerFingerprints: string[];
	};
	inspect: DraftImportInspectDto;
	assetStatuses: Record<string, string>;
	cacheMetrics?: {
		assetResolution: {
			schemaVersion: 1;
			fileProbeHits: number;
			fileProbeMisses: number;
			nameSearchHits: number;
			nameSearchMisses: number;
			evictions: number;
			hashedBytes: number;
		};
	};
	stageMetrics?: {
		schemaVersion: 1;
		phase: "runtime-plan";
		measuredDurationMilliseconds: number;
		stages: Partial<
			Record<
				| "request-validation"
				| "source-discovery"
				| "snapshot-read"
				| "profile-detection"
				| "document-normalization"
				| "asset-resolution"
				| "timeline-mapping"
				| "bundle-validation"
				| "plan-persistence",
				{
					durationMilliseconds: number;
					invocationCount: number;
				}
			>
		>;
	};
}

export interface DraftImportCommitRequestDto {
	planToken: string;
	acceptedWarningFingerprints: string[];
}

export interface DraftImportMediaPayloadDto {
	resourceId: string;
	fileName: string;
	mimeType: string;
	bytesBase64: string;
}

export interface DraftImportMediaGrantDto {
	schemaVersion: 1;
	grantToken: string;
	resourceId: string;
	fileName: string;
	mimeType: string;
	byteLength: number;
	sha256: string;
	expiresAtUnixMilliseconds: number;
}

export interface DraftImportMediaChunkRequestDto {
	grantToken: string;
	offset: number;
	maxBytes: number;
}

export interface DraftImportMediaChunkDto {
	schemaVersion: 1;
	grantToken: string;
	offset: number;
	bytes: Uint8Array;
	eof: boolean;
}

export interface DraftImportMediaReleaseRequestDto {
	grantTokens: string[];
}

export interface DraftImportMediaReleaseDto {
	releasedCount: number;
}

export interface DraftImportEnvelopeCaptureDto {
	envelope: unknown;
	payloadBase64: string;
	payloadSha256: string;
}

export interface DraftImportCommitDto {
	/** Re-validated by the renderer with the shared bundle parser. */
	bundle: unknown;
	mediaGrants: DraftImportMediaGrantDto[];
	/** Live IPC only. The desktop inbox intentionally never persists this. */
	envelopeCapture?: DraftImportEnvelopeCaptureDto;
}

export interface DraftImportInboxEntrySummaryDto {
	entryId: string;
	createdAtUnixMilliseconds: number;
	projectName: string;
	bundleDigest: string;
	mediaCount: number;
}

export interface DraftImportInboxEntryRequestDto {
	entryId: string;
}

export interface JianyingDraftImportAPI {
	chooseDraftDirectory(): Promise<JianyingDraftImportResultDto<string | null>>;
	inspectDraft(
		request: DraftImportInspectRequestDto
	): Promise<JianyingDraftImportResultDto<DraftImportInspectDto>>;
	planDraftImport(
		request: DraftImportPlanRequestDto
	): Promise<JianyingDraftImportResultDto<DraftImportPlanDto>>;
	commitDraftImport(
		request: DraftImportCommitRequestDto
	): Promise<JianyingDraftImportResultDto<DraftImportCommitDto>>;
	readDraftImportMediaChunk(
		request: DraftImportMediaChunkRequestDto
	): Promise<JianyingDraftImportResultDto<DraftImportMediaChunkDto>>;
	releaseDraftImportMedia(
		request: DraftImportMediaReleaseRequestDto
	): Promise<JianyingDraftImportResultDto<DraftImportMediaReleaseDto>>;
	listPendingDraftImports(): Promise<
		JianyingDraftImportResultDto<DraftImportInboxEntrySummaryDto[]>
	>;
	readPendingDraftImport(
		request: DraftImportInboxEntryRequestDto
	): Promise<JianyingDraftImportResultDto<DraftImportCommitDto>>;
	acknowledgePendingDraftImport(
		request: DraftImportInboxEntryRequestDto
	): Promise<JianyingDraftImportResultDto<{ entryId: string }>>;
}
