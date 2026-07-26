export const QCUT_VIDEO_FRAME_EVENT = "qcut-video-frame";

export interface QcutVideoFrameEventDetail {
	videoId?: string;
	isActivePlaybackFrame: boolean;
	intervalMs: number | null;
	mediaTime: number;
	presentedFrames: number;
	timelineTime?: number;
}

export function isQcutVideoFrameEvent(
	event: Event
): event is CustomEvent<QcutVideoFrameEventDetail> {
	if (!(event instanceof CustomEvent)) return false;
	const detail = event.detail as Partial<QcutVideoFrameEventDetail> | undefined;
	return (
		(detail?.videoId === undefined || typeof detail.videoId === "string") &&
		typeof detail?.isActivePlaybackFrame === "boolean" &&
		typeof detail.mediaTime === "number" &&
		typeof detail.presentedFrames === "number" &&
		(detail.intervalMs === null || typeof detail.intervalMs === "number") &&
		(detail.timelineTime === undefined ||
			typeof detail.timelineTime === "number")
	);
}
