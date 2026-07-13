import { platform } from "@qcut/platform-core";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	ErrorCategory,
	ErrorSeverity,
	handleError,
} from "@/lib/debug/error-handler";
import type { SoundEffect } from "@/types/sounds";

export function useAudioPreview() {
	const [playingId, setPlayingId] = useState<number | null>(null);
	const audioRef = useRef<HTMLAudioElement | undefined>(undefined);

	const stop = useCallback(() => {
		audioRef.current?.pause();
		audioRef.current = undefined;
		setPlayingId(null);
	}, []);

	useEffect(() => stop, [stop]);

	const togglePreview = useCallback(
		async ({ sound }: { sound: SoundEffect }) => {
			if (playingId === sound.id) {
				stop();
				return;
			}
			stop();
			if (!sound.previewUrl) return;

			try {
				let audioUrl = sound.previewUrl;
				if (platform().sounds) {
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
				audio.addEventListener("ended", stop, { once: true });
				audio.addEventListener("error", stop, { once: true });
				audioRef.current = audio;
				await audio.play();
				setPlayingId(sound.id);
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
		[playingId, stop]
	);

	return { playingId, togglePreview, stop };
}
