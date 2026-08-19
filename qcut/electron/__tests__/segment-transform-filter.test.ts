// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	buildSegmentTransformFilter,
	isIdentitySegmentTransform,
	type SegmentTransform,
} from "../ffmpeg/segment-transform-filter.js";

const IDENTITY: SegmentTransform = {
	x: 0,
	y: 0,
	rotationDegrees: 0,
	scaleX: 1,
	scaleY: 1,
	opacity: 1,
};

describe("buildSegmentTransformFilter", () => {
	it("returns an empty chain for the identity transform", () => {
		expect(isIdentitySegmentTransform({ transform: IDENTITY })).toBe(true);
		expect(
			buildSegmentTransformFilter({
				transform: IDENTITY,
				width: 640,
				height: 360,
			})
		).toBe("");
	});

	it("rotates on a diagonal canvas and crops back to center", () => {
		const chain = buildSegmentTransformFilter({
			transform: { ...IDENTITY, rotationDegrees: -30 },
			width: 640,
			height: 360,
		});
		// hypot(640, 360) = 734.3 → 735 square canvas.
		expect(chain).toBe(
			`rotate=${((-30 * Math.PI) / 180).toFixed(8)}:ow=735:oh=735:c=black,crop=640:360:47.5:187.5`
		);
	});

	it("scales around center via resize plus centered crop", () => {
		const chain = buildSegmentTransformFilter({
			transform: { ...IDENTITY, scaleX: 0.5, scaleY: 0.5 },
			width: 640,
			height: 360,
		});
		// Half-size content pads back out to the canvas, already centered.
		expect(chain).toBe(
			"scale=320:180,pad=640:360:(ow-iw)/2:(oh-ih)/2:color=black"
		);
	});

	it("translates by shifting the crop window against the offset", () => {
		const chain = buildSegmentTransformFilter({
			transform: { ...IDENTITY, x: 80 },
			width: 640,
			height: 360,
		});
		expect(chain).toBe(
			"pad=800:360:(ow-iw)/2:(oh-ih)/2:color=black,crop=640:360:0:0"
		);
	});

	it("premultiplies opacity against the black canvas", () => {
		const chain = buildSegmentTransformFilter({
			transform: { ...IDENTITY, opacity: 0.5 },
			width: 640,
			height: 360,
		});
		expect(chain).toBe("colorchannelmixer=rr=0.5:gg=0.5:bb=0.5");
	});
});
