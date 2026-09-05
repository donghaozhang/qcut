import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
	createEditorClient,
	type EditorApiClient,
} from "../editor/editor-api-client.js";
import { resolveJsonInput } from "../editor/editor-api-types.js";
import { verifyExportFrames } from "../editor/editor-export-verification.js";
import { timelineApplyManifest } from "../editor/editor-timeline-apply.js";
import { probeComposeMedia } from "../compose/compose-resolver.js";
import { resolveComposePatchAssets } from "../compose/compose-asset-resolver.js";
import { prepareComposeEditorAssets } from "../compose/compose-editor-asset-preparer.js";
import { rollbackStickerLabMedia } from "../editor/editor-sticker-runtime-import.js";
import { captureComposeSnapshot } from "../compose/compose-snapshot.js";
import {
	editorTransitionPreset,
	timelineManifestFromComposePatch,
} from "../compose/compose-timeline-manifest.js";
import {
	COMPOSE_MAIN_VIDEO_TRACK_ROLE,
	hasComposeValidationErrors,
	validateComposePatch,
	validateComposeSnapshot,
	type ComposePatch,
	type ComposePatchOperation,
	type ComposeSnapshot,
} from "../compose/compose-protocol.js";
import type {
	CLIResult,
	CLIRunOptions,
	ProgressFn,
} from "./cli-runner/types.js";

export interface ComposeEditorDependencies {
	createClient: typeof createEditorClient;
	capture: typeof captureComposeSnapshot;
	applyManifest: typeof timelineApplyManifest;
	resolveAssets: typeof resolveComposePatchAssets;
	prepareAssets: typeof prepareComposeEditorAssets;
	rollbackStickerMedia: typeof rollbackStickerLabMedia;
	probeOutput: typeof probeComposeMedia;
	verifyFrames: typeof verifyExportFrames;
}

const DEFAULT_DEPENDENCIES: ComposeEditorDependencies = {
	createClient: createEditorClient,
	capture: captureComposeSnapshot,
	applyManifest: timelineApplyManifest,
	resolveAssets: resolveComposePatchAssets,
	prepareAssets: prepareComposeEditorAssets,
	rollbackStickerMedia: rollbackStickerLabMedia,
	probeOutput: probeComposeMedia,
	verifyFrames: verifyExportFrames,
};

function errorMessage({ error }: { error: unknown }): string {
	return error instanceof Error ? error.message : String(error);
}

/** Accepts `@file`/`-` (resolveJsonInput semantics) and bare file paths. */
export async function loadComposeJsonArgument({
	value,
}: {
	value: string;
}): Promise<unknown> {
	if (!value.startsWith("@") && value !== "-" && existsSync(value)) {
		return JSON.parse(readFileSync(value, "utf-8"));
	}
	return resolveJsonInput(value);
}

export async function loadComposeSnapshotAndPatch({
	options,
}: {
	options: CLIRunOptions;
}): Promise<{ snapshot: ComposeSnapshot; patch: ComposePatch }> {
	if (!options.snapshot || !options.patch) {
		throw new Error(
			"Patch mode needs both --snapshot and --patch JSON inputs."
		);
	}
	const snapshot = (await loadComposeJsonArgument({
		value: options.snapshot,
	})) as ComposeSnapshot;
	const patch = (await loadComposeJsonArgument({
		value: options.patch,
	})) as ComposePatch;
	return { snapshot, patch };
}

export async function handleComposeSnapshot(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	signal: AbortSignal,
	dependencies: ComposeEditorDependencies = DEFAULT_DEPENDENCIES
): Promise<CLIResult> {
	const startedAt = Date.now();
	try {
		onProgress({
			stage: "validating",
			percent: 10,
			message: "Reading the live QCut timeline...",
		});
		const client = dependencies.createClient(options);
		const snapshot = await dependencies.capture({
			client,
			projectId: options.projectId,
			visualAnalysis: options.analysisType === "visual",
			includeAnalysis: true,
			signal,
		});
		const issues = validateComposeSnapshot({ snapshot });
		let outputPath: string | undefined;
		if (options.output) {
			outputPath = resolve(options.output);
			await mkdir(dirname(outputPath), { recursive: true });
			await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
		}
		onProgress({
			stage: "complete",
			percent: 100,
			message: "Compose snapshot captured",
		});
		return {
			success: true,
			...(outputPath ? { outputPath, outputPaths: [outputPath] } : {}),
			data: {
				snapshotId: snapshot.id,
				projectId: snapshot.project.id,
				sourceFingerprint: snapshot.sourceFingerprint,
				mediaCount: snapshot.media.length,
				captionCount: snapshot.captions.length,
				issues,
				snapshot,
			},
			duration: (Date.now() - startedAt) / 1000,
		};
	} catch (error) {
		return {
			success: false,
			error: `Compose snapshot failed: ${errorMessage({ error })}`,
			duration: (Date.now() - startedAt) / 1000,
		};
	}
}

/** Operation kinds that create timeline elements keyed by operation id. */
export const ELEMENT_CREATING_KINDS = new Set<ComposePatchOperation["kind"]>([
	"add-caption",
	"add-text-overlay",
	"add-sticker",
	"add-sound-effect",
	"insert-media-clip",
	"add-filter-layer",
]);

export interface LiveTimelineState {
	elementIds: Set<string>;
	transitionFingerprints: Set<string>;
	mainTrackId?: string;
}

function transitionFingerprint({
	duration,
	fromElementId,
	presetId,
	toElementId,
	trackId,
}: {
	duration: unknown;
	fromElementId: unknown;
	presetId: unknown;
	toElementId: unknown;
	trackId: unknown;
}): string | null {
	if (
		typeof trackId !== "string" ||
		typeof fromElementId !== "string" ||
		typeof toElementId !== "string" ||
		typeof presetId !== "string" ||
		typeof duration !== "number" ||
		!Number.isFinite(duration)
	) {
		return null;
	}
	return JSON.stringify([
		trackId,
		fromElementId,
		toElementId,
		presetId,
		duration,
	]);
}

/**
 * Reads the live timeline so a replayed patch can recognize already-applied
 * operations: additive elements carry their operation id as the element id,
 * and transitions are matched against their complete editable identity.
 */
export async function readLiveTimelineState({
	client,
	projectId,
}: {
	client: EditorApiClient;
	projectId: string;
}): Promise<LiveTimelineState> {
	const timeline = await client.get<{
		tracks?: Array<{
			id?: string;
			isMain?: boolean;
			elements?: Array<{ id?: string }>;
			transitions?: Array<{
				duration?: number;
				fromElementId?: string;
				presetId?: string;
				toElementId?: string;
			}>;
		}>;
	}>(`/api/claude/timeline/${encodeURIComponent(projectId)}`);
	const elementIds = new Set<string>();
	const transitionFingerprints = new Set<string>();
	let mainTrackId: string | undefined;
	for (const track of timeline.tracks ?? []) {
		if (track.isMain && typeof track.id === "string") {
			mainTrackId = track.id;
		}
		for (const element of track.elements ?? []) {
			if (typeof element.id === "string") elementIds.add(element.id);
		}
		for (const transition of track.transitions ?? []) {
			const fingerprint = transitionFingerprint({
				duration: transition.duration,
				fromElementId: transition.fromElementId,
				presetId: transition.presetId,
				toElementId: transition.toElementId,
				trackId: track.id,
			});
			if (fingerprint) transitionFingerprints.add(fingerprint);
		}
	}
	return { elementIds, transitionFingerprints, mainTrackId };
}

function splitAlreadyApplied({
	patch,
	live,
}: {
	patch: ComposePatch;
	live: LiveTimelineState;
}): { operations: ComposePatchOperation[]; alreadyApplied: string[] } {
	const operations: ComposePatchOperation[] = [];
	const alreadyApplied: string[] = [];
	for (const operation of patch.operations) {
		const transitionIdentity =
			operation.kind === "upsert-transition"
				? transitionFingerprint({
						duration: operation.duration,
						fromElementId: operation.fromElementId,
						// Live transitions store the EDITOR vocabulary: presets
						// are mapped (crossfade → dissolve) and pending-clip
						// transitions land on the real main track, so the
						// operation side normalizes the same way before matching.
						presetId: editorTransitionPreset({
							presetId: operation.presetId,
						}),
						toElementId: operation.toElementId,
						trackId:
							operation.trackId === COMPOSE_MAIN_VIDEO_TRACK_ROLE
								? (live.mainTrackId ?? operation.trackId)
								: operation.trackId,
					})
				: null;
		const replayed =
			(ELEMENT_CREATING_KINDS.has(operation.kind) &&
				live.elementIds.has(operation.id)) ||
			(transitionIdentity !== null &&
				live.transitionFingerprints.has(transitionIdentity));
		if (replayed) alreadyApplied.push(operation.id);
		else operations.push(operation);
	}
	return { operations, alreadyApplied };
}

/** Best-effort delete of prepared-but-unused imports; returns failure text. */
async function rollbackPreparedMedia({
	cause,
	client,
	context,
	dependencies,
	mediaIds,
	projectId,
}: {
	cause: unknown;
	client: EditorApiClient;
	context: string;
	dependencies: ComposeEditorDependencies;
	mediaIds: readonly string[];
	projectId: string;
}): Promise<string | undefined> {
	if (mediaIds.length === 0) return;
	try {
		await dependencies.rollbackStickerMedia({
			cause,
			client,
			context,
			mediaIds,
			projectId,
		});
		return;
	} catch (error) {
		return errorMessage({ error });
	}
}

export async function handleComposeApply(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	_signal: AbortSignal,
	dependencies: ComposeEditorDependencies = DEFAULT_DEPENDENCIES
): Promise<CLIResult> {
	const startedAt = Date.now();
	try {
		const { snapshot, patch } = await loadComposeSnapshotAndPatch({ options });
		onProgress({
			stage: "validating",
			percent: 10,
			message: "Validating the patch against its snapshot...",
		});
		const assets = await dependencies.resolveAssets({ patch });
		const issues = [
			...validateComposePatch({ snapshot, patch }),
			...assets.issues,
		];
		if (hasComposeValidationErrors({ issues })) {
			return {
				success: false,
				error: "Compose patch failed validation; nothing was applied.",
				data: { issues },
				duration: (Date.now() - startedAt) / 1000,
			};
		}

		const projectId = options.projectId ?? snapshot.project.id;
		// The client exists before any asset work: sticker imports go through
		// it, and replay detection needs the live timeline.
		const client: EditorApiClient = dependencies.createClient(options);
		const live = await readLiveTimelineState({ client, projectId });
		const { operations, alreadyApplied } = splitAlreadyApplied({
			patch,
			live,
		});

		onProgress({
			stage: "processing",
			percent: 25,
			message: "Preparing lab assets for the editor...",
		});
		let prepared: Awaited<ReturnType<typeof prepareComposeEditorAssets>>;
		try {
			prepared = await dependencies.prepareAssets({
				patch: { ...patch, operations },
				client,
				projectId,
				scratchDirectory: resolve(options.outputDir, "compose-assets"),
			});
		} catch (error) {
			// The preparer already rolled back its own sticker imports.
			return {
				success: false,
				error: `Compose asset preparation failed: ${errorMessage({ error })}`,
				data: { issues, alreadyAppliedOperationIds: alreadyApplied },
				duration: (Date.now() - startedAt) / 1000,
			};
		}

		const plan = timelineManifestFromComposePatch({
			patch: prepared.patch,
			projectId,
			snapshot,
			bindings: prepared.bindings,
			mainVideoTrackId: live.mainTrackId,
		});
		if (
			plan.plannedOperationIds.length === 0 &&
			plan.plannedTransitionOperationIds.length === 0 &&
			plan.plannedUpdateOperationIds.length === 0
		) {
			// Nothing will reach the timeline, so prepared-but-unused imports
			// must not linger in the project's media library.
			const cleanupError = await rollbackPreparedMedia({
				cause: new Error("Compose patch planned no operations"),
				client,
				context: "Compose apply had nothing to do",
				dependencies,
				mediaIds: prepared.importedMediaIds,
				projectId,
			});
			return {
				success: cleanupError === undefined,
				...(cleanupError
					? { error: `Unused compose media cleanup failed: ${cleanupError}` }
					: {}),
				data: {
					projectId,
					snapshotId: snapshot.id,
					patchId: patch.id,
					issues,
					assets: assets.reports,
					applied: {},
					alreadyAppliedOperationIds: alreadyApplied,
					transitionIds: [],
					skipped: plan.skipped,
					importedMediaCount: 0,
				},
				duration: (Date.now() - startedAt) / 1000,
			};
		}

		onProgress({
			stage: "processing",
			percent: 40,
			message: "Applying the compose patch to the editor timeline...",
		});
		const applyResult = await dependencies.applyManifest(client, {
			...options,
			projectId,
			manifest: JSON.stringify(plan.manifest),
		});
		if (!applyResult.success) {
			// Apply or read-back verification failed: the timeline rolled back,
			// so this run's imported sticker media must go too.
			const cleanupError = await rollbackPreparedMedia({
				cause: new Error(applyResult.error ?? "Timeline apply failed"),
				client,
				context: "Compose apply failed",
				dependencies,
				mediaIds: prepared.importedMediaIds,
				projectId,
			});
			return {
				success: false,
				error: cleanupError ?? applyResult.error ?? "Timeline apply failed",
				data: {
					issues,
					skipped: plan.skipped,
					alreadyAppliedOperationIds: alreadyApplied,
					apply: applyResult.data,
				},
				duration: (Date.now() - startedAt) / 1000,
			};
		}

		const createdElements =
			(applyResult.data as { elements?: Record<string, string> } | undefined)
				?.elements ?? {};
		const applied: Record<string, string> = {};
		for (const operationId of plan.plannedOperationIds) {
			if (createdElements[operationId]) {
				applied[operationId] = createdElements[operationId];
			}
		}
		onProgress({
			stage: "complete",
			percent: 100,
			message: "Compose patch applied",
		});
		return {
			success: true,
			data: {
				projectId,
				snapshotId: snapshot.id,
				patchId: patch.id,
				issues,
				assets: assets.reports,
				applied,
				alreadyAppliedOperationIds: alreadyApplied,
				importedMediaCount: prepared.importedMediaIds.length,
				appliedUpdateOperationIds: plan.plannedUpdateOperationIds,
				transitionOperationIds: plan.plannedTransitionOperationIds,
				transitionIds:
					(applyResult.data as { transitionIds?: string[] } | undefined)
						?.transitionIds ?? [],
				skipped: plan.skipped,
				verified:
					(applyResult.data as { verified?: boolean } | undefined)?.verified ??
					false,
			},
			duration: (Date.now() - startedAt) / 1000,
		};
	} catch (error) {
		return {
			success: false,
			error: `Compose apply failed: ${errorMessage({ error })}`,
			duration: (Date.now() - startedAt) / 1000,
		};
	}
}

interface ComposeApplyData {
	projectId: string;
	snapshotId: string;
	patchId: string;
	issues: unknown[];
	assets: unknown[];
	applied: Record<string, string>;
	skipped: unknown[];
}

/**
 * Renders a compose patch through the real editor: apply, export over the
 * Claude bridge, probe the output, and write a render report that ties the
 * result back to its snapshot, patch, and export job.
 */
export async function handleComposeRenderPatch(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	signal: AbortSignal,
	dependencies: ComposeEditorDependencies = DEFAULT_DEPENDENCIES
): Promise<CLIResult> {
	const startedAt = Date.now();
	try {
		const target = options.target ?? "editor";
		if (target !== "editor") {
			throw new Error(
				"Patch mode renders through the editor (--target editor); headless rendering takes --config."
			);
		}
		const applyResult = await handleComposeApply(
			options,
			onProgress,
			signal,
			dependencies
		);
		if (!applyResult.success) return applyResult;
		const applyData = applyResult.data as ComposeApplyData;

		const outputPath = resolve(
			options.output ??
				join(options.outputDir, `compose-render-${Date.now()}.mp4`)
		);
		onProgress({
			stage: "processing",
			percent: 60,
			message: "Exporting the composed timeline...",
		});
		const client = dependencies.createClient(options);
		const exportBase = `/api/claude/export/${encodeURIComponent(applyData.projectId)}`;
		const started = await client.post<{ jobId: string }>(
			`${exportBase}/start`,
			{ outputPath }
		);
		await client.pollJob(`${exportBase}/jobs/${started.jobId}`, {
			interval: (options.pollInterval ?? 3) * 1000,
			timeout: (options.timeout ?? 600) * 1000,
			onProgress: (job) => {
				onProgress({
					stage: "polling",
					percent: 60 + Math.round(((job.progress as number) ?? 0) * 0.3),
					message: (job.message as string) ?? `Export: ${job.status}`,
				});
			},
		});

		const probe = await dependencies.probeOutput({
			filePath: outputPath,
			signal,
		});
		let frames: Awaited<ReturnType<typeof verifyExportFrames>> | undefined;
		if (options.verifyFrames) {
			const timestamps = options.verifyFrames
				.split(",")
				.map((value) => Number(value.trim()));
			if (timestamps.some((value) => !Number.isFinite(value))) {
				throw new Error(
					`Invalid --verify-frames values: ${options.verifyFrames}`
				);
			}
			frames = await dependencies.verifyFrames(outputPath, timestamps);
		}

		const report = {
			schemaVersion: 1,
			kind: "qcut-compose-render-report-v1",
			target: "editor",
			projectId: applyData.projectId,
			snapshotId: applyData.snapshotId,
			patchId: applyData.patchId,
			appliedOperationIds: Object.keys(applyData.applied),
			skipped: applyData.skipped,
			issues: applyData.issues,
			assets: applyData.assets,
			export: { jobId: started.jobId, outputPath },
			probe,
			...(frames ? { frames: frames.frames } : {}),
		};
		const reportPath = resolve(
			join(options.outputDir, `compose-render-report-${started.jobId}.json`)
		);
		await mkdir(dirname(reportPath), { recursive: true });
		await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
		onProgress({
			stage: "complete",
			percent: 100,
			message: "Compose render verified",
		});
		return {
			success: true,
			outputPath,
			outputPaths: [outputPath, reportPath],
			data: { ...report, reportPath },
			duration: (Date.now() - startedAt) / 1000,
		};
	} catch (error) {
		return {
			success: false,
			error: `Compose render failed: ${errorMessage({ error })}`,
			duration: (Date.now() - startedAt) / 1000,
		};
	}
}
