export type PreviewQualityPreset =
	| "auto"
	| "original"
	| "clear"
	| "smooth"
	| "low";

export interface PlaybackState {
	isPlaying: boolean;
	currentTime: number;
	duration: number;
	volume: number;
	speed: number;
	muted: boolean;
	previousVolume?: number;
	previewQuality: PreviewQualityPreset;
	runtimePreviewQuality: PreviewQualityPreset | null;
}

export interface PlaybackControls {
	play: () => void;
	pause: () => void;
	seek: (time: number) => void;
	setVolume: (volume: number) => void;
	setSpeed: (speed: number) => void;
	toggle: () => void;
	mute: () => void;
	unmute: () => void;
	toggleMute: () => void;
	setPreviewQuality: (quality: PreviewQualityPreset) => void;
	setRuntimePreviewQuality: (quality: PreviewQualityPreset | null) => void;
}
