import type { CursorTelemetryData } from "@/types/electron/cursor-telemetry";
import { mergeOverlappingRegions, type ZoomRegion } from "./zoom-region-utils";

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
function nextId(): string {
	return `zoom-auto-${++idCounter}`;
}

/**
 * Analyze cursor telemetry to generate auto-zoom suggestions.
 *
 * Algorithm:
 * 1. Find click clusters (groups of clicks close in time and space)
 * 2. Find dwell periods (cursor stays in small area for extended time)
 * 3. Generate zoom regions centered on these activity areas
 * 4. Merge overlapping regions
 * 5. Enforce minimum gap between regions
 */
export function analyzeForZoomSuggestions(
	telemetry: CursorTelemetryData,
	config: Partial<AutoZoomConfig> = {}
): ZoomRegion[] {
	const cfg = { ...DEFAULT_AUTO_ZOOM_CONFIG, ...config };
	const { points, captureRect } = telemetry;
	if (points.length < 10) return [];

	const regions: ZoomRegion[] = [];

	// Phase 1: Click clustering
	const clickPoints = points.filter((p) => p.p);
	const usedClicks = new Set<number>();

	for (let i = 0; i < clickPoints.length; i++) {
		if (usedClicks.has(i)) continue;

		const cluster = [clickPoints[i]];
		usedClicks.add(i);

		for (let j = i + 1; j < clickPoints.length; j++) {
			if (usedClicks.has(j)) continue;
			const dt = clickPoints[j].t - clickPoints[i].t;
			if (dt > cfg.clickClusterTimeMs) break;

			const dx = clickPoints[j].x - clickPoints[i].x;
			const dy = clickPoints[j].y - clickPoints[i].y;
			const dist = Math.sqrt(dx * dx + dy * dy);

			if (dist <= cfg.dwellRadiusPx) {
				cluster.push(clickPoints[j]);
				usedClicks.add(j);
			}
		}

		if (cluster.length >= cfg.minClickCluster) {
			const avgX =
				cluster.reduce((s, p) => s + p.x, 0) / cluster.length;
			const avgY =
				cluster.reduce((s, p) => s + p.y, 0) / cluster.length;
			const startMs = cluster[0].t - 200; // Lead-in
			const endMs = cluster[cluster.length - 1].t + 500; // Trail

			regions.push({
				id: nextId(),
				startMs: Math.max(0, startMs),
				endMs,
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
		const dist = Math.sqrt(dx * dx + dy * dy);

		if (dist > cfg.dwellRadiusPx) {
			// Check if the dwell period was long enough
			const dwellDuration = points[i - 1].t - points[dwellStart].t;
			if (dwellDuration >= cfg.minDwellMs) {
				const cx =
					(dwellCenterX - captureRect.x) / captureRect.width;
				const cy =
					(dwellCenterY - captureRect.y) / captureRect.height;

				regions.push({
					id: nextId(),
					startMs: Math.max(0, points[dwellStart].t - 200),
					endMs: points[i - 1].t + 300,
					depth: cfg.defaultDepth,
					focus: { cx, cy },
					auto: true,
				});
			}

			// Reset dwell tracking
			dwellStart = i;
			dwellCenterX = points[i].x;
			dwellCenterY = points[i].y;
		}
	}

	// Check final dwell period
	if (points.length > 1) {
		const finalDuration =
			points[points.length - 1].t - points[dwellStart].t;
		if (finalDuration >= cfg.minDwellMs) {
			const cx = (dwellCenterX - captureRect.x) / captureRect.width;
			const cy = (dwellCenterY - captureRect.y) / captureRect.height;
			regions.push({
				id: nextId(),
				startMs: Math.max(0, points[dwellStart].t - 200),
				endMs: points[points.length - 1].t + 300,
				depth: cfg.defaultDepth,
				focus: { cx, cy },
				auto: true,
			});
		}
	}

	// Phase 3: Merge overlapping
	const merged = mergeOverlappingRegions(regions);

	// Phase 4: Enforce minimum gap
	const result: ZoomRegion[] = [];
	for (const region of merged) {
		if (result.length === 0) {
			result.push(region);
			continue;
		}
		const prev = result[result.length - 1];
		if (region.startMs - prev.endMs >= cfg.minGapMs) {
			result.push(region);
		}
		// Skip regions too close to previous
	}

	return result;
}
