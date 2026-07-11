import { describe, expect, it } from "vitest";
import type { MediaCustomCutout } from "@/types/timeline";
import { buildMediaMaskStyle } from "../video-animation";
import {
	activeCustomCutoutStrokes,
	appendCustomCutoutPoint,
	buildMediaCustomCutoutSvg,
	compositionPointToSourcePixel,
	customCutoutSignature,
	eraseCustomCutoutStrokes,
	normalizeMediaCustomCutout,
} from "../media-custom-cutout";

const customCutout: MediaCustomCutout = {
	enabled: true,
	applyStrokes: true,
	status: "idle",
	strokes: [
		{
			id: "foreground",
			frame: 10,
			mode: "foreground",
			size: 0.1,
			points: [
				{ x: 0.2, y: 0.2 },
				{ x: 0.4, y: 0.4 },
			],
		},
		{
			id: "background",
			frame: 20,
			mode: "background",
			size: 0.05,
			points: [{ x: 0.3, y: 0.3 }],
		},
	],
};

describe("media custom cutout", () => {
	it("normalizes persisted strokes and preserves correction metadata", () => {
		const normalized = normalizeMediaCustomCutout({
			...customCutout,
			strokes: [
				{
					...customCutout.strokes[0],
					frame: 9.6,
					size: 2,
					points: [{ x: -1, y: 4 }],
				},
			],
		});
		expect(normalized.strokes[0]).toMatchObject({
			frame: 10,
			size: 0.25,
			points: [{ x: 0, y: 1 }],
		});
	});

	it("uses the first correction from clip start and accumulates later corrections", () => {
		expect(
			activeCustomCutoutStrokes({ customCutout, currentFrame: 0 }).map(
				(stroke) => stroke.id
			)
		).toEqual(["foreground"]);
		expect(
			activeCustomCutoutStrokes({ customCutout, currentFrame: 25 }).map(
				(stroke) => stroke.id
			)
		).toEqual(["foreground", "background"]);
	});

	it("renders foreground and background brush strokes into a matte", () => {
		const svg = buildMediaCustomCutoutSvg({
			customCutout,
			currentFrame: 25,
		});
		expect(svg).toContain('fill="black"');
		expect(svg).toContain('stroke="white"');
		expect(svg).toContain('<circle cx="30" cy="30"');
	});

	it("uses luminance mode so black SVG pixels become transparent", () => {
		const style = buildMediaMaskStyle([], customCutout, 25);
		expect(style.maskMode).toBe("luminance");
		expect(decodeURIComponent(style.maskImage ?? "")).toContain(
			"custom-cutout-mask"
		);
	});

	it("erases only strokes touched on the active correction frame", () => {
		const remaining = eraseCustomCutoutStrokes({
			strokes: customCutout.strokes,
			point: { x: 0.3, y: 0.3 },
			size: 0.08,
			frame: 20,
		});
		expect(remaining.map((stroke) => stroke.id)).toEqual(["foreground"]);
	});

	it("deduplicates dense pointer samples", () => {
		const points = appendCustomCutoutPoint({
			points: [{ x: 0.1, y: 0.1 }],
			point: { x: 0.101, y: 0.101 },
			minimumDistance: 0.01,
		});
		expect(points).toHaveLength(1);
	});

	it("maps contain and cover composition coordinates back to source pixels", () => {
		expect(
			compositionPointToSourcePixel({
				point: { x: 0.5, y: 0.5 },
				fitMode: "contain",
				sourceWidth: 1920,
				sourceHeight: 1080,
				canvasWidth: 1080,
				canvasHeight: 1080,
			})
		).toEqual({ x: 960, y: 540 });
		expect(
			compositionPointToSourcePixel({
				point: { x: 0.5, y: 0.05 },
				fitMode: "contain",
				sourceWidth: 1920,
				sourceHeight: 1080,
				canvasWidth: 1080,
				canvasHeight: 1080,
			})
		).toBeNull();
	});

	it("produces a stable generation signature", () => {
		expect(customCutoutSignature({ customCutout })).toBe(
			customCutoutSignature({ customCutout: structuredClone(customCutout) })
		);
	});
});
