/**
 * Sticker export performance benchmark.
 *
 * Four exports over the same background clip through the production
 * renderer-muxer route: no stickers (control), one static sticker, three
 * overlapping static stickers, one animated direct-GIF runtime sticker, and
 * six independent animated runtime stickers.
 *
 * Alongside timings the run gates what a sticker optimization must not move:
 * frame count and duration, the sticker's own pixels inside its region across
 * the whole timeline, and — critically — that the area outside the sticker is
 * untouched relative to the control export.
 *
 * Run with:
 *   bunx playwright test apps/web/src/test/e2e/sticker-export-benchmark.e2e.ts
 */

import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseDirectGifRuntimeDescriptor } from "../../../../../packages/editor-core/src/sticker-lab/runtime-gif";
import { uploadTestMedia } from "./helpers/e2e-panel-helpers";
import { createTestProject, expect } from "./helpers/electron-helpers";
import { isolatedElectronTest as test } from "./helpers/isolated-electron-fixture";
import {
	frameSelectTime,
	generateColorCycleGif,
	generateRampClip,
	meanColorRect,
} from "./helpers/sequential-decode-evidence";
import { waitForLocalPaths } from "./helpers/sequential-decode-timeline";
import {
	STICKER_BENCHMARK_FPS,
	STICKER_BENCHMARK_FRAMES,
	STICKER_BENCHMARK_HEIGHT,
	STICKER_BENCHMARK_SECONDS,
	STICKER_BENCHMARK_WIDTH,
	type StickerBenchmarkMeasurement,
	type StickerScenarioName,
	buildStickerTimeline,
	generateStickerStill,
	measureStickerScenario,
	restoreTimelineTracks,
	snapshotTimelineTracks,
	writeStickerBenchmarkReport,
} from "./helpers/sticker-export-benchmark";
import {
	decodeFrame,
	probeVideo,
	waitForExportJob,
} from "./helpers/transition-export-evidence";

const EVIDENCE_DIR = path.resolve("output/playwright/sticker-export-benchmark");

const SCENARIOS: readonly StickerScenarioName[] = [
	"no-stickers",
	"single-static",
	"three-overlapping",
	"animated-runtime",
	"six-animated-runtime",
];

/**
 * The first sticker sits at 30/30 with a 26% box, so this rect is inside it.
 * The control rect is far from every placement, so it must stay identical to
 * the no-sticker export.
 */
const STICKER_REGION = { x0: 0.25, x1: 0.33, y0: 0.22, y1: 0.38 } as const;
const OUTSIDE_REGION = { x0: 0.78, x1: 0.96, y0: 0.06, y1: 0.24 } as const;

test("measures sticker export cost against a no-sticker control", async ({
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
	const measurements: StickerBenchmarkMeasurement[] = [];
	const workDir = await mkdtemp(path.join(tmpdir(), "qcut-sticker-bench-"));
	await mkdir(EVIDENCE_DIR, { recursive: true });

	const gifPaths = Array.from({ length: 6 }, (_, index) =>
		path.join(workDir, `sticker-bench-cycle-${index}.gif`)
	);
	const sources = {
		video: path.join(workDir, "sticker-bench-bg.mp4"),
		sticker: path.join(workDir, "sticker-bench-still.png"),
		gifs: gifPaths,
	};
	const outputs: Partial<Record<StickerScenarioName, string>> = {};

	try {
		await generateRampClip({
			filePath: sources.video,
			redBase: 16,
			toneHz: 220,
			seconds: STICKER_BENCHMARK_SECONDS,
		});
		await generateStickerStill({ filePath: sources.sticker });
		const firstGifPath = sources.gifs[0];
		if (!firstGifPath) throw new Error("Missing primary GIF fixture path");
		await generateColorCycleGif({ filePath: firstGifPath });
		await Promise.all(
			sources.gifs.slice(1).map((gifPath) => copyFile(firstGifPath, gifPath))
		);
		const stickerRuntimes = await Promise.all(
			sources.gifs.map(async (gifPath) =>
				parseDirectGifRuntimeDescriptor({
					bytes: new Uint8Array(await readFile(gifPath)),
				})
			)
		);
		for (const stickerRuntime of stickerRuntimes) {
			expect(stickerRuntime.frames.length).toBeGreaterThan(1);
		}

		await page.setViewportSize({ width: 1440, height: 1000 });
		await createTestProject(page, "Sticker Export Benchmark");
		for (const filePath of [sources.video, sources.sticker, ...sources.gifs]) {
			await uploadTestMedia(page, filePath);
		}
		await waitForLocalPaths({
			page,
			videoNames: [path.basename(sources.video)],
		});
		const pristineTracks = await snapshotTimelineTracks({ page });

		// One discarded export absorbs session warm-up (mediabunny import, WebGL
		// and decoder init) that would otherwise be charged to whichever
		// scenario happened to run first.
		await restoreTimelineTracks({ page, snapshot: pristineTracks });
		const warmup = await buildStickerTimeline({
			page,
			scenario: "no-stickers",
			videoName: path.basename(sources.video),
			stickerName: path.basename(sources.sticker),
			gifNames: sources.gifs.map((gifPath) => path.basename(gifPath)),
			stickerRuntimes,
		});
		await measureStickerScenario({
			apiPort,
			electronApp,
			projectId: warmup.projectId,
			scenario: "no-stickers",
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

			const { projectId, duration, stickerCount } = await buildStickerTimeline({
				page,
				scenario,
				videoName: path.basename(sources.video),
				stickerName: path.basename(sources.sticker),
				gifNames: sources.gifs.map((gifPath) => path.basename(gifPath)),
				stickerRuntimes,
			});
			expect(duration).toBeCloseTo(STICKER_BENCHMARK_SECONDS, 2);
			expect(stickerCount).toBe(
				scenario === "no-stickers"
					? 0
					: scenario === "three-overlapping"
						? 3
						: scenario === "six-animated-runtime"
							? 6
							: 1
			);

			const outputPath = keepOutputs
				? path.join(EVIDENCE_DIR, `${label}-${scenario}.mp4`)
				: path.join(workDir, `${scenario}.mp4`);
			outputs[scenario] = outputPath;
			const profilePath = path.join(workDir, `${scenario}-profile.json`);
			const { measurement } = await measureStickerScenario({
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
				`[sticker-bench] ${scenario}: wall=${Math.round(measurement.exportWallMs)}ms ` +
					`p50=${measurement.frameTotalP50Ms.toFixed(2)}ms p95=${measurement.frameTotalP95Ms.toFixed(2)}ms ` +
					`stickerTimeline=${(measurement.stageTotalsMs["sticker-timeline"] ?? 0).toFixed(1)}ms ` +
					`stickerOverlay=${(measurement.stageTotalsMs["sticker-overlay"] ?? 0).toFixed(1)}ms ` +
					`runtimeFrames=${measurement.counters["sticker-runtime-frames"] ?? 0} ` +
					`runtimeCanvases=${measurement.counters["sticker-runtime-canvas-created"] ?? 0} ` +
					`imgHit=${measurement.counters["sticker-image-cache-hit"] ?? 0} ` +
					`imgMiss=${measurement.counters["sticker-image-cache-miss"] ?? 0}`
			);

			// Output contract, identical for every scenario.
			expect(probe.width).toBe(STICKER_BENCHMARK_WIDTH);
			expect(probe.height).toBe(STICKER_BENCHMARK_HEIGHT);
			expect(probe.frameCount).toBe(STICKER_BENCHMARK_FRAMES);
			expect(probe.fps).toBeCloseTo(STICKER_BENCHMARK_FPS, 1);
			expect(probe.durationSeconds).toBeGreaterThan(
				STICKER_BENCHMARK_SECONDS - 0.1
			);
			expect(probe.durationSeconds).toBeLessThan(
				STICKER_BENCHMARK_SECONDS + 0.35
			);
			expect(probe.hasAudio).toBe(true);
		}

		// Pixel gates. The control supplies the reference for the untouched
		// area; every sticker scenario must match it there while differing
		// inside the sticker's own region.
		const controlPath = outputs["no-stickers"];
		if (!controlPath) throw new Error("Control export missing");
		const sampleFrames = [10, 45, 90, 135, 170];
		for (const scenario of SCENARIOS) {
			if (scenario === "no-stickers") continue;
			const scenarioPath = outputs[scenario];
			if (!scenarioPath) throw new Error(`${scenario} export missing`);
			for (const frameIndex of sampleFrames) {
				const timeSeconds = frameSelectTime({
					frameIndex,
					fps: STICKER_BENCHMARK_FPS,
				});
				const [controlFrame, scenarioFrame] = await Promise.all([
					decodeFrame({ filePath: controlPath, timeSeconds }),
					decodeFrame({ filePath: scenarioPath, timeSeconds }),
				]);
				const controlOutside = meanColorRect({
					frame: controlFrame,
					rect: OUTSIDE_REGION,
				});
				const scenarioOutside = meanColorRect({
					frame: scenarioFrame,
					rect: OUTSIDE_REGION,
				});
				// Outside the sticker the picture must be the plain background.
				for (const channel of ["r", "g", "b"] as const) {
					expect(
						Math.abs(scenarioOutside[channel] - controlOutside[channel]),
						`${scenario} frame ${frameIndex} leaked outside the sticker region`
					).toBeLessThan(3);
				}
				// Inside its region the sticker must actually be drawn.
				const controlInside = meanColorRect({
					frame: controlFrame,
					rect: STICKER_REGION,
				});
				const scenarioInside = meanColorRect({
					frame: scenarioFrame,
					rect: STICKER_REGION,
				});
				const insideDelta =
					Math.abs(scenarioInside.r - controlInside.r) +
					Math.abs(scenarioInside.g - controlInside.g) +
					Math.abs(scenarioInside.b - controlInside.b);
				expect(
					insideDelta,
					`${scenario} frame ${frameIndex} did not draw a sticker`
				).toBeGreaterThan(10);
			}
		}

		for (const measurement of measurements) {
			expect(measurement.exportWallMs).toBeGreaterThan(0);
			expect(measurement.frameCount).toBe(STICKER_BENCHMARK_FRAMES);
			expect(measurement.memorySampleCount).toBeGreaterThan(0);
		}
	} finally {
		if (measurements.length > 0) {
			const reportPath = await writeStickerBenchmarkReport({
				directory: EVIDENCE_DIR,
				fileName: `sticker-benchmark-${label}.json`,
				label,
				measurements,
			});
			console.log(`[sticker-bench] report: ${reportPath}`);
		}
		await rm(workDir, { force: true, recursive: true });
	}
});
