/**
 * Editor Handlers — Generate + Export + Diagnostics + MCP
 *
 * CLI handlers for editor:generate:*, editor:export:*,
 * editor:diagnostics:*, and editor:mcp:* commands.
 * Each handler proxies to the QCut HTTP API via EditorApiClient.
 *
 * @module electron/native-pipeline/editor-handlers-generate
 */

import * as fs from "fs";
import type { EditorApiClient } from "../editor/editor-api-client.js";
import type { CLIRunOptions, CLIResult } from "../cli/cli-runner/types.js";
import { resolveJsonInput } from "./editor-api-types.js";
import { jsonPending } from "../cli/json-output.js";

type ProgressFn = (progress: {
	stage: string;
	percent: number;
	message: string;
}) => void;

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export async function handleGenerateExportCommand(
	client: EditorApiClient,
	options: CLIRunOptions,
	onProgress: ProgressFn
): Promise<CLIResult> {
	const parts = options.command.split(":");
	const module = parts[1];
	const action = parts.slice(2).join(":");

	try {
		switch (module) {
			case "generate":
				return await dispatchGenerate(client, action, options, onProgress);
			case "export":
				return await dispatchExport(client, action, options, onProgress);
			case "diagnostics":
				return await dispatchDiagnostics(client, action, options);
			case "mcp":
				return await dispatchMcp(client, action, options);
			default:
				return { success: false, error: `Unknown module: ${module}` };
		}
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

// ---------------------------------------------------------------------------
// Generate dispatcher
// ---------------------------------------------------------------------------

async function dispatchGenerate(
	client: EditorApiClient,
	action: string,
	opts: CLIRunOptions,
	onProgress: ProgressFn
): Promise<CLIResult> {
	switch (action) {
		case "start":
			return generateStart(client, opts, onProgress);
		case "status":
			return generateStatus(client, opts);
		case "list-jobs":
			return generateListJobs(client, opts);
		case "cancel":
			return generateCancel(client, opts);
		case "models":
			return generateModels(client);
		case "estimate-cost":
			return generateEstimateCost(client, opts);
		default:
			return { success: false, error: `Unknown generate action: ${action}` };
	}
}

// ---------------------------------------------------------------------------
// Generate handlers
// ---------------------------------------------------------------------------

async function generateStart(
	client: EditorApiClient,
	opts: CLIRunOptions,
	onProgress: ProgressFn
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	if (!opts.model) return { success: false, error: "Missing --model" };
	if (!opts.text && !opts.prompt)
		return { success: false, error: "Missing --prompt or --text" };

	const body: Record<string, unknown> = {
		model: opts.model,
		prompt: opts.text ?? opts.prompt,
	};
	if (opts.imageUrl) body.imageUrl = opts.imageUrl;
	if (opts.videoUrl) body.videoUrl = opts.videoUrl;
	if (opts.duration) body.duration = parseFloat(opts.duration);
	if (opts.aspectRatio) body.aspectRatio = opts.aspectRatio;
	if (opts.resolution) body.resolution = opts.resolution;
	if (opts.negativePrompt) body.negativePrompt = opts.negativePrompt;
	if (opts.addToTimeline) body.addToTimeline = true;
	if (opts.trackId) body.trackId = opts.trackId;
	if (opts.startTime !== undefined) body.startTime = opts.startTime;

	const startResult = await client.post<{ jobId: string }>(
		`/api/claude/generate/${opts.projectId}/start`,
		body
	);

	if (!opts.poll) {
		return { success: true, data: startResult };
	}

	if (opts.json) jsonPending(startResult.jobId);
	onProgress({
		stage: "polling",
		percent: 0,
		message: `Generate job ${startResult.jobId} started...`,
	});

	const result = await client.pollJob(
		`/api/claude/generate/${opts.projectId}/jobs/${startResult.jobId}`,
		{
			interval: (opts.pollInterval ?? 3) * 1000,
			timeout: (opts.timeout ?? 300) * 1000,
			onProgress: (job) => {
				onProgress({
					stage: "polling",
					percent: job.progress ?? 0,
					message: job.message ?? `Status: ${job.status}`,
				});
			},
		}
	);

	return { success: true, data: result };
}

async function generateStatus(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	if (!opts.jobId) return { success: false, error: "Missing --job-id" };

	const data = await client.get(
		`/api/claude/generate/${opts.projectId}/jobs/${opts.jobId}`
	);
	return { success: true, data };
}

async function generateListJobs(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };

	const data = await client.get(`/api/claude/generate/${opts.projectId}/jobs`);
	return { success: true, data };
}

async function generateCancel(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	if (!opts.jobId) return { success: false, error: "Missing --job-id" };

	const data = await client.post(
		`/api/claude/generate/${opts.projectId}/jobs/${opts.jobId}/cancel`
	);
	return { success: true, data };
}

async function generateModels(client: EditorApiClient): Promise<CLIResult> {
	const data = await client.get("/api/claude/generate/models");
	return { success: true, data };
}

async function generateEstimateCost(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.model) return { success: false, error: "Missing --model" };

	const body: Record<string, unknown> = { model: opts.model };
	if (opts.duration) body.duration = parseFloat(opts.duration);
	if (opts.resolution) body.resolution = opts.resolution;

	const data = await client.post("/api/claude/generate/estimate-cost", body);
	return { success: true, data };
}

// ---------------------------------------------------------------------------
// Export dispatcher
// ---------------------------------------------------------------------------

async function dispatchExport(
	client: EditorApiClient,
	action: string,
	opts: CLIRunOptions,
	onProgress: ProgressFn
): Promise<CLIResult> {
	switch (action) {
		case "presets":
			return exportPresets(client);
		case "recommend":
			return exportRecommend(client, opts);
		case "start":
			return exportStart(client, opts, onProgress);
		case "status":
			return exportStatus(client, opts);
		case "list-jobs":
			return exportListJobs(client, opts);
		default:
			return { success: false, error: `Unknown export action: ${action}` };
	}
}

// ---------------------------------------------------------------------------
// Export handlers
// ---------------------------------------------------------------------------

async function exportPresets(client: EditorApiClient): Promise<CLIResult> {
	const data = await client.get("/api/claude/export/presets");
	return { success: true, data };
}

async function exportRecommend(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	if (!opts.target)
		return {
			success: false,
			error: "Missing --target (e.g. youtube, tiktok, instagram-reel)",
		};

	const data = await client.get(
		`/api/claude/export/${opts.projectId}/recommend/${opts.target}`
	);
	return { success: true, data };
}

async function exportStart(
	client: EditorApiClient,
	opts: CLIRunOptions,
	onProgress: ProgressFn
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };

	const body: Record<string, unknown> = {};
	if (opts.preset) body.preset = opts.preset;
	if (opts.data) {
		const settings = await resolveJsonInput(opts.data);
		body.settings = settings;
	}
	if (opts.outputDir && opts.outputDir !== "./output") {
		body.outputPath = opts.outputDir;
	}

	const startResult = await client.post<{ jobId: string }>(
		`/api/claude/export/${opts.projectId}/start`,
		body
	);

	if (!opts.poll) {
		return { success: true, data: startResult };
	}

	if (opts.json) jsonPending(startResult.jobId);
	onProgress({
		stage: "polling",
		percent: 0,
		message: `Export job ${startResult.jobId} started...`,
	});

	const result = await client.pollJob(
		`/api/claude/export/${opts.projectId}/jobs/${startResult.jobId}`,
		{
			interval: (opts.pollInterval ?? 3) * 1000,
			timeout: (opts.timeout ?? 600) * 1000,
			onProgress: (job) => {
				onProgress({
					stage: "polling",
					percent: job.progress ?? 0,
					message: job.message ?? `Status: ${job.status}`,
				});
			},
		}
	);

	return { success: true, data: result };
}

async function exportStatus(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	if (!opts.jobId) return { success: false, error: "Missing --job-id" };

	const data = await client.get(
		`/api/claude/export/${opts.projectId}/jobs/${opts.jobId}`
	);
	return { success: true, data };
}

async function exportListJobs(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };

	const data = await client.get(`/api/claude/export/${opts.projectId}/jobs`);
	return { success: true, data };
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

async function dispatchDiagnostics(
	client: EditorApiClient,
	action: string,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (action === "analyze") {
		return diagnosticsAnalyze(client, opts);
	}
	return { success: false, error: `Unknown diagnostics action: ${action}` };
}

async function diagnosticsAnalyze(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.message) return { success: false, error: "Missing --message" };

	const body: Record<string, unknown> = {
		message: opts.message,
		timestamp: Date.now(),
	};
	if (opts.stack) body.stack = opts.stack;
	if (opts.data) body.context = opts.data;

	const data = await client.post("/api/claude/diagnostics/analyze", body);
	return { success: true, data };
}

// ---------------------------------------------------------------------------
// MCP
// ---------------------------------------------------------------------------

async function dispatchMcp(
	client: EditorApiClient,
	action: string,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (action === "forward-html") {
		return mcpForwardHtml(client, opts);
	}
	return { success: false, error: `Unknown mcp action: ${action}` };
}

async function mcpForwardHtml(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.html)
		return { success: false, error: "Missing --html (inline or @file.html)" };

	let html = opts.html;
	if (html.startsWith("@")) {
		const filePath = html.slice(1);
		if (!fs.existsSync(filePath)) {
			return { success: false, error: `File not found: ${filePath}` };
		}
		html = fs.readFileSync(filePath, "utf-8");
	}

	const body: Record<string, unknown> = { html };
	if (opts.toolName) body.toolName = opts.toolName;

	const data = await client.post("/api/claude/mcp/app", body);
	return { success: true, data };
}
