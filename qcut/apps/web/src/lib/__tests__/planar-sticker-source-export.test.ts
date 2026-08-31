import { buildStickerFilterGraph } from "../../../../../electron/ffmpeg/sticker-filter-graph";
import type { PlanarTrackingSidecarV1, TProject } from "@qcut/editor-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectStore } from "@/stores/project-store";
import type { MediaItem } from "@/stores/media/media-store-types";
import { useTimelineStore } from "@/stores/timeline/timeline-store";
import type {
	MediaElement,
	PlanarQuad,
	StickerElement,
	TimelineTrack,
} from "@/types/timeline";

const loadSidecar = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tracking/planar-tracking-result-loader", () => ({
	loadStickerPlanarTrackingSidecar: loadSidecar,
}));

import { extractStickerSources } from "../export-cli/sources/sticker-sources";

const seedQuad: PlanarQuad = {
	topLeft: { x: 0.2, y: 0.2 },
	topRight: { x: 0.4, y: 0.2 },
	bottomRight: { x: 0.4, y: 0.4 },
	bottomLeft: { x: 0.2, y: 0.4 },
};

function sidecar(): PlanarTrackingSidecarV1 {
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
				confidence: 1,
				ptsUs: 1_000_000,
				quad: {
					topLeft: { x: 0.25, y: 0.2 },
					topRight: { x: 0.55, y: 0.25 },
					bottomRight: { x: 0.5, y: 0.5 },
					bottomLeft: { x: 0.2, y: 0.45 },
				},
				status: "tracked",
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

function timeline(): {
	sticker: StickerElement;
	tracks: TimelineTrack[];
} {
	const media: MediaElement = {
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
	const sticker: StickerElement = {
		duration: 1,
		height: 20,
		id: "sticker-element",
		mediaId: "sticker-media",
		name: "Sticker",
		startTime: 0,
		stickerId: "sticker",
		tracking: {
			lostBehavior: "hold",
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
	return {
		sticker,
		tracks: [
			{ elements: [media], id: "media", name: "Media", type: "media" },
			{
				elements: [sticker],
				id: "stickers",
				name: "Stickers",
				type: "sticker",
			},
		],
	};
}

function project(): TProject {
	const now = new Date(0);
	return {
		canvasMode: "custom",
		canvasSize: { height: 100, width: 100 },
		createdAt: now,
		currentSceneId: "scene",
		id: "project",
		name: "Project",
		scenes: [
			{
				createdAt: now,
				id: "scene",
				isMain: true,
				name: "Main",
				updatedAt: now,
			},
		],
		thumbnail: "",
		updatedAt: now,
	};
}

function stickerItem(): MediaItem {
	return {
		file: new File([], "sticker.png"),
		id: "sticker-media",
		localPath: "/tmp/sticker.png",
		name: "Sticker",
		type: "image",
		url: "blob:sticker",
	};
}

function stickerStore() {
	return async () => ({
		getStickersForExport: () => [
			{
				height: 20,
				id: "sticker",
				maintainAspectRatio: true,
				mediaItemId: "sticker-media",
				opacity: 1,
				position: { x: 30, y: 30 },
				rotation: 0,
				size: { height: 20, width: 20 },
				width: 20,
				zIndex: 1,
			},
		],
	});
}

describe("planar sticker source export", () => {
	beforeEach(() => {
		loadSidecar.mockReset();
		useProjectStore.setState({ activeProject: project() });
		useTimelineStore.setState({ _tracks: [], tracks: [] });
	});

	it("passes sidecar geometry into FFmpeg frame-evaluated perspective", async () => {
		const { tracks } = timeline();
		useTimelineStore.setState({ _tracks: tracks, tracks });
		loadSidecar.mockResolvedValue(sidecar());
		const sources = await extractStickerSources(
			[stickerItem()],
			"session",
			100,
			100,
			1,
			stickerStore(),
			{
				saveStickerForExport: vi.fn(async () => ({
					path: "/tmp/sticker.png",
					success: true,
				})),
			},
			vi.fn(),
			2
		);

		expect(sources).toHaveLength(1);
		expect(sources[0].maintainAspectRatio).toBe(false);
		expect(sources[0].keyframes?.topLeftX).toHaveLength(3);
		expect(loadSidecar).toHaveBeenCalledWith(
			expect.objectContaining({ projectId: "project" })
		);
		const graph = buildStickerFilterGraph({
			inputLabel: "1:v",
			labelPrefix: "planar",
			sticker: sources[0],
		});
		const filters = graph.filterSteps.join(";");
		expect(filters).toContain("perspective=");
		expect(filters).toContain("eval=frame");
		expect(graph.x).toContain("overlay_w/2");
	});

	it("rejects export when sidecar verification fails", async () => {
		const { tracks } = timeline();
		useTimelineStore.setState({ _tracks: tracks, tracks });
		loadSidecar.mockRejectedValue(new Error("SHA-256 mismatch"));
		await expect(
			extractStickerSources(
				[stickerItem()],
				"session",
				100,
				100,
				1,
				stickerStore(),
				{
					saveStickerForExport: vi.fn(async () => ({
						path: "/tmp/sticker.png",
						success: true,
					})),
				},
				vi.fn(),
				2
			)
		).rejects.toThrow("SHA-256 mismatch");
	});
});
