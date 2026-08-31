import type {
	MediaElement,
	PlanarQuad,
	PlanarTrackingSidecarV1,
	StickerElement,
	TimelineTrack,
} from "@/types/timeline";
import { describe, expect, it } from "vitest";
import {
	buildStickerPlanarTrackingExportKeyframes,
	StickerPlanarTrackingExportDataError,
} from "../sticker-tracking-export";

const seedQuad: PlanarQuad = {
	topLeft: { x: 0.2, y: 0.2 },
	topRight: { x: 0.4, y: 0.2 },
	bottomRight: { x: 0.4, y: 0.4 },
	bottomLeft: { x: 0.2, y: 0.4 },
};

const destinationQuad: PlanarQuad = {
	topLeft: { x: 0.25, y: 0.2 },
	topRight: { x: 0.55, y: 0.25 },
	bottomRight: { x: 0.5, y: 0.5 },
	bottomLeft: { x: 0.2, y: 0.45 },
};

function source(): MediaElement {
	return {
		duration: 1,
		fitMode: "fill",
		id: "video",
		mediaId: "video-media",
		name: "Video",
		startTime: 0,
		trimEnd: 0,
		trimStart: 0,
		type: "media",
	};
}

function sticker({
	lostBehavior = "hold",
}: {
	lostBehavior?: "hold" | "hide";
} = {}): StickerElement {
	return {
		duration: 1,
		height: 20,
		id: "sticker-element",
		mediaId: "sticker-media",
		name: "Sticker",
		startTime: 0,
		stickerId: "sticker",
		tracking: {
			lostBehavior,
			mode: "planar",
			seedPtsUs: 0,
			seedTargetQuad: seedQuad,
			sourceElementId: "video",
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

function tracks({ element }: { element: StickerElement }): TimelineTrack[] {
	return [
		{ elements: [source()], id: "media", name: "Media", type: "media" },
		{
			elements: [element],
			id: "stickers",
			name: "Stickers",
			type: "sticker",
		},
	];
}

function sidecar({
	lost = false,
}: {
	lost?: boolean;
} = {}): PlanarTrackingSidecarV1 {
	return {
		coordinateSpace: "source-display-normalized",
		direction: "forward",
		provider: {
			id: "opencv-wasm",
			parametersHash: "a".repeat(64),
			version: "test",
		},
		samples: [
			{ confidence: 1, ptsUs: 0, quad: seedQuad, status: "tracked" },
			{
				confidence: lost ? 0 : 1,
				ptsUs: 1_000_000,
				quad: destinationQuad,
				status: lost ? "lost" : "tracked",
			},
		],
		schemaVersion: 1,
		seed: { ptsUs: 0, quad: seedQuad },
		source: {
			contentSha256: "b".repeat(64),
			displayHeight: 100,
			displayWidth: 100,
			mediaId: "video-media",
		},
		timebase: "microseconds",
	};
}

describe("planar sticker export", () => {
	it("bakes every FFmpeg geometry property at project frame cadence", () => {
		const element = sticker();
		const keyframes = buildStickerPlanarTrackingExportKeyframes({
			canvasHeight: 100,
			canvasWidth: 100,
			element,
			fps: 2,
			sidecar: sidecar(),
			tracks: tracks({ element }),
		});

		expect(Object.keys(keyframes ?? {})).toHaveLength(14);
		for (const values of Object.values(keyframes ?? {})) {
			expect(values).toHaveLength(3);
		}
		expect(keyframes?.x?.map(({ value }) => value)).toEqual([30, 33.75, 37.5]);
		expect(keyframes?.y?.at(-1)?.value).toBeCloseTo(35);
		expect(keyframes?.width?.at(-1)?.value).toBeCloseTo(35);
		expect(keyframes?.height?.at(-1)?.value).toBeCloseTo(30);
		expect(keyframes?.topLeftX?.at(-1)?.value).toBeCloseTo(1 / 7);
		expect(keyframes?.topRightY?.at(-1)?.value).toBeCloseTo(1 / 6);
		expect(keyframes?.bottomRightX?.at(-1)?.value).toBeCloseTo(6 / 7);
		expect(keyframes?.bottomLeftY?.at(-1)?.value).toBeCloseTo(5 / 6);
	});

	it("bakes hidden opacity after a lost sample", () => {
		const element = sticker({ lostBehavior: "hide" });
		const keyframes = buildStickerPlanarTrackingExportKeyframes({
			canvasHeight: 100,
			canvasWidth: 100,
			element,
			fps: 2,
			sidecar: sidecar({ lost: true }),
			tracks: tracks({ element }),
		});
		expect(keyframes?.opacity?.map(({ value }) => value)).toEqual([1, 0, 0]);
	});

	it("fails explicitly when the verified sidecar is missing", () => {
		const element = sticker();
		expect(() =>
			buildStickerPlanarTrackingExportKeyframes({
				canvasHeight: 100,
				canvasWidth: 100,
				element,
				fps: 30,
				sidecar: undefined,
				tracks: tracks({ element }),
			})
		).toThrowError(StickerPlanarTrackingExportDataError);
	});
});
