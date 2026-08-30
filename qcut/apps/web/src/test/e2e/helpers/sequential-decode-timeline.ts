/**
 * Timeline model for the sequential-decode parity E2E: the complex-timeline
 * layout, its builder (driving the real editor stores), the source-time
 * expectation model, and the sample/probe tables. The assertions live in
 * `sequential-decode-parity.e2e.ts`; keeping the model here keeps both files
 * within the repo's size guideline and the layout numbers in one place.
 */

import type { Page } from "@playwright/test";
import { expect } from "./electron-helpers";
import {
	GIF_FRAME_SECONDS,
	type NormalizedRect,
} from "./sequential-decode-evidence";
import type { RgbMean } from "./transition-export-evidence";

export const FPS = 30;
export const WIDTH = 1280;
export const HEIGHT = 720;
export const TIMELINE_SECONDS = 12.8;
export const TOTAL_FRAMES = Math.ceil(TIMELINE_SECONDS * FPS);
export const RED_BASE_A = 16;
export const RED_BASE_B = 150;

/** Clip layout shared by the timeline builder and the expectation model. */
export const CLIPS = {
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

export const TRANSITION = { cutTime: 4, duration: 0.8 };
export const STICKER_WINDOW = { startTime: 3.5, duration: 3 };
export const ADJUSTMENT_WINDOW = { startTime: 9.5, duration: 1.5 };
export const AUDIO_OVERLAY = { startTime: 1, duration: 2, toneHz: 600 };

/** Sample regions in normalized coordinates. */
export const REGION: Record<"main" | "pip" | "sticker", NormalizedRect> = {
	main: { x0: 0.04, y0: 0.72, x1: 0.24, y1: 0.94 },
	pip: { x0: 0.42, y0: 0.4, x1: 0.58, y1: 0.6 },
	sticker: { x0: 0.8, y0: 0.145, x1: 0.84, y1: 0.215 },
};

export interface ClipSpec {
	startTime: number;
	duration: number;
	trimStart: number;
	playbackRate?: number;
	reverse?: boolean;
}

/** Source frame index the export samples for output frame `frameIndex`. */
export function expectedRampIndex({
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

export function invertColor({ color }: { color: RgbMean }): RgbMean {
	return { r: 255 - color.r, g: 255 - color.g, b: 255 - color.b };
}

export interface ExposedWindow extends Window {
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

export async function buildComplexTimeline({
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

export async function waitForLocalPaths({
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
export function denseSampleFrames(): number[] {
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

export interface IdentityCheck {
	clip: keyof typeof CLIPS;
	frameIndex: number;
	invert?: boolean;
	label: string;
	redBase: number;
	region: "main" | "pip";
}

/** Frame-identity probes in pure ramp regions, clear of boundaries. */
export const IDENTITY_CHECKS: IdentityCheck[] = [
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
export const STICKER_CHECKS = [0, 1, 2, 3, 0].map((gifFrame, step) => ({
	gifFrame,
	frameIndex:
		Math.round(STICKER_WINDOW.startTime * FPS) +
		Math.round(GIF_FRAME_SECONDS * FPS) * step +
		8,
}));

export const AUDIO_WINDOWS = [
	{ label: "e1-tone-solo", start: 0.5, duration: 0.4 },
	{ label: "e1-plus-overlay-tone", start: 1.4, duration: 0.4 },
	{ label: "e2-2x-tone", start: 5, duration: 0.4 },
	{ label: "e3-reverse-tone", start: 7, duration: 0.4 },
	{ label: "e6-motion-tone", start: 10, duration: 0.4 },
];
