import type { TextKeyframePoint } from "./model.js";

/**
 * Cubic bezier value-track evaluation, mirroring Jianying's
 * `motionKeyFrameInfo` rows `[t, v, vi, vo, vti, vto]`: each key carries its
 * value plus incoming/outgoing handle values and relative handle times. A
 * segment between two keys is the bezier
 *   P0 = (t0, v0)
 *   P1 = (t0 + outTime0, outValue0)
 *   P2 = (t1 + inTime1, inValue1)   // inTime is usually negative
 *   P3 = (t1, v1)
 * evaluated at x = progress by solving x(s) = progress for the curve
 * parameter, exactly like a CSS cubic-bezier easing but with value handles.
 */

function cubicAt({
	p0,
	p1,
	p2,
	p3,
	s,
}: {
	p0: number;
	p1: number;
	p2: number;
	p3: number;
	s: number;
}): number {
	const inverse = 1 - s;
	return (
		inverse * inverse * inverse * p0 +
		3 * inverse * inverse * s * p1 +
		3 * inverse * s * s * p2 +
		s * s * s * p3
	);
}

function solveBezierParameter({
	x0,
	x1,
	x2,
	x3,
	x,
}: {
	x0: number;
	x1: number;
	x2: number;
	x3: number;
	x: number;
}): number {
	// Bisection is unconditionally stable and deterministic; 40 halvings give
	// far more precision than a rendered frame can show.
	let low = 0;
	let high = 1;
	let s = 0.5;
	for (let step = 0; step < 40; step++) {
		s = (low + high) / 2;
		const value = cubicAt({ p0: x0, p1: x1, p2: x2, p3: x3, s });
		if (value < x) low = s;
		else high = s;
	}
	return s;
}

function segmentValue({
	from,
	to,
	progress,
}: {
	from: TextKeyframePoint;
	to: TextKeyframePoint;
	progress: number;
}): number {
	const span = to.t - from.t;
	if (span <= 0) return to.v;
	const hasHandles =
		from.outTime !== undefined ||
		from.outValue !== undefined ||
		to.inTime !== undefined ||
		to.inValue !== undefined;
	if (!hasHandles) {
		return from.v + ((to.v - from.v) * (progress - from.t)) / span;
	}
	// Handle times are clamped inside the segment so x stays monotonic and
	// the parameter solve is well defined (same guard AE applies).
	const x1 = Math.min(
		to.t,
		Math.max(from.t, from.t + (from.outTime ?? span / 3))
	);
	const x2 = Math.min(to.t, Math.max(from.t, to.t + (to.inTime ?? -span / 3)));
	const s = solveBezierParameter({
		x0: from.t,
		x1,
		x2,
		x3: to.t,
		x: progress,
	});
	return cubicAt({
		p0: from.v,
		p1: from.outValue ?? from.v,
		p2: to.inValue ?? to.v,
		p3: to.v,
		s,
	});
}

/**
 * Evaluate a track at a phase progress. Progress outside the keyed range
 * holds the first/last key value; keys are assumed sorted by `t` (the
 * normalizer guarantees it).
 */
export function evaluateTextKeyframeTrack({
	track,
	progress,
}: {
	track: readonly TextKeyframePoint[];
	progress: number;
}): number {
	if (track.length === 0) return 0;
	const first = track[0];
	if (track.length === 1 || progress <= first.t) return first.v;
	const last = track[track.length - 1];
	if (progress >= last.t) return last.v;
	for (let index = 0; index < track.length - 1; index++) {
		const from = track[index];
		const to = track[index + 1];
		if (progress >= from.t && progress <= to.t) {
			return segmentValue({ from, to, progress });
		}
	}
	return last.v;
}
