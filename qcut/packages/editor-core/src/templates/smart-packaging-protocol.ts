import type {
	SmartPackagingAction,
	SmartPackagingBeat,
	SmartPackagingCaption,
	SmartPackagingPlan,
	SmartPackagingShot,
} from "./smart-packaging.js";

export const SMART_PACKAGING_PROTOCOL_VERSION = 1;

export type SmartPackagingProtocolVersion =
	typeof SMART_PACKAGING_PROTOCOL_VERSION;

export type SmartPackagingProvider = "qcut" | "openrouter" | "fal" | "local";

export type SmartPackagingJobStatus =
	| "queued"
	| "uploading"
	| "running"
	| "completed"
	| "failed"
	| "canceled";

export type SmartPackagingSnapshotMediaKind = "video" | "audio" | "image";

export type SmartPackagingTimelinePatchSource = "cloud" | "local-heuristic";

export interface SmartPackagingCanvasSize {
	width: number;
	height: number;
}

export interface SmartPackagingSnapshotProject {
	id: string;
	fps: number;
	canvasSize: SmartPackagingCanvasSize;
	duration: number;
}

export interface SmartPackagingSnapshotMedia {
	id: string;
	kind: SmartPackagingSnapshotMediaKind;
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

export interface SmartPackagingSnapshotOptions {
	style: "auto" | "knowledge" | "tech" | "vlog" | "commerce" | "entertainment";
	clearExistingSmartPackaging: boolean;
	clearCurrentSubtitles: boolean;
	commercialMaterialsOnly: boolean;
	generateAsr: boolean;
	generateChapters: boolean;
	generateIntro: boolean;
	generateSubtitleAndTextTemplate: boolean;
	language?: string;
}

export interface SmartPackagingSnapshot {
	schemaVersion: SmartPackagingProtocolVersion;
	id: string;
	createdAt: string;
	sourceFingerprint: string;
	project: SmartPackagingSnapshotProject;
	options: SmartPackagingSnapshotOptions;
	media: SmartPackagingSnapshotMedia[];
	captions: SmartPackagingCaption[];
	beats: SmartPackagingBeat[];
	shots: SmartPackagingShot[];
}

export interface SmartPackagingCloudJobError {
	code: string;
	message: string;
	retryable: boolean;
}

export interface SmartPackagingCloudJob {
	schemaVersion: SmartPackagingProtocolVersion;
	id: string;
	provider: SmartPackagingProvider;
	snapshotId: string;
	snapshotFingerprint: string;
	status: SmartPackagingJobStatus;
	progress: number;
	createdAt: string;
	updatedAt: string;
	attempt: number;
	remoteTaskId?: string;
	uploadObjectIds?: string[];
	resultPatch?: SmartPackagingTimelinePatch;
	error?: SmartPackagingCloudJobError;
}

export interface SmartPackagingBasePatchOperation {
	id: string;
	startTime: number;
	duration: number;
	reason?: string;
}

export interface SmartPackagingAssetReference {
	provider: SmartPackagingProvider;
	assetId: string;
	assetType:
		| "font"
		| "text-template"
		| "text-animation"
		| "fancy-word"
		| "sticker"
		| "sound-effect"
		| "effect"
		| "transition";
	cacheKey?: string;
}

export interface SmartPackagingAddCaptionOperation
	extends SmartPackagingBasePatchOperation {
	kind: "add-caption";
	text: string;
	language: string;
	confidence?: number;
	wordIds?: string[];
	stylePresetId?: string;
}

export interface SmartPackagingAddTextOverlayOperation
	extends SmartPackagingBasePatchOperation {
	kind: "add-text-overlay";
	sourceCaptionId?: string;
	text: string;
	textTemplateId: string;
	asset?: SmartPackagingAssetReference;
}

export interface SmartPackagingAddStickerOperation
	extends SmartPackagingBasePatchOperation {
	kind: "add-sticker";
	asset: SmartPackagingAssetReference;
	x?: number;
	y?: number;
	width?: number;
	height?: number;
}

export interface SmartPackagingAddSoundEffectOperation
	extends SmartPackagingBasePatchOperation {
	kind: "add-sound-effect";
	asset: SmartPackagingAssetReference;
	volume: number;
}

export interface SmartPackagingUpdateMediaZoomOperation
	extends SmartPackagingBasePatchOperation {
	kind: "update-media-zoom";
	trackId: string;
	elementId: string;
	fromScale: number;
	toScale: number;
}

export interface SmartPackagingUpsertTransitionOperation
	extends SmartPackagingBasePatchOperation {
	kind: "upsert-transition";
	trackId: string;
	fromElementId: string;
	toElementId: string;
	presetId: "dissolve" | "whip-pan-right";
}

export type SmartPackagingTimelinePatchOperation =
	| SmartPackagingAddCaptionOperation
	| SmartPackagingAddTextOverlayOperation
	| SmartPackagingAddStickerOperation
	| SmartPackagingAddSoundEffectOperation
	| SmartPackagingUpdateMediaZoomOperation
	| SmartPackagingUpsertTransitionOperation;

export interface SmartPackagingTimelinePatch {
	schemaVersion: SmartPackagingProtocolVersion;
	id: string;
	source: SmartPackagingTimelinePatchSource;
	snapshotId: string;
	sourceFingerprint: string;
	createdAt: string;
	provider?: SmartPackagingProvider;
	remoteTaskId?: string;
	operations: SmartPackagingTimelinePatchOperation[];
	warnings: string[];
	diagnostics: {
		sourceCounts: SmartPackagingPlan["sourceCounts"];
		operationCounts: Record<
			SmartPackagingTimelinePatchOperation["kind"],
			number
		>;
	};
}

export interface SmartPackagingProtocolIssue {
	code:
		| "empty-snapshot"
		| "invalid-range"
		| "missing-main-media"
		| "snapshot-mismatch"
		| "invalid-progress"
		| "terminal-job-without-result";
	path: string;
	message: string;
}

const EMPTY_OPERATION_COUNTS: Record<
	SmartPackagingTimelinePatchOperation["kind"],
	number
> = {
	"add-caption": 0,
	"add-text-overlay": 0,
	"add-sticker": 0,
	"add-sound-effect": 0,
	"update-media-zoom": 0,
	"upsert-transition": 0,
};

function isFinitePositiveRange({
	startTime,
	duration,
}: {
	startTime: number;
	duration: number;
}): boolean {
	return (
		Number.isFinite(startTime) &&
		Number.isFinite(duration) &&
		startTime >= 0 &&
		duration > 0
	);
}

function sortByTimeline<
	T extends { startTime: number; duration?: number; id?: string },
>({ items }: { items: readonly T[] }): T[] {
	return [...items].sort(
		(left, right) =>
			left.startTime - right.startTime ||
			(left.duration ?? 0) - (right.duration ?? 0) ||
			(left.id ?? "").localeCompare(right.id ?? "")
	);
}

function countPatchOperations({
	operations,
}: {
	operations: readonly SmartPackagingTimelinePatchOperation[];
}): Record<SmartPackagingTimelinePatchOperation["kind"], number> {
	const counts = { ...EMPTY_OPERATION_COUNTS };
	for (const operation of operations) {
		counts[operation.kind] += 1;
	}
	return counts;
}

function actionOperationId({
	action,
	index,
}: {
	action: SmartPackagingAction;
	index: number;
}): string {
	if (action.kind === "text") {
		return `text:${action.captionId}:${index}`;
	}
	if (action.kind === "zoom") {
		return `zoom:${action.trackId}:${action.elementId}`;
	}
	if (action.kind === "transition") {
		return `transition:${action.trackId}:${action.fromElementId}:${action.toElementId}`;
	}
	return `${action.kind}:${action.startTime.toFixed(3)}:${index}`;
}

function patchOperationFromAction({
	action,
	index,
	provider,
}: {
	action: SmartPackagingAction;
	index: number;
	provider: SmartPackagingProvider;
}): SmartPackagingTimelinePatchOperation {
	const id = actionOperationId({ action, index });
	if (action.kind === "text") {
		return {
			kind: "add-text-overlay",
			id,
			sourceCaptionId: action.captionId,
			text: action.content,
			startTime: action.startTime,
			duration: action.duration,
			textTemplateId: action.textTemplateId,
			asset: {
				provider,
				assetId: action.textTemplateId,
				assetType: "text-template",
			},
			reason: "caption-highlight",
		};
	}
	if (action.kind === "sticker") {
		return {
			kind: "add-sticker",
			id,
			startTime: action.startTime,
			duration: action.duration,
			asset: {
				provider,
				assetId: action.stickerAssetId,
				assetType: "sticker",
			},
			reason: "beat-accent",
		};
	}
	if (action.kind === "sound-effect") {
		return {
			kind: "add-sound-effect",
			id,
			startTime: action.startTime,
			duration: action.duration,
			volume: 0.82,
			asset: {
				provider,
				assetId: action.soundAssetId,
				assetType: "sound-effect",
			},
			reason: "beat-accent",
		};
	}
	if (action.kind === "zoom") {
		return {
			kind: "update-media-zoom",
			id,
			trackId: action.trackId,
			elementId: action.elementId,
			startTime: action.startTime,
			duration: action.endTime - action.startTime,
			fromScale: action.fromScale,
			toScale: action.toScale,
			reason: "shot-motion",
		};
	}
	return {
		kind: "upsert-transition",
		id,
		trackId: action.trackId,
		fromElementId: action.fromElementId,
		toElementId: action.toElementId,
		startTime: action.startTime,
		duration: action.duration,
		presetId: action.presetId,
		reason: "shot-boundary",
	};
}

export function buildSmartPackagingSnapshot({
	id,
	createdAt,
	sourceFingerprint,
	project,
	options,
	media,
	captions,
	beats,
	shots,
}: {
	id: string;
	createdAt: string;
	sourceFingerprint: string;
	project: SmartPackagingSnapshotProject;
	options: SmartPackagingSnapshotOptions;
	media: readonly SmartPackagingSnapshotMedia[];
	captions: readonly SmartPackagingCaption[];
	beats: readonly SmartPackagingBeat[];
	shots: readonly SmartPackagingShot[];
}): SmartPackagingSnapshot {
	return {
		schemaVersion: SMART_PACKAGING_PROTOCOL_VERSION,
		id,
		createdAt,
		sourceFingerprint,
		project,
		options,
		media: sortByTimeline({ items: media }),
		captions: sortByTimeline({ items: captions }),
		beats: [...beats].sort((left, right) => left.timestamp - right.timestamp),
		shots: sortByTimeline({ items: shots }),
	};
}

export function validateSmartPackagingSnapshot({
	snapshot,
}: {
	snapshot: SmartPackagingSnapshot;
}): SmartPackagingProtocolIssue[] {
	const issues: SmartPackagingProtocolIssue[] = [];
	if (
		snapshot.media.length === 0 &&
		snapshot.captions.length === 0 &&
		snapshot.beats.length === 0 &&
		snapshot.shots.length === 0
	) {
		issues.push({
			code: "empty-snapshot",
			path: "snapshot",
			message:
				"Smart Packaging snapshot has no media, captions, beats, or shots.",
		});
	}
	if (!snapshot.media.some((item) => item.kind === "video")) {
		issues.push({
			code: "missing-main-media",
			path: "media",
			message: "Smart Packaging needs at least one video media item.",
		});
	}
	for (const [index, media] of snapshot.media.entries()) {
		if (!isFinitePositiveRange(media)) {
			issues.push({
				code: "invalid-range",
				path: `media.${index}`,
				message: "Media snapshot ranges must be finite positive ranges.",
			});
		}
	}
	for (const [index, caption] of snapshot.captions.entries()) {
		if (!isFinitePositiveRange(caption)) {
			issues.push({
				code: "invalid-range",
				path: `captions.${index}`,
				message: "Caption snapshot ranges must be finite positive ranges.",
			});
		}
	}
	return issues;
}

export function createSmartPackagingCloudJob({
	id,
	provider,
	snapshot,
	createdAt,
	remoteTaskId,
	uploadObjectIds = [],
}: {
	id: string;
	provider: SmartPackagingProvider;
	snapshot: SmartPackagingSnapshot;
	createdAt: string;
	remoteTaskId?: string;
	uploadObjectIds?: string[];
}): SmartPackagingCloudJob {
	return {
		schemaVersion: SMART_PACKAGING_PROTOCOL_VERSION,
		id,
		provider,
		snapshotId: snapshot.id,
		snapshotFingerprint: snapshot.sourceFingerprint,
		status: "queued",
		progress: 0,
		createdAt,
		updatedAt: createdAt,
		attempt: 1,
		remoteTaskId,
		uploadObjectIds,
	};
}

export function transitionSmartPackagingCloudJob({
	job,
	status,
	updatedAt,
	progress = job.progress,
	remoteTaskId = job.remoteTaskId,
	resultPatch,
	error,
}: {
	job: SmartPackagingCloudJob;
	status: SmartPackagingJobStatus;
	updatedAt: string;
	progress?: number;
	remoteTaskId?: string;
	resultPatch?: SmartPackagingTimelinePatch;
	error?: SmartPackagingCloudJobError;
}): SmartPackagingCloudJob {
	const normalizedProgress =
		status === "completed" ? 1 : Math.min(0.999, Math.max(0, progress));
	return {
		...job,
		status,
		progress: normalizedProgress,
		updatedAt,
		remoteTaskId,
		resultPatch,
		error,
	};
}

export function timelinePatchFromSmartPackagingPlan({
	plan,
	patchId,
	snapshotId,
	sourceFingerprint,
	createdAt,
	source = "local-heuristic",
	provider = "local",
	remoteTaskId,
}: {
	plan: SmartPackagingPlan;
	patchId: string;
	snapshotId: string;
	sourceFingerprint: string;
	createdAt: string;
	source?: SmartPackagingTimelinePatchSource;
	provider?: SmartPackagingProvider;
	remoteTaskId?: string;
}): SmartPackagingTimelinePatch {
	const operations = plan.actions.map((action, index) =>
		patchOperationFromAction({ action, index, provider })
	);
	return {
		schemaVersion: SMART_PACKAGING_PROTOCOL_VERSION,
		id: patchId,
		source,
		snapshotId,
		sourceFingerprint,
		createdAt,
		provider,
		remoteTaskId,
		operations,
		warnings: [...plan.warnings],
		diagnostics: {
			sourceCounts: plan.sourceCounts,
			operationCounts: countPatchOperations({ operations }),
		},
	};
}

export function mergeSmartPackagingTimelinePatches({
	base,
	incoming,
	patchId,
	createdAt,
}: {
	base: SmartPackagingTimelinePatch;
	incoming: SmartPackagingTimelinePatch;
	patchId: string;
	createdAt: string;
}): SmartPackagingTimelinePatch {
	if (
		base.snapshotId !== incoming.snapshotId ||
		base.sourceFingerprint !== incoming.sourceFingerprint
	) {
		throw new Error(
			"Cannot merge Smart Packaging patches from different snapshots."
		);
	}
	const operationsById = new Map<
		string,
		SmartPackagingTimelinePatchOperation
	>();
	for (const operation of base.operations) {
		operationsById.set(operation.id, operation);
	}
	for (const operation of incoming.operations) {
		operationsById.set(operation.id, operation);
	}
	const operations = sortByTimeline({ items: [...operationsById.values()] });
	return {
		schemaVersion: SMART_PACKAGING_PROTOCOL_VERSION,
		id: patchId,
		source: incoming.source,
		snapshotId: base.snapshotId,
		sourceFingerprint: base.sourceFingerprint,
		createdAt,
		provider: incoming.provider ?? base.provider,
		remoteTaskId: incoming.remoteTaskId ?? base.remoteTaskId,
		operations,
		warnings: [...new Set([...base.warnings, ...incoming.warnings])],
		diagnostics: {
			sourceCounts: incoming.diagnostics.sourceCounts,
			operationCounts: countPatchOperations({ operations }),
		},
	};
}

export function validateSmartPackagingCloudJob({
	job,
	snapshot,
}: {
	job: SmartPackagingCloudJob;
	snapshot?: SmartPackagingSnapshot;
}): SmartPackagingProtocolIssue[] {
	const issues: SmartPackagingProtocolIssue[] = [];
	if (job.progress < 0 || job.progress > 1 || !Number.isFinite(job.progress)) {
		issues.push({
			code: "invalid-progress",
			path: "progress",
			message: "Smart Packaging cloud job progress must be between 0 and 1.",
		});
	}
	if (
		snapshot &&
		(job.snapshotId !== snapshot.id ||
			job.snapshotFingerprint !== snapshot.sourceFingerprint)
	) {
		issues.push({
			code: "snapshot-mismatch",
			path: "snapshot",
			message: "Smart Packaging cloud job does not match the active snapshot.",
		});
	}
	if (job.status === "completed" && !job.resultPatch) {
		issues.push({
			code: "terminal-job-without-result",
			path: "resultPatch",
			message:
				"Completed Smart Packaging cloud jobs must carry a result patch.",
		});
	}
	return issues;
}
