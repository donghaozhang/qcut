/**
 * Editor Handlers — Analysis + Transcription
 *
 * CLI handlers for editor:analyze:* and editor:transcribe:* commands.
 * Each handler proxies to the QCut HTTP API via EditorApiClient.
 *
 * @module electron/native-pipeline/editor-handlers-analysis
 */

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
// Source parser for analyze:video
// ---------------------------------------------------------------------------

interface AnalyzeSource {
	type: "media" | "timeline" | "path";
	mediaId?: string;
	elementId?: string;
	filePath?: string;
}

/** Parse a source string like "media:id" or "path:/file" into an AnalyzeSource. */
export function parseSource(sourceStr: string): AnalyzeSource {
	const [type, ...rest] = sourceStr.split(":");
	const id = rest.join(":");
	switch (type) {
		case "media":
			return { type: "media", mediaId: id };
		case "timeline":
			return { type: "timeline", elementId: id };
		case "path":
			return { type: "path", filePath: id };
		default:
			return { type: "path", filePath: sourceStr };
	}
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

/** Dispatch analysis and transcription sub-commands to their handlers. */
export async function handleAnalysisCommand(
	client: EditorApiClient,
	options: CLIRunOptions,
	onProgress: ProgressFn
): Promise<CLIResult> {
	const parts = options.command.split(":");
	const module = parts[1]; // "analyze" or "transcribe"
	const action = parts.slice(2).join(":");

	try {
		if (module === "analyze") {
			return await dispatchAnalyze(client, action, options);
		}
		if (module === "transcribe") {
			return await dispatchTranscribe(client, action, options, onProgress);
		}
		return { success: false, error: `Unknown module: ${module}` };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

// ---------------------------------------------------------------------------
// Analyze dispatcher
// ---------------------------------------------------------------------------

async function dispatchAnalyze(
	client: EditorApiClient,
	action: string,
	opts: CLIRunOptions
): Promise<CLIResult> {
	switch (action) {
		case "video":
			return analyzeVideo(client, opts);
		case "models":
			return analyzeModels(client);
		case "scenes":
			return analyzeScenes(client, opts);
		case "frames":
			return analyzeFrames(client, opts);
		case "fillers":
			return analyzeFillers(client, opts);
		case "beats":
			return analyzeBeats(client, opts);
		default:
			return { success: false, error: `Unknown analyze action: ${action}` };
	}
}

// ---------------------------------------------------------------------------
// Analyze handlers
// ---------------------------------------------------------------------------

async function analyzeVideo(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	if (!opts.source)
		return {
			success: false,
			error: "Missing --source (e.g. media:id, path:/file.mp4)",
		};

	const source = parseSource(opts.source);
	const body: Record<string, unknown> = { source };
	if (opts.analysisType) body.analysisType = opts.analysisType;
	if (opts.model) body.model = opts.model;
	if (opts.outputFormat) body.format = opts.outputFormat;

	const data = await client.post(`/api/claude/analyze/${opts.projectId}`, body);
	return { success: true, data };
}

async function analyzeModels(client: EditorApiClient): Promise<CLIResult> {
	const data = await client.get("/api/claude/analyze/models");
	return { success: true, data };
}

async function analyzeScenes(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	if (!opts.mediaId) return { success: false, error: "Missing --media-id" };

	const body: Record<string, unknown> = { mediaId: opts.mediaId };
	if (opts.threshold !== undefined) body.threshold = opts.threshold;
	if (opts.model) body.model = opts.model;

	const data = await client.post(
		`/api/claude/analyze/${opts.projectId}/scenes`,
		body
	);
	return { success: true, data };
}

async function analyzeFrames(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	if (!opts.mediaId) return { success: false, error: "Missing --media-id" };

	const body: Record<string, unknown> = { mediaId: opts.mediaId };

	// Parse comma-separated timestamps
	if (opts.timestamps) {
		const parsed = opts.timestamps
			.split(",")
			.map(Number)
			.filter((n) => !Number.isNaN(n));
		if (parsed.length > 0) body.timestamps = parsed;
	}

	// Use gap field as interval (seconds between frames)
	if (opts.gap !== undefined) body.interval = opts.gap;
	if (opts.prompt) body.prompt = opts.prompt;

	const data = await client.post(
		`/api/claude/analyze/${opts.projectId}/frames`,
		body
	);
	return { success: true, data };
}

async function analyzeFillers(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };

	const body: Record<string, unknown> = {};
	if (opts.mediaId) body.mediaId = opts.mediaId;

	// Accept pre-existing words via --data
	if (opts.data) {
		const parsed = await resolveJsonInput(opts.data);
		if (Array.isArray(parsed)) {
			body.words = parsed;
		} else if (
			typeof parsed === "object" &&
			parsed !== null &&
			"words" in parsed
		) {
			body.words = (parsed as { words: unknown }).words;
		}
	}

	const data = await client.post(
		`/api/claude/analyze/${opts.projectId}/fillers`,
		body
	);
	return { success: true, data };
}

async function analyzeBeats(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	if (!opts.mediaId) return { success: false, error: "Missing --media-id" };

	const body: Record<string, unknown> = { mediaId: opts.mediaId };
	if (opts.threshold !== undefined) body.threshold = opts.threshold;

	const data = await client.post(
		`/api/claude/analyze/${opts.projectId}/beats`,
		body
	);
	return { success: true, data };
}

// ---------------------------------------------------------------------------
// Transcribe dispatcher
// ---------------------------------------------------------------------------

async function dispatchTranscribe(
	client: EditorApiClient,
	action: string,
	opts: CLIRunOptions,
	onProgress: ProgressFn
): Promise<CLIResult> {
	switch (action) {
		case "run":
			return transcribeRun(client, opts);
		case "start":
			return transcribeStart(client, opts, onProgress);
		case "status":
			return transcribeStatus(client, opts);
		case "list-jobs":
			return transcribeListJobs(client, opts);
		case "cancel":
			return transcribeCancel(client, opts);
		default:
			return {
				success: false,
				error: `Unknown transcribe action: ${action}`,
			};
	}
}

// ---------------------------------------------------------------------------
// Transcribe handlers
// ---------------------------------------------------------------------------

function buildTranscribeBody(opts: CLIRunOptions): Record<string, unknown> {
	const body: Record<string, unknown> = {};
	if (opts.source) {
		body.source = parseSource(opts.source);
	} else {
		body.mediaId = opts.mediaId;
	}
	if (opts.provider) body.provider = opts.provider;
	if (opts.language) body.language = opts.language;
	if (opts.noDiarize) body.diarize = false;
	return body;
}

async function transcribeRun(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	if (!opts.source && !opts.mediaId)
		return {
			success: false,
			error: "Missing --source or --media-id",
		};
	if (opts.source && opts.mediaId)
		return {
			success: false,
			error: "--source and --media-id are mutually exclusive",
		};

	const body = buildTranscribeBody(opts);

	// Use transcribe-and-load endpoint when --load-speech is set
	if (opts.loadSpeech) {
		const data = await client.post(
			`/api/claude/transcribe/${opts.projectId}/transcribe-and-load`,
			body
		);
		return { success: true, data };
	}

	const data = await client.post(
		`/api/claude/transcribe/${opts.projectId}`,
		body
	);
	return { success: true, data };
}

async function transcribeStart(
	client: EditorApiClient,
	opts: CLIRunOptions,
	onProgress: ProgressFn
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	if (!opts.source && !opts.mediaId)
		return { success: false, error: "Missing --source or --media-id" };
	if (opts.source && opts.mediaId)
		return {
			success: false,
			error: "--source and --media-id are mutually exclusive",
		};

	const startResult = await client.post<{ jobId: string }>(
		`/api/claude/transcribe/${opts.projectId}/start`,
		buildTranscribeBody(opts)
	);

	if (!opts.poll) {
		return { success: true, data: startResult };
	}

	if (opts.json) jsonPending(startResult.jobId);
	onProgress({
		stage: "polling",
		percent: 0,
		message: `Transcribe job ${startResult.jobId} started...`,
	});

	const result = await client.pollJob(
		`/api/claude/transcribe/${opts.projectId}/jobs/${startResult.jobId}`,
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

	// Load transcription into Smart Speech panel if requested
	const jobResult: { result?: { words?: unknown[]; language?: string } } =
		(result as { result?: { words?: unknown[]; language?: string } }) ?? {};
	const words = Array.isArray(jobResult.result?.words)
		? jobResult.result.words
		: undefined;
	if (opts.loadSpeech && words?.length) {
		const sourceDesc = opts.source || opts.mediaId || "unknown";
		await client.post(`/api/claude/transcribe/${opts.projectId}/load-speech`, {
			words,
			language: jobResult.result?.language,
			fileName: `transcription_${sourceDesc.replace(/[/\\:]/g, "_")}.json`,
			mediaId: opts.mediaId,
		});
	}

	return { success: true, data: result };
}

async function transcribeStatus(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	if (!opts.jobId) return { success: false, error: "Missing --job-id" };

	const data = await client.get(
		`/api/claude/transcribe/${opts.projectId}/jobs/${opts.jobId}`
	);
	return { success: true, data };
}

async function transcribeListJobs(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };

	const data = await client.get(
		`/api/claude/transcribe/${opts.projectId}/jobs`
	);
	return { success: true, data };
}

async function transcribeCancel(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	if (!opts.jobId) return { success: false, error: "Missing --job-id" };

	const data = await client.post(
		`/api/claude/transcribe/${opts.projectId}/jobs/${opts.jobId}/cancel`
	);
	return { success: true, data };
}
