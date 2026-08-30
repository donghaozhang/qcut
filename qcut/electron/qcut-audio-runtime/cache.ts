import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import type {
	QcutAudioArtifactManifest,
	QcutAudioCacheClearResult,
	QcutAudioCacheStats,
} from "../qcut-audio-runtime-contract.js";

export const MAX_QCUT_AUDIO_CACHE_BYTES = 8 * 1024 * 1024 * 1024;
export const MAX_QCUT_AUDIO_CACHE_ENTRIES = 1_024;
/**
 * Renders write `<cacheKey>.<pid>-<timestamp>.partial.flac` and time out after
 * 30 minutes, so a partial older than this can only be an abandoned leftover.
 */
export const STALE_PARTIAL_MAX_AGE_MS = 60 * 60 * 1_000;

function isPartialArtifact({ filename }: { filename: string }): boolean {
	return filename.endsWith(".partial.flac");
}

interface QcutAudioCacheEntry {
	cacheKey: string;
	filePath: string;
	manifestPath: string;
	size: number;
	lastUsedAt: number;
}

export function getQcutAudioCacheDirectory(): string {
	return path.join(app.getPath("userData"), "Cache", "qcut-audio-derived-v1");
}

export function getQcutAudioModelCacheDirectory(): string {
	return path.join(app.getPath("userData"), "Models", "qcut-audio-v1");
}

export function qcutAudioArtifactPaths({
	cacheKey,
	cacheDirectory = getQcutAudioCacheDirectory(),
}: {
	cacheKey: string;
	cacheDirectory?: string;
}): { outputPath: string; manifestPath: string } {
	return {
		outputPath: path.join(cacheDirectory, `${cacheKey}.flac`),
		manifestPath: path.join(cacheDirectory, `${cacheKey}.json`),
	};
}

export function readQcutAudioArtifact({
	cacheKey,
	cacheDirectory,
}: {
	cacheKey: string;
	cacheDirectory?: string;
}): {
	outputPath: string;
	manifestPath: string;
	manifest: QcutAudioArtifactManifest;
} | null {
	const { outputPath, manifestPath } = qcutAudioArtifactPaths({
		cacheKey,
		cacheDirectory,
	});
	try {
		const stat = fs.statSync(outputPath);
		const parsed = JSON.parse(
			fs.readFileSync(manifestPath, "utf8")
		) as QcutAudioArtifactManifest;
		if (
			!stat.isFile() ||
			stat.size <= 0 ||
			parsed.schemaVersion !== 1 ||
			parsed.cacheKey !== cacheKey ||
			parsed.fileSize !== stat.size ||
			!/^([a-f0-9]{64})$/.test(parsed.outputSha256)
		) {
			return null;
		}
		const now = new Date();
		void Promise.all([
			fs.promises.utimes(outputPath, now, now),
			fs.promises.utimes(manifestPath, now, now),
		]).catch(() => {});
		return { outputPath, manifestPath, manifest: parsed };
	} catch {
		return null;
	}
}

async function readQcutAudioCacheEntries({
	cacheDirectory = getQcutAudioCacheDirectory(),
}: {
	cacheDirectory?: string;
} = {}): Promise<QcutAudioCacheEntry[]> {
	let filenames: string[];
	try {
		filenames = (await fs.promises.readdir(cacheDirectory)).filter(
			(filename) =>
				filename.endsWith(".flac") && !isPartialArtifact({ filename })
		);
	} catch {
		return [];
	}
	const entries = await Promise.all(
		filenames.map(async (filename) => {
			const cacheKey = filename.slice(0, -".flac".length);
			const { outputPath, manifestPath } = qcutAudioArtifactPaths({
				cacheKey,
				cacheDirectory,
			});
			try {
				const stat = await fs.promises.stat(outputPath);
				if (!stat.isFile()) return null;
				return {
					cacheKey,
					filePath: outputPath,
					manifestPath,
					size: stat.size,
					lastUsedAt: stat.mtimeMs,
				};
			} catch {
				return null;
			}
		})
	);
	return entries.filter((entry) => entry !== null);
}

async function removeQcutAudioCacheEntries({
	entries,
}: {
	entries: QcutAudioCacheEntry[];
}): Promise<void> {
	await Promise.all(
		entries.flatMap((entry) => [
			fs.promises.rm(entry.filePath, { force: true }).catch(() => {}),
			fs.promises.rm(entry.manifestPath, { force: true }).catch(() => {}),
		])
	);
}

export async function cleanupQcutAudioCache({
	keepPath,
	cacheDirectory,
}: {
	keepPath: string;
	cacheDirectory?: string;
}): Promise<void> {
	const entries = await readQcutAudioCacheEntries({ cacheDirectory });
	entries.sort((left, right) => left.lastUsedAt - right.lastUsedAt);
	let totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
	let totalEntries = entries.length;
	const remove: QcutAudioCacheEntry[] = [];
	for (const entry of entries) {
		if (
			totalBytes <= MAX_QCUT_AUDIO_CACHE_BYTES &&
			totalEntries <= MAX_QCUT_AUDIO_CACHE_ENTRIES
		) {
			break;
		}
		if (entry.filePath === keepPath) continue;
		remove.push(entry);
		totalBytes -= entry.size;
		totalEntries -= 1;
	}
	await removeQcutAudioCacheEntries({ entries: remove });
}

export async function getQcutAudioCacheStats({
	cacheDirectory = getQcutAudioCacheDirectory(),
}: {
	cacheDirectory?: string;
} = {}): Promise<QcutAudioCacheStats> {
	const entries = await readQcutAudioCacheEntries({ cacheDirectory });
	return {
		cacheDirectory,
		entryCount: entries.length,
		totalBytes: entries.reduce((sum, entry) => sum + entry.size, 0),
		maxBytes: MAX_QCUT_AUDIO_CACHE_BYTES,
		maxEntries: MAX_QCUT_AUDIO_CACHE_ENTRIES,
	};
}

export async function clearQcutAudioCache({
	cacheDirectory = getQcutAudioCacheDirectory(),
}: {
	cacheDirectory?: string;
} = {}): Promise<QcutAudioCacheClearResult> {
	const entries = await readQcutAudioCacheEntries({ cacheDirectory });
	const removedBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
	await removeQcutAudioCacheEntries({ entries });
	let leftovers: string[] = [];
	try {
		const now = Date.now();
		const candidates = await Promise.all(
			(await fs.promises.readdir(cacheDirectory)).map(async (filename) => {
				if (filename.endsWith(".json")) return filename;
				// A fresh partial belongs to a render in flight; deleting it would
				// fail that render at its stat/rename step.
				if (!isPartialArtifact({ filename })) return null;
				try {
					const stat = await fs.promises.stat(
						path.join(cacheDirectory, filename)
					);
					return now - stat.mtimeMs >= STALE_PARTIAL_MAX_AGE_MS
						? filename
						: null;
				} catch {
					return null;
				}
			})
		);
		leftovers = candidates.filter((filename) => filename !== null);
	} catch {}
	await Promise.all(
		leftovers.map((filename) =>
			fs.promises
				.rm(path.join(cacheDirectory, filename), { force: true })
				.catch(() => {})
		)
	);
	return {
		...(await getQcutAudioCacheStats({ cacheDirectory })),
		removedEntries: entries.length,
		removedBytes,
	};
}
