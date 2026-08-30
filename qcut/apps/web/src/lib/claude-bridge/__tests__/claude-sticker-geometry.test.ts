import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildCompositionPlan } from "@qcut/editor-core";
import type { TimelineElement, TimelineTrack } from "@/types/timeline";
import { addClaudeStickerElement } from "../claude-timeline-bridge-helpers";
import { applyElementChanges } from "../claude-timeline-bridge-elements";
import { resolveClaudeStickerGeometry } from "../claude-sticker-geometry";

const overlayMocks = vi.hoisted(() => ({
	addOverlaySticker: vi.fn(),
	getStickersForExport: vi.fn(() => []),
	overlayStickers: new Map<string, { id: string; mediaItemId: string }>(),
}));
const timelineBridgeMocks = vi.hoisted(() => ({
	getState: vi.fn(),
}));
const mediaMocks = vi.hoisted(() => ({
	mediaItems: [{ id: "m1" }] as Array<{
		id: string;
		metadata?: Record<string, unknown>;
	}>,
}));

vi.mock("@/stores/timeline/timeline-store", () => ({
	useTimelineStore: { getState: timelineBridgeMocks.getState },
}));
vi.mock("@/stores/project-store", () => ({
	useProjectStore: {
		getState: vi.fn(() => ({ activeProject: { id: "project-1" } })),
	},
}));
vi.mock("@/stores/media/media-store", () => ({
	useMediaStore: {
		getState: vi.fn(() => ({ mediaItems: mediaMocks.mediaItems })),
	},
}));
vi.mock("@qcut/platform-core", () => ({
	platform: vi.fn(() => ({ projectFolder: undefined })),
}));
vi.mock("@/lib/debug/debug-config", () => ({
	debugLog: vi.fn(),
	debugWarn: vi.fn(),
	debugError: vi.fn(),
}));
vi.mock("@/stores/stickers-overlay-store", () => ({
	useStickersOverlayStore: {
		getState: vi.fn(() => ({
			addOverlaySticker: overlayMocks.addOverlaySticker,
			getStickersForExport: overlayMocks.getStickersForExport,
			overlayStickers: overlayMocks.overlayStickers,
		})),
	},
}));

function testTrack({
	elements = [],
	id,
	type,
}: {
	elements?: TimelineElement[];
	id: string;
	type: "media" | "sticker";
}): TimelineTrack {
	return {
		id,
		name: id,
		type,
		elements,
		muted: false,
		hidden: false,
		locked: false,
		...(type === "media" ? { isMain: true } : {}),
	};
}

function makeTimelineStore({
	createTrackAt = "end",
	returnedTrackId = "sticker-track",
	tracks = [],
}: {
	createTrackAt?: "end" | "start";
	returnedTrackId?: string;
	tracks?: TimelineTrack[];
} = {}) {
	const orderedTracks: TimelineTrack[] = tracks.map((track, order) => ({
		...track,
		order,
	}));
	const compactTrackOrder = () => {
		for (const [order, track] of orderedTracks.entries()) track.order = order;
	};
	const findOrCreateTrack = vi.fn(() => {
		if (!orderedTracks.some((track) => track.id === returnedTrackId)) {
			const created = testTrack({ id: returnedTrackId, type: "sticker" });
			if (createTrackAt === "start") orderedTracks.unshift(created);
			else orderedTracks.push(created);
			compactTrackOrder();
		}
		return returnedTrackId;
	});
	const moveTrack = vi.fn((trackId: string, toIndex: number) => {
		const fromIndex = orderedTracks.findIndex((track) => track.id === trackId);
		if (fromIndex < 0 || fromIndex === toIndex) return;
		const [track] = orderedTracks.splice(fromIndex, 1);
		orderedTracks.splice(toIndex, 0, track);
		compactTrackOrder();
	});
	const addElementToTrack = vi.fn(
		(trackId: string, element: Record<string, unknown>) => {
			const track = orderedTracks.find((candidate) => candidate.id === trackId);
			track?.elements.push({
				...element,
				id: "sticker-element",
			} as unknown as TimelineElement);
			return "sticker-element";
		}
	);
	return {
		tracks: orderedTracks,
		findOrCreateTrack,
		moveTrack,
		addElementToTrack,
		removeElementFromTrack: vi.fn(),
	};
}

function baseVideoElement(): TimelineElement {
	return {
		id: "base-video",
		type: "media",
		mediaId: "base-video-media",
		name: "Base video",
		startTime: 0,
		duration: 5,
		trimStart: 0,
		trimEnd: 0,
	} as TimelineElement;
}

function makeStickerRuntimeUpdateStore({
	updateStickerElement,
}: {
	updateStickerElement: ReturnType<typeof vi.fn>;
}) {
	return {
		tracks: [
			{
				id: "sticker-track",
				elements: [
					{
						id: "sticker-element",
						type: "sticker",
						stickerId: "sticker-instance-1",
						stickerAssetId: "sticker-lab:jianying-2026-08-23-batch-18-v2:18001",
						mediaId: "m1",
						stickerRuntime: { kind: "direct-gif" },
						startTime: 0,
						duration: 5,
						trimStart: 0,
						trimEnd: 0,
					},
				],
			},
		],
		pushHistory: vi.fn(),
		updateStickerElement,
	};
}

describe("Claude sticker geometry", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		timelineBridgeMocks.getState.mockReturnValue({});
		mediaMocks.mediaItems = [{ id: "m1" }];
		overlayMocks.overlayStickers.clear();
	});

	it("converts the 200 pixel default to canonical percentages", () => {
		expect(
			resolveClaudeStickerGeometry({
				canvasSize: { height: 1080, width: 1920 },
				patch: {},
			})
		).toEqual({
			height: expect.closeTo((200 / 1080) * 100, 5),
			width: expect.closeTo((200 / 1080) * 100, 5),
			x: expect.closeTo((100 / 1920) * 100, 5),
			y: expect.closeTo((100 / 1080) * 100, 5),
		});
	});

	it("moves a newly created sticker lane above the media composition", async () => {
		const timelineStore = makeTimelineStore({
			tracks: [
				testTrack({
					id: "media-track",
					type: "media",
					elements: [baseVideoElement()],
				}),
			],
		});

		await addClaudeStickerElement({
			element: { mediaId: "m1", stickerId: "sticker-instance-1" },
			projectId: "project-1",
			timelineStore: timelineStore as never,
		});

		expect(timelineStore.moveTrack).toHaveBeenCalledWith("sticker-track", 0);
		expect(timelineStore.tracks.map((track) => track.type)).toEqual([
			"sticker",
			"media",
		]);
		const composition = buildCompositionPlan({
			tracks: timelineStore.tracks,
			currentTime: 1,
		});
		expect(composition.visualLayers.map(({ element }) => element.type)).toEqual(
			["media", "sticker"]
		);
	});

	it("moves an overlap-created sticker lane above existing visual lanes", async () => {
		const existingSticker = testTrack({
			id: "sticker-track-1",
			type: "sticker",
			elements: [
				{
					id: "existing-sticker",
					type: "sticker",
					stickerId: "existing-sticker-instance",
					mediaId: "existing-sticker-media",
					name: "Existing sticker",
					startTime: 0,
					duration: 5,
					trimStart: 0,
					trimEnd: 0,
				},
			],
		});
		const timelineStore = makeTimelineStore({
			returnedTrackId: "sticker-track-2",
			tracks: [
				existingSticker,
				testTrack({
					id: "media-track",
					type: "media",
					elements: [baseVideoElement()],
				}),
			],
		});

		await addClaudeStickerElement({
			element: { mediaId: "m1", stickerId: "sticker-instance-2" },
			projectId: "project-1",
			timelineStore: timelineStore as never,
		});

		expect(timelineStore.moveTrack).toHaveBeenCalledWith("sticker-track-2", 0);
		expect(timelineStore.tracks.map((track) => track.id)).toEqual([
			"sticker-track-2",
			"sticker-track-1",
			"media-track",
		]);
	});

	it("does not reorder an existing reusable sticker lane", async () => {
		const timelineStore = makeTimelineStore({
			tracks: [
				testTrack({ id: "sticker-track", type: "sticker" }),
				testTrack({ id: "media-track", type: "media" }),
			],
		});

		await addClaudeStickerElement({
			element: { mediaId: "m1", stickerId: "sticker-instance-1" },
			projectId: "project-1",
			timelineStore: timelineStore as never,
		});

		expect(timelineStore.moveTrack).not.toHaveBeenCalled();
		expect(timelineStore.tracks.map((track) => track.id)).toEqual([
			"sticker-track",
			"media-track",
		]);
	});

	it("repairs a legacy reusable sticker lane below the media composition", async () => {
		const timelineStore = makeTimelineStore({
			tracks: [
				testTrack({
					id: "media-track",
					type: "media",
					elements: [baseVideoElement()],
				}),
				testTrack({ id: "sticker-track", type: "sticker" }),
			],
		});

		await addClaudeStickerElement({
			element: { mediaId: "m1", stickerId: "sticker-instance-1" },
			projectId: "project-1",
			timelineStore: timelineStore as never,
		});

		expect(timelineStore.moveTrack).toHaveBeenCalledWith("sticker-track", 0);
		expect(timelineStore.tracks.map((track) => track.type)).toEqual([
			"sticker",
			"media",
		]);
		const composition = buildCompositionPlan({
			tracks: timelineStore.tracks,
			currentTime: 1,
		});
		expect(composition.visualLayers.map(({ element }) => element.type)).toEqual(
			["media", "sticker"]
		);
	});

	it("keeps a by-arrival sticker lane at the top", async () => {
		const timelineStore = makeTimelineStore({
			createTrackAt: "start",
			tracks: [testTrack({ id: "media-track", type: "media" })],
		});

		await addClaudeStickerElement({
			element: { mediaId: "m1", stickerId: "sticker-instance-1" },
			projectId: "project-1",
			timelineStore: timelineStore as never,
		});

		expect(timelineStore.moveTrack).toHaveBeenCalledWith("sticker-track", 0);
		expect(timelineStore.tracks.map((track) => track.id)).toEqual([
			"sticker-track",
			"media-track",
		]);
	});

	it("stores the timeline element in the canonical percentage contract", async () => {
		const timelineStore = makeTimelineStore();
		const stickerRuntime = {
			kind: "direct-gif",
			canvasSize: { width: 2, height: 2 },
			cycleDurationSeconds: 0.1,
			frames: [
				{
					startSeconds: 0,
					durationSeconds: 0.1,
					delayCentiseconds: 10,
					disposalMethod: 1,
					frameRect: { x: 0, y: 0, width: 2, height: 2 },
					hasTransparency: true,
					transparentColorIndex: 0,
				},
			],
			repeat: { kind: "infinite" },
			completion: "freeze-last",
		} as const;
		// Top-left pixel geometry on a 1920x1080 canvas: a 384x384 sticker at
		// (768,348). Center = (960,540) = canvas center → 50%,50%. Size is a
		// percentage of the shorter side (1080): 384/1080 = 35.5…%.
		await addClaudeStickerElement({
			element: {
				stickerId: "s1",
				mediaId: "m1",
				x: 768,
				y: 348,
				width: 384,
				height: 384,
				stickerRuntime,
			},
			projectId: "project-1",
			timelineStore: timelineStore as never,
		});

		expect(timelineStore.addElementToTrack).toHaveBeenCalledOnce();
		const [, stored] = timelineStore.addElementToTrack.mock.calls[0];
		expect(stored.type).toBe("sticker");
		expect(stored.stickerId).toBe("s1");
		expect(stored.stickerRuntime).toEqual(stickerRuntime);
		expect(stored.x).toBeCloseTo(50, 5);
		expect(stored.y).toBeCloseTo(50, 5);
		expect(stored.width).toBeCloseTo((384 / 1080) * 100, 5);
		expect(stored.height).toBeCloseTo((384 / 1080) * 100, 5);

		// The overlay store must receive the same percentages, so preview and
		// export agree with the timeline element.
		expect(overlayMocks.addOverlaySticker).toHaveBeenCalledWith(
			"m1",
			expect.objectContaining({
				id: "s1",
				position: {
					x: expect.closeTo(50, 5),
					y: expect.closeTo(50, 5),
				},
				size: {
					width: expect.closeTo((384 / 1080) * 100, 5),
					height: expect.closeTo((384 / 1080) * 100, 5),
				},
			})
		);
		expect(overlayMocks.addOverlaySticker).toHaveBeenCalledOnce();
	});

	it("uses the imported media runtime and keeps asset identity separate", async () => {
		const timelineStore = makeTimelineStore();
		const stickerRuntime = {
			kind: "direct-gif",
			canvasSize: { width: 1, height: 1 },
			cycleDurationSeconds: 0.1,
			frames: [
				{
					startSeconds: 0,
					durationSeconds: 0.1,
					delayCentiseconds: 10,
					disposalMethod: 1,
					frameRect: { x: 0, y: 0, width: 1, height: 1 },
					hasTransparency: false,
				},
			],
			repeat: { kind: "infinite" },
			completion: "freeze-last",
		} as const;
		mediaMocks.mediaItems = [{ id: "m1", metadata: { stickerRuntime } }];

		await addClaudeStickerElement({
			element: {
				mediaId: "m1",
				stickerAssetId: "sticker-lab:jianying-2026-08-23-batch-18-v2:18001",
				stickerId: "sticker-instance-1",
			},
			projectId: "project-1",
			timelineStore: timelineStore as never,
		});

		const [, stored] = timelineStore.addElementToTrack.mock.calls[0];
		expect(stored).toMatchObject({
			stickerAssetId: "sticker-lab:jianying-2026-08-23-batch-18-v2:18001",
			stickerId: "sticker-instance-1",
			stickerRuntime,
		});
	});

	it("reuses the overlay projected by the timeline write", async () => {
		const timelineStore = makeTimelineStore();
		timelineStore.addElementToTrack.mockImplementation(() => {
			overlayMocks.overlayStickers.set("sticker-instance-1", {
				id: "sticker-instance-1",
				mediaItemId: "m1",
			});
			return "sticker-element";
		});

		await addClaudeStickerElement({
			element: { mediaId: "m1", stickerId: "sticker-instance-1" },
			projectId: "project-1",
			timelineStore: timelineStore as never,
		});

		expect(overlayMocks.addOverlaySticker).not.toHaveBeenCalled();
		expect(timelineStore.removeElementFromTrack).not.toHaveBeenCalled();
	});

	it("rejects an instance ID that existed before the timeline write", async () => {
		const timelineStore = makeTimelineStore();
		overlayMocks.overlayStickers.set("sticker-instance-1", {
			id: "sticker-instance-1",
			mediaItemId: "m1",
		});

		await expect(
			addClaudeStickerElement({
				element: { mediaId: "m1", stickerId: "sticker-instance-1" },
				projectId: "project-1",
				timelineStore: timelineStore as never,
			})
		).rejects.toThrow("Sticker instance ID already exists");
		expect(timelineStore.addElementToTrack).not.toHaveBeenCalled();
	});

	it("applies CLI pixel updates to the canonical sticker geometry", () => {
		const updateStickerElement = vi.fn();
		const timelineStore = {
			tracks: [
				{
					id: "sticker-track",
					elements: [
						{
							id: "sticker-element",
							type: "sticker",
							stickerId: "s1",
							mediaId: "m1",
							startTime: 0,
							duration: 5,
							trimStart: 0,
							trimEnd: 0,
							x: 50,
							y: 50,
							width: 20,
							height: 20,
						},
					],
				},
			],
			pushHistory: vi.fn(),
			updateStickerElement,
		};
		timelineBridgeMocks.getState.mockReturnValue(timelineStore);

		const applied = applyElementChanges({
			elementId: "sticker-element",
			changes: {
				x: 100,
				y: 120,
				width: 200,
				height: 100,
				rotation: 15,
				opacity: 0.5,
			},
			pushHistory: true,
		});

		expect(applied).toBe(true);
		expect(timelineStore.pushHistory).toHaveBeenCalledOnce();
		expect(updateStickerElement).toHaveBeenCalledWith(
			"sticker-track",
			"sticker-element",
			expect.objectContaining({
				x: expect.closeTo((200 / 1920) * 100, 5),
				y: expect.closeTo((170 / 1080) * 100, 5),
				width: expect.closeTo((200 / 1080) * 100, 5),
				height: expect.closeTo((100 / 1080) * 100, 5),
				rotation: 15,
				opacity: 0.5,
			}),
			false
		);
	});

	it("clears stale runtime metadata when CLI replaces the sticker source", () => {
		mediaMocks.mediaItems = [{ id: "m1" }, { id: "m2" }];
		const updateStickerElement = vi.fn();
		timelineBridgeMocks.getState.mockReturnValue(
			makeStickerRuntimeUpdateStore({ updateStickerElement })
		);

		const applied = applyElementChanges({
			elementId: "sticker-element",
			changes: {
				mediaId: "m2",
				stickerAssetId: "custom_m2",
				stickerRuntime: null,
			},
			pushHistory: false,
		});

		expect(applied).toBe(true);
		const updates = updateStickerElement.mock.calls[0][2];
		expect(updates).toMatchObject({
			mediaId: "m2",
			stickerAssetId: "custom_m2",
		});
		expect(updates).toHaveProperty("stickerRuntime", undefined);
		expect(updates).not.toHaveProperty("stickerId");
	});

	it("clears stale runtime for a media-only static replacement", () => {
		mediaMocks.mediaItems = [{ id: "m1" }, { id: "m2" }];
		const updateStickerElement = vi.fn();
		timelineBridgeMocks.getState.mockReturnValue(
			makeStickerRuntimeUpdateStore({ updateStickerElement })
		);

		const applied = applyElementChanges({
			elementId: "sticker-element",
			changes: { mediaId: "m2" },
			pushHistory: false,
		});

		expect(applied).toBe(true);
		expect(updateStickerElement.mock.calls[0][2]).toMatchObject({
			mediaId: "m2",
			stickerRuntime: undefined,
		});
	});

	it("adopts the replacement GIF runtime when CLI changes the source", () => {
		const replacementRuntime = {
			kind: "direct-gif",
			canvasSize: { width: 2, height: 2 },
			cycleDurationSeconds: 0.2,
			frames: [
				{
					startSeconds: 0,
					durationSeconds: 0.2,
					delayCentiseconds: 20,
					disposalMethod: 1,
					frameRect: { x: 0, y: 0, width: 2, height: 2 },
					hasTransparency: false,
				},
			],
			repeat: { kind: "infinite" },
			completion: "freeze-last",
		} as const;
		mediaMocks.mediaItems = [
			{ id: "m1" },
			{ id: "m2", metadata: { stickerRuntime: replacementRuntime } },
		];
		const updateStickerElement = vi.fn();
		timelineBridgeMocks.getState.mockReturnValue(
			makeStickerRuntimeUpdateStore({ updateStickerElement })
		);

		const applied = applyElementChanges({
			elementId: "sticker-element",
			changes: {
				mediaId: "m2",
				stickerAssetId: "custom_m2",
				stickerRuntime: null,
			},
			pushHistory: false,
		});

		expect(applied).toBe(true);
		expect(updateStickerElement.mock.calls[0][2]).toMatchObject({
			mediaId: "m2",
			stickerAssetId: "custom_m2",
			stickerRuntime: replacementRuntime,
		});
	});

	it("adopts GIF runtime for a media-only replacement", () => {
		const replacementRuntime = {
			kind: "direct-gif",
			canvasSize: { width: 2, height: 2 },
			cycleDurationSeconds: 0.2,
			frames: [
				{
					startSeconds: 0,
					durationSeconds: 0.2,
					delayCentiseconds: 20,
					disposalMethod: 1,
					frameRect: { x: 0, y: 0, width: 2, height: 2 },
					hasTransparency: false,
				},
			],
			repeat: { kind: "infinite" },
			completion: "freeze-last",
		} as const;
		mediaMocks.mediaItems = [
			{ id: "m1" },
			{ id: "m2", metadata: { stickerRuntime: replacementRuntime } },
		];
		const updateStickerElement = vi.fn();
		timelineBridgeMocks.getState.mockReturnValue(
			makeStickerRuntimeUpdateStore({ updateStickerElement })
		);

		const applied = applyElementChanges({
			elementId: "sticker-element",
			changes: { mediaId: "m2" },
			pushHistory: false,
		});

		expect(applied).toBe(true);
		expect(updateStickerElement.mock.calls[0][2]).toMatchObject({
			mediaId: "m2",
			stickerRuntime: replacementRuntime,
		});
	});

	it("rejects a missing replacement media source", () => {
		const updateStickerElement = vi.fn();
		timelineBridgeMocks.getState.mockReturnValue(
			makeStickerRuntimeUpdateStore({ updateStickerElement })
		);

		const applied = applyElementChanges({
			elementId: "sticker-element",
			changes: { mediaId: "missing-media" },
			pushHistory: false,
		});

		expect(applied).toBe(false);
		expect(updateStickerElement).not.toHaveBeenCalled();
	});
});
