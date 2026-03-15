import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { CursorTelemetryData } from "./cursor-telemetry.js";
import { log } from "./logger.js";

/**
 * Derive the cursor telemetry sidecar path from a video path.
 * e.g. "recording.mp4" → "recording.cursor.json"
 */
export function getCursorSidecarPath(videoPath: string): string {
	const dir = path.dirname(videoPath);
	const ext = path.extname(videoPath);
	const base = path.basename(videoPath, ext);
	return path.join(dir, `${base}.cursor.json`);
}

/**
 * Write cursor telemetry data alongside the video file.
 */
export async function writeCursorTelemetry(
	videoPath: string,
	data: CursorTelemetryData
): Promise<void> {
	const sidecarPath = getCursorSidecarPath(videoPath);
	try {
		await fs.writeFile(sidecarPath, JSON.stringify(data), "utf-8");
		console.log(
			`[CursorTelemetry] Wrote ${data.points.length} points to ${sidecarPath}`
		);
	} catch (error) {
		console.error("[CursorTelemetry] Failed to write sidecar:", error);
		throw error;
	}
}

/**
 * Read cursor telemetry data from a sidecar file.
 * Returns null if the sidecar doesn't exist.
 */
export async function readCursorTelemetry(
	videoPath: string
): Promise<CursorTelemetryData | null> {
	const sidecarPath = getCursorSidecarPath(videoPath);
	try {
		const content = await fs.readFile(sidecarPath, "utf-8");
		const data = JSON.parse(content) as CursorTelemetryData;
		if (data.version !== 1 || !Array.isArray(data.points)) {
			console.warn("[CursorTelemetry] Invalid sidecar format:", sidecarPath);
			return null;
		}
		return data;
	} catch (error: unknown) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return null;
		}
		console.error("[CursorTelemetry] Failed to read sidecar:", error);
		return null;
	}
}
