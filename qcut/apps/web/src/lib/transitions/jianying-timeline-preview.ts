import type { MediaItem } from "@/stores/media/media-store-types";
import {
	resolveClipTransition,
	type MediaElement,
	type TimelineTrack,
} from "@/types/timeline";
import type {
	JianyingTimelinePreviewRequest,
	JianyingTimelinePreviewSource,
} from "@/types/electron";
import {
	getMediaSourcePlaybackTime,
	getMediaTimelineDuration,
} from "@/lib/video/video-timing";

const LOCAL_PACKAGE_HASH_PATTERN = /^[a-f0-9]{32,64}$/;
const DEFAULT_PREFETCH_SECONDS = 4;
const MAX_PROXY_DIMENSION = 960;
const MAX_PROXY_FPS = 30;

export interface JianyingTimelinePreviewCandidate {
	cacheKey: string;
	transitionId: string;
	windowStart: number;
	windowEnd: number;
	request: JianyingTimelinePreviewRequest;
}

function roundPreviewValue({ value }: { value: number }): number {
	return Math.round(value * 1_000_000) / 1_000_000;
}

function fingerprintTransientPath({ value }: { value: string }): string {
	let hash = 2_166_136_261;
	for (let index = 0; index < value.length; index++) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16_777_619);
	}
	return (hash >>> 0).toString(36);
}

function evenDimension({ value }: { value: number }): number {
	const rounded = Math.max(2, Math.round(value));
	return rounded % 2 === 0 ? rounded : rounded + 1;
}

export function resolveJianyingTimelinePreviewDimensions({
	width,
	height,
}: {
	width: number;
	height: number;
}): { width: number; height: number } {
	const safeWidth = Math.max(2, width);
	const safeHeight = Math.max(2, height);
	const scale = Math.min(
		1,
		MAX_PROXY_DIMENSION / Math.max(safeWidth, safeHeight)
	);
	return {
		width: evenDimension({ value: safeWidth * scale }),
		height: evenDimension({ value: safeHeight * scale }),
	};
}

function buildTimelinePreviewSource({
	element,
	mediaItem,
	inputPath,
	timelineStart,
	timelineEnd,
	fps,
}: {
	element: MediaElement;
	mediaItem: MediaItem;
	inputPath: string;
	timelineStart: number;
	timelineEnd: number;
	fps: number;
}): JianyingTimelinePreviewSource | null {
	const timelineDuration = timelineEnd - timelineStart;
	if (timelineDuration <= 0) return null;
	if (mediaItem.type === "image") {
		return {
			inputPath,
			kind: "image",
			sourceStart: 0,
			sourceDuration: roundPreviewValue({ value: timelineDuration }),
			playbackRate: 1,
			reverse: false,
		};
	}
	if (
		mediaItem.type !== "video" ||
		(element.speedKeyframes?.length ?? 0) > 0 ||
		(element.freezeFrameDuration ?? 0) > 0
	) {
		return null;
	}
	const sourceAtStart = getMediaSourcePlaybackTime({
		element,
		localTimelineTime: timelineStart,
		fps,
	});
	const sourceAtEnd = getMediaSourcePlaybackTime({
		element,
		localTimelineTime: timelineEnd,
		fps,
	});
	const sourceDuration = Math.abs(sourceAtEnd - sourceAtStart);
	if (sourceDuration < 1 / Math.max(1, fps)) return null;
	return {
		inputPath,
		kind: "video",
		sourceStart: roundPreviewValue({
			value: Math.min(sourceAtStart, sourceAtEnd),
		}),
		sourceDuration: roundPreviewValue({ value: sourceDuration }),
		playbackRate: roundPreviewValue({
			value: sourceDuration / timelineDuration,
		}),
		reverse: sourceAtEnd < sourceAtStart,
	};
}

function distanceToWindow({
	currentTime,
	windowStart,
	windowEnd,
}: {
	currentTime: number;
	windowStart: number;
	windowEnd: number;
}): number {
	if (currentTime < windowStart) return windowStart - currentTime;
	if (currentTime >= windowEnd) return currentTime - windowEnd;
	return 0;
}

function buildRendererCacheKey({
	transitionId,
	presetId,
	packageHash,
	fromElement,
	toElement,
	fromMediaItem,
	toMediaItem,
	request,
}: {
	transitionId: string;
	presetId: string;
	packageHash: string;
	fromElement: MediaElement;
	toElement: MediaElement;
	fromMediaItem: MediaItem;
	toMediaItem: MediaItem;
	request: JianyingTimelinePreviewRequest;
}): string {
	return JSON.stringify({
		transitionId,
		presetId,
		packageHash,
		fromElementId: fromElement.id,
		toElementId: toElement.id,
		fromFile: [
			fromMediaItem.id,
			fromMediaItem.file.size,
			fromMediaItem.file.lastModified,
			fingerprintTransientPath({ value: request.inputA.inputPath }),
		],
		toFile: [
			toMediaItem.id,
			toMediaItem.file.size,
			toMediaItem.file.lastModified,
			fingerprintTransientPath({ value: request.inputB.inputPath }),
		],
		duration: request.duration,
		fps: request.fps,
		width: request.width,
		height: request.height,
		inputA: { ...request.inputA, inputPath: undefined },
		inputB: { ...request.inputB, inputPath: undefined },
	});
}

export function resolveJianyingTimelinePreviewCandidate({
	tracks,
	mediaItems,
	currentTime,
	fps,
	canvasSize,
	resolveMediaPath,
	prefetchSeconds = DEFAULT_PREFETCH_SECONDS,
}: {
	tracks: TimelineTrack[];
	mediaItems: MediaItem[];
	currentTime: number;
	fps: number;
	canvasSize: { width: number; height: number };
	resolveMediaPath: ({ mediaItem }: { mediaItem: MediaItem }) => string | null;
	prefetchSeconds?: number;
}): JianyingTimelinePreviewCandidate | null {
	const mediaById = new Map(
		mediaItems.map((mediaItem) => [mediaItem.id, mediaItem])
	);
	const dimensions = resolveJianyingTimelinePreviewDimensions(canvasSize);
	const previewFps = Math.min(MAX_PROXY_FPS, Math.max(1, fps));
	let bestCandidate: JianyingTimelinePreviewCandidate | null = null;
	let bestDistance = Number.POSITIVE_INFINITY;

	for (const track of tracks) {
		if (track.type !== "media" || track.hidden) continue;
		for (const transition of track.transitions ?? []) {
			if (
				transition.engine !== "jianying-local" ||
				!LOCAL_PACKAGE_HASH_PATTERN.test(transition.packageHash ?? "")
			) {
				continue;
			}
			const resolved = resolveClipTransition({
				track,
				transition,
				getElementDuration: ({ element }) =>
					getMediaTimelineDuration(element, previewFps),
			});
			if (!resolved) continue;
			const distance = distanceToWindow({
				currentTime,
				windowStart: resolved.windowStart,
				windowEnd: resolved.windowEnd,
			});
			if (distance > prefetchSeconds || distance >= bestDistance) continue;
			const fromMediaItem = mediaById.get(resolved.fromElement.mediaId);
			const toMediaItem = mediaById.get(resolved.toElement.mediaId);
			if (!fromMediaItem || !toMediaItem) continue;
			const inputAPath = resolveMediaPath({ mediaItem: fromMediaItem });
			const inputBPath = resolveMediaPath({ mediaItem: toMediaItem });
			if (!inputAPath || !inputBPath) continue;
			const inputA = buildTimelinePreviewSource({
				element: resolved.fromElement,
				mediaItem: fromMediaItem,
				inputPath: inputAPath,
				timelineStart: resolved.windowStart - resolved.fromElement.startTime,
				timelineEnd: resolved.cutTime - resolved.fromElement.startTime,
				fps: previewFps,
			});
			const inputB = buildTimelinePreviewSource({
				element: resolved.toElement,
				mediaItem: toMediaItem,
				inputPath: inputBPath,
				timelineStart: resolved.cutTime - resolved.toElement.startTime,
				timelineEnd: resolved.windowEnd - resolved.toElement.startTime,
				fps: previewFps,
			});
			if (!inputA || !inputB) continue;
			const request: JianyingTimelinePreviewRequest = {
				presetId: transition.presetId,
				packageHash: transition.packageHash ?? "",
				inputA,
				inputB,
				duration: roundPreviewValue({ value: resolved.transition.duration }),
				fps: previewFps,
				...dimensions,
			};
			bestCandidate = {
				cacheKey: buildRendererCacheKey({
					transitionId: transition.id,
					presetId: transition.presetId,
					packageHash: transition.packageHash ?? "",
					fromElement: resolved.fromElement,
					toElement: resolved.toElement,
					fromMediaItem,
					toMediaItem,
					request,
				}),
				transitionId: transition.id,
				windowStart: resolved.windowStart,
				windowEnd: resolved.windowEnd,
				request,
			};
			bestDistance = distance;
		}
	}

	return bestCandidate;
}
