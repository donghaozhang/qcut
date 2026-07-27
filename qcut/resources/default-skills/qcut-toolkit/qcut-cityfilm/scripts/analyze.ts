/**
 * Reference-film analysis for the qcut-cityfilm skill.
 *
 * Before copying a film's structure you need three things from it: how long it
 * is and at what shape, what its shots actually look like, and how fast it
 * cuts. This module produces all three plus a narration-ready audio file.
 *
 * Argument building and output parsing live in `analyze-graph.ts` and are
 * re-exported here; this file only orchestrates the child processes.
 */

import {
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import {
	buildContactSheetArgs,
	buildProbeArgs,
	buildSceneDetectArgs,
	buildTileTimestamps,
	extractAudioArgs,
	parsePacing,
	parseProbeJson,
	type VideoProbe,
} from "./analyze-graph";
import type { PacingProfile } from "./types";

export {
	buildContactSheetArgs,
	buildProbeArgs,
	buildSceneDetectArgs,
	buildTileTimestamps,
	extractAudioArgs,
	parsePacing,
	parseProbeJson,
	tileTimestamp,
} from "./analyze-graph";
export type { VideoProbe } from "./analyze-graph";

/** Frames sampled across the whole film, spread evenly. */
const DEFAULT_FRAMES = 40;
const DEFAULT_COLUMNS = 5;
const DEFAULT_ROWS = 4;
/** `select='gt(scene,N)'` threshold that matched hand-counted cuts. */
const DEFAULT_SCENE_THRESHOLD = 0.4;

export interface CommandOutcome {
	exitCode: number;
	stdout: string;
	stderr: string;
}

/** Injectable process runner; the default shells out through `Bun.spawn`. */
export type CommandRunner = (input: {
	executable: string;
	args: string[];
}) => Promise<CommandOutcome>;

export interface AnalyzeOptions {
	/** Reference film to study. */
	input: string;
	/** Where sheets, scene metadata, audio and analysis.json land. */
	outputDir?: string;
	frames?: number;
	columns?: number;
	rows?: number;
	sceneThreshold?: number;
	ffmpegPath?: string;
	ffprobePath?: string;
	runner?: CommandRunner;
}

export interface ContactSheetSummary {
	frames: number;
	columns: number;
	rows: number;
	/** The `%02d` pattern handed to FFmpeg. */
	pattern: string;
	/** Sheets that actually got written, in order. */
	sheets: string[];
	/** Timestamp of every tile, left-to-right then sheet-by-sheet. */
	tileTimestamps: number[];
}

export interface AnalyzeResult {
	input: string;
	outputDir: string;
	probe: VideoProbe;
	pacing: PacingProfile;
	contactSheet: ContactSheetSummary;
	sceneMetadataPath: string;
	analysisPath: string;
	/** Extracted narration audio; absent when the source has no audio stream. */
	audioPath?: string;
}

const spawnCapture: CommandRunner = async ({ executable, args }) => {
	const child = Bun.spawn([executable, ...args], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	return { exitCode: await child.exited, stdout, stderr };
};

async function runTool({
	executable,
	args,
	runner,
}: {
	executable: string;
	args: string[];
	runner: CommandRunner;
}): Promise<CommandOutcome> {
	const outcome = await runner({ executable, args });
	if (outcome.exitCode !== 0) {
		const detail = outcome.stderr.trim().split("\n").slice(-3).join(" | ");
		throw new Error(
			`${executable} failed (${outcome.exitCode})${detail ? `: ${detail}` : ""}`
		);
	}
	return outcome;
}

/** Read the reference film's duration, frame size, rate and audio presence. */
export async function probeVideo({
	input,
	ffprobePath = "ffprobe",
	runner = spawnCapture,
}: {
	input: string;
	ffprobePath?: string;
	runner?: CommandRunner;
}): Promise<VideoProbe> {
	const outcome = await runTool({
		executable: ffprobePath,
		args: buildProbeArgs({ input }),
		runner,
	});
	return parseProbeJson({ stdout: outcome.stdout });
}

function listSheets({ outputDir }: { outputDir: string }): string[] {
	return readdirSync(outputDir)
		.filter((name) => /^sheet_\d+\.jpg$/.test(name))
		.sort()
		.map((name) => join(outputDir, name));
}

function readSceneMetadata({ filePath }: { filePath: string }): string {
	try {
		return readFileSync(filePath, "utf8");
	} catch (error) {
		// A missing file means no cut crossed the threshold — FFmpeg only
		// creates it on a match. Anything else (permissions, I/O) is a real
		// failure and must not masquerade as "this film has no cuts".
		if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return "";
		throw error;
	}
}

/**
 * Drop artifacts a previous run left behind so they cannot leak into this
 * one's results.
 */
function clearStaleArtifacts({
	outputDir,
	sceneMetadataPath,
}: {
	outputDir: string;
	sceneMetadataPath: string;
}): void {
	for (const sheet of listSheets({ outputDir })) {
		rmSync(sheet, { force: true });
	}
	rmSync(sceneMetadataPath, { force: true });
}

/**
 * Probe, sheet, scene-detect, measure pacing and extract audio in one pass,
 * then write `analysis.json` beside the sheets.
 *
 * Transcription is deliberately out of scope: run the CLI the SKILL.md
 * documents (`qcut analyze transcribe -m scribe_v2 --srt`) against the returned
 * `audioPath`.
 */
export async function runAnalyze(
	options: AnalyzeOptions
): Promise<AnalyzeResult> {
	const input = resolve(options.input);
	const stem = basename(input, extname(input));
	const outputDir = options.outputDir
		? resolve(options.outputDir)
		: join(dirname(input), `${stem}-analysis`);
	const frames = options.frames ?? DEFAULT_FRAMES;
	const columns = options.columns ?? DEFAULT_COLUMNS;
	const rows = options.rows ?? DEFAULT_ROWS;
	const threshold = options.sceneThreshold ?? DEFAULT_SCENE_THRESHOLD;
	const ffmpegPath = options.ffmpegPath ?? "ffmpeg";
	const runner = options.runner ?? spawnCapture;

	mkdirSync(outputDir, { recursive: true });
	const pattern = join(outputDir, "sheet_%02d.jpg");
	const sceneMetadataPath = join(outputDir, "scenes.txt");
	const analysisPath = join(outputDir, "analysis.json");
	const audioPath = join(outputDir, `${stem}-audio.mp3`);

	// Re-analysing the same film with different frames/threshold is the normal
	// tuning loop, and both artifacts survive a rerun that should have replaced
	// them: extra sheet_NN.jpg from a longer previous pass stay on disk, and a
	// pass that finds no cuts never rewrites scenes.txt (metadata=print only
	// fires on a match). Clearing them keeps analysis.json describing this run.
	clearStaleArtifacts({ outputDir, sceneMetadataPath });

	const probe = await probeVideo({
		input,
		ffprobePath: options.ffprobePath,
		runner,
	});

	await runTool({
		executable: ffmpegPath,
		args: buildContactSheetArgs({
			input,
			durationSeconds: probe.durationSeconds,
			frames,
			columns,
			rows,
			outputPattern: pattern,
		}),
		runner,
	});

	await runTool({
		executable: ffmpegPath,
		args: buildSceneDetectArgs({
			input,
			threshold,
			metadataFile: sceneMetadataPath,
		}),
		runner,
	});

	const pacing = parsePacing({
		metadataText: readSceneMetadata({ filePath: sceneMetadataPath }),
		durationSeconds: probe.durationSeconds,
	});

	if (probe.hasAudio) {
		await runTool({
			executable: ffmpegPath,
			args: extractAudioArgs({ input, output: audioPath }),
			runner,
		});
	}

	const result: AnalyzeResult = {
		input,
		outputDir,
		probe,
		pacing,
		contactSheet: {
			frames,
			columns,
			rows,
			pattern,
			sheets: listSheets({ outputDir }),
			tileTimestamps: buildTileTimestamps({
				frames,
				durationSeconds: probe.durationSeconds,
			}),
		},
		sceneMetadataPath,
		analysisPath,
		audioPath: probe.hasAudio ? audioPath : undefined,
	};
	writeFileSync(
		analysisPath,
		`${JSON.stringify({ ...result, generatedAt: new Date().toISOString() }, null, 2)}\n`
	);
	return result;
}
