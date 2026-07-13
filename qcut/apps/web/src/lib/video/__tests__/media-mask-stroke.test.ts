import { describe, expect, it } from "vitest";
import type { MediaMask } from "@/types/timeline";
import {
	activeMediaMaskStroke,
	buildMediaMaskStrokeCssFilter,
} from "../media-mask-stroke";

function mask({
	style,
	width = 6,
}: {
	style: NonNullable<MediaMask["stroke"]>["style"];
	width?: number;
}): MediaMask {
	return {
		id: "person",
		name: "Person",
		enabled: true,
		type: "person",
		blendMode: "add",
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
			width,
			opacity: 0.75,
			glow: 18,
			offsetX: 8,
			offsetY: 5,
		},
	};
}

describe("media mask stroke preview", () => {
	it("ignores disabled and zero-width strokes", () => {
		expect(
			activeMediaMaskStroke({ masks: [mask({ style: "none" })] })
		).toBeNull();
		expect(
			buildMediaMaskStrokeCssFilter({
				masks: [mask({ style: "solid", width: 0 })],
			})
		).toBe("");
	});

	it.each([
		"solid",
		"glow",
		"offset",
		"triple",
		"sketch",
		"dashed",
	] as const)("builds a visible %s filter", (style) => {
		const filter = buildMediaMaskStrokeCssFilter({ masks: [mask({ style })] });
		expect(filter).toContain("drop-shadow(");
		expect(filter).toContain("rgba(32, 199, 217, 0.75)");
	});

	it("clamps persisted values before rendering", () => {
		const configured = mask({ style: "glow", width: 100 });
		configured.stroke = {
			...configured.stroke!,
			opacity: 5,
			glow: 100,
		};
		expect(activeMediaMaskStroke({ masks: [configured] })).toMatchObject({
			width: 32,
			opacity: 1,
			glow: 64,
		});
	});
});
