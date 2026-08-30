/**
 * Shared AI generation types.
 *
 * Used by media store (MediaItem.metadata), gap store, context menu,
 * and any feature that creates or regenerates AI content.
 *
 * Adapted from LTX-Desktop's GenerationParams / AssetTake types.
 */

export interface GenerationParams {
	mode: "text-to-video" | "image-to-video" | "text-to-image";
	prompt: string;
	model: string;
	duration?: number;
	resolution?: string;
	fps?: number;
	cameraMotion?: string;
	aspectRatio?: string;
}

export interface MediaTake {
	url: string;
	localPath?: string;
	createdAt: number;
}

/** Camera motion presets supported by LTX / WAN / FAL models */
export const CAMERA_MOTION_PRESETS = [
	{ value: "none", label: "None" },
	{ value: "static", label: "Static" },
	{ value: "focus_shift", label: "Focus Shift" },
	{ value: "dolly_in", label: "Dolly In" },
	{ value: "dolly_out", label: "Dolly Out" },
	{ value: "dolly_left", label: "Dolly Left" },
	{ value: "dolly_right", label: "Dolly Right" },
	{ value: "jib_up", label: "Jib Up" },
	{ value: "jib_down", label: "Jib Down" },
] as const;
