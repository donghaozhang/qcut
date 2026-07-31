import { describe, expect, it } from "vitest";
import { resolveTextPreviewDomGeometry } from "../text-preview-dom-geometry";

describe("resolveTextPreviewDomGeometry", () => {
	it("resolves the frame and content directly in preview pixels", () => {
		const geometry = resolveTextPreviewDomGeometry({
			boxWidth: 820,
			boxHeight: 180,
			previewScale: 0.5,
			rotation: 12,
		});

		expect(geometry.scale).toBe(0.5);
		expect(geometry.frame).toEqual({
			width: 410,
			height: 90,
			transform: "translate(-50%, -50%) rotate(12deg)",
		});
		expect(geometry.content).toEqual({
			width: 410,
			height: 90,
			flexShrink: 0,
		});
	});

	it("falls back to an unscaled box before preview dimensions are ready", () => {
		const geometry = resolveTextPreviewDomGeometry({
			boxWidth: 640,
			boxHeight: 180,
			previewScale: 0,
			rotation: 0,
		});

		expect(geometry.frame.width).toBe(640);
		expect(geometry.frame.height).toBe(180);
		expect(geometry.content.width).toBe(640);
		expect(geometry.content.height).toBe(180);
		expect(geometry.scale).toBe(1);
	});

	it("keeps a Chinese title frame and content aligned at editor scale", () => {
		const geometry = resolveTextPreviewDomGeometry({
			boxWidth: 518,
			boxHeight: 123,
			previewScale: 928 / 1920,
			rotation: 0,
		});

		expect(geometry.frame.width).toBeCloseTo(250.37, 2);
		expect(geometry.frame.height).toBeCloseTo(59.45, 2);
		expect(geometry.content.width).toBe(geometry.frame.width);
		expect(geometry.content.height).toBe(geometry.frame.height);
	});
});
