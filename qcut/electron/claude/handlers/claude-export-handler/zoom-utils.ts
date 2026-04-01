/**
 * Zoom utilities for CLI export — pure math, no DOM dependencies.
 * Ported from apps/web/src/lib/screen-recording/ modules:
 *   zoom-region-utils.ts, zoom-transform.ts, auto-zoom-analyzer.ts,
 *   focus-utils.ts, constants.ts, easing.ts, math-utils.ts,
 *   motion-smoothing.ts, cursor-sway.ts
 *
 * @module electron/claude/handlers/claude-export-handler/zoom-utils
 */

// ── Math & easing ───────────────────────────────────────────────────

export function clamp01(t: number): number {
	return Math.max(0, Math.min(1, t));
}

export function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

function easeOutCubic(t: number): number {
	return 1 - (1 - t) ** 3;
}

function cubicBezier(
	x1: number,
	y1: number,
	x2: number,
	y2: number,
	t: number
): number {
	if (t <= 0) return 0;
	if (t >= 1) return 1;
	let guess = t;
	for (let i = 0; i < 8; i++) {
		const xGuess =
			3 * x1 * guess * (1 - guess) ** 2 +
			3 * x2 * guess ** 2 * (1 - guess) +
			guess ** 3;
		const dx = xGuess - t;
		if (Math.abs(dx) < 1e-6) break;
		const slope =
			3 * x1 * (1 - guess) ** 2 +
			6 * x2 * guess * (1 - guess) -
			3 * x2 * guess ** 2 +
			3 * guess ** 2 -
			6 * x1 * guess * (1 - guess);
		if (Math.abs(slope) < 1e-6) break;
		guess -= dx / slope;
	}
	const y =
		3 * y1 * guess * (1 - guess) ** 2 +
		3 * y2 * guess ** 2 * (1 - guess) +
		guess ** 3;
	return y;
}

function easeConnectedPan(t: number): number {
	return cubicBezier(0.1, 0.0, 0.2, 1.0, t);
}

// ── Constants ───────────────────────────────────────────────────────

const ZOOM_IN_OVERLAP_MS = 500;
const ZOOM_IN_TRANSITION_WINDOW_MS = 600;
const TRANSITION_WINDOW_MS = 400;
const CONNECTED_ZOOM_GAP_MS = 1500;
const CONNECTED_PAN_DURATION_MS = 1000;

// ── ZoomRegion types ────────────────────────────────────────────────

export interface ZoomRegion {
	id: string;
	startMs: number;
	endMs: number;
	depth: number;
	focus: { cx: number; cy: number };
	auto: boolean;
}

export interface ConnectedTransition {
	fromRegion: ZoomRegion;
	toRegion: ZoomRegion;
	panStartMs: number;
	panEndMs: number;
}

export interface ZoomTransform {
	scale: number;
	translateX: number;
	translateY: number;
}

// ── Region strength & transitions ───────────────────────────────────

export function computeRegionStrength(
	region: ZoomRegion,
	timeMs: number
): number {
	const { startMs, endMs } = region;
	const zoomInStart = startMs - ZOOM_IN_OVERLAP_MS;
	if (timeMs < zoomInStart) return 0;
	if (timeMs < startMs) {
		return easeOutCubic(
			clamp01((timeMs - zoomInStart) / ZOOM_IN_TRANSITION_WINDOW_MS)
		);
	}
	if (timeMs <= endMs) return 1;
	const zoomOutEnd = endMs + TRANSITION_WINDOW_MS;
	if (timeMs <= zoomOutEnd) {
		return 1 - easeOutCubic(clamp01((timeMs - endMs) / TRANSITION_WINDOW_MS));
	}
	return 0;
}

export function mergeOverlappingRegions(regions: ZoomRegion[]): ZoomRegion[] {
	if (regions.length <= 1) return [...regions];
	const sorted = [...regions].sort((a, b) => a.startMs - b.startMs);
	const merged: ZoomRegion[] = [{ ...sorted[0] }];
	for (let i = 1; i < sorted.length; i++) {
		const current = sorted[i];
		const last = merged[merged.length - 1];
		if (current.startMs <= last.endMs + TRANSITION_WINDOW_MS) {
			last.endMs = Math.max(last.endMs, current.endMs);
			if (current.depth > last.depth) {
				last.depth = current.depth;
				last.focus = current.focus;
			}
		} else {
			merged.push({ ...current });
		}
	}
	return merged;
}

export function findConnectedTransitions(
	regions: ZoomRegion[]
): ConnectedTransition[] {
	if (regions.length < 2) return [];
	const sorted = [...regions].sort((a, b) => a.startMs - b.startMs);
	const transitions: ConnectedTransition[] = [];
	for (let i = 0; i < sorted.length - 1; i++) {
		const gap = sorted[i + 1].startMs - sorted[i].endMs;
		if (gap > 0 && gap <= CONNECTED_ZOOM_GAP_MS) {
			const panStart = sorted[i].endMs;
			const panEnd = Math.min(
				panStart + CONNECTED_PAN_DURATION_MS,
				sorted[i + 1].startMs
			);
			transitions.push({
				fromRegion: sorted[i],
				toRegion: sorted[i + 1],
				panStartMs: panStart,
				panEndMs: panEnd,
			});
		}
	}
	return transitions;
}

function getConnectedPanState(
	transitions: ConnectedTransition[],
	timeMs: number
): { cx: number; cy: number; scale: number } | null {
	for (const tr of transitions) {
		if (timeMs >= tr.panStartMs && timeMs <= tr.panEndMs) {
			const t = clamp01(
				(timeMs - tr.panStartMs) / (tr.panEndMs - tr.panStartMs)
			);
			const eased = easeConnectedPan(t);
			return {
				cx: lerp(tr.fromRegion.focus.cx, tr.toRegion.focus.cx, eased),
				cy: lerp(tr.fromRegion.focus.cy, tr.toRegion.focus.cy, eased),
				scale: lerp(tr.fromRegion.depth, tr.toRegion.depth, eased),
			};
		}
		if (timeMs > tr.panEndMs && timeMs < tr.toRegion.startMs) {
			return {
				cx: tr.toRegion.focus.cx,
				cy: tr.toRegion.focus.cy,
				scale: tr.toRegion.depth,
			};
		}
	}
	return null;
}

// ── Focus constraint ────────────────────────────────────────────────

function constrainFocus(
	cx: number,
	cy: number,
	zoomScale: number
): { cx: number; cy: number } {
	const halfViewW = 0.5 / zoomScale;
	const halfViewH = 0.5 / zoomScale;
	return {
		cx: Math.max(halfViewW, Math.min(1 - halfViewW, cx)),
		cy: Math.max(halfViewH, Math.min(1 - halfViewH, cy)),
	};
}

// ── Zoom transform ──────────────────────────────────────────────────

const IDENTITY_TRANSFORM: ZoomTransform = {
	scale: 1,
	translateX: 0,
	translateY: 0,
};

export function computeZoomTransform(
	timeMs: number,
	regions: ZoomRegion[],
	sourceWidth: number,
	sourceHeight: number,
	connectedTransitions?: ConnectedTransition[]
): ZoomTransform {
	if (regions.length === 0) return IDENTITY_TRANSFORM;

	if (connectedTransitions && connectedTransitions.length > 0) {
		const panState = getConnectedPanState(connectedTransitions, timeMs);
		if (panState) {
			const { cx, cy } = constrainFocus(
				panState.cx,
				panState.cy,
				panState.scale
			);
			return {
				scale: panState.scale,
				translateX: -(cx * sourceWidth * panState.scale - sourceWidth / 2),
				translateY: -(cy * sourceHeight * panState.scale - sourceHeight / 2),
			};
		}
	}

	let bestStrength = 0;
	let bestRegion: ZoomRegion | null = null;
	for (const region of regions) {
		const strength = computeRegionStrength(region, timeMs);
		if (strength > bestStrength) {
			bestStrength = strength;
			bestRegion = region;
		}
	}

	if (!bestRegion || bestStrength <= 0.001) return IDENTITY_TRANSFORM;

	const { cx, cy } = constrainFocus(
		bestRegion.focus.cx,
		bestRegion.focus.cy,
		bestRegion.depth
	);
	const scale = lerp(1, bestRegion.depth, bestStrength);
	return {
		scale,
		translateX: -(cx * sourceWidth * scale - sourceWidth / 2),
		translateY: -(cy * sourceHeight * scale - sourceHeight / 2),
	};
}

// ── Auto-zoom analyzer ──────────────────────────────────────────────

export interface AutoZoomConfig {
	minDwellMs: number;
	dwellRadiusPx: number;
	minClickCluster: number;
	clickClusterTimeMs: number;
	defaultDepth: number;
	minGapMs: number;
}

export const DEFAULT_AUTO_ZOOM_CONFIG: AutoZoomConfig = {
	minDwellMs: 800,
	dwellRadiusPx: 100,
	minClickCluster: 2,
	clickClusterTimeMs: 3000,
	defaultDepth: 1.5,
	minGapMs: 1000,
};

let idCounter = 0;

interface TelemetryPoint {
	t: number;
	x: number;
	y: number;
	p: boolean;
}

interface CaptureRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export function analyzeForZoomSuggestions(
	points: TelemetryPoint[],
	captureRect: CaptureRect,
	config: Partial<AutoZoomConfig> = {}
): ZoomRegion[] {
	const cfg = { ...DEFAULT_AUTO_ZOOM_CONFIG, ...config };
	if (points.length < 10) return [];

	const regions: ZoomRegion[] = [];

	// Phase 1: Click clustering
	const clickPoints: TelemetryPoint[] = [];
	for (let i = 0; i < points.length; i++) {
		if (points[i].p && (i === 0 || !points[i - 1].p)) {
			clickPoints.push(points[i]);
		}
	}
	const usedClicks = new Set<number>();

	for (let i = 0; i < clickPoints.length; i++) {
		if (usedClicks.has(i)) continue;
		const cluster = [clickPoints[i]];
		usedClicks.add(i);

		for (let j = i + 1; j < clickPoints.length; j++) {
			if (usedClicks.has(j)) continue;
			if (clickPoints[j].t - clickPoints[i].t > cfg.clickClusterTimeMs) break;
			const dx = clickPoints[j].x - clickPoints[i].x;
			const dy = clickPoints[j].y - clickPoints[i].y;
			if (Math.sqrt(dx * dx + dy * dy) <= cfg.dwellRadiusPx) {
				cluster.push(clickPoints[j]);
				usedClicks.add(j);
			}
		}

		if (cluster.length >= cfg.minClickCluster) {
			const avgX = cluster.reduce((s, p) => s + p.x, 0) / cluster.length;
			const avgY = cluster.reduce((s, p) => s + p.y, 0) / cluster.length;
			regions.push({
				id: `zoom-auto-${++idCounter}`,
				startMs: Math.max(0, cluster[0].t - 200),
				endMs: cluster[cluster.length - 1].t + 500,
				depth: cfg.defaultDepth,
				focus: {
					cx: (avgX - captureRect.x) / captureRect.width,
					cy: (avgY - captureRect.y) / captureRect.height,
				},
				auto: true,
			});
		}
	}

	// Phase 2: Dwell detection
	let dwellStart = 0;
	let dwellCenterX = points[0].x;
	let dwellCenterY = points[0].y;

	for (let i = 1; i < points.length; i++) {
		const dx = points[i].x - dwellCenterX;
		const dy = points[i].y - dwellCenterY;
		if (Math.sqrt(dx * dx + dy * dy) > cfg.dwellRadiusPx) {
			const dwellDuration = points[i - 1].t - points[dwellStart].t;
			if (dwellDuration >= cfg.minDwellMs) {
				regions.push({
					id: `zoom-auto-${++idCounter}`,
					startMs: Math.max(0, points[dwellStart].t - 200),
					endMs: points[i - 1].t + 300,
					depth: cfg.defaultDepth,
					focus: {
						cx: (dwellCenterX - captureRect.x) / captureRect.width,
						cy: (dwellCenterY - captureRect.y) / captureRect.height,
					},
					auto: true,
				});
			}
			dwellStart = i;
			dwellCenterX = points[i].x;
			dwellCenterY = points[i].y;
		}
	}

	// Final dwell
	if (points.length > 1) {
		const finalDuration = points[points.length - 1].t - points[dwellStart].t;
		if (finalDuration >= cfg.minDwellMs) {
			regions.push({
				id: `zoom-auto-${++idCounter}`,
				startMs: Math.max(0, points[dwellStart].t - 200),
				endMs: points[points.length - 1].t + 300,
				depth: cfg.defaultDepth,
				focus: {
					cx: (dwellCenterX - captureRect.x) / captureRect.width,
					cy: (dwellCenterY - captureRect.y) / captureRect.height,
				},
				auto: true,
			});
		}
	}

	// Phase 3: Merge & enforce gap
	const merged = mergeOverlappingRegions(regions);
	const result: ZoomRegion[] = [];
	for (const region of merged) {
		if (
			result.length === 0 ||
			region.startMs - result[result.length - 1].endMs >= cfg.minGapMs
		) {
			result.push(region);
		}
	}
	return result;
}

// ── Spring smoothing ────────────────────────────────────────────────

export interface SpringState {
	value: number;
	velocity: number;
	initialized: boolean;
}

export interface SpringConfig {
	stiffness: number;
	damping: number;
	mass: number;
}

export function getCursorSpringConfig(smoothingFactor: number): SpringConfig {
	const clamped = Math.max(0, Math.min(2, smoothingFactor));
	const stiffness = 1000 - clamped * 420;
	const damping = 2 * Math.sqrt(stiffness);
	return { stiffness, damping, mass: 1 };
}

export function stepSpring(
	state: SpringState,
	target: number,
	config: SpringConfig,
	dt: number
): SpringState {
	if (!state.initialized) {
		return { value: target, velocity: 0, initialized: true };
	}
	const displacement = state.value - target;
	const springForce = -config.stiffness * displacement;
	const dampingForce = -config.damping * state.velocity;
	const acceleration = (springForce + dampingForce) / config.mass;
	const newVelocity = state.velocity + acceleration * dt;
	const newValue = state.value + newVelocity * dt;
	return { value: newValue, velocity: newVelocity, initialized: true };
}

export function createSpringState(): SpringState {
	return { value: 0, velocity: 0, initialized: false };
}

// ── Cursor sway ─────────────────────────────────────────────────────

const MAX_ROTATION = Math.PI / 18;
const SPEED_REFERENCE = 1400;
const VERTICAL_WEIGHT = 0.65;
const INTENSITY_SCALE = 3;

export function computeCursorSwayRotation({
	dx,
	dy,
	deltaMs,
	sway,
}: {
	dx: number;
	dy: number;
	deltaMs: number;
	sway: number;
}): number {
	if (sway <= 0) return 0;
	const distance = Math.hypot(dx, dy);
	if (!Number.isFinite(distance) || distance < 0.01) return 0;
	const clampedDelta = Math.max(1, Math.min(200, deltaMs));
	const speedPxPerSec = distance / (clampedDelta / 1000);
	const speedFactor = Math.max(0, Math.min(1, speedPxPerSec / SPEED_REFERENCE));
	if (speedFactor <= 0) return 0;
	const directionalBias = Math.max(
		-1,
		Math.min(1, (dx + dy * VERTICAL_WEIGHT) / distance)
	);
	return directionalBias * speedFactor * MAX_ROTATION * sway * INTENSITY_SCALE;
}
