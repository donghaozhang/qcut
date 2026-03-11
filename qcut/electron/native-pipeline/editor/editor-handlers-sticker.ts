/**
 * Editor Handlers — Sticker
 *
 * CLI handlers for editor:sticker:* commands.
 * Supports adding (catalog or custom image), updating, and removing stickers.
 *
 * @module electron/native-pipeline/editor/editor-handlers-sticker
 */

import fs from "node:fs";
import type { EditorApiClient } from "./editor-api-client.js";
import type { CLIRunOptions, CLIResult } from "../cli/cli-runner/types.js";

/**
 * Dispatch sticker sub-commands.
 */
export async function handleStickerCommand(
	client: EditorApiClient,
	options: CLIRunOptions
): Promise<CLIResult> {
	const parts = options.command.split(":");
	const action = parts[2]; // "add", "update", "remove"

	switch (action) {
		case "add":
			return stickerAdd(client, options);
		case "update":
			return stickerUpdate(client, options);
		case "remove":
			return stickerRemove(client, options);
		default:
			return {
				success: false,
				error: `Unknown sticker action: ${action}. Available: add, update, remove`,
			};
	}
}

// ---------------------------------------------------------------------------
// Add sticker
// ---------------------------------------------------------------------------

/** Add a sticker to the timeline (catalog sticker or custom image). */
async function stickerAdd(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	if (opts.endTime === undefined)
		return { success: false, error: "Missing --time-end" };
	if (!opts.stickerId && !opts.source)
		return {
			success: false,
			error:
				"Missing --sticker-id or --source. Provide a catalog sticker ID or a path to a custom image.",
		};

	let mediaId: string | undefined;
	let stickerId = opts.stickerId;

	// Custom image: import first, then use as sticker
	if (opts.source) {
		if (!fs.existsSync(opts.source)) {
			return { success: false, error: `File not found: ${opts.source}` };
		}

		const importResult = await client.post<{ id?: string; mediaId?: string }>(
			`/api/claude/media/${opts.projectId}/import`,
			{ source: opts.source }
		);
		mediaId = importResult.id ?? importResult.mediaId;
		if (!mediaId) {
			return {
				success: false,
				error: "Media import succeeded but no mediaId returned",
			};
		}
		// For custom stickers, use a generated sticker ID if none provided
		if (!stickerId) {
			stickerId = `custom_${mediaId}`;
		}
	}

	const startTime = opts.startTime ?? 0;
	const duration = opts.endTime - startTime;
	if (duration <= 0) {
		return {
			success: false,
			error: "--time-end must be greater than --time-start",
		};
	}

	const element: Record<string, unknown> = {
		type: "sticker",
		stickerId,
		startTime,
		duration,
		x: opts.x ?? 0,
		y: opts.y ?? 0,
	};

	if (mediaId) element.mediaId = mediaId;
	if (opts.width !== undefined) element.width = opts.width;
	if (opts.height !== undefined) element.height = opts.height;
	if (opts.rotation !== undefined) element.rotation = opts.rotation;
	if (opts.opacity !== undefined) element.opacity = opts.opacity;

	const data = await client.post(
		`/api/claude/timeline/${opts.projectId}/elements`,
		element
	);
	return { success: true, data };
}

// ---------------------------------------------------------------------------
// Update sticker
// ---------------------------------------------------------------------------

/** Update an existing sticker element's position, size, or time. */
async function stickerUpdate(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };
	if (!opts.elementId) return { success: false, error: "Missing --element-id" };

	const changes: Record<string, unknown> = {};

	if (opts.x !== undefined) changes.x = opts.x;
	if (opts.y !== undefined) changes.y = opts.y;
	if (opts.width !== undefined) changes.width = opts.width;
	if (opts.height !== undefined) changes.height = opts.height;
	if (opts.rotation !== undefined) changes.rotation = opts.rotation;
	if (opts.opacity !== undefined) changes.opacity = opts.opacity;

	// Time updates: recalculate startTime and duration
	if (opts.startTime !== undefined) changes.startTime = opts.startTime;
	if (opts.endTime !== undefined) {
		const start = opts.startTime ?? (changes.startTime as number | undefined);
		if (start !== undefined) {
			changes.duration = opts.endTime - start;
		} else {
			// Need to fetch current startTime to compute duration
			changes.endTime = opts.endTime;
		}
	}

	if (Object.keys(changes).length === 0) {
		return {
			success: false,
			error:
				"No changes specified. Provide at least one of: --x, --y, --width, --height, --rotation, --opacity, --time-start, --time-end",
		};
	}

	const data = await client.patch(
		`/api/claude/timeline/${opts.projectId}/elements/${opts.elementId}`,
		{ changes }
	);
	return { success: true, data };
}

// ---------------------------------------------------------------------------
// Remove sticker
// ---------------------------------------------------------------------------

/** Remove a sticker element from the timeline. */
async function stickerRemove(
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
