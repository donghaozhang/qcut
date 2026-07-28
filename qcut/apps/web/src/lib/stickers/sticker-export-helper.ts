/**
 * Sticker Export Helper
 *
 * Utilities for rendering overlay stickers to canvas during video export.
 * Integrates with the export engine to composite stickers on top of video frames.
 */

import type { OverlaySticker } from "@/types/sticker-overlay";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { StickerElement } from "@/types/timeline";
import type { TimelineTrack } from "@/types/timeline";
import { getStickerTiming } from "./sticker-timeline-query";
import { resolveStickerGeometry } from "./sticker-geometry";
import {
	DEFAULT_STICKER_PERSPECTIVE,
	getStickerClipAnimationState,
} from "./sticker-clip-animation";
import { drawStickerWithPerspective } from "./sticker-canvas-perspective";
import { resolveTimelineStickerVisualAtTime } from "./timeline-sticker-visual";

/**
 * Interface for sticker render options
 */
export interface StickerRenderOptions {
	canvasWidth: number;
	canvasHeight: number;
	currentTime?: number;
	fps?: number;
	opacity?: number;
	timelineElement?: StickerElement;
	tracks?: TimelineTrack[];
}

/**
 * Result of rendering stickers to canvas
 */
export interface StickerRenderResult {
	attempted: number;
	successful: number;
	failed: Array<{ stickerId: string; error: string }>;
}

/**
 * Helper class for rendering stickers during export
 */
export class StickerExportHelper {
	private imageCache = new Map<string, HTMLImageElement>();
	private preloadedImages = new Map<string, HTMLImageElement>();
	private lastRenderResult: StickerRenderResult | null = null;

	/**
	 * Render stickers to canvas at specified time
	 * @returns Result object with success/failure counts
	 */
	async renderStickersToCanvas(
		ctx: CanvasRenderingContext2D,
		stickers: OverlaySticker[],
		mediaItems: Map<string, MediaItem>,
		options: StickerRenderOptions
	): Promise<StickerRenderResult> {
		const { canvasWidth, canvasHeight } = options;
		const timelineElement =
			stickers.length === 1 ? options.timelineElement : undefined;

		const result: StickerRenderResult = {
			attempted: 0,
			successful: 0,
			failed: [],
		};

		// Stickers are already filtered by export engine via getVisibleStickersAtTime()
		// No need to filter again - just sort by z-index to render in correct order
		const sortedStickers = stickers.sort((a, b) => a.zIndex - b.zIndex);

		// Render each sticker
		for (const sticker of sortedStickers) {
			const mediaItem = mediaItems.get(sticker.mediaItemId);
			if (!mediaItem) {
				result.failed.push({
					stickerId: sticker.id,
					error: `Media item not found: ${sticker.mediaItemId}`,
				});
				continue;
			}

			result.attempted++;

			try {
				await this.renderSticker(
					ctx,
					sticker,
					mediaItem,
					canvasWidth,
					canvasHeight,
					options.currentTime ?? 0,
					options.fps ?? 30,
					timelineElement,
					options.tracks
				);
				result.successful++;
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				result.failed.push({
					stickerId: sticker.id,
					error: errorMessage,
				});
				console.warn(
					`[StickerExportHelper] Failed to render sticker ${sticker.id}:`,
					errorMessage
				);
			}
		}

		this.lastRenderResult = result;

		// Log summary if there were failures
		if (result.failed.length > 0) {
			console.warn(
				`[StickerExportHelper] Render summary: ${result.successful}/${result.attempted} stickers rendered successfully`
			);
		}

		return result;
	}

	/**
	 * Get the result of the last render operation
	 */
	getLastRenderResult(): StickerRenderResult | null {
		return this.lastRenderResult;
	}

	/**
	 * Render individual sticker to canvas
	 */
	private async renderSticker(
		ctx: CanvasRenderingContext2D,
		sticker: OverlaySticker,
		mediaItem: MediaItem,
		canvasWidth: number,
		canvasHeight: number,
		currentTime: number,
		fps: number,
		timelineElement?: StickerElement,
		tracks?: TimelineTrack[]
	): Promise<void> {
		// Skip if no URL
		if (!mediaItem.url) {
			return;
		}

		// Load image from cache or create new
		const img = await this.loadImage(mediaItem.url);

		const animationElement =
			timelineElement ?? getStickerTiming(sticker.id)?.element;
		const resolvedSticker = animationElement
			? resolveTimelineStickerVisualAtTime({
					element: animationElement,
					fallback: sticker,
					currentTime,
					fps,
					tracks,
					canvasWidth,
					canvasHeight,
				})
			: sticker;
		const geometry = resolveStickerGeometry({
			position: resolvedSticker.position,
			size: resolvedSticker.size,
			canvasWidth,
			canvasHeight,
		});
		const animation = animationElement
			? getStickerClipAnimationState({
					element: animationElement,
					currentTime,
					canvasWidth,
					canvasHeight,
				})
			: {
					opacity: 1,
					scale: 1,
					offsetX: 0,
					offsetY: 0,
					rotation: 0,
				};

		// Save context state
		ctx.save();

		// Apply transformations
		ctx.globalAlpha = resolvedSticker.opacity * animation.opacity;

		ctx.translate(
			geometry.centerX + animation.offsetX,
			geometry.centerY + animation.offsetY
		);

		const rotation = resolvedSticker.rotation + animation.rotation;
		if (rotation !== 0) {
			ctx.rotate((rotation * Math.PI) / 180);
		}
		if (animation.scale !== 1) {
			ctx.scale(animation.scale, animation.scale);
		}

		try {
			drawStickerWithPerspective({
				ctx,
				image: img,
				sourceWidth: img.naturalWidth || geometry.pixelWidth,
				sourceHeight: img.naturalHeight || geometry.pixelHeight,
				width: geometry.pixelWidth,
				height: geometry.pixelHeight,
				perspective: resolvedSticker.perspective ?? DEFAULT_STICKER_PERSPECTIVE,
				maintainAspectRatio: resolvedSticker.maintainAspectRatio,
			});
		} catch (error) {
			// Restore context before re-throwing
			ctx.restore();
			throw new Error(
				`Canvas drawImage failed for sticker: ${error instanceof Error ? error.message : String(error)}`
			);
		}

		// Restore context state
		ctx.restore();
	}

	/**
	 * Load and cache image
	 */
	private async loadImage(url: string): Promise<HTMLImageElement> {
		// Check cache first
		if (this.imageCache.has(url)) {
			const cached = this.imageCache.get(url)!;
			return cached;
		}

		// Load new image
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.crossOrigin = "anonymous";

			img.onload = () => {
				this.imageCache.set(url, img);
				resolve(img);
			};

			img.onerror = (error) => {
				reject(new Error(`Failed to load image: ${url}`));
			};

			img.src = url;
		});
	}

	/**
	 * Clear image cache to free memory
	 */
	clearCache(): void {
		this.imageCache.clear();
	}

	/**
	 * Pre-load sticker images for better performance
	 * @returns Object with loaded count and any failed URLs
	 */
	async preloadStickers(
		stickers: OverlaySticker[],
		mediaItems: Map<string, MediaItem>
	): Promise<{ loaded: number; failed: string[] }> {
		const uniqueUrls = new Set<string>();
		const stickerIdToUrl = new Map<string, string>();

		for (const sticker of stickers) {
			const mediaItem = mediaItems.get(sticker.mediaItemId);
			if (mediaItem?.url) {
				uniqueUrls.add(mediaItem.url);
				stickerIdToUrl.set(sticker.id, mediaItem.url);
			}
		}

		const failedUrls: string[] = [];
		let loadedCount = 0;

		// Load all images in parallel with error tracking
		const loadPromises = Array.from(uniqueUrls).map(async (url) => {
			try {
				const img = await this.loadImage(url);
				this.preloadedImages.set(url, img);
				loadedCount++;
			} catch (error) {
				failedUrls.push(url);
				console.warn(
					`[StickerExportHelper] Failed to preload image: ${url}`,
					error instanceof Error ? error.message : String(error)
				);
			}
		});

		await Promise.all(loadPromises);

		console.info(
			`[StickerExportHelper] Preloaded ${loadedCount}/${uniqueUrls.size} sticker images`
		);

		return { loaded: loadedCount, failed: failedUrls };
	}

	/**
	 * Check if all sticker images are preloaded
	 */
	areStickersPreloaded(
		stickers: OverlaySticker[],
		mediaItems: Map<string, MediaItem>
	): boolean {
		for (const sticker of stickers) {
			const mediaItem = mediaItems.get(sticker.mediaItemId);
			if (mediaItem?.url && !this.imageCache.has(mediaItem.url)) {
				return false;
			}
		}
		return true;
	}
}

/**
 * Singleton instance for easy access
 */
let stickerExportHelper: StickerExportHelper | null = null;

/**
 * Get or create sticker export helper instance
 */
export function getStickerExportHelper(): StickerExportHelper {
	if (!stickerExportHelper) {
		stickerExportHelper = new StickerExportHelper();
	}
	return stickerExportHelper;
}

/**
 * Convenience function to render stickers to canvas
 * @returns Result object with success/failure counts
 */
export async function renderStickersToCanvas(
	ctx: CanvasRenderingContext2D,
	stickers: OverlaySticker[],
	mediaItems: Map<string, MediaItem>,
	options: StickerRenderOptions
): Promise<StickerRenderResult> {
	const helper = getStickerExportHelper();
	return helper.renderStickersToCanvas(ctx, stickers, mediaItems, options);
}

/**
 * Convenience function to preload sticker images before export
 * @returns Object with loaded count and any failed URLs
 */
export async function preloadStickerImages(
	stickers: OverlaySticker[],
	mediaItems: Map<string, MediaItem>
): Promise<{ loaded: number; failed: string[] }> {
	const helper = getStickerExportHelper();
	return helper.preloadStickers(stickers, mediaItems);
}
