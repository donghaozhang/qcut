// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	buildAtempoChain,
	buildLinearTrackExpression,
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

describe("buildLinearTrackExpression", () => {
	it("builds the piecewise-linear expression with escaped commas", () => {
		const expression = buildLinearTrackExpression({
			keyframes: [
				{ timeSeconds: 0, value: 0 },
				{ timeSeconds: 2, value: 80 },
			],
		});
		expect(expression).toBe(
			"lt(t\\,0)*(0)+gte(t\\,2)*(80)+gte(t\\,0)*lt(t\\,2)*(0+40*(t-0))"
		);
	});

	it("samples the timeline clock at t over the playback rate", () => {
		const expression = buildLinearTrackExpression({
			keyframes: [
				{ timeSeconds: 0, value: 0 },
				{ timeSeconds: 1, value: 10 },
			],
			playbackRate: 2,
		});
		expect(expression).toBe(
			"lt((t/2)\\,0)*(0)+gte((t/2)\\,1)*(10)+gte((t/2)\\,0)*lt((t/2)\\,1)*(0+10*((t/2)-0))"
		);
	});
});

describe("animated position crops", () => {
	it("pads to the animation extent and crops with a time expression", () => {
		const chain = buildSegmentTransformFilter({
			transform: {
				...IDENTITY,
				x: 80,
				xKeyframes: [
					{ timeSeconds: 0, value: 0 },
					{ timeSeconds: 2, value: 80 },
				],
			},
			width: 640,
			height: 360,
		});
		expect(chain).toBe(
			"pad=800:360:(ow-iw)/2:(oh-ih)/2:color=black," +
				"crop=640:360:(800-640)/2-(lt(t\\,0)*(0)+gte(t\\,2)*(80)+gte(t\\,0)*lt(t\\,2)*(0+40*(t-0))):0"
		);
	});
});

describe("buildAtempoChain", () => {
	it("returns null at rate 1", () => {
		expect(buildAtempoChain({ rate: 1 })).toBeNull();
	});

	it("passes in-range rates through as one stage", () => {
		expect(buildAtempoChain({ rate: 2 })).toBe("atempo=2");
		expect(buildAtempoChain({ rate: 0.5 })).toBe("atempo=0.5");
	});

	it("chains stages for rates outside [0.5, 2]", () => {
		expect(buildAtempoChain({ rate: 5 })).toBe("atempo=2,atempo=2,atempo=1.25");
		expect(buildAtempoChain({ rate: 0.2 })).toBe(
			"atempo=0.5,atempo=0.5,atempo=0.8"
		);
	});
});
