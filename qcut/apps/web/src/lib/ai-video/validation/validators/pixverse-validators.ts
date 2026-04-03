/**
 * PixVerse v6 validation functions
 */

import { ERROR_MESSAGES } from "@/components/editor/media-panel/views/ai/constants/ai-constants";

const PIXVERSE_VALID_RESOLUTIONS = ["360p", "540p", "720p", "1080p"];
const PIXVERSE_VALID_STYLES = [
	"anime",
	"3d_animation",
	"clay",
	"comic",
	"cyberpunk",
];

/** Validate PixVerse video duration parameter. */
export function validatePixverseDuration(duration: number): void {
	if (duration < 1 || duration > 15) {
		throw new Error(ERROR_MESSAGES.PIXVERSE_INVALID_DURATION);
	}
}

/** Validate PixVerse video resolution parameter. */
export function validatePixverseResolution(resolution: string): void {
	if (!PIXVERSE_VALID_RESOLUTIONS.includes(resolution)) {
		throw new Error(ERROR_MESSAGES.PIXVERSE_INVALID_RESOLUTION);
	}
}

/** Validate PixVerse video style parameter. */
export function validatePixverseStyle(style: string): void {
	if (!PIXVERSE_VALID_STYLES.includes(style)) {
		throw new Error(ERROR_MESSAGES.PIXVERSE_INVALID_STYLE);
	}
}
