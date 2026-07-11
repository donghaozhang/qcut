import { describe, expect, it } from "vitest";
import { createMediaMask } from "../media-mask-stack";
import {
	buildCombinedMediaMaskSvg,
	mediaMaskSvgDataUrl,
	mediaMaskSvgUrl,
} from "../media-mask-svg";

describe("combined media mask SVG", () => {
	it("builds ordered add, subtract, and intersect operations", () => {
		const add = createMediaMask({ id: "add", type: "ellipse", index: 0 });
		const subtract = {
			...createMediaMask({ id: "subtract", type: "rectangle", index: 1 }),
			blendMode: "subtract" as const,
			roundness: 0.4,
		};
		const intersect = {
			...createMediaMask({ id: "intersect", type: "star", index: 2 }),
			blendMode: "intersect" as const,
		};
		const svg = buildCombinedMediaMaskSvg([add, subtract, intersect]);

		expect(svg).toContain("<ellipse");
		expect(svg).toContain('rx="16"');
		expect(svg).toContain("<polygon");
		expect(svg).toContain('fill="black" mask="url(#mask-shape-1)"');
		expect(svg).toContain('<g mask="url(#mask-shape-2)">');
	});

	it("supports mirrored gradients, text, and pen paths", () => {
		const mirror = createMediaMask({ id: "mirror", type: "mirror", index: 0 });
		const text = {
			...createMediaMask({ id: "text", type: "text", index: 1 }),
			text: "A&B",
		};
		const pen = {
			...createMediaMask({ id: "pen", type: "pen", index: 2 }),
			points: [
				{ x: 0, y: 0 },
				{ x: 1, y: 0 },
				{ x: 0.5, y: 1 },
			],
		};
		const svg = buildCombinedMediaMaskSvg([mirror, text, pen]);

		expect(svg).toContain("mask-gradient-0");
		expect(svg).toContain("A&amp;B");
		expect(svg).toContain('<path d="M ');
		expect(mediaMaskSvgDataUrl([mirror])).toContain("data:image/svg+xml");
		expect(mediaMaskSvgUrl([mirror])).toMatch(/^data:image\/svg\+xml,/);
	});
});
