/**
 * Editor Handlers — Search
 *
 * CLI handlers for `editor:search:*` commands.
 * Proxies to the QCut HTTP API via EditorApiClient.
 *
 * @module electron/native-pipeline/editor-handlers-search
 */

import type { EditorApiClient } from "../editor/editor-api-client.js";
import type { CLIRunOptions, CLIResult } from "../cli/cli-runner/types.js";

type ProgressFn = (progress: {
	stage: string;
	percent: number;
	message: string;
}) => void;

/**
 * Dispatch search sub-commands to their handlers.
 *
 * Commands:
 * - `editor:search:query`  — Search transcriptions by text
 * - `editor:search:status` — List transcription status for all media in a project
 * - `editor:search:index`  — Trigger transcription for all untranscribed media
 */
export async function handleSearchCommand(
	client: EditorApiClient,
	options: CLIRunOptions,
	_onProgress: ProgressFn
): Promise<CLIResult> {
	const parts = options.command.split(":");
	const action = parts[2]; // "query", "status", "index"

	switch (action) {
		case "query":
			return await handleSearchQuery(client, options);
		case "status":
			return await handleSearchStatus(client, options);
		case "index":
			return await handleSearchIndex(client, options);
		default:
			return {
				success: false,
				error: `Unknown search action: ${action}. Available: query, status, index`,
			};
	}
}

/** Search transcriptions by text query. */
async function handleSearchQuery(
	client: EditorApiClient,
	options: CLIRunOptions
): Promise<CLIResult> {
	const projectId = options.projectId;
	if (!projectId) {
		return { success: false, error: "Missing --project-id" };
	}

	const query = options.query;
	if (!query) {
		return { success: false, error: "Missing --query" };
	}

	const params = new URLSearchParams({ q: query });
	if (options.caseSensitive) params.set("caseSensitive", "true");
	if (options.wholeWord) params.set("wholeWord", "true");
	if (options.maxResults) params.set("maxResults", String(options.maxResults));
	if (options.mediaId) params.set("mediaId", options.mediaId);

	const data = await client.get(
		`/api/claude/search/${encodeURIComponent(projectId)}?${params}`
	);
	return { success: true, data };
}

/** Get transcription status for all media in a project. */
async function handleSearchStatus(
	client: EditorApiClient,
	options: CLIRunOptions
): Promise<CLIResult> {
	const projectId = options.projectId;
	if (!projectId) {
		return { success: false, error: "Missing --project-id" };
	}

	const data = await client.get(
		`/api/claude/search/${encodeURIComponent(projectId)}/status`
	);
	return { success: true, data };
}

/** Trigger batch transcription for untranscribed media. */
async function handleSearchIndex(
	client: EditorApiClient,
	options: CLIRunOptions
): Promise<CLIResult> {
	const projectId = options.projectId;
	if (!projectId) {
		return { success: false, error: "Missing --project-id" };
	}

	const body: Record<string, unknown> = {};
	if (options.mediaId) body.mediaId = options.mediaId;

	const data = await client.post(
		`/api/claude/search/${encodeURIComponent(projectId)}/index`,
		body
	);
	return { success: true, data };
}
