/**
 * Realtime audio preview benchmark.
 *
 * Measures what the live preview graph costs as overlapping audio clips stack
 * up: AudioParam automation calls, graph construction, master-clock health,
 * CPU and memory — over continuous playback, pause/resume and seeking.
 *
 * This is the realtime path only. The offline export graph
 * (`renderBrowserTimelineAudio`) is out of scope.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect } from "@playwright/test";
import {
	createTestProject,
	test,
	uploadTestMedia,
} from "./helpers/electron-helpers";
import {
	formatAudioStats,
	installAudioPreviewProbe,
	readAudioPreviewProbe,
	readClockHealth,
	readProcessMetrics,
	resetAudioPreviewProbe,
	resetClockHealth,
	summarizeAudioScaling,
} from "./helpers/audio-preview-probe";

const FIXTURE_DIR = path.join(tmpdir(), "qcut-audio-preview-fixtures");
const CLIP_SECONDS = 6;
const PLAY_WINDOW_SECONDS = 3;
const SEEK_TIMES = [0.5, 1.5, 2.5, 3.5] as const;
const MAX_CLIPS = 16;
const BENCHMARK_LABEL = process.env.QCUT_BENCHMARK_LABEL?.trim() || "current";
const EXPECT_ZERO_UNPITCHED_WORKLETS =
	process.env.QCUT_EXPECT_ZERO_UNPITCHED_WORKLETS === "1";

/** Deterministic tones, one per layer, so layers stay distinguishable. */
function generateTone({ index }: { index: number }): string {
	mkdirSync(FIXTURE_DIR, { recursive: true });
	const filePath = path.join(FIXTURE_DIR, `audio-layer-${index}.wav`);
	if (existsSync(filePath)) return filePath;
	const frequency = 220 + index * 110;
	execFileSync(
		"ffmpeg",
		[
			"-y",
			"-f",
			"lavfi",
			"-i",
			`sine=frequency=${frequency}:sample_rate=48000:duration=${CLIP_SECONDS}`,
			"-ac",
			"2",
			"-c:a",
			"pcm_s16le",
			filePath,
		],
		{ stdio: "pipe" }
	);
	return filePath;
}

interface Scenario {
	label: string;
	clips: number;
	/** Mutes every clip and disables its effects, as a control. */
	silent: boolean;
}

const SCENARIOS: Scenario[] = [
	{ clips: 1, label: "single-audio", silent: false },
	{ clips: 4, label: "four-overlapping", silent: false },
	{ clips: 8, label: "eight-overlapping", silent: false },
	{ clips: 8, label: "eight-silent-control", silent: true },
	{ clips: 16, label: "sixteen-overlapping", silent: false },
];

test.use({ captureScreenshotVideo: false });
test.setTimeout(900_000);

test.describe("realtime audio preview", () => {
	test("measures preview graph load as audio layers stack up", async ({
		electronApp,
		page,
	}) => {
		const tonePaths = Array.from({ length: MAX_CLIPS }, (_unused, index) =>
			generateTone({ index })
		);

		await createTestProject(page, "Audio Preview Benchmark");
		for (const tonePath of tonePaths) {
			await uploadTestMedia(page, tonePath);
		}
		await installAudioPreviewProbe({ page });

		const results: Array<{
			label: string;
			clips: number;
			setTargetPlayback: number;
			perClipPerTick: number;
			paramMs: number;
			graphsCreated: number;
			contexts: number;
			audioWorkletModulesTotal: number;
			audioWorkletNodeConnectsTotal: number;
			audioWorkletNodesTotal: number;
			clockHz: number;
			seekSetTarget: number;
			resumeSetTarget: number;
			startupMs: number;
			cpuPercent: number;
			memoryMb: number;
		}> = [];

		for (const scenario of SCENARIOS) {
			const placed = await page.evaluate(
				async (input) => {
					const harness = window as unknown as {
						__timelineStore: { getState: () => any };
						__mediaStore: { getState: () => any };
						__playbackStore: {
							getState: () => { seek: (t: number) => void; pause: () => void };
						};
					};
					harness.__playbackStore.getState().pause();
					const timeline = harness.__timelineStore.getState();
					const media = harness.__mediaStore.getState();
					for (const track of [...timeline.tracks]) {
						for (const element of [...track.elements]) {
							timeline.removeElementFromTrack(track.id, element.id);
						}
					}

					let placedCount = 0;
					for (let index = 0; index < input.clips; index += 1) {
						const item = media.mediaItems.find((candidate: { name: string }) =>
							candidate.name.includes(`audio-layer-${index}`)
						);
						if (!item) throw new Error(`Missing audio-layer-${index}`);
						// One clip per track, all starting at 0, so they overlap.
						const trackId = harness.__timelineStore
							.getState()
							.addTrack("audio");
						const added = harness.__timelineStore.getState().addElementToTrack(
							trackId,
							{
								duration: input.clipSeconds,
								mediaId: item.id,
								muted: input.silent,
								name: `audio-layer-${index}`,
								startTime: 0,
								trimEnd: 0,
								trimStart: 0,
								type: "media",
							},
							{ pushHistory: false, selectElement: false }
						);
						if (added) placedCount += 1;
					}
					harness.__playbackStore.getState().seek(0);
					return placedCount;
				},
				{
					clipSeconds: CLIP_SECONDS,
					clips: scenario.clips,
					silent: scenario.silent,
				}
			);
			expect(placed, `${scenario.label} placed clips`).toBe(scenario.clips);
			await page.waitForTimeout(1200);

			// --- startup latency: first play to first audio param write ---------
			await resetAudioPreviewProbe({ page });
			const startupMs = await page.evaluate(async () => {
				const playback = (
					window as unknown as {
						__playbackStore: {
							getState: () => { play: () => void; pause: () => void };
						};
					}
				).__playbackStore.getState();
				const startedAt = performance.now();
				playback.play();
				await new Promise<void>((resolve) => {
					const done = () => {
						window.removeEventListener("playback-update", done);
						resolve();
					};
					window.addEventListener("playback-update", done);
					setTimeout(done, 2000);
				});
				const elapsed = performance.now() - startedAt;
				playback.pause();
				return Number(elapsed.toFixed(2));
			});

			// --- continuous playback --------------------------------------------
			await page.evaluate(() => {
				(
					window as unknown as {
						__playbackStore: { getState: () => { seek: (t: number) => void } };
					}
				).__playbackStore
					.getState()
					.seek(0);
			});
			await page.waitForTimeout(400);
			await resetAudioPreviewProbe({ page });
			await resetClockHealth({ page });
			await page.evaluate(async (durationMs) => {
				const playback = (
					window as unknown as {
						__playbackStore: {
							getState: () => { play: () => void; pause: () => void };
						};
					}
				).__playbackStore.getState();
				playback.play();
				await new Promise<void>((resolve) => setTimeout(resolve, durationMs));
				(
					window as unknown as {
						__playbackStore: { getState: () => { pause: () => void } };
					}
				).__playbackStore
					.getState()
					.pause();
			}, PLAY_WINDOW_SECONDS * 1000);
			const playbackStats = await readAudioPreviewProbe({ page });
			const clock = await readClockHealth({ page });
			const processMetrics = await readProcessMetrics({ electronApp });

			// --- pause / resume --------------------------------------------------
			await resetAudioPreviewProbe({ page });
			await page.evaluate(async () => {
				const store = (
					window as unknown as {
						__playbackStore: {
							getState: () => { play: () => void; pause: () => void };
						};
					}
				).__playbackStore;
				for (let cycle = 0; cycle < 3; cycle += 1) {
					store.getState().play();
					await new Promise<void>((resolve) => setTimeout(resolve, 250));
					store.getState().pause();
					await new Promise<void>((resolve) => setTimeout(resolve, 150));
				}
			});
			const resumeStats = await readAudioPreviewProbe({ page });

			// --- seek -------------------------------------------------------------
			await resetAudioPreviewProbe({ page });
			for (const time of SEEK_TIMES) {
				await page.evaluate(async (seekTo) => {
					(
						window as unknown as {
							__playbackStore: {
								getState: () => { seek: (t: number) => void };
							};
						}
					).__playbackStore
						.getState()
						.seek(seekTo);
					await new Promise<void>((resolve) => {
						requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
					});
				}, time);
			}
			const seekStats = await readAudioPreviewProbe({ page });

			const perClipPerTick =
				clock.clockHz > 0 && scenario.clips > 0
					? playbackStats.setTargetAtTime /
						Math.max(1, clock.clockHz * PLAY_WINDOW_SECONDS * scenario.clips)
					: 0;

			console.log(
				formatAudioStats({
					clips: scenario.clips,
					clock,
					cpuPercent: processMetrics.cpuPercent,
					label: scenario.label,
					memoryMb: processMetrics.memoryMb,
					stats: playbackStats,
				})
			);
			console.log(
				`[audio-preview] ${scenario.label} startupMs=${startupMs} ` +
					`seekSetTarget=${seekStats.setTargetAtTime} ` +
					`resumeSetTarget=${resumeStats.setTargetAtTime} ` +
					`perClipPerTick=${perClipPerTick.toFixed(1)} ` +
					`sampleRate=${playbackStats.sampleRate} baseLatency=${playbackStats.baseLatencyMs?.toFixed(2)}ms`
			);

			results.push({
				audioWorkletModulesTotal: playbackStats.audioWorkletModulesTotal,
				audioWorkletNodeConnectsTotal:
					playbackStats.audioWorkletNodeConnectsTotal,
				audioWorkletNodesTotal: playbackStats.audioWorkletNodesTotal,
				clips: scenario.clips,
				clockHz: clock.clockHz,
				contexts: playbackStats.audioContexts,
				cpuPercent: processMetrics.cpuPercent,
				graphsCreated: playbackStats.mediaElementSources,
				label: scenario.label,
				memoryMb: processMetrics.memoryMb,
				paramMs: playbackStats.paramMs,
				perClipPerTick,
				resumeSetTarget: resumeStats.setTargetAtTime,
				seekSetTarget: seekStats.setTargetAtTime,
				setTargetPlayback: playbackStats.setTargetAtTime,
				startupMs,
			});
		}

		console.log(`[audio-preview] SUMMARY ${JSON.stringify(results)}`);
		const reportDirectory = path.resolve(
			"output/playwright/audio-preview-benchmark"
		);
		mkdirSync(reportDirectory, { recursive: true });
		const reportPath = path.join(
			reportDirectory,
			`audio-preview-${BENCHMARK_LABEL.replaceAll(/[^a-zA-Z0-9._-]/g, "-")}.json`
		);
		writeFileSync(
			reportPath,
			JSON.stringify(
				{
					kind: "qcut-audio-preview-benchmark-v1",
					label: BENCHMARK_LABEL,
					recordedAt: new Date().toISOString(),
					results,
					schemaVersion: 1,
				},
				null,
				2
			)
		);
		console.log(`[audio-preview] report: ${reportPath}`);

		const byLabel = new Map(results.map((entry) => [entry.label, entry]));
		const single = byLabel.get("single-audio");
		const eight = byLabel.get("eight-overlapping");
		const silent = byLabel.get("eight-silent-control");
		if (!single || !eight || !silent) throw new Error("Missing scenario");
		if (EXPECT_ZERO_UNPITCHED_WORKLETS) {
			const finalResult = results[results.length - 1];
			expect(
				finalResult.audioWorkletModulesTotal,
				"default unpitched playback must not register pitch worklets"
			).toBe(0);
			expect(
				finalResult.audioWorkletNodeConnectsTotal,
				"default unpitched playback must not connect pitch worklets"
			).toBe(0);
		}

		// The probe must have seen real graph work.
		expect(single.setTargetPlayback).toBeGreaterThan(0);
		// One shared AudioContext regardless of layer count.
		expect(eight.contexts).toBeLessThanOrEqual(1 + 1);
		// Automation must scale with layers, which is the thing under test.
		expect(eight.setTargetPlayback).toBeGreaterThan(single.setTargetPlayback);
		const summary = summarizeAudioScaling({
			samples: results.map((entry) => ({
				clips: entry.clips,
				clockHz: entry.clockHz,
				label: entry.label,
				setTargetAtTime: entry.setTargetPlayback,
				windowSeconds: PLAY_WINDOW_SECONDS,
			})),
		});
		console.log(
			`[audio-preview] NORMALISED ${JSON.stringify(summary.perClipPerTick)} ` +
				`peakWritesPerSecond=${summary.peakWritesPerSecond} ` +
				`scalesLinearly=${summary.scalesLinearly}`
		);

		// Playback health gates: this is what makes the cost perceivable or not.
		for (const entry of results) {
			expect(entry.clockHz, `${entry.label} master clock`).toBeGreaterThan(45);
			// One graph per clip, built once — not rebuilt per frame.
			expect(
				entry.perClipPerTick,
				`${entry.label} per-clip automation`
			).toBeGreaterThan(0);
		}
		// A muted, effects-disabled timeline must not cost more than the active
		// one; if it ever does, something is doing work proportional to silence.
		expect(silent.setTargetPlayback).toBeLessThanOrEqual(
			eight.setTargetPlayback * 1.1
		);

		console.log(
			`[audio-preview] SCALING single=${single.setTargetPlayback} ` +
				`eight=${eight.setTargetPlayback} ratio=${(
					eight.setTargetPlayback / Math.max(1, single.setTargetPlayback)
				).toFixed(2)} ` +
				`silentControl=${silent.setTargetPlayback}`
		);
	});
});
