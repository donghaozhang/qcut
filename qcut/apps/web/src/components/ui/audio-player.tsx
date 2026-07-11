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
	element: MediaElement;
}

export function AudioPlayer({
	src,
	className = "",
	trackMuted = false,
	element,
}: AudioPlayerProps) {
	const audioRef = useRef<HTMLAudioElement>(null);
	const { isPlaying, currentTime, speed } = usePlaybackStore();
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
		duration: timelineDuration,
		trackMuted,
		forceMuted: element.reverse === true && !reversed.url,
	});

	const clipEndTime = element.startTime + timelineDuration;
	const isInClipRange =
		currentTime >= element.startTime && currentTime < clipEndTime;
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
			syncAudioTiming({
				timelineTime: e.detail.time,
				playbackSpeed: usePlaybackStore.getState().speed,
				forcePosition: false,
			});
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
	}, [syncAudioTiming]);

	useEffect(() => {
		syncAudioTiming({
			timelineTime: currentTime,
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
					timelineTime: usePlaybackStore.getState().currentTime,
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
