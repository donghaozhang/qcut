/**
 * Mirrors @qcut/editor-core/compose for the native pipeline. Electron runtime
 * code cannot resolve workspace packages, so the protocol pieces the CLI needs
 * are mirrored here; electron/__tests__/compose-protocol-mirror.test.ts pins
 * behavioral equivalence against the editor-core source of truth.
 */
import { createHash } from "node:crypto";

export const COMPOSE_PROTOCOL_VERSION = 1;

export type ComposeProvider = "qcut" | "openrouter" | "fal" | "local";

export type ComposeIntentKind =
	| "smart-packaging"
	| "subtitle-style"
	| "resource-match"
	| "full-compose";

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

export interface ComposeAssetReference {
	provider: ComposeProvider;
	assetType: ComposeAssetType;
	assetId: string;
	cacheKey?: string;
	localPath?: string;
	license?: "commercial-ok" | "personal-only" | "unknown";
	provenance?: Record<string, unknown>;
}

export interface ComposeSnapshotProject {
	id: string;
	fps: number;
	canvasSize: { width: number; height: number };
	duration: number;
}

export interface ComposeSnapshotMedia {
	id: string;
	kind: "video" | "audio" | "image";
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

export interface ComposeSnapshot {
	schemaVersion: typeof COMPOSE_PROTOCOL_VERSION;
	id: string;
	createdAt: string;
	sourceFingerprint: string;
	project: ComposeSnapshotProject;
	media: ComposeSnapshotMedia[];
	captions: ComposeSnapshotCaption[];
	beats: ComposeSnapshotBeat[];
	shots: ComposeSnapshotShot[];
	availableResources: ComposeAssetReference[];
	capabilities: { headlessRender: boolean; editorApply: boolean };
}

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
	x?: number;
	y?: number;
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

export interface ComposePatch {
	schemaVersion: typeof COMPOSE_PROTOCOL_VERSION;
	id: string;
	source: "cloud" | "local-heuristic";
	intentKind: ComposeIntentKind;
	mode: "idempotent" | "duplicate";
	snapshotId: string;
	sourceFingerprint: string;
	createdAt: string;
	provider?: ComposeProvider;
	remoteTaskId?: string;
	operations: ComposePatchOperation[];
	warnings: string[];
}

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

function compareCodeUnits({
	left,
	right,
}: {
	left: string;
	right: string;
}): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}

function canonicalize({ value }: { value: unknown }): unknown {
	if (typeof value === "number" && !Number.isFinite(value)) {
		return `non-finite:${String(value)}`;
	}
	if (Array.isArray(value)) {
		return value.map((entry) => canonicalize({ value: entry }));
	}
	if (value !== null && typeof value === "object") {
		const record = value as Record<string, unknown>;
		const result: Record<string, unknown> = {};
		for (const key of Object.keys(record).sort()) {
			if (record[key] === undefined) continue;
			result[key] = canonicalize({ value: record[key] });
		}
		return result;
	}
	return value;
}

function sortedByIdentity<
	T extends { id: string; startTime?: number; elementId?: string },
>({ items }: { items: readonly T[] }): T[] {
	return [...items].sort(
		(left, right) =>
			(left.startTime ?? 0) - (right.startTime ?? 0) ||
			compareCodeUnits({ left: left.id, right: right.id }) ||
			compareCodeUnits({
				left: left.elementId ?? "",
				right: right.elementId ?? "",
			})
	);
}

export function computeComposeSourceFingerprint({
	project,
	media,
	captions,
}: {
	project: ComposeSnapshotProject;
	media: readonly ComposeSnapshotMedia[];
	captions: readonly ComposeSnapshotCaption[];
}): string {
	const canonical = canonicalize({
		value: {
			project,
			media: sortedByIdentity({ items: media }),
			captions: sortedByIdentity({ items: captions }),
		},
	});
	return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

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

	const targets = new Map<string, ComposeSnapshotMedia>();
	for (const media of snapshot.media) {
		targets.set(media.elementId, media);
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

export function hasComposeValidationErrors({
	issues,
}: {
	issues: readonly ComposeValidationIssue[];
}): boolean {
	return issues.some((issue) => issue.severity === "error");
}
