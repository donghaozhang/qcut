/**
 * Project directory convention for staged Novel-to-Movie runs.
 *
 * Every stage of the decomposed pipeline (characters → portraits →
 * scripts → storyboard → videos) reads and writes artifacts under a
 * single predictable root:
 *
 *     ~/Documents/QCut/projects/<slug>/
 *         project.json
 *         novel.md
 *         characters.json
 *         portraits/<name>/front.png
 *         portraits/registry.json
 *         scripts/chunk_NNN.json
 *
 * Override the root with the QCUT_PROJECTS_DIR environment variable.
 *
 * @module electron/native-pipeline/output/project-paths
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/** Current metadata schema version; bump when project.json shape evolves. */
export const PROJECT_SCHEMA_VERSION = 1;

/** Known stage identifiers recorded in project.json.stages_completed. */
export type ProjectStage =
	| "characters"
	| "portraits"
	| "scripts"
	| "storyboard"
	| "videos"
	| "final";

/** Shape of project.json on disk. */
export interface ProjectMetadata {
	schema_version: number;
	slug: string;
	novel_path?: string;
	title?: string;
	style?: string;
	created_at: string;
	updated_at: string;
	stages_completed: ProjectStage[];
}

/** Derive a filesystem-safe slug from a source name. */
export function safeProjectSlug(value: string): string {
	const stripped = value.replace(/\.[^.]+$/, ""); // drop extension
	const normalized = stripped
		.replace(/[^\p{L}\p{N}._-]+/gu, "-")
		.replace(/^-+|-+$/g, "");
	return normalized || "untitled";
}

/** Root directory holding every project; honours QCUT_PROJECTS_DIR override. */
export function getProjectsRoot(): string {
	const override = process.env.QCUT_PROJECTS_DIR;
	if (override && override.trim().length > 0) return override;
	return path.join(os.homedir(), "Documents", "QCut", "projects");
}

/** All resolved paths for a single project slug. */
export interface ProjectPaths {
	slug: string;
	root: string;
	metadataPath: string;
	novelPath: string;
	charactersPath: string;
	portraitsDir: string;
	portraitRegistryPath: string;
	scriptsDir: string;
	storyboardDir: string;
	videosDir: string;
}

/**
 * Resolve every path inside a project dir without creating anything.
 *
 * The caller is responsible for producing a filesystem-safe slug
 * (via {@link safeProjectSlug}); this function trusts `slug` verbatim
 * so that project names containing dots (e.g. `my.story`) aren't
 * corrupted by a second pass of extension-stripping.
 */
export function resolveProjectPaths(slug: string): ProjectPaths {
	const normalized = slug;
	const root = path.join(getProjectsRoot(), normalized);
	return {
		slug: normalized,
		root,
		metadataPath: path.join(root, "project.json"),
		novelPath: path.join(root, "novel.md"),
		charactersPath: path.join(root, "characters.json"),
		portraitsDir: path.join(root, "portraits"),
		portraitRegistryPath: path.join(root, "portraits", "registry.json"),
		scriptsDir: path.join(root, "scripts"),
		storyboardDir: path.join(root, "storyboard"),
		videosDir: path.join(root, "videos"),
	};
}

/** Create the project directory (and minimum subdirs) on disk. */
export function ensureProjectDirs(paths: ProjectPaths): void {
	fs.mkdirSync(paths.root, { recursive: true });
}

/** Read project.json, returning undefined when it does not exist. */
export function readProjectMetadata(
	paths: ProjectPaths
): ProjectMetadata | undefined {
	if (!fs.existsSync(paths.metadataPath)) return undefined;
	try {
		const raw = fs.readFileSync(paths.metadataPath, "utf-8");
		return JSON.parse(raw) as ProjectMetadata;
	} catch {
		return undefined;
	}
}

/** Write or update project.json with the given partial patch. */
export function writeProjectMetadata(
	paths: ProjectPaths,
	patch: Partial<Omit<ProjectMetadata, "schema_version">>
): ProjectMetadata {
	ensureProjectDirs(paths);
	const existing = readProjectMetadata(paths);
	const now = new Date().toISOString();
	const next: ProjectMetadata = {
		schema_version: PROJECT_SCHEMA_VERSION,
		slug: paths.slug,
		created_at: existing?.created_at ?? now,
		updated_at: now,
		stages_completed: existing?.stages_completed ?? [],
		...(existing?.novel_path ? { novel_path: existing.novel_path } : {}),
		...(existing?.title ? { title: existing.title } : {}),
		...(existing?.style ? { style: existing.style } : {}),
		...patch,
	};
	fs.writeFileSync(paths.metadataPath, JSON.stringify(next, null, 2));
	return next;
}

/**
 * Filesystem-safe version of a shot id for use as a filename.
 * Preserves the `scene-subscene-shot` shape (e.g. `1-1-3`) and replaces
 * any unexpected characters with dashes. Never returns an empty string.
 */
export function safeShotFilename(shotId: string): string {
	const trimmed = (shotId || "shot").trim();
	const sanitized = trimmed.replace(/[^\p{L}\p{N}._-]+/gu, "-");
	return sanitized || "shot";
}

/** Absolute MP4 path for a given shot id, inside the project's videos dir. */
export function shotVideoPath(paths: ProjectPaths, shotId: string): string {
	return path.join(paths.videosDir, `shot_${safeShotFilename(shotId)}.mp4`);
}

/** Path to the per-run videos registry JSON (shot_id → result). */
export function videoRegistryPath(paths: ProjectPaths): string {
	return path.join(paths.videosDir, "registry.json");
}

/** Append `stage` to `stages_completed` (idempotent). */
export function markStageCompleted(
	paths: ProjectPaths,
	stage: ProjectStage
): ProjectMetadata {
	const existing = readProjectMetadata(paths);
	const stages = new Set<ProjectStage>(existing?.stages_completed ?? []);
	stages.add(stage);
	return writeProjectMetadata(paths, {
		stages_completed: Array.from(stages),
	});
}
