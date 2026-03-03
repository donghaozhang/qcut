/**
 * Editor Handlers — Timeline + Editing
 *
 * CLI handlers for editor:timeline:* and editor:editing:* commands.
 * Each handler proxies to the QCut HTTP API via EditorApiClient.
 *
 * @module electron/native-pipeline/editor-handlers-timeline
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

const BATCH_LIMIT = 50;
const TIMELINE_ACTIONS = [
	"export",
	"import",
	"add-element",
	"batch-add",
	"update-element",
	"batch-update",
	"delete-element",
	"batch-delete",
	"split",
	"move",
	"arrange",
	"select",
	"get-selection",
	"clear-selection",
	"play",
	"pause",
	"toggle-play",
	"seek",
] as const;

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export async function handleTimelineEditingCommand(
	client: EditorApiClient,
	options: CLIRunOptions,
	onProgress: ProgressFn
): Promise<CLIResult> {
	const parts = options.command.split(":");
	const module = parts[1]; // "timeline" or "editing"
	const action = parts.slice(2).join(":");

	try {
		if (module === "timeline") {
			return await dispatchTimeline(client, action, options);
		}
		if (module === "editing") {
			return await dispatchEditing(client, action, options, onProgress);
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
// Timeline dispatcher
// ---------------------------------------------------------------------------

async function dispatchTimeline(
	client: EditorApiClient,
	action: string,
	opts: CLIRunOptions
): Promise<CLIResult> {
	switch (action) {
		case "export":
			return timelineExport(client, opts);
		case "import":
			return timelineImport(client, opts);
		case "add-element":
			return timelineAddElement(client, opts);
		case "batch-add":
			return timelineBatchAdd(client, opts);
		case "update-element":
			return timelineUpdateElement(client, opts);
		case "batch-update":
			return timelineBatchUpdate(client, opts);
		case "delete-element":
			return timelineDeleteElement(client, opts);
		case "batch-delete":
			return timelineBatchDelete(client, opts);
		case "split":
			return timelineSplit(client, opts);
		case "move":
			return timelineMove(client, opts);
		case "arrange":
			return timelineArrange(client, opts);
		case "select":
			return timelineSelect(client, opts);
		case "get-selection":
			return timelineGetSelection(client, opts);
		case "clear-selection":
			return timelineClearSelection(client, opts);
		case "play":
			return timelinePlayback(client, opts, "play");
		case "pause":
			return timelinePlayback(client, opts, "pause");
		case "toggle-play":
			return timelinePlayback(client, opts, "toggle");
		case "seek":
			return timelineSeek(client, opts);
		case "info":
			return timelineInfo(client, opts);
		case "add-clip":
			return timelineAddClip(client, opts);
		case "trim":
			return timelineTrim(client, opts);
		default:
			return {
				success: false,
				error: `Unknown timeline action: ${action}. Available: ${TIMELINE_ACTIONS.join(", ")}, info, add-clip, trim`,
			};
	}
}

// ---------------------------------------------------------------------------
// Timeline read/export
// ---------------------------------------------------------------------------

async function timelineExport(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };

	const query: Record<string, string> = {};
	const fmt = opts.outputFormat ?? opts.mode;
	if (fmt) query.format = fmt;

	const data = await client.get(
		`/api/claude/timeline/${opts.projectId}`,
		Object.keys(query).length > 0 ? query : undefined
	);
	return { success: true, data };
}

async function timelineImport(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };

	const raw = opts.data ?? opts.input;
	if (!raw)
		return {
			success: false,
			error: "Missing --data (JSON, markdown, @file, or - for stdin)",
		};

	// If starts with @ or -, use resolveJsonInput for file/stdin
	// Otherwise try parsing as JSON; if that fails, treat as raw markdown
	let payload: unknown;
	if (raw.startsWith("@") || raw === "-") {
		try {
			payload = await resolveJsonInput(raw);
		} catch {
			// File might be markdown, read raw
			const fs = await import("fs");
			const content = raw.startsWith("@")
				? fs.readFileSync(raw.slice(1), "utf-8")
				: raw;
			payload = content;
		}
	} else {
		try {
			payload = JSON.parse(raw);
		} catch {
			payload = raw; // treat as markdown string
		}
	}

	const body: Record<string, unknown> = { data: payload };
	const fmt = opts.outputFormat ?? opts.mode;
	if (fmt) body.format = fmt;
	if (opts.replace) body.replace = true;

	const data = await client.post(
		`/api/claude/timeline/${opts.projectId}/import`,
		body
	);
	return { success: true, data };
}

// ---------------------------------------------------------------------------
// Timeline element CRUD
// ---------------------------------------------------------------------------

async function timelineAddElement(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	const raw = opts.data ?? opts.input;
	if (!raw)
		return {
			success: false,
			error: "Missing --data (JSON element definition)",
		};

	const element = await resolveJsonInput(raw);
	const data = await client.post(
		`/api/claude/timeline/${opts.projectId}/elements`,
		element
	);
	return { success: true, data };
}

async function timelineBatchAdd(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	if (!opts.elements)
		return {
			success: false,
			error: "Missing --elements (JSON array or @file.json)",
		};

	const parsed = await resolveJsonInput(opts.elements);
	const elements = Array.isArray(parsed)
		? parsed
		: (parsed as { elements?: unknown[] }).elements;
	if (!Array.isArray(elements))
		return { success: false, error: "--elements must be a JSON array" };
	if (elements.length > BATCH_LIMIT)
		return {
			success: false,
			error: `Batch limit: ${BATCH_LIMIT} elements (got ${elements.length})`,
		};

	// Validate trackId is present on each element
	for (const el of elements) {
		if (typeof el !== "object" || el === null || !el.trackId) {
			return {
				success: false,
				error:
					"Each element must be an object with 'trackId'. Use editor:timeline:export to find track IDs.",
			};
		}
	}

	const data = await client.post(
		`/api/claude/timeline/${opts.projectId}/elements/batch`,
		{ elements }
	);
	return { success: true, data };
}

async function timelineUpdateElement(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	if (!opts.elementId) return { success: false, error: "Missing --element-id" };

	const raw = opts.changes ?? opts.data;
	if (!raw)
		return {
			success: false,
			error: "Missing --changes (JSON object)",
		};

	const changes = await resolveJsonInput(raw);
	const data = await client.patch(
		`/api/claude/timeline/${opts.projectId}/elements/${opts.elementId}`,
		{ changes }
	);
	return { success: true, data };
}

async function timelineBatchUpdate(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };

	const raw = opts.updates ?? opts.data;
	if (!raw)
		return {
			success: false,
			error: "Missing --updates (JSON array or @file.json)",
		};

	const parsed = await resolveJsonInput(raw);
	const updates = Array.isArray(parsed)
		? parsed
		: (parsed as { updates?: unknown[] }).updates;
	if (!Array.isArray(updates))
		return { success: false, error: "--updates must be a JSON array" };
	if (updates.length > BATCH_LIMIT)
		return {
			success: false,
			error: `Batch limit: ${BATCH_LIMIT} updates (got ${updates.length})`,
		};

	const data = await client.patch(
		`/api/claude/timeline/${opts.projectId}/elements/batch`,
		{ updates }
	);
	return { success: true, data };
}

async function timelineDeleteElement(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	if (!opts.elementId) return { success: false, error: "Missing --element-id" };

	const data = await client.delete(
		`/api/claude/timeline/${opts.projectId}/elements/${opts.elementId}`
	);
	return { success: true, data };
}

async function timelineBatchDelete(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	if (!opts.elements)
		return {
			success: false,
			error: "Missing --elements (JSON array or @file.json)",
		};

	const parsed = await resolveJsonInput(opts.elements);
	let elements = Array.isArray(parsed)
		? parsed
		: (parsed as { elements?: unknown[] }).elements;
	if (!Array.isArray(elements))
		return { success: false, error: "--elements must be a JSON array" };
	if (elements.length > BATCH_LIMIT)
		return {
			success: false,
			error: `Batch limit: ${BATCH_LIMIT} elements (got ${elements.length})`,
		};

	// If plain string IDs, resolve trackId from current timeline
	if (elements.length > 0 && typeof elements[0] === "string") {
		const timeline = await client.get<{
			tracks: Array<{
				id: string;
				elements: Array<{ id: string }>;
			}>;
		}>(`/api/claude/timeline/${opts.projectId}`);
		elements = (elements as string[]).map((id) => {
			for (const track of timeline.tracks) {
				if (track.elements.some((e) => e.id === id)) {
					return { trackId: track.id, elementId: id };
				}
			}
			return { trackId: "", elementId: id };
		});
	}

	const body: Record<string, unknown> = { elements };
	if (opts.ripple) body.ripple = true;

	const data = await client.delete(
		`/api/claude/timeline/${opts.projectId}/elements/batch`,
		body
	);
	return { success: true, data };
}

// ---------------------------------------------------------------------------
// Timeline manipulation
// ---------------------------------------------------------------------------

async function timelineSplit(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	if (!opts.elementId) return { success: false, error: "Missing --element-id" };
	if (opts.splitTime === undefined || Number.isNaN(opts.splitTime))
		return { success: false, error: "Missing or invalid --split-time" };

	const body: Record<string, unknown> = { splitTime: opts.splitTime };
	if (opts.mode) body.mode = opts.mode;

	const data = await client.post(
		`/api/claude/timeline/${opts.projectId}/elements/${opts.elementId}/split`,
		body
	);
	return { success: true, data };
}

async function timelineMove(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	if (!opts.elementId) return { success: false, error: "Missing --element-id" };
	if (!opts.toTrack) return { success: false, error: "Missing --to-track" };

	const body: Record<string, unknown> = { toTrackId: opts.toTrack };
	if (opts.startTime !== undefined) body.newStartTime = opts.startTime;

	const data = await client.post(
		`/api/claude/timeline/${opts.projectId}/elements/${opts.elementId}/move`,
		body
	);
	return { success: true, data };
}

async function timelineArrange(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	if (!opts.trackId) return { success: false, error: "Missing --track-id" };
	if (!opts.mode)
		return {
			success: false,
			error: "Missing --mode (sequential, spaced, or manual)",
		};

	const validModes = ["sequential", "spaced", "manual"];
	if (!validModes.includes(opts.mode))
		return {
			success: false,
			error: `Invalid --mode: ${opts.mode}. Must be: ${validModes.join(", ")}`,
		};

	const body: Record<string, unknown> = {
		trackId: opts.trackId,
		mode: opts.mode,
	};
	if (opts.gap !== undefined) body.gap = opts.gap;
	if (opts.startTime !== undefined) body.startOffset = opts.startTime;

	// For manual mode, parse order from --data
	if (opts.mode === "manual" && opts.data) {
		const parsed = await resolveJsonInput(opts.data);
		if (Array.isArray(parsed)) {
			body.order = parsed;
		} else if (
			typeof parsed === "object" &&
			parsed !== null &&
			"order" in parsed
		) {
			body.order = (parsed as { order: unknown }).order;
		}
	}

	const data = await client.post(
		`/api/claude/timeline/${opts.projectId}/arrange`,
		body
	);
	return { success: true, data };
}

async function timelineSelect(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	if (!opts.elements)
		return {
			success: false,
			error: "Missing --elements (JSON array of {trackId, elementId})",
		};

	const parsed = await resolveJsonInput(opts.elements);
	const elements = Array.isArray(parsed) ? parsed : undefined;
	if (!elements)
		return { success: false, error: "--elements must be a JSON array" };

	const data = await client.post(
		`/api/claude/timeline/${opts.projectId}/selection`,
		{ elements }
	);
	return { success: true, data };
}

async function timelineGetSelection(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	const data = await client.get(
		`/api/claude/timeline/${opts.projectId}/selection`
	);
	return { success: true, data };
}

async function timelineClearSelection(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	const data = await client.delete(
		`/api/claude/timeline/${opts.projectId}/selection`
	);
	return { success: true, data };
}

async function timelinePlayback(
	client: EditorApiClient,
	opts: CLIRunOptions,
	action: "play" | "pause" | "toggle"
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	const data = await client.post(
		`/api/claude/timeline/${opts.projectId}/playback`,
		{ action }
	);
	return { success: true, data };
}

async function timelineSeek(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };

	const rawSeekTime = (opts as CLIRunOptions & { seekTime?: number | string })
		.seekTime;
	const seekTimeInput = rawSeekTime ?? opts.startTime;
	const seekTime =
		typeof seekTimeInput === "string"
			? Number.parseFloat(seekTimeInput)
			: seekTimeInput;

	if (seekTime === undefined || Number.isNaN(seekTime)) {
		return { success: false, error: "Missing --time" };
	}

	const data = await client.post(
		`/api/claude/timeline/${opts.projectId}/playback`,
		{ action: "seek", time: seekTime }
	);
	return { success: true, data };
}

// ---------------------------------------------------------------------------
// Timeline info / add-clip / trim (unified JSON API)
// ---------------------------------------------------------------------------

async function timelineInfo(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	const data = await client.get(`/api/claude/timeline/${encodeURIComponent(opts.projectId)}`);
	return { success: true, data };
}

async function timelineAddClip(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	if (!opts.mediaId) return { success: false, error: "Missing --media-id" };

	const body: Record<string, unknown> = {
		type: "media",
		sourceId: opts.mediaId,
	};
	if (opts.trackId) body.trackId = opts.trackId;
	if (opts.startTime !== undefined) body.startTime = opts.startTime;

	const data = await client.post(
		`/api/claude/timeline/${encodeURIComponent(opts.projectId)}/elements`,
		body
	);
	return { success: true, data };
}

async function timelineTrim(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	if (!opts.elementId) return { success: false, error: "Missing --element-id" };
	if (opts.startTime === undefined && opts.endTime === undefined) {
		return {
			success: false,
			error: "Missing --start-time and/or --end-time",
		};
	}
	if (opts.startTime !== undefined && !Number.isFinite(opts.startTime)) {
		return { success: false, error: "--start-time must be a finite number" };
	}
	if (opts.endTime !== undefined && !Number.isFinite(opts.endTime)) {
		return { success: false, error: "--end-time must be a finite number" };
	}
	if (
		opts.startTime !== undefined &&
		opts.endTime !== undefined &&
		opts.startTime >= opts.endTime
	) {
		return {
			success: false,
			error: "--start-time must be less than --end-time",
		};
	}

	const changes: Record<string, unknown> = {};
	if (opts.startTime !== undefined) changes.startTime = opts.startTime;
	if (opts.endTime !== undefined) changes.endTime = opts.endTime;

	const data = await client.patch(
		`/api/claude/timeline/${encodeURIComponent(opts.projectId)}/elements/${encodeURIComponent(opts.elementId)}`,
		{ changes }
	);
	return { success: true, data };
}

// ---------------------------------------------------------------------------
// Editing dispatcher
// ---------------------------------------------------------------------------

async function dispatchEditing(
	client: EditorApiClient,
	action: string,
	opts: CLIRunOptions,
	onProgress: ProgressFn
): Promise<CLIResult> {
	switch (action) {
		case "batch-cuts":
			return editingBatchCuts(client, opts);
		case "delete-range":
			return editingDeleteRange(client, opts);
		case "auto-edit":
			return editingAutoEdit(client, opts, onProgress);
		case "auto-edit-status":
			return editingAutoEditStatus(client, opts);
		case "auto-edit-list":
			return editingAutoEditList(client, opts);
		case "suggest-cuts":
			return editingSuggestCuts(client, opts, onProgress);
		case "suggest-status":
			return editingSuggestStatus(client, opts);
		default:
			return {
				success: false,
				error: `Unknown editing action: ${action}`,
			};
	}
}

// ---------------------------------------------------------------------------
// Editing — Cuts & Range
// ---------------------------------------------------------------------------

async function editingBatchCuts(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	if (!opts.elementId) return { success: false, error: "Missing --element-id" };
	if (!opts.cuts)
		return {
			success: false,
			error: "Missing --cuts (JSON array of {start, end})",
		};

	const parsed = await resolveJsonInput(opts.cuts);
	if (!Array.isArray(parsed))
		return { success: false, error: "--cuts must be a JSON array" };

	const body: Record<string, unknown> = {
		elementId: opts.elementId,
		cuts: parsed,
	};
	if (opts.ripple) body.ripple = true;

	const data = await client.post(
		`/api/claude/timeline/${opts.projectId}/cuts`,
		body
	);
	return { success: true, data };
}

async function editingDeleteRange(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	if (opts.startTime === undefined)
		return { success: false, error: "Missing --start-time" };
	if (opts.endTime === undefined)
		return { success: false, error: "Missing --end-time" };
	if (opts.startTime >= opts.endTime)
		return {
			success: false,
			error: "--start-time must be less than --end-time",
		};

	const body: Record<string, unknown> = {
		startTime: opts.startTime,
		endTime: opts.endTime,
	};

	if (opts.trackId) {
		body.trackIds = opts.trackId.split(",").map((s) => s.trim());
	}
	if (opts.ripple) body.ripple = true;
	if (opts.crossTrackRipple) body.crossTrackRipple = true;

	const data = await client.delete(
		`/api/claude/timeline/${opts.projectId}/range`,
		body
	);
	return { success: true, data };
}

// ---------------------------------------------------------------------------
// Editing — Auto-Edit
// ---------------------------------------------------------------------------

async function editingAutoEdit(
	client: EditorApiClient,
	opts: CLIRunOptions,
	onProgress: ProgressFn
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	if (!opts.elementId) return { success: false, error: "Missing --element-id" };
	if (!opts.mediaId) return { success: false, error: "Missing --media-id" };

	const body: Record<string, unknown> = {
		elementId: opts.elementId,
		mediaId: opts.mediaId,
	};
	if (opts.removeFillers) body.removeFillers = true;
	if (opts.removeSilences) body.removeSilences = true;
	if (opts.dryRun) body.dryRun = true;
	if (opts.provider) body.provider = opts.provider;
	if (opts.language) body.language = opts.language;
	if (opts.threshold !== undefined) body.silenceThreshold = opts.threshold;

	// Async mode with polling
	if (opts.poll) {
		const startResult = await client.post<{ jobId: string }>(
			`/api/claude/timeline/${opts.projectId}/auto-edit/start`,
			body
		);

		if (opts.json) jsonPending(startResult.jobId);
		onProgress({
			stage: "polling",
			percent: 0,
			message: `Auto-edit job ${startResult.jobId} started...`,
		});

		const result = await client.pollJob(
			`/api/claude/timeline/${opts.projectId}/auto-edit/jobs/${startResult.jobId}`,
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

	// Sync mode
	const data = await client.post(
		`/api/claude/timeline/${opts.projectId}/auto-edit`,
		body
	);
	return { success: true, data };
}

async function editingAutoEditStatus(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	if (!opts.jobId) return { success: false, error: "Missing --job-id" };

	const data = await client.get(
		`/api/claude/timeline/${opts.projectId}/auto-edit/jobs/${opts.jobId}`
	);
	return { success: true, data };
}

async function editingAutoEditList(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };

	const data = await client.get(
		`/api/claude/timeline/${opts.projectId}/auto-edit/jobs`
	);
	return { success: true, data };
}

// ---------------------------------------------------------------------------
// Editing — Suggest Cuts
// ---------------------------------------------------------------------------

async function editingSuggestCuts(
	client: EditorApiClient,
	opts: CLIRunOptions,
	onProgress: ProgressFn
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	if (!opts.mediaId) return { success: false, error: "Missing --media-id" };

	const body: Record<string, unknown> = { mediaId: opts.mediaId };
	if (opts.provider) body.provider = opts.provider;
	if (opts.language) body.language = opts.language;
	if (opts.threshold !== undefined) body.sceneThreshold = opts.threshold;
	if (opts.includeFillers) body.includeFillers = true;
	if (opts.includeSilences) body.includeSilences = true;
	if (opts.includeScenes) body.includeScenes = true;

	// Note: suggest-cuts lives under /analyze/ on the server
	if (opts.poll) {
		const startResult = await client.post<{ jobId: string }>(
			`/api/claude/analyze/${opts.projectId}/suggest-cuts/start`,
			body
		);

		if (opts.json) jsonPending(startResult.jobId);
		onProgress({
			stage: "polling",
			percent: 0,
			message: `Suggest-cuts job ${startResult.jobId} started...`,
		});

		const result = await client.pollJob(
			`/api/claude/analyze/${opts.projectId}/suggest-cuts/jobs/${startResult.jobId}`,
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

	// Sync mode
	const data = await client.post(
		`/api/claude/analyze/${opts.projectId}/suggest-cuts`,
		body
	);
	return { success: true, data };
}

async function editingSuggestStatus(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	if (!opts.jobId) return { success: false, error: "Missing --job-id" };

	const data = await client.get(
		`/api/claude/analyze/${opts.projectId}/suggest-cuts/jobs/${opts.jobId}`
	);
	return { success: true, data };
}
