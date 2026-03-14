/**
 * CLI handlers for subtitle commands: subtitle-style and subtitle-export.
 *
 * @module electron/native-pipeline/cli/cli-handlers-subtitle
 */

import * as fs from "fs";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import type {
	CaptionElement,
	SubtitleStyle,
} from "../subtitle/subtitle-types.js";
import {
	generateASS,
	parseASS,
	assTimeToSeconds,
	assStyleToSubtitleStyle,
	resolveSubtitleStyle,
} from "../subtitle/subtitle-types.js";
import {
	parseSrtContent,
	parseVttContent,
	type SrtEntry,
} from "../autoclip/srt-parser.js";
import { resolveStyleFromCLI } from "../subtitle/style-presets.js";
import { probeVideoInfo } from "../subtitle/probe-video.js";
import type {
	CLIRunOptions,
	CLIResult,
	ProgressFn,
} from "./cli-runner/types.js";

const execFileAsync = promisify(execFile);

/**
 * Parse a subtitle file (SRT/VTT/ASS) into CaptionElements.
 */
function parseSubtitleInput(filePath: string): {
	clips: CaptionElement[];
	resolution?: { width: number; height: number };
} {
	const content = fs.readFileSync(filePath, "utf-8");
	const ext = path.extname(filePath).toLowerCase();

	if (ext === ".ass" || ext === ".ssa") {
		const doc = parseASS(content);
		const styleMap = new Map<string, SubtitleStyle>();
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

		const resolution =
			doc.scriptInfo.PlayResX && doc.scriptInfo.PlayResY
				? {
						width: parseInt(doc.scriptInfo.PlayResX, 10),
						height: parseInt(doc.scriptInfo.PlayResY, 10),
					}
				: undefined;

		return { clips, resolution };
	}

	// SRT or VTT
	const entries: SrtEntry[] =
		ext === ".vtt" ? parseVttContent(content) : parseSrtContent(content);

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
	onProgress: ProgressFn
): Promise<CLIResult> {
	const inputPath = options.input;
	if (!inputPath) {
		return {
			success: false,
			error: "Missing --input (-i): subtitle file path",
		};
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
	const styledClips = clips.map((clip) => ({ ...clip, style }));

	const resolution = detectedRes ?? { width: 1920, height: 1080 };

	onProgress({ stage: "generate", percent: 70, message: "Generating ASS..." });

	const assContent = generateASS(styledClips, { resolution });

	const outputPath =
		options.output ??
		path.join(
			options.outputDir,
			`${path.basename(inputPath, path.extname(inputPath))}_styled.ass`
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
	signal: AbortSignal
): Promise<CLIResult> {
	const videoPath = options.input;
	if (!videoPath) {
		return { success: false, error: "Missing --input (-i): video file path" };
	}

	if (!fs.existsSync(videoPath)) {
		return { success: false, error: `Video file not found: ${videoPath}` };
	}

	// Step 1: Find subtitle file
	let srtPath = options.srtFile;
	if (!srtPath) {
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
			error:
				"No subtitle file found. Use --srt-file to specify one, or place a .srt/.vtt/.ass file next to the video.",
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

	// Step 2: Probe video resolution
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
				console.error(
					"[subtitle-export] Could not probe video, using 1920x1080 default"
				);
			}
		}
	}

	// Step 3: Apply style
	onProgress({ stage: "style", percent: 30, message: "Applying style..." });

	const style = resolveStyleFromCLI(options.preset, options.style);
	const styledClips = clips.map((clip) => ({ ...clip, style }));

	// Step 4: Build drawtext filter chain (works with any FFmpeg)
	onProgress({ stage: "filter", percent: 45, message: "Building filters..." });

	const drawtextFilters = buildDrawtextFilters(styledClips, style);

	// Step 5: Burn subtitles with FFmpeg
	onProgress({ stage: "ffmpeg", percent: 55, message: "Burning subtitles..." });

	const outputPath =
		options.output ??
		path.join(
			options.outputDir,
			`${path.basename(videoPath, path.extname(videoPath))}_subtitled.mp4`
		);
	fs.mkdirSync(path.dirname(outputPath), { recursive: true });

	if (signal.aborted) {
		return { success: false, error: "Cancelled" };
	}

	const ffmpegPath = await resolveFFmpegPath();

	// Strategy 1: Try drawtext burn-in (requires libfreetype)
	try {
		await execFileAsync(
			ffmpegPath,
			[
				"-i",
				videoPath,
				"-vf",
				drawtextFilters,
				"-c:a",
				"copy",
				"-y",
				outputPath,
			],
			{ timeout: 600_000 }
		);

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
	} catch {
		if (!options.quiet) {
			console.error(
				"[subtitle-export] drawtext filter unavailable, trying ASS filter..."
			);
		}
	}

	// Strategy 2: Try ASS filter (requires libass)
	const tmpAssPath = path.join(
		path.dirname(videoPath),
		`.tmp_subtitle_${Date.now()}.ass`
	);
	try {
		const assContent = generateASS(styledClips, { resolution });
		fs.writeFileSync(tmpAssPath, assContent, "utf-8");

		// For execFile, the filter value must NOT have shell quotes
		const escapedAssPath = tmpAssPath.replace(/\\/g, "/").replace(/:/g, "\\:");
		await execFileAsync(
			ffmpegPath,
			[
				"-i",
				videoPath,
				"-vf",
				`ass=${escapedAssPath}`,
				"-c:a",
				"copy",
				"-y",
				outputPath,
			],
			{ timeout: 600_000 }
		);

		onProgress({ stage: "done", percent: 100, message: "Done (ASS filter)" });
		return {
			success: true,
			outputPath,
			data: {
				captionCount: styledClips.length,
				preset: options.preset ?? "default",
				resolution,
				filterUsed: "ass",
			},
		};
	} catch {
		if (!options.quiet) {
			console.error(
				"[subtitle-export] ASS filter unavailable, embedding subtitle stream..."
			);
		}
	} finally {
		try {
			if (fs.existsSync(tmpAssPath)) fs.unlinkSync(tmpAssPath);
		} catch {
			/* ignore */
		}
	}

	// Strategy 3: Embed as subtitle stream (always works, soft subs)
	try {
		// Write a temp SRT (normalized from whatever format we parsed)
		const tmpSrtPath = path.join(
			path.dirname(videoPath),
			`.tmp_subtitle_${Date.now()}.srt`
		);
		const srtContent = styledClips
			.map((clip, i) => {
				const start = formatSrtTime(clip.startTime);
				const end = formatSrtTime(clip.startTime + clip.duration);
				return `${i + 1}\n${start} --> ${end}\n${clip.text}\n`;
			})
			.join("\n");
		fs.writeFileSync(tmpSrtPath, srtContent, "utf-8");

		try {
			await execFileAsync(
				ffmpegPath,
				[
					"-i",
					videoPath,
					"-i",
					tmpSrtPath,
					"-c:v",
					"copy",
					"-c:a",
					"copy",
					"-c:s",
					"mov_text",
					"-map",
					"0",
					"-map",
					"1",
					"-y",
					outputPath,
				],
				{ timeout: 600_000 }
			);

			onProgress({
				stage: "done",
				percent: 100,
				message: "Done (embedded subtitles)",
			});
			return {
				success: true,
				outputPath,
				data: {
					captionCount: styledClips.length,
					preset: options.preset ?? "default",
					resolution,
					filterUsed: "embedded",
					note: "Subtitles embedded as soft subs (not burned in). Install FFmpeg with libfreetype for burn-in support.",
				},
			};
		} finally {
			try {
				if (fs.existsSync(tmpSrtPath)) fs.unlinkSync(tmpSrtPath);
			} catch {
				/* ignore */
			}
		}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return {
			success: false,
			error: `FFmpeg subtitle export failed: ${msg}. Install FFmpeg with libfreetype (brew install ffmpeg-full) for burn-in support.`,
		};
	}
}

/**
 * Build a drawtext filter chain for all caption clips.
 * Uses drawtext which works with any FFmpeg (no libass needed).
 */
function buildDrawtextFilters(
	clips: CaptionElement[],
	style: SubtitleStyle
): string {
	const filters: string[] = [];

	for (const clip of clips) {
		const escapedText = clip.text
			.trim()
			.replace(/\\/g, "\\\\")
			.replace(/'/g, "'\\''")
			.replace(/:/g, "\\:")
			.replace(/%/g, "%%")
			.replace(/\n/g, "\\n");

		const startTime = clip.startTime;
		const endTime = clip.startTime + clip.duration;

		const fontColor = style.fontColor.replace("#", "0x");

		// Position
		const xExpr = "(w-text_w)/2";
		let yExpr: string;
		switch (style.position.align) {
			case "top":
				yExpr = `${style.fontSize}`;
				break;
			case "center":
				yExpr = "(h-text_h)/2";
				break;
			default:
				yExpr = `h-text_h-${style.fontSize}`;
				break;
		}

		const params: string[] = [
			`text='${escapedText}'`,
			`fontsize=${style.fontSize}`,
			`fontcolor=${fontColor}`,
			`font=${style.fontFamily}`,
			`x=${xExpr}`,
			`y=${yExpr}`,
		];

		if (style.outlineWidth > 0) {
			params.push(
				`borderw=${style.outlineWidth}`,
				`bordercolor=${style.outlineColor.replace("#", "0x")}`
			);
		}

		if (style.shadowOffset.x !== 0 || style.shadowOffset.y !== 0) {
			params.push(
				`shadowx=${style.shadowOffset.x}`,
				`shadowy=${style.shadowOffset.y}`,
				`shadowcolor=${style.shadowColor.replace("#", "0x")}`
			);
		}

		if (style.bgOpacity > 0) {
			params.push(
				"box=1",
				`boxcolor=${style.backgroundColor.replace("#", "0x")}@${style.bgOpacity.toFixed(2)}`,
				"boxborderw=8"
			);
		}

		params.push(`enable='between(t\\,${startTime}\\,${endTime})'`);

		filters.push(`drawtext=${params.join(":")}`);
	}

	return filters.join(",");
}

/** Format seconds as SRT time (HH:MM:SS,mmm) */
function formatSrtTime(seconds: number): string {
	let h = Math.floor(seconds / 3600);
	let m = Math.floor((seconds % 3600) / 60);
	let s = Math.floor(seconds % 60);
	let ms = Math.round((seconds % 1) * 1000);
	if (ms >= 1000) {
		ms -= 1000;
		s += 1;
		if (s >= 60) {
			s -= 60;
			m += 1;
			if (m >= 60) {
				m -= 60;
				h += 1;
			}
		}
	}
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
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
