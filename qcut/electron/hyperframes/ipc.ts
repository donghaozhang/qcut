import { BrowserWindow, dialog, ipcMain, protocol } from "electron";
import { HYPERFRAMES_PROTOCOL, registerHyperframesProtocol } from "./protocol";
import {
	cancelHyperframesRender,
	cleanupHyperframesRender,
	renderHyperframesComposition,
} from "./renderer";
import { HyperframesSessionRegistry } from "./session-registry";
import { validateHyperframesSource } from "./source-security";
import type {
	HyperframesPreviewOptions,
	HyperframesRenderOptions,
} from "./types";

export const hyperframesSessionRegistry = new HyperframesSessionRegistry();

export function registerDefaultHyperframesProtocol(): void {
	registerHyperframesProtocol({
		targetProtocol: protocol,
		registry: hyperframesSessionRegistry,
	});
}

export function setupHyperframesIPC(): void {
	ipcMain.handle("hyperframes:select", async () => {
		const focusedWindow = BrowserWindow.getFocusedWindow();
		const options: Electron.OpenDialogOptions = {
			title: "Import HyperFrames HTML",
			properties: ["openFile"],
			filters: [{ name: "HyperFrames HTML", extensions: ["html", "htm"] }],
		};
		const result = focusedWindow
			? await dialog.showOpenDialog(focusedWindow, options)
			: await dialog.showOpenDialog(options);
		if (result.canceled || result.filePaths.length === 0) {
			return { success: false, cancelled: true };
		}

		try {
			const source = validateHyperframesSource({
				sourcePath: result.filePaths[0],
			});
			return { success: true, ...source };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	});

	ipcMain.handle(
		"hyperframes:preview-register",
		(_event, options: HyperframesPreviewOptions) => {
			try {
				const session = hyperframesSessionRegistry.register(options);
				return {
					success: true,
					token: session.token,
					url: `${HYPERFRAMES_PROTOCOL}://${session.token}/index.html`,
				};
			} catch (error) {
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		}
	);

	ipcMain.handle("hyperframes:preview-release", (_event, token: string) => ({
		success: hyperframesSessionRegistry.release({ token }),
	}));

	ipcMain.handle(
		"hyperframes:render",
		async (event, options: HyperframesRenderOptions) => {
			try {
				return await renderHyperframesComposition({
					options,
					registry: hyperframesSessionRegistry,
					onProgress: (progress) => {
						if (!event.sender.isDestroyed()) {
							event.sender.send("hyperframes:render-progress", progress);
						}
					},
				});
			} catch (error) {
				// Option validation and duplicate-renderId checks throw before the
				// renderer's internal try block; convert to the structured shape.
				return {
					success: false,
					renderId: options?.renderId ?? "",
					error: error instanceof Error ? error.message : String(error),
				};
			}
		}
	);

	ipcMain.handle("hyperframes:cancel", (_event, renderId: string) => ({
		success: cancelHyperframesRender({ renderId }),
	}));

	ipcMain.handle("hyperframes:cleanup", async (_event, sessionId: string) => ({
		success: await cleanupHyperframesRender({ sessionId }),
	}));
}
