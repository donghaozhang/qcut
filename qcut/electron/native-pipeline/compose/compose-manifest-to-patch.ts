/**
 * Deterministic compose-manifest → compose-patch compiler.
 *
 * Turns a validated v1 compose manifest into an editor-applicable
 * ComposePatch built from `insert-media-clip`, `set-media-filter-stack`,
 * `upsert-transition`, `add-sticker` and `add-sound-effect` operations.
 *
 * Timing contract: clips are laid out adjacently, and each transitioned cut
 * trims `duration / 2` seconds of content from both neighbours. That keeps
 * elements adjacent (QCut transitions bridge adjacent elements) while the
 * total timeline duration matches the headless renderer's
 * `Σ clips − Σ transitions`.
 *
 * All operation ids derive from sha256(manifestSha256 + projectId + stable
 * manifest path) so recompiling the same manifest yields the same patch and
 * idempotent apply can replay it safely.
 */

import { createHash } from "node:crypto";
import type {
	ComposeAudio,
	ComposeClip,
	ComposeManifest,
	ComposeOverlay,
	ComposeTransition,
} from "./compose-manifest.js";
import type {
	ComposeAssetReference,
	ComposeFilterStep,
	ComposePatch,
	ComposePatchOperation,
	ComposeSnapshot,
} from "./compose-protocol.js";

export interface ComposeManifestSourceInfo {
	/** Probed media duration in seconds; ignored for images. */
	durationSeconds?: number;
	mediaKind: "video" | "image" | "audio";
}

export interface CompileComposeManifestInput {
	manifest: ComposeManifest;
	manifestSha256: string;
	projectId: string;
	snapshot: ComposeSnapshot;
	/** Probe results keyed by the manifest `source` string, verbatim. */
	sources: Record<string, ComposeManifestSourceInfo>;
	/** Patch creation timestamp; injectable for deterministic tests. */
	createdAt?: string;
}

export interface CompiledComposeManifest {
	patch: ComposePatch;
	/** Timeline seconds the compiled clips occupy, transition-adjusted. */
	timelineDuration: number;
	warnings: string[];
}

export class ComposeManifestCompileError extends Error {
	readonly issues: string[];

	constructor({ issues }: { issues: string[] }) {
		super(`Compose manifest cannot be compiled: ${issues.join("; ")}`);
		this.name = "ComposeManifestCompileError";
		this.issues = issues;
	}
}

const MIN_CLIP_SECONDS = 0.1;

function stableOperationId({
	manifestSha256,
	projectId,
	stablePath,
}: {
	manifestSha256: string;
	projectId: string;
	stablePath: string;
}): string {
	const digest = createHash("sha256")
		.update(`${manifestSha256}\n${projectId}\n${stablePath}`)
		.digest("hex");
	return `cmp-${digest.slice(0, 24)}`;
}

function mediaAssetReference({
	source,
	mediaKind,
}: {
	source: string;
	mediaKind: "video" | "image" | "audio";
}): ComposeAssetReference {
	return {
		provider: "local",
		assetType: mediaKind === "audio" ? "sound-effect" : "media",
		assetId: `manifest:${source}`,
		displayName: source,
		provenance: { manifestSource: source },
	};
}

interface ClipLayout {
	clip: ComposeClip;
	index: number;
	operationId: string;
	sourceDuration: number;
	trimStart: number;
	trimEnd: number;
	startTime: number;
	duration: number;
	mediaKind: "video" | "image";
}

function resolveClipSegment({
	clip,
	sources,
	issues,
}: {
	clip: ComposeClip;
	sources: Record<string, ComposeManifestSourceInfo>;
	issues: string[];
}): { sourceDuration: number; mediaKind: "video" | "image" } | undefined {
	const info = sources[clip.source];
	if (!info) {
		issues.push(`clip ${clip.id}: no probe info for source ${clip.source}`);
		return;
	}
	if (info.mediaKind === "audio") {
		issues.push(`clip ${clip.id}: audio sources cannot be video clips`);
		return;
	}
	if (info.mediaKind === "image") {
		if (clip.trim.out === undefined) {
			issues.push(`clip ${clip.id}: image clips need trim.out as a duration`);
			return;
		}
		return { sourceDuration: clip.trim.out, mediaKind: "image" };
	}
	if (
		info.durationSeconds === undefined ||
		!Number.isFinite(info.durationSeconds) ||
		info.durationSeconds <= 0
	) {
		issues.push(`clip ${clip.id}: source ${clip.source} has no duration`);
		return;
	}
	if (clip.trim.out !== undefined && clip.trim.out > info.durationSeconds) {
		issues.push(
			`clip ${clip.id}: trim.out ${clip.trim.out}s exceeds source duration ${info.durationSeconds}s`
		);
		return;
	}
	return { sourceDuration: info.durationSeconds, mediaKind: "video" };
}

function transitionSecondsByCut({
	manifest,
	issues,
}: {
	manifest: ComposeManifest;
	issues: string[];
}): Map<number, ComposeTransition> {
	const clipIndexById = new Map<string, number>();
	for (const [index, clip] of manifest.clips.entries()) {
		clipIndexById.set(clip.id, index);
	}
	const byCut = new Map<number, ComposeTransition>();
	for (const transition of manifest.transitions) {
		const [fromId, toId] = transition.between;
		const fromIndex = clipIndexById.get(fromId);
		const toIndex = clipIndexById.get(toId);
		if (fromIndex === undefined || toIndex === undefined) {
			issues.push(`transition ${fromId}->${toId}: unknown clip id`);
			continue;
		}
		if (toIndex !== fromIndex + 1) {
			issues.push(
				`transition ${fromId}->${toId}: clips are not adjacent in manifest order`
			);
			continue;
		}
		if (byCut.has(fromIndex)) {
			issues.push(`transition ${fromId}->${toId}: duplicate transition on cut`);
			continue;
		}
		byCut.set(fromIndex, transition);
	}
	return byCut;
}

function layoutClips({
	manifest,
	manifestSha256,
	projectId,
	sources,
	transitionsByCut,
	issues,
}: {
	manifest: ComposeManifest;
	manifestSha256: string;
	projectId: string;
	sources: Record<string, ComposeManifestSourceInfo>;
	transitionsByCut: ReadonlyMap<number, ComposeTransition>;
	issues: string[];
}): ClipLayout[] {
	const layouts: ClipLayout[] = [];
	let cursor = 0;
	for (const [index, clip] of manifest.clips.entries()) {
		const segment = resolveClipSegment({ clip, sources, issues });
		if (!segment) continue;
		const segmentOut = clip.trim.out ?? segment.sourceDuration;
		const inboundHalf = (transitionsByCut.get(index - 1)?.duration ?? 0) / 2;
		const outboundHalf = (transitionsByCut.get(index)?.duration ?? 0) / 2;
		const trimStart = clip.trim.in + inboundHalf;
		const trimEnd = segment.sourceDuration - segmentOut + outboundHalf;
		const duration = segment.sourceDuration - trimStart - trimEnd;
		if (duration < MIN_CLIP_SECONDS) {
			issues.push(
				`clip ${clip.id}: only ${duration.toFixed(3)}s remain after trims and transition handles`
			);
			continue;
		}
		layouts.push({
			clip,
			index,
			operationId: stableOperationId({
				manifestSha256,
				projectId,
				stablePath: `clips.${clip.id}`,
			}),
			sourceDuration: segment.sourceDuration,
			trimStart,
			trimEnd,
			startTime: cursor,
			duration,
			mediaKind: segment.mediaKind,
		});
		cursor += duration;
	}
	return layouts;
}

function filterStackSteps({
	clip,
	operationId,
}: {
	clip: ComposeClip;
	operationId: string;
}): ComposeFilterStep[] {
	return clip.filters.map((filter, index) => ({
		id: `${operationId}-f${index}`,
		asset: {
			provider: "local",
			assetType: "filter",
			assetId: filter.resourceId,
		},
		intensity: filter.intensity,
		enabled: true,
	}));
}

function overlayOperation({
	overlay,
	index,
	manifestSha256,
	projectId,
}: {
	overlay: ComposeOverlay;
	index: number;
	manifestSha256: string;
	projectId: string;
}): ComposePatchOperation {
	return {
		kind: "add-sticker",
		id: stableOperationId({
			manifestSha256,
			projectId,
			stablePath: `overlays.${index}`,
		}),
		startTime: overlay.start,
		duration: overlay.duration,
		asset: {
			provider: "local",
			assetType: "sticker",
			assetId: `manifest:${overlay.source}`,
			displayName: overlay.source,
			provenance: { manifestSource: overlay.source },
		},
		x: 0.5 + overlay.transform.x / 2,
		y: 0.5 + overlay.transform.y / 2,
		width: overlay.transform.scale,
		rotation: overlay.transform.rotation,
		opacity: overlay.opacity,
		maintainAspectRatio: true,
		animationInType: overlay.fadeIn > 0 ? "fade" : "none",
		animationInDuration: overlay.fadeIn > 0 ? overlay.fadeIn : undefined,
		animationOutType: overlay.fadeOut > 0 ? "fade" : "none",
		animationOutDuration: overlay.fadeOut > 0 ? overlay.fadeOut : undefined,
	};
}

function audioOperation({
	audio,
	index,
	manifestSha256,
	projectId,
	sources,
	issues,
}: {
	audio: ComposeAudio;
	index: number;
	manifestSha256: string;
	projectId: string;
	sources: Record<string, ComposeManifestSourceInfo>;
	issues: string[];
}): ComposePatchOperation | undefined {
	const info = sources[audio.source];
	const sourceDuration = info?.durationSeconds;
	const segmentOut = audio.trim.out ?? sourceDuration;
	if (segmentOut === undefined || !Number.isFinite(segmentOut)) {
		issues.push(
			`audio ${index}: source ${audio.source} needs trim.out or probe info`
		);
		return;
	}
	const duration = segmentOut - audio.trim.in;
	if (duration <= 0) {
		issues.push(`audio ${index}: trims leave no audible content`);
		return;
	}
	const trimEnd =
		sourceDuration !== undefined && Number.isFinite(sourceDuration)
			? Math.max(0, sourceDuration - segmentOut)
			: 0;
	return {
		kind: "add-sound-effect",
		id: stableOperationId({
			manifestSha256,
			projectId,
			stablePath: `audio.${index}`,
		}),
		startTime: audio.start,
		duration,
		asset: mediaAssetReference({ source: audio.source, mediaKind: "audio" }),
		volume: audio.volume,
		trimStart: audio.trim.in > 0 ? audio.trim.in : undefined,
		trimEnd: trimEnd > 0 ? trimEnd : undefined,
		fadeIn: audio.fadeIn > 0 ? audio.fadeIn : undefined,
		fadeOut: audio.fadeOut > 0 ? audio.fadeOut : undefined,
	};
}

export function compileComposeManifestToPatch({
	manifest,
	manifestSha256,
	projectId,
	snapshot,
	sources,
	createdAt,
}: CompileComposeManifestInput): CompiledComposeManifest {
	const issues: string[] = [];
	const warnings: string[] = [];
	const transitionsByCut = transitionSecondsByCut({ manifest, issues });
	const layouts = layoutClips({
		manifest,
		manifestSha256,
		projectId,
		sources,
		transitionsByCut,
		issues,
	});

	const operations: ComposePatchOperation[] = [];
	const layoutByIndex = new Map<number, ClipLayout>();
	for (const layout of layouts) {
		layoutByIndex.set(layout.index, layout);
		operations.push({
			kind: "insert-media-clip",
			id: layout.operationId,
			startTime: layout.startTime,
			duration: layout.duration,
			asset: mediaAssetReference({
				source: layout.clip.source,
				mediaKind: layout.mediaKind,
			}),
			mediaKind: layout.mediaKind,
			trackRole: "main-video",
			trimStart: layout.trimStart,
			trimEnd: layout.trimEnd,
			sourceDuration: layout.sourceDuration,
		});
		if (layout.clip.filters.length > 0) {
			operations.push({
				kind: "set-media-filter-stack",
				id: stableOperationId({
					manifestSha256,
					projectId,
					stablePath: `clips.${layout.clip.id}.filters`,
				}),
				startTime: layout.startTime,
				duration: layout.duration,
				trackId: layout.operationId,
				elementId: layout.operationId,
				filters: filterStackSteps({
					clip: layout.clip,
					operationId: layout.operationId,
				}),
			});
		}
	}

	for (const [cutIndex, transition] of transitionsByCut) {
		const fromLayout = layoutByIndex.get(cutIndex);
		const toLayout = layoutByIndex.get(cutIndex + 1);
		if (!fromLayout || !toLayout) continue;
		const cutTime = toLayout.startTime;
		operations.push({
			kind: "upsert-transition",
			id: stableOperationId({
				manifestSha256,
				projectId,
				stablePath: `transitions.${transition.between[0]}->${transition.between[1]}`,
			}),
			startTime: Math.max(0, cutTime - transition.duration / 2),
			duration: transition.duration,
			trackId: "main-video",
			fromElementId: fromLayout.operationId,
			toElementId: toLayout.operationId,
			presetId: transition.preset,
		});
	}

	for (const [index, overlay] of manifest.overlays.entries()) {
		operations.push(
			overlayOperation({ overlay, index, manifestSha256, projectId })
		);
	}
	for (const [index, audio] of manifest.audio.entries()) {
		const operation = audioOperation({
			audio,
			index,
			manifestSha256,
			projectId,
			sources,
			issues,
		});
		if (operation) operations.push(operation);
	}

	if (issues.length > 0) {
		throw new ComposeManifestCompileError({ issues });
	}

	const timelineDuration = layouts.reduce(
		(sum, layout) => sum + layout.duration,
		0
	);
	const patch: ComposePatch = {
		schemaVersion: 1,
		id: stableOperationId({
			manifestSha256,
			projectId,
			stablePath: `patch.${snapshot.id}`,
		}),
		source: "manifest-compiler",
		intentKind: "full-compose",
		mode: "idempotent",
		snapshotId: snapshot.id,
		sourceFingerprint: snapshot.sourceFingerprint,
		createdAt: createdAt ?? new Date().toISOString(),
		operations,
		warnings,
	};
	return { patch, timelineDuration, warnings };
}
