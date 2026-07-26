/**
 * Application menu with a real Help section (Help Center, Feedback,
 * Keyboard Shortcuts, Quick Start). Standard roles keep every default
 * accelerator (copy/paste/undo/fullscreen) intact.
 */

import { BrowserWindow, Menu, shell } from "electron";

const HELP_CENTER_URL =
	"https://github.com/Quriosity-agent/qcut/tree/master/docs";
const FEEDBACK_URL = "https://github.com/Quriosity-agent/qcut/issues/new";
const DISCORD_URL = "https://discord.gg/zmR9N35cjK";

/** Events the renderer listens for on `window` (see apps/web components). */
const OPEN_QUICK_START_EVENT = "qcut:open-quick-start";
const OPEN_KEYBOARD_SHORTCUTS_EVENT = "qcut:open-keyboard-shortcuts";

function dispatchRendererEvent(eventName: string): () => void {
	return () => {
		const win =
			BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
		void win?.webContents
			.executeJavaScript(
				`window.dispatchEvent(new CustomEvent(${JSON.stringify(eventName)}));`
			)
			.catch(() => {
				// Renderer not ready yet — the menu item is harmless to retry.
			});
	};
}

export function setupApplicationMenu(): void {
	const isMac = process.platform === "darwin";
	const template: Electron.MenuItemConstructorOptions[] = [
		...(isMac ? [{ role: "appMenu" as const }] : []),
		{ role: "fileMenu" },
		{ role: "editMenu" },
		{ role: "viewMenu" },
		{ role: "windowMenu" },
		{
			role: "help",
			submenu: [
				{
					label: "Help Center",
					click: () => {
						void shell.openExternal(HELP_CENTER_URL);
					},
				},
				{
					label: "Feedback",
					click: () => {
						void shell.openExternal(FEEDBACK_URL);
					},
				},
				{
					label: "Discord",
					click: () => {
						void shell.openExternal(DISCORD_URL);
					},
				},
				{ type: "separator" },
				{
					label: "Keyboard Shortcuts",
					click: dispatchRendererEvent(OPEN_KEYBOARD_SHORTCUTS_EVENT),
				},
				{
					label: "Quick Start",
					click: dispatchRendererEvent(OPEN_QUICK_START_EVENT),
				},
			],
		},
	];
	Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
