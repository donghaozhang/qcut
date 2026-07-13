/**
 * Update IPC handlers.
 * @module electron/main-ipc/update-handlers
 */

import { app, ipcMain } from "electron";
import type { UpdateState } from "../auto-update-controller.js";
import type { UpdatePreferences } from "../update-preferences.js";
import { toReleaseVersion } from "../update-version.js";
import type { MainIpcDeps } from "./types.js";

function unavailableState(): UpdateState {
	return {
		phase: "error",
		currentVersion: toReleaseVersion({ packageVersion: app.getVersion() }),
		percent: 0,
		transferred: 0,
		total: 0,
		automaticDownload: false,
		message: app.isPackaged
			? "Auto-updater not available"
			: "Updates only available in production builds",
	};
}

export function registerUpdateHandlers(deps: MainIpcDeps): void {
	const { logger, updateController } = deps;

	ipcMain.handle("get-update-state", async () => {
		return updateController?.getState() ?? unavailableState();
	});

	ipcMain.handle("get-update-preferences", async () => {
		return (
			updateController?.getPreferences() ?? {
				automaticUpdates: false,
				maxAutomaticDownloadBytes: 0,
			}
		);
	});

	ipcMain.handle(
		"set-update-preferences",
		async (_event, preferences: Partial<UpdatePreferences>) => {
			if (!updateController)
				return { automaticUpdates: false, maxAutomaticDownloadBytes: 0 };
			try {
				return updateController.setPreferences({ preferences });
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : String(error);
				logger.error("Error saving update preferences:", message);
				return updateController.getPreferences();
			}
		}
	);

	ipcMain.handle("check-for-updates", async () => {
		if (!app.isPackaged || !updateController) return unavailableState();

		try {
			return await updateController.checkForUpdates();
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error("Error checking for updates:", message);
			return { ...unavailableState(), error: message };
		}
	});

	ipcMain.handle("download-update", async () => {
		if (!app.isPackaged || !updateController) return unavailableState();
		try {
			return await updateController.downloadUpdate();
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error("Error downloading update:", message);
			return { ...unavailableState(), error: message };
		}
	});

	ipcMain.handle("install-update", async () => {
		if (!app.isPackaged || !updateController) {
			return { success: false, message: unavailableState().message };
		}

		try {
			return updateController.installUpdate();
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error("Error installing update:", message);
			return { success: false, error: message };
		}
	});
}
