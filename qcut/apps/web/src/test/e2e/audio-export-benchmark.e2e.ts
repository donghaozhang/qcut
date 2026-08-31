/**
 * Audio export performance benchmark.
 *
 * Four timelines isolate the cost of the audio pass — no audio, one sound
 * effect, several stacked effects, and effects mixed under a video's own
 * soundtrack — exported through the production renderer-muxer route with the
 * profiler armed. The report carries wall time, the audio sub-stage breakdown
 * (read / decode / schedule / offline render), decode byte counters and peak
 * process memory, written to output/playwright/audio-export-benchmark/.
 *
 * Every scenario also asserts what an audio optimization must not change:
 * sample rate, channel count, stream duration, integrated loudness, and the
 * time position of each sound effect.
 *
 * Run with:
 *   bunx playwright test apps/web/src/test/e2e/audio-export-benchmark.e2e.ts
 */

import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	AUDIO_BENCHMARK_FPS,
	AUDIO_BENCHMARK_FRAMES,
	AUDIO_BENCHMARK_SAMPLE_RATE,
	AUDIO_BENCHMARK_SECONDS,
	type AudioBenchmarkMeasurement,
	type AudioScenarioName,
	buildAudioScenarioTimeline,
	generateSilentVideo,
	generateSoundEffect,
	measureAudioScenario,
	restoreTimelineTracks,
	snapshotTimelineTracks,
	writeAudioBenchmarkReport,
} from "./helpers/audio-export-benchmark";
import {
	decodeAudioSamples,
	measureLoudness,
	probeAudioStream,
	windowedRms,
} from "./helpers/audio-fidelity-evidence";
import { uploadTestMedia } from "./helpers/e2e-panel-helpers";
import { createTestProject, expect } from "./helpers/electron-helpers";
import { isolatedElectronTest as test } from "./helpers/isolated-electron-fixture";
import { generateRampClip } from "./helpers/sequential-decode-evidence";
import { waitForLocalPaths } from "./helpers/sequential-decode-timeline";
import {
	probeVideo,
	waitForExportJob,
} from "./helpers/transition-export-evidence";

const EVIDENCE_DIR = path.resolve("output/playwright/audio-export-benchmark");

const SCENARIOS: readonly AudioScenarioName[] = [
	"silent-video",
	"single-effect",
	"stacked-effects",
	"video-audio-plus-effects",
];

/** Distinct tones so each effect is identifiable in the rendered mix. */
const EFFECT_TONES = [523, 659, 784, 1046] as const;

test("measures audio export cost across silent, single, stacked and mixed timelines", async ({
	page,
	electronApp,
	apiPort,
}) => {
	test.setTimeout(20 * 60_000);
	page.on("pageerror", (error) => {
		console.log(`[RENDERER pageerror] ${error.stack ?? error.message}`);
	});

	const label = process.env.QCUT_BENCHMARK_LABEL ?? "current";
	// Preserved outputs let two labelled runs be compared sample by sample.
	const keepOutputs = process.env.QCUT_BENCH_KEEP_OUTPUT === "1";
	const measurements: AudioBenchmarkMeasurement[] = [];
	const workDir = await mkdtemp(path.join(tmpdir(), "qcut-audio-bench-"));
	await mkdir(EVIDENCE_DIR, { recursive: true });

	const sources = {
		videoWithAudio: path.join(workDir, "bench-video-audio.mp4"),
		videoSilent: path.join(workDir, "bench-video-silent.mp4"),
		effects: EFFECT_TONES.map((tone) =>
			path.join(workDir, `bench-effect-${tone}.wav`)
		),
	};

	try {
		await generateRampClip({
			filePath: sources.videoWithAudio,
			redBase: 16,
			toneHz: 220,
			seconds: AUDIO_BENCHMARK_SECONDS + 2,
		});
		await generateSilentVideo({
			filePath: sources.videoSilent,
			seconds: AUDIO_BENCHMARK_SECONDS + 2,
		});
		for (const [index, tone] of EFFECT_TONES.entries()) {
			await generateSoundEffect({
				filePath: sources.effects[index],
				toneHz: tone,
			});
		}

		await page.setViewportSize({ width: 1440, height: 1000 });
		await createTestProject(page, "Audio Export Benchmark");
		for (const filePath of [
			sources.videoWithAudio,
			sources.videoSilent,
			...sources.effects,
		]) {
			await uploadTestMedia(page, filePath);
		}
		await waitForLocalPaths({
			page,
			videoNames: [
				path.basename(sources.videoWithAudio),
				path.basename(sources.videoSilent),
			],
		});
		const pristineTracks = await snapshotTimelineTracks({ page });

		for (const scenario of SCENARIOS) {
			await restoreTimelineTracks({ page, snapshot: pristineTracks });

			const { projectId, duration } = await buildAudioScenarioTimeline({
				page,
				scenario,
				media: {
					videoWithAudio: path.basename(sources.videoWithAudio),
					videoSilent: path.basename(sources.videoSilent),
					effects: sources.effects.map((filePath) => path.basename(filePath)),
				},
			});
			expect(duration).toBeCloseTo(AUDIO_BENCHMARK_SECONDS, 2);

			const outputPath = keepOutputs
				? path.join(EVIDENCE_DIR, `${label}-${scenario}.mp4`)
				: path.join(workDir, `${scenario}.mp4`);
			const profilePath = path.join(workDir, `${scenario}-profile.json`);
			const { measurement } = await measureAudioScenario({
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
				`[audio-bench] ${scenario}: exportWall=${Math.round(measurement.exportWallMs)}ms ` +
					`audio-render=${Math.round(measurement.audioRenderMs)}ms ` +
					Object.entries(measurement.audioStageMs)
						.filter(([stage]) => stage !== "audio-render")
						.map(([stage, ms]) => `${stage}=${Math.round(ms)}ms`)
						.join(" ")
			);

			expect(existsSync(outputPath)).toBe(true);
			const probe = await probeVideo({ filePath: outputPath });
			expect(probe.frameCount).toBe(AUDIO_BENCHMARK_FRAMES);

			if (scenario === "silent-video") {
				// Nothing audible on the timeline: the export must not invent a
				// silent track. The audio pass still runs, but bails out without
				// producing a buffer, so it must stay negligible.
				expect(probe.hasAudio).toBe(false);
				expect(measurement.audioRenderMs).toBeLessThan(100);
				continue;
			}

			// Fidelity gates: an audio optimization must move none of these.
			expect(probe.hasAudio).toBe(true);
			const facts = await probeAudioStream({ filePath: outputPath });
			expect(facts.sampleRate).toBe(AUDIO_BENCHMARK_SAMPLE_RATE);
			expect(facts.channels).toBe(2);
			expect(facts.durationSeconds).toBeGreaterThan(
				AUDIO_BENCHMARK_SECONDS - 0.15
			);
			expect(facts.durationSeconds).toBeLessThan(
				AUDIO_BENCHMARK_SECONDS + 0.35
			);

			const loudness = await measureLoudness({ filePath: outputPath });
			expect(Number.isFinite(loudness.integratedLufs)).toBe(true);
			// Real programme material, not silence and not clipped.
			expect(loudness.integratedLufs).toBeGreaterThan(-45);
			expect(loudness.truePeakDb).toBeLessThan(1);

			const samples = await decodeAudioSamples({ filePath: outputPath });
			expect(samples.length).toBeGreaterThan(
				AUDIO_BENCHMARK_SAMPLE_RATE * (AUDIO_BENCHMARK_SECONDS - 0.2)
			);
			const rms = windowedRms({ samples });
			measurement.fidelity = {
				channels: facts.channels,
				durationSeconds: facts.durationSeconds,
				integratedLufs: loudness.integratedLufs,
				rmsWindows: rms.map((value) => Number(value.toFixed(6))),
				sampleRate: facts.sampleRate,
				truePeakDb: loudness.truePeakDb,
			};
			// Each effect starts 0.75 s after the previous one, so energy must be
			// present in the first window and the mix must not be a constant tone
			// (which would mean effects landed at the wrong time or were lost).
			expect(rms[0]).toBeGreaterThan(0.001);
			expect(Math.max(...rms)).toBeGreaterThan(Math.min(...rms));
		}

		for (const measurement of measurements) {
			expect(measurement.wallMs).toBeGreaterThan(0);
			expect(measurement.memorySampleCount).toBeGreaterThan(0);
		}
	} finally {
		if (measurements.length > 0) {
			const reportPath = await writeAudioBenchmarkReport({
				directory: EVIDENCE_DIR,
				fileName: `audio-benchmark-${label}.json`,
				label,
				measurements,
			});
			console.log(`[audio-bench] report: ${reportPath}`);
		}
		await rm(workDir, { force: true, recursive: true });
	}
});
