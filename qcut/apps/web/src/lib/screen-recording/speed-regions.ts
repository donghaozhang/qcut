/**
 * Speed regions — per-region playback speed multipliers on the timeline.
 * Allows speeding up or slowing down specific sections of a recording.
 */

export interface SpeedRegion {
	id: string;
	startMs: number;
	endMs: number;
	/** Playback speed multiplier (0.25–4.0, 1.0 = normal) */
	speed: number;
}

/** Minimum duration for a speed region in ms */
export const SPEED_REGION_MIN_DURATION_MS = 200;

/** Default speed for new regions */
export const SPEED_REGION_DEFAULT_SPEED = 1.0;

/** Default duration for new regions in ms */
export const SPEED_REGION_DEFAULT_DURATION_MS = 1000;

/** Min/max speed bounds */
export const SPEED_MIN = 0.25;
export const SPEED_MAX = 4.0;

/**
 * Check if a candidate region overlaps with any existing regions.
 * Two regions overlap if one starts before the other ends and vice versa.
 */
export function hasOverlap(
	regions: SpeedRegion[],
	candidate: SpeedRegion
): boolean {
	for (const region of regions) {
		if (region.id === candidate.id) continue;
		if (candidate.startMs < region.endMs && candidate.endMs > region.startMs) {
			return true;
		}
	}
	return false;
}

/**
 * Get the effective playback speed at a given time.
 * Returns 1.0 if no speed region covers the given time.
 */
export function getSpeedAtTime(regions: SpeedRegion[], timeMs: number): number {
	for (const region of regions) {
		if (timeMs >= region.startMs && timeMs < region.endMs) {
			return region.speed;
		}
	}
	return 1.0;
}

/**
 * Convert real (source) time to playback time, accounting for speed regions.
 * In sped-up regions, playback time advances faster than real time.
 */
export function realTimeToPlaybackTime(
	regions: SpeedRegion[],
	realTimeMs: number
): number {
	const sorted = [...regions].sort((a, b) => a.startMs - b.startMs);
	let playbackMs = 0;
	let cursor = 0;

	for (const region of sorted) {
		if (realTimeMs <= region.startMs) {
			// Before this region: 1:1 mapping
			playbackMs += realTimeMs - cursor;
			return playbackMs;
		}

		// Add time before this region at normal speed
		playbackMs += region.startMs - cursor;

		if (realTimeMs <= region.endMs) {
			// Inside this region: time is scaled
			playbackMs += (realTimeMs - region.startMs) / region.speed;
			return playbackMs;
		}

		// Past this region: add its duration scaled by speed
		playbackMs += (region.endMs - region.startMs) / region.speed;
		cursor = region.endMs;
	}

	// After all regions: 1:1 mapping
	playbackMs += realTimeMs - cursor;
	return playbackMs;
}

/**
 * Convert playback time back to real (source) time.
 * Inverse of realTimeToPlaybackTime.
 */
export function playbackTimeToRealTime(
	regions: SpeedRegion[],
	playbackTimeMs: number
): number {
	const sorted = [...regions].sort((a, b) => a.startMs - b.startMs);
	let remaining = playbackTimeMs;
	let realMs = 0;

	for (const region of sorted) {
		const gapBefore = region.startMs - realMs;
		if (remaining <= gapBefore) {
			return realMs + remaining;
		}
		remaining -= gapBefore;
		realMs = region.startMs;

		const regionPlaybackDuration =
			(region.endMs - region.startMs) / region.speed;
		if (remaining <= regionPlaybackDuration) {
			return realMs + remaining * region.speed;
		}
		remaining -= regionPlaybackDuration;
		realMs = region.endMs;
	}

	return realMs + remaining;
}

/**
 * Calculate the total playback duration with speed regions applied.
 * Sped-up regions reduce total duration; slowed-down regions increase it.
 */
export function calculateSpeedAdjustedDuration(
	totalDurationMs: number,
	regions: SpeedRegion[]
): number {
	if (regions.length === 0) return totalDurationMs;

	const sorted = [...regions].sort((a, b) => a.startMs - b.startMs);
	let adjustedMs = 0;
	let cursor = 0;

	for (const region of sorted) {
		// Clamp region to total duration
		const start = Math.max(region.startMs, cursor);
		const end = Math.min(region.endMs, totalDurationMs);
		if (start >= end) continue;

		// Add time before this region at normal speed
		adjustedMs += start - cursor;
		// Add region duration scaled by speed
		adjustedMs += (end - start) / region.speed;
		cursor = end;
	}

	// Add remaining time after last region
	if (cursor < totalDurationMs) {
		adjustedMs += totalDurationMs - cursor;
	}

	return adjustedMs;
}

/**
 * Clamp a speed value to valid bounds.
 */
export function clampSpeed(speed: number): number {
	return Math.max(SPEED_MIN, Math.min(SPEED_MAX, speed));
}
