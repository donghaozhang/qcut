/**
 * Claude Project API Handler
 * Provides project settings read/write capabilities for Claude Code integration
 */

import {
	ipcMain,
	BrowserWindow,
	IpcMainInvokeEvent,
	IpcMainEvent,
} from "electron";
import * as fs from "fs/promises";
import { getProjectPath, getProjectSettingsPath } from "../utils/helpers.js";
import { claudeLog } from "../utils/logger.js";
import type { ProjectSettings, ProjectStats } from "../../types/claude-api";

const HANDLER_NAME = "Project";
const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
	name: "Untitled Project",
	width: 1920,
	height: 1080,
	fps: 30,
	aspectRatio: "16:9",
	backgroundColor: "#000000",
	exportFormat: "mp4",
	exportQuality: "high",
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isErrnoNoEntry(error: unknown): boolean {
	if (!isRecord(error)) return false;
	return error.code === "ENOENT";
}

function getStringValue({
	value,
	fallback,
}: {
	value: unknown;
	fallback: string;
}): string {
	return typeof value === "string" && value.trim().length > 0
		? value
		: fallback;
}

function getPositiveNumber({
	value,
}: {
	value: unknown;
}): number | null {
	try {
		if (typeof value === "number" && Number.isFinite(value) && value > 0) {
			return value;
		}
		if (typeof value === "string" && value.trim().length > 0) {
			const parsed = Number(value);
			if (Number.isFinite(parsed) && parsed > 0) {
				return parsed;
			}
		}
		return null;
	} catch {
		return null;
	}
}

function getNestedRecord({
	value,
	key,
}: {
	value: Record<string, unknown> | null;
	key: string;
}): Record<string, unknown> | null {
	try {
		if (!value) return null;
		const nested = value[key];
		return isRecord(nested) ? nested : null;
	} catch {
		return null;
	}
}

/** Parse an "W:H" aspect ratio string into width/height numbers, or null if invalid. */
function parseAspectRatio({
	aspectRatio,
}: {
	aspectRatio: string;
}): { width: number; height: number } | null {
	try {
		const [widthRaw, heightRaw] = aspectRatio.split(":");
		const width = Number.parseFloat(widthRaw);
		const height = Number.parseFloat(heightRaw);

		if (!Number.isFinite(width) || !Number.isFinite(height)) {
			return null;
		}
		if (width <= 0 || height <= 0) {
			return null;
		}

		return { width, height };
	} catch {
		return null;
	}
}

/** Return a ProjectStats object with all counters at zero. */
function getEmptyStats(): ProjectStats {
	return {
		totalDuration: 0,
		mediaCount: { video: 0, audio: 0, image: 0 },
		trackCount: 0,
		elementCount: 0,
		lastModified: Date.now(),
		fileSize: 0,
	};
}

function parseProjectSettings({
	project,
}: {
	project: unknown;
}): ProjectSettings {
	try {
		if (!isRecord(project)) {
			return { ...DEFAULT_PROJECT_SETTINGS };
		}

		const settings = getNestedRecord({ value: project, key: "settings" });
		const canvasSize =
			getNestedRecord({ value: project, key: "canvasSize" }) ??
			getNestedRecord({ value: settings, key: "canvasSize" });

		const width =
			getPositiveNumber({ value: canvasSize?.width }) ??
			getPositiveNumber({ value: project.width }) ??
			getPositiveNumber({ value: settings?.width }) ??
			DEFAULT_PROJECT_SETTINGS.width;

		const height =
			getPositiveNumber({ value: canvasSize?.height }) ??
			getPositiveNumber({ value: project.height }) ??
			getPositiveNumber({ value: settings?.height }) ??
			DEFAULT_PROJECT_SETTINGS.height;

		const fps =
			getPositiveNumber({ value: project.fps }) ??
			getPositiveNumber({ value: settings?.fps }) ??
			DEFAULT_PROJECT_SETTINGS.fps;

		return {
			name: getStringValue({
				value: project.name ?? settings?.name,
				fallback: DEFAULT_PROJECT_SETTINGS.name,
			}),
			width,
			height,
			fps,
			aspectRatio: getStringValue({
				value: project.aspectRatio ?? settings?.aspectRatio,
				fallback: `${width}:${height}`,
			}),
			backgroundColor: getStringValue({
				value: project.backgroundColor ?? settings?.backgroundColor,
				fallback: DEFAULT_PROJECT_SETTINGS.backgroundColor,
			}),
			exportFormat: getStringValue({
				value: project.exportFormat ?? settings?.exportFormat,
				fallback: DEFAULT_PROJECT_SETTINGS.exportFormat,
			}),
			exportQuality: getStringValue({
				value: project.exportQuality ?? settings?.exportQuality,
				fallback: DEFAULT_PROJECT_SETTINGS.exportQuality,
			}),
		};
	} catch {
		return { ...DEFAULT_PROJECT_SETTINGS };
	}
}

function buildProjectScaffoldDocument({
	projectId,
	projectName,
}: {
	projectId: string;
	projectName: string;
}): Record<string, unknown> {
	const nowIso = new Date().toISOString();
	return {
		projectId,
		name: projectName,
		createdAt: nowIso,
		updatedAt: nowIso,
		version: "1.0",
		fps: DEFAULT_PROJECT_SETTINGS.fps,
		aspectRatio: DEFAULT_PROJECT_SETTINGS.aspectRatio,
		backgroundColor: DEFAULT_PROJECT_SETTINGS.backgroundColor,
		backgroundType: "color",
		exportFormat: DEFAULT_PROJECT_SETTINGS.exportFormat,
		exportQuality: DEFAULT_PROJECT_SETTINGS.exportQuality,
		canvasSize: {
			width: DEFAULT_PROJECT_SETTINGS.width,
			height: DEFAULT_PROJECT_SETTINGS.height,
		},
		width: DEFAULT_PROJECT_SETTINGS.width,
		height: DEFAULT_PROJECT_SETTINGS.height,
		media: [],
		timeline: [],
		settings: {},
	};
}

/**
 * Get project settings from disk
 */
export async function getProjectSettings(
	projectId: string
): Promise<ProjectSettings> {
	claudeLog.info(HANDLER_NAME, `Getting settings for project: ${projectId}`);

	const settingsPath = getProjectSettingsPath(projectId);
	const fallbackSettings = { ...DEFAULT_PROJECT_SETTINGS };

	try {
		const content = await fs.readFile(settingsPath, "utf-8");
		const project = JSON.parse(content);
		return parseProjectSettings({ project });
	} catch (error) {
		if (isErrnoNoEntry(error)) {
			claudeLog.warn(
				HANDLER_NAME,
				`project.qcut missing for ${projectId}; using default settings`
			);
			return fallbackSettings;
		}

		claudeLog.error(
			HANDLER_NAME,
			"Failed to read project settings; using defaults:",
			error
		);
		return fallbackSettings;
	}
}

/**
 * Update project settings on disk.
 * Returns the updated settings but does NOT notify the renderer — the IPC wrapper handles that.
 */
export async function updateProjectSettings(
	projectId: string,
	settings: Partial<ProjectSettings>
): Promise<void> {
	claudeLog.info(HANDLER_NAME, `Updating settings for project: ${projectId}`);

	const settingsPath = getProjectSettingsPath(projectId);
	const projectPath = getProjectPath(projectId);

	try {
		let projectDoc: Record<string, unknown> = buildProjectScaffoldDocument({
			projectId,
			projectName: DEFAULT_PROJECT_SETTINGS.name,
		});

		try {
			const content = await fs.readFile(settingsPath, "utf-8");
			const parsed = JSON.parse(content);
			if (isRecord(parsed)) {
				projectDoc = { ...projectDoc, ...parsed };
			}
		} catch (error) {
			if (isErrnoNoEntry(error)) {
				claudeLog.warn(
					HANDLER_NAME,
					`project.qcut missing for ${projectId}; creating a new settings file`
				);
			} else {
				claudeLog.warn(
					HANDLER_NAME,
					`project.qcut unreadable for ${projectId}; rebuilding from defaults`,
					error
				);
			}
		}

		const parsedSettings = parseProjectSettings({ project: projectDoc });

		let nextName = parsedSettings.name;
		let nextWidth = parsedSettings.width;
		let nextHeight = parsedSettings.height;
		let nextFps = parsedSettings.fps;
		let nextAspectRatio = parsedSettings.aspectRatio;
		let nextBackgroundColor = parsedSettings.backgroundColor;
		let nextExportFormat = parsedSettings.exportFormat;
		let nextExportQuality = parsedSettings.exportQuality;

		if (typeof settings.name === "string" && settings.name.trim().length > 0) {
			nextName = settings.name.trim();
		}

		const providedWidth = getPositiveNumber({ value: settings.width });
		const providedHeight = getPositiveNumber({ value: settings.height });
		const providedFps = getPositiveNumber({ value: settings.fps });
		if (providedWidth !== null) nextWidth = providedWidth;
		if (providedHeight !== null) nextHeight = providedHeight;
		if (providedFps !== null) nextFps = providedFps;

		if (typeof settings.backgroundColor === "string") {
			nextBackgroundColor = settings.backgroundColor;
		}
		if (typeof settings.exportFormat === "string") {
			nextExportFormat = settings.exportFormat;
		}
		if (typeof settings.exportQuality === "string") {
			nextExportQuality = settings.exportQuality;
		}
		if (typeof settings.aspectRatio === "string") {
			nextAspectRatio = settings.aspectRatio;
		}

		if (
			typeof settings.aspectRatio === "string" &&
			providedWidth === null &&
			providedHeight === null
		) {
			const parsedAspectRatio = parseAspectRatio({
				aspectRatio: settings.aspectRatio,
			});
			if (parsedAspectRatio) {
				if (parsedAspectRatio.width >= parsedAspectRatio.height) {
					nextHeight = Math.max(
						1,
						Math.round(
							nextWidth *
								(parsedAspectRatio.height / parsedAspectRatio.width)
						)
					);
				} else {
					nextWidth = Math.max(
						1,
						Math.round(
							nextHeight *
								(parsedAspectRatio.width / parsedAspectRatio.height)
						)
					);
				}
				nextAspectRatio = settings.aspectRatio;
			}
		}

		const nowIso = new Date().toISOString();
		const createdAt = getStringValue({
			value: projectDoc.createdAt,
			fallback: nowIso,
		});
		const nextCanvasSize = {
			width: nextWidth,
			height: nextHeight,
		};

		const updatedProjectDoc: Record<string, unknown> = {
			...projectDoc,
			projectId,
			name: nextName,
			createdAt,
			updatedAt: nowIso,
			version: getStringValue({ value: projectDoc.version, fallback: "1.0" }),
			fps: nextFps,
			aspectRatio: nextAspectRatio,
			backgroundColor: nextBackgroundColor,
			backgroundType: getStringValue({
				value: projectDoc.backgroundType,
				fallback: "color",
			}),
			exportFormat: nextExportFormat,
			exportQuality: nextExportQuality,
			canvasSize: nextCanvasSize,
			width: nextWidth,
			height: nextHeight,
		};

		if (!Array.isArray(updatedProjectDoc.media)) {
			updatedProjectDoc.media = [];
		}
		if (!Array.isArray(updatedProjectDoc.timeline)) {
			updatedProjectDoc.timeline = [];
		}
		if (!isRecord(updatedProjectDoc.settings)) {
			updatedProjectDoc.settings = {};
		}

		await fs.mkdir(projectPath, { recursive: true });
		await fs.writeFile(
			settingsPath,
			JSON.stringify(updatedProjectDoc, null, 2),
			"utf-8"
		);

		const broadcastSettings = {
			...settings,
			canvasSize: nextCanvasSize,
		};
		broadcastProjectSettingsUpdate({ projectId, settings: broadcastSettings });

		claudeLog.info(HANDLER_NAME, `Successfully updated project: ${projectId}`);
	} catch (error) {
		claudeLog.error(HANDLER_NAME, "Failed to update project settings:", error);
		throw error;
	}
}

/** Broadcast updated project settings to all renderer windows. */
export function broadcastProjectSettingsUpdate({
	projectId,
	settings,
}: {
	projectId: string;
	settings: Partial<ProjectSettings>;
}): void {
	try {
		const windows = BrowserWindow.getAllWindows();
		for (const win of windows) {
			try {
				win.webContents.send("claude:project:updated", projectId, settings);
			} catch {
				// Ignore individual window dispatch failures.
			}
		}
	} catch (error) {
		claudeLog.warn(
			HANDLER_NAME,
			"Failed to broadcast project settings update:",
			error
		);
	}
}

/**
 * Get project stats from renderer via IPC.
 * Requires a BrowserWindow to communicate with.
 */
export async function getProjectStats(
	win: BrowserWindow,
	projectId: string
): Promise<ProjectStats> {
	claudeLog.info(HANDLER_NAME, `Getting stats for project: ${projectId}`);

	return new Promise((resolve) => {
		const requestId = `${Date.now()}-${win.webContents.id}`;

		const handler = (
			responseEvent: IpcMainEvent,
			stats: ProjectStats,
			responseId?: string
		) => {
			if (
				responseEvent.sender.id !== win.webContents.id ||
				responseId !== requestId
			) {
				return;
			}
			clearTimeout(timeout);
			ipcMain.removeListener("claude:project:statsResponse", handler);
			resolve(stats);
		};

		const timeout = setTimeout(() => {
			ipcMain.removeListener("claude:project:statsResponse", handler);
			claudeLog.warn(
				HANDLER_NAME,
				"Timeout waiting for stats, returning empty"
			);
			resolve(getEmptyStats());
		}, 3000);

		try {
			ipcMain.on("claude:project:statsResponse", handler);
			win.webContents.send("claude:project:statsRequest", {
				projectId,
				requestId,
			});
		} catch (error) {
			clearTimeout(timeout);
			ipcMain.removeListener("claude:project:statsResponse", handler);
			claudeLog.error(HANDLER_NAME, "Failed to request stats:", error);
			resolve(getEmptyStats());
		}
	});
}

export { getEmptyStats };

/** Register Claude project IPC handlers for settings and stats. */
export function setupClaudeProjectIPC(): void {
	claudeLog.info(HANDLER_NAME, "Setting up Project IPC handlers...");

	ipcMain.handle(
		"claude:project:getSettings",
		async (_event: IpcMainInvokeEvent, projectId: string) =>
			getProjectSettings(projectId)
	);

	ipcMain.handle(
		"claude:project:updateSettings",
		async (
			_event: IpcMainInvokeEvent,
			projectId: string,
			settings: Partial<ProjectSettings>
		) => {
			await updateProjectSettings(projectId, settings);
		}
	);

	ipcMain.handle(
		"claude:project:getStats",
		async (event: IpcMainInvokeEvent, projectId: string) => {
			const win = BrowserWindow.fromWebContents(event.sender);
			if (!win) {
				return getEmptyStats();
			}
			return getProjectStats(win, projectId);
		}
	);

	claudeLog.info(HANDLER_NAME, "Project IPC handlers registered");
}

// CommonJS export for main.ts compatibility
module.exports = {
	setupClaudeProjectIPC,
	getProjectSettings,
	updateProjectSettings,
	broadcastProjectSettingsUpdate,
	getProjectStats,
	getEmptyStats,
};
