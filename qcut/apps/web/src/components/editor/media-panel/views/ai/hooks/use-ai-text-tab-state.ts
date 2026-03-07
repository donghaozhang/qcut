/**
 * Text Tab State Hook
 *
 * Manages all state related to the Text-to-Video tab including:
 * - Common T2V settings (aspect ratio, resolution, duration)
 * - Hailuo-specific settings
 * - LTX Video Pro/Fast settings
 *
 * @see ai-tsx-refactoring.md - Subtask 2.3
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { LTXV2_FAST_CONFIG, LTX23_CONFIG } from "../constants/ai-constants";
import type {
	LTXV2FastDuration,
	LTXV2FastResolution,
	LTXV2FastFps,
} from "../constants/ai-model-options";
import type {
	LTX23Duration,
	LTX23Resolution,
	LTX23FPS,
} from "../components/ai-ltx23-settings";

// ============================================
// Types
// ============================================

/** Default values for T2V settings */
export const T2V_DEFAULTS = {
	aspectRatio: "16:9",
	resolution: "1080p",
	duration: 4,
	negativePrompt: "low resolution, error, worst quality, low quality, defects",
	promptExpansion: false,
	seed: -1, // -1 = random
	safetyChecker: false,
} as const;

export interface TextTabState {
	// Unified T2V settings
	t2vAspectRatio: string;
	t2vResolution: string;
	t2vDuration: number;
	t2vNegativePrompt: string;
	t2vPromptExpansion: boolean;
	t2vSeed: number;
	t2vSafetyChecker: boolean;
	t2vSettingsExpanded: boolean;

	// Hailuo settings
	hailuoT2VDuration: 6 | 10;

	// LTX Video Pro settings
	ltxv2Duration: 6 | 8 | 10;
	ltxv2Resolution: "1080p" | "1440p" | "2160p";
	ltxv2FPS: 25 | 50;
	ltxv2GenerateAudio: boolean;

	// LTX Video Fast settings
	ltxv2FastDuration: LTXV2FastDuration;
	ltxv2FastResolution: LTXV2FastResolution;
	ltxv2FastFPS: LTXV2FastFps;
	ltxv2FastGenerateAudio: boolean;

	// LTX Video 2.3 Pro settings
	ltx23ProDuration: LTX23Duration;
	ltx23ProResolution: LTX23Resolution;
	ltx23ProFPS: LTX23FPS;
	ltx23ProGenerateAudio: boolean;
	ltx23ProAspectRatio: string;

	// LTX Video 2.3 Fast settings
	ltx23FastDuration: LTX23Duration;
	ltx23FastResolution: LTX23Resolution;
	ltx23FastFPS: LTX23FPS;
	ltx23FastGenerateAudio: boolean;
	ltx23FastAspectRatio: string;
}

export interface TextTabSetters {
	// Unified T2V settings
	setT2vAspectRatio: (value: string) => void;
	setT2vResolution: (value: string) => void;
	setT2vDuration: (value: number) => void;
	setT2vNegativePrompt: (value: string) => void;
	setT2vPromptExpansion: (value: boolean) => void;
	setT2vSeed: (value: number) => void;
	setT2vSafetyChecker: (value: boolean) => void;
	setT2vSettingsExpanded: (value: boolean) => void;

	// Hailuo settings
	setHailuoT2VDuration: (value: 6 | 10) => void;

	// LTX Video Pro settings
	setLTXV2Duration: (value: 6 | 8 | 10) => void;
	setLTXV2Resolution: (value: "1080p" | "1440p" | "2160p") => void;
	setLTXV2FPS: (value: 25 | 50) => void;
	setLTXV2GenerateAudio: (value: boolean) => void;

	// LTX Video Fast settings
	setLTXV2FastDuration: (value: LTXV2FastDuration) => void;
	setLTXV2FastResolution: (value: LTXV2FastResolution) => void;
	setLTXV2FastFPS: (value: LTXV2FastFps) => void;
	setLTXV2FastGenerateAudio: (value: boolean) => void;

	// LTX Video 2.3 Pro settings
	setLTX23ProDuration: (value: LTX23Duration) => void;
	setLTX23ProResolution: (value: LTX23Resolution) => void;
	setLTX23ProFPS: (value: LTX23FPS) => void;
	setLTX23ProGenerateAudio: (value: boolean) => void;
	setLTX23ProAspectRatio: (value: string) => void;

	// LTX Video 2.3 Fast settings
	setLTX23FastDuration: (value: LTX23Duration) => void;
	setLTX23FastResolution: (value: LTX23Resolution) => void;
	setLTX23FastFPS: (value: LTX23FPS) => void;
	setLTX23FastGenerateAudio: (value: boolean) => void;
	setLTX23FastAspectRatio: (value: string) => void;
}

export interface TextTabHelpers {
	/** Count of active (non-default) settings */
	activeSettingsCount: number;
	/** Reset all settings to defaults */
	resetToDefaults: () => void;
	/** Whether extended LTX Fast resolution is needed */
	isExtendedLTXV2FastDuration: boolean;
}

export interface UseTextTabStateResult {
	state: TextTabState;
	setters: TextTabSetters;
	helpers: TextTabHelpers;
}

// ============================================
// Hook
// ============================================

export interface UseTextTabStateOptions {
	/** Selected models (for reset effects) */
	selectedModels: string[];
}

/**
 * Hook for managing Text tab state.
 *
 * @example
 * ```tsx
 * const { state, setters, helpers } = useTextTabState({ selectedModels });
 *
 * // Use state values
 * <DurationSelect value={state.t2vDuration} onChange={setters.setT2vDuration} />
 *
 * // Check active count for badge
 * <Badge>{helpers.activeSettingsCount} active</Badge>
 * ```
 */
export function useTextTabState({
	selectedModels,
}: UseTextTabStateOptions): UseTextTabStateResult {
	// Unified T2V settings
	const [t2vAspectRatio, setT2vAspectRatio] = useState<string>(
		T2V_DEFAULTS.aspectRatio
	);
	const [t2vResolution, setT2vResolution] = useState<string>(
		T2V_DEFAULTS.resolution
	);
	const [t2vDuration, setT2vDuration] = useState<number>(T2V_DEFAULTS.duration);
	const [t2vNegativePrompt, setT2vNegativePrompt] = useState<string>(
		T2V_DEFAULTS.negativePrompt
	);
	const [t2vPromptExpansion, setT2vPromptExpansion] = useState<boolean>(
		T2V_DEFAULTS.promptExpansion
	);
	const [t2vSeed, setT2vSeed] = useState<number>(T2V_DEFAULTS.seed);
	const [t2vSafetyChecker, setT2vSafetyChecker] = useState<boolean>(
		T2V_DEFAULTS.safetyChecker
	);
	const [t2vSettingsExpanded, setT2vSettingsExpanded] =
		useState<boolean>(false);

	// Hailuo settings
	const [hailuoT2VDuration, setHailuoT2VDuration] = useState<6 | 10>(6);

	// LTX Video Pro settings
	const [ltxv2Duration, setLTXV2Duration] = useState<6 | 8 | 10>(6);
	const [ltxv2Resolution, setLTXV2Resolution] = useState<
		"1080p" | "1440p" | "2160p"
	>("1080p");
	const [ltxv2FPS, setLTXV2FPS] = useState<25 | 50>(25);
	const [ltxv2GenerateAudio, setLTXV2GenerateAudio] = useState(true);

	// LTX Video Fast settings
	const [ltxv2FastDuration, setLTXV2FastDuration] = useState<LTXV2FastDuration>(
		LTXV2_FAST_CONFIG.DURATIONS[0]
	);
	const [ltxv2FastResolution, setLTXV2FastResolution] =
		useState<LTXV2FastResolution>(LTXV2_FAST_CONFIG.RESOLUTIONS.STANDARD[0]);
	const [ltxv2FastFPS, setLTXV2FastFPS] = useState<LTXV2FastFps>(
		LTXV2_FAST_CONFIG.FPS_OPTIONS.STANDARD[0]
	);
	const [ltxv2FastGenerateAudio, setLTXV2FastGenerateAudio] = useState(true);

	// LTX Video 2.3 Pro settings
	const [ltx23ProDuration, setLTX23ProDuration] = useState<LTX23Duration>(
		LTX23_CONFIG.PRO_DURATIONS[0]
	);
	const [ltx23ProResolution, setLTX23ProResolution] =
		useState<LTX23Resolution>("1080p");
	const [ltx23ProFPS, setLTX23ProFPS] = useState<LTX23FPS>(25);
	const [ltx23ProGenerateAudio, setLTX23ProGenerateAudio] = useState(true);
	const [ltx23ProAspectRatio, setLTX23ProAspectRatio] = useState("16:9");

	// LTX Video 2.3 Fast settings
	const [ltx23FastDuration, setLTX23FastDuration] = useState<LTX23Duration>(
		LTX23_CONFIG.FAST_DURATIONS[0]
	);
	const [ltx23FastResolution, setLTX23FastResolution] =
		useState<LTX23Resolution>("1080p");
	const [ltx23FastFPS, setLTX23FastFPS] = useState<LTX23FPS>(25);
	const [ltx23FastGenerateAudio, setLTX23FastGenerateAudio] = useState(true);
	const [ltx23FastAspectRatio, setLTX23FastAspectRatio] = useState("16:9");

	// Model selection helpers
	const hailuoSelected =
		selectedModels.includes("hailuo23_standard_t2v") ||
		selectedModels.includes("hailuo23_pro_t2v");
	const ltxv2ProTextSelected = selectedModels.includes("ltxv2_pro_t2v");
	const ltxv2FastTextSelected = selectedModels.includes("ltxv2_fast_t2v");
	const ltx23ProSelected = selectedModels.includes("ltx23_pro_t2v");
	const ltx23FastSelected = selectedModels.includes("ltx23_fast_t2v");

	// Reset Hailuo settings when model is deselected
	useEffect(() => {
		if (!hailuoSelected && hailuoT2VDuration !== 6) {
			setHailuoT2VDuration(6);
		}
	}, [hailuoSelected, hailuoT2VDuration]);

	// Reset LTX Pro settings when model is deselected
	useEffect(() => {
		if (!ltxv2ProTextSelected) {
			setLTXV2Duration(6);
			setLTXV2Resolution("1080p");
			setLTXV2FPS(25);
			setLTXV2GenerateAudio(true);
		}
	}, [ltxv2ProTextSelected]);

	// Reset LTX Fast settings when model is deselected
	useEffect(() => {
		if (!ltxv2FastTextSelected) {
			setLTXV2FastDuration(LTXV2_FAST_CONFIG.DURATIONS[0]);
			setLTXV2FastResolution(LTXV2_FAST_CONFIG.RESOLUTIONS.STANDARD[0]);
			setLTXV2FastFPS(LTXV2_FAST_CONFIG.FPS_OPTIONS.STANDARD[0]);
			setLTXV2FastGenerateAudio(true);
		}
	}, [ltxv2FastTextSelected]);

	// Reset LTX 2.3 Pro settings when model is deselected
	useEffect(() => {
		if (!ltx23ProSelected) {
			setLTX23ProDuration(LTX23_CONFIG.PRO_DURATIONS[0]);
			setLTX23ProResolution("1080p");
			setLTX23ProFPS(25);
			setLTX23ProGenerateAudio(true);
			setLTX23ProAspectRatio("16:9");
		}
	}, [ltx23ProSelected]);

	// Reset LTX 2.3 Fast settings when model is deselected
	useEffect(() => {
		if (!ltx23FastSelected) {
			setLTX23FastDuration(LTX23_CONFIG.FAST_DURATIONS[0]);
			setLTX23FastResolution("1080p");
			setLTX23FastFPS(25);
			setLTX23FastGenerateAudio(true);
			setLTX23FastAspectRatio("16:9");
		}
	}, [ltx23FastSelected]);

	// Auto-correct LTX 2.3 Fast resolution/FPS when duration crosses threshold
	useEffect(() => {
		if (ltx23FastDuration > LTX23_CONFIG.EXTENDED_DURATION_THRESHOLD) {
			const validRes = LTX23_CONFIG.RESOLUTIONS.EXTENDED;
			if (
				!validRes.includes(ltx23FastResolution as (typeof validRes)[number])
			) {
				setLTX23FastResolution(validRes[0]);
			}
			const validFps = LTX23_CONFIG.FPS_OPTIONS.EXTENDED;
			if (!validFps.includes(ltx23FastFPS as (typeof validFps)[number])) {
				setLTX23FastFPS(validFps[0]);
			}
		}
	}, [ltx23FastDuration, ltx23FastResolution, ltx23FastFPS]);

	// Calculate active settings count
	const activeSettingsCount = useMemo(() => {
		let count = 0;
		if (t2vAspectRatio !== T2V_DEFAULTS.aspectRatio) count++;
		if (t2vResolution !== T2V_DEFAULTS.resolution) count++;
		if (t2vDuration !== T2V_DEFAULTS.duration) count++;
		if (t2vNegativePrompt !== T2V_DEFAULTS.negativePrompt) count++;
		if (t2vPromptExpansion !== T2V_DEFAULTS.promptExpansion) count++;
		if (t2vSeed !== T2V_DEFAULTS.seed) count++;
		if (t2vSafetyChecker !== T2V_DEFAULTS.safetyChecker) count++;
		return count;
	}, [
		t2vAspectRatio,
		t2vResolution,
		t2vDuration,
		t2vNegativePrompt,
		t2vPromptExpansion,
		t2vSeed,
		t2vSafetyChecker,
	]);

	// Reset to defaults
	const resetToDefaults = useCallback(() => {
		setT2vAspectRatio(T2V_DEFAULTS.aspectRatio);
		setT2vResolution(T2V_DEFAULTS.resolution);
		setT2vDuration(T2V_DEFAULTS.duration);
		setT2vNegativePrompt(T2V_DEFAULTS.negativePrompt);
		setT2vPromptExpansion(T2V_DEFAULTS.promptExpansion);
		setT2vSeed(T2V_DEFAULTS.seed);
		setT2vSafetyChecker(T2V_DEFAULTS.safetyChecker);
	}, []);

	// Check if extended duration is active (for LTX Fast)
	const isExtendedLTXV2FastDuration =
		ltxv2FastDuration > LTXV2_FAST_CONFIG.EXTENDED_DURATION_THRESHOLD;

	return {
		state: {
			t2vAspectRatio,
			t2vResolution,
			t2vDuration,
			t2vNegativePrompt,
			t2vPromptExpansion,
			t2vSeed,
			t2vSafetyChecker,
			t2vSettingsExpanded,
			hailuoT2VDuration,
			ltxv2Duration,
			ltxv2Resolution,
			ltxv2FPS,
			ltxv2GenerateAudio,
			ltxv2FastDuration,
			ltxv2FastResolution,
			ltxv2FastFPS,
			ltxv2FastGenerateAudio,
			ltx23ProDuration,
			ltx23ProResolution,
			ltx23ProFPS,
			ltx23ProGenerateAudio,
			ltx23ProAspectRatio,
			ltx23FastDuration,
			ltx23FastResolution,
			ltx23FastFPS,
			ltx23FastGenerateAudio,
			ltx23FastAspectRatio,
		},
		setters: {
			setT2vAspectRatio,
			setT2vResolution,
			setT2vDuration,
			setT2vNegativePrompt,
			setT2vPromptExpansion,
			setT2vSeed,
			setT2vSafetyChecker,
			setT2vSettingsExpanded,
			setHailuoT2VDuration,
			setLTXV2Duration,
			setLTXV2Resolution,
			setLTXV2FPS,
			setLTXV2GenerateAudio,
			setLTXV2FastDuration,
			setLTXV2FastResolution,
			setLTXV2FastFPS,
			setLTXV2FastGenerateAudio,
			setLTX23ProDuration,
			setLTX23ProResolution,
			setLTX23ProFPS,
			setLTX23ProGenerateAudio,
			setLTX23ProAspectRatio,
			setLTX23FastDuration,
			setLTX23FastResolution,
			setLTX23FastFPS,
			setLTX23FastGenerateAudio,
			setLTX23FastAspectRatio,
		},
		helpers: {
			activeSettingsCount,
			resetToDefaults,
			isExtendedLTXV2FastDuration,
		},
	};
}
