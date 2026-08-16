/**
 * Application menu with a real Help section (Help Center, Feedback,
 * Keyboard Shortcuts, Quick Start). Standard roles keep every default
 * accelerator (copy/paste/undo/fullscreen) intact.
 */

import { app, BrowserWindow, Menu, shell } from "electron";

const HELP_CENTER_URL =
	"https://github.com/Quriosity-agent/qcut/tree/master/docs";
const FEEDBACK_URL = "https://github.com/Quriosity-agent/qcut/issues/new";
const DISCORD_URL = "https://discord.gg/zmR9N35cjK";

/** Events the renderer listens for on `window` (see apps/web components). */
const OPEN_QUICK_START_EVENT = "qcut:open-quick-start";
const OPEN_KEYBOARD_SHORTCUTS_EVENT = "qcut:open-keyboard-shortcuts";
const OPEN_GLOBAL_SETTINGS_EVENT = "qcut:open-global-settings";

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
	const settingsItem: Electron.MenuItemConstructorOptions = {
		label: "Global Settings…",
		accelerator: "CmdOrCtrl+,",
		click: dispatchRendererEvent(OPEN_GLOBAL_SETTINGS_EVENT),
	};
	const template: Electron.MenuItemConstructorOptions[] = [
		...(isMac
			? [
					{
						label: app.name,
						submenu: [
							{ role: "about" as const },
							{ type: "separator" as const },
							settingsItem,
							{ type: "separator" as const },
							{ role: "services" as const },
							{ type: "separator" as const },
							{ role: "hide" as const },
							{ role: "hideOthers" as const },
							{ role: "unhide" as const },
							{ type: "separator" as const },
							{ role: "quit" as const },
						],
					},
				]
			: []),
		{
			role: "fileMenu" as const,
			...(isMac
				? {}
				: {
						submenu: [
							settingsItem,
							{ type: "separator" as const },
							{ role: "close" as const },
						],
					}),
		},
		{ role: "editMenu" },
		{
			// The stock viewMenu role claims ⌘+ / ⌘- / ⌘0 for page zoom and ⌘R
			// for reload, and a menu accelerator wins before the renderer ever
			// sees the key. That silently swallowed the timeline zoom and rotate
			// shortcuts, so the zoom roles are dropped and the reload items keep
			// no accelerator at all.
			label: "View",
			submenu: [
				// Reload keeps its menu item but loses its accelerator: ⌘R is a
				// timeline binding, and ⇧⌘R is already the screen-recording
				// shortcut.
				{
					label: "Reload",
					click: () => {
						BrowserWindow.getFocusedWindow()?.webContents.reload();
					},
				},
				{
					label: "Force Reload",
					click: () => {
						BrowserWindow.getFocusedWindow()?.webContents.reloadIgnoringCache();
					},
				},
				{ role: "toggleDevTools" as const },
				{ type: "separator" as const },
				{ role: "togglefullscreen" as const },
			],
		},
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
