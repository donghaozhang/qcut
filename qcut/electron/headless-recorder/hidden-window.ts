/**
 * Headless Recorder — hidden BrowserWindow factory.
 *
 * Creates an invisible BrowserWindow that loads the same web app the
 * visible editor uses. The app's existing claude-screen-recording-bridge
 * initialises on boot and receives `claude:screen-recording:start:request`
 * IPC messages just like it would in the visible editor — so the recorder
 * pipeline (MediaRecorder, export compositor, cursor telemetry, etc.) is
 * reused verbatim.
 *
 * The `backgroundThrottling: false` preference is non-negotiable: without
 * it Chromium pauses requestAnimationFrame / MediaRecorder timers on
 * hidden windows and the recording silently stalls.
 *
 * @module electron/headless-recorder/hidden-window
 */

import { BrowserWindow, app } from "electron";
import * as path from "node:path";

export interface HiddenWindowOptions {
	/**
	 * Dev server URL when running under `bun run electron:dev`. Falls back
	 * to the packaged `app://` protocol in production.
	 */
	devServerUrl?: string;
	/** Preload script path. Defaults to the same preload the visible app uses. */
	preloadPath?: string;
}

/** Resolve the web entry URL the same way main.ts does. */
export function resolveWebEntryUrl(opts: HiddenWindowOptions = {}): string {
	if (opts.devServerUrl) return opts.devServerUrl;
	if (process.env.NODE_ENV === "development") {
		return "http://localhost:5173?headlessRecord=1";
	}
	return "app://./index.html?headlessRecord=1";
}

/** Resolve the preload path used by the visible main window. */
export function resolvePreloadPath(opts: HiddenWindowOptions = {}): string {
	if (opts.preloadPath) return opts.preloadPath;
	return path.join(__dirname, "..", "preload.js");
}

export interface CreateHiddenWindowResult {
	window: BrowserWindow;
	readyPromise: Promise<void>;
}

/**
 * Create a hidden BrowserWindow that boots the existing web app.
 *
 * The returned `readyPromise` resolves when `did-finish-load` fires; the
 * caller can await it before issuing HTTP requests that would talk to the
 * renderer (e.g. `/api/claude/screen-recording/start`).
 */
export function createHiddenCaptureWindow(
	opts: HiddenWindowOptions = {}
): CreateHiddenWindowResult {
	const window = new BrowserWindow({
		show: false,
		width: 1280,
		height: 720,
		skipTaskbar: true,
		webPreferences: {
			preload: resolvePreloadPath(opts),
			// Disable throttling so MediaRecorder / rAF keep running while hidden.
			backgroundThrottling: false,
			// offscreen:true pauses rAF too — we want the real compositor.
			offscreen: false,
			contextIsolation: true,
			sandbox: false,
			nodeIntegration: false,
		},
	});

	// macOS: hide dock icon so the user doesn't see a ghost app jumping.
	try {
		app.dock?.hide();
	} catch {
		/* non-macOS — ignore */
	}

	const readyPromise = new Promise<void>((resolve, reject) => {
		const onReady = () => {
			window.webContents.removeListener("did-fail-load", onFail);
			resolve();
		};
		const onFail = (
			_event: Electron.Event,
			errorCode: number,
			errorDescription: string
		) => {
			window.webContents.removeListener("did-finish-load", onReady);
			reject(
				new Error(
					`Hidden window failed to load: ${errorDescription} (${errorCode})`
				)
			);
		};
		window.webContents.once("did-finish-load", onReady);
		window.webContents.once("did-fail-load", onFail);
	});

	const url = resolveWebEntryUrl(opts);
	void window.loadURL(url);

	return { window, readyPromise };
}
