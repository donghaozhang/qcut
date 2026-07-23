import * as fs from "node:fs/promises";
import * as path from "node:path";
import { probeHasAudioStream } from "../../ffmpeg/utils.js";
import type { EditorApiClient } from "../editor/editor-api-client.js";
import { resolveJsonInput } from "../editor/editor-api-types.js";
import { verifyExportFrames } from "../editor/editor-export-verification.js";
import { prewarmEditorDemo } from "../editor/editor-demo-prewarm.js";
import { ensureEditorProjectReady } from "../editor/editor-project-readiness.js";
import { ensureEditorPreviewReady } from "../editor/editor-preview-readiness.js";
import { verifyRecordingArtifact } from "../editor/editor-recording-verification.js";
import { timelineApplyManifest } from "../editor/editor-timeline-apply.js";
import type { CLIRunOptions, CLIResult } from "./cli-runner/types.js";
import { runPointerSequence } from "./cli-handlers-pointer.js";

type JsonRecord = Record<string, unknown>;

type ProgressFn = (progress: {
	stage: string;
	percent: number;
	message: string;
}) => void;

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(record: JsonRecord, key: string): string | undefined {
	return typeof record[key] === "string" ? (record[key] as string) : undefined;
}

function booleanValue(record: JsonRecord, key: string): boolean | undefined {
	return typeof record[key] === "boolean"
		? (record[key] as boolean)
		: undefined;
}

function numberValue(record: JsonRecord, key: string): number | undefined {
	const value = record[key];
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function projectIdFromCreateResult(value: unknown): string | undefined {
	if (!isRecord(value)) return undefined;
	return stringValue(value, "projectId") ?? stringValue(value, "id");
}

function manifestHasAudioTrack(value: unknown): boolean {
	if (!isRecord(value) || !Array.isArray(value.tracks)) return false;
	return value.tracks.some(
		(track) => isRecord(track) && track.type === "audio"
	);
}

function parseFrameTimestamps(value: unknown): number[] {
	const values = Array.isArray(value)
		? value
		: typeof value === "string"
			? value.split(",")
			: [];
	return values
		.map((entry) =>
			typeof entry === "number" ? entry : Number(String(entry).trim())
		)
		.filter((entry) => Number.isFinite(entry) && entry >= 0);
}

async function resolvePlanJsonValue({
	value,
	planPath,
}: {
	value: unknown;
	planPath: string;
}): Promise<unknown> {
	if (typeof value !== "string") return value;
	if (!value.startsWith("@")) return await resolveJsonInput(value);
	const referencedPath = value.slice(1);
	const absolutePath = path.isAbsolute(referencedPath)
		? referencedPath
		: path.resolve(path.dirname(planPath), referencedPath);
	return await resolveJsonInput(`@${absolutePath}`);
}

async function resolveDemoActions({
	value,
	planPath,
}: {
	value: unknown;
	planPath: string;
}): Promise<unknown[] | undefined> {
	if (value === undefined) return;
	const resolved = await resolvePlanJsonValue({ value, planPath });
	if (Array.isArray(resolved)) return resolved;
	if (isRecord(resolved) && Array.isArray(resolved.actions)) {
		return resolved.actions;
	}
	throw new Error(
		"Demo actions must be a JSON array or an object with actions"
	);
}

function resolveRecordingPath({
	cliPath,
	planPath,
	plannedPath,
}: {
	cliPath?: string;
	planPath: string;
	plannedPath?: string;
}): string | undefined {
	if (cliPath) return path.resolve(cliPath);
	if (!plannedPath) return;
	return path.isAbsolute(plannedPath)
		? plannedPath
		: path.resolve(path.dirname(planPath), plannedPath);
}

function captureExpectedDurationMs({
	actionResult,
}: {
	actionResult: CLIResult;
}): number | undefined {
	if (!isRecord(actionResult.data) || !isRecord(actionResult.data.capture)) {
		return;
	}
	return numberValue(actionResult.data.capture, "expectedDurationMs");
}

async function resolveProject({
	client,
	options,
	plan,
}: {
	client: EditorApiClient;
	options: CLIRunOptions;
	plan: JsonRecord;
}): Promise<{
	projectId: string;
	created: boolean;
	readiness: unknown;
}> {
	const project = isRecord(plan.project) ? plan.project : {};
	let projectId =
		options.projectId ??
		stringValue(plan, "projectId") ??
		stringValue(project, "id") ??
		stringValue(project, "projectId");
	let created = false;

	if (!projectId && !stringValue(project, "name")) {
		const navigator = await client.get<{ activeProjectId?: string | null }>(
			"/api/claude/navigator/projects"
		);
		projectId = navigator.activeProjectId ?? undefined;
	}

	if (!projectId) {
		const name =
			stringValue(project, "name") ??
			stringValue(plan, "name") ??
			`QCut Demo ${new Date().toISOString().slice(0, 19)}`;
		const createdProject = await client.post("/api/claude/project/create", {
			name,
		});
		projectId = projectIdFromCreateResult(createdProject);
		if (!projectId) {
			throw new Error("QCut created the demo project without returning an ID");
		}
		created = true;
	}

	const readiness = await ensureEditorProjectReady({
		client,
		projectId,
		open: true,
		timeoutMs: options.timeoutMs ?? 15_000,
	});
	options.projectId = projectId;
	return { projectId, created, readiness };
}

async function runDemoExport({
	client,
	projectId,
	exportPlan,
	planPath,
	requireAudio,
	onProgress,
}: {
	client: EditorApiClient;
	projectId: string;
	exportPlan: JsonRecord;
	planPath: string;
	requireAudio: boolean;
	onProgress: ProgressFn;
}): Promise<{
	job: JsonRecord;
	outputPath: string;
	verification: JsonRecord;
}> {
	const {
		poll: _poll,
		timeout: _timeout,
		timeoutMs: _timeoutMs,
		verifyFrames: _verifyFrames,
		requireAudio: _requireAudio,
		enabled: _enabled,
		start: _start,
		...request
	} = exportPlan;
	const configuredOutput =
		stringValue(request, "outputPath") ?? stringValue(exportPlan, "output");
	const outputPath = path.resolve(
		configuredOutput ??
			path.join(
				path.dirname(planPath),
				`${path.basename(planPath, path.extname(planPath))}-export.mp4`
			)
	);
	request.outputPath = outputPath;

	onProgress({
		stage: "demo-export",
		percent: 0.8,
		message: "Starting final timeline export...",
	});
	const started = await client.post<{ jobId: string }>(
		`/api/claude/export/${encodeURIComponent(projectId)}/start`,
		request
	);
	const timeoutMs =
		numberValue(exportPlan, "timeoutMs") ??
		(numberValue(exportPlan, "timeout") ?? 600) * 1000;
	const job = await client.pollJob<JsonRecord>(
		`/api/claude/export/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(started.jobId)}`,
		{
			interval: 1000,
			timeout: timeoutMs,
			onProgress: (status) => {
				onProgress({
					stage: "demo-export",
					percent: 0.8 + (status.progress ?? 0) * 0.18,
					message: status.message ?? `Export ${status.status}`,
				});
			},
		}
	);
	const resolvedOutput = stringValue(job, "outputPath") ?? outputPath;
	const stats = await fs.stat(resolvedOutput);
	if (stats.size <= 0) throw new Error("Demo export is empty");

	const verification: JsonRecord = {
		bytes: stats.size,
		exists: true,
	};
	const timestamps = parseFrameTimestamps(exportPlan.verifyFrames);
	if (timestamps.length > 0) {
		verification.frames = await verifyExportFrames(resolvedOutput, timestamps);
	}
	if (requireAudio) {
		const hasAudio = await probeHasAudioStream({ mediaPath: resolvedOutput });
		verification.hasAudio = hasAudio;
		if (!hasAudio) {
			throw new Error(
				"Demo acceptance failed: final export does not contain audio"
			);
		}
	}
	return { job, outputPath: resolvedOutput, verification };
}

export async function runEditorDemo({
	client,
	options,
	onProgress,
}: {
	client: EditorApiClient;
	options: CLIRunOptions;
	onProgress: ProgressFn;
}): Promise<CLIResult> {
	if (!options.plan) return { success: false, error: "Missing --plan" };
	const planPath = path.resolve(options.plan.replace(/^@/, ""));
	const parsed = await resolveJsonInput(
		options.plan.startsWith("@") ? options.plan : `@${planPath}`
	);
	if (!isRecord(parsed)) {
		return { success: false, error: "Demo plan must be a JSON object" };
	}
	const plan = parsed;
	const stages: JsonRecord = {};

	onProgress({
		stage: "demo-project",
		percent: 0.05,
		message: "Preparing the demo project...",
	});
	const project = await resolveProject({ client, options, plan });
	stages.project = project;

	const capturePlan = isRecord(plan.capture) ? plan.capture : {};
	const manifest = plan.timeline ?? capturePlan.timeline ?? plan.manifest;
	const resolvedManifest = await resolvePlanJsonValue({
		value: manifest,
		planPath,
	});
	if (manifest !== undefined) {
		onProgress({
			stage: "demo-timeline",
			percent: 0.2,
			message: "Applying the demo timeline...",
		});
		const timeline = await timelineApplyManifest(client, {
			...options,
			projectId: project.projectId,
			manifest: JSON.stringify(resolvedManifest),
			replace:
				booleanValue(plan, "replace") ??
				(isRecord(resolvedManifest) && resolvedManifest.replace === true),
			atomic: true,
			verify: true,
		});
		if (!timeline.success) return timeline;
		stages.timeline = timeline.data;
	}

	const actions = await resolveDemoActions({
		value: capturePlan.actions ?? plan.actions,
		planPath,
	});
	const plannedRecording =
		stringValue(capturePlan, "record") ??
		stringValue(capturePlan, "outputPath") ??
		stringValue(plan, "record");
	const recordingPath = resolveRecordingPath({
		cliPath: options.record,
		planPath,
		plannedPath: plannedRecording,
	});
	if (recordingPath && !actions) {
		return {
			success: false,
			error: "Demo recording requires an actions array in the plan",
		};
	}
	if (recordingPath && actions) {
		const shouldPrewarm =
			booleanValue(capturePlan, "prewarm") ?? recordingPath !== undefined;
		onProgress({
			stage: "demo-prewarm",
			percent: 0.3,
			message: shouldPrewarm
				? "Prewarming editor panels and the preview frame..."
				: "Waiting for the preview frame...",
		});
		if (shouldPrewarm) {
			stages.prewarm = await prewarmEditorDemo({
				client,
				projectId: project.projectId,
				actions,
				startTime: numberValue(capturePlan, "startTime") ?? 0,
				timeoutMs: options.timeoutMs ?? 15_000,
				panelSettleMs: numberValue(capturePlan, "panelSettleMs") ?? 120,
			});
		} else {
			stages.preview = await ensureEditorPreviewReady({
				client,
				projectId: project.projectId,
				timeoutMs: options.timeoutMs ?? 15_000,
			});
		}
	}
	if (actions) {
		onProgress({
			stage: "demo-actions",
			percent: 0.4,
			message: recordingPath
				? "Recording semantic editor actions..."
				: "Running semantic editor actions...",
		});
		const eventTrack =
			options.eventTrack ??
			(recordingPath
				? path.join(
						path.dirname(recordingPath),
						`${path.basename(recordingPath, path.extname(recordingPath))}.pointer.json`
					)
				: undefined);
		const actionResult = await runPointerSequence({
			client,
			options: {
				...options,
				projectId: project.projectId,
				actions: JSON.stringify(actions),
				record: recordingPath,
				eventTrack,
				prerollMs:
					options.prerollMs ??
					numberValue(capturePlan, "prerollMs") ??
					(recordingPath ? 700 : 0),
				postrollMs:
					options.postrollMs ??
					numberValue(capturePlan, "postrollMs") ??
					(recordingPath ? 700 : 0),
			},
		});
		if (!actionResult.success) return actionResult;
		stages.actions = actionResult.data;
		if (recordingPath) {
			stages.recording = await verifyRecordingArtifact({
				filePath: recordingPath,
				expectedDurationMs: captureExpectedDurationMs({ actionResult }),
				toleranceMs: numberValue(capturePlan, "durationToleranceMs") ?? 250,
				verifyDuration: booleanValue(capturePlan, "verifyDuration") ?? true,
				verifyResolution: booleanValue(capturePlan, "verifyResolution") ?? true,
				minimumWidth: numberValue(capturePlan, "minimumWidth") ?? 1920,
				minimumHeight: numberValue(capturePlan, "minimumHeight") ?? 1080,
			});
		}
	}

	const exportValue = plan.export;
	const shouldExport =
		exportValue === true ||
		isRecord(exportValue) ||
		(exportValue === undefined && manifest !== undefined);
	let finalOutputPath = recordingPath;
	if (shouldExport) {
		const exportPlan = isRecord(exportValue) ? exportValue : {};
		const acceptance = isRecord(plan.acceptance) ? plan.acceptance : {};
		const requireAudio =
			booleanValue(exportPlan, "requireAudio") ??
			booleanValue(acceptance, "requireAudio") ??
			manifestHasAudioTrack(resolvedManifest);
		const exported = await runDemoExport({
			client,
			projectId: project.projectId,
			exportPlan,
			planPath,
			requireAudio,
			onProgress,
		});
		stages.export = exported;
		finalOutputPath = exported.outputPath;
	}

	onProgress({
		stage: "demo-complete",
		percent: 1,
		message: "Demo recording and acceptance checks completed.",
	});
	return {
		success: true,
		outputPath: finalOutputPath,
		data: {
			projectId: project.projectId,
			planPath,
			stages,
		},
	};
}
