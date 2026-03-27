import { describe, it, expect } from "vitest";
import {
	analyzeForZoomSuggestions,
	DEFAULT_AUTO_ZOOM_CONFIG,
} from "../auto-zoom-analyzer";
import type { CursorTelemetryData } from "@/types/electron/cursor-telemetry";

function makeTelemetry(
	points: CursorTelemetryData["points"]
): CursorTelemetryData {
	return {
		version: 1,
		captureRect: { x: 0, y: 0, width: 1920, height: 1080 },
		points,
	};
}

describe("auto-zoom-analyzer", () => {
	describe("analyzeForZoomSuggestions", () => {
		it("returns empty for too few points", () => {
			const telemetry = makeTelemetry([
				{ t: 0, x: 100, y: 100, p: false },
				{ t: 100, x: 110, y: 110, p: false },
			]);
			expect(analyzeForZoomSuggestions(telemetry)).toEqual([]);
		});

		it("detects click clusters", () => {
			// Two clicks close in time and space
			const points = [];
			for (let i = 0; i < 20; i++) {
				points.push({ t: i * 50, x: 500, y: 500, p: false });
			}
			// Add click cluster at 500,500
			points.push({ t: 1000, x: 500, y: 500, p: true });
			points.push({ t: 1016, x: 500, y: 500, p: false });
			points.push({ t: 1500, x: 510, y: 510, p: true });
			points.push({ t: 1516, x: 510, y: 510, p: false });
			// Pad with more points
			for (let i = 0; i < 20; i++) {
				points.push({ t: 2000 + i * 50, x: 500, y: 500, p: false });
			}

			const telemetry = makeTelemetry(points);
			const regions = analyzeForZoomSuggestions(telemetry);

			expect(regions.length).toBeGreaterThan(0);
			// Region should be centered around the click area
			const region = regions[0];
			expect(region.focus.cx).toBeCloseTo(500 / 1920, 1);
			expect(region.auto).toBe(true);
		});

		it("detects dwell periods", () => {
			const points = [];
			// Cursor stays at (300, 300) for 2 seconds
			for (let i = 0; i < 125; i++) {
				points.push({ t: i * 16, x: 300, y: 300, p: false });
			}
			// Then moves far away
			for (let i = 0; i < 20; i++) {
				points.push({ t: 2000 + i * 16, x: 1500, y: 800, p: false });
			}

			const telemetry = makeTelemetry(points);
			const regions = analyzeForZoomSuggestions(telemetry);

			expect(regions.length).toBeGreaterThan(0);
		});

		it("respects minGapMs — skips regions too close together", () => {
			const points = [];
			// First dwell at (100, 100)
			for (let i = 0; i < 60; i++) {
				points.push({ t: i * 16, x: 100, y: 100, p: false });
			}
			// Quick move to (1800, 900)
			points.push({ t: 960, x: 1800, y: 900, p: false });
			// Second dwell at (1800, 900) — starts 960ms into recording (gap < 1000ms)
			for (let i = 0; i < 60; i++) {
				points.push({ t: 976 + i * 16, x: 1800, y: 900, p: false });
			}

			const telemetry = makeTelemetry(points);
			const regions = analyzeForZoomSuggestions(telemetry, {
				minGapMs: 1000,
			});

			// Second region should be dropped because gap is too small
			expect(regions.length).toBeLessThanOrEqual(1);
		});

		it("uses custom config overrides", () => {
			const points = [];
			// Single click (not enough for default minClickCluster=2)
			for (let i = 0; i < 20; i++) {
				points.push({ t: i * 50, x: 500, y: 500, p: false });
			}
			points.push({ t: 1000, x: 500, y: 500, p: true });
			points.push({ t: 1016, x: 500, y: 500, p: false });
			for (let i = 0; i < 20; i++) {
				points.push({ t: 1100 + i * 50, x: 500 + i * 50, y: 500, p: false });
			}

			const telemetry = makeTelemetry(points);

			// With minClickCluster=1, single click should create region
			const regions = analyzeForZoomSuggestions(telemetry, {
				minClickCluster: 1,
			});

			expect(regions.length).toBeGreaterThanOrEqual(1);
		});

		it("merges overlapping click and dwell regions", () => {
			const points = [];
			// Dwell at (500, 500) with clicks — deterministic small offsets
			for (let i = 0; i < 100; i++) {
				const t = i * 16;
				const isClick = i === 30 || i === 50;
				// Deterministic jitter: sine/cosine based on index
				const offsetX = Math.sin(i * 0.7) * 10;
				const offsetY = Math.cos(i * 0.7) * 10;
				points.push({
					t,
					x: 500 + offsetX,
					y: 500 + offsetY,
					p: isClick,
				});
			}
			// Move away
			for (let i = 0; i < 20; i++) {
				points.push({ t: 1600 + i * 16, x: 1500, y: 800, p: false });
			}

			const telemetry = makeTelemetry(points);
			const regions = analyzeForZoomSuggestions(telemetry);

			// Should produce merged regions, not duplicates
			for (let i = 1; i < regions.length; i++) {
				expect(regions[i].startMs).toBeGreaterThan(regions[i - 1].endMs);
			}
		});

		it("sets depth from default config", () => {
			const points = [];
			for (let i = 0; i < 125; i++) {
				points.push({ t: i * 16, x: 300, y: 300, p: false });
			}
			for (let i = 0; i < 20; i++) {
				points.push({ t: 2000 + i * 16, x: 1500, y: 800, p: false });
			}

			const telemetry = makeTelemetry(points);
			const regions = analyzeForZoomSuggestions(telemetry);

			expect(regions.length).toBeGreaterThan(0);
			expect(regions[0].depth).toBe(DEFAULT_AUTO_ZOOM_CONFIG.defaultDepth);
		});

		it("normalizes focus coordinates to [0,1]", () => {
			const points = [];
			for (let i = 0; i < 125; i++) {
				points.push({ t: i * 16, x: 960, y: 540, p: false });
			}
			for (let i = 0; i < 20; i++) {
				points.push({ t: 2000 + i * 16, x: 1800, y: 1000, p: false });
			}

			const telemetry = makeTelemetry(points);
			const regions = analyzeForZoomSuggestions(telemetry);

			for (const region of regions) {
				expect(region.focus.cx).toBeGreaterThanOrEqual(0);
				expect(region.focus.cx).toBeLessThanOrEqual(1);
				expect(region.focus.cy).toBeGreaterThanOrEqual(0);
				expect(region.focus.cy).toBeLessThanOrEqual(1);
			}
		});
	});
});
