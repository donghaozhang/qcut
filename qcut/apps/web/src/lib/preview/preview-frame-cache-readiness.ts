const DEFAULT_TIMELINE_TOLERANCE_SECONDS = 1 / 15;

export function hasCurrentVideoFrames({
	captureSurface,
	timelineTime,
	toleranceSeconds = DEFAULT_TIMELINE_TOLERANCE_SECONDS,
}: {
	captureSurface: HTMLElement;
	timelineTime: number;
	toleranceSeconds?: number;
}): boolean {
	const videos = captureSurface.querySelectorAll("video");
	if (videos.length === 0) return true;

	for (const video of videos) {
		const presentedTimelineTime = Number(
			video.getAttribute("data-qcut-presented-timeline-time")
		);
		if (
			!Number.isFinite(presentedTimelineTime) ||
			Math.abs(presentedTimelineTime - timelineTime) > toleranceSeconds
		) {
			return false;
		}
	}
	return true;
}
