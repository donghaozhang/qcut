/**
 * Reproducible benchmark for the desktop default export path.
 *
 * The desktop export panel pins the CLI engine (`use-export-settings` selects
 * `"cli"` whenever `isElectron()`), so this harness drives exports through the
 * renderer automation bridge with `engine: "cli"` and asserts from the
 * renderer's own engine-selection log that the CLI engine really ran — a
 * benchmark that silently fell back to another engine would measure nothing.
 *
 * Alongside wall time it records a direct probe of how long the project's
 * video elements take to load, which is what attributes any delta to the
 * engine's eager pre-load rather than to encoding.
 */

import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { ElectronApplication, Page } from "@playwright/test";
import {
	getFFmpegPath,
	getFFprobePath,
} from "../../../../../../electron/ffmpeg/paths";
import {
	type MemorySnapshot,
	peakByType,
	sampleMemory,
} from "./export-lifecycle-memory";
import type { ExposedWindow } from "./sequential-decode-timeline";

const execFileAsync = promisify(execFile);

/** Audio stream facts an export must preserve exactly. */
export async function probeExportedAudio({
	filePath,
}: {
	filePath: string;
}): Promise<{ channels: number; sampleRate: number; codecName: string }> {
	const { stdout } = await execFileAsync(await getFFprobePath(), [
		"-v",
		"error",
		"-select_streams",
		"a:0",
		"-show_entries",
		"stream=codec_name,channels,sample_rate",
		"-of",
		"json",
		filePath,
	]);
	const parsed = JSON.parse(stdout) as {
		streams?: Array<{
			channels?: number;
			codec_name?: string;
			sample_rate?: string;
		}>;
	};
	const stream = parsed.streams?.[0];
	if (!stream) throw new Error(`No audio stream in ${filePath}`);
	return {
		channels: stream.channels ?? 0,
		codecName: stream.codec_name ?? "",
		sampleRate: Number(stream.sample_rate ?? 0),
	};
}

/**
 * Resolves which engine actually ran from the factory's own selection log.
 *
 * The export panel's "user selected engine" line is not the answer: on desktop
 * it commonly reads `auto`, which the factory then resolves to CLI. Only the
 * factory's `EXPORT ENGINE SELECTION:` line names the engine that ran, so a
 * benchmark asserting on the panel value would happily measure another engine.
 */
export function resolveSelectedEngine({
	lines,
}: {
	lines: readonly string[];
}): "cli" | "muxer" | "remotion" | "optimized" | "standard" | null {
	const line = [...lines]
		.reverse()
		.find((candidate) => candidate.includes("EXPORT ENGINE SELECTION:"));
	if (!line) return null;
	if (line.includes("CLI FFmpeg")) return "cli";
	if (line.includes("Remotion")) return "remotion";
	if (line.includes("WebCodecs") || line.includes("Muxer")) return "muxer";
	if (line.includes("Optimized")) return "optimized";
	if (line.includes("Standard")) return "standard";
	return null;
}

export const CLI_BENCHMARK_FPS = 30;
export const CLI_BENCHMARK_WIDTH = 1280;
export const CLI_BENCHMARK_HEIGHT = 720;
export const CLI_BENCHMARK_SECONDS = 6;
export const CLI_BENCHMARK_FRAMES = Math.round(
	CLI_BENCHMARK_SECONDS * CLI_BENCHMARK_FPS
);

export type CliScenarioName =
	| "single-video"
	| "sequential-clips"
	| "image-text-overlay"
	| "video-with-audio"
	/**
	 * One clip on the timeline but a large media library. The engine's eager
	 * pre-load walks every imported video rather than the ones actually used,
	 * so this scenario is what shows whether that cost scales with the library.
	 */
	| "large-library";

/** Still used by the overlay scenario. */
export async function generateCliStill({
	filePath,
	color = "0x20c060",
	size = 384,
}: {
	filePath: string;
	color?: string;
	size?: number;
}): Promise<void> {
	await execFileAsync(getFFmpegPath(), [
		"-y",
		"-f",
		"lavfi",
		"-i",
		`color=c=${color}:s=${size}x${size}`,
		"-frames:v",
		"1",
		filePath,
	]);
}

/** Clip with no audio stream, so the audio scenario is the only one with sound. */
export async function generateSilentClip({
	filePath,
	seconds,
	pattern = "testsrc2",
}: {
	filePath: string;
	seconds: number;
	pattern?: string;
}): Promise<void> {
	await execFileAsync(getFFmpegPath(), [
		"-y",
		"-f",
		"lavfi",
		"-i",
		`${pattern}=size=${CLI_BENCHMARK_WIDTH}x${CLI_BENCHMARK_HEIGHT}:rate=${CLI_BENCHMARK_FPS}:duration=${seconds}`,
		"-c:v",
		"libx264",
		"-pix_fmt",
		"yuv420p",
		"-colorspace",
		"bt709",
		"-color_primaries",
		"bt709",
		"-color_trc",
		"bt709",
		"-an",
		filePath,
	]);
}

export interface CliBenchmarkMeasurement {
	scenario: CliScenarioName;
	wallMs: number;
	/** Direct cost of loading every project video element, measured in-page. */
	videoLoadProbeMs: number;
	loadedVideoCount: number;
	selectedEngine: string | null;
	peakMemoryMbByType: Record<string, number>;
	memorySampleCount: number;
	probe?: {
		frameCount: number;
		durationSeconds: number;
		width: number;
		height: number;
		fps: number;
		hasAudio: boolean;
		audioSampleRate: number | null;
		audioChannels: number | null;
	};
}

export interface CliBenchmarkReport {
	schemaVersion: 1;
	kind: "qcut-cli-export-benchmark-v1";
	label: string;
	recordedAt: string;
	settings: {
		width: number;
		height: number;
		fps: number;
		seconds: number;
	};
	measurements: CliBenchmarkMeasurement[];
}

interface TimelineStoreWithSetState {
	getState: () => { tracks: unknown[] };
	setState: (state: Record<string, unknown>) => void;
}

export async function snapshotTimelineTracks({
	page,
}: {
	page: Page;
}): Promise<string> {
	return page.evaluate(() => {
		const editorWindow = window as unknown as {
			__timelineStore: TimelineStoreWithSetState;
		};
		return JSON.stringify(editorWindow.__timelineStore.getState().tracks);
	});
}

export async function restoreTimelineTracks({
	page,
	snapshot,
}: {
	page: Page;
	snapshot: string;
}): Promise<void> {
	await page.evaluate((serialized) => {
		const editorWindow = window as unknown as {
			__timelineStore: TimelineStoreWithSetState;
		};
		editorWindow.__timelineStore.setState({
			_tracks: JSON.parse(serialized),
			tracks: JSON.parse(serialized) as unknown[],
			selectedElements: [],
		});
	}, snapshot);
}

/**
 * Measures, in the page, how long every project video takes to reach
 * `loadeddata` — the same work the engine's eager pre-load performs.
 *
 * This is a read-only probe: it creates its own elements and discards them, so
 * it never disturbs the engine's own caches.
 */
export async function probeVideoElementLoad({
	page,
}: {
	page: Page;
}): Promise<{ loadMs: number; count: number }> {
	return page.evaluate(async () => {
		const editorWindow = window as unknown as ExposedWindow;
		const items = editorWindow.__mediaStore.getState().mediaItems as Array<{
			type?: string;
			url?: string;
		}>;
		const urls = new Set<string>();
		for (const item of items) {
			if (item.type === "video" && item.url) urls.add(item.url);
		}
		const startedAt = performance.now();
		await Promise.all(
			Array.from(urls).map(
				(url) =>
					new Promise<void>((resolve, reject) => {
						const video = document.createElement("video");
						video.src = url;
						video.crossOrigin = "anonymous";
						video.onloadeddata = () => resolve();
						video.onerror = () => reject(new Error(`load failed: ${url}`));
					})
			)
		);
		return {
			count: urls.size,
			loadMs: Number((performance.now() - startedAt).toFixed(1)),
		};
	});
}

export async function buildCliTimeline({
	page,
	scenario,
	videoAName,
	videoBName,
	audioVideoName,
	imageName,
}: {
	page: Page;
	scenario: CliScenarioName;
	videoAName: string;
	videoBName: string;
	audioVideoName: string;
	imageName: string;
}): Promise<{ projectId: string; duration: number }> {
	return page.evaluate(
		({
			scenario,
			videoAName,
			videoBName,
			audioVideoName,
			imageName,
			seconds,
		}) => {
			const editorWindow = window as unknown as ExposedWindow;
			const projectId =
				editorWindow.__projectStore.getState().activeProject?.id;
			if (!projectId) throw new Error("No active project");
			const items = editorWindow.__mediaStore.getState().mediaItems;
			const byName = (name: string) => {
				const item = items.find((candidate) => candidate.name === name);
				if (!item) throw new Error(`Media ${name} was not imported`);
				return item;
			};

			const timeline = editorWindow.__timelineStore.getState();
			const mainTrack = timeline.tracks.find(
				(candidate) => candidate.isMain || candidate.type === "media"
			);
			if (!mainTrack) throw new Error("Missing main media track");

			const add = ({
				trackId,
				name,
				mediaId,
				startTime,
				duration,
				extra = {},
			}: {
				trackId: string;
				name: string;
				mediaId: string;
				startTime: number;
				duration: number;
				extra?: Record<string, unknown>;
			}) => {
				const id = timeline.addElementToTrack(trackId, {
					type: "media",
					mediaId,
					name,
					startTime,
					duration,
					trimStart: 0,
					trimEnd: 0,
					...extra,
				});
				if (!id) throw new Error(`Failed to add ${name}`);
				return id;
			};

			if (scenario === "sequential-clips") {
				const third = seconds / 3;
				add({
					trackId: mainTrack.id,
					name: "cli-a",
					mediaId: byName(videoAName).id,
					startTime: 0,
					duration: third,
				});
				add({
					trackId: mainTrack.id,
					name: "cli-b",
					mediaId: byName(videoBName).id,
					startTime: third,
					duration: third,
				});
				add({
					trackId: mainTrack.id,
					name: "cli-c",
					mediaId: byName(videoAName).id,
					startTime: third * 2,
					duration: seconds - third * 2,
				});
			} else if (
				scenario === "video-with-audio" ||
				scenario === "large-library"
			) {
				add({
					trackId: mainTrack.id,
					name: "cli-audio-clip",
					mediaId: byName(
						scenario === "large-library" ? videoAName : audioVideoName
					).id,
					startTime: 0,
					duration: seconds,
				});
			} else {
				add({
					trackId: mainTrack.id,
					name: "cli-main",
					mediaId: byName(videoAName).id,
					startTime: 0,
					duration: seconds,
				});
				if (scenario === "image-text-overlay") {
					const imageTrack = timeline.insertTrackAt("media", 0);
					add({
						trackId: imageTrack,
						name: "cli-still",
						mediaId: byName(imageName).id,
						startTime: 0,
						duration: seconds,
						extra: { x: -240, y: -120, scaleX: 0.35, scaleY: 0.35 },
					});
					const textTrack = timeline.insertTrackAt("text", 0);
					const textId = timeline.addElementToTrack(textTrack, {
						type: "text",
						name: "cli-text",
						content: "QCut CLI export benchmark",
						startTime: 0,
						duration: seconds,
						trimStart: 0,
						trimEnd: 0,
						fontSize: 56,
						fontFamily: "Arial",
						color: "#ffffff",
						backgroundColor: "transparent",
						textAlign: "center",
						fontWeight: "bold",
						fontStyle: "normal",
						textDecoration: "none",
						x: 0,
						y: 200,
						rotation: 0,
						opacity: 1,
					});
					if (!textId) throw new Error("Failed to add the text overlay");
				}
			}

			return { projectId, duration: timeline.getTotalDuration() };
		},
		{
			scenario,
			videoAName,
			videoBName,
			audioVideoName,
			imageName,
			seconds: CLI_BENCHMARK_SECONDS,
		}
	);
}

/** Runs one CLI export end to end while sampling process memory. */
export async function measureCliExport({
	page,
	electronApp,
	projectId,
	scenario,
	outputPath,
	memoryIntervalMs = 500,
}: {
	page: Page;
	electronApp: ElectronApplication;
	projectId: string;
	scenario: CliScenarioName;
	outputPath: string;
	memoryIntervalMs?: number;
}): Promise<{
	wallMs: number;
	peakMemoryMbByType: Record<string, number>;
	memorySampleCount: number;
}> {
	const samples: MemorySnapshot[] = [];
	let sampling = true;
	const collect = (async () => {
		while (sampling) {
			try {
				samples.push({
					atMs: Date.now(),
					label: scenario,
					samples: await sampleMemory({ electronApp }),
				});
			} catch {
				// A sample racing teardown must not fail the benchmark.
			}
			await new Promise((resolve) => setTimeout(resolve, memoryIntervalMs));
		}
	})();

	const startedAt = Date.now();
	try {
		const result = await page.evaluate(
			async ({ outputPath, projectId, fps, width, height }) => {
				const actions = (
					window as unknown as {
						__exportActions?: {
							exportLocalVideo: (
								request: Record<string, unknown>
							) => Promise<void>;
						};
					}
				).__exportActions;
				if (!actions) throw new Error("Export actions are not registered");
				try {
					await actions.exportLocalVideo({
						engine: "cli",
						filename: "cli-benchmark",
						format: "mp4",
						frameRate: fps,
						height,
						outputPath,
						projectId,
						quality: "720p",
						width,
					});
					return { ok: true as const };
				} catch (error) {
					return {
						ok: false as const,
						error: error instanceof Error ? error.message : String(error),
					};
				}
			},
			{
				fps: CLI_BENCHMARK_FPS,
				height: CLI_BENCHMARK_HEIGHT,
				outputPath,
				projectId,
				width: CLI_BENCHMARK_WIDTH,
			}
		);
		if (!result.ok) {
			throw new Error(`${scenario} CLI export failed: ${result.error}`);
		}
	} finally {
		sampling = false;
		await collect;
	}

	return {
		memorySampleCount: samples.length,
		peakMemoryMbByType: peakByType(samples),
		wallMs: Date.now() - startedAt,
	};
}

export async function writeCliBenchmarkReport({
	directory,
	fileName,
	label,
	measurements,
}: {
	directory: string;
	fileName: string;
	label: string;
	measurements: CliBenchmarkMeasurement[];
}): Promise<string> {
	const report: CliBenchmarkReport = {
		schemaVersion: 1,
		kind: "qcut-cli-export-benchmark-v1",
		label,
		recordedAt: new Date().toISOString(),
		settings: {
			width: CLI_BENCHMARK_WIDTH,
			height: CLI_BENCHMARK_HEIGHT,
			fps: CLI_BENCHMARK_FPS,
			seconds: CLI_BENCHMARK_SECONDS,
		},
		measurements,
	};
	const filePath = path.join(directory, fileName);
	await writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
	return filePath;
}
