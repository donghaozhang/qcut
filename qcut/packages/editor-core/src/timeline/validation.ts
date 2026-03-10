/**
 * Timeline validation utilities.
 * Extracted from apps/web/src/types/timeline.ts
 *
 * @module @qcut/editor-core/timeline/validation
 */

import type { TrackType } from "../types/timeline.js";

/** Check if an element type is compatible with a track type. */
export function canElementGoOnTrack(
	elementType:
		| "text"
		| "media"
		| "sticker"
		| "captions"
		| "remotion"
		| "markdown",
	trackType: TrackType
): boolean {
	if (elementType === "text") return trackType === "text";
	if (elementType === "media")
		return trackType === "media" || trackType === "audio";
	if (elementType === "sticker") return trackType === "sticker";
	if (elementType === "captions") return trackType === "captions";
	if (elementType === "remotion") return trackType === "remotion";
	if (elementType === "markdown") return trackType === "markdown";
	return false;
}

/** Validate element-track compatibility with error message. */
export function validateElementTrackCompatibility(
	element: {
		type: "text" | "media" | "sticker" | "captions" | "remotion" | "markdown";
	},
	track: { type: TrackType }
): { isValid: boolean; errorMessage?: string } {
	const isValid = canElementGoOnTrack(element.type, track.type);

	if (!isValid) {
		const errorMessages: Record<string, string> = {
			text: "Text elements can only be placed on text tracks",
			sticker: "Sticker elements can only be placed on sticker tracks",
			captions: "Caption elements can only be placed on caption tracks",
			remotion: "Remotion elements can only be placed on Remotion tracks",
			markdown: "Markdown elements can only be placed on markdown tracks",
			media: "Media elements can only be placed on media or audio tracks",
		};
		const errorMessage =
			errorMessages[element.type] ??
			"Media elements can only be placed on media or audio tracks";

		return { isValid: false, errorMessage };
	}

	return { isValid: true };
}
