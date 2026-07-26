/**
 * Storage-location and cache-maintenance IPC backing the Global Settings
 * "Drafts & Storage" tab: reports where user data lives, aggregates cache
 * sizes across the per-purpose temp dirs plus the video proxy cache, and
 * clears them on request.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { app, ipcMain } from "electron";
import {
	clearVideoPreviewProxyCache,
	getVideoPreviewProxyCacheStats,
} from "../ffmpeg/video-preview-proxy.js";
import { getRecordingsDir } from "../screen-recording-handler/path-utils.js";

export interface AppStorageInfo {
	drafts: string;
	projects: string;
	recordings: string;
	exports: string;
}

export interface AppCacheEntry {
	id: string;
	path: string;
	bytes: number;
}

export interface AppCacheStats {
	totalBytes: number;
	entries: AppCacheEntry[];
}

/** Temp dirs QCut creates under the OS temp root; safe to clear at rest. */
const TEMP_CACHE_DIR_NAMES = [
	"qcut-videos",
	"qcut-audio",
	"qcut-audio-extraction",
	"qcut-previews",
];

async function directorySize(dir: string): Promise<number> {
	let total = 0;
	let entries: fs.Dirent[];
	try {
		entries = await fs.promises.readdir(dir, { withFileTypes: true });
	} catch {
		return 0;
	}
	for (const entry of entries) {
		const fullPath = path.join(dir, entry.name);
		try {
			if (entry.isDirectory()) {
				total += await directorySize(fullPath);
			} else if (entry.isFile()) {
				total += (await fs.promises.stat(fullPath)).size;
			}
		} catch {
			// Files can vanish while we walk; skip them.
		}
	}
	return total;
}

async function clearDirectoryContents(dir: string): Promise<void> {
	let entries: string[];
	try {
		entries = await fs.promises.readdir(dir);
	} catch {
		return;
	}
	await Promise.all(
		entries.map((entry) =>
			fs.promises
				.rm(path.join(dir, entry), { recursive: true, force: true })
				.catch(() => {})
		)
	);
}

export function getAppStorageInfo(): AppStorageInfo {
	return {
		drafts: path.join(app.getPath("userData"), "projects"),
		projects: path.join(app.getPath("documents"), "QCut", "Projects"),
		recordings: getRecordingsDir(),
		exports: path.join(app.getPath("documents"), "QCut", "Exports"),
	};
}

export async function collectAppCacheStats(): Promise<AppCacheStats> {
	const entries: AppCacheEntry[] = [];
	const proxyStats = await getVideoPreviewProxyCacheStats();
	entries.push({
		id: "preview-proxies",
		path: proxyStats.cacheDir,
		bytes: proxyStats.totalBytes,
	});
	for (const name of TEMP_CACHE_DIR_NAMES) {
		const dir = path.join(os.tmpdir(), name);
		entries.push({ id: name, path: dir, bytes: await directorySize(dir) });
	}
	return {
		totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
		entries,
	};
}

export async function clearAppCaches(): Promise<{ freedBytes: number }> {
	const before = await collectAppCacheStats();
	await clearVideoPreviewProxyCache();
	for (const name of TEMP_CACHE_DIR_NAMES) {
		await clearDirectoryContents(path.join(os.tmpdir(), name));
	}
	const after = await collectAppCacheStats();
	return { freedBytes: Math.max(0, before.totalBytes - after.totalBytes) };
}

export function registerAppMaintenanceHandlers(): void {
	ipcMain.handle("app-maintenance:get-storage-info", () => getAppStorageInfo());
	ipcMain.handle("app-maintenance:get-cache-stats", () =>
		collectAppCacheStats()
	);
	ipcMain.handle("app-maintenance:clear-caches", () => clearAppCaches());
}
