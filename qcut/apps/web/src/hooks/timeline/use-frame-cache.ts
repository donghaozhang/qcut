import { useRef, useCallback, useEffect } from "react";
import { openDB, type IDBPDatabase } from "idb";
import type {
	MediaElement,
	TimelineTrack,
	TimelineElement,
} from "@/types/timeline";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { TProject } from "@/types/project";
import { getTimelineElementEndTime } from "@/lib/timeline";

interface CachedFrame {
	imageData: ImageData;
	timelineHash: string;
	timestamp: number;
}

interface CacheSnapshot {
	key: number;
	imageData: ImageData;
	timelineHash: string;
	timestamp: number;
}

interface FrameCacheOptions {
	maxCacheSize?: number;
	cacheResolution?: number;
	persist?: boolean;
	onError?: (error: unknown) => void;
}

export function useFrameCache(options: FrameCacheOptions = {}) {
	const {
		maxCacheSize = 300,
		cacheResolution = 30,
		persist = false,
		onError,
	} = options; // 10 seconds at 30fps
	const frameCacheRef = useRef(new Map<number, CachedFrame>());
	const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Generate a hash of the timeline state that affects rendering
	const getTimelineHash = useCallback(
		(
			time: number,
			tracks: TimelineTrack[],
			mediaItems: MediaItem[],
			activeProject: TProject | null,
			sceneId?: string
		): string => {
			// Get elements that are active at this time
			const activeElements: Array<{
				id: string;
				type: string;
				startTime: number;
				duration: number;
				trimStart: number;
				trimEnd: number;
				mediaId?: string;
				timing?: Pick<
					MediaElement,
					| "playbackRate"
					| "speedKeyframes"
					| "reverse"
					| "freezeFrameTime"
					| "freezeFrameDuration"
				>;
			}> = [];

			for (const track of tracks) {
				if (track.muted) continue;

				for (const element of track.elements) {
					// Check if element has hidden property
					const isHidden = "hidden" in element ? element.hidden : false;
					if (isHidden) continue;

					const elementStart = element.startTime;
					const elementEnd = getTimelineElementEndTime({
						element,
						fps: activeProject?.fps ?? 30,
					});

					if (time >= elementStart && time < elementEnd) {
						activeElements.push({
							id: element.id,
							type: element.type,
							startTime: element.startTime,
							duration: element.duration,
							trimStart: element.trimStart,
							trimEnd: element.trimEnd,
							mediaId:
								element.type === "media" && "mediaId" in element
									? element.mediaId
									: undefined,
							timing:
								element.type === "media"
									? {
											playbackRate: element.playbackRate,
											speedKeyframes: element.speedKeyframes,
											reverse: element.reverse,
											freezeFrameTime: element.freezeFrameTime,
											freezeFrameDuration: element.freezeFrameDuration,
										}
									: undefined,
						});
					}
				}
			}

			// Include project settings that affect rendering
			const projectState = {
				backgroundColor: activeProject?.backgroundColor,
				backgroundType: activeProject?.backgroundType,
				blurIntensity: activeProject?.blurIntensity,
			};

			// Sort activeElements by id for consistent hashing
			const sortedElements = [...activeElements].sort((a, b) =>
				a.id.localeCompare(b.id)
			);

			// Create a stable string representation
			return JSON.stringify({
				activeElements: sortedElements,
				projectState,
				sceneId: sceneId || "default", // Include scene ID for cache isolation
				time: Math.floor(time * cacheResolution) / cacheResolution, // Quantize time
			});
		},
		[cacheResolution]
	);

	// Get cached frame if available and valid
	const getCachedFrame = useCallback(
		(
			time: number,
			tracks: TimelineTrack[],
			mediaItems: MediaItem[],
			activeProject: TProject | null,
			sceneId?: string
		): ImageData | null => {
			const frameTime = Math.floor(time * cacheResolution) / cacheResolution;
			const cached = frameCacheRef.current.get(frameTime);

			if (!cached) {
				// metrics: miss when no entry
				metricsRef.current.misses++;
				return null;
			}

			const currentHash = getTimelineHash(
				time,
				tracks,
				mediaItems,
				activeProject,
				sceneId
			);
			if (cached.timelineHash !== currentHash) {
				// Cache is stale, remove it
				frameCacheRef.current.delete(frameTime);
				metricsRef.current.misses++;
				return null;
			}

			metricsRef.current.hits++;
			return cached.imageData;
		},
		[getTimelineHash, cacheResolution]
	);

	// IndexedDB persistence helpers
	const saveToIndexedDB = useCallback(async () => {
		if (!persist) return;
		try {
			const db = await openDB("frame-cache", 1, {
				upgrade(db: IDBPDatabase) {
					if (!db.objectStoreNames.contains("frames")) {
						db.createObjectStore("frames");
					}
				},
			});

			const cacheArray = Array.from(frameCacheRef.current.entries()).map(
				([key, value]) => ({
					key,
					imageData: value.imageData,
					timelineHash: value.timelineHash,
					timestamp: value.timestamp,
				})
			);

			await db.put("frames", cacheArray, "cache-snapshot");
		} catch (error) {
			onError?.(error);
		}
	}, [persist, onError]);

	// Cache a rendered frame
	const cacheFrame = useCallback(
		(
			time: number,
			imageData: ImageData,
			tracks: TimelineTrack[],
			mediaItems: MediaItem[],
			activeProject: TProject | null,
			sceneId?: string
		): void => {
			const startTime = performance.now();
			const frameTime = Math.floor(time * cacheResolution) / cacheResolution;
			const timelineHash = getTimelineHash(
				time,
				tracks,
				mediaItems,
				activeProject,
				sceneId
			);

			// Distance and age-based eviction (keeps frames near current position, evicts old distant frames)
			if (frameCacheRef.current.size >= maxCacheSize) {
				const entries = Array.from(frameCacheRef.current.entries());
				// Sort by distance (far first) then age (older first)
				entries.sort((a, b) => {
					const aDistance = Math.abs(a[0] - frameTime);
					const bDistance = Math.abs(b[0] - frameTime);
					const aAge = Date.now() - a[1].timestamp;
					const bAge = Date.now() - b[1].timestamp;
					if (aDistance >= 5 && bDistance < 5) return -1;
					if (bDistance >= 5 && aDistance < 5) return 1;
					return bAge - aAge; // older first among equals
				});
				// Remove oldest ~20%
				const toRemove = Math.max(1, Math.floor(entries.length * 0.2));
				for (let i = 0; i < toRemove; i++) {
					const k = entries.at(i)?.[0];
					if (k !== undefined) frameCacheRef.current.delete(k);
				}
			}

			frameCacheRef.current.set(frameTime, {
				imageData,
				timelineHash,
				timestamp: Date.now(),
			});

			// metrics: approximate capture/caching time
			const captureTime = performance.now() - startTime;
			metricsRef.current.captureCount++;
			metricsRef.current.avgCaptureTime =
				(metricsRef.current.avgCaptureTime *
					(metricsRef.current.captureCount - 1) +
					captureTime) /
				metricsRef.current.captureCount;

			// schedule persistence if enabled (debounced)
			if (persist) {
				if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
				persistTimerRef.current = setTimeout(() => {
					saveToIndexedDB().catch(() => {});
				}, 1000);
			}
		},
		[getTimelineHash, cacheResolution, maxCacheSize, persist, saveToIndexedDB]
	);

	// Clear cache when timeline changes significantly
	const invalidateCache = useCallback(() => {
		frameCacheRef.current.clear();
		if (persist) {
			saveToIndexedDB().catch(() => {});
		}
	}, [persist, saveToIndexedDB]);

	// Get render status for timeline indicator
	const getRenderStatus = useCallback(
		(
			time: number,
			tracks: TimelineTrack[],
			mediaItems: MediaItem[],
			activeProject: TProject | null
		): "cached" | "not-cached" => {
			const frameTime = Math.floor(time * cacheResolution) / cacheResolution;
			const cached = frameCacheRef.current.get(frameTime);

			if (!cached) return "not-cached";

			const currentHash = getTimelineHash(
				time,
				tracks,
				mediaItems,
				activeProject
			);
			return cached.timelineHash === currentHash ? "cached" : "not-cached";
		},
		[getTimelineHash, cacheResolution]
	);

	// Helper to check if a frame is cached and valid
	const isFrameCached = useCallback(
		(
			time: number,
			tracks: TimelineTrack[],
			mediaItems: MediaItem[],
			activeProject: TProject | null
		): boolean => {
			return (
				getRenderStatus(time, tracks, mediaItems, activeProject) === "cached"
			);
		},
		[getRenderStatus]
	);

	// Pre-render frames around current time during idle time
	const preRenderNearbyFrames = useCallback(
		async (
			currentTime: number,
			renderFunction: (time: number) => Promise<ImageData>,
			range = 2, // kept for API compatibility
			tracks?: TimelineTrack[],
			mediaItems?: MediaItem[],
			activeProject?: TProject | null
		) => {
			if (!tracks || !mediaItems) return;

			// For safety with DOM-capture rendering, only pre-render the quantized current frame
			const frameTime =
				Math.floor(currentTime * cacheResolution) / cacheResolution;
			if (
				!isFrameCached(frameTime, tracks, mediaItems, activeProject ?? null)
			) {
				const schedule = (fn: () => void) => {
					if ("requestIdleCallback" in window) {
						window.requestIdleCallback(fn, { timeout: 1000 });
					} else {
						setTimeout(fn, 0);
					}
				};

				schedule(() => {
					(async () => {
						try {
							const imageData = await renderFunction(frameTime);
							cacheFrame(
								frameTime,
								imageData,
								tracks,
								mediaItems,
								activeProject ?? null
							);
						} catch (error) {
							// Silently ignore if render couldn't proceed (e.g., targeted time capture unsupported)
						}
					})();
				});
			}
		},
		[cacheFrame, cacheResolution, isFrameCached]
	);

	// Performance metrics
	interface CacheMetrics {
		hits: number;
		misses: number;
		avgCaptureTime: number;
		captureCount: number;
	}
	const metricsRef = useRef<CacheMetrics>({
		hits: 0,
		misses: 0,
		avgCaptureTime: 0,
		captureCount: 0,
	});

	const restoreFromIndexedDB = useCallback(async () => {
		if (!persist) return;
		try {
			const db = await openDB("frame-cache", 1);
			const cacheArray = (await db.get("frames", "cache-snapshot")) as
				| CacheSnapshot[]
				| undefined;
			if (cacheArray && Array.isArray(cacheArray)) {
				frameCacheRef.current.clear();
				for (const item of cacheArray) {
					frameCacheRef.current.set(item.key, {
						imageData: item.imageData,
						timelineHash: item.timelineHash,
						timestamp: item.timestamp,
					});
				}
			}
		} catch (error) {
			onError?.(error);
		}
	}, [persist, onError]);

	// Restore on mount when persistence enabled
	useEffect(() => {
		if (persist) {
			restoreFromIndexedDB().catch(() => {});
		}
	}, [persist, restoreFromIndexedDB]);

	return {
		getCachedFrame,
		cacheFrame,
		invalidateCache,
		getRenderStatus,
		isFrameCached,
		preRenderNearbyFrames,
		cacheMetrics: metricsRef.current,
		cacheHitRate:
			(metricsRef.current.hits || 0) /
			Math.max(1, metricsRef.current.hits + metricsRef.current.misses),
		cacheSize: frameCacheRef.current.size,
	};
}
