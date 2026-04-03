import { ipcMain, app, dialog } from "electron";
import path from "path";
import fs from "fs";

export interface WallpaperEntry {
	id: string;
	name: string;
	path: string;
}

const SUPPORTED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".avif"];

function getWallpapersDir(): string {
	const dir = path.join(app.getPath("userData"), "wallpapers");
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	return dir;
}

function isImageFile(filename: string): boolean {
	const ext = path.extname(filename).toLowerCase();
	return SUPPORTED_EXTENSIONS.includes(ext);
}

function fileToEntry(dir: string, filename: string): WallpaperEntry {
	return {
		id: path.parse(filename).name,
		name: path.parse(filename).name,
		path: path.join(dir, filename),
	};
}

export function setupWallpaperIPC(): void {
	ipcMain.handle("wallpapers:list", async (): Promise<WallpaperEntry[]> => {
		const dir = getWallpapersDir();
		const files = fs.readdirSync(dir).filter(isImageFile).sort();
		return files.map((f) => fileToEntry(dir, f));
	});

	ipcMain.handle(
		"wallpapers:upload",
		async (
			_event,
			sourcePath: string
		): Promise<WallpaperEntry | null> => {
			if (!fs.existsSync(sourcePath) || !isImageFile(sourcePath)) {
				return null;
			}
			const dir = getWallpapersDir();
			const filename = path.basename(sourcePath);
			const dest = path.join(dir, filename);
			fs.copyFileSync(sourcePath, dest);
			return fileToEntry(dir, filename);
		}
	);

	ipcMain.handle(
		"wallpapers:delete",
		async (_event, id: string): Promise<boolean> => {
			const dir = getWallpapersDir();
			const files = fs.readdirSync(dir).filter(isImageFile);
			const match = files.find((f) => path.parse(f).name === id);
			if (!match) return false;
			fs.unlinkSync(path.join(dir, match));
			return true;
		}
	);

	ipcMain.handle(
		"wallpapers:pick",
		async (): Promise<string | null> => {
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
		}
	);
}

module.exports = { setupWallpaperIPC };
