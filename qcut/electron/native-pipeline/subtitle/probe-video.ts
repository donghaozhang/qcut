/**
 * CLI-safe video probing via ffprobe.
 *
 * Standalone Node.js utility (no Electron dependencies).
 * Used by subtitle-export to get video resolution for ASS PlayRes.
 *
 * @module electron/native-pipeline/subtitle/probe-video
 */

import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface VideoInfo {
	width: number;
	height: number;
	duration: number;
}

/** Resolve ffprobe binary path. */
async function resolveFFprobePath(): Promise<string> {
	try {
		const { getFFprobePath } = await import("../../ffmpeg/paths.js");
		return getFFprobePath();
	} catch {
		return "ffprobe";
	}
}

/** Probe a video file for resolution and duration. */
export async function probeVideoInfo(videoPath: string): Promise<VideoInfo> {
	const ffprobe = await resolveFFprobePath();
	const { stdout } = await execFileAsync(ffprobe, [
		"-v", "quiet",
		"-print_format", "json",
		"-show_streams",
		"-show_format",
		videoPath,
	]);

	const data = JSON.parse(stdout);
	const videoStream = data.streams?.find(
		(s: { codec_type: string }) => s.codec_type === "video",
	);

	if (!videoStream) {
		throw new Error(`No video stream found in ${videoPath}`);
	}

	const width = parseInt(videoStream.width, 10) || 1920;
	const height = parseInt(videoStream.height, 10) || 1080;
	const duration = parseFloat(data.format?.duration || videoStream.duration || "0");

	return { width, height, duration };
}
