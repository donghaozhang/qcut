/**
 * Shell & GitHub IPC handlers.
 * @module electron/main-ipc/shell-github-handlers
 */

import { ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import type { MainIpcDeps } from "./types.js";

export function registerShellGithubHandlers(deps: MainIpcDeps): void {
	const { logger } = deps;

	ipcMain.handle(
		"shell:showItemInFolder",
		async (_event: IpcMainInvokeEvent, filePath: string): Promise<void> => {
			shell.showItemInFolder(filePath);
		}
	);

	ipcMain.handle(
		"shell:openExternal",
		async (_event: IpcMainInvokeEvent, url: string): Promise<void> => {
			// Only allow http/https URLs to prevent shell injection
			if (!/^https?:\/\//i.test(url)) {
				logger.error(`shell:openExternal blocked non-http URL: ${url}`);
				return;
			}
			await shell.openExternal(url);
		}
	);

	ipcMain.handle("fetch-github-stars", async (): Promise<{ stars: number }> => {
		try {
			const https = require("https");
			return new Promise((resolve) => {
				const request = https
					.get(
						"https://api.github.com/repos/donghaozhang/qcut",
						{
							headers: { "User-Agent": "QCut-Video-Editor" },
							timeout: 10000, // 10 second timeout
						},
						(res: any) => {
							let data = "";
							res.on("data", (chunk: string) => {
								data += chunk;
							});
							res.on("end", () => {
								try {
									const parsed = JSON.parse(data);
									resolve({ stars: parsed.stargazers_count || 0 });
								} catch {
									resolve({ stars: 0 });
								}
							});
						}
					)
					.on("error", (error: Error) => {
						logger.error("Failed to fetch GitHub stars:", error);
						resolve({ stars: 0 });
					})
					.on("timeout", () => {
						request.abort();
						logger.error("GitHub stars request timed out");
						resolve({ stars: 0 });
					});
			});
		} catch (error: any) {
			logger.error("Error fetching GitHub stars:", error);
			return { stars: 0 };
		}
	});
}
