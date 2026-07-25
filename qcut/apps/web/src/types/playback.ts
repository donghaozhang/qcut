export type PreviewQualityPreset =
	| "auto"
	| "original"
	| "clear"
	| "smooth"
	| "low";

export type PreviewQualityDowngradeReason =
	| "main-thread"
	| "video-frame"
	| "combined";

export interface PreviewQualityDiagnostic {
	reason: PreviewQualityDowngradeReason;
	averageMainThreadFrameIntervalMs: number;
	mainThreadStutterCount: number;
	averagePresentedFrameIntervalMs: number;
	presentedFrameStallCount: number;
}

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
	runtimePreviewQualityDiagnostic: PreviewQualityDiagnostic | null;
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
	setRuntimePreviewQuality: ({
		quality,
		diagnostic,
	}: {
		quality: PreviewQualityPreset | null;
		diagnostic?: PreviewQualityDiagnostic | null;
	}) => void;
}
