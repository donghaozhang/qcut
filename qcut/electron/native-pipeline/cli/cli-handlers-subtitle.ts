/**
 * CLI handlers for subtitle commands: subtitle-style and subtitle-export.
 *
 * @module electron/native-pipeline/cli/cli-handlers-subtitle
 */

import * as fs from "fs";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import type { CaptionElement } from "@qcut/editor-core";
import {
	generateASS,
	parseASS,
	assTimeToSeconds,
	assStyleToSubtitleStyle,
	resolveSubtitleStyle,
} from "@qcut/editor-core";
import {
	parseSrtContent,
	parseVttContent,
	type SrtEntry,
} from "../autoclip/srt-parser.js";
import { resolveStyleFromCLI } from "../subtitle/style-presets.js";
import { probeVideoInfo } from "../subtitle/probe-video.js";
import type { CLIRunOptions, CLIResult, ProgressFn } from "./cli-runner/types.js";

const execFileAsync = promisify(execFile);

/**
 * Parse a subtitle file (SRT/VTT/ASS) into CaptionElements.
 * Returns { clips, detectedResolution? } where detectedResolution
 * comes from ASS PlayRes if available.
 */
function parseSubtitleInput(filePath: string): {
	clips: CaptionElement[];
	resolution?: { width: number; height: number };
} {
	const content = fs.readFileSync(filePath, "utf-8");
	const ext = path.extname(filePath).toLowerCase();

	if (ext === ".ass" || ext === ".ssa") {
		const doc = parseASS(content);
		const styleMap = new Map<string, ReturnType<typeof assStyleToSubtitleStyle>>();
		for (const s of doc.styles) {
			styleMap.set(s.Name, assStyleToSubtitleStyle(s));
		}

		const clips: CaptionElement[] = doc.events.map((evt, i) => {
			const style = styleMap.get(evt.Style) ?? resolveSubtitleStyle();
			const startTime = assTimeToSeconds(evt.Start);
			const endTime = assTimeToSeconds(evt.End);
			return {
				id: `cap-${i}`,
				name: `Caption ${i + 1}`,
				type: "captions" as const,
				text: evt.Text,
				language: "en",
				source: "imported" as const,
				startTime,
				duration: endTime - startTime,
				trimStart: 0,
				trimEnd: 0,
				style,
			};
		});

		const resolution = doc.scriptInfo.PlayResX && doc.scriptInfo.PlayResY
			? {
				width: parseInt(doc.scriptInfo.PlayResX, 10),
				height: parseInt(doc.scriptInfo.PlayResY, 10),
			}
			: undefined;

		return { clips, resolution };
	}

	// SRT or VTT
	const entries: SrtEntry[] = ext === ".vtt"
		? parseVttContent(content)
		: parseSrtContent(content);

	const clips: CaptionElement[] = entries.map((entry, i) => ({
		id: `cap-${i}`,
		name: `Caption ${i + 1}`,
		type: "captions" as const,
		text: entry.text,
		language: "en",
		source: "imported" as const,
		startTime: entry.startSeconds,
		duration: entry.endSeconds - entry.startSeconds,
		trimStart: 0,
		trimEnd: 0,
	}));

	return { clips };
}

/**
 * Handle `subtitle-style` command.
 * Takes SRT/VTT/ASS input, applies style, outputs styled ASS file.
 */
export async function handleSubtitleStyle(
	options: CLIRunOptions,
	onProgress: ProgressFn,
): Promise<CLIResult> {
	const inputPath = options.input;
	if (!inputPath) {
		return { success: false, error: "Missing --input (-i): subtitle file path" };
	}

	if (!fs.existsSync(inputPath)) {
		return { success: false, error: `Input file not found: ${inputPath}` };
	}

	onProgress({ stage: "parse", percent: 10, message: "Parsing subtitles..." });

	const { clips, resolution: detectedRes } = parseSubtitleInput(inputPath);
	if (clips.length === 0) {
		return { success: false, error: "No subtitle entries found in input file" };
	}

	onProgress({ stage: "style", percent: 40, message: "Applying style..." });

	const style = resolveStyleFromCLI(options.preset, options.style);

	// Apply style to all clips
	const styledClips = clips.map((clip) => ({
		...clip,
		style,
	}));

	// Resolution: use detected from ASS, or default 1920x1080
	const resolution = detectedRes ?? { width: 1920, height: 1080 };

	onProgress({ stage: "generate", percent: 70, message: "Generating ASS..." });

	const assContent = generateASS(styledClips, { resolution });

	// Determine output path
	const outputPath = options.output
		?? path.join(
			options.outputDir,
			`${path.basename(inputPath, path.extname(inputPath))}_styled.ass`,
		);

	fs.mkdirSync(path.dirname(outputPath), { recursive: true });
	fs.writeFileSync(outputPath, assContent, "utf-8");

	onProgress({ stage: "done", percent: 100, message: "Done" });

	if (options.json) {
		return {
			success: true,
			outputPath,
			data: {
				captionCount: styledClips.length,
				preset: options.preset ?? "default",
				resolution,
				style,
			},
		};
	}

	return { success: true, outputPath };
}

/**
 * Handle `subtitle-export` command.
 * Full pipeline: video + subtitles → styled video with burned-in captions.
 */
export async function handleSubtitleExport(
	options: CLIRunOptions,
	onProgress: ProgressFn,
	signal: AbortSignal,
): Promise<CLIResult> {
	const videoPath = options.input;
	if (!videoPath) {
		return { success: false, error: "Missing --input (-i): video file path" };
	}

	if (!fs.existsSync(videoPath)) {
		return { success: false, error: `Video file not found: ${videoPath}` };
	}

	// Step 1: Get subtitle source
	let srtPath = options.srtFile;
	if (!srtPath) {
		// Try to find subtitle file next to video
		const baseName = path.basename(videoPath, path.extname(videoPath));
		const dir = path.dirname(videoPath);
		for (const ext of [".srt", ".vtt", ".ass"]) {
			const candidate = path.join(dir, baseName + ext);
			if (fs.existsSync(candidate)) {
				srtPath = candidate;
				break;
			}
		}
	}

	if (!srtPath) {
		return {
			success: false,
			error: "No subtitle file found. Use --srt-file to specify one, or place a .srt/.vtt/.ass file next to the video.",
		};
	}

	if (!fs.existsSync(srtPath)) {
		return { success: false, error: `Subtitle file not found: ${srtPath}` };
	}

	onProgress({ stage: "parse", percent: 5, message: "Parsing subtitles..." });

	const { clips } = parseSubtitleInput(srtPath);
	if (clips.length === 0) {
		return { success: false, error: "No subtitle entries found in input file" };
	}

	// Step 2: Probe video for resolution
	onProgress({ stage: "probe", percent: 15, message: "Probing video..." });

	let resolution: { width: number; height: number };
	if (options.resolution) {
		const [w, h] = options.resolution.split("x").map(Number);
		resolution = { width: w || 1920, height: h || 1080 };
	} else {
		try {
			const info = await probeVideoInfo(videoPath);
			resolution = { width: info.width, height: info.height };
		} catch {
			resolution = { width: 1920, height: 1080 };
			if (!options.quiet) {
				console.error("[subtitle-export] Could not probe video, using 1920x1080 default");
			}
		}
	}

	// Step 3: Apply style
	onProgress({ stage: "style", percent: 30, message: "Applying style..." });

	const style = resolveStyleFromCLI(options.preset, options.style);
	const styledClips = clips.map((clip) => ({ ...clip, style }));

	// Step 4: Generate temp ASS file
	onProgress({ stage: "ass", percent: 45, message: "Generating ASS..." });

	const assContent = generateASS(styledClips, { resolution });
	const tmpAssPath = path.join(
		path.dirname(videoPath),
		`.tmp_subtitle_${Date.now()}.ass`,
	);
	fs.writeFileSync(tmpAssPath, assContent, "utf-8");

	// Step 5: Burn subtitles with FFmpeg
	onProgress({ stage: "ffmpeg", percent: 55, message: "Burning subtitles..." });

	const outputPath = options.output
		?? path.join(
			options.outputDir,
			`${path.basename(videoPath, path.extname(videoPath))}_subtitled.mp4`,
		);
	fs.mkdirSync(path.dirname(outputPath), { recursive: true });

	try {
		const ffmpegPath = await resolveFFmpegPath();

		// Escape the ASS path for FFmpeg filter (colons and backslashes)
		const escapedAssPath = tmpAssPath
			.replace(/\\/g, "\\\\\\\\")
			.replace(/:/g, "\\:");

		const args = [
			"-i", videoPath,
			"-vf", `ass='${escapedAssPath}'`,
			"-c:a", "copy",
			"-y",
			outputPath,
		];

		if (signal.aborted) {
			fs.unlinkSync(tmpAssPath);
			return { success: false, error: "Cancelled" };
		}

		await execFileAsync(ffmpegPath, args, { timeout: 600_000 });

		onProgress({ stage: "done", percent: 100, message: "Done" });

		return {
			success: true,
			outputPath,
			data: {
				captionCount: styledClips.length,
				preset: options.preset ?? "default",
				resolution,
			},
		};
	} catch (err) {
		// Try fallback: subtitles filter instead of ass filter
		try {
			const ffmpegPath = await resolveFFmpegPath();
			const args = [
				"-i", videoPath,
				"-vf", `subtitles='${tmpAssPath.replace(/\\/g, "\\\\\\\\").replace(/:/g, "\\:")}'`,
				"-c:a", "copy",
				"-y",
				outputPath,
			];
			await execFileAsync(ffmpegPath, args, { timeout: 600_000 });

			onProgress({ stage: "done", percent: 100, message: "Done (subtitles filter)" });

			return {
				success: true,
				outputPath,
				data: {
					captionCount: styledClips.length,
					preset: options.preset ?? "default",
					resolution,
					filterUsed: "subtitles",
				},
			};
		} catch (fallbackErr) {
			const msg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
			return {
				success: false,
				error: `FFmpeg subtitle burn failed: ${msg}. Ensure FFmpeg is built with libass support.`,
			};
		}
	} finally {
		// Cleanup temp ASS file
		try {
			if (fs.existsSync(tmpAssPath)) fs.unlinkSync(tmpAssPath);
		} catch {
			// ignore cleanup errors
		}
	}
}

/** Resolve FFmpeg binary path. */
async function resolveFFmpegPath(): Promise<string> {
	try {
		const { getFFmpegPath } = await import("../../ffmpeg/paths.js");
		return getFFmpegPath();
	} catch {
		return "ffmpeg";
	}
}
