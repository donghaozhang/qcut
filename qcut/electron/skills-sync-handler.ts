import { app, ipcMain, type IpcMainInvokeEvent } from "electron";
import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";

interface SkillsSyncManifest {
	version: number;
	managedFolders: string[];
	folderHashes: Record<string, string>;
}

interface SyncSkillsForClaudeOptions {
	projectId: string;
	projectRootPath?: string;
	bundledSkillsPath?: string;
	documentsPath?: string;
	managedSkillFolders?: readonly string[];
}

export interface SkillsSyncForClaudeResult {
	synced: boolean;
	copied: number;
	skipped: number;
	removed: number;
	warnings: string[];
	error?: string;
}

const MANAGED_SKILL_FOLDERS = [
	"qcut-toolkit",
	"native-cli",
	"ai-content-pipeline",
] as const;

const SYNC_MANIFEST_VERSION = 1;
const SYNC_MANIFEST_FILENAME = ".skills-sync-manifest.json";

function validateProjectId({ projectId }: { projectId: string }): void {
	const isValidProjectId = /^[A-Za-z0-9_-]+$/.test(projectId);
	if (!isValidProjectId) {
		throw new Error("Invalid project ID");
	}
}

async function pathExists({
	targetPath,
}: {
	targetPath: string;
}): Promise<boolean> {
	try {
		await fs.access(targetPath);
		return true;
	} catch {
		return false;
	}
}

async function listFilesRecursive({
	rootDir,
}: {
	rootDir: string;
}): Promise<string[]> {
	const files: string[] = [];

	const walk = async ({
		currentDir,
	}: {
		currentDir: string;
	}): Promise<void> => {
		const entries = await fs.readdir(currentDir, { withFileTypes: true });
		entries.sort((a, b) => a.name.localeCompare(b.name));

		for (const entry of entries) {
			const fullPath = path.join(currentDir, entry.name);
			if (entry.isDirectory()) {
				await walk({ currentDir: fullPath });
				continue;
			}
			if (entry.isFile()) {
				const relativePath = path.relative(rootDir, fullPath);
				files.push(relativePath.split(path.sep).join("/"));
			}
		}
	};

	await walk({ currentDir: rootDir });
	files.sort((a, b) => a.localeCompare(b));
	return files;
}

async function hashDirectory({
	directoryPath,
}: {
	directoryPath: string;
}): Promise<string> {
	const hash = createHash("sha256");
	const files = await listFilesRecursive({ rootDir: directoryPath });

	for (const relativeFilePath of files) {
		const absolutePath = path.join(directoryPath, relativeFilePath);
		const content = await fs.readFile(absolutePath);
		hash.update(relativeFilePath);
		hash.update("\0");
		hash.update(content);
		hash.update("\0");
	}

	return hash.digest("hex");
}

async function copyDirectory({
	sourcePath,
	targetPath,
}: {
	sourcePath: string;
	targetPath: string;
}): Promise<void> {
	await fs.rm(targetPath, { recursive: true, force: true });
	await fs.mkdir(path.dirname(targetPath), { recursive: true });
	await fs.cp(sourcePath, targetPath, { recursive: true, force: true });
}

async function readSyncManifest({
	manifestPath,
}: {
	manifestPath: string;
}): Promise<SkillsSyncManifest | null> {
	try {
		const content = await fs.readFile(manifestPath, "utf-8");
		const parsed = JSON.parse(content) as SkillsSyncManifest;
		if (
			!parsed ||
			parsed.version !== SYNC_MANIFEST_VERSION ||
			!Array.isArray(parsed.managedFolders) ||
			typeof parsed.folderHashes !== "object"
		) {
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}

function getBundledSkillsPath(): string {
	if (app.isPackaged) {
		return path.join(process.resourcesPath, "default-skills");
	}
	return path.join(app.getAppPath(), "resources", "default-skills");
}

async function ensureCanonicalBaselineSkills({
	bundledSkillsPath,
	canonicalSkillsPath,
	managedSkillFolders,
}: {
	bundledSkillsPath: string;
	canonicalSkillsPath: string;
	managedSkillFolders: readonly string[];
}): Promise<{ copied: number; skipped: number; warnings: string[] }> {
	const warnings: string[] = [];
	let copied = 0;
	let skipped = 0;

	await fs.mkdir(canonicalSkillsPath, { recursive: true });

	for (const folderName of managedSkillFolders) {
		const sourceFolderPath = path.join(bundledSkillsPath, folderName);
		const targetFolderPath = path.join(canonicalSkillsPath, folderName);

		const hasSourceFolder = await pathExists({ targetPath: sourceFolderPath });
		if (!hasSourceFolder) {
			warnings.push(`Bundled skill folder missing: ${sourceFolderPath}`);
			continue;
		}

		const hasTargetFolder = await pathExists({ targetPath: targetFolderPath });
		if (!hasTargetFolder) {
			await copyDirectory({
				sourcePath: sourceFolderPath,
				targetPath: targetFolderPath,
			});
			copied += 1;
			continue;
		}

		const [sourceHash, targetHash] = await Promise.all([
			hashDirectory({ directoryPath: sourceFolderPath }),
			hashDirectory({ directoryPath: targetFolderPath }),
		]);

		if (sourceHash === targetHash) {
			skipped += 1;
			continue;
		}

		await copyDirectory({
			sourcePath: sourceFolderPath,
			targetPath: targetFolderPath,
		});
		copied += 1;
	}

	return { copied, skipped, warnings };
}

async function syncCanonicalToClaudeMirror({
	canonicalSkillsPath,
	claudeMirrorSkillsPath,
	manifestPath,
	managedSkillFolders,
}: {
	canonicalSkillsPath: string;
	claudeMirrorSkillsPath: string;
	manifestPath: string;
	managedSkillFolders: readonly string[];
}): Promise<{
	copied: number;
	skipped: number;
	removed: number;
	synced: boolean;
}> {
	await fs.mkdir(claudeMirrorSkillsPath, { recursive: true });

	const previousManifest = await readSyncManifest({ manifestPath });
	const nextFolderHashes: Record<string, string> = {};
	let copied = 0;
	let skipped = 0;
	let removed = 0;
	let synced = false;

	for (const folderName of managedSkillFolders) {
		const sourceFolderPath = path.join(canonicalSkillsPath, folderName);
		const targetFolderPath = path.join(claudeMirrorSkillsPath, folderName);

		const hasSourceFolder = await pathExists({ targetPath: sourceFolderPath });
		if (!hasSourceFolder) {
			continue;
		}

		const sourceHash = await hashDirectory({ directoryPath: sourceFolderPath });
		nextFolderHashes[folderName] = sourceHash;

		const hasTargetFolder = await pathExists({ targetPath: targetFolderPath });
		if (!hasTargetFolder) {
			await copyDirectory({
				sourcePath: sourceFolderPath,
				targetPath: targetFolderPath,
			});
			copied += 1;
			synced = true;
			continue;
		}

		const targetHash = await hashDirectory({ directoryPath: targetFolderPath });
		if (targetHash === sourceHash) {
			skipped += 1;
			continue;
		}

		await copyDirectory({
			sourcePath: sourceFolderPath,
			targetPath: targetFolderPath,
		});
		copied += 1;
		synced = true;
	}

	const previouslyManagedFolders = previousManifest?.managedFolders || [];
	for (const oldFolderName of previouslyManagedFolders) {
		const isStillManaged = managedSkillFolders.includes(oldFolderName);
		const existsInNextManifest =
			Object.keys(nextFolderHashes).includes(oldFolderName);
		if (!isStillManaged || existsInNextManifest) {
			continue;
		}

		const staleTargetPath = path.join(claudeMirrorSkillsPath, oldFolderName);
		const hasStaleFolder = await pathExists({ targetPath: staleTargetPath });
		if (!hasStaleFolder) {
			continue;
		}

		await fs.rm(staleTargetPath, { recursive: true, force: true });
		removed += 1;
		synced = true;
	}

	const nextManifest: SkillsSyncManifest = {
		version: SYNC_MANIFEST_VERSION,
		managedFolders: Object.keys(nextFolderHashes).sort((a, b) =>
			a.localeCompare(b)
		),
		folderHashes: nextFolderHashes,
	};

	const nextManifestJson = JSON.stringify(nextManifest, null, 2);
	const previousManifestJson = previousManifest
		? JSON.stringify(previousManifest, null, 2)
		: "";

	if (nextManifestJson !== previousManifestJson) {
		await fs.mkdir(path.dirname(manifestPath), { recursive: true });
		await fs.writeFile(manifestPath, `${nextManifestJson}\n`, "utf-8");
		synced = true;
	}

	return { copied, skipped, removed, synced };
}

function resolveProjectRoot({
	projectId,
	projectRootPath,
	documentsPath,
}: {
	projectId: string;
	projectRootPath?: string;
	documentsPath?: string;
}): string {
	if (projectRootPath) {
		return projectRootPath;
	}

	const resolvedDocumentsPath = documentsPath || app.getPath("documents");
	return path.join(resolvedDocumentsPath, "QCut", "Projects", projectId);
}

export async function syncSkillsForClaudeProject({
	projectId,
	projectRootPath,
	bundledSkillsPath,
	documentsPath,
	managedSkillFolders = MANAGED_SKILL_FOLDERS,
}: SyncSkillsForClaudeOptions): Promise<SkillsSyncForClaudeResult> {
	const result: SkillsSyncForClaudeResult = {
		synced: false,
		copied: 0,
		skipped: 0,
		removed: 0,
		warnings: [],
	};

	try {
		validateProjectId({ projectId });

		const resolvedProjectRoot = resolveProjectRoot({
			projectId,
			projectRootPath,
			documentsPath,
		});
		const resolvedBundledSkillsPath =
			bundledSkillsPath || getBundledSkillsPath();

		const canonicalSkillsPath = path.join(resolvedProjectRoot, "skills");
		const claudeMirrorSkillsPath = path.join(
			resolvedProjectRoot,
			".claude",
			"skills"
		);
		const manifestPath = path.join(
			resolvedProjectRoot,
			".claude",
			SYNC_MANIFEST_FILENAME
		);

		const hasBundledSkills = await pathExists({
			targetPath: resolvedBundledSkillsPath,
		});
		if (!hasBundledSkills) {
			result.warnings.push(
				`Bundled skills source not found: ${resolvedBundledSkillsPath}`
			);
			return result;
		}

		const baselineResult = await ensureCanonicalBaselineSkills({
			bundledSkillsPath: resolvedBundledSkillsPath,
			canonicalSkillsPath,
			managedSkillFolders,
		});
		result.copied += baselineResult.copied;
		result.skipped += baselineResult.skipped;
		result.warnings.push(...baselineResult.warnings);

		const mirrorResult = await syncCanonicalToClaudeMirror({
			canonicalSkillsPath,
			claudeMirrorSkillsPath,
			manifestPath,
			managedSkillFolders,
		});
		result.copied += mirrorResult.copied;
		result.skipped += mirrorResult.skipped;
		result.removed += mirrorResult.removed;
		result.synced = result.copied > 0 || mirrorResult.synced;

		return result;
	} catch (error: unknown) {
		const message =
			error instanceof Error ? error.message : "skills sync failed";
		return {
			synced: false,
			copied: result.copied,
			skipped: result.skipped,
			removed: result.removed,
			warnings: result.warnings,
			error: message,
		};
	}
}

export function setupSkillsSyncIPC(): void {
	ipcMain.handle(
		"skills:syncForClaude",
		async (
			_event: IpcMainInvokeEvent,
			projectId: string
		): Promise<SkillsSyncForClaudeResult> => {
			try {
				return await syncSkillsForClaudeProject({ projectId });
			} catch (error: unknown) {
				const message =
					error instanceof Error ? error.message : "skills sync failed";
				return {
					synced: false,
					copied: 0,
					skipped: 0,
					removed: 0,
					warnings: [],
					error: message,
				};
			}
		}
	);
}
