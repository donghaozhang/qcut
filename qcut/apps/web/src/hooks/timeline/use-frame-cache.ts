import { useCallback, useEffect, useMemo, useRef } from "react";
import { openDB, type IDBPDatabase } from "idb";
import type { TimelineTrack } from "@/types/timeline";
import type { MediaItem } from "@/stores/media/media-store-types";
import type { TProject } from "@/types/project";
import { getTimelineElementEndTime } from "@/lib/timeline";
import {
	getSharedFrameCache,
	type SharedFrameCacheSnapshotEntry,
} from "@/lib/preview/shared-frame-cache";

const DEFAULT_MAX_CACHE_ENTRIES = 120;
const DEFAULT_MAX_CACHE_BYTES = 96 * 1024 * 1024;
const DEFAULT_CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_PERSISTED_CACHE_BYTES = 32 * 1024 * 1024;

interface FrameCacheOptions {
	namespace?: string;
	cacheIdentity?: string;
	maxCacheSize?: number;
	maxCacheBytes?: number;
	cacheTtlMs?: number;
	cacheResolution?: number;
	persist?: boolean;
	onError?: (error: unknown) => void;
}

function hashValue({ value }: { value: string }): string {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index++) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36);
}

function mediaSignature({ mediaItem }: { mediaItem?: MediaItem }) {
	if (!mediaItem) return null;
	return {
		id: mediaItem.id,
		name: mediaItem.name,
		type: mediaItem.type,
		localPath: mediaItem.localPath,
		url: mediaItem.url,
		originalUrl: mediaItem.originalUrl,
		duration: mediaItem.duration,
		width: mediaItem.width,
		height: mediaItem.height,
		fps: mediaItem.fps,
		file: {
			name: mediaItem.file.name,
			size: mediaItem.file.size,
			lastModified: mediaItem.file.lastModified,
			type: mediaItem.file.type,
		},
	};
}

export function useFrameCache({
	namespace = "default",
	cacheIdentity = "default",
	maxCacheSize = DEFAULT_MAX_CACHE_ENTRIES,
	maxCacheBytes = DEFAULT_MAX_CACHE_BYTES,
	cacheTtlMs = DEFAULT_CACHE_TTL_MS,
	cacheResolution = 30,
	persist = false,
	onError,
}: FrameCacheOptions = {}) {
	const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const normalizedCacheIdentity = cacheIdentity.trim() || "default";
	const cache = useMemo(
		() =>
			getSharedFrameCache({
				namespace,
				maxEntries: maxCacheSize,
				maxBytes: maxCacheBytes,
				ttlMs: cacheTtlMs,
			}),
		[cacheTtlMs, maxCacheBytes, maxCacheSize, namespace]
	);

	const getTimelineHash = useCallback(
		({
			time,
			tracks,
			mediaItems,
			activeProject,
			sceneId,
		}: {
			time: number;
			tracks: TimelineTrack[];
			mediaItems: MediaItem[];
			activeProject: TProject | null;
			sceneId?: string;
		}): string => {
			const mediaById = new Map(mediaItems.map((item) => [item.id, item]));
			const activeElements: Array<Record<string, unknown>> = [];

			for (const track of tracks) {
				// Visual frame identity (QTL-010): hidden tracks leave the render,
				// muted tracks do not — muting is an audio-only property, so it
				// must neither hit stale frames nor invalidate valid ones.
				if (track.hidden) continue;
				for (const element of track.elements) {
					const isHidden = "hidden" in element ? element.hidden : false;
					if (isHidden) continue;
					const elementEnd = getTimelineElementEndTime({
						element,
						fps: activeProject?.fps ?? 30,
					});
					if (time < element.startTime || time >= elementEnd) continue;
					activeElements.push({
						trackId: track.id,
						element,
						media:
							element.type === "media"
								? mediaSignature({ mediaItem: mediaById.get(element.mediaId) })
								: null,
					});
				}
			}

			activeElements.sort((a, b) =>
				String((a.element as { id?: string }).id).localeCompare(
					String((b.element as { id?: string }).id)
				)
			);
			return hashValue({
				value: JSON.stringify({
					activeElements,
					project: {
						backgroundColor: activeProject?.backgroundColor,
						backgroundType: activeProject?.backgroundType,
						blurIntensity: activeProject?.blurIntensity,
						canvasSize: activeProject?.canvasSize,
						fps: activeProject?.fps,
					},
					sceneId: sceneId ?? activeProject?.currentSceneId ?? "default",
					cacheIdentity: normalizedCacheIdentity,
					time: Math.floor(time * cacheResolution) / cacheResolution,
				}),
			});
		},
		[cacheResolution, normalizedCacheIdentity]
	);

	const getCachedFrame = useCallback(
		(
			time: number,
			tracks: TimelineTrack[],
			mediaItems: MediaItem[],
			activeProject: TProject | null,
			sceneId?: string
		): ImageData | null => {
			const frameTime = Math.floor(time * cacheResolution) / cacheResolution;
			return cache.read({
				key: frameTime,
				timelineHash: getTimelineHash({
					time,
					tracks,
					mediaItems,
					activeProject,
					sceneId,
				}),
			});
		},
		[cache, cacheResolution, getTimelineHash]
	);

	const saveToIndexedDB = useCallback(async () => {
		if (!persist) return;
		try {
			const db = await openDB("frame-cache", 2, {
				upgrade(database: IDBPDatabase) {
					if (!database.objectStoreNames.contains("frames")) {
						database.createObjectStore("frames");
					}
				},
			});
			await db.put(
				"frames",
				cache.snapshot({ maxBytes: MAX_PERSISTED_CACHE_BYTES }),
				`cache-snapshot:${cache.namespace}`
			);
		} catch (error) {
			onError?.(error);
		}
	}, [cache, onError, persist]);

	const cacheFrame = useCallback(
		(
			time: number,
			imageData: ImageData,
			tracks: TimelineTrack[],
			mediaItems: MediaItem[],
			activeProject: TProject | null,
			sceneId?: string
		): void => {
			const frameTime = Math.floor(time * cacheResolution) / cacheResolution;
			cache.write({
				key: frameTime,
				imageData,
				timelineHash: getTimelineHash({
					time,
					tracks,
					mediaItems,
					activeProject,
					sceneId,
				}),
				currentTime: frameTime,
			});
			if (!persist) return;
			if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
			persistTimerRef.current = setTimeout(() => {
				void saveToIndexedDB();
			}, 1000);
		},
		[cache, cacheResolution, getTimelineHash, persist, saveToIndexedDB]
	);

	const invalidateCache = useCallback(() => {
		cache.clear();
		if (persist) void saveToIndexedDB();
	}, [cache, persist, saveToIndexedDB]);

	const getRenderStatus = useCallback(
		(
			time: number,
			tracks: TimelineTrack[],
			mediaItems: MediaItem[],
			activeProject: TProject | null
		): "cached" | "not-cached" => {
			const frameTime = Math.floor(time * cacheResolution) / cacheResolution;
			return cache.has({
				key: frameTime,
				timelineHash: getTimelineHash({
					time,
					tracks,
					mediaItems,
					activeProject,
				}),
			})
				? "cached"
				: "not-cached";
		},
		[cache, cacheResolution, getTimelineHash]
	);

	const isFrameCached = useCallback(
		(
			time: number,
			tracks: TimelineTrack[],
			mediaItems: MediaItem[],
			activeProject: TProject | null
		): boolean =>
			getRenderStatus(time, tracks, mediaItems, activeProject) === "cached",
		[getRenderStatus]
	);

	const preRenderNearbyFrames = useCallback(
		async (
			currentTime: number,
			renderFunction: (time: number) => Promise<ImageData>,
			_range = 2,
			tracks?: TimelineTrack[],
			mediaItems?: MediaItem[],
			activeProject?: TProject | null
		) => {
			if (!tracks || !mediaItems) return;
			const frameTime =
				Math.floor(currentTime * cacheResolution) / cacheResolution;
			if (isFrameCached(frameTime, tracks, mediaItems, activeProject ?? null)) {
				return;
			}
			const schedule = ({ callback }: { callback: () => void }) => {
				if ("requestIdleCallback" in window) {
					window.requestIdleCallback(callback, { timeout: 1000 });
					return;
				}
				setTimeout(callback, 0);
			};
			schedule({
				callback: () => {
					void (async () => {
						try {
							const imageData = await renderFunction(frameTime);
							cacheFrame(
								frameTime,
								imageData,
								tracks,
								mediaItems,
								activeProject ?? null
							);
						} catch {
							return;
						}
					})();
				},
			});
		},
		[cacheFrame, cacheResolution, isFrameCached]
	);

	const restoreFromIndexedDB = useCallback(async () => {
		if (!persist) return;
		try {
			const db = await openDB("frame-cache", 2, {
				upgrade(database: IDBPDatabase) {
					if (!database.objectStoreNames.contains("frames")) {
						database.createObjectStore("frames");
					}
				},
			});
			const entries = (await db.get(
				"frames",
				`cache-snapshot:${cache.namespace}`
			)) as SharedFrameCacheSnapshotEntry[] | undefined;
			if (Array.isArray(entries)) cache.restore({ entries });
		} catch (error) {
			onError?.(error);
		}
	}, [cache, onError, persist]);

	useEffect(() => {
		void restoreFromIndexedDB();
	}, [restoreFromIndexedDB]);

	useEffect(
		() => () => {
			if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
		},
		[]
	);

	const metrics = cache.metrics;
	return {
		getCachedFrame,
		cacheFrame,
		invalidateCache,
		getRenderStatus,
		isFrameCached,
		preRenderNearbyFrames,
		cacheMetrics: metrics,
		cacheHitRate: metrics.hits / Math.max(1, metrics.hits + metrics.misses),
		cacheSize: metrics.entries,
		cacheBytes: metrics.bytes,
		cacheByteBudget: cache.byteBudget,
	};
}
