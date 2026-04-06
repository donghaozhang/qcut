import { ipcMain, app, dialog } from "electron";
import path from "path";
import fs from "fs/promises";

export interface WallpaperEntry {
	id: string;
	name: string;
	path: string;
}

const SUPPORTED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".avif"];

async function getWallpapersDir(): Promise<string> {
	const dir = path.join(app.getPath("userData"), "wallpapers");
	await fs.mkdir(dir, { recursive: true });
	return dir;
}

function isImageFile(filename: string): boolean {
	const ext = path.extname(filename).toLowerCase();
	return SUPPORTED_EXTENSIONS.includes(ext);
}

function fileToEntry(dir: string, filename: string): WallpaperEntry {
	return {
		id: filename,
		name: path.parse(filename).name,
		path: path.join(dir, filename),
	};
}

export function setupWallpaperIPC(): void {
	ipcMain.handle("wallpapers:list", async (): Promise<WallpaperEntry[]> => {
		const dir = await getWallpapersDir();
		const files = (await fs.readdir(dir)).filter(isImageFile).sort();
		return files.map((f) => fileToEntry(dir, f));
	});

	ipcMain.handle(
		"wallpapers:upload",
		async (_event, sourcePath: string): Promise<WallpaperEntry | null> => {
			if (!isImageFile(sourcePath)) return null;
			try {
				await fs.access(sourcePath);
			} catch {
				return null;
			}
			const dir = await getWallpapersDir();
			let filename = path.basename(sourcePath);
			const dest = path.join(dir, filename);
			try {
				await fs.access(dest);
				const { name, ext } = path.parse(filename);
				filename = `${name}-${Date.now()}${ext}`;
			} catch {
				// dest doesn't exist, no conflict
			}
			await fs.copyFile(sourcePath, path.join(dir, filename));
			return fileToEntry(dir, filename);
		}
	);

	ipcMain.handle(
		"wallpapers:delete",
		async (_event, id: string): Promise<boolean> => {
			const dir = await getWallpapersDir();
			const filePath = path.join(dir, id);
			try {
				await fs.unlink(filePath);
				return true;
			} catch {
				return false;
			}
		}
	);

	ipcMain.handle("wallpapers:pick", async (): Promise<string | null> => {
		const result = await dialog.showOpenDialog({
			properties: ["openFile"],
			filters: [
				{
					name: "Images",
					extensions: SUPPORTED_EXTENSIONS.map((e) => e.slice(1)),
				},
			],
		});
		if (result.canceled || result.filePaths.length === 0) return null;
		return result.filePaths[0];
	});
}
