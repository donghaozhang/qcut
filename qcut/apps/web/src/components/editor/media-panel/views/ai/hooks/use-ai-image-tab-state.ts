/**
 * Image Tab State Hook
 *
 * Manages all state related to the Image-to-Video tab including:
 * - Frame uploads (first frame, last frame, end frame)
 * - Vidu Q2 settings
 * - LTX Video I2V settings
 * - Seedance settings
 * - Kling v2.5/v2.6 settings
 * - WAN 2.5 settings
 *
 * @see ai-tsx-refactoring.md - Subtask 2.2
 */

import { useState, useEffect, useCallback } from "react";
import { useFileWithPreview } from "./use-ai-tab-state-base";
import { LTXV2_FAST_CONFIG, LTX23_CONFIG } from "../constants/ai-constants";
import type {
	LTXV2FastDuration,
	LTXV2FastResolution,
	LTXV2FastFps,
	SeedanceDuration,
	SeedanceResolution,
	SeedanceAspectRatio,
	KlingAspectRatio,
	Kling26AspectRatio,
	Wan25Resolution,
	Wan25Duration,
} from "../constants/ai-model-options";
import type {
	LTX23Duration,
	LTX23Resolution,
	LTX23FPS,
} from "../components/ai-ltx23-settings";

// ============================================
// Types
// ============================================

export interface ViduQ2Settings {
	duration: 2 | 3 | 4 | 5 | 6 | 7 | 8;
	resolution: "720p" | "1080p";
	movementAmplitude: "auto" | "small" | "medium" | "large";
	enableBGM: boolean;
}

export interface LTXV2I2VSettings {
	duration: 6 | 8 | 10;
	resolution: "1080p" | "1440p" | "2160p";
	fps: 25 | 50;
	generateAudio: boolean;
}

export interface LTXV2ImageSettings {
	duration: LTXV2FastDuration;
	resolution: LTXV2FastResolution;
	fps: LTXV2FastFps;
	generateAudio: boolean;
}

export interface LTX23I2VSettings {
	duration: LTX23Duration;
	resolution: LTX23Resolution;
	fps: LTX23FPS;
	generateAudio: boolean;
	aspectRatio: string;
	endImageFile: File | null;
	endImagePreview: string | null;
}

export interface SeedanceSettings {
	duration: SeedanceDuration;
	resolution: SeedanceResolution;
	aspectRatio: SeedanceAspectRatio;
	cameraFixed: boolean;
	endFrameUrl: string | undefined;
	endFrameFile: File | null;
	endFramePreview: string | null;
}

export interface KlingSettings {
	duration: 5 | 10;
	cfgScale: number;
	aspectRatio: KlingAspectRatio;
	enhancePrompt: boolean;
	negativePrompt: string;
}

export interface Kling26Settings {
	duration: 5 | 10;
	cfgScale: number;
	aspectRatio: Kling26AspectRatio;
	generateAudio: boolean;
	negativePrompt: string;
}

export interface Wan25Settings {
	duration: Wan25Duration;
	resolution: Wan25Resolution;
	audioUrl: string | undefined;
	audioFile: File | null;
	audioPreview: string | null;
	negativePrompt: string;
	enablePromptExpansion: boolean;
}

export interface ImageTabState {
	// Frame uploads
	firstFrame: File | null;
	firstFramePreview: string | null;
	lastFrame: File | null;
	lastFramePreview: string | null;
	imageTabSourceVideo: File | null;

	// Model-specific settings
	viduQ2: ViduQ2Settings;
	ltxv2I2V: LTXV2I2VSettings;
	ltxv2Image: LTXV2ImageSettings;
	ltx23I2V: LTX23I2VSettings;
	seedance: SeedanceSettings;
	kling: KlingSettings;
	kling26: Kling26Settings;
	wan25: Wan25Settings;

	// Advanced
	imageSeed: number | undefined;
}

export interface ImageTabSetters {
	// Frame uploads
	setFirstFrame: (file: File | null) => void;
	setLastFrame: (file: File | null) => void;
	setImageTabSourceVideo: (file: File | null) => void;

	// Vidu Q2
	setViduQ2Duration: (value: 2 | 3 | 4 | 5 | 6 | 7 | 8) => void;
	setViduQ2Resolution: (value: "720p" | "1080p") => void;
	setViduQ2MovementAmplitude: (
		value: "auto" | "small" | "medium" | "large"
	) => void;
	setViduQ2EnableBGM: (value: boolean) => void;

	// LTX I2V
	setLTXV2I2VDuration: (value: 6 | 8 | 10) => void;
	setLTXV2I2VResolution: (value: "1080p" | "1440p" | "2160p") => void;
	setLTXV2I2VFPS: (value: 25 | 50) => void;
	setLTXV2I2VGenerateAudio: (value: boolean) => void;

	// LTX Image
	setLTXV2ImageDuration: (value: LTXV2FastDuration) => void;
	setLTXV2ImageResolution: (value: LTXV2FastResolution) => void;
	setLTXV2ImageFPS: (value: LTXV2FastFps) => void;
	setLTXV2ImageGenerateAudio: (value: boolean) => void;

	// LTX 2.3 I2V
	setLTX23I2VDuration: (value: LTX23Duration) => void;
	setLTX23I2VResolution: (value: LTX23Resolution) => void;
	setLTX23I2VFPS: (value: LTX23FPS) => void;
	setLTX23I2VGenerateAudio: (value: boolean) => void;
	setLTX23I2VAspectRatio: (value: string) => void;
	setLTX23I2VEndImageFile: (file: File | null) => void;

	// Seedance
	setSeedanceDuration: (value: SeedanceDuration) => void;
	setSeedanceResolution: (value: SeedanceResolution) => void;
	setSeedanceAspectRatio: (value: SeedanceAspectRatio) => void;
	setSeedanceCameraFixed: (value: boolean) => void;
	setSeedanceEndFrameUrl: (value: string | undefined) => void;
	setSeedanceEndFrameFile: (file: File | null) => void;

	// Kling v2.5
	setKlingDuration: (value: 5 | 10) => void;
	setKlingCfgScale: (value: number) => void;
	setKlingAspectRatio: (value: KlingAspectRatio) => void;
	setKlingEnhancePrompt: (value: boolean) => void;
	setKlingNegativePrompt: (value: string) => void;

	// Kling v2.6
	setKling26Duration: (value: 5 | 10) => void;
	setKling26CfgScale: (value: number) => void;
	setKling26AspectRatio: (value: Kling26AspectRatio) => void;
	setKling26GenerateAudio: (value: boolean) => void;
	setKling26NegativePrompt: (value: string) => void;

	// WAN 2.5
	setWan25Duration: (value: Wan25Duration) => void;
	setWan25Resolution: (value: Wan25Resolution) => void;
	setWan25AudioUrl: (value: string | undefined) => void;
	setWan25AudioFile: (file: File | null) => void;
	setWan25NegativePrompt: (value: string) => void;
	setWan25EnablePromptExpansion: (value: boolean) => void;

	// Advanced
	setImageSeed: (value: number | undefined) => void;
}

export interface ImageTabHelpers {
	/** Reset first frame upload */
	resetFirstFrame: () => void;
	/** Reset last frame upload */
	resetLastFrame: () => void;
	/** Reset all frame uploads */
	resetAllFrames: () => void;
	/** Cleaned seedance end frame URL (trimmed) */
	cleanedSeedanceEndFrameUrl: string | undefined;
	/** Cleaned kling negative prompt (trimmed) */
	cleanedKlingNegativePrompt: string | undefined;
	/** Cleaned wan25 audio URL (trimmed) */
	cleanedWan25AudioUrl: string | undefined;
	/** Cleaned wan25 negative prompt (trimmed) */
	cleanedWan25NegativePrompt: string | undefined;
	/** Whether extended LTX Image duration is active */
	isExtendedLTXV2ImageDuration: boolean;
}

export interface UseImageTabStateResult {
	state: ImageTabState;
	setters: ImageTabSetters;
	helpers: ImageTabHelpers;
}

// ============================================
// Hook
// ============================================

export interface UseImageTabStateOptions {
	/** Selected models (for reset effects) */
	selectedModels: string[];
}

/**
 * Hook for managing Image tab state.
 *
 * @example
 * ```tsx
 * const { state, setters, helpers } = useImageTabState({ selectedModels });
 *
 * // Use frame uploads
 * <FileUpload value={state.firstFrame} onChange={setters.setFirstFrame} />
 *
 * // Use model settings
 * <DurationSelect value={state.viduQ2.duration} onChange={setters.setViduQ2Duration} />
 * ```
 */
export function useImageTabState({
	selectedModels,
}: UseImageTabStateOptions): UseImageTabStateResult {
	// Frame uploads using reusable hooks
	const firstFrameState = useFileWithPreview();
	const lastFrameState = useFileWithPreview();
	const [imageTabSourceVideo, setImageTabSourceVideo] = useState<File | null>(
		null
	);

	// Vidu Q2 settings
	const [viduQ2Duration, setViduQ2Duration] = useState<
		2 | 3 | 4 | 5 | 6 | 7 | 8
	>(4);
	const [viduQ2Resolution, setViduQ2Resolution] = useState<"720p" | "1080p">(
		"720p"
	);
	const [viduQ2MovementAmplitude, setViduQ2MovementAmplitude] = useState<
		"auto" | "small" | "medium" | "large"
	>("auto");
	const [viduQ2EnableBGM, setViduQ2EnableBGM] = useState(false);

	// LTX I2V settings
	const [ltxv2I2VDuration, setLTXV2I2VDuration] = useState<6 | 8 | 10>(6);
	const [ltxv2I2VResolution, setLTXV2I2VResolution] = useState<
		"1080p" | "1440p" | "2160p"
	>("1080p");
	const [ltxv2I2VFPS, setLTXV2I2VFPS] = useState<25 | 50>(25);
	const [ltxv2I2VGenerateAudio, setLTXV2I2VGenerateAudio] = useState(true);

	// LTX Image settings
	const [ltxv2ImageDuration, setLTXV2ImageDuration] =
		useState<LTXV2FastDuration>(LTXV2_FAST_CONFIG.DURATIONS[0]);
	const [ltxv2ImageResolution, setLTXV2ImageResolution] =
		useState<LTXV2FastResolution>(LTXV2_FAST_CONFIG.RESOLUTIONS.STANDARD[0]);
	const [ltxv2ImageFPS, setLTXV2ImageFPS] = useState<LTXV2FastFps>(
		LTXV2_FAST_CONFIG.FPS_OPTIONS.STANDARD[0]
	);
	const [ltxv2ImageGenerateAudio, setLTXV2ImageGenerateAudio] = useState(true);

	// LTX 2.3 I2V settings
	const [ltx23I2VDuration, setLTX23I2VDuration] = useState<LTX23Duration>(
		LTX23_CONFIG.FAST_DURATIONS[0],
	);
	const [ltx23I2VResolution, setLTX23I2VResolution] =
		useState<LTX23Resolution>("1080p");
	const [ltx23I2VFPS, setLTX23I2VFPS] = useState<LTX23FPS>(25);
	const [ltx23I2VGenerateAudio, setLTX23I2VGenerateAudio] = useState(true);
	const [ltx23I2VAspectRatio, setLTX23I2VAspectRatio] = useState("auto");
	const ltx23I2VEndImageState = useFileWithPreview();

	// Seedance settings
	const [seedanceDuration, setSeedanceDuration] = useState<SeedanceDuration>(5);
	const [seedanceResolution, setSeedanceResolution] =
		useState<SeedanceResolution>("1080p");
	const [seedanceAspectRatio, setSeedanceAspectRatio] =
		useState<SeedanceAspectRatio>("16:9");
	const [seedanceCameraFixed, setSeedanceCameraFixed] = useState(false);
	const [seedanceEndFrameUrl, setSeedanceEndFrameUrl] = useState<
		string | undefined
	>(undefined);
	const seedanceEndFrameState = useFileWithPreview();

	// Kling v2.5 settings
	const [klingDuration, setKlingDuration] = useState<5 | 10>(5);
	const [klingCfgScale, setKlingCfgScale] = useState(0.5);
	const [klingAspectRatio, setKlingAspectRatio] =
		useState<KlingAspectRatio>("16:9");
	const [klingEnhancePrompt, setKlingEnhancePrompt] = useState(true);
	const [klingNegativePrompt, setKlingNegativePrompt] = useState("");

	// Kling v2.6 settings
	const [kling26Duration, setKling26Duration] = useState<5 | 10>(5);
	const [kling26CfgScale, setKling26CfgScale] = useState(0.5);
	const [kling26AspectRatio, setKling26AspectRatio] =
		useState<Kling26AspectRatio>("16:9");
	const [kling26GenerateAudio, setKling26GenerateAudio] = useState(true);
	const [kling26NegativePrompt, setKling26NegativePrompt] = useState("");

	// WAN 2.5 settings
	const [wan25Duration, setWan25Duration] = useState<Wan25Duration>(5);
	const [wan25Resolution, setWan25Resolution] =
		useState<Wan25Resolution>("1080p");
	const [wan25AudioUrl, setWan25AudioUrl] = useState<string | undefined>(
		undefined
	);
	const wan25AudioState = useFileWithPreview();
	const [wan25NegativePrompt, setWan25NegativePrompt] = useState("");
	const [wan25EnablePromptExpansion, setWan25EnablePromptExpansion] =
		useState(true);

	// Advanced
	const [imageSeed, setImageSeed] = useState<number | undefined>(undefined);

	// Model selection helpers
	const viduQ2Selected = selectedModels.includes("vidu_q2_turbo_i2v");
	const ltxv2I2VSelected = selectedModels.includes("ltxv2_i2v");
	const ltxv2ImageSelected = selectedModels.includes("ltxv2_fast_i2v");
	const ltx23I2VSelected = selectedModels.includes("ltx23_fast_i2v");
	const seedanceFastSelected = selectedModels.includes("seedance_pro_fast_i2v");
	const seedanceProSelected = selectedModels.includes("seedance_pro_i2v");
	const seedanceSelected = seedanceFastSelected || seedanceProSelected;
	const klingI2VSelected = selectedModels.includes("kling_v2_5_turbo_i2v");
	const wan25Selected = selectedModels.includes("wan_25_preview_i2v");

	// Reset Vidu Q2 settings when model is deselected
	useEffect(() => {
		if (!viduQ2Selected) {
			setViduQ2Duration(4);
			setViduQ2Resolution("720p");
			setViduQ2MovementAmplitude("auto");
			setViduQ2EnableBGM(false);
		}
	}, [viduQ2Selected]);

	// Disable BGM when duration != 4
	useEffect(() => {
		if (viduQ2Duration !== 4 && viduQ2EnableBGM) {
			setViduQ2EnableBGM(false);
		}
	}, [viduQ2Duration, viduQ2EnableBGM]);

	// Reset LTX I2V settings when model is deselected
	useEffect(() => {
		if (!ltxv2I2VSelected) {
			setLTXV2I2VDuration(6);
			setLTXV2I2VResolution("1080p");
			setLTXV2I2VFPS(25);
			setLTXV2I2VGenerateAudio(true);
		}
	}, [ltxv2I2VSelected]);

	// Reset LTX Image settings when model is deselected
	useEffect(() => {
		if (!ltxv2ImageSelected) {
			setLTXV2ImageDuration(LTXV2_FAST_CONFIG.DURATIONS[0]);
			setLTXV2ImageResolution(LTXV2_FAST_CONFIG.RESOLUTIONS.STANDARD[0]);
			setLTXV2ImageFPS(LTXV2_FAST_CONFIG.FPS_OPTIONS.STANDARD[0]);
			setLTXV2ImageGenerateAudio(true);
		}
	}, [ltxv2ImageSelected]);

	// Auto-correct resolution/FPS when LTX Fast duration crosses extended threshold
	// Videos > 10s only support 1080p resolution and 25 FPS
	useEffect(() => {
		const isExtended =
			ltxv2ImageDuration > LTXV2_FAST_CONFIG.EXTENDED_DURATION_THRESHOLD;
		if (isExtended) {
			// Coerce resolution to 1080p if currently set to a higher resolution
			const validExtendedResolutions = LTXV2_FAST_CONFIG.RESOLUTIONS.EXTENDED;
			if (
				!validExtendedResolutions.includes(
					ltxv2ImageResolution as (typeof validExtendedResolutions)[number]
				)
			) {
				setLTXV2ImageResolution(validExtendedResolutions[0]);
			}
			// Coerce FPS to 25 if currently set to 50
			const validExtendedFps = LTXV2_FAST_CONFIG.FPS_OPTIONS.EXTENDED;
			if (
				!validExtendedFps.includes(
					ltxv2ImageFPS as (typeof validExtendedFps)[number]
				)
			) {
				setLTXV2ImageFPS(validExtendedFps[0]);
			}
		}
	}, [ltxv2ImageDuration, ltxv2ImageResolution, ltxv2ImageFPS]);

	// Reset LTX 2.3 I2V settings when model is deselected
	useEffect(() => {
		if (!ltx23I2VSelected) {
			setLTX23I2VDuration(LTX23_CONFIG.FAST_DURATIONS[0]);
			setLTX23I2VResolution("1080p");
			setLTX23I2VFPS(25);
			setLTX23I2VGenerateAudio(true);
			setLTX23I2VAspectRatio("auto");
			ltx23I2VEndImageState.reset();
		}
	}, [ltx23I2VSelected, ltx23I2VEndImageState.reset]);

	// Auto-correct LTX 2.3 I2V resolution/FPS for extended durations
	useEffect(() => {
		if (ltx23I2VDuration > LTX23_CONFIG.EXTENDED_DURATION_THRESHOLD) {
			const validRes = LTX23_CONFIG.RESOLUTIONS.EXTENDED;
			if (
				!validRes.includes(
					ltx23I2VResolution as (typeof validRes)[number],
				)
			) {
				setLTX23I2VResolution(validRes[0]);
			}
			const validFps = LTX23_CONFIG.FPS_OPTIONS.EXTENDED;
			if (
				!validFps.includes(ltx23I2VFPS as (typeof validFps)[number])
			) {
				setLTX23I2VFPS(validFps[0]);
			}
		}
	}, [ltx23I2VDuration, ltx23I2VResolution, ltx23I2VFPS]);

	// Reset Seedance settings when model is deselected
	useEffect(() => {
		if (!seedanceSelected) {
			setSeedanceDuration(5);
			setSeedanceResolution("1080p");
			setSeedanceAspectRatio("16:9");
			setSeedanceCameraFixed(false);
			seedanceEndFrameState.reset();
			setSeedanceEndFrameUrl(undefined);
		}
	}, [seedanceSelected, seedanceEndFrameState.reset]);

	// Reset Kling settings when model is deselected
	useEffect(() => {
		if (!klingI2VSelected) {
			setKlingDuration(5);
			setKlingCfgScale(0.5);
			setKlingAspectRatio("16:9");
			setKlingEnhancePrompt(true);
			setKlingNegativePrompt("");
		}
	}, [klingI2VSelected]);

	// Reset WAN 2.5 settings when model is deselected
	useEffect(() => {
		if (!wan25Selected) {
			setWan25Duration(5);
			setWan25Resolution("1080p");
			setWan25AudioUrl(undefined);
			wan25AudioState.reset();
			setWan25NegativePrompt("");
			setWan25EnablePromptExpansion(true);
		}
	}, [wan25Selected, wan25AudioState.reset]);

	// Reset all frames
	const resetAllFrames = useCallback(() => {
		firstFrameState.reset();
		lastFrameState.reset();
		setImageTabSourceVideo(null);
	}, [firstFrameState, lastFrameState]);

	// Cleaned values
	const cleanedSeedanceEndFrameUrl = seedanceEndFrameUrl?.trim()
		? seedanceEndFrameUrl.trim()
		: undefined;
	const cleanedKlingNegativePrompt = klingNegativePrompt.trim()
		? klingNegativePrompt.trim()
		: undefined;
	const cleanedWan25AudioUrl = wan25AudioUrl?.trim()
		? wan25AudioUrl.trim()
		: undefined;
	const cleanedWan25NegativePrompt = wan25NegativePrompt.trim()
		? wan25NegativePrompt.trim()
		: undefined;

	// Check extended duration
	const isExtendedLTXV2ImageDuration =
		ltxv2ImageDuration > LTXV2_FAST_CONFIG.EXTENDED_DURATION_THRESHOLD;

	return {
		state: {
			firstFrame: firstFrameState.file,
			firstFramePreview: firstFrameState.preview,
			lastFrame: lastFrameState.file,
			lastFramePreview: lastFrameState.preview,
			imageTabSourceVideo,
			viduQ2: {
				duration: viduQ2Duration,
				resolution: viduQ2Resolution,
				movementAmplitude: viduQ2MovementAmplitude,
				enableBGM: viduQ2EnableBGM,
			},
			ltxv2I2V: {
				duration: ltxv2I2VDuration,
				resolution: ltxv2I2VResolution,
				fps: ltxv2I2VFPS,
				generateAudio: ltxv2I2VGenerateAudio,
			},
			ltxv2Image: {
				duration: ltxv2ImageDuration,
				resolution: ltxv2ImageResolution,
				fps: ltxv2ImageFPS,
				generateAudio: ltxv2ImageGenerateAudio,
			},
			ltx23I2V: {
				duration: ltx23I2VDuration,
				resolution: ltx23I2VResolution,
				fps: ltx23I2VFPS,
				generateAudio: ltx23I2VGenerateAudio,
				aspectRatio: ltx23I2VAspectRatio,
				endImageFile: ltx23I2VEndImageState.file,
				endImagePreview: ltx23I2VEndImageState.preview,
			},
			seedance: {
				duration: seedanceDuration,
				resolution: seedanceResolution,
				aspectRatio: seedanceAspectRatio,
				cameraFixed: seedanceCameraFixed,
				endFrameUrl: seedanceEndFrameUrl,
				endFrameFile: seedanceEndFrameState.file,
				endFramePreview: seedanceEndFrameState.preview,
			},
			kling: {
				duration: klingDuration,
				cfgScale: klingCfgScale,
				aspectRatio: klingAspectRatio,
				enhancePrompt: klingEnhancePrompt,
				negativePrompt: klingNegativePrompt,
			},
			kling26: {
				duration: kling26Duration,
				cfgScale: kling26CfgScale,
				aspectRatio: kling26AspectRatio,
				generateAudio: kling26GenerateAudio,
				negativePrompt: kling26NegativePrompt,
			},
			wan25: {
				duration: wan25Duration,
				resolution: wan25Resolution,
				audioUrl: wan25AudioUrl,
				audioFile: wan25AudioState.file,
				audioPreview: wan25AudioState.preview,
				negativePrompt: wan25NegativePrompt,
				enablePromptExpansion: wan25EnablePromptExpansion,
			},
			imageSeed,
		},
		setters: {
			setFirstFrame: firstFrameState.setFile,
			setLastFrame: lastFrameState.setFile,
			setImageTabSourceVideo,
			setViduQ2Duration,
			setViduQ2Resolution,
			setViduQ2MovementAmplitude,
			setViduQ2EnableBGM,
			setLTXV2I2VDuration,
			setLTXV2I2VResolution,
			setLTXV2I2VFPS,
			setLTXV2I2VGenerateAudio,
			setLTXV2ImageDuration,
			setLTXV2ImageResolution,
			setLTXV2ImageFPS,
			setLTXV2ImageGenerateAudio,
			setLTX23I2VDuration,
			setLTX23I2VResolution,
			setLTX23I2VFPS,
			setLTX23I2VGenerateAudio,
			setLTX23I2VAspectRatio,
			setLTX23I2VEndImageFile: ltx23I2VEndImageState.setFile,
			setSeedanceDuration,
			setSeedanceResolution,
			setSeedanceAspectRatio,
			setSeedanceCameraFixed,
			setSeedanceEndFrameUrl,
			setSeedanceEndFrameFile: seedanceEndFrameState.setFile,
			setKlingDuration,
			setKlingCfgScale,
			setKlingAspectRatio,
			setKlingEnhancePrompt,
			setKlingNegativePrompt,
			setKling26Duration,
			setKling26CfgScale,
			setKling26AspectRatio,
			setKling26GenerateAudio,
			setKling26NegativePrompt,
			setWan25Duration,
			setWan25Resolution,
			setWan25AudioUrl,
			setWan25AudioFile: wan25AudioState.setFile,
			setWan25NegativePrompt,
			setWan25EnablePromptExpansion,
			setImageSeed,
		},
		helpers: {
			resetFirstFrame: firstFrameState.reset,
			resetLastFrame: lastFrameState.reset,
			resetAllFrames,
			cleanedSeedanceEndFrameUrl,
			cleanedKlingNegativePrompt,
			cleanedWan25AudioUrl,
			cleanedWan25NegativePrompt,
			isExtendedLTXV2ImageDuration,
		},
	};
}
