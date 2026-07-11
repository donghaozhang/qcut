"use client";

import { useRef, useEffect, useCallback } from "react";
import type { CSSProperties } from "react";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import type { VideoSource } from "@/lib/media/media-source";
import type { MediaElement } from "@/types/timeline";
import {
	getMediaSourcePlaybackTime,
	getMediaTimelineDuration,
	mapMediaTimelineTime,
} from "@/lib/video/video-timing";
import {
	getOrCreateObjectURL,
	releaseObjectURL,
	revokeObjectURL,
	createObjectURL,
} from "@/lib/media/blob-manager";
import { useMediaAudioPreview } from "@/lib/audio/use-media-audio-preview";

interface VideoPlayerProps {
	videoId?: string;
	videoSource: VideoSource | null;
	poster?: string;
	className?: string;
	style?: CSSProperties;
	clipStartTime: number;
	trimStart: number;
	trimEnd: number;
	clipDuration: number;
	clipVolume?: number;
	fadeIn?: number;
	fadeOut?: number;
	clipPlaybackRate?: number;
	timingElement?: MediaElement;
}

function getVideoPlaybackRate({
	timingElement,
	clipPlaybackRate,
	clipStartTime,
	timelineTime,
	playbackSpeed,
}: {
	timingElement?: MediaElement;
	clipPlaybackRate: number;
	clipStartTime: number;
	timelineTime: number;
	playbackSpeed: number;
}): number {
	const timingRate = timingElement
		? mapMediaTimelineTime({
				element: timingElement,
				localTimelineTime: timelineTime - clipStartTime,
			}).playbackRate
		: clipPlaybackRate;
	return Math.min(
		16,
		Math.max(0.0625, playbackSpeed * Math.max(0.0625, timingRate))
	);
}

export function VideoPlayer({
	videoId,
	videoSource,
	poster,
	className = "",
	style,
	clipStartTime,
	trimStart,
	trimEnd,
	clipDuration,
	clipVolume = 1,
	fadeIn = 0,
	fadeOut = 0,
	clipPlaybackRate = 1,
	timingElement,
}: VideoPlayerProps) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const blobUrlRef = useRef<string | null>(null);
	const pendingCleanupRef = useRef<string | null>(null);
	const videoLoadedRef = useRef(false);
	const recoveryAttemptRef = useRef(0);
	const MAX_RECOVERY_ATTEMPTS = 2;
	const { isPlaying, currentTime, speed } = usePlaybackStore();
	const timelineTimeRef = useRef(currentTime);

	useEffect(() => {
		timelineTimeRef.current = currentTime;
	}, [currentTime]);

	const timelineDuration = timingElement
		? getMediaTimelineDuration(timingElement)
		: clipDuration - trimStart - trimEnd;
	const clipEndTime = clipStartTime + timelineDuration;
	const isInClipRange =
		currentTime >= clipStartTime && currentTime < clipEndTime;
	useMediaAudioPreview({
		mediaRef: videoRef,
		element: timingElement,
		duration: timelineDuration,
		forceMuted: clipVolume <= 0,
		fallbackGain: clipVolume,
		fallbackFadeIn: fadeIn,
		fallbackFadeOut: fadeOut,
	});
	const requiresManualTiming = Boolean(
		timingElement &&
			(timingElement.reverse ||
				(timingElement.freezeFrameDuration ?? 0) > 0 ||
				(timingElement.speedKeyframes?.length ?? 0) > 0)
	);
	const getVideoTime = useCallback(
		(timelineTime: number) => {
			if (!timingElement) {
				return Math.max(
					trimStart,
					Math.min(
						clipDuration - trimEnd,
						timelineTime - clipStartTime + trimStart
					)
				);
			}
			return getMediaSourcePlaybackTime({
				element: timingElement,
				localTimelineTime: timelineTime - clipStartTime,
			});
		},
		[timingElement, trimStart, trimEnd, clipDuration, clipStartTime]
	);
	const syncVideoTiming = useCallback(
		({
			video,
			timelineTime,
			playbackSpeed = speed,
			syncPosition = false,
		}: {
			video: HTMLVideoElement;
			timelineTime: number;
			playbackSpeed?: number;
			syncPosition?: boolean;
		}) => {
			video.playbackRate = getVideoPlaybackRate({
				timingElement,
				clipPlaybackRate,
				clipStartTime,
				timelineTime,
				playbackSpeed,
			});
			if (syncPosition) video.currentTime = getVideoTime(timelineTime);
		},
		[clipPlaybackRate, clipStartTime, getVideoTime, speed, timingElement]
	);

	// A seek can mount this player after the playback-seek event has fired.
	useEffect(() => {
		const video = videoRef.current;
		if (!video || !isInClipRange) return;
		syncVideoTiming({
			video,
			timelineTime: currentTime,
			syncPosition: !isPlaying || requiresManualTiming,
		});
	}, [
		currentTime,
		isInClipRange,
		isPlaying,
		requiresManualTiming,
		syncVideoTiming,
	]);

	// Sync playback events
	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;
		if (!isInClipRange) {
			return;
		}

		const handleSeekEvent = (e: CustomEvent) => {
			// Always update video time, even if outside clip range
			const timelineTime = e.detail.time;
			const videoTime = getVideoTime(timelineTime);
			video.currentTime = videoTime;
		};

		const handleUpdateEvent = (e: CustomEvent) => {
			// Always update video time, even if outside clip range
			const timelineTime = e.detail.time;
			const targetTime = getVideoTime(timelineTime);

			if (
				requiresManualTiming ||
				Math.abs(video.currentTime - targetTime) > 0.5
			) {
				video.currentTime = targetTime;
			}
		};

		const handleSpeed = (e: CustomEvent) => {
			syncVideoTiming({
				video,
				timelineTime: timelineTimeRef.current,
				playbackSpeed: e.detail.speed,
			});
		};

		window.addEventListener("playback-seek", handleSeekEvent as EventListener);
		window.addEventListener(
			"playback-update",
			handleUpdateEvent as EventListener
		);
		window.addEventListener("playback-speed", handleSpeed as EventListener);

		return () => {
			window.removeEventListener(
				"playback-seek",
				handleSeekEvent as EventListener
			);
			window.removeEventListener(
				"playback-update",
				handleUpdateEvent as EventListener
			);
			window.removeEventListener(
				"playback-speed",
				handleSpeed as EventListener
			);
		};
	}, [isInClipRange, requiresManualTiming, getVideoTime, syncVideoTiming]);

	// Sync playback state with readyState check
	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;

		const handlePlayError = (_err: any) => {
			// Silently handle play errors
		};

		const tryPlay = () => {
			if (video.readyState >= 3) {
				video.play().catch(handlePlayError);
			} else {
				const handleCanPlay = () => {
					if (usePlaybackStore.getState().isPlaying) {
						video.play().catch(handlePlayError);
					}
				};
				video.addEventListener("canplay", handleCanPlay, { once: true });
			}
		};

		if (isPlaying && isInClipRange && !requiresManualTiming) {
			tryPlay();
		} else {
			video.pause();
		}

		// Listen for direct play trigger dispatched synchronously from user gesture
		// This preserves the user gesture context on iOS/iPad where autoplay is restricted
		const handleDirectPlay = () => {
			if (isInClipRange && !requiresManualTiming) {
				tryPlay();
			}
		};

		window.addEventListener("playback-play", handleDirectPlay);

		return () => {
			window.removeEventListener("playback-play", handleDirectPlay);
		};
	}, [isPlaying, isInClipRange, requiresManualTiming]);

	// Sync global playback speed with clip-local timing.
	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;
		syncVideoTiming({ video, timelineTime: currentTime });
	}, [currentTime, syncVideoTiming]);

	// Check video element dimensions on mount
	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;

		// Dimensions will be checked by video element itself
	}, []);

	// Video source tracking with cached blob URLs and ref-counted cleanup
	useEffect(() => {
		const video = videoRef.current;
		if (!video || !videoSource) return;

		// Reset load state for new source
		videoLoadedRef.current = false;

		if (videoSource.type === "file") {
			// Release reference to previous blob URL (if any)
			const previousBlobUrl = pendingCleanupRef.current;

			// Use cached blob URL - may reuse existing URL for same file
			const blobUrl = getOrCreateObjectURL(videoSource.file, "VideoPlayer");
			blobUrlRef.current = blobUrl;
			video.src = blobUrl;

			console.log(
				`[VideoPlayer] Using blob URL for ${videoId ?? "video"}: ${blobUrl}`
			);

			// Release previous URL reference (only revokes if refCount reaches 0)
			if (previousBlobUrl && previousBlobUrl !== blobUrl) {
				console.log(
					`[VideoPlayer] Releasing previous blob URL: ${previousBlobUrl}`
				);
				releaseObjectURL(previousBlobUrl, "VideoPlayer-previous");
			}

			// Mark current URL for potential cleanup on unmount
			pendingCleanupRef.current = blobUrl;

			return () => {
				// DON'T release here - let the next effect iteration handle it
				// or component unmount cleanup
				console.log(
					`[VideoPlayer] Effect cleanup - blob URL marked for later: ${blobUrl}`
				);
			};
		}

		if (videoSource.type === "remote") {
			video.src = videoSource.src;
			// Release any pending blob URL when switching to remote
			if (pendingCleanupRef.current) {
				releaseObjectURL(
					pendingCleanupRef.current,
					"VideoPlayer-remote-switch"
				);
				pendingCleanupRef.current = null;
			}
		}

		return () => {
			if (video) {
				video.src = "";
			}
		};
	}, [videoSource, videoId]);

	// Separate cleanup effect for component unmount only
	useEffect(() => {
		return () => {
			// Release reference on actual component unmount (only revokes if refCount reaches 0)
			if (pendingCleanupRef.current) {
				console.log(
					`[VideoPlayer] Component unmount - releasing: ${pendingCleanupRef.current}`
				);
				releaseObjectURL(pendingCleanupRef.current, "VideoPlayer-unmount");
				pendingCleanupRef.current = null;
			}
		};
	}, []); // Empty deps = only runs on unmount

	return (
		<video
			ref={videoRef}
			data-video-id={videoId}
			poster={poster}
			className={`object-contain ${className}`}
			playsInline
			preload="auto"
			controls={false}
			disablePictureInPicture
			disableRemotePlayback
			style={{
				pointerEvents: "none",
				width: "100%",
				height: "100%",
				...style,
			}}
			onContextMenu={(e) => e.preventDefault()}
			onLoadedMetadata={(event) => {
				videoLoadedRef.current = true;
				recoveryAttemptRef.current = 0; // Reset recovery counter on successful load
				syncVideoTiming({
					video: event.currentTarget,
					timelineTime: timelineTimeRef.current,
					syncPosition: true,
				});
				console.log(`[VideoPlayer] ✅ Video loaded: ${videoId ?? "video"}`);
			}}
			onError={(e) => {
				const video = e.currentTarget;
				const errorCode = video.error?.code;
				const errorMessage = video.error?.message || "Unknown error";

				console.error(
					`[VideoPlayer] ❌ Video error for ${videoId ?? "video"}:`,
					{
						code: errorCode,
						message: errorMessage,
						src: video.src?.substring(0, 50) + "...",
						networkState: video.networkState,
						readyState: video.readyState,
					}
				);

				// Handle ERR_UPLOAD_FILE_CHANGED by creating fresh blob URL
				// This error occurs when the File backing a blob URL is invalidated
				// Error code 4 = MEDIA_ERR_SRC_NOT_SUPPORTED (often wraps network errors in Electron)
				const isFileChangedError =
					errorMessage.includes("UPLOAD_FILE_CHANGED") ||
					errorMessage.includes("ERR_FILE_NOT_FOUND") ||
					(errorCode === 4 && videoSource?.type === "file");

				if (isFileChangedError && videoSource?.type === "file") {
					if (recoveryAttemptRef.current >= MAX_RECOVERY_ATTEMPTS) {
						console.error(
							`[VideoPlayer] ❌ Recovery failed after ${MAX_RECOVERY_ATTEMPTS} attempts for ${videoId ?? "video"}`
						);
						videoLoadedRef.current = false;
						return;
					}
					recoveryAttemptRef.current++;
					console.log(
						`[VideoPlayer] 🔄 Attempting recovery (${recoveryAttemptRef.current}/${MAX_RECOVERY_ATTEMPTS}) with fresh blob URL for ${videoId ?? "video"}`
					);

					// Release old URL reference
					if (pendingCleanupRef.current) {
						releaseObjectURL(
							pendingCleanupRef.current,
							"VideoPlayer-error-recovery"
						);
					}

					// Create fresh URL (bypasses cache, creates new blob from File)
					const freshUrl = createObjectURL(
						videoSource.file,
						"VideoPlayer-recovery"
					);
					blobUrlRef.current = freshUrl;
					pendingCleanupRef.current = freshUrl;
					video.src = freshUrl;
					video.load();

					console.log(`[VideoPlayer] 🔄 Recovery URL created: ${freshUrl}`);
					return;
				}

				videoLoadedRef.current = false;
			}}
			onCanPlay={(event) => {
				syncVideoTiming({
					video: event.currentTarget,
					timelineTime: timelineTimeRef.current,
				});
				console.log(
					`[VideoPlayer] ▶️ Video ready to play: ${videoId ?? "video"}`
				);
			}}
		/>
	);
}
