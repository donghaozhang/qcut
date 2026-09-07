/**
 * Sticker Export Helper
 *
 * Utilities for rendering overlay stickers to canvas during video export.
 * Integrates with the export engine to composite stickers on top of video frames.
 */

import { exportProfiler } from "@/lib/export/export-profiler";
import type { OverlaySticker } from "@/types/sticker-overlay";
import type { MediaItem } from "@/stores/media/media-store-types";
import type {
	PlanarTrackingSidecarV1,
	StickerElement,
	TimelineTrack,
} from "@/types/timeline";
import type { StickerRuntimeDescriptor } from "@qcut/editor-core/sticker-lab";
import { getStickerTiming } from "./sticker-timeline-query";
import { resolveStickerGeometry } from "./sticker-geometry";
import {
	DEFAULT_STICKER_PERSPECTIVE,
	getStickerClipAnimationState,
} from "./sticker-clip-animation";
import { drawStickerWithPerspective } from "./sticker-canvas-perspective";
import { resolveTimelineStickerVisualAtTime } from "./timeline-sticker-visual";
import {
	createBrowserStickerRuntimeAssetResolver,
	createBrowserStickerRuntimeCanvas,
} from "./sticker-runtime-browser-assets";
import {
	renderStickerRuntimeFrame,
	type StickerRuntimeAssetResolver,
} from "./sticker-runtime-renderer";
import {
	getStickerRuntimeTimelineWindow,
	resolveStickerRuntimeDescriptor,
} from "./sticker-runtime-timeline";
import { StickerRuntimeExportUnsupportedError } from "../../../../../electron/types/sticker-runtime-export-policy";

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
	planarTrackingSidecar?: PlanarTrackingSidecarV1;
	failOnError?: boolean;
}

/**
 * Result of rendering stickers to canvas
 */
export interface StickerRenderResult {
	attempted: number;
	successful: number;
	failed: Array<{ stickerId: string; error: string }>;
}

export interface PreparedStickerRender {
	stickerId: string;
	draw: ({ ctx }: { ctx: CanvasRenderingContext2D }) => void;
}

export class StickerRenderFailureError extends Error {
	readonly failures: StickerRenderResult["failed"];

	constructor({ failures }: { failures: StickerRenderResult["failed"] }) {
		super(
			`Sticker export frame failed: ${failures
				.map(({ error, stickerId }) => `${stickerId}: ${error}`)
				.join(", ")}`
		);
		this.name = "StickerRenderFailureError";
		this.failures = failures;
	}
}

function requireRuntimeTimelineElement({
	element,
}: {
	element?: StickerElement;
}): StickerElement {
	if (element) return element;
	throw new StickerRuntimeExportUnsupportedError({
		operation: "overlay sticker export",
		reason: "missing-timeline-context",
	});
}

/**
 * Helper class for rendering stickers during export
 */
export class StickerExportHelper {
	private imageCache = new Map<string, HTMLImageElement>();
	private imageLoads = new Map<string, Promise<HTMLImageElement>>();
	private preloadedImages = new Map<string, HTMLImageElement>();
	private directGifAssetResolvers = new WeakMap<
		MediaItem,
		StickerRuntimeAssetResolver
	>();
	private lastRenderResult: StickerRenderResult | null = null;

	private runtimeAssetResolver({
		mediaItem,
		mediaItemsById,
		stickerRuntime,
	}: {
		mediaItem: MediaItem;
		mediaItemsById: ReadonlyMap<string, MediaItem>;
		stickerRuntime: StickerRuntimeDescriptor;
	}): StickerRuntimeAssetResolver {
		if (stickerRuntime.kind !== "direct-gif") {
			return createBrowserStickerRuntimeAssetResolver({
				mediaItem,
				mediaItemsById,
			});
		}
		const cached = this.directGifAssetResolvers.get(mediaItem);
		if (cached) return cached;
		const resolver = createBrowserStickerRuntimeAssetResolver({
			mediaItem,
			mediaItemsById,
		});
		this.directGifAssetResolvers.set(mediaItem, resolver);
		return resolver;
	}

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
		const requestedTimelineElement =
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
			const timelineElement =
				requestedTimelineElement ?? getStickerTiming(sticker.id)?.element;
			const mediaItem = mediaItems.get(sticker.mediaItemId);
			if (!mediaItem) {
				if (timelineElement?.stickerRuntime) {
					throw new Error(
						`Sticker runtime media item not found: ${sticker.mediaItemId}`
					);
				}
				result.failed.push({
					stickerId: sticker.id,
					error: `Media item not found: ${sticker.mediaItemId}`,
				});
				continue;
			}

			result.attempted++;

			try {
				await this.renderSticker({
					ctx,
					sticker,
					mediaItem,
					mediaItemsById: mediaItems,
					canvasWidth,
					canvasHeight,
					currentTime: options.currentTime ?? 0,
					fps: options.fps ?? 30,
					timelineElement,
					tracks: options.tracks,
					planarTrackingSidecar: options.planarTrackingSidecar,
				});
				result.successful++;
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				const stickerRuntime = resolveStickerRuntimeDescriptor({
					element: timelineElement,
					mediaItem,
				});
				if (stickerRuntime) throw error;
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
		if (options.failOnError && result.failed.length > 0) {
			throw new StickerRenderFailureError({ failures: result.failed });
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
	private async renderSticker({
		ctx,
		sticker,
		mediaItem,
		mediaItemsById,
		canvasWidth,
		canvasHeight,
		currentTime,
		fps,
		timelineElement,
		tracks,
		planarTrackingSidecar,
	}: {
		ctx: CanvasRenderingContext2D;
		sticker: OverlaySticker;
		mediaItem: MediaItem;
		mediaItemsById: ReadonlyMap<string, MediaItem>;
		canvasWidth: number;
		canvasHeight: number;
		currentTime: number;
		fps: number;
		timelineElement?: StickerElement;
		tracks?: TimelineTrack[];
		planarTrackingSidecar?: PlanarTrackingSidecarV1;
	}): Promise<void> {
		const prepared = await this.prepareStickerFrame({
			sticker,
			mediaItem,
			mediaItemsById,
			canvasWidth,
			canvasHeight,
			currentTime,
			fps,
			timelineElement,
			tracks,
			planarTrackingSidecar,
		});
		prepared?.draw({ ctx });
	}

	async prepareStickerFrame({
		sticker,
		mediaItem,
		mediaItemsById,
		canvasWidth,
		canvasHeight,
		currentTime,
		fps,
		timelineElement,
		tracks,
		planarTrackingSidecar,
	}: {
		sticker: OverlaySticker;
		mediaItem: MediaItem;
		mediaItemsById: ReadonlyMap<string, MediaItem>;
		canvasWidth: number;
		canvasHeight: number;
		currentTime: number;
		fps: number;
		timelineElement?: StickerElement;
		tracks?: TimelineTrack[];
		planarTrackingSidecar?: PlanarTrackingSidecarV1;
	}): Promise<PreparedStickerRender | null> {
		const animationElement =
			timelineElement ?? getStickerTiming(sticker.id)?.element;
		const stickerRuntime = resolveStickerRuntimeDescriptor({
			element: animationElement,
			mediaItem,
		});
		const runtimeElement = stickerRuntime
			? requireRuntimeTimelineElement({ element: animationElement })
			: undefined;
		const resolvedSticker = animationElement
			? resolveTimelineStickerVisualAtTime({
					element: animationElement,
					fallback: sticker,
					currentTime,
					fps,
					tracks,
					canvasWidth,
					canvasHeight,
					planarTrackingSidecar,
				})
			: sticker;
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
		const effectiveOpacity = resolvedSticker.opacity * animation.opacity;
		if (effectiveOpacity <= 0) return null;

		let image: CanvasImageSource;
		let sourceWidth: number | undefined;
		let sourceHeight: number | undefined;
		if (stickerRuntime && runtimeElement) {
			const runtimeFrame = await renderStickerRuntimeFrame({
				assets: this.runtimeAssetResolver({
					mediaItem,
					mediaItemsById,
					stickerRuntime,
				}),
				createCanvas: createBrowserStickerRuntimeCanvas,
				descriptor: stickerRuntime,
				timeline: getStickerRuntimeTimelineWindow({
					element: runtimeElement,
				}),
				timelineTimeSeconds: currentTime,
			});
			exportProfiler.count("sticker-runtime-frames");
			if (!runtimeFrame.active) return null;
			image = runtimeFrame.image;
			sourceWidth = runtimeFrame.width;
			sourceHeight = runtimeFrame.height;
		} else {
			if (!mediaItem.url) {
				throw new Error(`Static sticker media URL not found: ${mediaItem.id}`);
			}
			exportProfiler.count(
				this.imageCache.has(mediaItem.url)
					? "sticker-image-cache-hit"
					: "sticker-image-cache-miss"
			);
			const staticImage = await this.loadImage(mediaItem.url);
			image = staticImage;
			sourceWidth = staticImage.naturalWidth;
			sourceHeight = staticImage.naturalHeight;
		}
		const geometry = resolveStickerGeometry({
			position: resolvedSticker.position,
			size: resolvedSticker.size,
			canvasWidth,
			canvasHeight,
		});
		return {
			stickerId: sticker.id,
			draw: ({ ctx }) => {
				ctx.save();
				ctx.globalAlpha = effectiveOpacity;
				ctx.translate(
					geometry.centerX + animation.offsetX,
					geometry.centerY + animation.offsetY
				);
				const rotation = resolvedSticker.rotation + animation.rotation;
				if (rotation !== 0) ctx.rotate((rotation * Math.PI) / 180);
				if (animation.scale !== 1) {
					ctx.scale(animation.scale, animation.scale);
				}

				try {
					drawStickerWithPerspective({
						ctx,
						image,
						sourceWidth: sourceWidth || geometry.pixelWidth,
						sourceHeight: sourceHeight || geometry.pixelHeight,
						width: geometry.pixelWidth,
						height: geometry.pixelHeight,
						perspective:
							resolvedSticker.perspective ?? DEFAULT_STICKER_PERSPECTIVE,
						maintainAspectRatio: resolvedSticker.maintainAspectRatio,
					});
				} catch (error) {
					throw new Error(
						`Canvas drawImage failed for sticker: ${error instanceof Error ? error.message : String(error)}`
					);
				} finally {
					ctx.restore();
				}
			},
		};
	}

	/**
	 * Load and cache image
	 */
	private async loadImage(url: string): Promise<HTMLImageElement> {
		const cached = this.imageCache.get(url);
		if (cached) return cached;
		const pending = this.imageLoads.get(url);
		if (pending) return pending;

		const load = new Promise<HTMLImageElement>((resolve, reject) => {
			const img = new Image();
			img.crossOrigin = "anonymous";

			img.onload = () => {
				this.imageCache.set(url, img);
				this.imageLoads.delete(url);
				resolve(img);
			};

			img.onerror = () => {
				this.imageLoads.delete(url);
				reject(new Error(`Failed to load image: ${url}`));
			};

			img.src = url;
		});
		this.imageLoads.set(url, load);
		return load;
	}

	/**
	 * Clear image cache to free memory
	 */
	clearCache(): void {
		this.imageCache.clear();
		this.imageLoads.clear();
		this.directGifAssetResolvers = new WeakMap();
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
