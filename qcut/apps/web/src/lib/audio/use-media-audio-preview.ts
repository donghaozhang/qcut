import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { MediaElement } from "@/types/timeline";
import { usePlaybackStore } from "@/stores/editor/playback-store";
import { useProjectStore } from "@/stores/project-store";
import {
	selectAudioPreviewBypassed,
	useAudioPreviewStore,
} from "@/stores/editor/audio-preview-store";
import { calculateAudioPreviewState } from "./audio-preview-state";
import {
	acquireMediaAudioPreview,
	releaseMediaAudioPreview,
	resumeMediaAudioPreview,
} from "./media-audio-preview-graph";

interface AudioPreviewOptions {
	element?: MediaElement;
	duration: number;
	masterVolume: number;
	muted: boolean;
	trackMuted: boolean;
	forceMuted: boolean;
	fallbackGain: number;
	fallbackFadeIn: number;
	fallbackFadeOut: number;
	fps: number;
	bypassed: boolean;
}

export function useMediaAudioPreview({
	mediaRef,
	element,
	duration,
	trackMuted = false,
	forceMuted = false,
	fallbackGain = 1,
	fallbackFadeIn = 0,
	fallbackFadeOut = 0,
}: {
	mediaRef: RefObject<HTMLMediaElement | null>;
	element?: MediaElement;
	duration: number;
	trackMuted?: boolean;
	forceMuted?: boolean;
	fallbackGain?: number;
	fallbackFadeIn?: number;
	fallbackFadeOut?: number;
}) {
	const currentTime = usePlaybackStore((state) => state.currentTime);
	const masterVolume = usePlaybackStore((state) => state.volume);
	const muted = usePlaybackStore((state) => state.muted);
	const fps = useProjectStore((state) => state.activeProject?.fps ?? 30);
	const elementId = element?.id;
	const bypassed = useAudioPreviewStore((state) =>
		selectAudioPreviewBypassed({ state, elementId })
	);
	const graphRef = useRef<ReturnType<typeof acquireMediaAudioPreview>>(null);
	const optionsRef = useRef<AudioPreviewOptions>({
		element,
		duration,
		masterVolume,
		muted,
		trackMuted,
		forceMuted,
		fallbackGain,
		fallbackFadeIn,
		fallbackFadeOut,
		fps,
		bypassed,
	});
	optionsRef.current = {
		element,
		duration,
		masterVolume,
		muted,
		trackMuted,
		forceMuted,
		fallbackGain,
		fallbackFadeIn,
		fallbackFadeOut,
		fps,
		bypassed,
	};

	const applyAtTimeRef = useRef<(timelineTime: number) => void>(() => {});
	applyAtTimeRef.current = (timelineTime) => {
		const mediaElement = mediaRef.current;
		if (!mediaElement) return;
		const options = optionsRef.current;
		if (!options.element) {
			const localTime = Math.max(0, timelineTime);
			const fadeInGain =
				options.fallbackFadeIn > 0
					? Math.min(1, localTime / options.fallbackFadeIn)
					: 1;
			const remaining = Math.max(0, options.duration - localTime);
			const fadeOutGain =
				options.fallbackFadeOut > 0
					? Math.min(1, remaining / options.fallbackFadeOut)
					: 1;
			mediaElement.volume = Math.min(
				1,
				Math.max(
					0,
					options.masterVolume * options.fallbackGain * fadeInGain * fadeOutGain
				)
			);
			mediaElement.muted =
				options.muted || options.trackMuted || options.forceMuted;
			return;
		}
		const state = calculateAudioPreviewState({
			element: options.element,
			timelineTime,
			fps: options.fps,
			duration: options.duration,
			masterVolume: options.masterVolume,
			muted: options.muted,
			trackMuted: options.trackMuted,
			forceMuted: options.forceMuted,
			bypassed: options.bypassed,
		});
		if (!graphRef.current) {
			mediaElement.volume = Math.min(1, state.outputGain);
			mediaElement.muted = state.outputGain <= 0;
			return;
		}
		graphRef.current.update({ state });
	};

	useEffect(() => {
		const mediaElement = mediaRef.current;
		if (!mediaElement || !elementId) return;
		graphRef.current = acquireMediaAudioPreview({ mediaElement });
		return () => releaseMediaAudioPreview({ mediaElement });
	}, [elementId, mediaRef]);

	useEffect(() => {
		applyAtTimeRef.current(currentTime);
	});

	useEffect(() => {
		const handlePlaybackUpdate = (event: Event) => {
			const timelineTime = (event as CustomEvent<{ time: number }>).detail.time;
			applyAtTimeRef.current(timelineTime);
		};
		const handlePlaybackPlay = () => {
			resumeMediaAudioPreview().catch(() => {});
		};
		window.addEventListener("playback-update", handlePlaybackUpdate);
		window.addEventListener("playback-seek", handlePlaybackUpdate);
		window.addEventListener("playback-play", handlePlaybackPlay);
		return () => {
			window.removeEventListener("playback-update", handlePlaybackUpdate);
			window.removeEventListener("playback-seek", handlePlaybackUpdate);
			window.removeEventListener("playback-play", handlePlaybackPlay);
		};
	}, []);
}
