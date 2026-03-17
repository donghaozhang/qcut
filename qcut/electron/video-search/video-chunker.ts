/**
 * Video chunking for embedding generation.
 * Splits video into fixed-duration segments using FFmpeg.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getFFmpegPath } from "../ffmpeg/utils.js";

export interface VideoChunk {
	index: number;
	path: string;
	startTime: number;
	endTime: number;
	duration: number;
}

export interface ChunkOptions {
	chunkDuration?: number;
}

/**
 * Calculate chunk boundaries for a video of given duration.
 * Exported separately for easy unit testing.
 */
export function calculateChunkBoundaries(
	totalDuration: number,
	chunkDuration: number
): Omit<VideoChunk, "path">[] {
	const chunks: Omit<VideoChunk, "path">[] = [];
	let index = 0;
	let start = 0;

	while (start < totalDuration) {
		const end = Math.min(start + chunkDuration, totalDuration);
		chunks.push({
			index,
			startTime: start,
			endTime: end,
			duration: end - start,
		});
		index++;
		start = end;
	}

	return chunks;
}

/**
 * Split video into fixed-duration chunks using FFmpeg.
 * Caller must call cleanupChunks() when done.
 */
export async function chunkVideo(
	videoPath: string,
	totalDuration: number,
	options?: ChunkOptions,
	signal?: AbortSignal
): Promise<VideoChunk[]> {
	const chunkDuration = options?.chunkDuration ?? 5;
	const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "qcut-chunks-"));
	const boundaries = calculateChunkBoundaries(totalDuration, chunkDuration);
	const ffmpegPath = getFFmpegPath();

	const chunks: VideoChunk[] = [];

	for (const boundary of boundaries) {
		if (signal?.aborted) {
			await cleanupChunks(chunks);
			throw new Error("Chunking cancelled");
		}

		const outputPath = path.join(outputDir, `chunk_${boundary.index}.mp4`);

		await new Promise<void>((resolve, reject) => {
			const args = [
				"-ss",
				String(boundary.startTime),
				"-i",
				videoPath,
				"-t",
				String(boundary.duration),
				"-c:v",
				"libx264",
				"-preset",
				"ultrafast",
				"-crf",
				"28",
				"-c:a",
				"aac",
				"-b:a",
				"64k",
				"-y",
				outputPath,
			];

			const proc = spawn(ffmpegPath, args, { stdio: "pipe" });
			proc.on("close", (code) => {
				if (code === 0) resolve();
				else
					reject(
						new Error(`FFmpeg chunk ${boundary.index} failed with code ${code}`)
					);
			});
			proc.on("error", reject);
		});

		chunks.push({ ...boundary, path: outputPath });
	}

	return chunks;
}

/** Delete all temp chunk files and the temp directory. */
export async function cleanupChunks(chunks: VideoChunk[]): Promise<void> {
	if (chunks.length === 0) return;

	const dir = path.dirname(chunks[0].path);
	try {
		fs.rmSync(dir, { recursive: true, force: true });
	} catch {
		// Best effort cleanup
	}
}
