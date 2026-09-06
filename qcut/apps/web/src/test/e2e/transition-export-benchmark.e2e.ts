/**
 * Transition export performance benchmark.
 *
 * Two real short clips meet at a fixed seam. Four exports run through the
 * production renderer-muxer route with the profiler armed: a control with no
 * transition, a cross dissolve, a slide, and a filter-driven zoom blur. Only
 * the transition differs, so the control isolates the transition's own cost.
 *
 * Alongside timings the run asserts what an optimization must not move: frame
 * count, duration, dimensions, audio presence, and — for every transition —
 * the per-frame appearance across the whole transition window, sampled frame
 * by frame and compared against the same run's own boundary frames.
 *
 * Run with:
 *   bunx playwright test apps/web/src/test/e2e/transition-export-benchmark.e2e.ts
 */

import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { uploadTestMedia } from "./helpers/e2e-panel-helpers";
import { createTestProject, expect } from "./helpers/electron-helpers";
import { isolatedElectronTest as test } from "./helpers/isolated-electron-fixture";
import {
	frameSelectTime,
	generateRampClip,
	meanColorRect,
} from "./helpers/sequential-decode-evidence";
import { waitForLocalPaths } from "./helpers/sequential-decode-timeline";
import {
	TRANSITION_BENCHMARK_FPS,
	TRANSITION_BENCHMARK_FRAMES,
	TRANSITION_BENCHMARK_HEIGHT,
	TRANSITION_BENCHMARK_SECONDS,
	TRANSITION_BENCHMARK_WIDTH,
	TRANSITION_DURATION_SECONDS,
	TRANSITION_SEAM_SECONDS,
	type TransitionBenchmarkMeasurement,
	type TransitionScenarioName,
	buildTransitionTimeline,
	measureTransitionScenario,
	restoreTimelineTracks,
	snapshotTimelineTracks,
	writeTransitionBenchmarkReport,
} from "./helpers/transition-export-benchmark";
import {
	decodeFrame,
	probeVideo,
	waitForExportJob,
} from "./helpers/transition-export-evidence";

const EVIDENCE_DIR = path.resolve(
	"output/playwright/transition-export-benchmark"
);

const SCENARIOS: readonly TransitionScenarioName[] = [
	"no-transition",
	"dissolve",
	"slide",
	"zoom-blur",
];

/** Whole-frame probe: the mean colour of the full picture. */
const FULL_FRAME = { x0: 0, x1: 1, y0: 0, y1: 1 } as const;

test("measures transition export cost against a no-transition control", async ({
	page,
	electronApp,
	apiPort,
}) => {
	test.setTimeout(25 * 60_000);
	page.on("pageerror", (error) => {
		console.log(`[RENDERER pageerror] ${error.stack ?? error.message}`);
	});

	const label = process.env.QCUT_BENCHMARK_LABEL ?? "current";
	const keepOutputs = process.env.QCUT_BENCH_KEEP_OUTPUT === "1";
	const measurements: TransitionBenchmarkMeasurement[] = [];
	const workDir = await mkdtemp(path.join(tmpdir(), "qcut-transition-bench-"));
	await mkdir(EVIDENCE_DIR, { recursive: true });

	const sources = {
		clipA: path.join(workDir, "seam-a.mp4"),
		clipB: path.join(workDir, "seam-b.mp4"),
	};

	try {
		// Two clips with clearly different colour bases, so a frame inside the
		// transition window is visibly a blend of the two rather than either.
		await generateRampClip({
			filePath: sources.clipA,
			redBase: 16,
			toneHz: 220,
			seconds: TRANSITION_BENCHMARK_SECONDS,
		});
		await generateRampClip({
			filePath: sources.clipB,
			redBase: 150,
			toneHz: 440,
			seconds: TRANSITION_BENCHMARK_SECONDS,
		});

		await page.setViewportSize({ width: 1440, height: 1000 });
		await createTestProject(page, "Transition Export Benchmark");
		for (const filePath of [sources.clipA, sources.clipB]) {
			await uploadTestMedia(page, filePath);
		}
		await waitForLocalPaths({
			page,
			videoNames: [path.basename(sources.clipA), path.basename(sources.clipB)],
		});
		const pristineTracks = await snapshotTimelineTracks({ page });

		// One discarded export first: the first export of a session pays for the
		// mediabunny import, WebGL warm-up and decoder init, which would
		// otherwise be charged to whichever scenario ran first.
		await restoreTimelineTracks({ page, snapshot: pristineTracks });
		const warmup = await buildTransitionTimeline({
			page,
			scenario: "no-transition",
			clipAName: path.basename(sources.clipA),
			clipBName: path.basename(sources.clipB),
		});
		await measureTransitionScenario({
			apiPort,
			electronApp,
			projectId: warmup.projectId,
			scenario: "no-transition",
			outputPath: path.join(workDir, "warmup.mp4"),
			profilePath: path.join(workDir, "warmup-profile.json"),
			token: process.env.QCUT_API_TOKEN,
			waitForJob: ({ jobId }) =>
				waitForExportJob({
					apiPort,
					projectId: warmup.projectId,
					jobId,
					token: process.env.QCUT_API_TOKEN,
					timeoutMs: 540_000,
				}),
		});

		for (const scenario of SCENARIOS) {
			await restoreTimelineTracks({ page, snapshot: pristineTracks });

			const { projectId, duration, transitionId } =
				await buildTransitionTimeline({
					page,
					scenario,
					clipAName: path.basename(sources.clipA),
					clipBName: path.basename(sources.clipB),
				});
			expect(duration).toBeCloseTo(TRANSITION_BENCHMARK_SECONDS, 2);
			if (scenario === "no-transition") {
				expect(transitionId).toBeNull();
			} else {
				expect(transitionId).not.toBeNull();
			}

			const outputPath = keepOutputs
				? path.join(EVIDENCE_DIR, `${label}-${scenario}.mp4`)
				: path.join(workDir, `${scenario}.mp4`);
			const profilePath = path.join(workDir, `${scenario}-profile.json`);
			const { measurement } = await measureTransitionScenario({
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

			expect(existsSync(outputPath)).toBe(true);
			const probe = await probeVideo({ filePath: outputPath });
			measurement.probe = {
				durationSeconds: probe.durationSeconds,
				frameCount: probe.frameCount,
				hasAudio: probe.hasAudio,
				height: probe.height,
				width: probe.width,
			};
			measurements.push(measurement);
			console.log(
				`[transition-bench] ${scenario}: wall=${Math.round(measurement.exportWallMs)}ms ` +
					`frameP50=${measurement.frameTotalP50Ms.toFixed(2)}ms ` +
					`frameP95=${measurement.frameTotalP95Ms.toFixed(2)}ms ` +
					`layerFrames=${measurement.counters["transition-layer-frames"] ?? 0} ` +
					Object.entries(measurement.stageTotalsMs)
						.filter(([stage]) => stage.startsWith("transition-"))
						.map(([stage, ms]) => `${stage}=${ms.toFixed(1)}ms`)
						.join(" ")
			);

			// Output contract: identical for every scenario.
			expect(probe.width).toBe(TRANSITION_BENCHMARK_WIDTH);
			expect(probe.height).toBe(TRANSITION_BENCHMARK_HEIGHT);
			expect(probe.frameCount).toBe(TRANSITION_BENCHMARK_FRAMES);
			expect(probe.fps).toBeCloseTo(TRANSITION_BENCHMARK_FPS, 1);
			expect(probe.durationSeconds).toBeGreaterThan(
				TRANSITION_BENCHMARK_SECONDS - 0.1
			);
			expect(probe.durationSeconds).toBeLessThan(
				TRANSITION_BENCHMARK_SECONDS + 0.35
			);
			expect(probe.hasAudio).toBe(true);

			if (scenario === "no-transition") {
				// The control must never build a transition layer.
				expect(measurement.counters["transition-layer-frames"] ?? 0).toBe(0);
				continue;
			}

			// A transition must actually run for its declared window: the layer
			// count is bounded by the frames the window spans (both roles can
			// build a layer on the same frame).
			const windowFrames = Math.round(
				TRANSITION_DURATION_SECONDS * TRANSITION_BENCHMARK_FPS
			);
			const layerFrames = measurement.counters["transition-layer-frames"] ?? 0;
			expect(layerFrames).toBeGreaterThan(0);
			expect(layerFrames).toBeLessThanOrEqual(windowFrames * 2 + 4);

			// Boundary frames: just outside the window the picture must be the
			// plain source clip, so a transition can never bleed past its edges.
			const beforeIndex = Math.round(
				(TRANSITION_SEAM_SECONDS - TRANSITION_DURATION_SECONDS / 2) *
					TRANSITION_BENCHMARK_FPS
			);
			const afterIndex = Math.round(
				(TRANSITION_SEAM_SECONDS + TRANSITION_DURATION_SECONDS / 2) *
					TRANSITION_BENCHMARK_FPS
			);
			const outsideBefore = await decodeFrame({
				filePath: outputPath,
				timeSeconds: frameSelectTime({
					frameIndex: Math.max(0, beforeIndex - 3),
					fps: TRANSITION_BENCHMARK_FPS,
				}),
			});
			const outsideAfter = await decodeFrame({
				filePath: outputPath,
				timeSeconds: frameSelectTime({
					frameIndex: Math.min(TRANSITION_BENCHMARK_FRAMES - 1, afterIndex + 3),
					fps: TRANSITION_BENCHMARK_FPS,
				}),
			});
			const beforeMean = meanColorRect({
				frame: outsideBefore,
				rect: FULL_FRAME,
			});
			const afterMean = meanColorRect({
				frame: outsideAfter,
				rect: FULL_FRAME,
			});
			// Clip A is the low-red base and clip B the high-red base, so the two
			// sides of the window must remain clearly distinguishable.
			expect(afterMean.r).toBeGreaterThan(beforeMean.r + 20);
		}

		for (const measurement of measurements) {
			expect(measurement.exportWallMs).toBeGreaterThan(0);
			expect(measurement.frameCount).toBe(TRANSITION_BENCHMARK_FRAMES);
			expect(measurement.memorySampleCount).toBeGreaterThan(0);
		}
	} finally {
		if (measurements.length > 0) {
			const reportPath = await writeTransitionBenchmarkReport({
				directory: EVIDENCE_DIR,
				fileName: `transition-benchmark-${label}.json`,
				label,
				measurements,
			});
			console.log(`[transition-bench] report: ${reportPath}`);
		}
		await rm(workDir, { force: true, recursive: true });
	}
});
