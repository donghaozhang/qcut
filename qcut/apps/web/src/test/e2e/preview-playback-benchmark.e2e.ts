/**
 * Preview / playback performance benchmark.
 *
 * Four timeline shapes are played in the real editor and measured with the
 * production diagnostics CLI (`scripts/playback-diagnose.ts`): a single video,
 * a two-layer stack, an image + text overlay, and a three-clip continuous
 * timeline that crosses two cuts while playing.
 *
 * A discarded warm-up playback runs first, so cold-start work (module import,
 * decoder and WebGL init) is not charged to the first measured scenario.
 *
 * Correctness gates prove playback really ran and advanced: the clock must
 * tick, the store's position must advance by roughly the sampled duration, and
 * the sampled frames must not be dominated by drops.
 *
 * Run with:
 *   bunx playwright test apps/web/src/test/e2e/preview-playback-benchmark.e2e.ts
 */

import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { uploadTestMedia } from "./helpers/e2e-panel-helpers";
import { createTestProject, expect } from "./helpers/electron-helpers";
import {
	PREVIEW_PLAY_SECONDS,
	PREVIEW_SCENARIO_SECONDS,
	type PlaybackSummary,
	type PreviewScenarioName,
	buildPreviewTimeline,
	gpuElectronTest as test,
	generatePreviewStill,
	restoreTimelineTracks,
	runPlaybackDiagnose,
	snapshotTimelineTracks,
	summarizePlayback,
	writePreviewBenchmarkReport,
} from "./helpers/preview-playback-benchmark";
import { generateRampClip } from "./helpers/sequential-decode-evidence";
import { waitForLocalPaths } from "./helpers/sequential-decode-timeline";

const EVIDENCE_DIR = path.resolve(
	"output/playwright/preview-playback-benchmark"
);
const REPO_ROOT = path.resolve(".");

const SCENARIOS: readonly PreviewScenarioName[] = [
	"single-video",
	"two-layer",
	"image-text-overlay",
	"continuous-timeline",
];

test("measures editor playback health across preview scenarios", async ({
	page,
	apiPort,
}) => {
	test.setTimeout(30 * 60_000);
	page.on("pageerror", (error) => {
		console.log(`[RENDERER pageerror] ${error.stack ?? error.message}`);
	});

	const label = process.env.QCUT_BENCHMARK_LABEL ?? "current";
	const summaries: PlaybackSummary[] = [];
	const workDir = await mkdtemp(path.join(tmpdir(), "qcut-preview-bench-"));
	await mkdir(EVIDENCE_DIR, { recursive: true });

	const sources = {
		videoA: path.join(workDir, "preview-a.mp4"),
		videoB: path.join(workDir, "preview-b.mp4"),
		image: path.join(workDir, "preview-still.png"),
	};

	try {
		await generateRampClip({
			filePath: sources.videoA,
			redBase: 16,
			toneHz: 220,
			seconds: PREVIEW_SCENARIO_SECONDS + 2,
		});
		await generateRampClip({
			filePath: sources.videoB,
			redBase: 150,
			toneHz: 440,
			seconds: PREVIEW_SCENARIO_SECONDS + 2,
		});
		await generatePreviewStill({ filePath: sources.image });

		await page.setViewportSize({ width: 1440, height: 1000 });
		await createTestProject(page, "Preview Playback Benchmark");
		for (const filePath of Object.values(sources)) {
			await uploadTestMedia(page, filePath);
		}
		await waitForLocalPaths({
			page,
			videoNames: [
				path.basename(sources.videoA),
				path.basename(sources.videoB),
			],
		});
		const pristineTracks = await snapshotTimelineTracks({ page });

		// Discarded warm-up playback: the first play of a session pays for
		// decoder and compositor initialization.
		await restoreTimelineTracks({ page, snapshot: pristineTracks });
		const warmup = await buildPreviewTimeline({
			page,
			scenario: "single-video",
			videoAName: path.basename(sources.videoA),
			videoBName: path.basename(sources.videoB),
			imageName: path.basename(sources.image),
		});
		await runPlaybackDiagnose({
			apiPort,
			projectId: warmup.projectId,
			seconds: 3,
			token: process.env.QCUT_API_TOKEN,
			cwd: REPO_ROOT,
		});

		for (const scenario of SCENARIOS) {
			await restoreTimelineTracks({ page, snapshot: pristineTracks });
			const { projectId, duration } = await buildPreviewTimeline({
				page,
				scenario,
				videoAName: path.basename(sources.videoA),
				videoBName: path.basename(sources.videoB),
				imageName: path.basename(sources.image),
			});
			expect(duration).toBeCloseTo(PREVIEW_SCENARIO_SECONDS, 2);

			const snapshot = await runPlaybackDiagnose({
				apiPort,
				projectId,
				seconds: PREVIEW_PLAY_SECONDS,
				token: process.env.QCUT_API_TOKEN,
				cwd: REPO_ROOT,
			});
			expect(
				snapshot.installed,
				"diagnostics collector was not installed"
			).toBe(true);

			const summary = summarizePlayback({ scenario, snapshot });
			summaries.push(summary);
			console.log(
				`[preview-bench] ${scenario}: clockFps=${summary.clockFps} ` +
					`clockP50=${summary.clockP50Ms}ms clockP95=${summary.clockP95Ms}ms ` +
					`stalls>=50ms=${summary.clockStallsOver50Ms} ` +
					`presentP50=${summary.presentP50Ms}ms presentP95=${summary.presentP95Ms}ms ` +
					`presented=${summary.presentedFrameCount} ` +
					`dropped=${summary.droppedVideoFrames}/${summary.totalVideoFrames} ` +
					`longTasks=${summary.longTaskCount}/${summary.longTaskTotalMs}ms ` +
					`previewRenders=${summary.previewRenderCount} ` +
					`videoTime=${summary.maxVideoCurrentTime.toFixed(2)}s ` +
					`smoothTime=${summary.smoothTimeReason ?? "n/a"} ` +
					`media=${JSON.stringify(summary.mediaEventCounts)}`
			);

			// Playback really ran: the master clock ticked and the store's
			// position advanced by roughly the sampled window.
			expect(summary.clockTicks).toBeGreaterThan(10);
			// Frames kept arriving for most of the window: at a 30 fps source
			// six seconds of playback presents ~180 frames.
			expect(
				summary.presentedFrameCount,
				`${scenario} presented too few frames`
			).toBeGreaterThan(120);
			if (scenario === "continuous-timeline") {
				// Element time restarts at each cut, so advance is proven by the
				// playback crossing into later clips instead.
				expect(
					summary.mediaEventCounts.playing ?? 0,
					"playback did not cross a cut"
				).toBeGreaterThanOrEqual(2);
			} else {
				// The store keeps `currentTime` at the seek origin while playing,
				// so the media element's own position proves playback advanced.
				expect(
					summary.maxVideoCurrentTime,
					"playback did not advance"
				).toBeGreaterThan(PREVIEW_PLAY_SECONDS * 0.5);
				expect(summary.maxVideoCurrentTime).toBeLessThan(
					PREVIEW_SCENARIO_SECONDS + 0.5
				);
			}
			if (summary.totalVideoFrames > 0) {
				expect(
					summary.droppedVideoFrames / summary.totalVideoFrames,
					`${scenario} dropped too many frames`
				).toBeLessThan(0.5);
			}
		}

		const reportPath = await writePreviewBenchmarkReport({
			directory: EVIDENCE_DIR,
			fileName: `preview-benchmark-${label}.json`,
			label,
			summaries,
		});
		console.log(`[preview-bench] report: ${reportPath}`);
	} finally {
		await rm(workDir, { force: true, recursive: true });
	}
});
