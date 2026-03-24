/**
 * Replicate Assembler — concatenates generated shots into a final video.
 *
 * Uses FFmpeg concat demuxer to join shot media files in order,
 * matching the original video's rhythm and transitions.
 *
 * @module electron/native-pipeline/replicate/replicate-assembler
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { VideoRecipe, GeneratedShot } from "./replicate-types.js";

const execFileAsync = promisify(execFile);

export interface AssemblerOptions {
	outputDir: string;
	outputFilename?: string;
	fps?: number;
	resolution?: { width: number; height: number };
}

export interface AssemblerResult {
	success: boolean;
	outputPath?: string;
	error?: string;
	shotCount: number;
	skippedCount: number;
}

/**
 * Build a concat list from successfully generated shots
 * and assemble them into a single output video with FFmpeg.
 */
export async function assembleVideo(
	recipe: VideoRecipe,
	shots: GeneratedShot[],
	options: AssemblerOptions
): Promise<AssemblerResult> {
	// Filter to shots with actual output files
	const validShots = shots.filter(
		(s) => s.outputPath && fs.existsSync(s.outputPath)
	);
	const skippedCount = shots.length - validShots.length;

	if (validShots.length === 0) {
		return {
			success: false,
			error: "No generated shots available for assembly",
			shotCount: 0,
			skippedCount: shots.length,
		};
	}

	fs.mkdirSync(options.outputDir, { recursive: true });

	const outputFilename =
		options.outputFilename ||
		`replicate-${path.basename(recipe.source.filename, path.extname(recipe.source.filename))}.mp4`;
	const outputPath = path.join(options.outputDir, outputFilename);

	// Write FFmpeg concat file
	const concatPath = path.join(options.outputDir, "concat-list.txt");
	const concatContent = buildConcatFile(validShots);
	fs.writeFileSync(concatPath, concatContent, "utf-8");

	const ffmpegPath = await resolveFFmpegPath();
	const fps = options.fps || recipe.source.fps || 30;
	const res = options.resolution || recipe.source.resolution;

	try {
		await execFileAsync(ffmpegPath, [
			"-y",
			"-f",
			"concat",
			"-safe",
			"0",
			"-i",
			concatPath,
			"-vf",
			`scale=${res.width}:${res.height}:force_original_aspect_ratio=decrease,pad=${res.width}:${res.height}:(ow-iw)/2:(oh-ih)/2`,
			"-r",
			String(fps),
			"-c:v",
			"libx264",
			"-preset",
			"medium",
			"-crf",
			"23",
			"-c:a",
			"aac",
			"-b:a",
			"128k",
			"-movflags",
			"+faststart",
			outputPath,
		]);

		// Clean up concat list
		fs.unlinkSync(concatPath);

		return {
			success: true,
			outputPath,
			shotCount: validShots.length,
			skippedCount,
		};
	} catch (err) {
		return {
			success: false,
			error: `FFmpeg assembly failed: ${err instanceof Error ? err.message : String(err)}`,
			shotCount: validShots.length,
			skippedCount,
		};
	}
}

/**
 * Build the content for an FFmpeg concat demuxer file.
 * Each line specifies a file path and optional duration.
 */
export function buildConcatFile(shots: GeneratedShot[]): string {
	const lines: string[] = [];
	for (const shot of shots) {
		if (!shot.outputPath) continue;
		// FFmpeg concat requires forward slashes and single-quote escaping
		const safePath = shot.outputPath.replace(/\\/g, "/").replace(/'/g, "'\\''");
		lines.push(`file '${safePath}'`);
		if (shot.duration > 0) {
			lines.push(`duration ${shot.duration.toFixed(3)}`);
		}
	}
	return lines.join("\n") + "\n";
}

async function resolveFFmpegPath(): Promise<string> {
	try {
		const { getFFmpegPath } = await import("../../ffmpeg/paths.js");
		return getFFmpegPath();
	} catch {
		// Fallback: system ffmpeg
		return process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
	}
}
