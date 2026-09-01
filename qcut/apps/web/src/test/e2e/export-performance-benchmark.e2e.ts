/**
 * Export performance benchmark.
 *
 * Runs three fixed timeline shapes through the production renderer-muxer
 * export route with the structured profiler armed, and records wall time,
 * per-stage timings, decode counters and peak process memory into one JSON
 * report under output/playwright/export-performance-benchmark/.
 *
 * The report localizes the bottleneck (stage totals are ranked) and gives a
 * repeatable before/after baseline for optimization work. Each scenario also
 * asserts the produced file with ffprobe, so a "faster" run that silently
 * dropped frames, duration or audio fails here rather than shipping.
 *
 * Run with:
 *   bunx playwright test apps/web/src/test/e2e/export-performance-benchmark.e2e.ts
 */

import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	BENCHMARK_FPS,
	BENCHMARK_FRAMES,
	BENCHMARK_HEIGHT,
	BENCHMARK_SECONDS,
	BENCHMARK_WIDTH,
	type BenchmarkMeasurement,
	type BenchmarkScenarioName,
	buildBenchmarkTimeline,
	generateStillImage,
	measureExportScenario,
	rankStages,
	restoreTimelineTracks,
	snapshotTimelineTracks,
	writeBenchmarkReport,
} from "./helpers/export-benchmark";
import { uploadTestMedia } from "./helpers/e2e-panel-helpers";
import { createTestProject, expect } from "./helpers/electron-helpers";
import { isolatedElectronTest as test } from "./helpers/isolated-electron-fixture";
import {
	frameSelectTime,
	generateRampClip,
	generateToneWav,
	meanColorRect,
} from "./helpers/sequential-decode-evidence";
import { waitForLocalPaths } from "./helpers/sequential-decode-timeline";
import {
	decodeFrame,
	generateToneClip,
	probeVideo,
	waitForExportJob,
} from "./helpers/transition-export-evidence";

const EVIDENCE_DIR = path.resolve(
	"output/playwright/export-performance-benchmark"
);

/**
 * Normalized rects covering each still overlay. The stills are placed at
 * ±220/±110 px from the centre of a 1280x720 canvas at 0.4 scale, so a small
 * probe at each centre lands well inside the drawn image.
 */
const IMAGE_OVERLAY_REGIONS = [
	{ x0: 0.29, x1: 0.36, y0: 0.28, y1: 0.38 },
	{ x0: 0.64, x1: 0.71, y0: 0.62, y1: 0.72 },
] as const;

const SCENARIOS: readonly BenchmarkScenarioName[] = [
	"single-track",
	"multi-track-3",
	"image-overlay",
	"filters-transition-audio",
];

test("measures export performance across single-track, multi-track and effect-heavy timelines", async ({
	page,
	electronApp,
	apiPort,
}) => {
	test.setTimeout(20 * 60_000);
	page.on("pageerror", (error) => {
		console.log(`[RENDERER pageerror] ${error.stack ?? error.message}`);
	});

	const label = process.env.QCUT_BENCHMARK_LABEL ?? "current";
	const measurements: BenchmarkMeasurement[] = [];
	const workDir = await mkdtemp(path.join(tmpdir(), "qcut-export-bench-"));
	await mkdir(EVIDENCE_DIR, { recursive: true });
	const sources = {
		clipA: path.join(workDir, "bench-ramp-a.mp4"),
		clipB: path.join(workDir, "bench-ramp-b.mp4"),
		clipC: path.join(workDir, "bench-motion.mp4"),
		audio: path.join(workDir, "bench-tone.wav"),
		image: path.join(workDir, "bench-still.png"),
	};

	try {
		// Deterministic fixtures: the ramp clips carry a per-frame colour code,
		// so any frame-selection regression shows up in the ffprobe checks and
		// in the sibling parity suite rather than as a silent speedup.
		await generateRampClip({
			filePath: sources.clipA,
			redBase: 16,
			toneHz: 220,
			seconds: BENCHMARK_SECONDS + 2,
		});
		await generateRampClip({
			filePath: sources.clipB,
			redBase: 150,
			toneHz: 440,
			seconds: BENCHMARK_SECONDS + 2,
		});
		await generateToneClip({
			filePath: sources.clipC,
			pattern: "testsrc2",
			toneHz: 880,
			seconds: BENCHMARK_SECONDS + 2,
		});
		await generateToneWav({
			filePath: sources.audio,
			toneHz: 600,
			seconds: BENCHMARK_SECONDS,
		});
		await generateStillImage({ filePath: sources.image });

		await page.setViewportSize({ width: 1440, height: 1000 });
		await createTestProject(page, "Export Performance Benchmark");
		for (const filePath of Object.values(sources)) {
			await uploadTestMedia(page, filePath);
		}
		await waitForLocalPaths({
			page,
			videoNames: [
				path.basename(sources.clipA),
				path.basename(sources.clipB),
				path.basename(sources.clipC),
			],
		});
		const pristineTracks = await snapshotTimelineTracks({ page });

		for (const scenario of SCENARIOS) {
			// Scenarios share one project but never share tracks: restoring the
			// pristine list keeps each measured workload exactly as declared.
			await restoreTimelineTracks({ page, snapshot: pristineTracks });

			const { projectId, duration } = await buildBenchmarkTimeline({
				page,
				scenario,
				media: {
					clipA: path.basename(sources.clipA),
					clipB: path.basename(sources.clipB),
					clipC: path.basename(sources.clipC),
					audio: path.basename(sources.audio),
					image: path.basename(sources.image),
				},
			});
			expect(duration).toBeCloseTo(BENCHMARK_SECONDS, 2);

			const outputPath = path.join(workDir, `${scenario}.mp4`);
			const profilePath = path.join(workDir, `${scenario}-profile.json`);
			const { measurement } = await measureExportScenario({
				apiPort,
				electronApp,
				projectId,
				scenario,
				outputPath,
				profilePath,
				token: process.env.QCUT_API_TOKEN,
				waitForJob: ({ jobId }) =>
					waitForExportJob({
						apiPort,
						projectId,
						jobId,
						token: process.env.QCUT_API_TOKEN,
						timeoutMs: 540_000,
					}),
			});

			measurements.push(measurement);
			console.log(
				`[benchmark] ${scenario}: ${measurement.wallMs}ms ` +
					`(${measurement.msPerFrame}ms/frame), top stages: ` +
					rankStages({ measurement })
						.slice(0, 4)
						.map((entry) => `${entry.stage}=${Math.round(entry.totalMs)}ms`)
						.join(" ")
			);

			// Correctness gate: a faster export that lost frames, duration or
			// audio is a regression, not a win.
			expect(existsSync(outputPath)).toBe(true);
			const probe = await probeVideo({ filePath: outputPath });
			expect(probe.width).toBe(BENCHMARK_WIDTH);
			expect(probe.height).toBe(BENCHMARK_HEIGHT);
			expect(probe.fps).toBeCloseTo(BENCHMARK_FPS, 1);
			expect(probe.frameCount).toBe(BENCHMARK_FRAMES);
			// nb_read_frames is the exact contract; the container duration also
			// carries the trailing frame's own duration (and any slightly longer
			// audio stream), so it is bounded rather than pinned.
			expect(probe.durationSeconds).toBeGreaterThan(BENCHMARK_SECONDS - 0.1);
			expect(probe.durationSeconds).toBeLessThan(BENCHMARK_SECONDS + 0.35);
			if (scenario === "filters-transition-audio") {
				expect(probe.hasAudio).toBe(true);
			}
			if (scenario === "image-overlay") {
				// Guards the still-image cache: a cache that served a blank or
				// stale bitmap would still export the right frame count, so the
				// overlay's own pixels are checked. Both overlays use the same
				// blue fixture, and both must be present on a mid-timeline frame.
				const frame = await decodeFrame({
					filePath: outputPath,
					timeSeconds: frameSelectTime({
						frameIndex: Math.floor(BENCHMARK_FRAMES / 2),
						fps: BENCHMARK_FPS,
					}),
				});
				for (const rect of IMAGE_OVERLAY_REGIONS) {
					const mean = meanColorRect({ frame, rect });
					expect(
						mean.b,
						`overlay region ${JSON.stringify(rect)} was not blue: ${JSON.stringify(mean)}`
					).toBeGreaterThan(mean.r + 40);
					expect(mean.b).toBeGreaterThan(120);
				}
			}
			expect(measurement.frameCount).toBe(BENCHMARK_FRAMES);
		}

		// Every scenario must have produced usable profile data, otherwise the
		// report is not a valid baseline to optimize against.
		for (const measurement of measurements) {
			expect(measurement.wallMs).toBeGreaterThan(0);
			expect(Object.keys(measurement.stageTotalsMs).length).toBeGreaterThan(0);
			expect(measurement.memorySampleCount).toBeGreaterThan(0);
			expect(
				Object.keys(measurement.peakMemoryMbByType).length
			).toBeGreaterThan(0);
		}
	} finally {
		// Written even when a correctness gate fails: a partial run is still
		// the evidence needed to diagnose it.
		if (measurements.length > 0) {
			const reportPath = await writeBenchmarkReport({
				directory: EVIDENCE_DIR,
				fileName: `benchmark-${label}.json`,
				label,
				measurements,
			});
			console.log(`[benchmark] report: ${reportPath}`);
		}
		await rm(workDir, { force: true, recursive: true });
	}
});
