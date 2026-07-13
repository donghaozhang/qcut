/**
 * Release notes IPC handlers.
 * @module electron/main-ipc/release-notes-handlers
 */

import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	parseReleaseNote,
	readReleaseNotesFromDir,
} from "../release-notes-utils.js";
import { normalizeReleaseNotesVersion } from "../update-version.js";
import type { MainIpcDeps, ReleaseNote } from "./types.js";

export function registerReleaseNotesHandlers(deps: MainIpcDeps): void {
	const { logger, getReleasesDir, readChangelogFallback } = deps;

	ipcMain.handle(
		"get-release-notes",
		async (
			_: IpcMainInvokeEvent,
			version?: string
		): Promise<ReleaseNote | null> => {
			try {
				const releasesDir = getReleasesDir();

				// Validate version parameter to prevent path traversal
				let filename = "latest.md";
				if (version) {
					const releaseVersion = normalizeReleaseNotesVersion({ version });
					filename = `v${releaseVersion}.md`;
				}

				const filePath = join(releasesDir, filename);

				if (!existsSync(filePath)) {
					return null;
				}

				const raw = readFileSync(filePath, "utf-8");
				return parseReleaseNote(raw);
			} catch (error: unknown) {
				logger.error("Error reading release notes:", error);
				return null;
			}
		}
	);

	ipcMain.handle("get-changelog", async (): Promise<ReleaseNote[]> => {
		try {
			const releasesDir = getReleasesDir();
			const notes = readReleaseNotesFromDir(releasesDir);

			if (notes.length === 0) {
				return readChangelogFallback();
			}

			return notes;
		} catch (error: unknown) {
			logger.error("Error reading changelog:", error);
			return readChangelogFallback();
		}
	});
}
