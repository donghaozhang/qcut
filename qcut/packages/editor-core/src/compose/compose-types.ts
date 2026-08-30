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
	| "generated-media"
	| "media";

export type ComposeAssetLicense = "commercial-ok" | "personal-only" | "unknown";

export type ComposeAssetAvailability =
	| "ready"
	| "downloadable"
	| "reference-only"
	| "unavailable";

export interface ComposeAssetCapabilities {
	preview: boolean;
	editorApply: boolean;
	editorExport: boolean;
	headlessRender: boolean;
	requiresAuth?: boolean;
	requiresLocalRuntime?: boolean;
}

export interface ComposeAssetReference {
	provider: ComposeProvider;
	assetType: ComposeAssetType;
	assetId: string;
	displayName?: string;
	tags?: string[];
	duration?: number;
	availability?: ComposeAssetAvailability;
	capabilities?: ComposeAssetCapabilities;
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
	editorExport?: boolean;
	resourceBroker?: boolean;
	jianyingLocalTransitions?: boolean;
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
	resourceWarnings?: string[];
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

export type ComposePatchSource =
	| "cloud"
	| "local-heuristic"
	| "manifest-compiler";

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
	rotation?: number;
	opacity?: number;
	maintainAspectRatio?: boolean;
	animationInType?: "none" | "fade" | "slide" | "scale" | "bounce";
	animationInDuration?: number;
	animationOutType?: "none" | "fade" | "slide" | "scale";
	animationOutDuration?: number;
	animationLoopType?: "none" | "pulse" | "float" | "spin" | "bounce";
	animationLoopIntensity?: number;
}

export interface ComposeAddSoundEffectOperation
	extends ComposeBasePatchOperation {
	kind: "add-sound-effect";
	asset: ComposeAssetReference;
	volume: number;
	trimStart?: number;
	trimEnd?: number;
	fadeIn?: number;
	fadeOut?: number;
	playbackRate?: number;
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

export interface ComposeInsertMediaClipOperation
	extends ComposeBasePatchOperation {
	kind: "insert-media-clip";
	/** The media file to import; provenance records identity, never secrets. */
	asset: ComposeAssetReference;
	mediaKind: "video" | "image";
	trackRole: "main-video" | "overlay-video";
	/** Existing track id; omitted for a compiler-created track. */
	trackId?: string;
	/** Source seconds removed from the head/tail of the file. */
	trimStart: number;
	trimEnd: number;
	/** Full source duration in seconds (explicit for images). */
	sourceDuration: number;
	volume?: number;
	playbackRate?: number;
	fitMode?: "contain" | "cover" | "fill";
}

export interface ComposeFilterStep {
	/** Stable step id, unique within its stack. */
	id: string;
	/** Filter Lab resource identity (never a raw package path). */
	asset: ComposeAssetReference;
	/** 0..100, matching the Filter Lab intensity contract. */
	intensity: number;
	enabled: boolean;
}

export interface ComposeSetMediaFilterStackOperation
	extends ComposeBasePatchOperation {
	kind: "set-media-filter-stack";
	/**
	 * Track owning the target element. When `elementId` references a pending
	 * `insert-media-clip` operation in the same patch, this must repeat that
	 * operation id (the real track id does not exist yet).
	 */
	trackId: string;
	/** Snapshot element id, or a pending insert-media-clip operation id. */
	elementId: string;
	/** Ordered, clip-scoped filter stack (1..16 steps). */
	filters: ComposeFilterStep[];
}

export interface ComposeAddFilterLayerOperation
	extends ComposeBasePatchOperation {
	kind: "add-filter-layer";
	trackRole: "adjustment";
	/** Ordered timeline-range filter stack (1..16 steps). */
	filters: ComposeFilterStep[];
	name?: string;
}

export type ComposePatchOperation =
	| ComposeAddCaptionOperation
	| ComposeAddTextOverlayOperation
	| ComposeAddStickerOperation
	| ComposeAddSoundEffectOperation
	| ComposeUpdateMediaZoomOperation
	| ComposeUpsertTransitionOperation
	| ComposeInsertMediaClipOperation
	| ComposeSetMediaFilterStackOperation
	| ComposeAddFilterLayerOperation;

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
