/**
 * Project JSON Handler
 *
 * IPC handler that builds and writes project.json to the project directory.
 * Reuses buildProjectJSON() from the native pipeline CLI.
 *
 * @module electron/project-json-handler
 */

import { ipcMain, app } from "electron";
import * as fs from "fs/promises";
import * as path from "path";
import { EditorApiClient } from "./native-pipeline/editor/editor-api-client.js";
import { buildProjectJSON } from "./native-pipeline/cli/project-json-builder.js";

const LOG_PREFIX = "[ProjectJSON]";

/**
 * Get the project directory path from Documents/QCut/Projects/<projectId>.
 */
function getProjectDir(projectId: string): string {
	const sanitized = projectId.replace(/[/\\]/g, "").replace(/\.\./g, "");
	return path.join(app.getPath("documents"), "QCut", "Projects", sanitized);
}

export function setupProjectJsonIPC(): void {
	ipcMain.handle(
		"project-json:write",
		async (_event, projectId: string): Promise<{ ok: boolean }> => {
			try {
				const client = new EditorApiClient({
					baseUrl: "http://127.0.0.1:8765",
					timeout: 5000,
					skipCapabilityCheck: true,
				});
				const json = await buildProjectJSON(client, projectId);
				const projectDir = getProjectDir(projectId);

				await fs.mkdir(projectDir, { recursive: true });
				await fs.writeFile(
					path.join(projectDir, "project.json"),
					JSON.stringify(json, null, 2),
					"utf-8"
				);

				console.log(`${LOG_PREFIX} Wrote project.json for ${projectId}`);
				return { ok: true };
			} catch (error: any) {
				// Don't crash — project.json is informational, not critical
				console.warn(
					`${LOG_PREFIX} Failed to write project.json:`,
					error.message
				);
				return { ok: false };
			}
		}
	);
}
