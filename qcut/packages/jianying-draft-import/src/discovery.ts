/**
 * Safe draft-directory discovery (JYI-006).
 *
 * Locates candidate content/meta files inside a user-selected draft
 * directory without ever following symlinks, recursing past a fixed depth,
 * or scanning unbounded entry counts. Discovery reads directory entries
 * only — file contents stay untouched until the snapshot reader runs.
 *
 * The absolute directory path is RESTRICTED input: it never appears in the
 * returned relative manifest, so downstream evidence stays path-free.
 *
 * @module @qcut/jianying-draft-import/discovery
 */

import { lstat, readdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import type { DraftSourceFileRole } from "@qcut/editor-core/draft-interop";

export const MAX_DISCOVERY_ENTRIES = 8192;
export const MAX_DISCOVERY_DEPTH = 2;

const CONTENT_FILE_NAMES = new Set(["draft_info.json", "draft_content.json"]);
const META_FILE_NAMES = new Set([
	"draft_meta_info.json",
	"draft_settings",
	"draft_agency_config.json",
	"attachment_pc_common.json",
]);

/** Directory names that are never scanned (caches, logs, key stores). */
const DENIED_DIRECTORY_NAMES = new Set([
	"logs",
	"caches",
	".recycle_bin",
	"common_attachment",
]);

export interface DiscoveredDraftFile {
	/** Path relative to the draft root, using "/" separators. */
	relativePath: string;
	role: DraftSourceFileRole;
	byteLength: number;
}

export interface SkippedDraftEntry {
	relativePath: string;
	reason:
		| "symlink"
		| "denied-directory"
		| "depth-limit"
		| "entry-limit"
		| "special-file";
}

export interface DraftDiscoveryResult {
	/** Canonical (realpath) draft root all reads must stay inside. */
	rootRealPath: string;
	files: DiscoveredDraftFile[];
	skipped: SkippedDraftEntry[];
	/** True when at least one candidate content file was found. */
	hasContentFile: boolean;
}

function classifyRole({
	relativePath,
	name,
}: {
	relativePath: string;
	name: string;
}): DraftSourceFileRole {
	if (CONTENT_FILE_NAMES.has(name) && !relativePath.includes("/")) {
		return "content";
	}
	if (META_FILE_NAMES.has(name) && !relativePath.includes("/")) {
		return "meta";
	}
	if (
		relativePath.startsWith("assets/") ||
		relativePath.startsWith("materials/") ||
		relativePath.startsWith("Resources/")
	) {
		return "asset";
	}
	return "unknown";
}

async function scanDirectory({
	absoluteDirectory,
	relativeDirectory,
	depth,
	state,
}: {
	absoluteDirectory: string;
	relativeDirectory: string;
	depth: number;
	state: DraftDiscoveryResult & { entryCount: number };
}): Promise<void> {
	const entries = await readdir(absoluteDirectory, { withFileTypes: true });
	// Deterministic order regardless of filesystem enumeration.
	entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
	for (const entry of entries) {
		const relativePath =
			relativeDirectory === ""
				? entry.name
				: `${relativeDirectory}/${entry.name}`;
		if (state.entryCount >= MAX_DISCOVERY_ENTRIES) {
			state.skipped.push({ relativePath, reason: "entry-limit" });
			continue;
		}
		state.entryCount += 1;

		if (entry.isSymbolicLink()) {
			state.skipped.push({ relativePath, reason: "symlink" });
			continue;
		}
		if (entry.isDirectory()) {
			if (DENIED_DIRECTORY_NAMES.has(entry.name.toLowerCase())) {
				state.skipped.push({ relativePath, reason: "denied-directory" });
				continue;
			}
			if (depth + 1 > MAX_DISCOVERY_DEPTH) {
				state.skipped.push({ relativePath, reason: "depth-limit" });
				continue;
			}
			await scanDirectory({
				absoluteDirectory: join(absoluteDirectory, entry.name),
				relativeDirectory: relativePath,
				depth: depth + 1,
				state,
			});
			continue;
		}
		if (!entry.isFile()) {
			state.skipped.push({ relativePath, reason: "special-file" });
			continue;
		}
		// lstat (never stat) so a racing symlink swap cannot be followed.
		const metadata = await lstat(join(absoluteDirectory, entry.name));
		if (!metadata.isFile()) {
			state.skipped.push({ relativePath, reason: "special-file" });
			continue;
		}
		const role = classifyRole({ relativePath, name: entry.name });
		state.files.push({ relativePath, role, byteLength: metadata.size });
	}
}

/**
 * Scans a draft directory for candidate files. Throws only on unreadable
 * roots; per-entry anomalies land in `skipped`.
 */
export async function discoverDraftDirectory({
	draftDirectory,
}: {
	draftDirectory: string;
}): Promise<DraftDiscoveryResult> {
	const rootRealPath = await realpath(draftDirectory);
	const rootMetadata = await lstat(rootRealPath);
	if (!rootMetadata.isDirectory()) {
		throw new Error("Draft path is not a directory.");
	}
	const state: DraftDiscoveryResult & { entryCount: number } = {
		rootRealPath,
		files: [],
		skipped: [],
		hasContentFile: false,
		entryCount: 0,
	};
	await scanDirectory({
		absoluteDirectory: rootRealPath,
		relativeDirectory: "",
		depth: 0,
		state,
	});
	state.hasContentFile = state.files.some((file) => file.role === "content");
	const { entryCount: _entryCount, ...result } = state;
	return result;
}
