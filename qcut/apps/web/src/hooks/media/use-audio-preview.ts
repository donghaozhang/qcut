import { platform } from "@qcut/platform-core";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	ErrorCategory,
	ErrorSeverity,
	handleError,
} from "@/lib/debug/error-handler";
import type { SoundEffect } from "@/types/sounds";

export function useAudioPreview({
	onEnded,
}: {
	onEnded?: ({ sound }: { sound: SoundEffect }) => void;
} = {}) {
	const [playingId, setPlayingId] = useState<number | null>(null);
	const [playingSound, setPlayingSound] = useState<SoundEffect>();
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [volume, setVolumeState] = useState(0.8);
	const audioRef = useRef<HTMLAudioElement | undefined>(undefined);
	const onEndedRef = useRef(onEnded);
	onEndedRef.current = onEnded;

	const stop = useCallback(() => {
		audioRef.current?.pause();
		audioRef.current = undefined;
		setPlayingId(null);
		setPlayingSound(undefined);
		setIsPlaying(false);
		setCurrentTime(0);
		setDuration(0);
	}, []);

	useEffect(() => stop, [stop]);

	const togglePreview = useCallback(
		async ({ sound }: { sound: SoundEffect }) => {
			if (playingId === sound.id) {
				const activeAudio = audioRef.current;
				if (!activeAudio) return;
				if (activeAudio.paused) {
					try {
						await activeAudio.play();
						setIsPlaying(true);
					} catch (error) {
						stop();
						handleError(error, {
							operation: "Play audio preview",
							category: ErrorCategory.MEDIA_PROCESSING,
							severity: ErrorSeverity.LOW,
							showToast: false,
							metadata: { soundId: sound.id, soundName: sound.name },
						});
					}
					return;
				}
				activeAudio.pause();
				setIsPlaying(false);
				return;
			}
			stop();
			if (!sound.previewUrl) return;

			try {
				let audioUrl = sound.previewUrl;
				if (sound.source !== "qcut" && platform().sounds) {
					const result = await platform().sounds.downloadPreview({
						url: sound.previewUrl,
						id: sound.id,
					});
					if (result.success && result.localPath) {
						audioUrl = result.localPath;
					} else if (result.error) {
						handleError(new Error(result.error), {
							operation: "Download audio preview",
							category: ErrorCategory.NETWORK,
							severity: ErrorSeverity.LOW,
							showToast: false,
							metadata: { soundId: sound.id, soundName: sound.name },
						});
					}
				}

				const audio = new Audio(audioUrl);
				audio.volume = volume;
				audio.addEventListener("timeupdate", () => {
					setCurrentTime(audio.currentTime);
				});
				audio.addEventListener("durationchange", () => {
					setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
				});
				audio.addEventListener(
					"ended",
					() => {
						if (audioRef.current !== audio) return;
						stop();
						onEndedRef.current?.({ sound });
					},
					{ once: true }
				);
				audio.addEventListener("error", stop, { once: true });
				audioRef.current = audio;
				await audio.play();
				setPlayingId(sound.id);
				setPlayingSound(sound);
				setIsPlaying(true);
				setDuration(
					Number.isFinite(audio.duration) ? audio.duration : sound.duration
				);
			} catch (error) {
				stop();
				handleError(error, {
					operation: "Play audio preview",
					category: ErrorCategory.MEDIA_PROCESSING,
					severity: ErrorSeverity.LOW,
					showToast: false,
					metadata: { soundId: sound.id, soundName: sound.name },
				});
			}
		},
		[playingId, stop, volume]
	);

	const seek = useCallback(({ time }: { time: number }) => {
		const audio = audioRef.current;
		if (!audio) return;
		const nextTime = Math.max(0, Math.min(time, audio.duration || time));
		audio.currentTime = nextTime;
		setCurrentTime(nextTime);
	}, []);

	const setVolume = useCallback(({ value }: { value: number }) => {
		const nextVolume = Math.max(0, Math.min(1, value));
		setVolumeState(nextVolume);
		if (audioRef.current) audioRef.current.volume = nextVolume;
	}, []);

	return {
		playingId,
		playingSound,
		isPlaying,
		currentTime,
		duration,
		volume,
		togglePreview,
		seek,
		setVolume,
		stop,
	};
}
