import { describe, expect, it, vi } from "vitest";
import {
	drawWithMediaTransform,
	isIdentityMediaTransform,
	type MediaTransformVisual,
} from "../export-engine-utils";

const IDENTITY: MediaTransformVisual = {
	x: 0,
	y: 0,
	rotation: 0,
	scaleX: 1,
	scaleY: 1,
	flipHorizontal: false,
	flipVertical: false,
	opacity: 1,
};

function createRecordingContext() {
	const calls: Array<[string, ...number[]]> = [];
	const record =
		(name: string) =>
		(...args: number[]) => {
			calls.push([name, ...args]);
		};
	return {
		calls,
		ctx: {
			save: record("save"),
			restore: record("restore"),
			translate: record("translate"),
			rotate: record("rotate"),
			scale: record("scale"),
			globalAlpha: 1,
		} as unknown as CanvasRenderingContext2D,
	};
}

const BOUNDS = { x: 100, y: 50, width: 400, height: 300 };

describe("drawWithMediaTransform", () => {
	it("skips the transform entirely at identity", async () => {
		expect(isIdentityMediaTransform({ visual: IDENTITY })).toBe(true);
		const { calls, ctx } = createRecordingContext();
		const draw = vi.fn();
		await drawWithMediaTransform({
			ctx,
			visual: IDENTITY,
			bounds: BOUNDS,
			draw,
		});
		expect(draw).toHaveBeenCalledOnce();
		expect(calls).toEqual([]);
	});

	it("transforms about the bounds center with preview semantics", async () => {
		const { calls, ctx } = createRecordingContext();
		const visual: MediaTransformVisual = {
			...IDENTITY,
			x: 80,
			y: -36,
			rotation: 30,
			scaleX: 0.5,
			scaleY: 0.5,
			flipHorizontal: true,
			opacity: 0.5,
		};
		let alphaDuringDraw = Number.NaN;
		await drawWithMediaTransform({
			ctx,
			visual,
			bounds: BOUNDS,
			draw: () => {
				alphaDuringDraw = ctx.globalAlpha;
			},
		});
		// Bounds center (300, 200); moved by (80, -36); clockwise 30°; flip
		// rides the x-scale sign.
		expect(calls).toEqual([
			["save"],
			["translate", 380, 164],
			["rotate", (30 * Math.PI) / 180],
			["scale", -0.5, 0.5],
			["translate", -300, -200],
			["restore"],
		]);
		expect(alphaDuringDraw).toBe(0.5);
	});

	it("restores the context even when draw throws", async () => {
		const { calls, ctx } = createRecordingContext();
		await expect(
			drawWithMediaTransform({
				ctx,
				visual: { ...IDENTITY, rotation: 90 },
				bounds: BOUNDS,
				draw: () => {
					throw new Error("boom");
				},
			})
		).rejects.toThrow("boom");
		expect(calls.at(-1)).toEqual(["restore"]);
	});
});
