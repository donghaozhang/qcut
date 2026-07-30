import { describe, expect, it } from "vitest";
import { resolveTextPreviewDomGeometry } from "../text-preview-dom-geometry";

describe("resolveTextPreviewDomGeometry", () => {
	it("keeps centering outside the scaled text content", () => {
		const geometry = resolveTextPreviewDomGeometry({
			boxWidth: 820,
			boxHeight: 180,
			previewScale: 0.5,
			rotation: 12,
		});

		expect(geometry.frame).toEqual({
			width: 410,
			height: 90,
			transform: "translate(-50%, -50%) rotate(12deg)",
		});
		expect(geometry.content).toEqual({
			width: 820,
			height: 180,
			flexShrink: 0,
			transform: "scale(0.5)",
			transformOrigin: "top left",
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
		expect(geometry.content.transform).toBe("scale(1)");
	});
});
