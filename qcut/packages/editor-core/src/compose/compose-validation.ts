import {
	COMPOSE_PROTOCOL_VERSION,
	type ComposeAssetReference,
	type ComposeJob,
	type ComposePatch,
	type ComposePatchOperation,
	type ComposeSnapshot,
	type ComposeSnapshotMedia,
} from "./compose-types.js";

export type ComposeValidationSeverity = "error" | "warning" | "info";

export type ComposeValidationIssueCode =
	| "empty-snapshot"
	| "invalid-range"
	| "missing-main-media"
	| "snapshot-mismatch"
	| "invalid-progress"
	| "terminal-job-without-result"
	| "schema-version-mismatch"
	| "duplicate-operation-id"
	| "unknown-target-element"
	| "invalid-asset-reference"
	| "invalid-sticker-geometry"
	| "operation-conflict"
	| "operation-out-of-bounds";

export interface ComposeValidationIssue {
	severity: ComposeValidationSeverity;
	code: ComposeValidationIssueCode;
	path: string;
	message: string;
	operationId?: string;
	fixHint?: string;
}

const OUT_OF_BOUNDS_TOLERANCE_SECONDS = 0.05;

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

function rangesOverlap({
	left,
	right,
}: {
	left: { startTime: number; duration: number };
	right: { startTime: number; duration: number };
}): boolean {
	return (
		left.startTime < right.startTime + right.duration &&
		right.startTime < left.startTime + left.duration
	);
}

export function validateComposeSnapshot({
	snapshot,
}: {
	snapshot: ComposeSnapshot;
}): ComposeValidationIssue[] {
	const issues: ComposeValidationIssue[] = [];
	if (
		snapshot.media.length === 0 &&
		snapshot.captions.length === 0 &&
		snapshot.beats.length === 0 &&
		snapshot.shots.length === 0
	) {
		issues.push({
			severity: "error",
			code: "empty-snapshot",
			path: "snapshot",
			message: "Compose snapshot has no media, captions, beats, or shots.",
		});
	}
	if (!snapshot.media.some((item) => item.kind === "video")) {
		issues.push({
			severity: "warning",
			code: "missing-main-media",
			path: "media",
			message: "Compose snapshot has no video media item.",
			fixHint:
				"Intents that place stickers, transitions, or zooms need a video timeline.",
		});
	}
	for (const [index, media] of snapshot.media.entries()) {
		if (!isFinitePositiveRange(media)) {
			issues.push({
				severity: "error",
				code: "invalid-range",
				path: `media.${index}`,
				message: "Media snapshot ranges must be finite positive ranges.",
			});
		}
	}
	for (const [index, caption] of snapshot.captions.entries()) {
		if (!isFinitePositiveRange(caption)) {
			issues.push({
				severity: "error",
				code: "invalid-range",
				path: `captions.${index}`,
				message: "Caption snapshot ranges must be finite positive ranges.",
			});
		}
	}
	for (const [index, beat] of snapshot.beats.entries()) {
		if (!Number.isFinite(beat.timestamp) || beat.timestamp < 0) {
			issues.push({
				severity: "error",
				code: "invalid-range",
				path: `beats.${index}`,
				message: "Beat timestamps must be finite and non-negative.",
			});
		}
	}
	for (const [index, shot] of snapshot.shots.entries()) {
		if (!isFinitePositiveRange(shot)) {
			issues.push({
				severity: "error",
				code: "invalid-range",
				path: `shots.${index}`,
				message: "Shot snapshot ranges must be finite positive ranges.",
			});
		}
	}
	const { project } = snapshot;
	if (
		!Number.isFinite(project.duration) ||
		project.duration <= 0 ||
		!Number.isFinite(project.fps) ||
		project.fps <= 0 ||
		!Number.isFinite(project.canvasSize.width) ||
		project.canvasSize.width <= 0 ||
		!Number.isFinite(project.canvasSize.height) ||
		project.canvasSize.height <= 0
	) {
		issues.push({
			severity: "error",
			code: "invalid-range",
			path: "project",
			message:
				"Project duration, fps, and canvas size must be finite positive numbers.",
		});
	}
	return issues;
}

function validateAssetReference({
	asset,
	path,
	operationId,
	issues,
}: {
	asset: ComposeAssetReference;
	path: string;
	operationId: string;
	issues: ComposeValidationIssue[];
}): void {
	if (typeof asset.assetId !== "string" || asset.assetId.trim().length === 0) {
		issues.push({
			severity: "error",
			code: "invalid-asset-reference",
			path,
			operationId,
			message: "Compose asset references must carry a non-empty assetId.",
		});
	}
}

function validateStickerGeometry({
	operation,
	path,
	issues,
}: {
	operation: Extract<ComposePatchOperation, { kind: "add-sticker" }>;
	path: string;
	issues: ComposeValidationIssue[];
}): void {
	for (const key of ["x", "y", "width", "height"] as const) {
		const value = operation[key];
		if (value === undefined) continue;
		const positiveSize = key === "width" || key === "height";
		if (
			!Number.isFinite(value) ||
			value > 1 ||
			(positiveSize ? value <= 0 : value < 0)
		) {
			issues.push({
				severity: "error",
				code: "invalid-sticker-geometry",
				path: `${path}.${key}`,
				operationId: operation.id,
				message:
					"Sticker x/y must be normalized to 0..1 and width/height to 0..1 exclusive of zero.",
			});
		}
	}
	if (
		operation.rotation !== undefined &&
		!Number.isFinite(operation.rotation)
	) {
		issues.push({
			severity: "error",
			code: "invalid-sticker-geometry",
			path: `${path}.rotation`,
			operationId: operation.id,
			message: "Sticker rotation must be finite.",
		});
	}
	if (
		operation.opacity !== undefined &&
		(!Number.isFinite(operation.opacity) ||
			operation.opacity < 0 ||
			operation.opacity > 1)
	) {
		issues.push({
			severity: "error",
			code: "invalid-sticker-geometry",
			path: `${path}.opacity`,
			operationId: operation.id,
			message: "Sticker opacity must be between 0 and 1.",
		});
	}
	for (const key of ["animationInDuration", "animationOutDuration"] as const) {
		const value = operation[key];
		if (
			value !== undefined &&
			(!Number.isFinite(value) || value < 0 || value > operation.duration)
		) {
			issues.push({
				severity: "error",
				code: "invalid-sticker-geometry",
				path: `${path}.${key}`,
				operationId: operation.id,
				message: "Sticker animation timing must fit inside the operation.",
			});
		}
	}
	if (
		operation.animationLoopIntensity !== undefined &&
		(!Number.isFinite(operation.animationLoopIntensity) ||
			operation.animationLoopIntensity < 0 ||
			operation.animationLoopIntensity > 2)
	) {
		issues.push({
			severity: "error",
			code: "invalid-sticker-geometry",
			path: `${path}.animationLoopIntensity`,
			operationId: operation.id,
			message: "Sticker loop intensity must be between 0 and 2.",
		});
	}
}

function validateSoundSettings({
	operation,
	path,
	issues,
}: {
	operation: Extract<ComposePatchOperation, { kind: "add-sound-effect" }>;
	path: string;
	issues: ComposeValidationIssue[];
}): void {
	if (
		!Number.isFinite(operation.volume) ||
		operation.volume < 0 ||
		operation.volume > 1
	) {
		issues.push({
			severity: "error",
			code: "invalid-range",
			path: `${path}.volume`,
			operationId: operation.id,
			message: "Sound-effect volume must be between 0 and 1.",
		});
	}
	for (const key of ["trimStart", "trimEnd", "fadeIn", "fadeOut"] as const) {
		const value = operation[key];
		if (
			value !== undefined &&
			(!Number.isFinite(value) ||
				value < 0 ||
				((key === "fadeIn" || key === "fadeOut") && value > operation.duration))
		) {
			issues.push({
				severity: "error",
				code: "invalid-range",
				path: `${path}.${key}`,
				operationId: operation.id,
				message:
					"Sound trims must be non-negative and fades must fit inside the operation.",
			});
		}
	}
	if (
		operation.playbackRate !== undefined &&
		(!Number.isFinite(operation.playbackRate) ||
			operation.playbackRate < 0.25 ||
			operation.playbackRate > 4)
	) {
		issues.push({
			severity: "error",
			code: "invalid-range",
			path: `${path}.playbackRate`,
			operationId: operation.id,
			message: "Sound-effect playbackRate must be between 0.25 and 4.",
		});
	}
}

function mediaByElementId({
	snapshot,
}: {
	snapshot: ComposeSnapshot;
}): Map<string, ComposeSnapshotMedia> {
	const byElementId = new Map<string, ComposeSnapshotMedia>();
	for (const media of snapshot.media) {
		byElementId.set(media.elementId, media);
	}
	return byElementId;
}

function requireTargetElement({
	elementId,
	trackId,
	targets,
	path,
	operationId,
	issues,
}: {
	elementId: string;
	trackId: string;
	targets: Map<string, ComposeSnapshotMedia>;
	path: string;
	operationId: string;
	issues: ComposeValidationIssue[];
}): void {
	const media = targets.get(elementId);
	if (!media || media.trackId !== trackId) {
		issues.push({
			severity: "error",
			code: "unknown-target-element",
			path,
			operationId,
			message: `Timeline element ${elementId} on track ${trackId} is not part of the snapshot.`,
			fixHint: "Re-run compose snapshot so the patch targets current elements.",
		});
	}
}

function validateOperationConflicts({
	operations,
	issues,
}: {
	operations: readonly ComposePatchOperation[];
	issues: ComposeValidationIssue[];
}): void {
	const zoomsByElement = new Map<string, ComposePatchOperation[]>();
	const transitionCuts = new Map<string, string>();
	for (const operation of operations) {
		if (operation.kind === "update-media-zoom") {
			const existing = zoomsByElement.get(operation.elementId) ?? [];
			for (const other of existing) {
				if (rangesOverlap({ left: operation, right: other })) {
					issues.push({
						severity: "error",
						code: "operation-conflict",
						path: `operations.${operation.id}`,
						operationId: operation.id,
						message: `Zoom operations ${other.id} and ${operation.id} overlap on element ${operation.elementId}.`,
					});
				}
			}
			existing.push(operation);
			zoomsByElement.set(operation.elementId, existing);
		}
		if (operation.kind === "upsert-transition") {
			const cutKey = `${operation.trackId}:${operation.fromElementId}:${operation.toElementId}`;
			const existingId = transitionCuts.get(cutKey);
			if (existingId) {
				issues.push({
					severity: "error",
					code: "operation-conflict",
					path: `operations.${operation.id}`,
					operationId: operation.id,
					message: `Transitions ${existingId} and ${operation.id} target the same cut.`,
				});
			} else {
				transitionCuts.set(cutKey, operation.id);
			}
		}
	}
}

export function validateComposePatch({
	snapshot,
	patch,
}: {
	snapshot: ComposeSnapshot;
	patch: ComposePatch;
}): ComposeValidationIssue[] {
	const issues: ComposeValidationIssue[] = [];
	if (patch.schemaVersion !== COMPOSE_PROTOCOL_VERSION) {
		issues.push({
			severity: "error",
			code: "schema-version-mismatch",
			path: "schemaVersion",
			message: `Compose patch schema version ${patch.schemaVersion} is not supported.`,
		});
	}
	if (
		patch.snapshotId !== snapshot.id ||
		patch.sourceFingerprint !== snapshot.sourceFingerprint
	) {
		issues.push({
			severity: "error",
			code: "snapshot-mismatch",
			path: "snapshot",
			message: "Compose patch does not match the active snapshot.",
			fixHint: "Re-run compose snapshot and rebase the patch before applying.",
		});
		return issues;
	}

	const targets = mediaByElementId({ snapshot });
	const seenIds = new Set<string>();
	for (const [index, operation] of patch.operations.entries()) {
		const path = `operations.${index}`;
		if (seenIds.has(operation.id)) {
			issues.push({
				severity: "error",
				code: "duplicate-operation-id",
				path,
				operationId: operation.id,
				message: `Operation id ${operation.id} appears more than once.`,
			});
		}
		seenIds.add(operation.id);
		if (!isFinitePositiveRange(operation)) {
			issues.push({
				severity: "error",
				code: "invalid-range",
				path,
				operationId: operation.id,
				message: "Patch operations must use finite positive time ranges.",
			});
			continue;
		}
		if (
			operation.startTime + operation.duration >
			snapshot.project.duration + OUT_OF_BOUNDS_TOLERANCE_SECONDS
		) {
			issues.push({
				severity: "warning",
				code: "operation-out-of-bounds",
				path,
				operationId: operation.id,
				message: `Operation ${operation.id} ends after the project timeline.`,
			});
		}
		if (
			operation.kind === "add-sticker" ||
			operation.kind === "add-sound-effect"
		) {
			validateAssetReference({
				asset: operation.asset,
				path: `${path}.asset`,
				operationId: operation.id,
				issues,
			});
		}
		if (operation.kind === "add-sticker") {
			validateStickerGeometry({ operation, path, issues });
		}
		if (operation.kind === "add-sound-effect") {
			validateSoundSettings({ operation, path, issues });
		}
		if (operation.kind === "add-text-overlay" && operation.asset) {
			validateAssetReference({
				asset: operation.asset,
				path: `${path}.asset`,
				operationId: operation.id,
				issues,
			});
		}
		if (operation.kind === "update-media-zoom") {
			requireTargetElement({
				elementId: operation.elementId,
				trackId: operation.trackId,
				targets,
				path,
				operationId: operation.id,
				issues,
			});
		}
		if (operation.kind === "upsert-transition") {
			requireTargetElement({
				elementId: operation.fromElementId,
				trackId: operation.trackId,
				targets,
				path: `${path}.fromElementId`,
				operationId: operation.id,
				issues,
			});
			requireTargetElement({
				elementId: operation.toElementId,
				trackId: operation.trackId,
				targets,
				path: `${path}.toElementId`,
				operationId: operation.id,
				issues,
			});
		}
	}
	validateOperationConflicts({ operations: patch.operations, issues });
	return issues;
}

export function validateComposeJob({
	job,
	snapshot,
}: {
	job: ComposeJob;
	snapshot?: ComposeSnapshot;
}): ComposeValidationIssue[] {
	const issues: ComposeValidationIssue[] = [];
	if (job.schemaVersion !== COMPOSE_PROTOCOL_VERSION) {
		issues.push({
			severity: "error",
			code: "schema-version-mismatch",
			path: "schemaVersion",
			message: `Compose job schema version ${job.schemaVersion} is not supported.`,
		});
	}
	if (job.progress < 0 || job.progress > 1 || !Number.isFinite(job.progress)) {
		issues.push({
			severity: "error",
			code: "invalid-progress",
			path: "progress",
			message: "Compose job progress must be between 0 and 1.",
		});
	}
	if (
		snapshot &&
		(job.snapshotId !== snapshot.id ||
			job.snapshotFingerprint !== snapshot.sourceFingerprint)
	) {
		issues.push({
			severity: "error",
			code: "snapshot-mismatch",
			path: "snapshot",
			message: "Compose job does not match the active snapshot.",
		});
	}
	if (job.status === "completed" && !job.resultPatchId) {
		issues.push({
			severity: "error",
			code: "terminal-job-without-result",
			path: "resultPatchId",
			message: "Completed compose jobs must reference a result patch.",
		});
	}
	return issues;
}

export function hasComposeValidationErrors({
	issues,
}: {
	issues: readonly ComposeValidationIssue[];
}): boolean {
	return issues.some((issue) => issue.severity === "error");
}
