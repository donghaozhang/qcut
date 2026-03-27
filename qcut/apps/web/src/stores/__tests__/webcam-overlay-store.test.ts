import { describe, it, expect, beforeEach } from "vitest";
import {
	getPresetCoordinates,
	getWebcamOverlayRect,
	DEFAULT_WEBCAM_CONFIG,
	type WebcamOverlayConfig,
} from "../webcam-overlay-store";

describe("webcam-overlay-store", () => {
	describe("getPresetCoordinates", () => {
		it("returns (0,0) for top-left", () => {
			expect(getPresetCoordinates("top-left")).toEqual({ x: 0, y: 0 });
		});

		it("returns (1,1) for bottom-right", () => {
			expect(getPresetCoordinates("bottom-right")).toEqual({
				x: 1,
				y: 1,
			});
		});

		it("returns (0.5,0.5) for center", () => {
			expect(getPresetCoordinates("center")).toEqual({ x: 0.5, y: 0.5 });
		});
	});

	describe("getWebcamOverlayRect", () => {
		const baseConfig: WebcamOverlayConfig = {
			...DEFAULT_WEBCAM_CONFIG,
			enabled: true,
			size: 25,
			margin: 20,
			position: "bottom-right",
		};

		it("calculates correct size from percentage", () => {
			const rect = getWebcamOverlayRect(baseConfig, 1920, 1080);
			expect(rect.width).toBeCloseTo(480, 0); // 25% of 1920
		});

		it("enforces minimum size of 56px", () => {
			const tinyConfig = { ...baseConfig, size: 1 };
			const rect = getWebcamOverlayRect(tinyConfig, 100, 100);
			expect(rect.width).toBeGreaterThanOrEqual(56);
		});

		it("positions with margin for bottom-right", () => {
			const rect = getWebcamOverlayRect(baseConfig, 1920, 1080);
			// Should be in the bottom-right corner with margin
			expect(rect.x).toBeGreaterThan(1000);
			expect(rect.y).toBeGreaterThan(400);
		});

		it("positions at top-left with margin", () => {
			const topLeft = { ...baseConfig, position: "top-left" as const };
			const rect = getWebcamOverlayRect(topLeft, 1920, 1080);
			expect(rect.x).toBe(20); // margin
			expect(rect.y).toBe(20); // margin
		});

		it("applies zoom-reactive scaling", () => {
			const zoomConfig = { ...baseConfig, zoomReactive: true };
			const noZoom = getWebcamOverlayRect(zoomConfig, 1920, 1080, 1);
			const zoomed = getWebcamOverlayRect(zoomConfig, 1920, 1080, 2);
			expect(zoomed.width).toBeLessThan(noZoom.width);
		});

		it("does not scale when zoomReactive is false", () => {
			const rect1 = getWebcamOverlayRect(baseConfig, 1920, 1080, 1);
			const rect2 = getWebcamOverlayRect(baseConfig, 1920, 1080, 3);
			expect(rect1.width).toBe(rect2.width);
		});

		it("handles custom position coordinates", () => {
			const customPos = {
				...baseConfig,
				position: { x: 50, y: 50 } as const,
			};
			const rect = getWebcamOverlayRect(customPos, 1920, 1080);
			// Should be roughly centered
			expect(rect.x).toBeGreaterThan(500);
			expect(rect.x).toBeLessThan(1000);
		});
	});

	describe("DEFAULT_WEBCAM_CONFIG", () => {
		it("starts disabled", () => {
			expect(DEFAULT_WEBCAM_CONFIG.enabled).toBe(false);
		});

		it("has sensible defaults", () => {
			expect(DEFAULT_WEBCAM_CONFIG.position).toBe("bottom-left");
			expect(DEFAULT_WEBCAM_CONFIG.size).toBe(25);
			expect(DEFAULT_WEBCAM_CONFIG.roundness).toBe(80);
			expect(DEFAULT_WEBCAM_CONFIG.shadow).toBe(50);
			expect(DEFAULT_WEBCAM_CONFIG.opacity).toBe(1);
		});
	});
});
