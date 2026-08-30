export const COMPOSE_PROTOCOL_VERSION = 1;

export type ComposeProtocolVersion = typeof COMPOSE_PROTOCOL_VERSION;

export type ComposeProvider = "qcut" | "openrouter" | "fal" | "local";

export type ComposeIntentKind =
	| "smart-packaging"
	| "subtitle-style"
	| "resource-match"
	| "full-compose";

export type ComposeJobStatus =
	| "queued"
	| "uploading"
	| "running"
	| "completed"
	| "failed"
	| "canceled";

export type ComposeJobErrorCategory =
	| "retryable"
	| "quota"
	| "auth"
	| "unsupported"
	| "unsafe-content"
	| "unknown";

export type ComposeAssetType =
	| "font"
	| "text-template"
	| "text-animation"
	| "fancy-word"
	| "sticker"
	| "sound-effect"
	| "filter"
	| "transition"
	| "generated-media";

export type ComposeAssetLicense = "commercial-ok" | "personal-only" | "unknown";

export interface ComposeAssetReference {
	provider: ComposeProvider;
	assetType: ComposeAssetType;
	assetId: string;
	cacheKey?: string;
	localPath?: string;
	license?: ComposeAssetLicense;
	provenance?: Record<string, unknown>;
}

export interface ComposeCanvasSize {
	width: number;
	height: number;
}

export interface ComposeSnapshotProject {
	id: string;
	fps: number;
	canvasSize: ComposeCanvasSize;
	duration: number;
}

export type ComposeSnapshotMediaKind = "video" | "audio" | "image";

export interface ComposeSnapshotMedia {
	id: string;
	kind: ComposeSnapshotMediaKind;
	trackId: string;
	elementId: string;
	startTime: number;
	duration: number;
	trimStart: number;
	sourceFingerprint?: string;
	width?: number;
	height?: number;
	hasAudio?: boolean;
}

export interface ComposeSnapshotCaption {
	id: string;
	text: string;
	startTime: number;
	duration: number;
	language?: string;
	confidence?: number;
}

export interface ComposeSnapshotBeat {
	id: string;
	timestamp: number;
	confidence?: number;
}

export interface ComposeSnapshotShot {
	id: string;
	startTime: number;
	duration: number;
	label?: string;
}

export interface ComposeSnapshotCapabilities {
	headlessRender: boolean;
	editorApply: boolean;
}

export interface ComposeSnapshot {
	schemaVersion: ComposeProtocolVersion;
	id: string;
	createdAt: string;
	sourceFingerprint: string;
	project: ComposeSnapshotProject;
	media: ComposeSnapshotMedia[];
	captions: ComposeSnapshotCaption[];
	beats: ComposeSnapshotBeat[];
	shots: ComposeSnapshotShot[];
	availableResources: ComposeAssetReference[];
	capabilities: ComposeSnapshotCapabilities;
}

export interface ComposeIntent {
	schemaVersion: ComposeProtocolVersion;
	kind: ComposeIntentKind;
	options: Record<string, unknown>;
}

export interface ComposeJobError {
	code: string;
	message: string;
	category: ComposeJobErrorCategory;
	retryable: boolean;
}

export interface ComposeJob {
	schemaVersion: ComposeProtocolVersion;
	id: string;
	provider: ComposeProvider;
	intentKind: ComposeIntentKind;
	snapshotId: string;
	snapshotFingerprint: string;
	status: ComposeJobStatus;
	progress: number;
	createdAt: string;
	updatedAt: string;
	attempt: number;
	remoteTaskId?: string;
	uploadObjectIds?: string[];
	resultPatchId?: string;
	error?: ComposeJobError;
}

export type ComposePatchSource = "cloud" | "local-heuristic";

export type ComposePatchMode = "idempotent" | "duplicate";

export interface ComposeBasePatchOperation {
	id: string;
	startTime: number;
	duration: number;
	reason?: string;
}

export interface ComposeAddCaptionOperation extends ComposeBasePatchOperation {
	kind: "add-caption";
	text: string;
	language: string;
	confidence?: number;
	wordIds?: string[];
	stylePresetId?: string;
}

export interface ComposeAddTextOverlayOperation
	extends ComposeBasePatchOperation {
	kind: "add-text-overlay";
	sourceCaptionId?: string;
	text: string;
	textTemplateId: string;
	asset?: ComposeAssetReference;
}

export interface ComposeAddStickerOperation extends ComposeBasePatchOperation {
	kind: "add-sticker";
	asset: ComposeAssetReference;
	/** Center position normalized to the project canvas (0..1). */
	x?: number;
	y?: number;
	/** Size normalized to the shorter project-canvas dimension (0..1). */
	width?: number;
	height?: number;
}

export interface ComposeAddSoundEffectOperation
	extends ComposeBasePatchOperation {
	kind: "add-sound-effect";
	asset: ComposeAssetReference;
	volume: number;
}

export interface ComposeUpdateMediaZoomOperation
	extends ComposeBasePatchOperation {
	kind: "update-media-zoom";
	trackId: string;
	elementId: string;
	fromScale: number;
	toScale: number;
}

export interface ComposeUpsertTransitionOperation
	extends ComposeBasePatchOperation {
	kind: "upsert-transition";
	trackId: string;
	fromElementId: string;
	toElementId: string;
	presetId: string;
	asset?: ComposeAssetReference;
}

export type ComposePatchOperation =
	| ComposeAddCaptionOperation
	| ComposeAddTextOverlayOperation
	| ComposeAddStickerOperation
	| ComposeAddSoundEffectOperation
	| ComposeUpdateMediaZoomOperation
	| ComposeUpsertTransitionOperation;

export type ComposePatchOperationKind = ComposePatchOperation["kind"];

export interface ComposePatch {
	schemaVersion: ComposeProtocolVersion;
	id: string;
	source: ComposePatchSource;
	intentKind: ComposeIntentKind;
	mode: ComposePatchMode;
	snapshotId: string;
	sourceFingerprint: string;
	createdAt: string;
	provider?: ComposeProvider;
	remoteTaskId?: string;
	operations: ComposePatchOperation[];
	warnings: string[];
}

export interface ComposeProjectRecordSnapshot {
	id: string;
	createdAt: string;
	sourceFingerprint: string;
}

export interface ComposeProjectRecordJob {
	id: string;
	provider: ComposeProvider;
	status: ComposeJobStatus;
	snapshotId: string;
	resultPatchId?: string;
}

export interface ComposeProjectRecordPatch {
	id: string;
	snapshotId: string;
	operationCount: number;
	appliedAt?: string;
	appliedOperationIds?: string[];
}

export interface ComposeProjectRecord {
	schemaVersion: ComposeProtocolVersion;
	projectId: string;
	updatedAt: string;
	snapshots: ComposeProjectRecordSnapshot[];
	jobs: ComposeProjectRecordJob[];
	patches: ComposeProjectRecordPatch[];
}
