/**
 * Step 4: Video Cutting
 *
 * Uses FFmpeg to extract video segments by timestamp.
 * Runs with stream copy for speed, parallel with concurrency limit.
 *
 * Ported from AutoClip step6_video.py / video_processor.py
 *
 * @module electron/native-pipeline/autoclip/steps/step-cut
 */

import { execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";
import { srtTimeToFfmpeg, timeToSeconds } from "../srt-parser.js";
import type { ScoredSegment } from "./step-scoring.js";
import type { ProgressFn } from "../../cli/cli-runner/types.js";

const execFileAsync = promisify(execFile);

export interface CutResult {
	segmentId: string;
	title: string;
	outputPath: string;
	success: boolean;
	error?: string;
}

interface CutOptions {
	onProgress?: ProgressFn;
	concurrency?: number;
}

const MAX_FILENAME_LENGTH = 100;
const DEFAULT_CONCURRENCY = 3;

/**
 * Sanitize a string for use as a filename.
 * Removes illegal characters and limits length.
 */
export function sanitizeFilename(name: string): string {
	let safe = name.replace(/[<>:"|?*\\/]/g, "_").trim();
	// Remove leading/trailing dots and spaces
	safe = safe.replace(/^[.\s]+|[.\s]+$/g, "");
	if (safe.length > MAX_FILENAME_LENGTH) {
		safe = safe.substring(0, MAX_FILENAME_LENGTH);
	}
	return safe || "untitled";
}

/** Resolve FFmpeg binary path. */
async function resolveFFmpegPath(): Promise<string> {
	try {
		const { getFFmpegPath } = await import("../../../ffmpeg/paths.js");
		return getFFmpegPath();
	} catch {
		// Try staged binary (CLI mode where Electron imports fail)
		// __dirname = electron/native-pipeline/autoclip/steps/
		const staged = path.join(
			__dirname, "..", "..", "..", "resources", "ffmpeg",
			`${process.platform}-${process.arch}`,
			process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
		);
		if (fs.existsSync(staged)) return staged;
		return "ffmpeg";
	}
}

/**
 * Extract a single video segment using FFmpeg.
 *
 * Uses input seeking (-ss before -i) with stream copy for speed.
 * Falls back to re-encode on failure.
 */
async function extractOneClip(
	ffmpegPath: string,
	inputVideo: string,
	outputPath: string,
	startTime: string,
	endTime: string
): Promise<{ success: boolean; error?: string }> {
	const ffmpegStart = srtTimeToFfmpeg(startTime);
	const duration = timeToSeconds(endTime) - timeToSeconds(startTime);

	if (duration <= 0) {
		return { success: false, error: `Invalid duration: ${duration}s` };
	}

	const dir = path.dirname(outputPath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}

	// Try stream copy first (fast)
	try {
		await execFileAsync(ffmpegPath, [
			"-ss",
			ffmpegStart,
			"-i",
			inputVideo,
			"-t",
			String(duration),
			"-c:v",
			"copy",
			"-c:a",
			"copy",
			"-avoid_negative_ts",
			"make_zero",
			"-y",
			outputPath,
		]);
		return { success: true };
	} catch {
		// Fall back to re-encode if copy fails (keyframe issues)
		try {
			await execFileAsync(ffmpegPath, [
				"-ss",
				ffmpegStart,
				"-i",
				inputVideo,
				"-t",
				String(duration),
				"-c:v",
				"libx264",
				"-preset",
				"fast",
				"-crf",
				"23",
				"-c:a",
				"aac",
				"-b:a",
				"128k",
				"-avoid_negative_ts",
				"make_zero",
				"-y",
				outputPath,
			]);
			return { success: true };
		} catch (err) {
			return {
				success: false,
				error: err instanceof Error ? err.message : String(err),
			};
		}
	}
}

/**
 * Run async tasks with a concurrency limit.
 */
async function runWithConcurrency<T>(
	tasks: (() => Promise<T>)[],
	concurrency: number
): Promise<T[]> {
	const results: T[] = [];
	let index = 0;

	async function runNext(): Promise<void> {
		while (index < tasks.length) {
			const i = index++;
			results[i] = await tasks[i]();
		}
	}

	const workers = Array.from(
		{ length: Math.min(concurrency, tasks.length) },
		() => runNext()
	);
	await Promise.all(workers);
	return results;
}

/**
 * Cut video into segments based on scored timeline data.
 *
 * Creates output files named: `{id}_{sanitized_title}.mp4`
 */
export async function cutSegments(
	segments: ScoredSegment[],
	inputVideo: string,
	outputDir: string,
	options: CutOptions = {}
): Promise<CutResult[]> {
	const { onProgress, concurrency = DEFAULT_CONCURRENCY } = options;

	if (segments.length === 0) return [];

	const ffmpegPath = await resolveFFmpegPath();
	const clipsDir = path.join(outputDir, "clips");
	if (!fs.existsSync(clipsDir)) {
		fs.mkdirSync(clipsDir, { recursive: true });
	}

	let completed = 0;
	const tasks = segments.map((seg) => async (): Promise<CutResult> => {
		const safeTitle = sanitizeFilename(seg.outline);
		const filename = `${seg.id}_${safeTitle}.mp4`;
		const outputPath = path.join(clipsDir, filename);

		const result = await extractOneClip(
			ffmpegPath,
			inputVideo,
			outputPath,
			seg.startTime,
			seg.endTime
		);

		completed++;
		onProgress?.({
			stage: "cutting",
			percent: Math.round((completed / segments.length) * 100),
			message: `Cut ${completed}/${segments.length}: ${seg.outline.substring(0, 40)}`,
		});

		return {
			segmentId: seg.id,
			title: seg.outline,
			outputPath,
			success: result.success,
			error: result.error,
		};
	});

	return runWithConcurrency(tasks, concurrency);
}
