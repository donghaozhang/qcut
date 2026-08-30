import { randomUUID } from "node:crypto";
import {
	copyFile,
	mkdir,
	mkdtemp,
	rename,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import type { ComposeManifest } from "./compose-manifest.js";
import {
	inspectComposeAsset,
	type ComposeLock,
	type ResolvedComposeProject,
} from "./compose-resolver.js";

export interface ComposeProjectResult {
	projectDirectory: string;
	manifestPath: string;
	lockPath: string;
	projectPath: string;
	assetCount: number;
	projectKind: "qcut-compose-v1";
	editorTimelineImportSupported: false;
	requiresLocalFilterCache: boolean;
}

interface PortableAsset {
	sourcePath: string;
	relativePath: string;
}

function safeStem({ value }: { value: string }): string {
	return (
		value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "asset"
	);
}

function portableAssetPath({
	role,
	id,
	sourcePath,
	sha256,
}: {
	role: string;
	id: string;
	sourcePath: string;
	sha256: string;
}): string {
	return `assets/${safeStem({ value: role })}-${safeStem({ value: id })}-${sha256.slice(0, 12)}${extname(sourcePath).toLowerCase()}`;
}

function buildPortableAssets({
	resolved,
}: {
	resolved: ResolvedComposeProject;
}): Map<string, PortableAsset> {
	const assets = new Map<string, PortableAsset>();
	const register = ({
		sourcePath,
		role,
		id,
		sha256,
	}: {
		sourcePath: string;
		role: string;
		id: string;
		sha256: string;
	}) => {
		if (assets.has(sourcePath)) return;
		assets.set(sourcePath, {
			sourcePath,
			relativePath: portableAssetPath({ role, id, sourcePath, sha256 }),
		});
	};
	for (const [index, clip] of resolved.clips.entries()) {
		const lock = resolved.lock.assets.find(
			(asset) => asset.role === "clip" && asset.id === clip.clip.id
		);
		if (!lock)
			throw new Error(`Missing lock identity for clip ${clip.clip.id}.`);
		register({
			sourcePath: clip.sourcePath,
			role: "clip",
			id: `${index + 1}-${clip.clip.id}`,
			sha256: lock.sha256,
		});
	}
	for (const [index, overlay] of resolved.overlays.entries()) {
		register({
			sourcePath: overlay.sourcePath,
			role: "sticker",
			id: String(index + 1),
			sha256: overlay.identity.sha256,
		});
	}
	for (const [index, audio] of resolved.audio.entries()) {
		register({
			sourcePath: audio.sourcePath,
			role: "sound",
			id: String(index + 1),
			sha256: audio.identity.sha256,
		});
	}
	return assets;
}

function assetSource({
	assets,
	sourcePath,
}: {
	assets: Map<string, PortableAsset>;
	sourcePath: string;
}): string {
	const asset = assets.get(sourcePath);
	if (!asset)
		throw new Error(`Compose project asset mapping is missing: ${sourcePath}`);
	return asset.relativePath;
}

function buildPortableManifest({
	resolved,
	assets,
}: {
	resolved: ResolvedComposeProject;
	assets: Map<string, PortableAsset>;
}): ComposeManifest {
	return {
		...resolved.loaded.manifest,
		clips: resolved.clips.map(({ clip, sourcePath }) => ({
			...clip,
			source: assetSource({ assets, sourcePath }),
		})),
		overlays: resolved.overlays.map(({ overlay, sourcePath }) => ({
			...overlay,
			source: assetSource({ assets, sourcePath }),
		})),
		audio: resolved.audio.map(({ audio, sourcePath }) => ({
			...audio,
			source: assetSource({ assets, sourcePath }),
		})),
	};
}

function buildPortableLock({
	resolved,
	manifestSha256,
	assets,
}: {
	resolved: ResolvedComposeProject;
	manifestSha256: string;
	assets: Map<string, PortableAsset>;
}): ComposeLock {
	const sourceByOriginal = new Map<string, string>();
	for (const clip of resolved.clips) {
		sourceByOriginal.set(
			clip.clip.source,
			assetSource({ assets, sourcePath: clip.sourcePath })
		);
	}
	for (const item of resolved.overlays) {
		sourceByOriginal.set(
			item.overlay.source,
			assetSource({ assets, sourcePath: item.sourcePath })
		);
	}
	for (const item of resolved.audio) {
		sourceByOriginal.set(
			item.audio.source,
			assetSource({ assets, sourcePath: item.sourcePath })
		);
	}
	return {
		...resolved.lock,
		configSha256: manifestSha256,
		assets: resolved.lock.assets.map((asset) => ({
			...asset,
			source: sourceByOriginal.get(asset.source) ?? asset.source,
		})),
	};
}

async function publishProjectDirectory({
	stagingDirectory,
	projectDirectory,
	force,
}: {
	stagingDirectory: string;
	projectDirectory: string;
	force: boolean;
}): Promise<void> {
	const backupDirectory = `${projectDirectory}.backup-${randomUUID()}`;
	let movedExisting = false;
	try {
		if (force) {
			try {
				await rename(projectDirectory, backupDirectory);
				movedExisting = true;
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			}
		}
		await rename(stagingDirectory, projectDirectory);
		if (movedExisting) {
			await rm(backupDirectory, { recursive: true, force: true });
		}
	} catch (error) {
		if (movedExisting) {
			try {
				await rename(backupDirectory, projectDirectory);
			} catch {
				// Preserve the backup if restoring it also fails.
			}
		}
		throw error;
	}
}

export async function createComposeProject({
	resolved,
	projectDirectory: requestedProjectDirectory,
	force,
}: {
	resolved: ResolvedComposeProject;
	projectDirectory: string;
	force: boolean;
}): Promise<ComposeProjectResult> {
	const projectDirectory = resolve(requestedProjectDirectory);
	if (!force) {
		try {
			await stat(projectDirectory);
			throw new Error(
				`Project directory already exists: ${projectDirectory}. Pass --force to replace it.`
			);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
	}
	await mkdir(dirname(projectDirectory), { recursive: true });
	let stagingDirectory: string | undefined = await mkdtemp(
		join(dirname(projectDirectory), ".qcut-compose-project-")
	);
	try {
		const assets = buildPortableAssets({ resolved });
		await mkdir(join(stagingDirectory, "assets"), { recursive: true });
		await Promise.all(
			[...assets.values()].map((asset) =>
				copyFile(
					asset.sourcePath,
					join(stagingDirectory as string, asset.relativePath)
				)
			)
		);
		const portableManifest = buildPortableManifest({ resolved, assets });
		const manifestPath = join(stagingDirectory, "compose.json");
		await writeFile(
			manifestPath,
			`${JSON.stringify(portableManifest, null, 2)}\n`
		);
		const manifestIdentity = await inspectComposeAsset({
			filePath: manifestPath,
		});
		const portableLock = buildPortableLock({
			resolved,
			manifestSha256: manifestIdentity.sha256,
			assets,
		});
		const lockPath = join(stagingDirectory, "compose-lock.json");
		const projectPath = join(stagingDirectory, "project.json");
		await Promise.all([
			writeFile(lockPath, `${JSON.stringify(portableLock, null, 2)}\n`),
			writeFile(
				projectPath,
				`${JSON.stringify(
					{
						kind: "qcut-compose-v1",
						schemaVersion: 1,
						manifest: "compose.json",
						lock: "compose-lock.json",
						assetDirectory: "assets",
						requiresLocalFilterCache: resolved.lock.filters.length > 0,
						renderCommand:
							"qcut compose render --config compose.json --output final.mp4 --json",
						editorTimelineImportSupported: false,
					},
					null,
					2
				)}\n`
			),
		]);
		await publishProjectDirectory({
			stagingDirectory,
			projectDirectory,
			force,
		});
		stagingDirectory = undefined;
		return {
			projectDirectory,
			manifestPath: join(projectDirectory, basename(manifestPath)),
			lockPath: join(projectDirectory, basename(lockPath)),
			projectPath: join(projectDirectory, basename(projectPath)),
			assetCount: assets.size,
			projectKind: "qcut-compose-v1",
			editorTimelineImportSupported: false,
			requiresLocalFilterCache: resolved.lock.filters.length > 0,
		};
	} finally {
		if (stagingDirectory) {
			await rm(stagingDirectory, { recursive: true, force: true });
		}
	}
}
