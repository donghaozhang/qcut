"use client";

import { useRef, useEffect, useCallback, useState } from "react";
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
	QCUT_VIDEO_FRAME_EVENT,
	type QcutVideoFrameEventDetail,
} from "@/lib/preview/preview-health-events";
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
	playbackWindow?: { startTime: number; endTime: number };
	trackId?: string;
	trackMuted?: boolean;
	previewGain?: number;
	sourceTimeOffset?: number;
	/**
	 * Fresh timeline time from the preview panel (boundary-crossing
	 * playbackTime / smoothTime). The playback store's currentTime freezes
	 * during playback, so a player mounted mid-playback (every clip after a
	 * cut) would otherwise judge itself out of range and pause forever.
	 */
	timelineTime?: number;
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

/** Seek-driven playback (reverse / freeze) quantises to this grid, capping
 * decoder seeks per second regardless of the display refresh rate. */
const MANUAL_SEEK_GRID_FPS = 30;

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
	playbackWindow,
	trackId,
	trackMuted = false,
	previewGain = 1,
	sourceTimeOffset = 0,
	timelineTime,
}: VideoPlayerProps) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const blobUrlRef = useRef<string | null>(null);
	const pendingCleanupRef = useRef<string | null>(null);
	const videoLoadedRef = useRef(false);
	const recoveryAttemptRef = useRef(0);
	const failedProtocolSrcRef = useRef<Set<string>>(new Set());
	const [protocolSourceEpoch, setProtocolSourceEpoch] = useState(0);
	const presentedFramesRef = useRef(0);
	const lastPresentedFrameCallbackAtRef = useRef<number | null>(null);
	const MAX_RECOVERY_ATTEMPTS = 2;
	const { isPlaying, currentTime, speed } = usePlaybackStore();
	const effectiveTimelineTime = timelineTime ?? currentTime;
	const timelineTimeRef = useRef(effectiveTimelineTime);

	useEffect(() => {
		timelineTimeRef.current = effectiveTimelineTime;
	}, [effectiveTimelineTime]);

	const timelineDuration = timingElement
		? getMediaTimelineDuration(timingElement)
		: clipDuration - trimStart - trimEnd;
	const clipRangeStart = playbackWindow?.startTime ?? clipStartTime;
	const clipEndTime =
		playbackWindow?.endTime ?? clipStartTime + timelineDuration;
	const isInClipRange =
		effectiveTimelineTime >= clipRangeStart &&
		effectiveTimelineTime < clipEndTime;
	const shouldReportPlaybackHealth = isPlaying && isInClipRange;
	useEffect(() => {
		if (!shouldReportPlaybackHealth) {
			lastPresentedFrameCallbackAtRef.current = null;
		}
	}, [shouldReportPlaybackHealth]);
	useMediaAudioPreview({
		mediaRef: videoRef,
		element: timingElement,
		trackId,
		duration: timelineDuration,
		trackMuted,
		previewGain,
		forceMuted: clipVolume <= 0,
		fallbackGain: clipVolume,
		fallbackFadeIn: fadeIn,
		fallbackFadeOut: fadeOut,
	});
	// Reverse and freeze frames cannot be expressed by a playing element, so
	// they stay seek-driven (deduped on a frame grid). Speed keyframes alone
	// let the element PLAY with a per-tick playbackRate plus a tight drift
	// corrector — far smoother than a seek per animation frame.
	const requiresManualTiming = Boolean(
		timingElement &&
			(timingElement.reverse || (timingElement.freezeFrameDuration ?? 0) > 0)
	);
	const hasKeyframedSpeed =
		!requiresManualTiming && (timingElement?.speedKeyframes?.length ?? 0) > 0;
	const getVideoTime = useCallback(
		(timelineTime: number) => {
			if (!timingElement) {
				const sourceTime = Math.max(
					trimStart,
					Math.min(
						clipDuration - trimEnd,
						timelineTime - clipStartTime + trimStart
					)
				);
				return Math.max(0, sourceTime - sourceTimeOffset);
			}
			const sourceTime = getMediaSourcePlaybackTime({
				element: timingElement,
				localTimelineTime: timelineTime - clipStartTime,
			});
			return Math.max(0, sourceTime - sourceTimeOffset);
		},
		[
			timingElement,
			trimStart,
			trimEnd,
			clipDuration,
			clipStartTime,
			sourceTimeOffset,
		]
	);
	const reportPresentedFrame = useCallback(
		({
			video,
			intervalMs,
			mediaTime,
			presentedFrames,
		}: {
			video: HTMLVideoElement;
			intervalMs: number | null;
			mediaTime: number;
			presentedFrames: number;
		}) => {
			presentedFramesRef.current = Math.max(
				presentedFramesRef.current + 1,
				presentedFrames
			);
			video.setAttribute(
				"data-qcut-presented-frames",
				String(presentedFramesRef.current)
			);
			video.setAttribute("data-qcut-presented-at", String(Date.now()));
			video.setAttribute("data-qcut-presented-media-time", String(mediaTime));
			video.setAttribute(
				"data-qcut-presented-timeline-time",
				String(timelineTimeRef.current)
			);
			const detail: QcutVideoFrameEventDetail = {
				videoId,
				isActivePlaybackFrame: shouldReportPlaybackHealth,
				intervalMs,
				mediaTime,
				presentedFrames: presentedFramesRef.current,
				timelineTime: timelineTimeRef.current,
			};
			window.dispatchEvent(new CustomEvent(QCUT_VIDEO_FRAME_EVENT, { detail }));
		},
		[shouldReportPlaybackHealth, videoId]
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
			video.preservesPitch = timingElement?.preservePitch ?? true;
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
			timelineTime: effectiveTimelineTime,
			syncPosition: !isPlaying || requiresManualTiming,
		});
	}, [
		effectiveTimelineTime,
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
			timelineTimeRef.current = timelineTime;
			lastPresentedFrameCallbackAtRef.current = null;
			const videoTime = getVideoTime(timelineTime);
			video.currentTime = videoTime;
		};

		const handleUpdateEvent = (e: CustomEvent) => {
			// Always update video time, even if outside clip range
			const timelineTime = e.detail.time;
			timelineTimeRef.current = timelineTime;
			const targetTime = getVideoTime(timelineTime);

			if (requiresManualTiming) {
				// Quantise seek-driven playback to a frame grid: a freeze holds
				// with zero further seeks and reverse seeks at most once per
				// grid step instead of every animation frame. Comparing against
				// the element's actual position (not a remembered target) keeps
				// this self-correcting after out-of-band writes like a source
				// reload or a mount sync.
				const quantized =
					Math.round(targetTime * MANUAL_SEEK_GRID_FPS) / MANUAL_SEEK_GRID_FPS;
				if (
					Math.abs(video.currentTime - quantized) >
					0.5 / MANUAL_SEEK_GRID_FPS
				) {
					video.currentTime = quantized;
				}
				return;
			}

			if (hasKeyframedSpeed) {
				const rate = getVideoPlaybackRate({
					timingElement,
					clipPlaybackRate,
					clipStartTime,
					timelineTime,
					playbackSpeed: usePlaybackStore.getState().speed,
				});
				if (Math.abs(video.playbackRate - rate) > 0.001) {
					video.playbackRate = rate;
				}
			}

			// Rate discretisation drifts faster on speed ramps, so correct them
			// on a tighter leash than plain playback.
			const driftLimit = hasKeyframedSpeed ? 0.15 : 0.5;
			if (Math.abs(video.currentTime - targetTime) > driftLimit) {
				video.currentTime = targetTime;
			}

			// Self-heal: a proxy-chunk reload or a rejected play() leaves the
			// element paused while the master clock keeps running; without this
			// the drift corrector above degrades playback into a 2fps slideshow.
			// Never resume an ended element — play() would restart it from 0.
			if (
				video.paused &&
				!video.ended &&
				video.readyState >= 2 &&
				usePlaybackStore.getState().isPlaying
			) {
				video.play().catch((cause) => {
					console.warn(
						`[VideoPlayer] resume play() failed for ${videoId ?? "video"}:`,
						cause
					);
				});
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
	}, [
		isInClipRange,
		requiresManualTiming,
		hasKeyframedSpeed,
		clipPlaybackRate,
		clipStartTime,
		timingElement,
		getVideoTime,
		syncVideoTiming,
		videoId,
	]);

	// Sync playback state with readyState check
	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;

		const handlePlayError = (cause: unknown) => {
			console.warn(
				`[VideoPlayer] play() failed for ${videoId ?? "video"}:`,
				cause
			);
		};

		const handleCanPlay = () => {
			if (usePlaybackStore.getState().isPlaying) {
				video.play().catch(handlePlayError);
			}
		};
		const tryPlay = () => {
			if (video.readyState >= 3) {
				video.play().catch(handlePlayError);
			} else {
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
			// Drop any pending canplay trigger so a later manual-timing or
			// out-of-range state cannot be started by a stale listener.
			video.removeEventListener("canplay", handleCanPlay);
		};
	}, [isPlaying, isInClipRange, requiresManualTiming, videoId]);

	// Sync global playback speed with clip-local timing.
	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;
		syncVideoTiming({ video, timelineTime: effectiveTimelineTime });
	}, [effectiveTimelineTime, syncVideoTiming]);

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
		presentedFramesRef.current = 0;
		lastPresentedFrameCallbackAtRef.current = null;
		video.setAttribute("data-qcut-presented-frames", "0");
		video.removeAttribute("data-qcut-presented-at");

		if (videoSource.type === "file") {
			// Prefer the disk-streaming protocol source: the element then reads
			// via Range requests instead of the in-memory File blob. Errors mark
			// the URL failed and re-run this effect onto the blob path.
			const protocolSrc = videoSource.protocolSrc;
			if (protocolSrc && !failedProtocolSrcRef.current.has(protocolSrc)) {
				video.src = protocolSrc;
				if (pendingCleanupRef.current) {
					releaseObjectURL(
						pendingCleanupRef.current,
						"VideoPlayer-protocol-switch"
					);
					pendingCleanupRef.current = null;
				}
				blobUrlRef.current = null;
				return () => {
					if (video) video.src = "";
				};
			}

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
	}, [videoSource, videoId, protocolSourceEpoch]);

	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;

		let callbackId: number | null = null;
		const trackPresentedFrame: VideoFrameRequestCallback = (
			timestamp,
			metadata
		) => {
			const previousTimestamp = lastPresentedFrameCallbackAtRef.current;
			lastPresentedFrameCallbackAtRef.current = shouldReportPlaybackHealth
				? timestamp
				: null;
			const intervalMs =
				shouldReportPlaybackHealth && typeof previousTimestamp === "number"
					? Math.max(0, timestamp - previousTimestamp)
					: null;
			reportPresentedFrame({
				video,
				intervalMs,
				mediaTime: metadata.mediaTime,
				presentedFrames: metadata.presentedFrames,
			});
			callbackId = video.requestVideoFrameCallback(trackPresentedFrame);
		};

		if (typeof video.requestVideoFrameCallback === "function") {
			callbackId = video.requestVideoFrameCallback(trackPresentedFrame);
		}

		return () => {
			if (
				callbackId !== null &&
				typeof video.cancelVideoFrameCallback === "function"
			) {
				video.cancelVideoFrameCallback(callbackId);
			}
		};
	}, [reportPresentedFrame, shouldReportPlaybackHealth]);

	// Separate cleanup effect for component unmount only
	useEffect(() => {
		return () => {
			const video = videoRef.current;
			if (video) {
				video.pause();
				video.removeAttribute("src");
				video.load();
			}
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
			data-qcut-presented-frames="0"
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
			onLoadedData={(event) => {
				const video = event.currentTarget;
				if (typeof video.requestVideoFrameCallback === "function") return;
				reportPresentedFrame({
					video,
					intervalMs: null,
					mediaTime: video.currentTime,
					presentedFrames: 1,
				});
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

				// A failed local-media protocol source (e.g. the extracted temp
				// file was cleaned up) falls back to the in-memory blob path.
				if (
					videoSource?.type === "file" &&
					videoSource.protocolSrc &&
					video.currentSrc?.startsWith("app://local-media/") &&
					!failedProtocolSrcRef.current.has(videoSource.protocolSrc)
				) {
					console.warn(
						`[VideoPlayer] Local-media stream failed for ${videoId ?? "video"}; falling back to blob URL`
					);
					failedProtocolSrcRef.current.add(videoSource.protocolSrc);
					setProtocolSourceEpoch((epoch) => epoch + 1);
					return;
				}

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
