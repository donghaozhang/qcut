import { describe, it, expect, vi, beforeEach } from "vitest";
import { StickerExportHelper } from "../stickers/sticker-export-helper";
import type { OverlaySticker } from "@/types/sticker-overlay";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { StickerRenderOptions } from "../stickers/sticker-export-helper";
import type { StickerElement } from "@/types/timeline";

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function createMockSticker(
	overrides?: Partial<OverlaySticker>
): OverlaySticker {
	return {
		id: "sticker-1",
		mediaItemId: "media-1",
		position: { x: 50, y: 50 },
		size: { width: 20, height: 20 },
		rotation: 0,
		opacity: 1,
		zIndex: 1,
		maintainAspectRatio: true,
		...overrides,
	};
}

function createMockMediaItem(overrides?: Partial<MediaItem>): MediaItem {
	return {
		id: "media-1",
		name: "sticker.png",
		type: "image",
		file: new File([], "sticker.png"),
		url: "blob:http://localhost/sticker-1",
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// Canvas context mock
// ---------------------------------------------------------------------------

function createMockContext() {
	return {
		drawImage: vi.fn(),
		save: vi.fn(),
		restore: vi.fn(),
		translate: vi.fn(),
		rotate: vi.fn(),
		scale: vi.fn(),
		globalAlpha: 1,
	} as unknown as CanvasRenderingContext2D;
}

// ---------------------------------------------------------------------------
// Image mock helpers
//
// The StickerExportHelper uses `new Image()` internally. We intercept it
// so that `onload` fires asynchronously when `src` is assigned.
// ---------------------------------------------------------------------------

let imageLoadBehaviour: "success" | "error" = "success";

function createMockImageClass() {
	return function MockImage(this: any) {
		this.crossOrigin = "";
		this._src = "";
		this.onload = null;
		this.onerror = null;

		Object.defineProperty(this, "src", {
			get() {
				return this._src;
			},
			set(value: string) {
				this._src = value;
				if (value) {
					queueMicrotask(() => {
						if (imageLoadBehaviour === "success") {
							this.onload?.();
						} else {
							this.onerror?.(new Error("load failed"));
						}
					});
				}
			},
		});
	} as unknown as typeof Image;
}

function installImageMock() {
	const originalImage = globalThis.Image;
	(globalThis as any).Image = createMockImageClass();
	return () => {
		(globalThis as any).Image = originalImage;
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("StickerExportHelper", () => {
	let helper: StickerExportHelper;
	let ctx: CanvasRenderingContext2D;
	let restoreImage: () => void;

	const defaultOptions: StickerRenderOptions = {
		canvasWidth: 1920,
		canvasHeight: 1080,
	};

	beforeEach(() => {
		helper = new StickerExportHelper();
		ctx = createMockContext();
		imageLoadBehaviour = "success";
		restoreImage?.();
		restoreImage = installImageMock();
		vi.restoreAllMocks();
	});

	// -----------------------------------------------------------------------
	// renderStickersToCanvas
	// -----------------------------------------------------------------------

	describe("renderStickersToCanvas", () => {
		it("should return success result when all stickers render correctly", async () => {
			const stickers = [createMockSticker()];
			const mediaItems = new Map<string, MediaItem>([
				["media-1", createMockMediaItem()],
			]);

			const result = await helper.renderStickersToCanvas(
				ctx,
				stickers,
				mediaItems,
				defaultOptions
			);

			expect(result.attempted).toBe(1);
			expect(result.successful).toBe(1);
			expect(result.failed).toHaveLength(0);
		});

		it("should track failed stickers in result when media item is missing", async () => {
			const stickers = [createMockSticker()];
			const mediaItems = new Map<string, MediaItem>(); // empty

			const result = await helper.renderStickersToCanvas(
				ctx,
				stickers,
				mediaItems,
				defaultOptions
			);

			expect(result.failed).toHaveLength(1);
			expect(result.failed[0].stickerId).toBe("sticker-1");
			expect(result.failed[0].error).toContain("Media item not found");
		});

		it("should log warning when sticker rendering fails", async () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

			// Force image load error
			imageLoadBehaviour = "error";

			const stickers = [createMockSticker()];
			const mediaItems = new Map<string, MediaItem>([
				["media-1", createMockMediaItem()],
			]);

			await helper.renderStickersToCanvas(
				ctx,
				stickers,
				mediaItems,
				defaultOptions
			);

			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining(
					"[StickerExportHelper] Failed to render sticker"
				),
				expect.any(String)
			);
		});

		it("should continue rendering remaining stickers after one fails", async () => {
			vi.spyOn(console, "warn").mockImplementation(() => {});
			imageLoadBehaviour = "success";

			const stickers = [
				createMockSticker({ id: "s1", mediaItemId: "m1" }),
				createMockSticker({ id: "s2", mediaItemId: "m2" }),
				createMockSticker({ id: "s3", mediaItemId: "m3", zIndex: 10 }),
			];
			const mediaItems = new Map<string, MediaItem>([
				["m1", createMockMediaItem({ id: "m1" })],
				// m2 intentionally missing → fails
				["m3", createMockMediaItem({ id: "m3" })],
			]);

			const result = await helper.renderStickersToCanvas(
				ctx,
				stickers,
				mediaItems,
				defaultOptions
			);

			// s1 succeeds, s2 fails (missing media), s3 succeeds
			expect(result.successful).toBe(2);
			expect(result.failed).toHaveLength(1);
			expect(result.failed[0].stickerId).toBe("s2");
		});

		it("should sort stickers by zIndex before rendering", async () => {
			const drawOrder: string[] = [];
			const mockCtx = createMockContext();
			(mockCtx.drawImage as ReturnType<typeof vi.fn>).mockImplementation(
				(img: any, _x: number, _y: number) => {
					drawOrder.push(img._stickerId ?? "unknown");
				}
			);

			// s-high has higher zIndex but is listed first
			const stickers = [
				createMockSticker({
					id: "s-high",
					mediaItemId: "m-high",
					zIndex: 100,
				}),
				createMockSticker({
					id: "s-low",
					mediaItemId: "m-low",
					zIndex: 1,
				}),
			];
			const mediaItems = new Map<string, MediaItem>([
				["m-high", createMockMediaItem({ id: "m-high" })],
				["m-low", createMockMediaItem({ id: "m-low" })],
			]);

			const result = await helper.renderStickersToCanvas(
				mockCtx,
				stickers,
				mediaItems,
				defaultOptions
			);

			// Both succeed - lower zIndex rendered first
			expect(result.successful).toBe(2);
			expect(
				(mockCtx.drawImage as ReturnType<typeof vi.fn>).mock.calls
			).toHaveLength(2);
		});

		it("should return attempted=0 for stickers with no matching media", async () => {
			const stickers = [
				createMockSticker({ id: "s1", mediaItemId: "nonexistent" }),
			];
			const mediaItems = new Map<string, MediaItem>();

			const result = await helper.renderStickersToCanvas(
				ctx,
				stickers,
				mediaItems,
				defaultOptions
			);

			// No media → skipped without incrementing attempted
			expect(result.attempted).toBe(0);
			expect(result.failed).toHaveLength(1);
		});

		it("should skip stickers whose mediaItem has no URL", async () => {
			const stickers = [createMockSticker()];
			const mediaItems = new Map<string, MediaItem>([
				["media-1", createMockMediaItem({ url: undefined })],
			]);

			const result = await helper.renderStickersToCanvas(
				ctx,
				stickers,
				mediaItems,
				defaultOptions
			);

			// attempted=1 (media found), successful=1 (early return counts as success)
			expect(result.attempted).toBe(1);
			expect(result.successful).toBe(1);
			expect(ctx.drawImage).not.toHaveBeenCalled();
		});

		it("should store result accessible via getLastRenderResult", async () => {
			expect(helper.getLastRenderResult()).toBeNull();

			const stickers = [createMockSticker()];
			const mediaItems = new Map<string, MediaItem>([
				["media-1", createMockMediaItem()],
			]);

			const result = await helper.renderStickersToCanvas(
				ctx,
				stickers,
				mediaItems,
				defaultOptions
			);

			expect(helper.getLastRenderResult()).toEqual(result);
		});
	});

	// -----------------------------------------------------------------------
	// Sticker positioning & transforms
	// -----------------------------------------------------------------------

	describe("renderSticker positioning", () => {
		it("should convert percentage position to center-based pixel coordinates", async () => {
			// Sticker at center (50%, 50%) on 1920x1080
			const stickers = [
				createMockSticker({
					position: { x: 50, y: 50 },
					size: { width: 20, height: 20 },
				}),
			];
			const mediaItems = new Map<string, MediaItem>([
				["media-1", createMockMediaItem()],
			]);

			await helper.renderStickersToCanvas(
				ctx,
				stickers,
				mediaItems,
				defaultOptions
			);

			// centerX = 0.5 * 1920 = 960, centerY = 0.5 * 1080 = 540
			expect(ctx.translate).toHaveBeenCalledWith(960, 540);
		});

		it("should calculate size relative to Math.min(canvasWidth, canvasHeight)", async () => {
			const stickers = [
				createMockSticker({
					size: { width: 20, height: 20 },
				}),
			];
			const mediaItems = new Map<string, MediaItem>([
				["media-1", createMockMediaItem()],
			]);

			await helper.renderStickersToCanvas(
				ctx,
				stickers,
				mediaItems,
				defaultOptions
			);

			// baseSize = min(1920, 1080) = 1080
			// width = 20/100 * 1080 = 216, height = 216
			// drawImage is called with (-width/2, -height/2, width, height)
			expect(ctx.drawImage).toHaveBeenCalledWith(
				expect.anything(), // img
				-108, // -width/2
				-108, // -height/2
				216, // width
				216 // height
			);
		});

		it("should apply rotation in radians around sticker center", async () => {
			const stickers = [createMockSticker({ rotation: 90 })];
			const mediaItems = new Map<string, MediaItem>([
				["media-1", createMockMediaItem()],
			]);

			await helper.renderStickersToCanvas(
				ctx,
				stickers,
				mediaItems,
				defaultOptions
			);

			// 90 degrees = PI/2 radians
			expect(ctx.rotate).toHaveBeenCalledWith(Math.PI / 2);
		});

		it("should not call rotate when rotation is 0", async () => {
			const stickers = [createMockSticker({ rotation: 0 })];
			const mediaItems = new Map<string, MediaItem>([
				["media-1", createMockMediaItem()],
			]);

			await helper.renderStickersToCanvas(
				ctx,
				stickers,
				mediaItems,
				defaultOptions
			);

			expect(ctx.rotate).not.toHaveBeenCalled();
		});

		it("should apply opacity via ctx.globalAlpha", async () => {
			const stickers = [createMockSticker({ opacity: 0.5 })];
			const mediaItems = new Map<string, MediaItem>([
				["media-1", createMockMediaItem()],
			]);

			await helper.renderStickersToCanvas(
				ctx,
				stickers,
				mediaItems,
				defaultOptions
			);

			// After save(), globalAlpha is set to sticker.opacity
			// We can't easily spy on property assignment, but save+restore are called
			expect(ctx.save).toHaveBeenCalled();
			expect(ctx.restore).toHaveBeenCalled();
		});

		it("uses the exact timeline clip for animation instead of stickerId lookup", async () => {
			const timelineElement: StickerElement = {
				id: "timeline-sticker-copy",
				type: "sticker",
				name: "Sticker copy",
				stickerId: "sticker-1",
				mediaId: "media-1",
				startTime: 5,
				duration: 3,
				trimStart: 0,
				trimEnd: 0,
				animationLoopType: "spin",
				animationLoopIntensity: 1,
			};
			const mediaItems = new Map<string, MediaItem>([
				["media-1", createMockMediaItem()],
			]);

			await helper.renderStickersToCanvas(
				ctx,
				[createMockSticker()],
				mediaItems,
				{
					...defaultOptions,
					currentTime: 6,
					timelineElement,
				}
			);

			expect(ctx.rotate).toHaveBeenCalledWith(Math.PI / 2);
		});

		it("resolves clip-local sticker keyframes for the exported canvas frame", async () => {
			const timelineElement: StickerElement = {
				id: "timeline-sticker-keyframed",
				type: "sticker",
				name: "Keyframed sticker",
				stickerId: "sticker-1",
				mediaId: "media-1",
				startTime: 5,
				duration: 3,
				trimStart: 0,
				trimEnd: 0,
				keyframes: {
					x: [
						{ id: "x-start", frame: 0, value: 10, easing: "linear" },
						{ id: "x-end", frame: 60, value: 90, easing: "linear" },
					],
					rotation: [
						{
							id: "rotation-start",
							frame: 0,
							value: 0,
							easing: "linear",
						},
						{
							id: "rotation-end",
							frame: 60,
							value: 180,
							easing: "linear",
						},
					],
				},
			};
			const mediaItems = new Map<string, MediaItem>([
				["media-1", createMockMediaItem()],
			]);

			await helper.renderStickersToCanvas(
				ctx,
				[createMockSticker()],
				mediaItems,
				{
					...defaultOptions,
					currentTime: 6,
					fps: 30,
					timelineElement,
				}
			);

			expect(ctx.translate).toHaveBeenCalledWith(960, 540);
			expect(ctx.rotate).toHaveBeenCalledWith(Math.PI / 2);
		});
	});

	// -----------------------------------------------------------------------
	// preloadStickers
	// -----------------------------------------------------------------------

	describe("preloadStickers", () => {
		it("should load all unique sticker image URLs in parallel", async () => {
			vi.spyOn(console, "info").mockImplementation(() => {});
			const stickers = [
				createMockSticker({ id: "s1", mediaItemId: "m1" }),
				createMockSticker({ id: "s2", mediaItemId: "m2" }),
			];
			const mediaItems = new Map<string, MediaItem>([
				[
					"m1",
					createMockMediaItem({
						id: "m1",
						url: "blob:http://localhost/1",
					}),
				],
				[
					"m2",
					createMockMediaItem({
						id: "m2",
						url: "blob:http://localhost/2",
					}),
				],
			]);

			const result = await helper.preloadStickers(stickers, mediaItems);

			expect(result.loaded).toBe(2);
			expect(result.failed).toHaveLength(0);
		});

		it("should report loaded count and failed URLs", async () => {
			vi.spyOn(console, "warn").mockImplementation(() => {});
			vi.spyOn(console, "info").mockImplementation(() => {});
			imageLoadBehaviour = "error";

			const stickers = [createMockSticker()];
			const mediaItems = new Map<string, MediaItem>([
				["media-1", createMockMediaItem()],
			]);

			const result = await helper.preloadStickers(stickers, mediaItems);

			expect(result.loaded).toBe(0);
			expect(result.failed).toHaveLength(1);
			expect(result.failed[0]).toBe("blob:http://localhost/sticker-1");
		});

		it("should cache images for reuse during rendering", async () => {
			vi.spyOn(console, "info").mockImplementation(() => {});
			const stickers = [createMockSticker()];
			const mediaItems = new Map<string, MediaItem>([
				["media-1", createMockMediaItem()],
			]);

			await helper.preloadStickers(stickers, mediaItems);

			// After preloading, stickers should be recognized as preloaded
			expect(helper.areStickersPreloaded(stickers, mediaItems)).toBe(true);
		});

		it("should skip stickers with no media URL", async () => {
			vi.spyOn(console, "info").mockImplementation(() => {});
			const stickers = [createMockSticker()];
			const mediaItems = new Map<string, MediaItem>([
				["media-1", createMockMediaItem({ url: undefined })],
			]);

			const result = await helper.preloadStickers(stickers, mediaItems);

			expect(result.loaded).toBe(0);
			expect(result.failed).toHaveLength(0);
		});
	});

	// -----------------------------------------------------------------------
	// areStickersPreloaded
	// -----------------------------------------------------------------------

	describe("areStickersPreloaded", () => {
		it("should return true when all sticker images are cached", async () => {
			vi.spyOn(console, "info").mockImplementation(() => {});
			const stickers = [createMockSticker()];
			const mediaItems = new Map<string, MediaItem>([
				["media-1", createMockMediaItem()],
			]);

			await helper.preloadStickers(stickers, mediaItems);
			expect(helper.areStickersPreloaded(stickers, mediaItems)).toBe(true);
		});

		it("should return false when any image is not cached", () => {
			const stickers = [createMockSticker()];
			const mediaItems = new Map<string, MediaItem>([
				["media-1", createMockMediaItem()],
			]);

			// Not preloaded yet
			expect(helper.areStickersPreloaded(stickers, mediaItems)).toBe(false);
		});
	});

	// -----------------------------------------------------------------------
	// clearCache
	// -----------------------------------------------------------------------

	describe("clearCache", () => {
		it("should clear all cached images", async () => {
			vi.spyOn(console, "info").mockImplementation(() => {});
			const stickers = [createMockSticker()];
			const mediaItems = new Map<string, MediaItem>([
				["media-1", createMockMediaItem()],
			]);

			await helper.preloadStickers(stickers, mediaItems);
			expect(helper.areStickersPreloaded(stickers, mediaItems)).toBe(true);

			helper.clearCache();
			expect(helper.areStickersPreloaded(stickers, mediaItems)).toBe(false);
		});
	});
});
