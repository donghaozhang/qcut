import { execFile } from "child_process";
import { promises as fs } from "fs";
import * as path from "path";
import { promisify } from "util";
import { getFFmpegPath } from "../../ffmpeg/utils.js";

const execFileAsync = promisify(execFile);

export interface ExportFrameVerification {
	timestamp: number;
	framePath: string;
	bytes: number;
	yMin: number | null;
	yMax: number | null;
	yAverage: number | null;
	visuallyUniform: boolean | null;
}

function parseSignalStat(output: string, key: string): number | null {
	const match = output.match(
		new RegExp(`lavfi\\.signalstats\\.${key}=([0-9.]+)`)
	);
	if (!match) return null;
	const value = Number(match[1]);
	return Number.isFinite(value) ? value : null;
}

/**
 * Extract representative PNGs and basic luminance statistics from an export.
 * Extraction failures are fatal so a CLI success cannot hide an unreadable file.
 */
export async function verifyExportFrames(
	outputPath: string,
	timestamps: number[]
): Promise<{
	verificationDir: string;
	frames: ExportFrameVerification[];
}> {
	const normalized = [...new Set(timestamps)]
		.filter((value) => Number.isFinite(value) && value >= 0)
		.sort((a, b) => a - b);
	if (normalized.length === 0) {
		throw new Error("--verify-frames requires non-negative timestamps");
	}

	await fs.access(outputPath);
	const parsed = path.parse(outputPath);
	const verificationDir = path.join(parsed.dir, `${parsed.name}-verification`);
	await fs.mkdir(verificationDir, { recursive: true });

	const ffmpegPath = getFFmpegPath();
	const frames: ExportFrameVerification[] = [];
	for (let index = 0; index < normalized.length; index += 1) {
		const timestamp = normalized[index];
		const framePath = path.join(
			verificationDir,
			`frame-${String(index + 1).padStart(2, "0")}-${timestamp.toFixed(3)}s.png`
		);
		await execFileAsync(
			ffmpegPath,
			[
				"-hide_banner",
				"-loglevel",
				"error",
				"-ss",
				String(timestamp),
				"-i",
				outputPath,
				"-frames:v",
				"1",
				"-y",
				framePath,
			],
			{ maxBuffer: 8 * 1024 * 1024 }
		);

		const stats = await fs.stat(framePath);
		if (stats.size === 0) {
			throw new Error(
				`Export verification produced an empty frame at ${timestamp}s`
			);
		}

		const analysis = await execFileAsync(
			ffmpegPath,
			[
				"-hide_banner",
				"-loglevel",
				"info",
				"-i",
				framePath,
				"-vf",
				"signalstats,metadata=print",
				"-frames:v",
				"1",
				"-f",
				"null",
				"-",
			],
			{ maxBuffer: 8 * 1024 * 1024 }
		);
		const diagnosticOutput = `${analysis.stdout}\n${analysis.stderr}`;
		const yMin = parseSignalStat(diagnosticOutput, "YMIN");
		const yMax = parseSignalStat(diagnosticOutput, "YMAX");
		const yAverage = parseSignalStat(diagnosticOutput, "YAVG");
		frames.push({
			timestamp,
			framePath,
			bytes: stats.size,
			yMin,
			yMax,
			yAverage,
			visuallyUniform:
				yMin == null || yMax == null ? null : Math.abs(yMax - yMin) <= 1,
		});
	}

	return { verificationDir, frames };
}
