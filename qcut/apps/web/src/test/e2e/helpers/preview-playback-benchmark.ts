/**
 * Reproducible preview/playback benchmark harness.
 *
 * Playback health is measured by the existing diagnostics CLI
 * (`scripts/playback-diagnose.ts`) run against the live editor, so the numbers
 * come from the same instrument used to investigate real stutter reports
 * rather than from a bespoke measurement path.
 *
 * The harness builds four timeline shapes, plays each one, and folds the
 * collector snapshot into a comparable summary: master-clock health (the
 * effective playback FPS), frame-present intervals, dropped frames, main
 * thread long tasks, media element churn and preview re-render counts.
 */

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { Page } from "@playwright/test";
import { _electron as electron } from "playwright";
import { getFFmpegPath } from "../../../../../../electron/ffmpeg/paths";
import { test as qcutTest } from "./electron-helpers";
import { findAvailablePort } from "./isolated-electron-fixture";
import type { ExposedWindow } from "./sequential-decode-timeline";

const execFileAsync = promisify(execFile);

/**
 * Isolated editor with the GPU left enabled.
 *
 * The shared isolated fixture disables the GPU, which is right for export
 * benchmarks but would make playback numbers describe a software rasteriser
 * rather than what a user sees. Everything else matches that fixture: a
 * throwaway user-data directory and a dedicated API port so the run coexists
 * with a running QCut.
 */
export const gpuElectronTest = qcutTest.extend<{ apiPort: number }>({
	// biome-ignore lint/correctness/noEmptyPattern: Playwright fixtures require empty destructuring
	apiPort: async ({}, use) => {
		await use(await findAvailablePort());
	},
	electronApp: async ({ apiPort }, use) => {
		const userDataDirectory = await mkdtemp(
			path.join(tmpdir(), "qcut-preview-gpu-e2e-")
		);
		const electronApp = await electron.launch({
			args: ["dist/electron/main.js", `--user-data-dir=${userDataDirectory}`],
			env: {
				...process.env,
				NODE_ENV: "test",
				QCUT_API_PORT: String(apiPort),
			},
		});
		await use(electronApp);
		await electronApp.close();
		await rm(userDataDirectory, { force: true, recursive: true });
	},
});

/** Opaque still used as the image overlay. */
export async function generatePreviewStill({
	filePath,
	color = "0x20c060",
	size = 512,
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

export const PREVIEW_SCENARIO_SECONDS = 8;
/**
 * Playback sample window; long enough for the clock to settle. Overridable so
 * a longer sample can separate fixed start-up cost from ongoing work.
 */
export const PREVIEW_PLAY_SECONDS = Number(
	process.env.QCUT_PREVIEW_PLAY_SECONDS ?? 6
);

export type PreviewScenarioName =
	| "single-video"
	| "two-layer"
	| "image-text-overlay"
	| "continuous-timeline";

export interface PlaybackSnapshot {
	installed: boolean;
	now: number;
	clockIntervalsMs: number[];
	longTasks: Array<{ at: number; durationMs: number }>;
	longTaskTotalCount: number;
	longTaskTotalDurationMs: number;
	mediaEvents: Array<{ at: number; type: string; videoId: string }>;
	previewRenderTimestamps: number[];
	previewRenderTotalCount: number;
	presentedFrames: Array<{
		at: number;
		videoId: string;
		intervalMs: number | null;
	}>;
	videos: Array<{
		videoId: string;
		droppedVideoFrames: number | null;
		totalVideoFrames: number | null;
		currentTime: number;
		paused: boolean;
	}>;
	smoothTimeReason: string | null;
	playbackStore: {
		isPlaying: boolean;
		currentTime: number;
	} | null;
}

export interface PlaybackSummary {
	scenario: PreviewScenarioName;
	/** Effective playback rate implied by the master clock. */
	clockFps: number;
	clockTicks: number;
	clockP50Ms: number;
	clockP95Ms: number;
	clockStallsOver50Ms: number;
	presentedFrameCount: number;
	presentP50Ms: number;
	presentP95Ms: number;
	droppedVideoFrames: number;
	totalVideoFrames: number;
	longTaskCount: number;
	longTaskTotalMs: number;
	/** Longest main-thread blocks, so a recurring stall is visible. */
	topLongTasksMs: number[];
	previewRenderCount: number;
	mediaEventCounts: Record<string, number>;
	smoothTimeReason: string | null;
	/**
	 * Store position at snapshot time. The store only syncs `currentTime` on
	 * pause (playback advances a mutable ref instead), so during playback this
	 * stays at the seek origin — use `maxVideoCurrentTime` to prove advance.
	 */
	endCurrentTime: number;
	/** Furthest media-element position, which does advance during playback. */
	maxVideoCurrentTime: number;
}

function percentile(sorted: readonly number[], fraction: number): number {
	if (sorted.length === 0) return 0;
	const index = Math.min(
		sorted.length - 1,
		Math.floor(sorted.length * fraction)
	);
	return Number(sorted[index].toFixed(3));
}

/** Folds a raw collector snapshot into the comparable summary. */
export function summarizePlayback({
	scenario,
	snapshot,
}: {
	scenario: PreviewScenarioName;
	snapshot: PlaybackSnapshot;
}): PlaybackSummary {
	const clock = [...snapshot.clockIntervalsMs].sort((a, b) => a - b);
	const clockP50 = percentile(clock, 0.5);
	const presentIntervals = snapshot.presentedFrames
		.map((frame) => frame.intervalMs)
		.filter((value): value is number => typeof value === "number")
		.sort((a, b) => a - b);
	const mediaEventCounts: Record<string, number> = {};
	for (const event of snapshot.mediaEvents) {
		mediaEventCounts[event.type] = (mediaEventCounts[event.type] ?? 0) + 1;
	}
	const dropped = snapshot.videos.reduce(
		(sum, video) => sum + (video.droppedVideoFrames ?? 0),
		0
	);
	const total = snapshot.videos.reduce(
		(sum, video) => sum + (video.totalVideoFrames ?? 0),
		0
	);
	return {
		scenario,
		clockFps: clockP50 > 0 ? Number((1000 / clockP50).toFixed(2)) : 0,
		clockTicks: clock.length,
		clockP50Ms: clockP50,
		clockP95Ms: percentile(clock, 0.95),
		clockStallsOver50Ms: clock.filter((value) => value >= 50).length,
		presentedFrameCount: snapshot.presentedFrames.length,
		presentP50Ms: percentile(presentIntervals, 0.5),
		presentP95Ms: percentile(presentIntervals, 0.95),
		droppedVideoFrames: dropped,
		totalVideoFrames: total,
		longTaskCount: snapshot.longTaskTotalCount,
		longTaskTotalMs: Number(snapshot.longTaskTotalDurationMs.toFixed(1)),
		topLongTasksMs: [...snapshot.longTasks]
			.sort((a, b) => b.durationMs - a.durationMs)
			.slice(0, 5)
			.map((task) => Number(task.durationMs.toFixed(1))),
		previewRenderCount: snapshot.previewRenderTotalCount,
		mediaEventCounts,
		smoothTimeReason: snapshot.smoothTimeReason,
		endCurrentTime: snapshot.playbackStore?.currentTime ?? 0,
		maxVideoCurrentTime: snapshot.videos.reduce(
			(furthest, video) => Math.max(furthest, video.currentTime ?? 0),
			0
		),
	};
}

/**
 * Runs the production diagnostics CLI against the editor under test.
 *
 * The CLI prints two banner lines before its JSON payload, so the parser
 * starts at the first brace rather than assuming pure JSON on stdout.
 */
export async function runPlaybackDiagnose({
	apiPort,
	projectId,
	fromSeconds = 0,
	seconds = PREVIEW_PLAY_SECONDS,
	token,
	cwd,
}: {
	apiPort: number;
	projectId: string;
	fromSeconds?: number;
	seconds?: number;
	token?: string;
	cwd: string;
}): Promise<PlaybackSnapshot> {
	const { stdout } = await execFileAsync(
		"bun",
		[
			"scripts/playback-diagnose.ts",
			"--project",
			projectId,
			"--from",
			String(fromSeconds),
			"--seconds",
			String(seconds),
			"--json",
			...(token ? ["--token", token] : []),
		],
		{
			cwd,
			env: {
				...process.env,
				QCUT_API_URL: `http://127.0.0.1:${apiPort}`,
			},
			maxBuffer: 64 * 1024 * 1024,
		}
	);
	const start = stdout.indexOf("{");
	if (start === -1) {
		throw new Error(`Diagnose CLI produced no JSON payload:\n${stdout}`);
	}
	return JSON.parse(stdout.slice(start)) as PlaybackSnapshot;
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
 * Builds one preview scenario.
 *
 * `continuous-timeline` chains three clips so playback crosses two cuts inside
 * the sampled window, which is where clip-boundary work shows up.
 */
export async function buildPreviewTimeline({
	page,
	scenario,
	videoAName,
	videoBName,
	imageName,
}: {
	page: Page;
	scenario: PreviewScenarioName;
	videoAName: string;
	videoBName: string;
	imageName: string;
}): Promise<{ projectId: string; duration: number }> {
	return page.evaluate(
		({ scenario, videoAName, videoBName, imageName, seconds }) => {
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

			const addMedia = ({
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

			if (scenario === "continuous-timeline") {
				// Three clips back to back: playback crosses two cuts.
				const third = seconds / 3;
				addMedia({
					trackId: mainTrack.id,
					name: "preview-a",
					mediaId: byName(videoAName).id,
					startTime: 0,
					duration: third,
				});
				addMedia({
					trackId: mainTrack.id,
					name: "preview-b",
					mediaId: byName(videoBName).id,
					startTime: third,
					duration: third,
				});
				addMedia({
					trackId: mainTrack.id,
					name: "preview-c",
					mediaId: byName(videoAName).id,
					startTime: third * 2,
					duration: seconds - third * 2,
				});
			} else {
				addMedia({
					trackId: mainTrack.id,
					name: "preview-main",
					mediaId: byName(videoAName).id,
					startTime: 0,
					duration: seconds,
				});
				if (scenario === "two-layer") {
					const overlayTrack = timeline.insertTrackAt("media", 0);
					addMedia({
						trackId: overlayTrack,
						name: "preview-overlay",
						mediaId: byName(videoBName).id,
						startTime: 0,
						duration: seconds,
						extra: { x: 220, y: 110, scaleX: 0.45, scaleY: 0.45 },
					});
				} else if (scenario === "image-text-overlay") {
					const imageTrack = timeline.insertTrackAt("media", 0);
					addMedia({
						trackId: imageTrack,
						name: "preview-still",
						mediaId: byName(imageName).id,
						startTime: 0,
						duration: seconds,
						extra: { x: -240, y: -120, scaleX: 0.35, scaleY: 0.35 },
					});
					const textTrack = timeline.insertTrackAt("text", 0);
					const textId = timeline.addElementToTrack(textTrack, {
						type: "text",
						name: "preview-text",
						content: "QCut preview benchmark",
						startTime: 0,
						duration: seconds,
						trimStart: 0,
						trimEnd: 0,
						fontSize: 64,
						fontFamily: "Arial",
						color: "#ffffff",
						backgroundColor: "transparent",
						textAlign: "center",
						fontWeight: "bold",
						fontStyle: "normal",
						textDecoration: "none",
						x: 0,
						y: 220,
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
			imageName,
			seconds: PREVIEW_SCENARIO_SECONDS,
		}
	);
}

export interface PreviewBenchmarkReport {
	schemaVersion: 1;
	kind: "qcut-preview-playback-benchmark-v1";
	label: string;
	recordedAt: string;
	playSeconds: number;
	summaries: PlaybackSummary[];
}

export async function writePreviewBenchmarkReport({
	directory,
	fileName,
	label,
	summaries,
}: {
	directory: string;
	fileName: string;
	label: string;
	summaries: PlaybackSummary[];
}): Promise<string> {
	const report: PreviewBenchmarkReport = {
		schemaVersion: 1,
		kind: "qcut-preview-playback-benchmark-v1",
		label,
		recordedAt: new Date().toISOString(),
		playSeconds: PREVIEW_PLAY_SECONDS,
		summaries,
	};
	const filePath = path.join(directory, fileName);
	await writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
	return filePath;
}
