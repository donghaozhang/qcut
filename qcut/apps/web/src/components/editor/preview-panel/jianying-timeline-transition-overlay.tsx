import { useCallback, useEffect, useRef } from "react";
import type { JianyingTimelineTransitionPreviewState } from "./use-jianying-timeline-transition-preview";

const MAX_PLAYBACK_DRIFT_SECONDS = 0.12;

export function JianyingTimelineTransitionOverlay({
	preview,
	currentTime,
	isPlaying,
}: {
	preview: JianyingTimelineTransitionPreviewState;
	currentTime: number;
	isPlaying: boolean;
}) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const candidate = preview.candidate;
	const isActive =
		preview.status === "ready" &&
		candidate !== null &&
		currentTime >= candidate.windowStart &&
		currentTime < candidate.windowEnd;

	const syncPlayback = useCallback(() => {
		const video = videoRef.current;
		if (!video || preview.status !== "ready" || !candidate) return;
		const targetTime = Math.min(
			preview.result.duration,
			Math.max(0, currentTime - candidate.windowStart)
		);
		if (
			!isPlaying ||
			Math.abs(video.currentTime - targetTime) > MAX_PLAYBACK_DRIFT_SECONDS
		) {
			video.currentTime = targetTime;
		}
		if (isPlaying) {
			void video.play().catch(() => {});
			return;
		}
		video.pause();
	}, [candidate, currentTime, isPlaying, preview]);

	useEffect(() => {
		if (isActive) syncPlayback();
	}, [isActive, syncPlayback]);

	if (!isActive || preview.status !== "ready") return null;
	return (
		<video
			ref={videoRef}
			src={preview.result.previewUrl}
			className="pointer-events-none absolute inset-0 z-[36] size-full object-fill"
			muted
			playsInline
			preload="auto"
			aria-label="本机剪映时间线转场预览"
			data-testid="jianying-timeline-transition-preview"
			data-transition-id={candidate.transitionId}
			onLoadedMetadata={syncPlayback}
			onCanPlay={syncPlayback}
		/>
	);
}
