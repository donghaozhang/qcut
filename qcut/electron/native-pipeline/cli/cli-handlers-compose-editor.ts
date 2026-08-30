import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
	createEditorClient,
	type EditorApiClient,
} from "../editor/editor-api-client.js";
import { resolveJsonInput } from "../editor/editor-api-types.js";
import { timelineApplyManifest } from "../editor/editor-timeline-apply.js";
import { captureComposeSnapshot } from "../compose/compose-snapshot.js";
import { timelineManifestFromComposePatch } from "../compose/compose-timeline-manifest.js";
import {
	hasComposeValidationErrors,
	validateComposePatch,
	validateComposeSnapshot,
	type ComposePatch,
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
}

const DEFAULT_DEPENDENCIES: ComposeEditorDependencies = {
	createClient: createEditorClient,
	capture: captureComposeSnapshot,
	applyManifest: timelineApplyManifest,
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
	_signal: AbortSignal,
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
		const issues = validateComposePatch({ snapshot, patch });
		if (hasComposeValidationErrors({ issues })) {
			return {
				success: false,
				error: "Compose patch failed validation; nothing was applied.",
				data: { issues },
				duration: (Date.now() - startedAt) / 1000,
			};
		}

		const projectId = options.projectId ?? snapshot.project.id;
		const plan = timelineManifestFromComposePatch({ patch, projectId });
		if (
			plan.plannedOperationIds.length === 0 &&
			plan.plannedTransitionOperationIds.length === 0
		) {
			return {
				success: true,
				data: {
					projectId,
					snapshotId: snapshot.id,
					patchId: patch.id,
					issues,
					applied: {},
					transitionIds: [],
					skipped: plan.skipped,
				},
				duration: (Date.now() - startedAt) / 1000,
			};
		}

		onProgress({
			stage: "processing",
			percent: 40,
			message: "Applying the compose patch to the editor timeline...",
		});
		const client: EditorApiClient = dependencies.createClient(options);
		const applyResult = await dependencies.applyManifest(client, {
			...options,
			projectId,
			manifest: JSON.stringify(plan.manifest),
		});
		if (!applyResult.success) {
			return {
				success: false,
				error: applyResult.error ?? "Timeline apply failed",
				data: { issues, skipped: plan.skipped, apply: applyResult.data },
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
				applied,
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
