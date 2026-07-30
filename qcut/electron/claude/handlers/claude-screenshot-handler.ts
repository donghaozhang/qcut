/**
 * Screenshot Capture Handler
 *
 * Captures a screenshot of the QCut BrowserWindow using
 * webContents.capturePage() and saves it as PNG.
 *
 * @module electron/claude/handlers/claude-screenshot-handler
 */

import { BrowserWindow, clipboard, desktopCapturer, screen } from "electron";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getRecordingsDir } from "../../screen-recording-handler/path-utils.js";
import { claudeLog } from "../utils/logger.js";

export interface ScreenshotResult {
	filePath: string;
	width: number;
	height: number;
	timestamp: number;
}

/** Format a Date into a compact `YYYYMMDD-HHmmss-SSS` string for filenames. */
function formatTimestamp(date: Date): string {
	const y = date.getFullYear().toString().padStart(4, "0");
	const mo = (date.getMonth() + 1).toString().padStart(2, "0");
	const d = date.getDate().toString().padStart(2, "0");
	const h = date.getHours().toString().padStart(2, "0");
	const mi = date.getMinutes().toString().padStart(2, "0");
	const s = date.getSeconds().toString().padStart(2, "0");
	const ms = date.getMilliseconds().toString().padStart(3, "0");
	return `${y}${mo}${d}-${h}${mi}${s}-${ms}`;
}

/** Build the absolute PNG file path inside the recordings directory. */
function resolveScreenshotPath(fileName?: string): string {
	const dir = getRecordingsDir();
	if (fileName) {
		const safe = fileName.trim().replace(/[/\\?%*:|"<>]/g, "_");
		const name = safe || "screenshot";
		const ext = path.extname(name).toLowerCase();
		return path.join(dir, ext === ".png" ? name : `${name}.png`);
	}
	const ts = formatTimestamp(new Date());
	return path.join(dir, `screenshot-${ts}.png`);
}

/**
 * Capture a screenshot of the given BrowserWindow and save as PNG.
 */
export async function captureScreenshot(
	win: BrowserWindow,
	options?: { fileName?: string }
): Promise<ScreenshotResult> {
	const filePath = resolveScreenshotPath(options?.fileName);

	claudeLog.info("Screenshot", `Capturing to ${filePath}`);

	const image = await win.webContents.capturePage();
	const pngBuffer = image.toPNG();
	const size = image.getSize();

	await fs.mkdir(path.dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, pngBuffer);

	claudeLog.info(
		"Screenshot",
		`Saved ${size.width}x${size.height} (${pngBuffer.length} bytes)`
	);

	return {
		filePath,
		width: size.width,
		height: size.height,
		timestamp: Date.now(),
	};
}

export interface FullScreenClipboardResult {
	width: number;
	height: number;
	timestamp: number;
}

export interface ScreenshotDisplayInfo {
	id: number;
	label: string;
	width: number;
	height: number;
	isPrimary: boolean;
	/** True for the display containing the QCut window. */
	isCurrent: boolean;
}

function currentDisplay(win: BrowserWindow | null) {
	return win
		? screen.getDisplayMatching(win.getBounds())
		: screen.getPrimaryDisplay();
}

/** List attached displays for the screenshot target menu. */
export function listScreenshotDisplays(
	win: BrowserWindow | null
): ScreenshotDisplayInfo[] {
	const current = currentDisplay(win);
	const primaryId = screen.getPrimaryDisplay().id;
	return screen.getAllDisplays().map((display, index) => ({
		id: display.id,
		label: display.label || `Display ${index + 1}`,
		width: display.size.width,
		height: display.size.height,
		isPrimary: display.id === primaryId,
		isCurrent: display.id === current.id,
	}));
}

/**
 * Capture one display at native pixel resolution and copy the image to the
 * system clipboard. Defaults to the display containing the given window,
 * falling back to the primary display when no window is available.
 */
export async function captureFullScreenToClipboard(
	win: BrowserWindow | null,
	options?: { displayId?: number }
): Promise<FullScreenClipboardResult> {
	const display =
		options?.displayId === undefined
			? currentDisplay(win)
			: (screen
					.getAllDisplays()
					.find((entry) => entry.id === options.displayId) ??
				currentDisplay(win));
	const sources = await desktopCapturer.getSources({
		types: ["screen"],
		thumbnailSize: {
			width: Math.round(display.size.width * display.scaleFactor),
			height: Math.round(display.size.height * display.scaleFactor),
		},
		fetchWindowIcons: false,
	});
	const source =
		sources.find((entry) => entry.display_id === String(display.id)) ??
		sources[0];
	if (!source || source.thumbnail.isEmpty()) {
		throw new Error(
			"Screen capture returned no image; check screen recording permission"
		);
	}
	clipboard.writeImage(source.thumbnail);
	const size = source.thumbnail.getSize();
	claudeLog.info(
		"Screenshot",
		`Copied ${size.width}x${size.height} full-screen capture to clipboard`
	);
	return { width: size.width, height: size.height, timestamp: Date.now() };
}
