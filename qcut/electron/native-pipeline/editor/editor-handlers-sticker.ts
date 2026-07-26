/**
 * Editor Handlers — Sticker
 *
 * CLI handlers for editor:sticker:* commands.
 * Supports adding (catalog or custom image), updating, and removing stickers.
 *
 * @module electron/native-pipeline/editor/editor-handlers-sticker
 */

import fs, { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { searchIconifyStickers } from "../stickers/iconify-sticker-client.js";
import { materializeSticker } from "../stickers/sticker-asset-materializer.js";
import { parseStickerOverlayPlan } from "../stickers/sticker-overlay-plan.js";
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
	const action = parts[2];

	switch (action) {
		case "search":
			return stickerSearch(options);
		case "add":
			return stickerAdd(client, options);
		case "update":
			return stickerUpdate(client, options);
		case "remove":
			return stickerRemove(client, options);
		case "list":
			return stickerList(client, options);
		default:
			return {
				success: false,
				error: `Unknown sticker action: ${action}. Available: search, add, update, remove, list`,
			};
	}
}

// ---------------------------------------------------------------------------
// Search stickers
// ---------------------------------------------------------------------------

async function stickerSearch(opts: CLIRunOptions): Promise<CLIResult> {
	try {
		const query = opts.query?.trim();
		if (!query) return { success: false, error: "Missing --query" };
		const data = await searchIconifyStickers({
			query,
			collection: opts.collection,
			limit: opts.limit,
		});
		return { success: true, data };
	} catch (error) {
		return {
			success: false,
			error: `Sticker search failed: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}

async function importStickerSource({
	client,
	projectId,
	source,
}: {
	client: EditorApiClient;
	projectId: string;
	source: string;
}): Promise<string> {
	const importResult = await client.post<{ id?: string; mediaId?: string }>(
		`/api/claude/media/${encodeURIComponent(projectId)}/import`,
		{ source }
	);
	const mediaId = importResult.id ?? importResult.mediaId;
	if (!mediaId) {
		throw new Error("Media import succeeded but no mediaId returned");
	}
	return mediaId;
}

async function materializeCatalogSticker({
	stickerId,
	width,
}: {
	stickerId: string;
	width: number;
}): Promise<{ path: string; cleanup: () => void }> {
	const outputDirectory = mkdtempSync(join(tmpdir(), "qcut-editor-sticker-"));
	try {
		const item = parseStickerOverlayPlan({
			value: {
				version: 1,
				stickers: [
					{
						stickerId,
						startTime: 0,
						duration: 1,
						x: 0,
						y: 0,
						width,
						fadeIn: 0,
						fadeOut: 0,
					},
				],
			},
		}).stickers[0];
		const materialized = await materializeSticker({
			item,
			outputDirectory,
			index: 0,
			planDirectory: process.cwd(),
		});
		return {
			path: materialized.path,
			cleanup: () => rmSync(outputDirectory, { recursive: true, force: true }),
		};
	} catch (error) {
		rmSync(outputDirectory, { recursive: true, force: true });
		throw error;
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
		return { success: false, error: "Missing --end-time" };
	if (!opts.stickerId && !opts.source)
		return {
			success: false,
			error:
				"Missing --sticker-id or --source. Provide a catalog sticker ID or a path to a custom image.",
		};

	let mediaId: string | undefined;
	let stickerId = opts.stickerId;

	if (opts.source) {
		if (!fs.existsSync(opts.source)) {
			return { success: false, error: `File not found: ${opts.source}` };
		}
		mediaId = await importStickerSource({
			client,
			projectId: opts.projectId,
			source: opts.source,
		});
		if (!stickerId) {
			stickerId = `custom_${mediaId}`;
		}
	} else if (stickerId?.includes(":")) {
		const materialized = await materializeCatalogSticker({
			stickerId,
			width: opts.width ?? 512,
		});
		try {
			mediaId = await importStickerSource({
				client,
				projectId: opts.projectId,
				source: materialized.path,
			});
		} finally {
			materialized.cleanup();
		}
	}

	const startTime = opts.startTime ?? 0;
	const duration = opts.endTime - startTime;
	if (duration <= 0) {
		return {
			success: false,
			error: "--end-time must be greater than --start-time",
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
		`/api/claude/timeline/${encodeURIComponent(opts.projectId)}/elements`,
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

	// Replace sticker image source
	if (opts.source) {
		if (!fs.existsSync(opts.source)) {
			return { success: false, error: `File not found: ${opts.source}` };
		}
		const importResult = await client.post<{ id?: string; mediaId?: string }>(
			`/api/claude/media/${encodeURIComponent(opts.projectId)}/import`,
			{ source: opts.source }
		);
		const newMediaId = importResult.id ?? importResult.mediaId;
		if (!newMediaId) {
			return {
				success: false,
				error: "Media import succeeded but no mediaId returned",
			};
		}
		changes.mediaId = newMediaId;
		changes.stickerId = opts.stickerId ?? `custom_${newMediaId}`;
	}

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
				"No changes specified. Provide at least one of: --source, --x, --y, --width, --height, --rotation, --opacity, --start-time, --end-time",
		};
	}

	const data = await client.patch(
		`/api/claude/timeline/${encodeURIComponent(opts.projectId)}/elements/${encodeURIComponent(opts.elementId)}`,
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
		`/api/claude/timeline/${encodeURIComponent(opts.projectId)}/elements/${encodeURIComponent(opts.elementId)}`
	);
	return { success: true, data };
}

// ---------------------------------------------------------------------------
// List stickers
// ---------------------------------------------------------------------------

/** List all sticker elements on the timeline. */
async function stickerList(
	client: EditorApiClient,
	opts: CLIRunOptions
): Promise<CLIResult> {
	if (!opts.projectId) return { success: false, error: "Missing --project-id" };

	// Get the timeline info to access all elements
	const timelineData = await client.get<{
		tracks: Array<{
			id: string;
			type: string;
			elements: Array<{
				id: string;
				type: string;
				stickerId?: string;
				mediaId?: string;
				startTime: number;
				duration: number;
				x?: number;
				y?: number;
				width?: number;
				height?: number;
				rotation?: number;
				opacity?: number;
			}>;
		}>;
	}>(`/api/claude/timeline/${encodeURIComponent(opts.projectId)}`);

	// Filter for sticker elements across all tracks
	const stickerElements: Array<{
		id: string;
		stickerId?: string;
		mediaId?: string;
		startTime: number;
		endTime: number;
		duration: number;
		x?: number;
		y?: number;
		width?: number;
		height?: number;
		rotation?: number;
		opacity?: number;
		trackId: string;
	}> = [];

	for (const track of timelineData.tracks) {
		for (const element of track.elements) {
			if (element.type === "sticker") {
				stickerElements.push({
					...element,
					endTime: element.startTime + element.duration,
					trackId: track.id,
				});
			}
		}
	}

	return {
		success: true,
		data: {
			stickers: stickerElements,
			total: stickerElements.length,
		},
	};
}
