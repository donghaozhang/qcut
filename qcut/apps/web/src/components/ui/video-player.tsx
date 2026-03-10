"use client";

import { useRef, useEffect } from "react";
import type { CSSProperties } from "react";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import type { VideoSource } from "@/lib/media/media-source";
import {
	getOrCreateObjectURL,
	releaseObjectURL,
	revokeObjectURL,
	createObjectURL,
} from "@/lib/media/blob-manager";

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
}: VideoPlayerProps) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const blobUrlRef = useRef<string | null>(null);
	const pendingCleanupRef = useRef<string | null>(null);
	const videoLoadedRef = useRef(false);
	const recoveryAttemptRef = useRef(0);
	const MAX_RECOVERY_ATTEMPTS = 2;
	const { isPlaying, currentTime, volume, speed, muted } = usePlaybackStore();
	const timelineTimeRef = useRef(currentTime);

	useEffect(() => {
		timelineTimeRef.current = currentTime;
	}, [currentTime]);

	// Calculate if we're within this clip's timeline range
	const clipEndTime = clipStartTime + (clipDuration - trimStart - trimEnd);
	const isInClipRange =
		currentTime >= clipStartTime && currentTime < clipEndTime;

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
			const videoTime = Math.max(
				trimStart,
				Math.min(
					clipDuration - trimEnd,
					timelineTime - clipStartTime + trimStart
				)
			);
			video.currentTime = videoTime;
		};

		const handleUpdateEvent = (e: CustomEvent) => {
			// Always update video time, even if outside clip range
			const timelineTime = e.detail.time;
			const targetTime = Math.max(
				trimStart,
				Math.min(
					clipDuration - trimEnd,
					timelineTime - clipStartTime + trimStart
				)
			);

			if (Math.abs(video.currentTime - targetTime) > 0.5) {
				video.currentTime = targetTime;
			}
		};

		const handleSpeed = (e: CustomEvent) => {
			video.playbackRate = e.detail.speed;
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
	}, [clipStartTime, trimStart, trimEnd, clipDuration, isInClipRange]);

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

		if (isPlaying && isInClipRange) {
			tryPlay();
		} else {
			video.pause();
		}

		// Listen for direct play trigger dispatched synchronously from user gesture
		// This preserves the user gesture context on iOS/iPad where autoplay is restricted
		const handleDirectPlay = () => {
			if (isInClipRange) {
				tryPlay();
			}
		};

		window.addEventListener("playback-play", handleDirectPlay);

		return () => {
			window.removeEventListener("playback-play", handleDirectPlay);
		};
	}, [isPlaying, isInClipRange]);

	// Sync volume and speed
	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;

		video.volume = volume;
		video.muted = muted;
		video.playbackRate = speed;
	}, [volume, speed, muted]);

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
			onLoadedMetadata={() => {
				videoLoadedRef.current = true;
				recoveryAttemptRef.current = 0; // Reset recovery counter on successful load
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
			onCanPlay={() => {
				console.log(
					`[VideoPlayer] ▶️ Video ready to play: ${videoId ?? "video"}`
				);
			}}
		/>
	);
}
