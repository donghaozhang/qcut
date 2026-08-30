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
import type { Page } from "@playwright/test";
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
	type NormalizedRect,
} from "./helpers/sequential-decode-evidence";
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

const FPS = 30;
const WIDTH = 1280;
const HEIGHT = 720;
const TIMELINE_SECONDS = 12.8;
const TOTAL_FRAMES = Math.ceil(TIMELINE_SECONDS * FPS);
const RED_BASE_A = 16;
const RED_BASE_B = 150;
const EVIDENCE_DIR = path.resolve(
	process.cwd(),
	"output/playwright/sequential-decode"
);

/** Clip layout shared by the timeline builder and the expectation model. */
const CLIPS = {
	/** Main track: 1x with frame-aligned trim, outgoing side of the wipe. */
	e1: { media: "rampA", startTime: 0, duration: 4.4, trimStart: 0.4 },
	/** Main track: 2x with a half-frame trim offset (10.5 source frames). */
	e2: {
		media: "rampB",
		startTime: 4,
		duration: 4.35,
		trimStart: 0.35,
		playbackRate: 2,
	},
	/** Main track: reversed 1x — stays on the legacy seek path by design. */
	e3: {
		media: "rampA",
		startTime: 6,
		duration: 2.6,
		trimStart: 0.6,
		reverse: true,
	},
	/** Main track: motion content with a full desaturation color grade. */
	e6: { media: "motion", startTime: 8, duration: 5, trimStart: 0.2 },
	/** Overlay track: PiP sharing rampA with e1 at a 0.9s source offset. */
	e4: {
		media: "rampA",
		startTime: 2.5,
		duration: 5,
		trimStart: 2,
		scale: 0.3,
	},
	/** Overlay track: 0.5x PiP sharing rampB with e2. */
	e5: {
		media: "rampB",
		startTime: 8.5,
		duration: 1.9,
		trimStart: 0.4,
		playbackRate: 0.5,
		scale: 0.3,
	},
} as const;

const TRANSITION = { cutTime: 4, duration: 0.8 };
const STICKER_WINDOW = { startTime: 3.5, duration: 3 };
const ADJUSTMENT_WINDOW = { startTime: 9.5, duration: 1.5 };
const AUDIO_OVERLAY = { startTime: 1, duration: 2, toneHz: 600 };

/** Sample regions in normalized coordinates. */
const REGION: Record<"main" | "pip" | "sticker", NormalizedRect> = {
	main: { x0: 0.04, y0: 0.72, x1: 0.24, y1: 0.94 },
	pip: { x0: 0.42, y0: 0.4, x1: 0.58, y1: 0.6 },
	sticker: { x0: 0.8, y0: 0.145, x1: 0.84, y1: 0.215 },
};

interface ClipSpec {
	startTime: number;
	duration: number;
	trimStart: number;
	playbackRate?: number;
	reverse?: boolean;
}

/** Source frame index the export samples for output frame `frameIndex`. */
function expectedRampIndex({
	clip,
	frameIndex,
}: {
	clip: ClipSpec;
	frameIndex: number;
}): number {
	const sample = frameIndex / FPS - clip.startTime + 0.5 / FPS;
	const rate = clip.playbackRate ?? 1;
	const sourceDuration = clip.duration - clip.trimStart;
	const forward = Math.min(sourceDuration, Math.max(0, sample) * rate);
	const mapped = clip.reverse ? sourceDuration - forward : forward;
	return Math.floor((clip.trimStart + mapped) * FPS);
}

function invertColor({ color }: { color: RgbMean }): RgbMean {
	return { r: 255 - color.r, g: 255 - color.g, b: 255 - color.b };
}

interface ExposedWindow extends Window {
	__mediaStore: {
		getState: () => {
			mediaItems: Array<{ id: string; localPath?: string; name: string }>;
		};
	};
	__projectStore: {
		getState: () => { activeProject: { id: string } | null };
	};
	__timelineStore: {
		getState: () => {
			tracks: Array<{ id: string; isMain?: boolean; type: string }>;
			addElementToTrack: (
				trackId: string,
				element: Record<string, unknown>
			) => string | null;
			addTrack: (type: string) => string;
			insertTrackAt: (type: string, index: number) => string;
			addTransition: (input: Record<string, unknown>) => string | null;
			getTotalDuration: () => number;
		};
	};
}

async function buildComplexTimeline({
	page,
	names,
	stickerRuntime,
}: {
	page: Page;
	names: Record<"rampA" | "rampB" | "motion" | "gif" | "wav", string>;
	stickerRuntime: unknown;
}): Promise<{ projectId: string; transitionId: string; duration: number }> {
	return page.evaluate(
		({
			names,
			stickerRuntime,
			clips,
			transition,
			sticker,
			adjustment,
			audio,
		}) => {
			const editorWindow = window as unknown as ExposedWindow;
			const projectId =
				editorWindow.__projectStore.getState().activeProject?.id;
			if (!projectId) throw new Error("No active project");
			const media = editorWindow.__mediaStore.getState().mediaItems;
			const byName = (name: string) => {
				const item = media.find((candidate) => candidate.name === name);
				if (!item) throw new Error(`Media ${name} was not imported`);
				return item;
			};
			const rampA = byName(names.rampA);
			const rampB = byName(names.rampB);
			const motion = byName(names.motion);
			const gif = byName(names.gif);
			const wav = byName(names.wav);
			const mediaByKey: Record<string, { id: string; name: string }> = {
				rampA,
				rampB,
				motion,
			};

			const timeline = editorWindow.__timelineStore.getState();
			const mainTrack = timeline.tracks.find(
				(candidate) => candidate.isMain || candidate.type === "media"
			);
			if (!mainTrack) throw new Error("Missing main media track");
			// Track array order is UI top-to-bottom; draw order is reversed, so
			// index 0 renders on top. Build: adjustment > sticker > overlay >
			// main > audio.
			const overlayTrackId = timeline.insertTrackAt("media", 0);
			const stickerTrackId = timeline.insertTrackAt("sticker", 0);
			const adjustmentTrackId = timeline.insertTrackAt("adjustment", 0);
			const audioTrackId = timeline.addTrack("audio");

			const addClip = (
				trackId: string,
				key: keyof typeof clips,
				extra: Record<string, unknown> = {}
			): string => {
				const clip = clips[key];
				const item = mediaByKey[clip.media];
				const id = timeline.addElementToTrack(trackId, {
					type: "media",
					mediaId: item.id,
					name: `${key}-${item.name}`,
					startTime: clip.startTime,
					duration: clip.duration,
					trimStart: clip.trimStart,
					trimEnd: 0,
					...("playbackRate" in clip
						? { playbackRate: clip.playbackRate }
						: {}),
					...("reverse" in clip ? { reverse: clip.reverse } : {}),
					...("scale" in clip
						? { scaleX: clip.scale, scaleY: clip.scale }
						: {}),
					...extra,
				});
				if (!id) throw new Error(`Could not place clip ${key}`);
				return id;
			};

			const e1 = addClip(mainTrack.id, "e1");
			const e2 = addClip(mainTrack.id, "e2");
			addClip(mainTrack.id, "e3");
			addClip(mainTrack.id, "e6", {
				color: {
					enabled: true,
					basic: { enabled: true, saturation: -100 },
				},
			});
			addClip(overlayTrackId, "e4");
			addClip(overlayTrackId, "e5");

			const stickerId = timeline.addElementToTrack(stickerTrackId, {
				type: "sticker",
				stickerId: "seq-decode-gif-sticker",
				mediaId: gif.id,
				name: "seq-decode-gif",
				startTime: sticker.startTime,
				duration: sticker.duration,
				trimStart: 0,
				trimEnd: 0,
				x: 82,
				y: 18,
				width: 14,
				height: 14,
				stickerRuntime,
			});
			if (!stickerId) throw new Error("Could not place the GIF sticker");

			const adjustmentId = timeline.addElementToTrack(adjustmentTrackId, {
				type: "adjustment",
				name: "seq-decode-invert",
				startTime: adjustment.startTime,
				duration: adjustment.duration,
				trimStart: 0,
				trimEnd: 0,
				effects: [
					{
						id: "seq-decode-invert-effect",
						name: "Invert",
						effectType: "invert",
						parameters: { invert: 100 },
						duration: adjustment.duration,
						enabled: true,
					},
				],
			});
			if (!adjustmentId) throw new Error("Could not place the adjustment");

			const audioId = timeline.addElementToTrack(audioTrackId, {
				type: "media",
				mediaId: wav.id,
				name: "seq-decode-tone",
				startTime: audio.startTime,
				duration: audio.duration,
				trimStart: 0,
				trimEnd: 0,
			});
			if (!audioId) throw new Error("Could not place the audio overlay");

			const transitionId = timeline.addTransition({
				trackId: mainTrack.id,
				fromElementId: e1,
				toElementId: e2,
				videoMediaIds: new Set([rampA.id, rampB.id, motion.id]),
				presetId: "wipe-left",
				engine: "qcut",
				type: "wipe",
				direction: "left",
				duration: transition.duration,
				easing: "linear",
			});
			if (!transitionId) throw new Error("Could not add the wipe seam");

			return {
				projectId,
				transitionId,
				duration: editorWindow.__timelineStore.getState().getTotalDuration(),
			};
		},
		{
			names,
			stickerRuntime,
			clips: CLIPS,
			transition: TRANSITION,
			sticker: STICKER_WINDOW,
			adjustment: ADJUSTMENT_WINDOW,
			audio: AUDIO_OVERLAY,
		}
	);
}

async function waitForLocalPaths({
	page,
	videoNames,
}: {
	page: Page;
	videoNames: string[];
}): Promise<void> {
	// Only the video fixtures sync to project-local paths; the GIF and WAV
	// stay blob-backed, which the renderer muxer export reads directly.
	await expect
		.poll(
			() =>
				page.evaluate(
					(names) =>
						(window as unknown as ExposedWindow).__mediaStore
							.getState()
							.mediaItems.filter((item) => names.includes(item.name))
							.every((item) => Boolean(item.localPath)),
					videoNames
				),
			{ timeout: 30_000 }
		)
		.toBe(true);
}

/** Dense A/B sample frames: ±3 output frames around every timeline boundary. */
function denseSampleFrames(): number[] {
	const boundaries = [
		0,
		AUDIO_OVERLAY.startTime,
		CLIPS.e4.startTime,
		STICKER_WINDOW.startTime,
		TRANSITION.cutTime - TRANSITION.duration / 2,
		TRANSITION.cutTime,
		TRANSITION.cutTime + TRANSITION.duration / 2,
		CLIPS.e4.startTime + 3,
		CLIPS.e3.startTime,
		STICKER_WINDOW.startTime + STICKER_WINDOW.duration,
		CLIPS.e6.startTime,
		CLIPS.e5.startTime,
		ADJUSTMENT_WINDOW.startTime,
		ADJUSTMENT_WINDOW.startTime + ADJUSTMENT_WINDOW.duration,
		CLIPS.e5.startTime + 3,
		TIMELINE_SECONDS,
	];
	const frames = new Set<number>();
	for (const boundary of boundaries) {
		const center = Math.round(boundary * FPS);
		for (let offset = -3; offset <= 3; offset += 1) {
			const frame = center + offset;
			if (frame >= 0 && frame < TOTAL_FRAMES) frames.add(frame);
		}
	}
	// Coarse sweep so long uneventful stretches are covered too.
	for (let frame = 6; frame < TOTAL_FRAMES; frame += 12) frames.add(frame);
	return [...frames].sort((left, right) => left - right);
}

interface IdentityCheck {
	clip: keyof typeof CLIPS;
	frameIndex: number;
	invert?: boolean;
	label: string;
	redBase: number;
	region: "main" | "pip";
}

/** Frame-identity probes in pure ramp regions, clear of boundaries. */
const IDENTITY_CHECKS: IdentityCheck[] = [
	{
		label: "e1-early",
		clip: "e1",
		frameIndex: 15,
		region: "main",
		redBase: RED_BASE_A,
	},
	{
		label: "e1-mid",
		clip: "e1",
		frameIndex: 60,
		region: "main",
		redBase: RED_BASE_A,
	},
	{
		label: "e1-pre-transition",
		clip: "e1",
		frameIndex: 105,
		region: "main",
		redBase: RED_BASE_A,
	},
	{
		label: "e2-2x-early",
		clip: "e2",
		frameIndex: 135,
		region: "main",
		redBase: RED_BASE_B,
	},
	{
		label: "e2-2x-late",
		clip: "e2",
		frameIndex: 165,
		region: "main",
		redBase: RED_BASE_B,
	},
	{
		label: "e3-reverse-early",
		clip: "e3",
		frameIndex: 195,
		region: "main",
		redBase: RED_BASE_A,
	},
	{
		label: "e3-reverse-late",
		clip: "e3",
		frameIndex: 225,
		region: "main",
		redBase: RED_BASE_A,
	},
	{
		label: "e4-pip-collision",
		clip: "e4",
		frameIndex: 90,
		region: "pip",
		redBase: RED_BASE_A,
	},
	{
		label: "e4-pip-collision-2",
		clip: "e4",
		frameIndex: 100,
		region: "pip",
		redBase: RED_BASE_A,
	},
	{
		label: "e4-pip-past-seam",
		clip: "e4",
		frameIndex: 150,
		region: "pip",
		redBase: RED_BASE_A,
	},
	{
		label: "e5-half-speed",
		clip: "e5",
		frameIndex: 270,
		region: "pip",
		redBase: RED_BASE_B,
	},
	{
		label: "e5-half-speed-inverted",
		clip: "e5",
		frameIndex: 315,
		region: "pip",
		redBase: RED_BASE_B,
		invert: true,
	},
	{
		label: "e5-half-speed-after-adjustment",
		clip: "e5",
		frameIndex: 335,
		region: "pip",
		redBase: RED_BASE_B,
	},
];

/** Sticker probes: output frames landing mid-GIF-frame (0.267s phases). */
const STICKER_CHECKS = [0, 1, 2, 3, 0].map((gifFrame, step) => ({
	gifFrame,
	frameIndex:
		Math.round(STICKER_WINDOW.startTime * FPS) +
		Math.round(GIF_FRAME_SECONDS * FPS) * step +
		8,
}));

const AUDIO_WINDOWS = [
	{ label: "e1-tone-solo", start: 0.5, duration: 0.4 },
	{ label: "e1-plus-overlay-tone", start: 1.4, duration: 0.4 },
	{ label: "e2-2x-tone", start: 5, duration: 0.4 },
	{ label: "e3-reverse-tone", start: 7, duration: 0.4 },
	{ label: "e6-motion-tone", start: 10, duration: 0.4 },
];

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
