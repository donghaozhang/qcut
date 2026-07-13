import { describe, expect, it } from "vitest";
import type { VideoVisual } from "../ffmpeg/types";
import { buildMaskStrokeFilterGraph } from "../ffmpeg/mask-stroke-filter";

function visual({
	style,
}: {
	style: NonNullable<NonNullable<VideoVisual["mask"]>["stroke"]>["style"];
}): VideoVisual {
	return {
		x: 0,
		y: 0,
		rotation: 0,
		scaleX: 1,
		scaleY: 1,
		flipHorizontal: false,
		flipVertical: false,
		opacity: 1,
		blendMode: "normal",
		fitMode: "cover",
		crop: { top: 0, right: 0, bottom: 0, left: 0 },
		perspective: {
			topLeftX: 0,
			topLeftY: 0,
			topRightX: 1,
			topRightY: 0,
			bottomRightX: 1,
			bottomRightY: 1,
			bottomLeftX: 0,
			bottomLeftY: 1,
		},
		mask: {
			type: "none",
			centerX: 0.5,
			centerY: 0.5,
			width: 1,
			height: 1,
			rotation: 0,
			feather: 0,
			invert: false,
			stroke: {
				style,
				color: "#20c7d9",
				width: 4,
				opacity: 0.75,
				glow: 12,
				offsetX: 7,
				offsetY: 5,
			},
		},
	};
}

describe("mask stroke FFmpeg graph", () => {
	it("keeps the input unchanged when no stroke is selected", () => {
		const graph = buildMaskStrokeFilterGraph({
			inputLabel: "input",
			labelPrefix: "stroke",
			visual: visual({ style: "none" }),
		});
		expect(graph).toEqual({ filterSteps: [], outputLabel: "input" });
	});

	it.each(["solid", "glow", "offset", "triple", "sketch", "dashed"] as const)(
		"builds an alpha-derived %s graph",
		(style) => {
			const graph = buildMaskStrokeFilterGraph({
				inputLabel: "input",
				labelPrefix: "stroke",
				visual: visual({ style }),
			});
			const command = graph.filterSteps.join(";");
			expect(command).toContain("alphaextract");
			expect(command).toContain("dilation=coordinates=255");
			expect(command).toContain("r='32':g='199':b='217'");
			expect(command).toContain("overlay=0:0:format=auto");
			expect(graph.outputLabel).toBe("stroke_output");
		}
	);

	it("adds blur only for glow and patterning for dashed", () => {
		const glow = buildMaskStrokeFilterGraph({
			inputLabel: "input",
			labelPrefix: "glow",
			visual: visual({ style: "glow" }),
		}).filterSteps.join(";");
		const dashed = buildMaskStrokeFilterGraph({
			inputLabel: "input",
			labelPrefix: "dashed",
			visual: visual({ style: "dashed" }),
		}).filterSteps.join(";");
		expect(glow).toContain("gblur=sigma=6");
		expect(dashed).toContain("lt(mod(X+Y");
	});
});
