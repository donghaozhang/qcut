import type {
	MediaStateSnapshotItem,
	PreviewStateSnapshot,
	PreviewVideoStateSnapshot,
	TimelineSnapshotTrack,
} from "../../../../../electron/types/claude-api";

function numberAttribute({
	element,
	name,
}: {
	element: Element;
	name: string;
}): number | null {
	const rawValue = element.getAttribute(name);
	if (!rawValue) return null;
	const value = Number(rawValue);
	return Number.isFinite(value) ? value : null;
}

function mediaIdForElement({
	element,
}: {
	element: TimelineSnapshotTrack["elements"][number];
}): string | null {
	const mediaId = element.mediaId;
	return typeof mediaId === "string" && mediaId.length > 0 ? mediaId : null;
}

function elementTimelineDuration({
	element,
}: {
	element: TimelineSnapshotTrack["elements"][number];
}): number {
	const duration =
		typeof element.duration === "number" && Number.isFinite(element.duration)
			? element.duration
			: 0;
	const trimStart =
		typeof element.trimStart === "number" && Number.isFinite(element.trimStart)
			? element.trimStart
			: 0;
	const trimEnd =
		typeof element.trimEnd === "number" && Number.isFinite(element.trimEnd)
			? element.trimEnd
			: 0;
	const playbackRate =
		typeof element.playbackRate === "number" &&
		Number.isFinite(element.playbackRate) &&
		element.playbackRate > 0
			? element.playbackRate
			: 1;
	return Math.max(0, duration - trimStart - trimEnd) / playbackRate;
}

function activeVideoMediaIds({
	tracks,
	mediaItems,
	currentTime,
}: {
	tracks: TimelineSnapshotTrack[];
	mediaItems: MediaStateSnapshotItem[];
	currentTime: number;
}): string[] {
	const videoMediaIds = new Set(
		mediaItems.filter((item) => item.type === "video").map((item) => item.id)
	);
	const activeIds = new Set<string>();

	for (const track of tracks) {
		if (track.hidden === true) continue;
		for (const element of track.elements) {
			if (element.type !== "media" || element.hidden === true) continue;
			const mediaId = mediaIdForElement({ element });
			if (!mediaId || !videoMediaIds.has(mediaId)) continue;
			const startTime =
				typeof element.startTime === "number" &&
				Number.isFinite(element.startTime)
					? element.startTime
					: 0;
			const endTime = startTime + elementTimelineDuration({ element });
			if (currentTime >= startTime && currentTime < endTime) {
				activeIds.add(mediaId);
			}
		}
	}

	return [...activeIds];
}

function videoSnapshot({
	video,
}: {
	video: HTMLVideoElement;
}): PreviewVideoStateSnapshot {
	const qualityFrames = (() => {
		try {
			return video.getVideoPlaybackQuality?.().totalVideoFrames ?? 0;
		} catch {
			return 0;
		}
	})();
	const trackedFrames =
		numberAttribute({
			element: video,
			name: "data-qcut-presented-frames",
		}) ?? 0;
	const presentedAt = numberAttribute({
		element: video,
		name: "data-qcut-presented-at",
	});

	return {
		mediaId: video.getAttribute("data-video-id"),
		readyState: video.readyState,
		networkState: video.networkState,
		videoWidth: video.videoWidth,
		videoHeight: video.videoHeight,
		currentTime: video.currentTime,
		presentedFrames: Math.max(qualityFrames, trackedFrames),
		presentedAt,
		error: video.error
			? video.error.message || `MediaError ${video.error.code}`
			: null,
	};
}

function matchesMediaId({
	videoId,
	mediaId,
}: {
	videoId: string | null;
	mediaId: string;
}): boolean {
	return videoId === mediaId || videoId?.startsWith(`${mediaId}-`) === true;
}

function readinessReason({
	editorReady,
	panelMounted,
	canvasMounted,
	loading,
	activeIds,
	videos,
}: {
	editorReady: boolean;
	panelMounted: boolean;
	canvasMounted: boolean;
	loading: boolean;
	activeIds: string[];
	videos: PreviewVideoStateSnapshot[];
}): string | null {
	if (!editorReady) return "editor-not-ready";
	if (!panelMounted) return "preview-panel-not-mounted";
	if (loading) return "native-composition-rendering";
	if (activeIds.length === 0) return null;
	if (!canvasMounted) return "preview-canvas-not-mounted";

	for (const mediaId of activeIds) {
		const matches = videos.filter((video) =>
			matchesMediaId({ videoId: video.mediaId, mediaId })
		);
		if (matches.length === 0) return `active-video-not-mounted:${mediaId}`;
		const failed = matches.find((video) => video.error);
		if (failed) return `active-video-error:${mediaId}`;
		const frameReady = matches.some(
			(video) =>
				video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
				video.videoWidth > 0 &&
				video.videoHeight > 0 &&
				video.presentedFrames > 0
		);
		if (!frameReady) return `active-video-frame-not-ready:${mediaId}`;
	}

	return null;
}

export function buildPreviewStateSnapshot({
	tracks,
	mediaItems,
	currentTime,
	editorReady,
}: {
	tracks: TimelineSnapshotTrack[];
	mediaItems: MediaStateSnapshotItem[];
	currentTime: number;
	editorReady: boolean;
}): PreviewStateSnapshot {
	if (typeof document === "undefined") {
		return {
			panelMounted: false,
			canvasMounted: false,
			ready: false,
			reason: "preview-document-unavailable",
			loading: false,
			activeVideoMediaIds: [],
			nativeCompositionStatus: "idle",
			lastPresentedAt: null,
			videos: [],
		};
	}

	const panel = document.querySelector<HTMLElement>(
		'[data-testid="preview-panel"]'
	);
	const canvas = panel?.querySelector<HTMLElement>(
		'[data-testid="preview-canvas"]'
	);
	const loading = Boolean(
		canvas?.querySelector('[data-testid="native-composition-preview-loading"]')
	);
	const hasNativeError = Boolean(
		canvas?.querySelector('[data-testid="native-composition-preview-error"]')
	);
	const hasNativeReady = Boolean(
		canvas?.querySelector('[data-native-composition-preview="ready"]')
	);
	const nativeCompositionStatus = loading
		? "rendering"
		: hasNativeReady
			? "ready"
			: hasNativeError
				? "error"
				: "idle";
	const videos = Array.from(
		canvas?.querySelectorAll<HTMLVideoElement>("video[data-video-id]") ?? []
	).map((video) => videoSnapshot({ video }));
	const activeIds = activeVideoMediaIds({
		tracks,
		mediaItems,
		currentTime,
	});
	const reason = readinessReason({
		editorReady,
		panelMounted: Boolean(panel),
		canvasMounted: Boolean(canvas),
		loading,
		activeIds,
		videos,
	});
	const presentedTimes = videos
		.map((video) => video.presentedAt)
		.filter((value): value is number => value !== null);

	return {
		panelMounted: Boolean(panel),
		canvasMounted: Boolean(canvas),
		ready: reason === null,
		reason,
		loading,
		activeVideoMediaIds: activeIds,
		nativeCompositionStatus,
		lastPresentedAt:
			presentedTimes.length > 0 ? Math.max(...presentedTimes) : null,
		videos,
	};
}
