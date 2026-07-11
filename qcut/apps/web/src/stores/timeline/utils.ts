/**
 * Timeline Store Utilities
 *
 * Pure helper functions for timeline operations.
 * These functions have no side effects and can be easily unit tested.
 */

import type { TimelineTrack, TrackType } from "@/types/timeline";
import { generateUUID } from "@/lib/utils";
import { createDefaultTrackAudioSettings } from "@/lib/audio/audio-mix-settings";

/**
 * Helper function to manage element naming with suffixes
 * Prevents suffix accumulation by removing existing suffixes before adding new ones
 * @param originalName - The original name of the element
 * @param suffix - The suffix to add (e.g., 'left', 'right', 'audio')
 * @returns The element name with the specified suffix
 */
export function getElementNameWithSuffix(
	originalName: string,
	suffix: string
): string {
	// Remove existing suffixes to prevent accumulation
	const baseName = originalName
		.replace(/ \(left\)$/, "")
		.replace(/ \(right\)$/, "")
		.replace(/ \(audio\)$/, "")
		.replace(/ \(split \d+\)$/, "");

	return `${baseName} (${suffix})`;
}

/**
 * Generate a proper track name based on track type
 * @param type - The type of track
 * @returns A descriptive track name
 */
export function getTrackName(type: TrackType): string {
	switch (type) {
		case "media":
			return "Media Track";
		case "text":
			return "Text Track";
		case "markdown":
			return "Markdown Track";
		case "audio":
			return "Audio Track";
		case "sticker":
			return "Sticker Track";
		case "adjustment":
			return "Adjustment Track";
		case "captions":
			return "Captions Track";
		case "remotion":
			return "Remotion Track";
		default:
			return "Track";
	}
}

/**
 * Create a new track with the specified type
 * @param type - The type of track to create
 * @returns A new TimelineTrack object
 */
export function createTrack(type: TrackType): TimelineTrack {
	return {
		id: generateUUID(),
		name: getTrackName(type),
		type,
		elements: [],
		muted: false,
		audio:
			type === "media" || type === "audio"
				? createDefaultTrackAudioSettings()
				: undefined,
	};
}

/**
 * Calculate the effective duration of an element (accounting for trim)
 * @param element - The timeline element
 * @returns The effective duration in seconds
 */
export function getEffectiveDuration(element: {
	duration: number;
	trimStart: number;
	trimEnd: number;
}): number {
	return element.duration - element.trimStart - element.trimEnd;
}

/**
 * Calculate the end time of an element on the timeline
 * @param element - The timeline element
 * @returns The end time in seconds
 */
export function getElementEndTime(element: {
	startTime: number;
	duration: number;
	trimStart: number;
	trimEnd: number;
}): number {
	return element.startTime + getEffectiveDuration(element);
}
