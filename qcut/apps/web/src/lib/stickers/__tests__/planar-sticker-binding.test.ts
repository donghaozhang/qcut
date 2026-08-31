import type {
	MediaElement,
	PlanarQuad,
	PlanarTrackingSample,
	PlanarTrackingSidecarV1,
	StickerElement,
	TimelineTrack,
} from "@/types/timeline";
import type { OverlaySticker } from "@/types/sticker-overlay";
import { describe, expect, it } from "vitest";
import {
	resolvePlanarSampleQuad,
	resolveStickerPlanarTracking,
} from "../planar-sticker-binding";

function translatedQuad({ x }: { x: number }): PlanarQuad {
	return {
		topLeft: { x, y: 0.2 },
		topRight: { x: x + 0.2, y: 0.2 },
		bottomRight: { x: x + 0.2, y: 0.4 },
		bottomLeft: { x, y: 0.4 },
	};
}

function sample({
	ptsUs,
	status = "tracked",
	x,
}: {
	ptsUs: number;
	status?: PlanarTrackingSample["status"];
	x: number;
}): PlanarTrackingSample {
	return {
		confidence: status === "lost" ? 0 : 1,
		ptsUs,
		quad: translatedQuad({ x }),
		status,
	};
}

function sidecar({
	samples,
}: {
	samples: PlanarTrackingSample[];
}): PlanarTrackingSidecarV1 {
	return {
		coordinateSpace: "source-display-normalized",
		direction: "both",
		provider: {
			id: "opencv-wasm",
			parametersHash: "a".repeat(64),
			version: "test",
		},
		samples,
		schemaVersion: 1,
		seed: { ptsUs: 1_000_000, quad: translatedQuad({ x: 0.2 }) },
		source: {
			contentSha256: "b".repeat(64),
			displayHeight: 100,
			displayWidth: 100,
			mediaId: "video-media",
		},
		timebase: "microseconds",
	};
}

function source(overrides: Partial<MediaElement> = {}): MediaElement {
	return {
		duration: 4,
		fitMode: "fill",
		id: "video-element",
		mediaId: "video-media",
		name: "Video",
		startTime: 0,
		trimEnd: 0,
		trimStart: 0,
		type: "media",
		...overrides,
	};
}

function sticker(): StickerElement {
	return {
		duration: 4,
		height: 20,
		id: "sticker-element",
		mediaId: "sticker-media",
		name: "Sticker",
		startTime: 0,
		stickerId: "sticker",
		tracking: {
			lostBehavior: "hold",
			mode: "planar",
			seedPtsUs: 1_000_000,
			seedTargetQuad: translatedQuad({ x: 0.2 }),
			sourceElementId: "video-element",
			surfaceTrackingId: "surface",
		},
		trimEnd: 0,
		trimStart: 0,
		type: "sticker",
		width: 20,
		x: 30,
		y: 30,
	};
}

function overlay(): OverlaySticker {
	return {
		id: "sticker",
		maintainAspectRatio: true,
		mediaItemId: "sticker-media",
		opacity: 1,
		position: { x: 30, y: 30 },
		rotation: 0,
		size: { height: 20, width: 20 },
		zIndex: 1,
	};
}

function tracks({ media }: { media: MediaElement }): TimelineTrack[] {
	return [
		{ elements: [media], id: "media-track", name: "Media", type: "media" },
	];
}

function resolveAt({
	currentTime,
	media = source(),
	result,
}: {
	currentTime: number;
	media?: MediaElement;
	result: PlanarTrackingSidecarV1;
}): OverlaySticker {
	return resolveStickerPlanarTracking({
		canvasHeight: 100,
		canvasWidth: 100,
		currentTime,
		element: sticker(),
		fps: 30,
		sidecar: result,
		sticker: overlay(),
		tracks: tracks({ media }),
	});
}

describe("planar sticker binding", () => {
	it("interpolates tracked quads at exact media PTS", () => {
		const result = sidecar({
			samples: [
				sample({ ptsUs: 1_000_000, x: 0.2 }),
				sample({ ptsUs: 2_000_000, x: 0.4 }),
			],
		});
		const visual = resolveAt({ currentTime: 1.5, result });
		expect(visual.position).toEqual({ x: 40, y: 30 });
		expect(visual.size.width).toBeCloseTo(20);
		expect(visual.size.height).toBeCloseTo(20);
		expect(visual.maintainAspectRatio).toBe(false);
		expect(visual.perspective).toMatchObject({
			topLeftX: 0,
			topLeftY: 0,
			bottomRightX: 1,
			bottomRightY: 1,
		});
	});

	it("holds or hides at the first lost sample", () => {
		const result = sidecar({
			samples: [
				sample({ ptsUs: 1_000_000, x: 0.2 }),
				sample({ ptsUs: 2_000_000, status: "lost", x: 0.8 }),
			],
		});
		expect(
			resolvePlanarSampleQuad({
				lostBehavior: "hold",
				ptsUs: 2_000_000,
				sidecar: result,
			})
		).toEqual({ quad: translatedQuad({ x: 0.2 }), visible: true });
		expect(
			resolvePlanarSampleQuad({
				lostBehavior: "hide",
				ptsUs: 2_000_000,
				sidecar: result,
			})
		).toEqual({ visible: false });
	});

	it.each([
		{
			label: "trimmed seek",
			currentTime: 0.5,
			media: source({ duration: 4, trimStart: 1 }),
			expectedX: 0.3,
		},
		{
			label: "double speed",
			currentTime: 0.75,
			media: source({ playbackRate: 2 }),
			expectedX: 0.3,
		},
		{
			label: "speed curve",
			currentTime: 0.75,
			media: source({
				speedKeyframes: [
					{ id: "speed-start", frame: 0, value: 2, easing: "linear" },
					{ id: "speed-end", frame: 120, value: 2, easing: "linear" },
				],
			}),
			expectedX: 0.3,
		},
		{
			label: "reverse playback",
			currentTime: 2.5,
			media: source({ reverse: true }),
			expectedX: 0.3,
		},
		{
			label: "freeze frame",
			currentTime: 2.5,
			media: source({ freezeFrameDuration: 1, freezeFrameTime: 2 }),
			expectedX: 0.4,
		},
	])("uses source PTS for $label", ({ currentTime, expectedX, media }) => {
		const result = sidecar({
			samples: [
				sample({ ptsUs: 1_000_000, x: 0.2 }),
				sample({ ptsUs: 2_000_000, x: 0.4 }),
				sample({ ptsUs: 3_000_000, x: 0.6 }),
			],
		});
		const visual = resolveAt({ currentTime, media, result });
		expect(visual.position.x).toBeCloseTo((expectedX + 0.1) * 100);
	});

	it("maps contain fit and source transforms into the project canvas", () => {
		const result = {
			...sidecar({ samples: [sample({ ptsUs: 1_000_000, x: 0 })] }),
			seed: {
				ptsUs: 1_000_000,
				quad: {
					topLeft: { x: 0, y: 0 },
					topRight: { x: 1, y: 0 },
					bottomRight: { x: 1, y: 1 },
					bottomLeft: { x: 0, y: 1 },
				},
			},
			source: {
				...sidecar({ samples: [] }).source,
				displayHeight: 90,
				displayWidth: 160,
			},
		};
		result.samples = [{ ...result.samples[0], quad: result.seed.quad }];
		const targetSticker = sticker();
		targetSticker.tracking = {
			lostBehavior: "hold",
			mode: "planar",
			seedPtsUs: 1_000_000,
			seedTargetQuad: result.seed.quad,
			sourceElementId: "video-element",
			surfaceTrackingId: "surface",
		};
		const visual = resolveStickerPlanarTracking({
			canvasHeight: 100,
			canvasWidth: 100,
			currentTime: 1,
			element: targetSticker,
			fps: 30,
			sidecar: result,
			sticker: overlay(),
			tracks: tracks({
				media: source({ fitMode: "contain", rotation: 90, x: 10 }),
			}),
		});
		expect(visual.position.x).toBeCloseTo(60);
		expect(visual.position.y).toBeCloseTo(50);
		expect(visual.size.width).toBeCloseTo(56.25);
		expect(visual.size.height).toBeCloseTo(100);
	});
});
