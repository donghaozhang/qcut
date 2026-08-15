/**
 * Storage IPC handlers.
 * @module electron/main-ipc/storage-handlers
 */

import { ipcMain, app, type IpcMainInvokeEvent } from "electron";
import * as fs from "fs";
import * as path from "path";
import type { MainIpcDeps } from "./types.js";

export function registerStorageHandlers(deps: MainIpcDeps): void {
	const { logger } = deps;

	ipcMain.handle(
		"storage:save",
		async (
			_event: IpcMainInvokeEvent,
			key: string,
			data: any
		): Promise<void> => {
			try {
				const safeKey = path.basename(key);
				const userDataPath = app.getPath("userData");
				const filePath = path.join(userDataPath, "projects", `${safeKey}.json`);
				await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
				await fs.promises.writeFile(filePath, JSON.stringify(data));
			} catch (error: unknown) {
				logger.error(`[Storage] Failed to save key "${key}":`, error);
				throw error;
			}
		}
	);

	ipcMain.handle(
		"storage:load",
		async (_event: IpcMainInvokeEvent, key: string): Promise<any> => {
			try {
				const safeKey = path.basename(key);
				const userDataPath = app.getPath("userData");
				const filePath = path.join(userDataPath, "projects", `${safeKey}.json`);
				const data = await fs.promises.readFile(filePath, "utf8");
				if (!data || !data.trim()) {
					return null;
				}
				return JSON.parse(data);
			} catch (error: any) {
				if (error.code === "ENOENT") return null;
				if (error instanceof SyntaxError) {
					logger.error(
						`[Storage] Corrupted JSON file for key "${key}":`,
						error.message
					);
					return null;
				}
				throw error;
			}
		}
	);

	ipcMain.handle(
		"storage:remove",
		async (_event: IpcMainInvokeEvent, key: string): Promise<void> => {
			try {
				const safeKey = path.basename(key);
				const userDataPath = app.getPath("userData");
				const filePath = path.join(userDataPath, "projects", `${safeKey}.json`);
				await fs.promises.unlink(filePath);
			} catch (error: any) {
				if (error.code !== "ENOENT") throw error;
			}
		}
	);

	ipcMain.handle(
		"storage:project-file-path",
		(_event: IpcMainInvokeEvent, key: string): string => {
			const safeKey = path.basename(key);
			const userDataPath = app.getPath("userData");
			return path.join(userDataPath, "projects", `${safeKey}.json`);
		}
	);

	ipcMain.handle("storage:list", async (): Promise<string[]> => {
		try {
			const userDataPath = app.getPath("userData");
			const projectsDir = path.join(userDataPath, "projects");
			const files = await fs.promises.readdir(projectsDir);
			return files
				.filter((f) => f.endsWith(".json"))
				.map((f) => f.replace(/\.json$/, ""));
		} catch (error: any) {
			if (error.code === "ENOENT") return [];
			throw error;
		}
	});

	ipcMain.handle("storage:clear", async (): Promise<void> => {
		try {
			const userDataPath = app.getPath("userData");
			const projectsDir = path.join(userDataPath, "projects");
			const files = await fs.promises.readdir(projectsDir);
			await Promise.all(
				files
					.filter((f) => f.endsWith(".json"))
					.map((f) => fs.promises.unlink(path.join(projectsDir, f)))
			);
		} catch (error: any) {
			if (error.code !== "ENOENT") throw error;
		}
	});
}
