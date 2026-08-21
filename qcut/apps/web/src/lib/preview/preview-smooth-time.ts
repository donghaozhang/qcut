/**
 * Preview smooth-time gating.
 *
 * During playback the preview panel can subscribe to per-frame
 * "playback-update" events and re-render the whole React preview tree every
 * animation frame ("smooth time"). That is required for content that animates
 * through React (keyframes, transitions, captions, Remotion, screen-recording
 * zoom), but it is pure overhead for static clips. Chunked playback proxies
 * advance their windows from playback events (useVideoEnhancementProxyWindow)
 * and do not need per-frame renders.
 *
 * These helpers decide whether anything currently on the canvas actually
 * needs per-frame React updates. When nothing does, the preview panel skips
 * the per-frame subscription entirely and playback runs without re-rendering
 * React — video/audio elements keep syncing through lightweight window
 * events (see playback-store).
 */

import { resolveActiveAudioCrossfadePreview } from "@/lib/audio/audio-crossfade-preview";
import { getTimelineElementDuration } from "@/lib/timeline";
import { resolveActiveClipTransitionPreview } from "@/lib/transitions/clip-transition-preview";
import { JIANYING_TIMELINE_PREFETCH_SECONDS } from "@/lib/transitions/jianying-timeline-preview";
import { getMediaTimelineDuration } from "@/lib/video/video-timing";
import {
	resolveClipTransition,
	type MediaElement,
	type StickerElement,
	type TextElement,
	type TimelineElement,
	type TimelineTrack,
} from "@/types/timeline";

export interface PreviewSmoothTimeNeed {
	needsSmoothTime: boolean;
	/** Diagnostic label describing what forced per-frame rendering. */
	reason: string | null;
}

export const PREVIEW_SMOOTH_TIME_NOT_NEEDED: PreviewSmoothTimeNeed = {
	needsSmoothTime: false,
	reason: null,
};

export interface JianyingPrefetchWindow {
	start: number;
	end: number;
}

function need(reason: string): PreviewSmoothTimeNeed {
	return { needsSmoothTime: true, reason };
}

function hasAnyKeyframes(
	keyframes: Partial<Record<string, readonly unknown[]>> | undefined
): boolean {
	if (!keyframes) return false;
	for (const list of Object.values(keyframes)) {
		if (Array.isArray(list) && list.length > 0) return true;
	}
	return false;
}

function isActiveAnimationType(type: string | undefined): boolean {
	return Boolean(type && type !== "none");
}

function mediaElementNeedsSmoothTime(element: MediaElement): boolean {
	if (hasAnyKeyframes(element.keyframes)) return true;
	if (
		isActiveAnimationType(element.animationInType) ||
		isActiveAnimationType(element.animationOutType) ||
		isActiveAnimationType(element.comboAnimationType)
	) {
		return true;
	}
	const masks = [
		...(element.masks ?? []),
		...(element.mask ? [element.mask] : []),
	];
	for (const mask of masks) {
		if (mask.enabled === false) continue;
		if (hasAnyKeyframes(mask.keyframes) || mask.tracking) return true;
	}
	// Enabled custom cutouts are frame-indexed; their style depends on the
	// playhead. Elements carry a disabled default object — ignore it.
	if (element.customCutout?.enabled) return true;
	if (
		element.chromaKey?.enabled &&
		hasAnyKeyframes(element.chromaKey.keyframes)
	) {
		return true;
	}
	const color = element.color;
	if (color?.enabled) {
		if (
			hasAnyKeyframes(color.keyframes) ||
			hasAnyKeyframes(color.curveShapeKeyframes)
		) {
			return true;
		}
		// Animated film grain reseeds from the frame index each frame.
		if (color.basic.enabled && color.basic.grain !== 0) return true;
	}
	return false;
}

function textElementNeedsSmoothTime(element: TextElement): boolean {
	return (
		isActiveAnimationType(element.animationType) ||
		hasAnyKeyframes(element.keyframes) ||
		Boolean(element.trackingTargetId) ||
		// Jianying text playback overlays sync to the smooth clock.
		Boolean(element.jianyingTextStyle)
	);
}

function stickerElementNeedsSmoothTime(element: StickerElement): boolean {
	return (
		isActiveAnimationType(element.animationInType) ||
		isActiveAnimationType(element.animationOutType) ||
		isActiveAnimationType(element.animationLoopType) ||
		hasAnyKeyframes(element.keyframes) ||
		Boolean(element.tracking)
	);
}

/**
 * Whether an element's preview rendering visibly changes with the playhead
 * within a single clip (i.e. between active-set boundary crossings).
 */
export function timelineElementNeedsSmoothTime({
	element,
}: {
	element: TimelineElement;
}): boolean {
	switch (element.type) {
		case "media":
			return mediaElementNeedsSmoothTime(element);
		case "text":
			return textElementNeedsSmoothTime(element);
		case "sticker":
			return stickerElementNeedsSmoothTime(element);
		case "captions":
			// Word-level highlighting follows the playhead continuously.
			return true;
		case "markdown":
			return element.scrollMode === "auto-scroll";
		case "remotion":
			// The composition's externalFrame must advance every frame.
			return true;
		case "hyperframes":
			// Composition time is pushed to the embedded player per update.
			return true;
		case "effect":
			return true;
		case "adjustment":
			// Adjustment layers already resolve against the coarse store time.
			return false;
		default:
			return false;
	}
}

/**
 * Timeline windows (with prefetch lead time) around jianying-local
 * transitions. While the playhead is inside one, per-frame rendering stays on
 * so the proxy prefetch and overlay keep resolving against fresh time.
 */
export function resolveJianyingTransitionPrefetchWindows({
	tracks,
	fps,
}: {
	tracks: TimelineTrack[];
	fps: number;
}): JianyingPrefetchWindow[] {
	const windows: JianyingPrefetchWindow[] = [];
	for (const track of tracks) {
		if (track.type !== "media" || track.hidden) continue;
		for (const transition of track.transitions ?? []) {
			if (transition.engine !== "jianying-local") continue;
			const resolved = resolveClipTransition({
				track,
				transition,
				getElementDuration: ({ element }) =>
					getTimelineElementDuration({ element, fps }),
			});
			if (!resolved) continue;
			windows.push({
				start: resolved.windowStart - JIANYING_TIMELINE_PREFETCH_SECONDS,
				end: resolved.windowEnd,
			});
		}
	}
	return windows;
}

export function findJianyingPrefetchWindowIndex({
	windows,
	time,
}: {
	windows: readonly JianyingPrefetchWindow[];
	time: number;
}): number {
	for (let index = 0; index < windows.length; index++) {
		const window = windows[index];
		if (time >= window.start && time < window.end) return index;
	}
	return -1;
}

function previewElementDuration(element: TimelineElement): number {
	return element.type === "media"
		? getMediaTimelineDuration(element)
		: element.duration - element.trimStart - element.trimEnd;
}

export interface ResolvePreviewSmoothTimeNeedParams {
	/** Expanded render tracks (compound children included) for element scans. */
	tracks: TimelineTrack[];
	/** Raw timeline tracks, matching the transition/crossfade resolvers. */
	transitionTracks: TimelineTrack[];
	time: number;
	fps: number;
	zoomActive: boolean;
	cursorOverlayActive: boolean;
	hasElementEffects: (elementId: string) => boolean;
	jianyingPrefetchWindows: readonly JianyingPrefetchWindow[];
}

/**
 * Decides whether the preview needs per-frame React updates at `time`.
 * Called only on renders (active-set boundary crossings, seeks, pauses),
 * never per animation frame.
 */
export function resolvePreviewSmoothTimeNeed({
	tracks,
	transitionTracks,
	time,
	fps,
	zoomActive,
	cursorOverlayActive,
	hasElementEffects,
	jianyingPrefetchWindows,
}: ResolvePreviewSmoothTimeNeedParams): PreviewSmoothTimeNeed {
	if (zoomActive) return need("zoom-region");
	if (cursorOverlayActive) return need("cursor-overlay");
	if (
		findJianyingPrefetchWindowIndex({
			windows: jianyingPrefetchWindows,
			time,
		}) >= 0
	) {
		return need("jianying-transition-prefetch");
	}

	for (const track of tracks) {
		if (track.hidden) continue;
		for (const element of track.elements) {
			if (element.hidden) continue;
			const end = element.startTime + previewElementDuration(element);
			if (time < element.startTime || time >= end) continue;
			if (hasElementEffects(element.id)) return need("element-effects");
			if (timelineElementNeedsSmoothTime({ element })) {
				return need(`animated-element:${element.type}`);
			}
		}
	}

	const transitionPreview = resolveActiveClipTransitionPreview({
		tracks: transitionTracks,
		currentTime: time,
		fps,
	});
	if (transitionPreview.statesByElementId.size > 0) {
		return need("clip-transition");
	}
	const crossfadePreview = resolveActiveAudioCrossfadePreview({
		tracks: transitionTracks,
		currentTime: time,
		fps,
	});
	if (crossfadePreview.statesByElementId.size > 0) {
		return need("audio-crossfade");
	}

	return PREVIEW_SMOOTH_TIME_NOT_NEEDED;
}
