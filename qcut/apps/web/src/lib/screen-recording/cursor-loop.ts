/**
 * Cursor loop mode — smoothly animates cursor from its final position back
 * to its starting position for seamless looping exports.
 * Algorithm ported from Recordly (AGPL 3.0).
 */

import type { CursorTelemetryPoint } from "@/types/electron/cursor-telemetry";

/** Duration reserved at the end for the return + settle animation */
const FREEZE_DURATION_MS = 670;

/** Number of interpolation steps for the return motion */
const RETURN_STEPS = 20;

/** Duration the cursor holds at start position before the loop restarts */
const SETTLE_DURATION_MS = 120;

/** Minimum distance between samples to count as "moving" */
const MOVEMENT_EPSILON = 0.0015;

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function easeOutQuint(t: number): number {
	return 1 - (1 - t) ** 5;
}

/**
 * Find the time of the last sample where the cursor was actually moving.
 * Samples at the end where cursor is stationary are ignored.
 */
export function findLastMovingSampleTime(
	points: CursorTelemetryPoint[],
	epsilon = MOVEMENT_EPSILON
): number {
	if (points.length <= 1) return points[0]?.t ?? 0;

	for (let i = points.length - 1; i > 0; i--) {
		const curr = points[i];
		const prev = points[i - 1];
		const distance = Math.hypot(curr.x - prev.x, curr.y - prev.y);
		if (distance > epsilon) {
			return curr.t;
		}
	}

	return points[points.length - 1].t;
}

/**
 * Interpolate cursor position at a given time using binary search.
 */
function interpolatePosition(
	points: CursorTelemetryPoint[],
	timeMs: number
): { x: number; y: number } | null {
	if (points.length === 0) return null;
	if (timeMs <= points[0].t) return { x: points[0].x, y: points[0].y };
	if (timeMs >= points[points.length - 1].t) {
		const last = points[points.length - 1];
		return { x: last.x, y: last.y };
	}

	let lo = 0;
	let hi = points.length - 1;
	while (lo < hi - 1) {
		const mid = (lo + hi) >> 1;
		if (points[mid].t <= timeMs) lo = mid;
		else hi = mid;
	}

	const a = points[lo];
	const b = points[hi];
	const span = b.t - a.t;
	if (span <= 0) return { x: a.x, y: a.y };

	const t = (timeMs - a.t) / span;
	return {
		x: a.x + (b.x - a.x) * t,
		y: a.y + (b.y - a.y) * t,
	};
}

export interface LoopConfig {
	freezeDurationMs?: number;
	returnSteps?: number;
	settleDurationMs?: number;
	movementEpsilon?: number;
}

/**
 * Build looped cursor telemetry: remap original samples into a shorter
 * playback window, then append a smooth return-to-start animation and
 * a settle period.
 *
 * @param points - Original cursor telemetry points
 * @param totalDurationMs - Total video duration in ms
 * @param config - Optional override for timing constants
 * @returns New telemetry points with loop animation appended
 */
export function buildLoopedCursorTelemetry(
	points: CursorTelemetryPoint[],
	totalDurationMs: number,
	config?: LoopConfig
): CursorTelemetryPoint[] {
	if (!points || points.length === 0) return [];

	const freezeDuration = config?.freezeDurationMs ?? FREEZE_DURATION_MS;
	const returnSteps = config?.returnSteps ?? RETURN_STEPS;
	const settleDuration = config?.settleDurationMs ?? SETTLE_DURATION_MS;

	const timelineEndMs = Math.max(0, Math.round(totalDurationMs));
	if (timelineEndMs <= 0) return points;

	const firstPoint = points[0];
	const maxFreezeWindow = timelineEndMs - firstPoint.t;
	if (maxFreezeWindow <= 1) return points;

	const actualFreeze = Math.min(freezeDuration, maxFreezeWindow);
	const motionEndMs = timelineEndMs - actualFreeze;
	const actualSettle = Math.min(settleDuration, Math.max(0, actualFreeze - 1));
	const returnMotionDuration = Math.max(1, actualFreeze - actualSettle);

	const sourceStartMs = firstPoint.t;
	const epsilon = config?.movementEpsilon ?? MOVEMENT_EPSILON;
	const sourceEndMs = Math.max(
		sourceStartMs,
		findLastMovingSampleTime(points, epsilon)
	);
	const sourceDuration = Math.max(1, sourceEndMs - sourceStartMs);
	const playbackWindow = Math.max(1, motionEndMs);

	// Phase 1: Remap original timestamps into shortened playback window
	const looped: CursorTelemetryPoint[] = [
		{ ...firstPoint, t: 0, c: firstPoint.c },
	];

	for (const point of points) {
		const progress = clamp((point.t - sourceStartMs) / sourceDuration, 0, 1);
		const mappedTime = Math.round(playbackWindow * progress);

		if (mappedTime <= looped[looped.length - 1].t) {
			// Overwrite last point at same timestamp
			looped[looped.length - 1] = {
				...point,
				t: looped[looped.length - 1].t,
			};
			continue;
		}

		looped.push({ ...point, t: mappedTime });
	}

	// Phase 2: Return motion — ease from final position to first position
	const returnStart = interpolatePosition(looped, motionEndMs) ?? {
		x: points[points.length - 1].x,
		y: points[points.length - 1].y,
	};

	for (let step = 0; step <= returnSteps; step++) {
		const progress = step / returnSteps;
		const eased = easeOutQuint(progress);
		const t = Math.round(motionEndMs + returnMotionDuration * progress);
		looped.push({
			t,
			x: returnStart.x + (firstPoint.x - returnStart.x) * eased,
			y: returnStart.y + (firstPoint.y - returnStart.y) * eased,
			p: false,
			c: progress >= 1 ? firstPoint.c : undefined,
		});
	}

	// Phase 3: Settle — hold at start position for clean loop join
	if (actualSettle > 0) {
		const settleSteps = Math.max(
			2,
			Math.round((actualSettle / freezeDuration) * returnSteps)
		);
		const settleStartMs = motionEndMs + returnMotionDuration;

		for (let step = 1; step <= settleSteps; step++) {
			const progress = step / settleSteps;
			const t = Math.round(settleStartMs + actualSettle * progress);
			looped.push({
				t,
				x: firstPoint.x,
				y: firstPoint.y,
				p: false,
				c: firstPoint.c,
			});
		}
	}

	return looped;
}
