import { usePlaybackStore } from "@/stores/editor/playback-store";

export function resetPlaybackStore(): void {
	const store = usePlaybackStore.getState();
	if (typeof store.pause === "function") {
		store.pause();
	}
	usePlaybackStore.setState({
		isPlaying: false,
		currentTime: 0,
		previewScrubTime: null,
		duration: 0,
		speed: 1,
		volume: 1,
		muted: false,
		previousVolume: 1,
	});
}
