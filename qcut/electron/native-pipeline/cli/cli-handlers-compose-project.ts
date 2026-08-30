/**
 * `qcut compose project --target editor`: builds a real, editable QCut
 * project from a compose manifest through the running desktop app.
 *
 * Flow: create/open the project, capture its compose snapshot, compile the
 * manifest into an editor patch, apply it atomically (compose apply owns
 * validation, asset preparation, timeline transaction, and read-back), then
 * prove persistence by navigating away and reopening before checking every
 * created element is still on the timeline.
 *
 * Compensation: when this run created the project and any later step fails,
 * the project is deleted again; the original error always stays primary.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { buildComposeEditorProjectPatch } from "../compose/compose-editor-project.js";
import { captureComposeSnapshot } from "../compose/compose-snapshot.js";
import {
	createEditorClient,
	type EditorApiClient,
} from "../editor/editor-api-client.js";
import { ensureEditorProjectReady } from "../editor/editor-project-readiness.js";
import {
	handleComposeApply,
	readLiveTimelineState,
} from "./cli-handlers-compose-editor.js";
import type {
	CLIResult,
	CLIRunOptions,
	ProgressFn,
} from "./cli-runner/types.js";

export interface ComposeEditorProjectDependencies {
	createClient: typeof createEditorClient;
	capture: typeof captureComposeSnapshot;
	build: typeof buildComposeEditorProjectPatch;
	apply: typeof handleComposeApply;
	ensureReady: typeof ensureEditorProjectReady;
	readTimeline: typeof readLiveTimelineState;
}

const DEFAULT_DEPENDENCIES: ComposeEditorProjectDependencies = {
	createClient: createEditorClient,
	capture: captureComposeSnapshot,
	build: buildComposeEditorProjectPatch,
	apply: handleComposeApply,
	ensureReady: ensureEditorProjectReady,
	readTimeline: readLiveTimelineState,
};

interface ComposeApplySummary {
	applied?: Record<string, string>;
	skipped?: Array<{ operationId?: string; reason?: string }>;
	alreadyAppliedOperationIds?: string[];
	transitionIds?: string[];
	[key: string]: unknown;
}

function errorMessage({ error }: { error: unknown }): string {
	return error instanceof Error ? error.message : String(error);
}

function optionError({ message }: { message: string }): CLIResult {
	return { success: false, error: message };
}

async function createEditorProject({
	client,
	name,
}: {
	client: EditorApiClient;
	name: string;
}): Promise<string> {
	const data = await client.post<{ projectId?: string; id?: string }>(
		"/api/claude/project/create",
		{ name }
	);
	const projectId = data.projectId ?? data.id;
	if (!projectId) {
		throw new Error("QCut created the project but returned no project id.");
	}
	return projectId;
}

async function listEditorProjectIds({
	client,
}: {
	client: EditorApiClient;
}): Promise<string[]> {
	try {
		const data = await client.get<unknown>("/api/claude/navigator/projects");
		const rows = Array.isArray(data)
			? data
			: Array.isArray((data as { projects?: unknown[] })?.projects)
				? ((data as { projects: unknown[] }).projects ?? [])
				: [];
		return rows.flatMap((row) => {
			const id = (row as { id?: unknown })?.id;
			return typeof id === "string" ? [id] : [];
		});
	} catch {
		return [];
	}
}

/**
 * Navigates to another project (when one exists) and back, then checks that
 * every expected element survived the reopen. This is the CLI-level
 * save/close/reopen gate; full app-restart persistence stays an E2E concern.
 */
async function reopenAndVerify({
	client,
	projectId,
	expectedElementIds,
	timeoutMs,
	dependencies,
}: {
	client: EditorApiClient;
	projectId: string;
	expectedElementIds: readonly string[];
	timeoutMs?: number;
	dependencies: ComposeEditorProjectDependencies;
}): Promise<{ navigatedAway: boolean; missingElementIds: string[] }> {
	const otherProjectId = (await listEditorProjectIds({ client })).find(
		(candidate) => candidate !== projectId
	);
	if (otherProjectId) {
		await client.post("/api/claude/navigator/open", {
			projectId: otherProjectId,
		});
		await dependencies.ensureReady({
			client,
			projectId: otherProjectId,
			open: false,
			timeoutMs,
		});
	}
	await client.post("/api/claude/navigator/open", { projectId });
	await dependencies.ensureReady({ client, projectId, open: true, timeoutMs });
	const live = await dependencies.readTimeline({ client, projectId });
	return {
		navigatedAway: Boolean(otherProjectId),
		missingElementIds: expectedElementIds.filter(
			(elementId) => !live.elementIds.has(elementId)
		),
	};
}

export async function handleComposeEditorProject(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	signal: AbortSignal,
	dependencies: ComposeEditorProjectDependencies = DEFAULT_DEPENDENCIES
): Promise<CLIResult> {
	const startedAt = Date.now();
	if (!options.config) {
		return optionError({ message: "Missing --config manifest path" });
	}
	if (options.projectDir) {
		return optionError({
			message:
				"--project-dir belongs to the portable bundle mode and conflicts with --target editor.",
		});
	}
	if (options.name && options.projectId) {
		return optionError({
			message: "--name and --project-id are mutually exclusive.",
		});
	}
	if (!options.name && !options.projectId) {
		return optionError({
			message:
				"Pass --name to create a project or --project-id to write into one.",
		});
	}

	const client = dependencies.createClient(options);
	let createdProjectId: string | undefined;
	try {
		onProgress({
			stage: "validating",
			percent: 5,
			message: "Preparing the target QCut project...",
		});
		if (options.name) {
			createdProjectId = await createEditorProject({
				client,
				name: options.name,
			});
		}
		const projectId = createdProjectId ?? options.projectId;
		if (!projectId) throw new Error("No target project id.");
		await dependencies.ensureReady({
			client,
			projectId,
			open: true,
			timeoutMs: options.timeoutMs,
		});

		onProgress({
			stage: "processing",
			percent: 15,
			message: "Capturing the compose snapshot...",
		});
		const snapshot = await dependencies.capture({ client, projectId });

		onProgress({
			stage: "processing",
			percent: 25,
			message: "Compiling the compose manifest into an editor patch...",
		});
		const build = await dependencies.build({
			configPath: options.config,
			projectId,
			snapshot,
			signal,
		});

		const workDirectory = resolve(options.outputDir, "compose-project-editor");
		await mkdir(workDirectory, { recursive: true });
		const snapshotPath = join(workDirectory, `${snapshot.id}.snapshot.json`);
		const patchPath = join(workDirectory, `${build.patch.id}.patch.json`);
		await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
		await writeFile(patchPath, `${JSON.stringify(build.patch, null, 2)}\n`);

		const applyResult = await dependencies.apply(
			{ ...options, projectId, snapshot: snapshotPath, patch: patchPath },
			onProgress,
			signal
		);
		if (!applyResult.success) {
			throw new Error(applyResult.error ?? "Compose apply failed.");
		}
		const applyData = (applyResult.data ?? {}) as ComposeApplySummary;
		const skipped = applyData.skipped ?? [];
		if (skipped.length > 0) {
			throw new Error(
				`Compose apply skipped operations instead of applying them: ${skipped
					.map((entry) => `${entry.operationId} (${entry.reason})`)
					.join("; ")}`
			);
		}
		const appliedElementIds = [
			...Object.keys(applyData.applied ?? {}),
			...(applyData.alreadyAppliedOperationIds ?? []),
		];

		let reopen: Awaited<ReturnType<typeof reopenAndVerify>> | undefined;
		if (options.verify !== false) {
			onProgress({
				stage: "processing",
				percent: 85,
				message: "Reopening the project to verify persistence...",
			});
			reopen = await reopenAndVerify({
				client,
				projectId,
				expectedElementIds: appliedElementIds,
				timeoutMs: options.timeoutMs,
				dependencies,
			});
			if (reopen.missingElementIds.length > 0) {
				throw new Error(
					`Elements disappeared after reopen: ${reopen.missingElementIds.join(", ")}`
				);
			}
		}

		onProgress({
			stage: "complete",
			percent: 100,
			message: "Editable compose project ready",
		});
		return {
			success: true,
			outputPaths: [snapshotPath, patchPath],
			data: {
				projectId,
				createdProject: Boolean(createdProjectId),
				manifestSha256: build.manifestSha256,
				timelineDuration: build.timelineDuration,
				snapshotId: snapshot.id,
				patchId: build.patch.id,
				operationCount: build.patch.operations.length,
				apply: applyData,
				...(reopen ? { reopen } : {}),
			},
			duration: (Date.now() - startedAt) / 1000,
		};
	} catch (error) {
		const primary = errorMessage({ error });
		let cleanup: string | undefined;
		if (createdProjectId) {
			try {
				await client.post("/api/claude/project/delete", {
					projectId: createdProjectId,
				});
				cleanup = `created project ${createdProjectId} was deleted again`;
			} catch (cleanupError) {
				cleanup = `created project ${createdProjectId} could not be deleted: ${errorMessage(
					{ error: cleanupError }
				)}`;
			}
		}
		return {
			success: false,
			error: `Compose editor project failed: ${primary}${
				cleanup ? ` (cleanup: ${cleanup})` : ""
			}`,
			data: { createdProjectId },
			duration: (Date.now() - startedAt) / 1000,
		};
	}
}
