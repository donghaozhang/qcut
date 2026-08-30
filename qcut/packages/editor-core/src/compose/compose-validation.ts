import {
	COMPOSE_PROTOCOL_VERSION,
	type ComposeAssetReference,
	type ComposeFilterStep,
	type ComposeInsertMediaClipOperation,
	type ComposeJob,
	type ComposePatch,
	type ComposePatchOperation,
	type ComposeSnapshot,
	type ComposeSnapshotMedia,
	type ComposeUpsertTransitionOperation,
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
	| "invalid-filter-stack"
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
const SOURCE_BOUNDS_TOLERANCE_SECONDS = 0.001;

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

function validateStickerAnimationType({
	allowedValues,
	issues,
	key,
	operation,
	path,
}: {
	allowedValues: readonly string[];
	issues: ComposeValidationIssue[];
	key: "animationInType" | "animationOutType" | "animationLoopType";
	operation: Extract<ComposePatchOperation, { kind: "add-sticker" }>;
	path: string;
}): void {
	const value: unknown = operation[key];
	if (
		value === undefined ||
		(typeof value === "string" && allowedValues.includes(value))
	) {
		return;
	}
	issues.push({
		severity: "error",
		code: "invalid-sticker-geometry",
		path: `${path}.${key}`,
		operationId: operation.id,
		message: `Sticker ${key} must be one of ${allowedValues.join(", ")}.`,
	});
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
	if (
		operation.maintainAspectRatio !== undefined &&
		typeof operation.maintainAspectRatio !== "boolean"
	) {
		issues.push({
			severity: "error",
			code: "invalid-sticker-geometry",
			path: `${path}.maintainAspectRatio`,
			operationId: operation.id,
			message: "Sticker maintainAspectRatio must be a boolean.",
		});
	}
	validateStickerAnimationType({
		allowedValues: ["none", "fade", "slide", "scale", "bounce"],
		issues,
		key: "animationInType",
		operation,
		path,
	});
	validateStickerAnimationType({
		allowedValues: ["none", "fade", "slide", "scale"],
		issues,
		key: "animationOutType",
		operation,
		path,
	});
	validateStickerAnimationType({
		allowedValues: ["none", "pulse", "float", "spin", "bounce"],
		issues,
		key: "animationLoopType",
		operation,
		path,
	});
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
	// Timeline duration consumes source seconds at playbackRate speed, so the
	// source must cover trims plus duration × rate — a 2× clip needs twice the
	// source footage its timeline span suggests.
	const sourceDuration = operation.asset?.duration;
	if (
		sourceDuration !== undefined &&
		Number.isFinite(sourceDuration) &&
		Number.isFinite(operation.duration)
	) {
		const playbackRate =
			operation.playbackRate !== undefined &&
			Number.isFinite(operation.playbackRate) &&
			operation.playbackRate > 0
				? operation.playbackRate
				: 1;
		const consumedSourceSeconds =
			(operation.trimStart ?? 0) +
			(operation.trimEnd ?? 0) +
			operation.duration * playbackRate;
		if (
			consumedSourceSeconds >
			sourceDuration + SOURCE_BOUNDS_TOLERANCE_SECONDS
		) {
			issues.push({
				severity: "error",
				code: "invalid-range",
				path: `${path}.duration`,
				operationId: operation.id,
				message:
					"Sound-effect trims plus duration × playbackRate exceed the source duration.",
			});
		}
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

const FILTER_STACK_MAX_STEPS = 16;
const INSERT_CLIP_DURATION_TOLERANCE_SECONDS = 0.05;

/** Marker used as a transition trackId when both endpoints are pending clips. */
export const COMPOSE_MAIN_VIDEO_TRACK_ROLE = "main-video";

function pendingInsertsById({
	operations,
}: {
	operations: readonly ComposePatchOperation[];
}): Map<string, ComposeInsertMediaClipOperation> {
	const pending = new Map<string, ComposeInsertMediaClipOperation>();
	for (const operation of operations) {
		if (operation.kind === "insert-media-clip") {
			pending.set(operation.id, operation);
		}
	}
	return pending;
}

function validateInsertMediaClip({
	operation,
	path,
	issues,
}: {
	operation: ComposeInsertMediaClipOperation;
	path: string;
	issues: ComposeValidationIssue[];
}): void {
	if (operation.asset.assetType !== "media") {
		issues.push({
			severity: "error",
			code: "invalid-asset-reference",
			path: `${path}.asset`,
			operationId: operation.id,
			message: "insert-media-clip requires an asset of type media.",
		});
	}
	if (operation.mediaKind !== "video" && operation.mediaKind !== "image") {
		issues.push({
			severity: "error",
			code: "invalid-range",
			path: `${path}.mediaKind`,
			operationId: operation.id,
			message: "insert-media-clip mediaKind must be video or image.",
		});
	}
	if (
		operation.trackRole !== "main-video" &&
		operation.trackRole !== "overlay-video"
	) {
		issues.push({
			severity: "error",
			code: "invalid-range",
			path: `${path}.trackRole`,
			operationId: operation.id,
			message:
				"insert-media-clip trackRole must be main-video or overlay-video.",
		});
	}
	for (const key of ["trimStart", "trimEnd"] as const) {
		const value = operation[key];
		if (!Number.isFinite(value) || value < 0) {
			issues.push({
				severity: "error",
				code: "invalid-range",
				path: `${path}.${key}`,
				operationId: operation.id,
				message: "Clip trims must be finite and non-negative.",
			});
		}
	}
	if (
		!Number.isFinite(operation.sourceDuration) ||
		operation.sourceDuration <= 0
	) {
		issues.push({
			severity: "error",
			code: "invalid-range",
			path: `${path}.sourceDuration`,
			operationId: operation.id,
			message: "insert-media-clip needs a positive sourceDuration.",
		});
		return;
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
			message: "Clip playbackRate must be between 0.25 and 4.",
		});
	}
	if (
		operation.volume !== undefined &&
		(!Number.isFinite(operation.volume) ||
			operation.volume < 0 ||
			operation.volume > 4)
	) {
		issues.push({
			severity: "error",
			code: "invalid-range",
			path: `${path}.volume`,
			operationId: operation.id,
			message: "Clip volume must be between 0 and 4.",
		});
	}
	const trimStart = Number.isFinite(operation.trimStart)
		? operation.trimStart
		: 0;
	const trimEnd = Number.isFinite(operation.trimEnd) ? operation.trimEnd : 0;
	if (trimStart + trimEnd >= operation.sourceDuration) {
		issues.push({
			severity: "error",
			code: "invalid-range",
			path: `${path}.trimEnd`,
			operationId: operation.id,
			message: "Clip trims consume the entire source.",
		});
		return;
	}
	const playbackRate =
		operation.playbackRate !== undefined &&
		Number.isFinite(operation.playbackRate) &&
		operation.playbackRate > 0
			? operation.playbackRate
			: 1;
	const expectedTimelineDuration =
		(operation.sourceDuration - trimStart - trimEnd) / playbackRate;
	if (
		Math.abs(operation.duration - expectedTimelineDuration) >
		INSERT_CLIP_DURATION_TOLERANCE_SECONDS
	) {
		issues.push({
			severity: "error",
			code: "invalid-range",
			path: `${path}.duration`,
			operationId: operation.id,
			message:
				"Clip timeline duration must equal (sourceDuration − trims) ÷ playbackRate.",
		});
	}
}

function validateFilterStack({
	filters,
	path,
	operationId,
	issues,
}: {
	filters: readonly ComposeFilterStep[];
	path: string;
	operationId: string;
	issues: ComposeValidationIssue[];
}): void {
	if (!Array.isArray(filters) || filters.length < 1) {
		issues.push({
			severity: "error",
			code: "invalid-filter-stack",
			path,
			operationId,
			message: "A filter stack needs at least one step.",
		});
		return;
	}
	if (filters.length > FILTER_STACK_MAX_STEPS) {
		issues.push({
			severity: "error",
			code: "invalid-filter-stack",
			path,
			operationId,
			message: `A filter stack allows at most ${FILTER_STACK_MAX_STEPS} steps.`,
		});
	}
	const stepIds = new Set<string>();
	for (const [index, step] of filters.entries()) {
		const stepPath = `${path}.${index}`;
		if (typeof step.id !== "string" || step.id.trim().length === 0) {
			issues.push({
				severity: "error",
				code: "invalid-filter-stack",
				path: `${stepPath}.id`,
				operationId,
				message: "Filter steps need a non-empty id.",
			});
		} else if (stepIds.has(step.id)) {
			issues.push({
				severity: "error",
				code: "invalid-filter-stack",
				path: `${stepPath}.id`,
				operationId,
				message: `Filter step id ${step.id} repeats inside the stack.`,
			});
		} else {
			stepIds.add(step.id);
		}
		if (
			!Number.isFinite(step.intensity) ||
			step.intensity < 0 ||
			step.intensity > 100
		) {
			issues.push({
				severity: "error",
				code: "invalid-filter-stack",
				path: `${stepPath}.intensity`,
				operationId,
				message: "Filter intensity must be between 0 and 100.",
			});
		}
		if (typeof step.enabled !== "boolean") {
			issues.push({
				severity: "error",
				code: "invalid-filter-stack",
				path: `${stepPath}.enabled`,
				operationId,
				message: "Filter steps need an explicit enabled flag.",
			});
		}
		validateAssetReference({
			asset: step.asset,
			path: `${stepPath}.asset`,
			operationId,
			issues,
		});
		if (step.asset && step.asset.assetType !== "filter") {
			issues.push({
				severity: "error",
				code: "invalid-filter-stack",
				path: `${stepPath}.asset`,
				operationId,
				message: "Filter steps must reference filter assets.",
			});
		}
	}
}

function validatePendingTransitionTargets({
	operation,
	fromPending,
	toPending,
	pendingClips,
	path,
	issues,
}: {
	operation: ComposeUpsertTransitionOperation;
	fromPending: boolean;
	toPending: boolean;
	pendingClips: ReadonlyMap<string, ComposeInsertMediaClipOperation>;
	path: string;
	issues: ComposeValidationIssue[];
}): void {
	if (!(fromPending && toPending)) {
		issues.push({
			severity: "error",
			code: "unknown-target-element",
			path,
			operationId: operation.id,
			message: "A transition may not mix pending clips with snapshot elements.",
			fixHint:
				"Reference two pending insert-media-clip operations or two snapshot elements.",
		});
		return;
	}
	if (operation.trackId !== COMPOSE_MAIN_VIDEO_TRACK_ROLE) {
		issues.push({
			severity: "error",
			code: "unknown-target-element",
			path: `${path}.trackId`,
			operationId: operation.id,
			message:
				'Transitions between pending clips must use trackId "main-video".',
		});
	}
	const endpoints = [
		["fromElementId", operation.fromElementId],
		["toElementId", operation.toElementId],
	] as const;
	for (const [key, endpointId] of endpoints) {
		const clip = pendingClips.get(endpointId);
		if (clip && clip.trackRole !== "main-video") {
			issues.push({
				severity: "error",
				code: "unknown-target-element",
				path: `${path}.${key}`,
				operationId: operation.id,
				message: `Pending clip ${endpointId} is not on the main video track.`,
			});
		}
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
	const mainVideoClipsByLane = new Map<string, ComposePatchOperation[]>();
	const filterStackTargets = new Map<string, string>();
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
		if (
			operation.kind === "insert-media-clip" &&
			operation.trackRole === "main-video"
		) {
			const laneKey = operation.trackId ?? COMPOSE_MAIN_VIDEO_TRACK_ROLE;
			const existing = mainVideoClipsByLane.get(laneKey) ?? [];
			for (const other of existing) {
				if (rangesOverlap({ left: operation, right: other })) {
					issues.push({
						severity: "error",
						code: "operation-conflict",
						path: `operations.${operation.id}`,
						operationId: operation.id,
						message: `Clips ${other.id} and ${operation.id} overlap on the main video track.`,
					});
				}
			}
			existing.push(operation);
			mainVideoClipsByLane.set(laneKey, existing);
		}
		if (operation.kind === "set-media-filter-stack") {
			const stackKey = `${operation.trackId}:${operation.elementId}`;
			const existingId = filterStackTargets.get(stackKey);
			if (existingId) {
				issues.push({
					severity: "error",
					code: "operation-conflict",
					path: `operations.${operation.id}`,
					operationId: operation.id,
					message: `Filter stacks ${existingId} and ${operation.id} target the same element.`,
				});
			} else {
				filterStackTargets.set(stackKey, operation.id);
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
	const pendingClips = pendingInsertsById({ operations: patch.operations });
	let effectiveProjectDuration = snapshot.project.duration;
	for (const pending of pendingClips.values()) {
		effectiveProjectDuration = Math.max(
			effectiveProjectDuration,
			pending.startTime + pending.duration
		);
	}
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
			effectiveProjectDuration + OUT_OF_BOUNDS_TOLERANCE_SECONDS
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
			const fromPending = pendingClips.has(operation.fromElementId);
			const toPending = pendingClips.has(operation.toElementId);
			if (fromPending || toPending) {
				validatePendingTransitionTargets({
					operation,
					fromPending,
					toPending,
					pendingClips,
					path,
					issues,
				});
			} else {
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
		if (operation.kind === "insert-media-clip") {
			validateInsertMediaClip({ operation, path, issues });
		}
		if (operation.kind === "set-media-filter-stack") {
			validateFilterStack({
				filters: operation.filters,
				path: `${path}.filters`,
				operationId: operation.id,
				issues,
			});
			if (pendingClips.has(operation.elementId)) {
				if (operation.trackId !== operation.elementId) {
					issues.push({
						severity: "error",
						code: "unknown-target-element",
						path: `${path}.trackId`,
						operationId: operation.id,
						message:
							"A filter stack for a pending clip must repeat the insert operation id as trackId.",
					});
				}
			} else {
				requireTargetElement({
					elementId: operation.elementId,
					trackId: operation.trackId,
					targets,
					path,
					operationId: operation.id,
					issues,
				});
			}
		}
		if (operation.kind === "add-filter-layer") {
			validateFilterStack({
				filters: operation.filters,
				path: `${path}.filters`,
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
