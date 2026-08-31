import type {
	PlanarQuad,
	PlanarTrackingReference,
	StickerMotionTracking,
	StickerPlanarTracking,
} from "@qcut/editor-core";
import type { QCutDraftExportSnapshotV1 } from "@qcut/editor-core/jianying-draft";
import { describe, expect, it } from "vitest";
import type { JsonValue } from "../runtime-json.js";
import { validateSnapshot } from "../snapshot-runtime-validation.js";

const HASH = "a".repeat(64);

function createQuad(): PlanarQuad {
	return {
		topLeft: { x: 0.1, y: 0.1 },
		topRight: { x: 0.8, y: 0.12 },
		bottomRight: { x: 0.82, y: 0.75 },
		bottomLeft: { x: 0.08, y: 0.78 },
	};
}

function createReference(): PlanarTrackingReference {
	return {
		schemaVersion: 1,
		id: "surface-1",
		sourceMediaId: "video-media",
		resultUri: "project-tracking:surface-1",
		resultSha256: HASH,
		seedPtsUs: 500_000,
		seedQuad: createQuad(),
		direction: "both",
		provider: "opencv-wasm",
		providerVersion: "4.12.0-qcut.1",
		analysisWidth: 960,
		analysisHeight: 540,
		status: "ready",
		sampleCount: 3,
		trackedRange: { startPtsUs: 0, endPtsUs: 1_000_000 },
	};
}

function createBinding(): StickerPlanarTracking {
	return {
		mode: "planar",
		sourceElementId: "video-element",
		surfaceTrackingId: "surface-1",
		seedPtsUs: 500_000,
		seedTargetQuad: createQuad(),
		lostBehavior: "hold",
	};
}

function createMotionBinding(): StickerMotionTracking {
	return {
		mode: "motion",
		targetElementId: "video-element",
		targetMaskId: "person-mask",
		anchor: {
			centerX: 0.5,
			centerY: 0.5,
			width: 0.25,
			height: 0.25,
			rotation: 12,
		},
		followScale: true,
		followRotation: true,
	};
}

function createSnapshot(): QCutDraftExportSnapshotV1 {
	return {
		media: [
			{
				duration: 2,
				height: 1080,
				id: "video-media",
				name: "video.mp4",
				sourcePath: "/tmp/video.mp4",
				type: "video",
				width: 1920,
			},
			{
				height: 100,
				id: "sticker-media",
				name: "sticker.png",
				sourcePath: "/tmp/sticker.png",
				type: "image",
				width: 100,
			},
		],
		project: {
			backgroundColor: "transparent",
			backgroundType: "color",
			fps: 30,
			height: 1080,
			id: "project",
			name: "Planar tracking",
			sceneId: "scene",
			width: 1920,
		},
		schemaVersion: 1,
		timelineDurationByElementId: {
			"sticker-element": 2,
			"video-element": 2,
		},
		tracks: [
			{
				elements: [
					{
						duration: 2,
						id: "video-element",
						mediaId: "video-media",
						name: "Video",
						startTime: 0,
						surfaceTrackings: [createReference()],
						trimEnd: 2,
						trimStart: 0,
						type: "media",
					},
				],
				id: "video-track",
				name: "Video",
				type: "media",
			},
			{
				elements: [
					{
						duration: 2,
						id: "sticker-element",
						mediaId: "sticker-media",
						name: "Sticker",
						startTime: 0,
						stickerId: "sticker-instance",
						tracking: createBinding(),
						trimEnd: 2,
						trimStart: 0,
						type: "sticker",
					},
				],
				id: "sticker-track",
				name: "Stickers",
				type: "sticker",
			},
		],
	};
}

function validate({ snapshot }: { snapshot: QCutDraftExportSnapshotV1 }): void {
	validateSnapshot({
		path: "$.snapshot",
		value: snapshot as unknown as JsonValue,
	});
}

describe("planar tracking snapshot validation", () => {
	it("accepts a media result reference and planar sticker binding", () => {
		const snapshot = createSnapshot();
		expect(() => validate({ snapshot })).not.toThrow();
	});

	it("accepts motion tracking rotation fields", () => {
		const snapshot = createSnapshot();
		const stickerElement = snapshot.tracks[1]?.elements[0];
		if (!stickerElement || stickerElement.type !== "sticker") return;
		stickerElement.tracking = createMotionBinding();

		expect(() => validate({ snapshot })).not.toThrow();
	});

	it("rejects a malformed motion followRotation value", () => {
		const snapshot = createSnapshot();
		const stickerElement = snapshot.tracks[1]?.elements[0];
		if (!stickerElement || stickerElement.type !== "sticker") return;
		stickerElement.tracking = {
			...createMotionBinding(),
			followRotation: "yes",
		} as never;

		expect(() => validate({ snapshot })).toThrow(
			"$.snapshot.tracks[1].elements[0].tracking.followRotation"
		);
	});

	it("rejects a malformed motion anchor rotation value", () => {
		const snapshot = createSnapshot();
		const stickerElement = snapshot.tracks[1]?.elements[0];
		if (!stickerElement || stickerElement.type !== "sticker") return;
		stickerElement.tracking = {
			...createMotionBinding(),
			anchor: {
				...createMotionBinding().anchor,
				rotation: "clockwise",
			},
		} as never;

		expect(() => validate({ snapshot })).toThrow(
			"$.snapshot.tracks[1].elements[0].tracking.anchor.rotation"
		);
	});

	it("rejects unsafe result locations with the exact snapshot path", () => {
		const snapshot = createSnapshot();
		const mediaElement = snapshot.tracks[0]?.elements[0];
		if (!mediaElement || mediaElement.type !== "media") return;
		mediaElement.surfaceTrackings = [
			{ ...createReference(), resultUri: "file:///tmp/result.json" },
		];

		expect(() => validate({ snapshot })).toThrow(
			"$.snapshot.tracks[0].elements[0].surfaceTrackings[0].resultUri"
		);
	});

	it("rejects unknown reference fields", () => {
		const snapshot = createSnapshot();
		const mediaElement = snapshot.tracks[0]?.elements[0];
		if (!mediaElement || mediaElement.type !== "media") return;
		mediaElement.surfaceTrackings = [
			{ ...createReference(), privatePath: "/tmp/private" } as never,
		];

		expect(() => validate({ snapshot })).toThrow("Unknown properties");
	});

	it("rejects malformed planar bindings at their nested field", () => {
		const snapshot = createSnapshot();
		const stickerElement = snapshot.tracks[1]?.elements[0];
		if (!stickerElement || stickerElement.type !== "sticker") return;
		stickerElement.tracking = {
			...createBinding(),
			lostBehavior: "drift",
		} as never;

		expect(() => validate({ snapshot })).toThrow(
			"$.snapshot.tracks[1].elements[0].tracking.lostBehavior"
		);
	});
});
