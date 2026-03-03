/**
 * Editor Handlers — Media + Project
 *
 * CLI handlers for editor:health, editor:media:*, and editor:project:*
 * commands. Each handler proxies to the QCut HTTP API via EditorApiClient.
 *
 * @module electron/native-pipeline/editor-handlers-media
 */

import * as fs from "fs";
import * as path from "path";
import type { EditorApiClient } from "../editor/editor-api-client.js";
import type { CLIRunOptions, CLIResult } from "../cli/cli-runner/types.js";
import { resolveJsonInput } from "./editor-api-types.js";
import {
	buildProjectJSON,
	buildProjectJSONMinimal,
} from "../cli/project-json-builder.js";

type ProgressFn = (progress: {
	stage: string;
	percent: number;
	message: string;
}) => void;

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

/** Route an `editor:media:*` or `editor:project:*` command to its handler. */
export async function handleMediaProjectCommand(
	client: EditorApiClient,
	options: CLIRunOptions,
	_onProgress: ProgressFn
): Promise<CLIResult> {
	const parts = options.command.split(":");
	const module = parts[1]; // "media" or "project"
	const action = parts[2]; // e.g. "list", "import", "settings"

	try {
		if (module === "media") {
			return await dispatchMedia(client, action, options);
		}
		if (module === "project") {
			return await dispatchProject(client, action, options);
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
// Health
// ---------------------------------------------------------------------------

/** Check editor health via the `/api/claude/health` endpoint. */
export async function handleEditorHealth(
	client: EditorApiClient
): Promise<CLIResult> {
	try {
		const data = await client.get("/api/claude/health");
		return { success: true, data };
	} catch (err) {
		return {
			success: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

// ---------------------------------------------------------------------------
// Media handlers
// ---------------------------------------------------------------------------

async function dispatchMedia(
	client: EditorApiClient,
	action: string,
	opts: CLIRunOptions
): Promise<CLIResult> {
	switch (action) {
		case "list":
			return mediaList(client, opts);
		case "info":
			return mediaInfo(client, opts);
		case "import":
			return mediaImport(client, opts);
		case "import-url":
			return mediaImportUrl(client, opts);
		case "batch-import":
			return mediaBatchImport(client, opts);
		case "extract-frame":
			return mediaExtractFrame(client, opts);
		case "rename":
			return mediaRename(client, opts);
		case "delete":
			return mediaDelete(client, opts);
		default:
			return { success: false, error: `Unknown media action: ${action}` };
	}
}

async function mediaList(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	const data = await client.get(`/api/claude/media/${opts.projectId}`);
	return { success: true, data };
}

async function mediaInfo(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	const o = opts as CLIRunOptions & { mediaId?: string };
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	if (!o.mediaId) return { success: false, error: "Missing --media-id" };
	const data = await client.get(
		`/api/claude/media/${opts.projectId}/${o.mediaId}`
	);
	return { success: true, data };
}

async function mediaImport(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	if (!opts.source) return { success: false, error: "Missing --source" };

	if (!fs.existsSync(opts.source)) {
		return { success: false, error: `File not found: ${opts.source}` };
	}

	const data = await client.post(`/api/claude/media/${opts.projectId}/import`, {
		source: opts.source,
	});
	return { success: true, data };
}

async function mediaImportUrl(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	const o = opts as CLIRunOptions & { url?: string; filename?: string };
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	// Check both the dedicated url field and the imageUrl field for flexibility
	const url = o.url ?? opts.imageUrl;
	if (!url) return { success: false, error: "Missing --url" };

	const body: Record<string, string> = { url };
	if (o.filename) body.filename = o.filename;

	const data = await client.post(
		`/api/claude/media/${opts.projectId}/import-from-url`,
		body
	);
	return { success: true, data };
}

/** Batch-import media files via --sources (comma-separated paths) or --items (JSON). */
async function mediaBatchImport(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	const o = opts as CLIRunOptions & { items?: string; sources?: string };
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };

	// Convenience: --sources "file1.png,file2.png" → auto-build items array
	if (o.sources && !o.items) {
		const paths = o.sources
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);
		if (paths.length === 0) {
			return {
				success: false,
				error: "--sources must contain at least one file path",
			};
		}
		if (paths.length > 20) {
			return {
				success: false,
				error: `Batch limit exceeded: ${paths.length} items (max 20)`,
			};
		}
		const missing = paths.filter((p) => !fs.existsSync(p));
		if (missing.length > 0) {
			return {
				success: false,
				error: `File(s) not found: ${missing.join(", ")}`,
			};
		}
		const items = paths.map((p) => ({ path: p }));
		const data = await client.post(
			`/api/claude/media/${opts.projectId}/batch-import`,
			{ items }
		);
		return { success: true, data };
	}

	if (!o.items)
		return {
			success: false,
			error:
				"Missing --items or --sources (JSON array, @file.json, or comma-separated paths)",
		};

	const parsed = await resolveJsonInput(o.items);
	const items = Array.isArray(parsed)
		? parsed
		: (parsed as { items?: unknown[] }).items;
	if (!Array.isArray(items)) {
		return { success: false, error: "--items must be a JSON array" };
	}
	if (items.length > 20) {
		return {
			success: false,
			error: `Batch limit exceeded: ${items.length} items (max 20)`,
		};
	}

	// Normalize: accept "source" field as alias for "path"
	const normalizedItems = items.map((item: Record<string, unknown>) => {
		if (item.source && !item.path && !item.url) {
			const { source, ...rest } = item;
			return { ...rest, path: source };
		}
		return item;
	});

	const data = await client.post(
		`/api/claude/media/${opts.projectId}/batch-import`,
		{ items: normalizedItems }
	);
	return { success: true, data };
}

async function mediaExtractFrame(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	const o = opts as CLIRunOptions & {
		mediaId?: string;
		timestamp?: string;
	};
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	if (!o.mediaId) return { success: false, error: "Missing --media-id" };
	// Accept timestamp from the dedicated field or from startTime
	const tsStr =
		o.timestamp ??
		String((opts as CLIRunOptions & { startTime?: string }).startTime ?? "");
	const timestamp = parseFloat(tsStr);
	if (Number.isNaN(timestamp)) {
		return { success: false, error: "Missing or invalid --timestamp" };
	}

	const body: Record<string, unknown> = { timestamp };
	if (opts.outputFormat) body.format = opts.outputFormat;

	const data = await client.post(
		`/api/claude/media/${opts.projectId}/${o.mediaId}/extract-frame`,
		body
	);
	return { success: true, data };
}

async function mediaRename(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	const o = opts as CLIRunOptions & {
		mediaId?: string;
		newName?: string;
	};
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	if (!o.mediaId) return { success: false, error: "Missing --media-id" };
	if (!o.newName) return { success: false, error: "Missing --new-name" };

	const data = await client.patch(
		`/api/claude/media/${opts.projectId}/${o.mediaId}/rename`,
		{ newName: o.newName }
	);
	return { success: true, data };
}

async function mediaDelete(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	const o = opts as CLIRunOptions & { mediaId?: string };
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	if (!o.mediaId) return { success: false, error: "Missing --media-id" };

	const data = await client.delete(
		`/api/claude/media/${opts.projectId}/${o.mediaId}`
	);
	return { success: true, data };
}

// ---------------------------------------------------------------------------
// Project handlers
// ---------------------------------------------------------------------------

async function dispatchProject(
	client: EditorApiClient,
	action: string,
	opts: CLIRunOptions
): Promise<CLIResult> {
	switch (action) {
		case "settings":
			return projectSettings(client, opts);
		case "update-settings":
			return projectUpdateSettings(client, opts);
		case "stats":
			return projectStats(client, opts);
		case "summary":
			return projectSummary(client, opts);
		case "report":
			return projectReport(client, opts);
		case "create":
			return projectCreate(client, opts);
		case "delete":
			return projectDelete(client, opts);
		case "rename":
			return projectRename(client, opts);
		case "duplicate":
			return projectDuplicate(client, opts);
		case "list":
			return projectList(client);
		case "info":
			return projectInfo(client, opts);
		case "export-state":
			return projectExportState(client, opts);
		case "import-state":
			return projectImportState();
		default:
			return {
				success: false,
				error: `Unknown project action: ${action}. Available: settings, update-settings, stats, summary, report, create, delete, rename, duplicate, list, info, export-state, import-state`,
			};
	}
}

async function projectSettings(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	const data = await client.get(
		`/api/claude/project/${encodeURIComponent(opts.projectId)}/settings`
	);
	return { success: true, data };
}

async function projectUpdateSettings(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	const o = opts as CLIRunOptions & { data?: string };
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	// Accept --data as the JSON settings
	const dataStr = o.data ?? opts.input;
	if (!dataStr)
		return {
			success: false,
			error: "Missing --data (JSON settings object)",
		};

	const settings = await resolveJsonInput(dataStr);
	const data = await client.patch(
		`/api/claude/project/${opts.projectId}/settings`,
		settings
	);
	return { success: true, data };
}

async function projectStats(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	const data = await client.get(`/api/claude/project/${opts.projectId}/stats`);
	return { success: true, data };
}

async function projectSummary(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	const data = await client.get(
		`/api/claude/project/${opts.projectId}/summary`
	);
	return { success: true, data };
}

async function projectReport(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	const o = opts as CLIRunOptions & { clearLog?: boolean };
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };

	const body: Record<string, unknown> = {};
	if (opts.outputDir && opts.outputDir !== "./output") {
		body.outputDir = opts.outputDir;
	}
	if (o.clearLog) body.clearLog = true;

	const data = await client.post(
		`/api/claude/project/${opts.projectId}/report`,
		body
	);
	return { success: true, data };
}

async function projectCreate(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	const name = opts.newName || "New Project";
	const data = await client.post("/api/claude/project/create", { name });
	return { success: true, data };
}

async function projectDelete(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	const data = await client.post("/api/claude/project/delete", {
		projectId: opts.projectId,
	});
	return { success: true, data };
}

async function projectRename(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	if (!opts.newName) return { success: false, error: "Missing --new-name" };
	const data = await client.post("/api/claude/project/rename", {
		projectId: opts.projectId,
		name: opts.newName,
	});
	return { success: true, data };
}

async function projectDuplicate(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	const data = await client.post("/api/claude/project/duplicate", {
		projectId: opts.projectId,
	});
	return { success: true, data };
}

async function projectList(client: EditorApiClient): Promise<CLIResult> {
	const data = await client.get("/api/claude/projects");
	return { success: true, data };
}

async function projectInfo(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };

	const isFull = opts.full === true;

	if (isFull) {
		const data = await buildProjectJSON(client, opts.projectId);
		return { success: true, data };
	}

	const data = await buildProjectJSONMinimal(client, opts.projectId);
	return { success: true, data };
}

async function projectExportState(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };

	const fullState = await buildProjectJSON(client, opts.projectId);
	const json = JSON.stringify(fullState, null, 2);

	const outputPath =
		opts.output ?? path.join(opts.outputDir, `project-${opts.projectId}.json`);

	const dir = path.dirname(outputPath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}

	fs.writeFileSync(outputPath, json, "utf-8");

	return {
		success: true,
		data: { path: outputPath, size: json.length },
		outputPath,
	};
}

function projectImportState(): CLIResult {
	// TODO: Implement import-state (P1) — read project.json and apply to editor
	return {
		success: false,
		error: "editor:project:import-state is not yet implemented. Coming in a future release.",
	};
}
