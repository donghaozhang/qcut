/**
 * Webcam overlay store — manages picture-in-picture webcam bubble config.
 * Follows the same Zustand pattern as stickers-overlay-store.ts.
 */

import { create } from "zustand";

export type WebcamPresetPosition =
	| "top-left"
	| "top-center"
	| "top-right"
	| "center-left"
	| "center"
	| "center-right"
	| "bottom-left"
	| "bottom-center"
	| "bottom-right";

export interface WebcamOverlayConfig {
	enabled: boolean;
	/** Preset position or custom {x, y} percentage (0–100) */
	position: WebcamPresetPosition | { x: number; y: number };
	/** Size as percentage of container width (10–100) */
	size: number;
	mirror: boolean;
	/** Corner radius in px (0–160) */
	roundness: number;
	/** Shadow intensity (0–100) */
	shadow: number;
	/** Margin from edge in px */
	margin: number;
	/** Scale webcam inversely with zoom depth */
	zoomReactive: boolean;
	opacity: number;
	deviceId: string | null;
}

export const DEFAULT_WEBCAM_CONFIG: WebcamOverlayConfig = {
	enabled: false,
	position: "bottom-left",
	size: 25,
	mirror: false,
	roundness: 80,
	shadow: 50,
	margin: 20,
	zoomReactive: false,
	opacity: 1,
	deviceId: null,
};

/** Map preset position names to normalized 0–1 coordinates */
export function getPresetCoordinates(preset: WebcamPresetPosition): {
	x: number;
	y: number;
} {
	const map: Record<WebcamPresetPosition, { x: number; y: number }> = {
		"top-left": { x: 0, y: 0 },
		"top-center": { x: 0.5, y: 0 },
		"top-right": { x: 1, y: 0 },
		"center-left": { x: 0, y: 0.5 },
		center: { x: 0.5, y: 0.5 },
		"center-right": { x: 1, y: 0.5 },
		"bottom-left": { x: 0, y: 1 },
		"bottom-center": { x: 0.5, y: 1 },
		"bottom-right": { x: 1, y: 1 },
	};
	return map[preset];
}

/**
 * Calculate webcam overlay pixel dimensions and position.
 */
export function getWebcamOverlayRect(
	config: WebcamOverlayConfig,
	containerWidth: number,
	containerHeight: number,
	zoomDepth = 1
): { x: number; y: number; width: number; height: number } {
	const sizePercent = config.size / 100;
	let overlayWidth = containerWidth * sizePercent;
	let overlayHeight = overlayWidth * (9 / 16); // 16:9 aspect ratio

	// Zoom-reactive scaling
	if (config.zoomReactive && zoomDepth > 1) {
		const scale = 1 / zoomDepth;
		overlayWidth *= scale;
		overlayHeight *= scale;
	}

	// Enforce minimum size
	overlayWidth = Math.max(overlayWidth, 56);
	overlayHeight = Math.max(overlayHeight, 56 * (9 / 16));

	// Position
	const normalized =
		typeof config.position === "string"
			? getPresetCoordinates(config.position)
			: { x: config.position.x / 100, y: config.position.y / 100 };

	const margin = config.margin;
	const availableW = containerWidth - overlayWidth - margin * 2;
	const availableH = containerHeight - overlayHeight - margin * 2;

	const x = margin + normalized.x * availableW;
	const y = margin + normalized.y * availableH;

	return {
		x: Math.max(0, x),
		y: Math.max(0, y),
		width: overlayWidth,
		height: overlayHeight,
	};
}

interface WebcamOverlayState {
	config: WebcamOverlayConfig;
	setConfig: (updates: Partial<WebcamOverlayConfig>) => void;
	resetConfig: () => void;
}

export const useWebcamOverlayStore = create<WebcamOverlayState>((set) => ({
	config: { ...DEFAULT_WEBCAM_CONFIG },
	setConfig: (updates) =>
		set((state) => ({
			config: { ...state.config, ...updates },
		})),
	resetConfig: () => set({ config: { ...DEFAULT_WEBCAM_CONFIG } }),
}));
