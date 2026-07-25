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

	it("anchors linear and mirror gradients to the mask geometry", () => {
		const linear = {
			...createMediaMask({ id: "linear", type: "linear", index: 0 }),
			centerX: 0.25,
			centerY: 0.6,
			rotation: 12,
			feather: 0.2,
		};
		const mirror = {
			...createMediaMask({ id: "mirror", type: "mirror", index: 1 }),
			centerX: 0.7,
			centerY: 0.4,
			width: 0.3,
			rotation: -20,
			feather: 0.1,
		};

		const svg = buildCombinedMediaMaskSvg([linear, mirror]);

		expect(svg).toContain(
			'<linearGradient id="mask-gradient-0" x1="0%" y1="0%" x2="0%" y2="100%">'
		);
		expect(svg).toContain('x="-125" y="-90" width="300" height="300"');
		expect(svg).toContain('transform="rotate(12 25 60)"');
		expect(svg).toContain(
			'<linearGradient id="mask-gradient-1" x1="0%" y1="0%" x2="100%" y2="0%">'
		);
		expect(svg).toContain('x="55" y="-110" width="30" height="300"');
		expect(svg).toContain('transform="rotate(-20 70 40)"');
	});

	it("renders directional mirror gradients", () => {
		const left = {
			...createMediaMask({ id: "mirror-left", type: "mirror", index: 0 }),
			mirrorMode: "left" as const,
			feather: 0.1,
		};
		const right = {
			...createMediaMask({ id: "mirror-right", type: "mirror", index: 0 }),
			mirrorMode: "right" as const,
			feather: 0.1,
		};

		const leftSvg = buildCombinedMediaMaskSvg([left]);
		const rightSvg = buildCombinedMediaMaskSvg([right]);

		expect(leftSvg).toContain('<stop offset="0%" stop-color="white"/>');
		expect(leftSvg).toContain('<stop offset="60%" stop-color="black"/>');
		expect(rightSvg).toContain('<stop offset="0%" stop-color="black"/>');
		expect(rightSvg).toContain('<stop offset="60%" stop-color="white"/>');
	});
});
