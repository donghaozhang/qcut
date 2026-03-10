/**
 * Element utility functions — duration, naming, overlap detection.
 * Extracted from apps/web/src/stores/timeline/utils.ts
 *
 * @module @qcut/editor-core/timeline/element-utils
 */

/**
 * Calculate the effective duration of an element (accounting for trim).
 */
export function getEffectiveDuration(element: {
	duration: number;
	trimStart: number;
	trimEnd: number;
}): number {
	return element.duration - element.trimStart - element.trimEnd;
}

/**
 * Calculate the end time of an element on the timeline.
 */
export function getElementEndTime(element: {
	startTime: number;
	duration: number;
	trimStart: number;
	trimEnd: number;
}): number {
	return element.startTime + getEffectiveDuration(element);
}

/**
 * Manage element naming with suffixes.
 * Prevents suffix accumulation by stripping existing suffixes first.
 */
export function getElementNameWithSuffix(
	originalName: string,
	suffix: string
): string {
	const baseName = originalName
		.replace(/ \(left\)$/, "")
		.replace(/ \(right\)$/, "")
		.replace(/ \(audio\)$/, "")
		.replace(/ \(split \d+\)$/, "");

	return `${baseName} (${suffix})`;
}
