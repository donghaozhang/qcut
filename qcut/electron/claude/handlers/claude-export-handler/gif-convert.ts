/**
 * GIF conversion via FFmpeg two-pass palette method.
 * Produces high-quality GIFs with optimal color palettes.
 * @module electron/claude/handlers/claude-export-handler/gif-convert
 */

import { spawn } from "node:child_process";
import * as path from "node:path";
import * as fsPromises from "node:fs/promises";
import { getFFmpegPath } from "../../../ffmpeg/utils.js";
import { claudeLog } from "../../utils/logger.js";
import { HANDLER_NAME } from "./types.js";

interface GifConvertOptions {
	inputPath: string;
	outputPath: string;
	width: number;
	height: number;
	fps: number;
	loop: boolean;
	tempDir: string;
	onProgress?: (normalizedProgress: number) => void;
}

/**
 * Convert a video file to GIF using FFmpeg's two-pass palette method.
 *
 * Pass 1: Generate optimal palette from the video
 * Pass 2: Encode GIF using the palette with Floyd-Steinberg dithering
 */
export async function convertToGif(options: GifConvertOptions): Promise<void> {
	const {
		inputPath,
		outputPath,
		width,
		height,
		fps,
		loop,
		tempDir,
		onProgress,
	} = options;

	const ffmpegPath = getFFmpegPath();
	const palettePath = path.join(tempDir, "gif-palette.png");
	const scaleFilter = `fps=${fps},scale=${width}:${height}:flags=lanczos`;

	// Pass 1: Generate palette
	claudeLog.info(HANDLER_NAME, "GIF Pass 1: Generating palette...");
	onProgress?.(0);

	await runProcess(ffmpegPath, [
		"-y",
		"-i",
		inputPath,
		"-vf",
		`${scaleFilter},palettegen=stats_mode=diff`,
		palettePath,
	]);

	onProgress?.(0.4);

	// Pass 2: Encode GIF with palette
	claudeLog.info(HANDLER_NAME, "GIF Pass 2: Encoding with palette...");

	// loop: 0 = infinite, -1 = no loop
	const loopFlag = loop ? "0" : "-1";

	await runProcess(ffmpegPath, [
		"-y",
		"-i",
		inputPath,
		"-i",
		palettePath,
		"-filter_complex",
		`${scaleFilter}[v];[v][1:v]paletteuse=dither=floyd_steinberg`,
		"-loop",
		loopFlag,
		outputPath,
	]);

	onProgress?.(1.0);

	// Clean up palette
	try {
		await fsPromises.unlink(palettePath);
	} catch {
		// Ignore cleanup errors
	}

	claudeLog.info(HANDLER_NAME, `GIF conversion complete: ${outputPath}`);
}

function runProcess(command: string, args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const proc = spawn(command, args, {
			windowsHide: true,
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stderr = "";
		proc.stderr?.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});

		proc.on("error", reject);
		proc.on("close", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(
					new Error(
						`FFmpeg GIF conversion failed (code ${code}): ${stderr.slice(-500)}`
					)
				);
			}
		});
	});
}
