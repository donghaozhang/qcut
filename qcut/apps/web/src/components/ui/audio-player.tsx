"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useProjectStore } from "@/stores/project-store";
import type { MediaElement } from "@/types/timeline";
import { getMediaTimelineDuration } from "@/lib/video/video-timing";
import { useMediaAudioPreview } from "@/lib/audio/use-media-audio-preview";
import { resolveAudioPreviewTiming } from "@/lib/audio/audio-preview-timing";
import { useReversedAudioUrl } from "@/lib/audio/use-reversed-audio-url";

interface AudioPlayerProps {
	src: string;
	className?: string;
	clipStartTime: number;
	trimStart: number;
	trimEnd: number;
	clipDuration: number;
	trackMuted?: boolean;
	trackId?: string;
	previewGain?: number;
	playbackWindow?: { startTime: number; endTime: number };
	element: MediaElement;
	/**
	 * Fresh timeline time from the preview panel. The playback store's
	 * currentTime freezes during playback, so a player mounted mid-playback
	 * (every clip after a cut) would otherwise judge itself out of range and
	 * stay paused.
	 */
	timelineTime?: number;
}

export function AudioPlayer({
	src,
	className = "",
	trackMuted = false,
	trackId,
	previewGain = 1,
	playbackWindow,
	element,
	timelineTime,
}: AudioPlayerProps) {
	const audioRef = useRef<HTMLAudioElement>(null);
	const { isPlaying, currentTime, speed } = usePlaybackStore();
	const effectiveTimelineTime = timelineTime ?? currentTime;
	const fps = useProjectStore((state) => state.activeProject?.fps ?? 30);
	const reversed = useReversedAudioUrl({
		source: src,
		enabled: element.reverse === true,
	});
	const effectiveSource = element.reverse ? (reversed.url ?? src) : src;
	const timelineDuration = getMediaTimelineDuration(element, fps);
	useMediaAudioPreview({
		mediaRef: audioRef,
		element,
		trackId,
		duration: timelineDuration,
		previewGain,
		trackMuted,
		forceMuted: element.reverse === true && !reversed.url,
	});

	const clipRangeStart = playbackWindow?.startTime ?? element.startTime;
	const clipEndTime =
		playbackWindow?.endTime ?? element.startTime + timelineDuration;
	const isInClipRange =
		effectiveTimelineTime >= clipRangeStart &&
		effectiveTimelineTime < clipEndTime;
	const syncAudioTiming = useCallback(
		({
			timelineTime,
			playbackSpeed,
			forcePosition,
		}: {
			timelineTime: number;
			playbackSpeed: number;
			forcePosition: boolean;
		}) => {
			const audio = audioRef.current;
			if (!audio) return;
			const timing = resolveAudioPreviewTiming({
				element,
				timelineTime,
				playbackSpeed,
				fps,
			});
			audio.preservesPitch = element.preservePitch ?? true;
			audio.playbackRate = timing.playbackRate;
			const tolerance =
				element.reverse || (element.speedKeyframes?.length ?? 0) > 0
					? 0.12
					: 0.45;
			if (
				forcePosition ||
				Math.abs(audio.currentTime - timing.mediaTime) > tolerance
			) {
				audio.currentTime = timing.mediaTime;
			}
		},
		[element, fps]
	);

	useEffect(() => {
		const audio = audioRef.current;
		if (!audio) return;

		const handleSeekEvent = (e: CustomEvent) => {
			syncAudioTiming({
				timelineTime: e.detail.time,
				playbackSpeed: usePlaybackStore.getState().speed,
				forcePosition: true,
			});
		};

		const handleUpdateEvent = (e: CustomEvent) => {
			const time = e.detail.time as number;
			syncAudioTiming({
				timelineTime: time,
				playbackSpeed: usePlaybackStore.getState().speed,
				forcePosition: false,
			});
			// Self-heal: resume an element that should be audible but sits
			// paused (mounted mid-playback, or an src reload reset it).
			if (
				audio.paused &&
				!audio.ended &&
				!trackMuted &&
				time >= clipRangeStart &&
				time < clipEndTime &&
				usePlaybackStore.getState().isPlaying
			) {
				audio.play().catch(() => {});
			}
		};

		const handleSpeed = (e: CustomEvent) => {
			syncAudioTiming({
				timelineTime: usePlaybackStore.getState().currentTime,
				playbackSpeed: e.detail.speed,
				forcePosition: false,
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
	}, [syncAudioTiming, clipRangeStart, clipEndTime, trackMuted]);

	// Force-sync position on mount and on real seeks/pauses (store time),
	// but seed with the fresh panel time so a player mounted mid-playback
	// starts at the playhead instead of the store's frozen value. Boundary
	// crossings alone must NOT force-seek a continuously playing element.
	// biome-ignore lint/correctness/useExhaustiveDependencies: effectiveTimelineTime is intentionally read without being a trigger
	useEffect(() => {
		syncAudioTiming({
			timelineTime: effectiveTimelineTime,
			playbackSpeed: speed,
			forcePosition: true,
		});
	}, [currentTime, speed, syncAudioTiming]);

	// Sync playback state
	useEffect(() => {
		const audio = audioRef.current;
		if (!audio) return;

		const tryPlay = () => {
			audio.play().catch(() => {});
		};

		if (isPlaying && isInClipRange && !trackMuted) {
			tryPlay();
		} else {
			audio.pause();
		}

		// Listen for direct play trigger to preserve user gesture context on iOS
		const handleDirectPlay = () => {
			if (isInClipRange && !trackMuted) {
				tryPlay();
			}
		};

		window.addEventListener("playback-play", handleDirectPlay);

		return () => {
			window.removeEventListener("playback-play", handleDirectPlay);
		};
	}, [isPlaying, isInClipRange, trackMuted]);

	return (
		<audio
			ref={audioRef}
			src={effectiveSource}
			className={className}
			preload="auto"
			controls={false}
			style={{ display: "none" }}
			data-audio-reverse-preview={
				element.reverse ? (reversed.url ? "ready" : "loading") : "off"
			}
			data-audio-reverse-error={reversed.error}
			onLoadedMetadata={() =>
				syncAudioTiming({
					timelineTime: effectiveTimelineTime,
					playbackSpeed: usePlaybackStore.getState().speed,
					forcePosition: true,
				})
			}
			onCanPlay={() => {
				if (isPlaying && isInClipRange && !trackMuted) {
					void audioRef.current?.play();
				}
			}}
			onContextMenu={(e) => e.preventDefault()}
		/>
	);
}
