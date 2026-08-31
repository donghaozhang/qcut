/**
 * High-frame-rate preview benchmark.
 *
 * Compares real playback of a 30 fps control, a single 1080p60 layer, and two
 * stacked 1080p60 layers, over both continuous playback and seeking.
 *
 * Runs with the GPU ENABLED. The shared E2E fixture forces
 * ELECTRON_DISABLE_GPU=1, which would put video decode and compositing on a
 * software path and invalidate any conclusion about 60 fps presentation, so
 * this spec launches its own Electron instance.
 *
 * The central question is whether the rAF master clock dropping toward ~30 Hz
 * on the two-layer timeline actually reduces how many 60 fps source frames
 * reach the screen. Presented-frame counts come from the app's own
 * requestVideoFrameCallback reporting, so clock rate and presentation rate are
 * measured independently rather than inferred from one another.
 */

import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { expect } from "@playwright/test";
import { _electron as electron } from "playwright";
import {
	createTestProject,
	test as qcutTest,
	uploadTestMedia,
} from "./helpers/electron-helpers";
import {
	capturePreviewFrameHashes,
	formatPlaybackMetrics,
	generatePreviewClip,
	installClockLoad,
	measurePlaybackWindow,
	removeClockLoad,
	type PlaybackMetrics,
	snapshotDiagnostics,
} from "./helpers/high-fps-preview-benchmark";

const FIXTURE_DIR = path.join(tmpdir(), "qcut-high-fps-fixtures");
const CLIP_SECONDS = 6;
const PLAY_WINDOW_SECONDS = 4;
const SEEK_TIMES = [0.5, 1.5, 2.5, 3.5, 4.5] as const;

/** GPU-enabled Electron, unlike the shared fixture. */
const test = qcutTest.extend({
	// biome-ignore lint/correctness/noEmptyPattern: Playwright fixtures require empty destructuring
	electronApp: async ({}, use) => {
		const userDataDirectory = await mkdtemp(
			path.join(tmpdir(), "qcut-high-fps-e2e-")
		);
		const electronApp = await electron.launch({
			args: ["dist/electron/main.js", `--user-data-dir=${userDataDirectory}`],
			env: {
				...process.env,
				NODE_ENV: "test",
				// Deliberately no ELECTRON_DISABLE_GPU: this benchmark is about the
				// GPU presentation path.
			},
		});
		try {
			await use(electronApp);
		} finally {
			await electronApp.close();
			await rm(userDataDirectory, { force: true, recursive: true });
		}
	},
});

test.use({ captureScreenshotVideo: false });
test.setTimeout(900_000);

interface ScenarioResult {
	playback: PlaybackMetrics;
	seek: PlaybackMetrics | null;
	positions: number[];
}

test.describe("high fps preview", () => {
	test("compares 30fps, single 1080p60 and dual 1080p60 playback", async ({
		electronApp,
		page,
	}) => {
		const clip30 = generatePreviewClip({
			directory: FIXTURE_DIR,
			spec: {
				fps: 30,
				height: 1080,
				seconds: CLIP_SECONDS,
				variant: "primary",
				width: 1920,
			},
		});
		const clip60 = generatePreviewClip({
			directory: FIXTURE_DIR,
			spec: {
				fps: 60,
				height: 1080,
				seconds: CLIP_SECONDS,
				variant: "primary",
				width: 1920,
			},
		});
		const clip60b = generatePreviewClip({
			directory: FIXTURE_DIR,
			spec: {
				fps: 60,
				height: 1080,
				seconds: CLIP_SECONDS,
				variant: "secondary",
				width: 1920,
			},
		});

		await electronApp.evaluate(({ BrowserWindow }) => {
			BrowserWindow.getAllWindows()[0]?.setSize(1600, 1000);
		});
		await createTestProject(page, "High FPS Preview");
		await uploadTestMedia(page, clip30);
		await uploadTestMedia(page, clip60);
		await uploadTestMedia(page, clip60b);

		// Confirm the GPU path is actually active; a software fallback would make
		// every presentation number meaningless.
		const gpuInfo = await electronApp.evaluate(async ({ app }) => {
			const status = app.getGPUFeatureStatus();
			return {
				videoDecode: status.video_decode ?? "unknown",
				webgl: status.webgl ?? "unknown",
			};
		});
		console.log(
			`[hifps] gpu videoDecode=${gpuInfo.videoDecode} webgl=${gpuInfo.webgl}`
		);

		const results: Record<string, ScenarioResult> = {};

		const buildTimeline = async ({
			clips,
		}: {
			clips: string[];
		}): Promise<number> => {
			return await page.evaluate(async (fileNames) => {
				const harness = window as unknown as {
					__timelineStore: { getState: () => any };
					__mediaStore: { getState: () => any };
					__playbackStore: { getState: () => { seek: (t: number) => void } };
				};
				const timeline = harness.__timelineStore.getState();
				const media = harness.__mediaStore.getState();

				for (const track of [...timeline.tracks]) {
					for (const element of [...track.elements]) {
						timeline.removeElementFromTrack(track.id, element.id);
					}
				}

				let placed = 0;
				for (const [index, fileName] of fileNames.entries()) {
					const item = media.mediaItems.find((candidate: { name: string }) =>
						candidate.name.includes(fileName)
					);
					if (!item) throw new Error(`Media not found: ${fileName}`);
					const state = harness.__timelineStore.getState();
					const trackId =
						index === 0
							? (state.tracks.find(
									(track: { isMain?: boolean; type: string }) =>
										track.isMain || track.type === "media"
								)?.id ?? state.addTrack("media"))
							: state.insertTrackAt("media", 0);
					const added = harness.__timelineStore.getState().addElementToTrack(
						trackId,
						{
							duration: item.duration ?? 6,
							mediaId: item.id,
							name: `layer-${index}`,
							startTime: 0,
							trimEnd: 0,
							trimStart: 0,
							type: "media",
						},
						{ pushHistory: false, selectElement: false }
					);
					if (added) placed += 1;
				}
				harness.__playbackStore.getState().seek(0);
				return placed;
			}, clips);
		};

		const runScenario = async ({
			scenario,
			clips,
		}: {
			scenario: string;
			clips: string[];
		}): Promise<void> => {
			const placed = await buildTimeline({ clips });
			expect(placed).toBe(clips.length);
			await page.waitForTimeout(1200);

			const playback = await measurePlaybackWindow({
				electronApp,
				page,
				scenario,
				windowSeconds: PLAY_WINDOW_SECONDS,
			});
			console.log(formatPlaybackMetrics({ metrics: playback }));
			console.log(
				`[hifps] ${scenario} qualityByVideo=${JSON.stringify(playback.presentedFpsByQuality)} rvfcByVideo=${JSON.stringify(playback.presentedFpsByVideo)} saturated=${playback.presentedRecordsSaturated}`
			);

			// Seek workload: fixed points, each settled, then the resulting
			// playback position recorded.
			const positions: number[] = [];
			for (const time of SEEK_TIMES) {
				const position = await page.evaluate(async (seekTo) => {
					const playbackStore = (
						window as unknown as {
							__playbackStore: {
								getState: () => {
									seek: (t: number) => void;
									currentTime: number;
								};
							};
						}
					).__playbackStore;
					playbackStore.getState().seek(seekTo);
					await new Promise<void>((resolve) => {
						requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
					});
					return playbackStore.getState().currentTime;
				}, time);
				positions.push(Number(position.toFixed(3)));
			}
			console.log(
				`[hifps] ${scenario} seekPositions=${JSON.stringify(positions)}`
			);

			results[scenario] = { playback, positions, seek: null };
		};

		await runScenario({
			clips: ["preview-1920x1080p30-primary"],
			scenario: "control-1080p30",
		});
		await runScenario({
			clips: ["preview-1920x1080p60-primary"],
			scenario: "single-1080p60",
		});
		await runScenario({
			clips: ["preview-1920x1080p60-primary", "preview-1920x1080p60-secondary"],
			scenario: "dual-1080p60",
		});

		// --- Causal test: force the master clock down and watch presentation ---
		// The two-layer timeline did not slow the clock on its own, so drive the
		// clock down deliberately and see whether 60fps presentation follows it.
		await buildTimeline({
			clips: ["preview-1920x1080p60-primary", "preview-1920x1080p60-secondary"],
		});
		await page.waitForTimeout(1200);
		await installClockLoad({ busyMs: 24, page });
		const loaded = await measurePlaybackWindow({
			electronApp,
			page,
			scenario: "dual-1080p60-slowclock",
			windowSeconds: PLAY_WINDOW_SECONDS,
		});
		await removeClockLoad({ page });
		console.log(formatPlaybackMetrics({ metrics: loaded }));
		console.log(
			`[hifps] dual-1080p60-slowclock qualityByVideo=${JSON.stringify(loaded.presentedFpsByQuality)}`
		);
		results["dual-1080p60-slowclock"] = {
			playback: loaded,
			positions: [],
			seek: null,
		};

		// --- The question this benchmark exists to answer ---------------------
		const single = results["single-1080p60"].playback;
		const dual = results["dual-1080p60"].playback;
		const control = results["control-1080p30"].playback;
		const slow = results["dual-1080p60-slowclock"].playback;
		console.log(
			`[hifps] CAUSAL forcing clock ${dual.clockHz.toFixed(1)}Hz -> ${slow.clockHz.toFixed(1)}Hz ` +
				`changed presented ${dual.bestQualityFps.toFixed(1)}fps -> ${slow.bestQualityFps.toFixed(1)}fps ` +
				`(dropped ${dual.droppedFrames} -> ${slow.droppedFrames})`
		);
		console.log(
			`[hifps] VERDICT clock ${single.clockHz.toFixed(1)}Hz -> ${dual.clockHz.toFixed(1)}Hz | ` +
				`presented(quality) ${single.bestQualityFps.toFixed(1)}fps -> ${dual.bestQualityFps.toFixed(1)}fps | ` +
				`dropped ${single.droppedFrames} -> ${dual.droppedFrames} | ` +
				`control30 clock=${control.clockHz.toFixed(1)}Hz presented=${control.bestPresentedFps.toFixed(1)}fps`
		);

		// Sanity gates: the harness must have actually played real media.
		for (const [scenario, result] of Object.entries(results)) {
			expect(result.playback.windowSeconds).toBeGreaterThan(1);
			expect(
				result.playback.bestQualityFps,
				`${scenario} presented no frames`
			).toBeGreaterThan(0);
			// Seeks must land where they were asked to.
			for (const [index, position] of result.positions.entries()) {
				expect(position).toBeCloseTo(SEEK_TIMES[index], 1);
			}
		}

		// Frame-identity gate on the dual-layer timeline: fixed times must show
		// distinct frames, proving the preview is showing the seeked frame rather
		// than a stale or blank surface.
		const frameHashes = await capturePreviewFrameHashes({
			page,
			times: SEEK_TIMES,
		});
		console.log(`[hifps] FRAME_HASHES=${JSON.stringify(frameHashes)}`);
		expect(new Set(frameHashes.map((entry) => entry.hash)).size).toBe(
			SEEK_TIMES.length
		);

		// Playback health gates.
		for (const scenario of [
			"control-1080p30",
			"single-1080p60",
			"dual-1080p60",
		]) {
			const metrics = results[scenario].playback;
			// The master clock must stay near display rate without synthetic load.
			expect(metrics.clockHz, `${scenario} clock rate`).toBeGreaterThan(45);
			// Drops must stay negligible relative to frames presented.
			expect(
				metrics.droppedFrames / Math.max(1, metrics.totalFrames),
				`${scenario} drop ratio`
			).toBeLessThan(0.02);
		}
		for (const scenario of ["single-1080p60", "dual-1080p60"]) {
			expect(
				results[scenario].playback.bestQualityFps,
				`${scenario} presented fps`
			).toBeGreaterThan(55);
		}

		// The causal result: a forced-slow master clock must not drag 60fps
		// presentation down with it.
		expect(slow.clockHz).toBeLessThan(45);
		expect(slow.bestQualityFps).toBeGreaterThan(55);

		const snapshot = await snapshotDiagnostics({ page });
		expect(snapshot.installed).toBe(true);
	});
});
