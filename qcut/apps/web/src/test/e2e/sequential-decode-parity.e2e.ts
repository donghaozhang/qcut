/**
 * Sequential-decode correctness on a complex, non-monotonic timeline.
 *
 * One project exercises overlapping video tracks that share a media file
 * (decoder-lane collision), a 2x clip, a 0.5x clip, a reversed clip, frame-
 * and non-frame-aligned trim offsets, a per-clip color grade, an invert
 * adjustment layer, an animated direct-gif sticker, a QCut wipe transition,
 * and mixed audio. The exact same project is exported twice through the
 * renderer muxer engine — once with sequential decoding (optimized) and once
 * with `disableSequentialDecode` (the legacy per-frame seek baseline) — via
 * the production HTTP export route the CLI benchmarks use.
 *
 * Evidence: stream envelope, dense decoded-frame samples around every trim,
 * overlap, speed boundary, reverse region, transition, sticker and
 * adjustment window, frame-identity checks against the ramp encoding, audio
 * RMS windows, and the structured profiler's sequential decode counters.
 */

import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
	generateToneWav,
	GIF_FRAME_COLORS,
	GIF_FRAME_SECONDS,
	meanColorRect,
	probeColorTags,
	rampColorForIndex,
	rampPhaseDistance,
	rampPhaseFromColor,
	readExportProfile,
	startRendererMuxerExport,
} from "./helpers/sequential-decode-evidence";
import {
	ADJUSTMENT_WINDOW,
	AUDIO_OVERLAY,
	AUDIO_WINDOWS,
	buildComplexTimeline,
	CLIPS,
	denseSampleFrames,
	expectedRampIndex,
	FPS,
	HEIGHT,
	IDENTITY_CHECKS,
	invertColor,
	REGION,
	RED_BASE_A,
	RED_BASE_B,
	STICKER_CHECKS,
	STICKER_WINDOW,
	TIMELINE_SECONDS,
	TOTAL_FRAMES,
	TRANSITION,
	WIDTH,
	waitForLocalPaths,
} from "./helpers/sequential-decode-timeline";
import {
	audioRmsDb,
	colorDistance,
	decodeFrame,
	meanAbsDiff,
	probeVideo,
	savePngFrame,
	waitForExportJob,
	generateToneClip,
	type RgbMean,
} from "./helpers/transition-export-evidence";

const EVIDENCE_DIR = path.resolve(
	process.cwd(),
	"output/playwright/sequential-decode"
);

test("muxer sequential decode matches the seek baseline on a complex timeline", async ({
	page,
	apiPort,
}) => {
	test.setTimeout(1_200_000);
	// Export failures land in console.error with their stack; echo them so a
	// failed run is diagnosable from the Playwright log alone.
	page.on("console", (message) => {
		if (message.type() === "error" || message.type() === "warning") {
			console.log(`[RENDERER ${message.type()}] ${message.text()}`);
		}
	});
	page.on("pageerror", (error) => {
		console.log(`[RENDERER pageerror] ${error.stack ?? error.message}`);
	});
	const workDir = await mkdtemp(path.join(tmpdir(), "qcut-seq-decode-"));
	await mkdir(EVIDENCE_DIR, { recursive: true });
	const sources = {
		rampA: path.join(workDir, "seq-ramp-a.mp4"),
		rampB: path.join(workDir, "seq-ramp-b.mp4"),
		motion: path.join(workDir, "seq-motion.mp4"),
		gif: path.join(workDir, "seq-sticker.gif"),
		wav: path.join(workDir, "seq-tone-600.wav"),
	};
	try {
		await generateRampClip({
			filePath: sources.rampA,
			redBase: RED_BASE_A,
			toneHz: 220,
			seconds: 8,
		});
		await generateRampClip({
			filePath: sources.rampB,
			redBase: RED_BASE_B,
			toneHz: 440,
			seconds: 8,
		});
		await generateToneClip({
			filePath: sources.motion,
			pattern: "testsrc2",
			toneHz: 880,
			seconds: 8,
		});
		await generateColorCycleGif({ filePath: sources.gif });
		await generateToneWav({
			filePath: sources.wav,
			toneHz: AUDIO_OVERLAY.toneHz,
			seconds: AUDIO_OVERLAY.duration,
		});
		const stickerRuntime = parseDirectGifRuntimeDescriptor({
			bytes: new Uint8Array(await readFile(sources.gif)),
		});
		expect(stickerRuntime.frames.length).toBe(GIF_FRAME_COLORS.length);
		expect(stickerRuntime.cycleDurationSeconds).toBeCloseTo(
			GIF_FRAME_SECONDS * GIF_FRAME_COLORS.length,
			3
		);

		await page.setViewportSize({ width: 1440, height: 1000 });
		await createTestProject(page, "Sequential Decode Parity E2E");
		for (const filePath of [
			sources.rampA,
			sources.rampB,
			sources.motion,
			sources.gif,
			sources.wav,
		]) {
			await uploadTestMedia(page, filePath);
		}
		await waitForLocalPaths({
			page,
			videoNames: [
				path.basename(sources.rampA),
				path.basename(sources.rampB),
				path.basename(sources.motion),
			],
		});

		const { projectId, duration } = await buildComplexTimeline({
			page,
			names: {
				rampA: path.basename(sources.rampA),
				rampB: path.basename(sources.rampB),
				motion: path.basename(sources.motion),
				gif: path.basename(sources.gif),
				wav: path.basename(sources.wav),
			},
			stickerRuntime,
		});
		expect(duration).toBeCloseTo(TIMELINE_SECONDS, 3);

		const runs = {
			optimized: {
				outputPath: path.join(workDir, "seq-optimized.mp4"),
				profilePath: path.join(workDir, "seq-optimized-profile.json"),
				disableSequentialDecode: false,
			},
			baseline: {
				outputPath: path.join(workDir, "seq-baseline.mp4"),
				profilePath: path.join(workDir, "seq-baseline-profile.json"),
				disableSequentialDecode: true,
			},
		} as const;
		const wallClockMs: Record<string, number> = {};
		for (const [label, run] of Object.entries(runs)) {
			const startedAt = Date.now();
			const { jobId } = await startRendererMuxerExport({
				apiPort,
				projectId,
				outputPath: run.outputPath,
				profilePath: run.profilePath,
				disableSequentialDecode: run.disableSequentialDecode,
				width: WIDTH,
				height: HEIGHT,
				fps: FPS,
				token: process.env.QCUT_API_TOKEN,
			});
			const job = await waitForExportJob({
				apiPort,
				projectId,
				jobId,
				token: process.env.QCUT_API_TOKEN,
				timeoutMs: 540_000,
			});
			wallClockMs[label] = Date.now() - startedAt;
			expect(
				job,
				`${label} export: ${job.error ?? "no error reported"}`
			).toMatchObject({ status: "completed" });
			expect(existsSync(run.outputPath)).toBe(true);
		}

		const [optimizedProbe, baselineProbe] = await Promise.all([
			probeVideo({ filePath: runs.optimized.outputPath }),
			probeVideo({ filePath: runs.baseline.outputPath }),
		]);
		const [optimizedTags, baselineTags] = await Promise.all([
			probeColorTags({ filePath: runs.optimized.outputPath }),
			probeColorTags({ filePath: runs.baseline.outputPath }),
		]);
		const [optimizedProfile, baselineProfile] = await Promise.all([
			readExportProfile({ filePath: runs.optimized.profilePath }),
			readExportProfile({ filePath: runs.baseline.profilePath }),
		]);

		// Dense A/B frame comparison around every boundary plus a coarse sweep.
		const sampleFrames = denseSampleFrames();
		const frameDiffs: Array<{ frameIndex: number; diff: number }> = [];
		for (const frameIndex of sampleFrames) {
			const timeSeconds = frameSelectTime({ frameIndex, fps: FPS });
			const [optimizedFrame, baselineFrame] = await Promise.all([
				decodeFrame({ filePath: runs.optimized.outputPath, timeSeconds }),
				decodeFrame({ filePath: runs.baseline.outputPath, timeSeconds }),
			]);
			frameDiffs.push({
				frameIndex,
				diff: meanAbsDiff({ a: optimizedFrame, b: baselineFrame }),
			});
		}
		const worstDiffs = [...frameDiffs]
			.sort((left, right) => right.diff - left.diff)
			.slice(0, 10);

		// Frame-identity checks against the ramp encoding, in both outputs.
		const identity: Array<Record<string, unknown> & { label: string }> = [];
		for (const check of IDENTITY_CHECKS) {
			const timeSeconds = frameSelectTime({
				frameIndex: check.frameIndex,
				fps: FPS,
			});
			const expectedIndex = expectedRampIndex({
				clip: CLIPS[check.clip],
				frameIndex: check.frameIndex,
			});
			const rawExpected = rampColorForIndex({
				frameIndex: expectedIndex,
				redBase: check.redBase,
			});
			const expected = check.invert
				? invertColor({ color: rawExpected })
				: rawExpected;
			const [optimizedFrame, baselineFrame] = await Promise.all([
				decodeFrame({ filePath: runs.optimized.outputPath, timeSeconds }),
				decodeFrame({ filePath: runs.baseline.outputPath, timeSeconds }),
			]);
			const optimizedColor = meanColorRect({
				frame: optimizedFrame,
				rect: REGION[check.region],
			});
			const baselineColor = meanColorRect({
				frame: baselineFrame,
				rect: REGION[check.region],
			});
			const expectedPhase = expectedIndex % 20;
			const phaseOf = (color: RgbMean) =>
				rampPhaseFromColor({
					color: check.invert ? invertColor({ color }) : color,
				});
			identity.push({
				label: check.label,
				timeSeconds,
				expectedIndex,
				expected,
				optimizedColor,
				baselineColor,
				optimizedPhase: phaseOf(optimizedColor),
				baselinePhase: phaseOf(baselineColor),
				expectedPhase,
			});
		}

		// Sticker animation phase in both outputs.
		const sticker: Array<Record<string, unknown>> = [];
		for (const check of STICKER_CHECKS) {
			const timeSeconds = frameSelectTime({
				frameIndex: check.frameIndex,
				fps: FPS,
			});
			const [optimizedFrame, baselineFrame] = await Promise.all([
				decodeFrame({
					filePath: runs.optimized.outputPath,
					timeSeconds,
				}),
				decodeFrame({
					filePath: runs.baseline.outputPath,
					timeSeconds,
				}),
			]);
			sticker.push({
				frameIndex: check.frameIndex,
				expected: GIF_FRAME_COLORS[check.gifFrame].rgb,
				optimizedColor: meanColorRect({
					frame: optimizedFrame,
					rect: REGION.sticker,
				}),
				baselineColor: meanColorRect({
					frame: baselineFrame,
					rect: REGION.sticker,
				}),
			});
		}

		// The color grade on e6 must desaturate a provably colorful source
		// region, inside and outside the invert-adjustment window.
		const gradeChecks: Array<Record<string, unknown>> = [];
		for (const frameIndex of [307, 345]) {
			const timeSeconds = frameSelectTime({ frameIndex, fps: FPS });
			const sourceFrameIndex = expectedRampIndex({
				clip: CLIPS.e6,
				frameIndex,
			});
			const [optimizedFrame, baselineFrame, sourceFrame] = await Promise.all([
				decodeFrame({ filePath: runs.optimized.outputPath, timeSeconds }),
				decodeFrame({ filePath: runs.baseline.outputPath, timeSeconds }),
				decodeFrame({
					filePath: sources.motion,
					timeSeconds: frameSelectTime({
						frameIndex: sourceFrameIndex,
						fps: FPS,
					}),
				}),
			]);
			const spread = (color: RgbMean) =>
				Math.max(
					Math.abs(color.r - color.g),
					Math.abs(color.g - color.b),
					Math.abs(color.r - color.b)
				);
			gradeChecks.push({
				frameIndex,
				timeSeconds,
				optimizedSpread: spread(
					meanColorRect({ frame: optimizedFrame, rect: REGION.main })
				),
				baselineSpread: spread(
					meanColorRect({ frame: baselineFrame, rect: REGION.main })
				),
				sourceSpread: spread(
					meanColorRect({ frame: sourceFrame, rect: REGION.main })
				),
			});
		}

		// Transition midpoint: wipe-left reveals the incoming 2x clip on the
		// left half while the outgoing clip still owns the right half.
		const midFrame = await decodeFrame({
			filePath: runs.optimized.outputPath,
			timeSeconds: frameSelectTime({
				frameIndex: Math.round(TRANSITION.cutTime * FPS),
				fps: FPS,
			}),
		});
		const transitionMid = {
			left: meanColorRect({
				frame: midFrame,
				rect: { x0: 0.02, y0: 0.72, x1: 0.2, y1: 0.94 },
			}),
			right: meanColorRect({
				frame: midFrame,
				rect: { x0: 0.8, y0: 0.72, x1: 0.98, y1: 0.94 },
			}),
		};

		const audio: Record<string, { optimizedDb: number; baselineDb: number }> =
			{};
		for (const window of AUDIO_WINDOWS) {
			const [optimizedDb, baselineDb] = await Promise.all([
				audioRmsDb({
					filePath: runs.optimized.outputPath,
					startSeconds: window.start,
					durationSeconds: window.duration,
				}),
				audioRmsDb({
					filePath: runs.baseline.outputPath,
					startSeconds: window.start,
					durationSeconds: window.duration,
				}),
			]);
			audio[window.label] = { optimizedDb, baselineDb };
		}

		// Persist all evidence before asserting anything.
		for (const [label, run] of Object.entries(runs)) {
			for (const frameIndex of [
				Math.round(TRANSITION.cutTime * FPS),
				90,
				307,
				315,
				STICKER_CHECKS[1].frameIndex,
			]) {
				await savePngFrame({
					filePath: run.outputPath,
					timeSeconds: frameSelectTime({ frameIndex, fps: FPS }),
					outputPath: path.join(
						EVIDENCE_DIR,
						`${label}-frame-${frameIndex}.png`
					),
				});
			}
		}
		await writeFile(
			path.join(EVIDENCE_DIR, "evidence.json"),
			JSON.stringify(
				{
					timeline: {
						clips: CLIPS,
						transition: TRANSITION,
						sticker: STICKER_WINDOW,
						adjustment: ADJUSTMENT_WINDOW,
						audioOverlay: AUDIO_OVERLAY,
						totalSeconds: TIMELINE_SECONDS,
						totalFrames: TOTAL_FRAMES,
					},
					probes: { optimized: optimizedProbe, baseline: baselineProbe },
					colorTags: { optimized: optimizedTags, baseline: baselineTags },
					profiles: { optimized: optimizedProfile, baseline: baselineProfile },
					wallClockMs,
					frameDiffs: {
						sampleCount: frameDiffs.length,
						maxDiff: worstDiffs[0]?.diff ?? 0,
						meanDiff:
							frameDiffs.reduce((sum, item) => sum + item.diff, 0) /
							Math.max(1, frameDiffs.length),
						worst: worstDiffs,
					},
					identity,
					sticker,
					gradeChecks,
					transitionMid,
					audio,
				},
				null,
				2
			)
		);

		// ---- Envelope --------------------------------------------------------
		for (const [label, probe] of [
			["optimized", optimizedProbe],
			["baseline", baselineProbe],
		] as const) {
			expect(probe, label).toMatchObject({
				width: WIDTH,
				height: HEIGHT,
				hasAudio: true,
				frameCount: TOTAL_FRAMES,
			});
			expect(probe.fps, label).toBeCloseTo(FPS, 1);
			expect(probe.videoDurationSeconds, label).toBeCloseTo(
				TIMELINE_SECONDS,
				1
			);
		}
		for (const tags of [optimizedTags, baselineTags]) {
			expect(tags).toMatchObject({
				colorSpace: "bt709",
				colorTransfer: "bt709",
				colorPrimaries: "bt709",
				colorRange: "tv",
			});
		}

		// ---- Dense A/B parity ------------------------------------------------
		for (const { frameIndex, diff } of frameDiffs) {
			expect(diff, `A/B diff at frame ${frameIndex}`).toBeLessThan(6);
		}

		// ---- Frame identity vs the expectation model, in both outputs --------
		for (const entry of identity) {
			const label = entry.label as string;
			expect(
				colorDistance({
					a: entry.optimizedColor as RgbMean,
					b: entry.expected as RgbMean,
				}),
				`${label} optimized color`
			).toBeLessThan(18);
			expect(
				colorDistance({
					a: entry.baselineColor as RgbMean,
					b: entry.expected as RgbMean,
				}),
				`${label} baseline color`
			).toBeLessThan(18);
			expect(
				rampPhaseDistance({
					a: entry.optimizedPhase as number,
					b: entry.expectedPhase as number,
				}),
				`${label} optimized phase`
			).toBeLessThan(0.9);
			expect(
				rampPhaseDistance({
					a: entry.optimizedPhase as number,
					b: entry.baselinePhase as number,
				}),
				`${label} optimized-vs-baseline phase`
			).toBeLessThan(0.4);
		}

		// ---- Sticker animation ----------------------------------------------
		for (const entry of sticker) {
			const frameIndex = entry.frameIndex as number;
			expect(
				colorDistance({
					a: entry.optimizedColor as RgbMean,
					b: entry.expected as RgbMean,
				}),
				`sticker at frame ${frameIndex}`
			).toBeLessThan(60);
			expect(
				colorDistance({
					a: entry.optimizedColor as RgbMean,
					b: entry.baselineColor as RgbMean,
				}),
				`sticker A/B at frame ${frameIndex}`
			).toBeLessThan(8);
		}
		// The animation must actually advance between GIF frames.
		expect(
			colorDistance({
				a: sticker[0].optimizedColor as RgbMean,
				b: sticker[1].optimizedColor as RgbMean,
			})
		).toBeGreaterThan(100);

		// ---- Color grade + adjustment layer ---------------------------------
		for (const entry of gradeChecks) {
			expect(entry.sourceSpread as number).toBeGreaterThan(25);
			expect(entry.optimizedSpread as number).toBeLessThan(10);
			expect(entry.baselineSpread as number).toBeLessThan(10);
		}

		// ---- Transition midpoint --------------------------------------------
		const incomingFirstFrame = rampColorForIndex({
			frameIndex: expectedRampIndex({ clip: CLIPS.e2, frameIndex: 120 }),
			redBase: RED_BASE_B,
		});
		const outgoingLastFrame = rampColorForIndex({
			frameIndex: expectedRampIndex({ clip: CLIPS.e1, frameIndex: 120 }),
			redBase: RED_BASE_A,
		});
		expect(
			colorDistance({ a: transitionMid.left, b: incomingFirstFrame })
		).toBeLessThan(25);
		expect(
			colorDistance({ a: transitionMid.right, b: outgoingLastFrame })
		).toBeLessThan(25);

		// ---- Audio -----------------------------------------------------------
		for (const [label, levels] of Object.entries(audio)) {
			expect(levels.optimizedDb, label).toBeGreaterThan(-35);
			expect(
				Math.abs(levels.optimizedDb - levels.baselineDb),
				label
			).toBeLessThan(0.5);
		}
		expect(
			audio["e1-plus-overlay-tone"].optimizedDb -
				audio["e1-tone-solo"].optimizedDb
		).toBeGreaterThan(1.5);

		// ---- Sequential decode counters -------------------------------------
		const opens = optimizedProfile.counters["sequential-video-open"] ?? 0;
		const restarts = optimizedProfile.counters["sequential-video-restart"] ?? 0;
		expect(opens).toBeGreaterThanOrEqual(4);
		// Per-element decoder lanes: overlapping clips cut from the same file
		// must not fight over one decoder, so the only restarts are each
		// lane's initial position. A lane-collision regression shows up here
		// as one restart per frame of the overlap window.
		expect(restarts).toBeLessThanOrEqual(opens + 2);
		expect(optimizedProfile.counters["sequential-video-evict"] ?? 0).toBe(0);
		expect(optimizedProfile.counters["sequential-video-fallback"] ?? 0).toBe(0);
		expect(optimizedProfile.stageCounts["video-decode"] ?? 0).toBeGreaterThan(
			400
		);
		expect(baselineProfile.counters["sequential-video-open"] ?? 0).toBe(0);
		expect(baselineProfile.stageCounts["video-seek"] ?? 0).toBeGreaterThan(500);
	} finally {
		await rm(workDir, { force: true, recursive: true });
	}
});
