/**
 * Visual-effects export performance benchmark.
 *
 * Four exports over the same background clip through the production
 * renderer-muxer route: no effects (control), one simple CSS-filter effect,
 * three stacked effects, and one animated wave distortion that routes into the
 * advanced per-pixel path.
 *
 * The counters answer the question this benchmark exists for: whether the
 * effect path allocates a canvas per frame. `effect-frame-canvas-created` and
 * `effect-temp-canvas-created` are recorded next to `effect-region-frames`, so
 * an allocation-per-frame shows up as the two counts matching.
 *
 * Run with:
 *   bunx playwright test apps/web/src/test/e2e/effects-export-benchmark.e2e.ts
 */

import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { uploadTestMedia } from "./helpers/e2e-panel-helpers";
import {
	EFFECTS_BENCHMARK_FPS,
	EFFECTS_BENCHMARK_FRAMES,
	EFFECTS_BENCHMARK_HEIGHT,
	EFFECTS_BENCHMARK_SECONDS,
	EFFECTS_BENCHMARK_WIDTH,
	type EffectsBenchmarkMeasurement,
	type EffectsScenarioName,
	buildEffectsTimeline,
	generateEffectsBackground,
	meanAbsolutePixelDiff,
	measureEffectsScenario,
	restoreTimelineTracks,
	snapshotTimelineTracks,
	writeEffectsBenchmarkReport,
} from "./helpers/effects-export-benchmark";
import { createTestProject, expect } from "./helpers/electron-helpers";
import { isolatedElectronTest as test } from "./helpers/isolated-electron-fixture";
import { frameSelectTime } from "./helpers/sequential-decode-evidence";
import { waitForLocalPaths } from "./helpers/sequential-decode-timeline";
import {
	decodeFrame,
	probeVideo,
	waitForExportJob,
} from "./helpers/transition-export-evidence";

const EVIDENCE_DIR = path.resolve("output/playwright/effects-export-benchmark");

const SCENARIOS: readonly EffectsScenarioName[] = [
	"no-effects",
	"single-simple",
	"three-stacked",
	"animated-distortion",
];

/** Region effects cover the whole frame, so the probe is a central patch. */
const FRAME_REGION = { x0: 0.3, x1: 0.7, y0: 0.3, y1: 0.7 } as const;

test("measures visual effect export cost against a no-effect control", async ({
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
	const measurements: EffectsBenchmarkMeasurement[] = [];
	const workDir = await mkdtemp(path.join(tmpdir(), "qcut-effects-bench-"));
	await mkdir(EVIDENCE_DIR, { recursive: true });
	const source = path.join(workDir, "effects-bench-bg.mp4");
	const outputs: Partial<Record<EffectsScenarioName, string>> = {};

	try {
		await generateEffectsBackground({
			filePath: source,
			seconds: EFFECTS_BENCHMARK_SECONDS,
		});

		await page.setViewportSize({ width: 1440, height: 1000 });
		await createTestProject(page, "Effects Export Benchmark");
		await uploadTestMedia(page, source);
		await waitForLocalPaths({ page, videoNames: [path.basename(source)] });
		const pristineTracks = await snapshotTimelineTracks({ page });

		// A discarded export absorbs session warm-up that would otherwise be
		// charged to whichever scenario ran first.
		await restoreTimelineTracks({ page, snapshot: pristineTracks });
		const warmup = await buildEffectsTimeline({
			page,
			scenario: "no-effects",
			videoName: path.basename(source),
		});
		await measureEffectsScenario({
			apiPort,
			electronApp,
			projectId: warmup.projectId,
			scenario: "no-effects",
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

			const { projectId, duration, effectCount } = await buildEffectsTimeline({
				page,
				scenario,
				videoName: path.basename(source),
			});
			expect(duration).toBeCloseTo(EFFECTS_BENCHMARK_SECONDS, 2);
			expect(effectCount).toBe(
				scenario === "no-effects" ? 0 : scenario === "three-stacked" ? 3 : 1
			);

			const outputPath = keepOutputs
				? path.join(EVIDENCE_DIR, `${label}-${scenario}.mp4`)
				: path.join(workDir, `${scenario}.mp4`);
			outputs[scenario] = outputPath;
			const profilePath = path.join(workDir, `${scenario}-profile.json`);
			const { measurement } = await measureEffectsScenario({
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
			const regionFrames = measurement.counters["effect-region-frames"] ?? 0;
			const frameCanvases =
				measurement.counters["effect-frame-canvas-created"] ?? 0;
			const tempCanvases =
				measurement.counters["effect-temp-canvas-created"] ?? 0;
			console.log(
				`[effects-bench] ${scenario}: wall=${Math.round(measurement.exportWallMs)}ms ` +
					`p50=${measurement.frameTotalP50Ms.toFixed(2)}ms p95=${measurement.frameTotalP95Ms.toFixed(2)}ms ` +
					`effectRegion=${(measurement.stageTotalsMs["effect-region"] ?? 0).toFixed(1)}ms ` +
					`effectAdvanced=${(measurement.stageTotalsMs["effect-advanced"] ?? 0).toFixed(1)}ms ` +
					`regionFrames=${regionFrames} frameCanvases=${frameCanvases} tempCanvases=${tempCanvases}`
			);

			// Output contract, identical for every scenario.
			expect(probe.width).toBe(EFFECTS_BENCHMARK_WIDTH);
			expect(probe.height).toBe(EFFECTS_BENCHMARK_HEIGHT);
			expect(probe.frameCount).toBe(EFFECTS_BENCHMARK_FRAMES);
			expect(probe.fps).toBeCloseTo(EFFECTS_BENCHMARK_FPS, 1);
			expect(probe.durationSeconds).toBeGreaterThan(
				EFFECTS_BENCHMARK_SECONDS - 0.1
			);
			expect(probe.durationSeconds).toBeLessThan(
				EFFECTS_BENCHMARK_SECONDS + 0.35
			);
			expect(probe.hasAudio).toBe(true);

			if (scenario === "no-effects") {
				expect(regionFrames).toBe(0);
				continue;
			}
			// Effects must run on every frame of their window.
			expect(regionFrames).toBeGreaterThanOrEqual(EFFECTS_BENCHMARK_FRAMES);
		}

		// Pixel gate: every effect scenario must visibly change the picture
		// relative to the control, on frames spread across the timeline.
		const controlPath = outputs["no-effects"];
		if (!controlPath) throw new Error("Control export missing");
		for (const scenario of SCENARIOS) {
			if (scenario === "no-effects") continue;
			const scenarioPath = outputs[scenario];
			if (!scenarioPath) throw new Error(`${scenario} export missing`);
			for (const frameIndex of [15, 75, 135, 170]) {
				const timeSeconds = frameSelectTime({
					frameIndex,
					fps: EFFECTS_BENCHMARK_FPS,
				});
				const [controlFrame, scenarioFrame] = await Promise.all([
					decodeFrame({ filePath: controlPath, timeSeconds }),
					decodeFrame({ filePath: scenarioPath, timeSeconds }),
				]);
				// Per-pixel, not per-average: a wave distortion shifts rows
				// sideways, which leaves a region's mean colour almost intact.
				const delta = meanAbsolutePixelDiff({
					left: controlFrame,
					right: scenarioFrame,
					rect: FRAME_REGION,
				});
				expect(
					delta,
					`${scenario} frame ${frameIndex} did not change the picture`
				).toBeGreaterThan(1);
			}
		}

		for (const measurement of measurements) {
			expect(measurement.exportWallMs).toBeGreaterThan(0);
			expect(measurement.frameCount).toBe(EFFECTS_BENCHMARK_FRAMES);
			expect(measurement.memorySampleCount).toBeGreaterThan(0);
		}
	} finally {
		if (measurements.length > 0) {
			const reportPath = await writeEffectsBenchmarkReport({
				directory: EVIDENCE_DIR,
				fileName: `effects-benchmark-${label}.json`,
				label,
				measurements,
			});
			console.log(`[effects-bench] report: ${reportPath}`);
		}
		await rm(workDir, { force: true, recursive: true });
	}
});
