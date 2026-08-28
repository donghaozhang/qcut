import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	buildStickerUploadMetadata,
	parseStickerFileRuntime,
	useStickerSelect,
} from "../hooks/use-sticker-select";

const MINIMAL_GIF_BYTES = new Uint8Array([
	71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 0, 0, 0, 255, 255, 255, 44, 0,
	0, 0, 0, 1, 0, 1, 0, 0, 2, 1, 76, 0, 59,
]);

const mocks = vi.hoisted(() => ({
	addMediaItem: vi.fn(),
	addOverlaySticker: vi.fn(),
	addRecentSticker: vi.fn(),
	createStickerMediaUrl: vi.fn(),
	downloadStickerResource: vi.fn(),
	isAnimatedStickerAsset: vi.fn(),
	isAnimatedStickerFile: vi.fn(),
	mediaItems: [] as Array<{ thumbnailUrl?: string; url?: string }>,
	overlayStickers: new Map<string, unknown>(),
	projectState: {
		activeProject: { id: "project-stickers" } as { id: string } | null,
	},
	removeMediaItem: vi.fn(),
	removeOverlaySticker: vi.fn(),
	resolveStickerAssetEntry: vi.fn(),
	timelineAddSticker: vi.fn(),
	toastError: vi.fn(),
	toastSuccess: vi.fn(),
	updateRuntimeState: vi.fn(),
}));

vi.mock("sonner", () => ({
	toast: { error: mocks.toastError, success: mocks.toastSuccess },
}));

vi.mock("@/lib/debug/debug-config", () => ({ debugError: vi.fn() }));

vi.mock("@/lib/assets/qcut-asset-manifest", () => ({
	resolveStickerAssetEntry: mocks.resolveStickerAssetEntry,
}));

vi.mock("@/lib/stickers/sticker-resource", () => ({
	createStickerMediaUrl: mocks.createStickerMediaUrl,
	downloadStickerResource: mocks.downloadStickerResource,
}));

vi.mock("@/lib/stickers/sticker-animation", () => ({
	isAnimatedStickerAsset: mocks.isAnimatedStickerAsset,
	isAnimatedStickerFile: mocks.isAnimatedStickerFile,
}));

vi.mock("@/lib/stickers/timeline-sticker-integration", () => ({
	timelineStickerIntegration: {
		addStickerToTimeline: mocks.timelineAddSticker,
	},
}));

vi.mock("@/stores/editor/playback-store", () => ({
	usePlaybackStore: { getState: () => ({ currentTime: 2 }) },
}));

vi.mock("@/stores/media/media-store", () => {
	const mediaState = {
		addMediaItem: mocks.addMediaItem,
		mediaItems: mocks.mediaItems,
		removeMediaItem: mocks.removeMediaItem,
	};
	return {
		useMediaStore: Object.assign(
			(selector: (state: typeof mediaState) => unknown) => selector(mediaState),
			{ getState: () => mediaState }
		),
	};
});

vi.mock("@/stores/project-store", () => ({
	useProjectStore: Object.assign(
		(selector: (state: typeof mocks.projectState) => unknown) =>
			selector(mocks.projectState),
		{ getState: () => mocks.projectState }
	),
}));

vi.mock("@/stores/asset-library-store", () => ({
	useAssetLibraryStore: (
		selector: (state: {
			updateRuntimeState: typeof mocks.updateRuntimeState;
		}) => unknown
	) => selector({ updateRuntimeState: mocks.updateRuntimeState }),
}));

vi.mock("@/stores/stickers-store", () => ({
	useStickersStore: (
		selector: (state: {
			addRecentSticker: typeof mocks.addRecentSticker;
		}) => unknown
	) => selector({ addRecentSticker: mocks.addRecentSticker }),
}));

vi.mock("@/stores/stickers-overlay-store", () => {
	const overlayState = {
		addOverlaySticker: mocks.addOverlaySticker,
		overlayStickers: mocks.overlayStickers,
		removeOverlaySticker: mocks.removeOverlaySticker,
	};
	return {
		useStickersOverlayStore: Object.assign(
			(selector: (state: typeof overlayState) => unknown) =>
				selector(overlayState),
			{ getState: () => overlayState }
		),
	};
});

class LoadedImage {
	naturalHeight = 180;
	naturalWidth = 320;
	onerror: (() => void) | null = null;
	onload: (() => void) | null = null;

	set src(_value: string) {
		queueMicrotask(() => this.onload?.());
	}
}

beforeEach(() => {
	mocks.projectState.activeProject = { id: "project-stickers" };
	mocks.addMediaItem.mockReset().mockResolvedValue("media-sticker");
	mocks.addOverlaySticker.mockReset().mockReturnValue("overlay-sticker");
	mocks.addRecentSticker.mockReset();
	mocks.createStickerMediaUrl.mockReset().mockResolvedValue({
		revoke: true,
		url: "blob:sticker-upload",
	});
	mocks.isAnimatedStickerFile.mockReset().mockResolvedValue(true);
	mocks.isAnimatedStickerAsset.mockReset().mockReturnValue(false);
	mocks.downloadStickerResource.mockReset();
	mocks.mediaItems.splice(0);
	mocks.overlayStickers.clear();
	mocks.removeMediaItem.mockReset().mockResolvedValue(undefined);
	mocks.removeOverlaySticker.mockReset();
	mocks.resolveStickerAssetEntry.mockReset();
	mocks.timelineAddSticker.mockReset();
	mocks.toastError.mockReset();
	mocks.toastSuccess.mockReset();
	mocks.updateRuntimeState.mockReset();
	vi.stubGlobal("Image", LoadedImage);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("sticker upload metadata", () => {
	it("parses GIF container timing before persisting the media item", async () => {
		const runtime = await parseStickerFileRuntime({
			animatedSticker: true,
			file: new File([MINIMAL_GIF_BYTES], "runtime.gif", {
				type: "image/gif",
			}),
		});

		expect(runtime).toMatchObject({
			kind: "direct-gif",
			canvasSize: { width: 1, height: 1 },
			cycleDurationSeconds: 0.1,
			frames: [{ delayCentiseconds: 0, durationSeconds: 0.1 }],
		});
	});

	it("writes the internal-reference contract without a local path", () => {
		const metadata = buildStickerUploadMetadata({
			animatedSticker: true,
			metadata: {
				referenceOnly: true,
				usage: "internal-reference-only",
				redistribution: "prohibited",
				batchId: "jianying-batch-18",
				itemId: "reference-1",
				checksumSha256: "a".repeat(64),
			},
		});

		expect(metadata).toEqual({
			source: "sticker-lab",
			animatedSticker: true,
			referenceOnly: true,
			usage: "internal-reference-only",
			redistribution: "prohibited",
			batchId: "jianying-batch-18",
			itemId: "reference-1",
			checksumSha256: "a".repeat(64),
		});
		expect(metadata).not.toHaveProperty("rootPath");
	});
});

describe("sticker runtime package placement", () => {
	it("persists package resources and links their IDs from the primary media", async () => {
		const descriptor = {
			completion: "freeze-last" as const,
			cycleDurationSeconds: 0.1,
			frames: [
				{
					durationSeconds: 0.1,
					source: "$resource:asset_0001",
					startSeconds: 0,
				},
			],
			kind: "png-sequence" as const,
			repeat: { kind: "infinite" as const },
		};
		const asset = {
			delivery: "bundled",
			id: "runtime-sequence",
			version: 2,
		};
		mocks.resolveStickerAssetEntry.mockReturnValue(asset);
		mocks.downloadStickerResource.mockResolvedValue({
			asset,
			blob: new Blob([new Uint8Array([9])], { type: "image/png" }),
			cacheKey: "runtime-sequence-source",
			file: new File([new Uint8Array([9])], "preview.png", {
				type: "image/png",
			}),
			resource: {},
			runtimePackage: {
				descriptor,
				primaryMediaType: "image",
				resources: [
					{
						file: new File([new Uint8Array([1])], "frame.png", {
							type: "image/png",
						}),
						mediaType: "image",
						resourceName: "asset_0001",
						sourceUrl: "/runtime/frame.png",
					},
				],
			},
		});
		mocks.addMediaItem.mockImplementation(
			async (_projectId, item: { id?: string }) => item.id ?? "media-sticker"
		);
		mocks.overlayStickers.set("overlay-sticker", { id: "overlay-sticker" });
		mocks.timelineAddSticker.mockResolvedValue({ success: true });
		const { result } = renderHook(() => useStickerSelect());

		let mediaItemId: string | undefined;
		await act(async () => {
			mediaItemId = await result.current.handleStickerSelect(
				"runtime:sequence",
				"Runtime sequence"
			);
		});

		expect(mediaItemId).toBe("media-sticker");
		expect(mocks.addMediaItem).toHaveBeenNthCalledWith(
			1,
			"project-stickers",
			expect.objectContaining({
				id: "sticker-runtime:runtime-sequence@2:asset_0001",
				metadata: expect.objectContaining({
					source: "sticker-runtime-resource",
					stickerRuntimeResourceName: "asset_0001",
				}),
			})
		);
		expect(mocks.addMediaItem).toHaveBeenNthCalledWith(
			2,
			"project-stickers",
			expect.objectContaining({
				metadata: expect.objectContaining({
					stickerRuntime: descriptor,
					stickerRuntimeResources: {
						asset_0001: "sticker-runtime:runtime-sequence@2:asset_0001",
					},
				}),
			})
		);
		expect(mocks.timelineAddSticker).toHaveBeenCalledWith(
			expect.anything(),
			2,
			5,
			expect.any(Function),
			descriptor
		);
		expect(mocks.removeMediaItem).not.toHaveBeenCalled();
	});

	it("places a restricted local runtime package through the upload path", async () => {
		const descriptor = {
			kind: "png-sequence" as const,
			cycleDurationSeconds: 1,
			frames: [
				{
					source: "$resource:asset_0001",
					startSeconds: 0,
					durationSeconds: 1,
				},
			],
			repeat: { kind: "infinite" as const },
			completion: "freeze-last" as const,
		};
		const runtimePackage = {
			descriptor,
			primaryMediaType: "image" as const,
			resources: [
				{
					file: new File([new Uint8Array([2])], "blue.png", {
						type: "image/png",
					}),
					mediaType: "image" as const,
					resourceName: "asset_0001",
					sourceUrl: "blue.png",
				},
			],
		};
		const metadata = {
			referenceOnly: true as const,
			usage: "internal-reference-only" as const,
			redistribution: "prohibited" as const,
			batchId: "jianying-2026-08-26-batch-99",
			itemId: "990001",
			checksumSha256: "c".repeat(64),
		};
		mocks.addMediaItem.mockImplementation(
			async (_projectId, item: { id?: string }) => item.id ?? "media-sticker"
		);
		mocks.overlayStickers.set("overlay-sticker", { id: "overlay-sticker" });
		mocks.timelineAddSticker.mockResolvedValue({ success: true });
		const { result } = renderHook(() => useStickerSelect());

		let mediaItemId: string | undefined;
		await act(async () => {
			mediaItemId = await result.current.handleStickerUpload({
				file: new File([new Uint8Array([1])], "preview.png", {
					type: "image/png",
				}),
				metadata,
				runtimePackage,
			});
		});

		expect(mediaItemId).toBe("media-sticker");
		expect(mocks.addMediaItem).toHaveBeenNthCalledWith(
			1,
			"project-stickers",
			expect.objectContaining({
				id: "sticker-runtime:sticker-lab:jianying-2026-08-26-batch-99:990001@1:asset_0001",
				metadata: expect.objectContaining({
					source: "sticker-runtime-resource",
					referenceOnly: true,
					usage: "internal-reference-only",
					redistribution: "prohibited",
					batchId: metadata.batchId,
					itemId: metadata.itemId,
				}),
			})
		);
		expect(mocks.addMediaItem).toHaveBeenNthCalledWith(
			2,
			"project-stickers",
			expect.objectContaining({
				metadata: expect.objectContaining({
					...metadata,
					source: "sticker-lab",
					stickerRuntime: descriptor,
					stickerRuntimeResources: {
						asset_0001:
							"sticker-runtime:sticker-lab:jianying-2026-08-26-batch-99:990001@1:asset_0001",
					},
				}),
			})
		);
		expect(mocks.timelineAddSticker).toHaveBeenCalledWith(
			expect.anything(),
			2,
			5,
			expect.any(Function),
			descriptor
		);
	});
});

describe("sticker upload timeline rollback", () => {
	it("rolls back primary and package resources when local runtime placement fails", async () => {
		mocks.addMediaItem.mockImplementation(
			async (_projectId, item: { id?: string }) => item.id ?? "media-sticker"
		);
		mocks.overlayStickers.set("overlay-sticker", { id: "overlay-sticker" });
		mocks.timelineAddSticker.mockResolvedValue({
			error: "timeline rejected runtime sticker",
			success: false,
		});
		const { result } = renderHook(() => useStickerSelect());

		await act(async () => {
			await result.current.handleStickerUpload({
				file: new File([new Uint8Array([1])], "preview.png", {
					type: "image/png",
				}),
				metadata: {
					referenceOnly: true,
					usage: "internal-reference-only",
					redistribution: "prohibited",
					batchId: "jianying-2026-08-26-batch-99",
					itemId: "990002",
					checksumSha256: "d".repeat(64),
				},
				runtimePackage: {
					descriptor: {
						kind: "png-sequence",
						cycleDurationSeconds: 1,
						frames: [
							{
								source: "$resource:asset_0001",
								startSeconds: 0,
								durationSeconds: 1,
							},
						],
						repeat: { kind: "infinite" },
						completion: "freeze-last",
					},
					primaryMediaType: "image",
					resources: [
						{
							file: new File([new Uint8Array([2])], "frame.png", {
								type: "image/png",
							}),
							mediaType: "image",
							resourceName: "asset_0001",
							sourceUrl: "frame.png",
						},
					],
				},
			});
		});

		expect(mocks.removeMediaItem).toHaveBeenCalledWith(
			"project-stickers",
			"media-sticker"
		);
		expect(mocks.removeMediaItem).toHaveBeenCalledWith(
			"project-stickers",
			"sticker-runtime:sticker-lab:jianying-2026-08-26-batch-99:990002@1:asset_0001"
		);
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
	});

	it("removes a restricted local reference when timeline placement throws", async () => {
		mocks.overlayStickers.set("overlay-sticker", { id: "overlay-sticker" });
		mocks.timelineAddSticker.mockResolvedValue({
			error: "timeline rejected sticker",
			success: false,
		});
		const metadata = {
			referenceOnly: true as const,
			usage: "internal-reference-only" as const,
			redistribution: "prohibited" as const,
			batchId: "jianying-batch-18",
			itemId: "reference-18-1",
			checksumSha256: "b".repeat(64),
		};
		const { result } = renderHook(() => useStickerSelect());
		let mediaItemId: string | undefined;

		await act(async () => {
			mediaItemId = await result.current.handleStickerUpload({
				file: new File([MINIMAL_GIF_BYTES], "reference.gif", {
					type: "image/gif",
				}),
				metadata,
			});
		});

		expect(mediaItemId).toBeUndefined();
		expect(mocks.addMediaItem).toHaveBeenCalledWith(
			"project-stickers",
			expect.objectContaining({
				metadata: expect.objectContaining({
					...metadata,
					animatedSticker: true,
					source: "sticker-lab",
				}),
			})
		);
		expect(mocks.removeMediaItem).toHaveBeenCalledWith(
			"project-stickers",
			"media-sticker"
		);
		expect(mocks.removeOverlaySticker).toHaveBeenCalledWith("overlay-sticker");
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
		expect(mocks.toastError).toHaveBeenCalledWith("timeline rejected sticker");
	});

	it("removes an ordinary upload when placement returns false", async () => {
		const { result } = renderHook(() => useStickerSelect());
		let mediaItemId: string | undefined;

		await act(async () => {
			mediaItemId = await result.current.handleStickerUpload({
				file: new File([new Uint8Array([1, 2, 3])], "ordinary.png", {
					type: "image/png",
				}),
			});
		});

		expect(mediaItemId).toBeUndefined();
		expect(mocks.addMediaItem).toHaveBeenCalledWith(
			"project-stickers",
			expect.objectContaining({
				metadata: {
					animatedSticker: true,
					source: "sticker-upload",
				},
			})
		);
		expect(mocks.timelineAddSticker).not.toHaveBeenCalled();
		expect(mocks.removeMediaItem).toHaveBeenCalledWith(
			"project-stickers",
			"media-sticker"
		);
		expect(mocks.removeOverlaySticker).toHaveBeenCalledWith("overlay-sticker");
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
		expect(mocks.toastError).toHaveBeenCalledWith(
			"Failed to add sticker to timeline"
		);
	});

	it("rolls back the original project when the active project changes", async () => {
		mocks.addMediaItem.mockImplementationOnce(async () => {
			mocks.projectState.activeProject = { id: "project-other" };
			return "media-sticker";
		});
		const { result } = renderHook(() => useStickerSelect());

		await act(async () => {
			await result.current.handleStickerUpload({
				file: new File([new Uint8Array([1, 2, 3])], "ordinary.png", {
					type: "image/png",
				}),
			});
		});

		expect(mocks.timelineAddSticker).not.toHaveBeenCalled();
		expect(mocks.removeMediaItem).toHaveBeenCalledWith(
			"project-stickers",
			"media-sticker"
		);
		expect(mocks.toastSuccess).not.toHaveBeenCalled();
		expect(mocks.toastError).toHaveBeenCalledWith(
			"Active project changed while adding sticker"
		);
	});
});
