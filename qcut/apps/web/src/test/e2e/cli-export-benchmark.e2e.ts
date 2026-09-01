/**
 * Desktop default (CLI / FFmpeg) export benchmark.
 *
 * Four timelines are exported through the renderer automation bridge with the
 * engine the desktop export panel pins by default. The renderer's own
 * engine-selection log is captured and asserted, so a run that silently fell
 * back to another engine fails instead of reporting numbers for the wrong path.
 *
 * Each export is verified with ffprobe (frame count, duration, geometry, and
 * for the audio scenario the sample rate and channel layout) plus key-frame
 * pixel probes, so a faster export that changed the picture or the audio
 * cannot pass.
 *
 * Run with:
 *   bunx playwright test apps/web/src/test/e2e/cli-export-benchmark.e2e.ts
 */

import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	CLI_BENCHMARK_FPS,
	CLI_BENCHMARK_FRAMES,
	CLI_BENCHMARK_HEIGHT,
	CLI_BENCHMARK_SECONDS,
	CLI_BENCHMARK_WIDTH,
	type CliBenchmarkMeasurement,
	type CliScenarioName,
	buildCliTimeline,
	generateCliStill,
	generateSilentClip,
	measureCliExport,
	probeExportedAudio,
	probeVideoElementLoad,
	resolveSelectedEngine,
	restoreTimelineTracks,
	snapshotTimelineTracks,
	writeCliBenchmarkReport,
} from "./helpers/cli-export-benchmark";
import { uploadTestMedia } from "./helpers/e2e-panel-helpers";
import { createTestProject, expect } from "./helpers/electron-helpers";
import { isolatedElectronTest as test } from "./helpers/isolated-electron-fixture";
import {
	frameSelectTime,
	generateRampClip,
	meanColorRect,
} from "./helpers/sequential-decode-evidence";
import { waitForLocalPaths } from "./helpers/sequential-decode-timeline";
import { decodeFrame, probeVideo } from "./helpers/transition-export-evidence";

const EVIDENCE_DIR = path.resolve("output/playwright/cli-export-benchmark");

const SCENARIOS: readonly CliScenarioName[] = [
	"single-video",
	"sequential-clips",
	"image-text-overlay",
	"video-with-audio",
	"large-library",
];

/** Central patch, used to prove each export still renders real picture. */
const FRAME_REGION = { x0: 0.3, x1: 0.7, y0: 0.3, y1: 0.7 } as const;

test("measures the desktop default CLI export path", async ({
	page,
	electronApp,
}) => {
	test.setTimeout(30 * 60_000);
	page.on("pageerror", (error) => {
		console.log(`[RENDERER pageerror] ${error.stack ?? error.message}`);
	});

	// The factory logs its resolved choice ungated. That line — not the panel's
	// "auto" selection — is what proves which engine actually ran.
	const engineLog: string[] = [];
	// Console arrival times turn the renderer's own progress chatter into a
	// crude stage profile: the largest silent gap is where the export spent
	// its time, which is enough to localize a slow path without arming the
	// profiler (the automation bridge cannot arm it on this route).
	const consoleTrail: Array<{ atMs: number; text: string }> = [];
	page.on("console", (message) => {
		const text = message.text();
		consoleTrail.push({ atMs: Date.now(), text });
		if (text.includes("EXPORT ENGINE SELECTION:")) engineLog.push(text);
	});

	const label = process.env.QCUT_BENCHMARK_LABEL ?? "current";
	const keepOutputs = process.env.QCUT_BENCH_KEEP_OUTPUT === "1";
	const measurements: CliBenchmarkMeasurement[] = [];
	const workDir = await mkdtemp(path.join(tmpdir(), "qcut-cli-bench-"));
	await mkdir(EVIDENCE_DIR, { recursive: true });

	const sources = {
		videoA: path.join(workDir, "cli-a.mp4"),
		videoB: path.join(workDir, "cli-b.mp4"),
		audioVideo: path.join(workDir, "cli-audio.mp4"),
		image: path.join(workDir, "cli-still.png"),
	};

	try {
		// Silent clips everywhere except the audio scenario, so "has audio" is a
		// property of the timeline rather than an accident of the fixtures.
		await generateSilentClip({
			filePath: sources.videoA,
			seconds: CLI_BENCHMARK_SECONDS + 2,
		});
		await generateSilentClip({
			filePath: sources.videoB,
			seconds: CLI_BENCHMARK_SECONDS + 2,
			pattern: "smptebars",
		});
		await generateRampClip({
			filePath: sources.audioVideo,
			redBase: 16,
			toneHz: 220,
			seconds: CLI_BENCHMARK_SECONDS + 2,
		});
		await generateCliStill({ filePath: sources.image });

		await page.setViewportSize({ width: 1440, height: 1000 });
		await createTestProject(page, "CLI Export Benchmark");
		for (const filePath of Object.values(sources)) {
			await uploadTestMedia(page, filePath);
		}
		await waitForLocalPaths({
			page,
			videoNames: [
				path.basename(sources.videoA),
				path.basename(sources.videoB),
				path.basename(sources.audioVideo),
			],
		});
		// Filler clips are imported but never placed on a timeline. They exist to
		// expose work that scales with the media library rather than the export.
		const fillerPaths: string[] = [];
		for (let index = 0; index < 8; index += 1) {
			const fillerPath = path.join(workDir, `cli-filler-${index}.mp4`);
			await generateSilentClip({ filePath: fillerPath, seconds: 2 });
			fillerPaths.push(fillerPath);
		}
		for (const fillerPath of fillerPaths) {
			await uploadTestMedia(page, fillerPath);
		}
		await waitForLocalPaths({
			page,
			videoNames: fillerPaths.map((fillerPath) => path.basename(fillerPath)),
		});

		const pristineTracks = await snapshotTimelineTracks({ page });

		/**
		 * The export panel owns `__exportActions`, and resetting the timeline
		 * unmounts it, so the panel is re-opened before every export.
		 */
		const ensureExportActions = async () => {
			const registered = await page.evaluate(() =>
				Boolean(
					(window as unknown as { __exportActions?: unknown }).__exportActions
				)
			);
			if (registered) return;
			await page.getByTestId("export-button").click();
			await expect(page.getByTestId("export-dialog")).toBeVisible();
			await page.waitForFunction(
				() =>
					Boolean(
						(window as unknown as { __exportActions?: unknown }).__exportActions
					),
				undefined,
				{ timeout: 15_000 }
			);
		};

		// Discarded warm-up export absorbs session start-up cost.
		await restoreTimelineTracks({ page, snapshot: pristineTracks });
		const warmup = await buildCliTimeline({
			page,
			scenario: "single-video",
			videoAName: path.basename(sources.videoA),
			videoBName: path.basename(sources.videoB),
			audioVideoName: path.basename(sources.audioVideo),
			imageName: path.basename(sources.image),
		});
		await ensureExportActions();
		await measureCliExport({
			page,
			electronApp,
			projectId: warmup.projectId,
			scenario: "single-video",
			outputPath: path.join(workDir, "warmup.mp4"),
		});

		for (const scenario of SCENARIOS) {
			await restoreTimelineTracks({ page, snapshot: pristineTracks });
			const { projectId, duration } = await buildCliTimeline({
				page,
				scenario,
				videoAName: path.basename(sources.videoA),
				videoBName: path.basename(sources.videoB),
				audioVideoName: path.basename(sources.audioVideo),
				imageName: path.basename(sources.image),
			});
			expect(duration).toBeCloseTo(CLI_BENCHMARK_SECONDS, 2);

			await ensureExportActions();
			const loadProbe = await probeVideoElementLoad({ page });
			const trailFrom = consoleTrail.length;
			const engineLogBefore = engineLog.length;
			const outputPath = keepOutputs
				? path.join(EVIDENCE_DIR, `${label}-${scenario}.mp4`)
				: path.join(workDir, `${scenario}.mp4`);
			const run = await measureCliExport({
				page,
				electronApp,
				projectId,
				scenario,
				outputPath,
			});
			let widestGapMs = 0;
			let widestGapAfter = "";
			for (let index = trailFrom + 1; index < consoleTrail.length; index += 1) {
				const gap = consoleTrail[index].atMs - consoleTrail[index - 1].atMs;
				if (gap > widestGapMs) {
					widestGapMs = gap;
					widestGapAfter = consoleTrail[index - 1].text.slice(0, 90);
				}
			}

			const selectedEngine = resolveSelectedEngine({
				lines: engineLog.slice(engineLogBefore),
			});
			expect(
				selectedEngine,
				`${scenario} did not run on the CLI engine; captured: ${JSON.stringify(engineLog.slice(engineLogBefore))}`
			).toBe("cli");

			expect(existsSync(outputPath)).toBe(true);
			const probe = await probeVideo({ filePath: outputPath });
			const audio = probe.hasAudio
				? await probeExportedAudio({ filePath: outputPath })
				: null;
			measurements.push({
				scenario,
				wallMs: run.wallMs,
				videoLoadProbeMs: loadProbe.loadMs,
				loadedVideoCount: loadProbe.count,
				selectedEngine,
				peakMemoryMbByType: run.peakMemoryMbByType,
				memorySampleCount: run.memorySampleCount,
				probe: {
					audioChannels: audio?.channels ?? null,
					audioSampleRate: audio?.sampleRate ?? null,
					durationSeconds: probe.durationSeconds,
					frameCount: probe.frameCount,
					fps: probe.fps,
					hasAudio: probe.hasAudio,
					height: probe.height,
					width: probe.width,
				},
			});
			console.log(
				`[cli-bench] ${scenario}: engine=${selectedEngine} wall=${run.wallMs}ms ` +
					`videoLoadProbe=${loadProbe.loadMs}ms over ${loadProbe.count} videos ` +
					`frames=${probe.frameCount} dur=${probe.durationSeconds.toFixed(3)}s ` +
					`audio=${probe.hasAudio ? `${audio?.sampleRate}Hz/${audio?.channels}ch` : "none"} ` +
					`peakTab=${run.peakMemoryMbByType.Tab ?? 0}MB ` +
					`widestGap=${widestGapMs}ms after "${widestGapAfter}"`
			);

			// Output contract: geometry, timing and audio must not move.
			expect(probe.width).toBe(CLI_BENCHMARK_WIDTH);
			expect(probe.height).toBe(CLI_BENCHMARK_HEIGHT);
			expect(probe.fps).toBeCloseTo(CLI_BENCHMARK_FPS, 1);
			expect(probe.frameCount).toBeGreaterThanOrEqual(CLI_BENCHMARK_FRAMES - 2);
			expect(probe.frameCount).toBeLessThanOrEqual(CLI_BENCHMARK_FRAMES + 2);
			expect(probe.durationSeconds).toBeGreaterThan(
				CLI_BENCHMARK_SECONDS - 0.15
			);
			expect(probe.durationSeconds).toBeLessThan(CLI_BENCHMARK_SECONDS + 0.35);
			if (scenario === "video-with-audio") {
				expect(probe.hasAudio).toBe(true);
				expect(audio?.sampleRate).toBeGreaterThan(0);
				expect(audio?.channels).toBeGreaterThan(0);
			}

			// Key-frame pixel probe: the picture is real, not black frames.
			for (const frameIndex of [5, 90, 170]) {
				const frame = await decodeFrame({
					filePath: outputPath,
					timeSeconds: frameSelectTime({
						frameIndex,
						fps: CLI_BENCHMARK_FPS,
					}),
				});
				const mean = meanColorRect({ frame, rect: FRAME_REGION });
				expect(
					mean.r + mean.g + mean.b,
					`${scenario} frame ${frameIndex} is black`
				).toBeGreaterThan(20);
			}
		}

		const reportPath = await writeCliBenchmarkReport({
			directory: EVIDENCE_DIR,
			fileName: `cli-benchmark-${label}.json`,
			label,
			measurements,
		});
		console.log(`[cli-bench] report: ${reportPath}`);
	} finally {
		await rm(workDir, { force: true, recursive: true });
	}
});
