/**
 * Real stacked-reverb export fidelity gate.
 *
 * Exports a timeline whose clips all enable reverb, which is the scenario the
 * impulse cache touches, then decodes the audio back to float samples so two
 * builds can be compared sample-for-sample.
 *
 * The muxer encodes AAC, which is lossy and not bit-reproducible between runs,
 * so this exports twice on one build to measure the encoder's own noise floor.
 * That control is the bar a code change has to stay under; bit-identity of the
 * impulse buffer itself is pinned by the unit tests instead.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { expect } from "@playwright/test";
import {
	createTestProject,
	navigateToProjects,
	stubExportSaveDialog,
	uploadTestMedia,
} from "./helpers/electron-helpers";
import { isolatedElectronTest as test } from "./helpers/isolated-electron-fixture";
import {
	buildStackedReverbTimeline,
	generateToneClip,
	hashDecodedAudio,
	compareDecodedAudio,
	measureAudioLevels,
	probeAudioFacts,
	type StackedAudioClipSpec,
} from "./helpers/stacked-audio-export-fidelity";

const CLIP_SECONDS = 1.5;
const CLIP_COUNT = 4;
const SCRATCH = path.join(
	process.env.TMPDIR ?? "/tmp",
	"qcut-stacked-audio-reverb"
);

const REVERB = {
	damping: 50,
	enabled: true,
	mix: 35,
	roomSize: 60,
} as const;

function clipSpecs(): StackedAudioClipSpec[] {
	return Array.from({ length: CLIP_COUNT }, (_, index) => ({
		duration: CLIP_SECONDS,
		reverb: { ...REVERB },
		startTime: index * CLIP_SECONDS,
	}));
}

test.describe("stacked reverb export fidelity", () => {
	test.setTimeout(900_000);

	test("renders stacked reverb clips deterministically", async ({
		page,
		electronApp,
	}) => {
		const tonePath = generateToneClip({
			filePath: path.join(SCRATCH, "tone-440.wav"),
			frequency: 440,
			seconds: CLIP_SECONDS,
		});

		await navigateToProjects(page);
		await createTestProject(page, "stacked-reverb");
		await uploadTestMedia(page, tonePath);

		const placed = await buildStackedReverbTimeline({
			clips: clipSpecs(),
			page,
		});
		expect(placed).toBe(CLIP_COUNT);

		// `__exportActions` is registered by the export panel's effect, so the
		// panel has to be open before the first export.
		const ensureExportActions = async (): Promise<void> => {
			const registered = await page.evaluate(() =>
				Boolean(
					(window as unknown as { __exportActions?: unknown }).__exportActions
				)
			);
			if (registered) return;
			await page.locator('[data-testid="export-button"]').click();
			await expect
				.poll(
					() =>
						page.evaluate(() =>
							Boolean(
								(window as unknown as { __exportActions?: unknown })
									.__exportActions
							)
						),
					{ timeout: 30_000 }
				)
				.toBe(true);
		};

		const results: Array<{ hash: string; wallMs: number; output: string }> = [];
		for (let run = 0; run < 2; run += 1) {
			const outputPath = path.join(SCRATCH, `export-run-${run}.mp4`);
			await stubExportSaveDialog({ electronApp, outputPath });
			await ensureExportActions();

			const startedAt = Date.now();
			await page.evaluate(async (target) => {
				const actions = (
					window as unknown as {
						__exportActions?: {
							exportLocalVideo: (
								options: Record<string, unknown>
							) => Promise<unknown>;
						};
					}
				).__exportActions;
				if (!actions) throw new Error("Export actions are not registered");
				await actions.exportLocalVideo({
					engine: "muxer",
					filename: "stacked-reverb.mp4",
					format: "mp4",
					frameRate: 30,
					height: 720,
					outputPath: target,
					quality: "720p",
					width: 1280,
				});
			}, outputPath);
			const wallMs = Date.now() - startedAt;

			await expect
				.poll(() => existsSync(outputPath), { timeout: 300_000 })
				.toBe(true);

			results.push({
				hash: hashDecodedAudio({ filePath: outputPath }),
				output: outputPath,
				wallMs,
			});
			console.log(
				`[stacked-reverb] run ${run}: wall=${wallMs}ms hash=${results[run].hash}`
			);
		}

		const facts = probeAudioFacts({ filePath: results[0].output });
		const levels = measureAudioLevels({ filePath: results[0].output });
		console.log(
			`[stacked-reverb] audio: codec=${facts.codec} rate=${facts.sampleRate} ` +
				`channels=${facts.channels} duration=${facts.durationSeconds.toFixed(3)}s ` +
				`peak=${levels.peak.toFixed(6)} rms=${levels.rms.toFixed(6)} ` +
				`samples=${levels.sampleCount}`
		);
		console.log(`[stacked-reverb] AUDIO_HASH=${results[0].hash}`);

		// Invariants that must survive the optimization.
		expect(facts.sampleRate).toBe(48_000);
		expect(facts.channels).toBe(2);
		expect(facts.durationSeconds).toBeGreaterThanOrEqual(
			CLIP_SECONDS * CLIP_COUNT - 0.2
		);
		expect(facts.durationSeconds).toBeLessThanOrEqual(
			CLIP_SECONDS * CLIP_COUNT + 0.5
		);
		// Reverb must actually be audible, otherwise this gate proves nothing.
		expect(levels.peak).toBeGreaterThan(0.01);
		expect(levels.rms).toBeGreaterThan(0.001);

		// Same build, same timeline, two exports. The muxer encodes AAC, which is
		// not bit-reproducible, so this measures the encoder's own noise floor
		// rather than asserting equality. A code change is only clean if its
		// cross-build difference stays at or below this number.
		const control = compareDecodedAudio({
			leftPath: results[0].output,
			rightPath: results[1].output,
		});
		console.log(
			`[stacked-reverb] same-build control: identical=${control.identical} ` +
				`sampleCountMatch=${control.sampleCountMatch} ` +
				`maxAbsDiff=${control.maxAbsDiff.toExponential(3)} ` +
				`rmsDiff=${control.rmsDiff.toExponential(3)} ` +
				`diffDb=${control.diffDb.toFixed(1)}dB`
		);
		expect(control.sampleCountMatch).toBe(true);
		// The encoder may differ slightly, but never audibly.
		expect(control.maxAbsDiff).toBeLessThan(0.01);
	});
});
