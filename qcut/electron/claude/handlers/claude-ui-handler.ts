/**
 * Claude UI Panel Navigation Handler
 *
 * Provides panel switching for Claude Code CLI.
 * Follows the request-response IPC pattern from claude-navigator-handler.ts.
 *
 * @module electron/claude/handlers/claude-ui-handler
 */

import { ipcMain, BrowserWindow, type IpcMainEvent } from "electron";
import { generateId } from "../utils/helpers.js";

const REQUEST_TIMEOUT_MS = 5000;

/** Valid panel IDs the renderer accepts. */
const VALID_PANELS = [
	"media",
	"text",
	"stickers",
	"video-edit",
	"effects",
	"transitions",
	"filters",
	"text2image",
	"nano-edit",
	"ai",
	"sounds",
	"segmentation",
	"remotion",
	"pty",
	"word-timeline",
	"project-folder",
	"upscale",
	"moyin",
	"properties",
	"export",
	"api-keys",
] as const;

/** Friendly aliases → actual panel IDs. */
const PANEL_ALIASES: Record<string, string> = {
	terminal: "pty",
	skills: "nano-edit",
	library: "media",
	"ai-video": "ai",
	"ai-images": "text2image",
	"audio-studio": "video-edit",
	"smart-speech": "word-timeline",
	project: "project-folder",
};

/** Valid inner tab IDs per panel (only moyin has inner tabs for now). */
const PANEL_TABS: Record<string, readonly string[]> = {
	moyin: ["overview", "characters", "scenes", "shots", "generate"],
};

/** Friendly aliases → actual tab IDs. */
const TAB_ALIASES: Record<string, string> = {
	structure: "overview",
};

export interface SwitchPanelResponse {
	switched: boolean;
	panel: string;
	group: string;
}

/**
 * Resolve a panel name (or alias) to a valid panel ID.
 * Returns null if the name is not recognized.
 */
export function resolvePanelId(name: string): string | null {
	const lower = name.toLowerCase();
	if ((VALID_PANELS as readonly string[]).includes(lower)) return lower;
	if (lower in PANEL_ALIASES) return PANEL_ALIASES[lower];
	return null;
}

/** Return all valid panel names and aliases for help text. */
export function getAvailablePanels(): string[] {
	return [...VALID_PANELS, ...Object.keys(PANEL_ALIASES)];
}

/**
 * Resolve a tab name (or alias) to a valid tab ID for the given panel.
 * Returns null if the panel has no tabs or the tab is not recognized.
 */
export function resolveTabId(panel: string, name: string): string | null {
	const lower = name.toLowerCase();
	const resolved = lower in TAB_ALIASES ? TAB_ALIASES[lower] : lower;
	const validTabs = PANEL_TABS[panel];
	if (!validTabs) return null;
	return validTabs.includes(resolved) ? resolved : null;
}

/** Return available tabs for a panel (empty array if none). */
export function getAvailableTabs(panel: string): string[] {
	const tabs = PANEL_TABS[panel];
	if (!tabs) return [];
	return [...tabs, ...Object.keys(TAB_ALIASES)];
}

/**
 * Request panel switch from renderer process.
 * Optionally switch an inner tab (e.g. moyin sub-tabs).
 */
export async function requestSwitchPanel(
	win: BrowserWindow,
	panel: string,
	tab?: string
): Promise<SwitchPanelResponse> {
	return new Promise((resolve, reject) => {
		let resolved = false;
		const requestId = generateId("req");

		const timeout = setTimeout(() => {
			if (resolved) return;
			resolved = true;
			ipcMain.removeListener("claude:ui:switch-panel:response", handler);
			reject(new Error("Timeout waiting for panel switch confirmation"));
		}, REQUEST_TIMEOUT_MS);

		const handler = (
			_event: IpcMainEvent,
			data: {
				requestId: string;
				result?: SwitchPanelResponse;
				error?: string;
			}
		) => {
			if (data.requestId !== requestId || resolved) return;
			resolved = true;
			clearTimeout(timeout);
			ipcMain.removeListener("claude:ui:switch-panel:response", handler);
			if (data.error) {
				reject(new Error(data.error));
			} else if (data.result) {
				resolve(data.result);
			} else {
				reject(new Error("Renderer returned empty result for panel switch"));
			}
		};

		ipcMain.on("claude:ui:switch-panel:response", handler);
		win.webContents.send("claude:ui:switch-panel:request", {
			requestId,
			panel,
			...(tab ? { tab } : {}),
		});
	});
}
