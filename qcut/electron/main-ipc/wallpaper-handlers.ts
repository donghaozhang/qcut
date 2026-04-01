/**
 * Wallpaper IPC Handlers
 *
 * Discovers built-in and custom wallpapers, handles upload/delete.
 */

import { ipcMain, app } from "electron";
import fs from "fs";
import path from "path";

const IMAGE_EXT = /\.(avif|gif|jpe?g|png|svg|webp)$/i;

interface WallpaperEntry {
	id: string;
	label: string;
	path: string;
	isCustom: boolean;
}

function getBuiltInDir(): string {
	return path.join(
		app.isPackaged ? process.resourcesPath : path.join(__dirname, ".."),
		"resources",
		"wallpapers"
	);
}

function getCustomDir(): string {
	return path.join(app.getPath("userData"), "wallpapers");
}

function toKebabId(fileName: string): string {
	return fileName
		.replace(/\.[^.]+$/, "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function toLabel(fileName: string): string {
	const base = fileName.replace(/\.[^.]+$/, "").trim();
	if (!base) return "Wallpaper";
	return base
		.replace(/[_-]+/g, " ")
		.replace(/\s+/g, " ")
		.replace(/\b\w/g, (m) => m.toUpperCase());
}

function scanDir(dir: string, isCustom: boolean): WallpaperEntry[] {
	if (!fs.existsSync(dir)) return [];
	const entries: WallpaperEntry[] = [];
	for (const file of fs.readdirSync(dir)) {
		if (!IMAGE_EXT.test(file)) continue;
		entries.push({
			id: toKebabId(file),
			label: toLabel(file),
			path: path.join(dir, file),
			isCustom,
		});
	}
	return entries.sort((a, b) =>
		a.label.localeCompare(b.label, undefined, { numeric: true })
	);
}

export function registerWallpaperHandlers(): void {
	ipcMain.handle("wallpaper:list", () => {
		const builtIn = scanDir(getBuiltInDir(), false);
		const custom = scanDir(getCustomDir(), true);
		return [...builtIn, ...custom];
	});

	ipcMain.handle(
		"wallpaper:upload",
		async (_event, sourcePath: string): Promise<WallpaperEntry | null> => {
			const fileName = path.basename(sourcePath);
			if (!IMAGE_EXT.test(fileName)) return null;

			const destDir = getCustomDir();
			if (!fs.existsSync(destDir)) {
				fs.mkdirSync(destDir, { recursive: true });
			}

			const destPath = path.join(destDir, fileName);
			fs.copyFileSync(sourcePath, destPath);

			return {
				id: toKebabId(fileName),
				label: toLabel(fileName),
				path: destPath,
				isCustom: true,
			};
		}
	);

	ipcMain.handle(
		"wallpaper:delete",
		async (_event, wallpaperPath: string): Promise<boolean> => {
			// Only allow deleting from custom dir
			const customDir = getCustomDir();
			const resolved = path.resolve(wallpaperPath);
			if (!resolved.startsWith(customDir + path.sep)) return false;
			if (!fs.existsSync(resolved)) return false;

			fs.unlinkSync(resolved);
			return true;
		}
	);
}
