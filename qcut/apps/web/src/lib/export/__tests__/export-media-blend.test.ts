import { describe, expect, it, vi } from "vitest";
import {
	canvasCompositeForBlendMode,
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

function createContext() {
	const state = { globalAlpha: 1, globalCompositeOperation: "source-over" };
	const ctx = {
		save: vi.fn(),
		restore: vi.fn(),
		translate: vi.fn(),
		rotate: vi.fn(),
		scale: vi.fn(),
		get globalAlpha() {
			return state.globalAlpha;
		},
		set globalAlpha(value: number) {
			state.globalAlpha = value;
		},
		get globalCompositeOperation() {
			return state.globalCompositeOperation;
		},
		set globalCompositeOperation(value: string) {
			state.globalCompositeOperation = value;
		},
	};
	return { ctx: ctx as unknown as CanvasRenderingContext2D, state };
}

const BOUNDS = { x: 0, y: 0, width: 1920, height: 1080 };

describe("media blend mode in canvas export", () => {
	it("maps every editor blend mode onto the same-named canvas operation", () => {
		expect(
			canvasCompositeForBlendMode({ blendMode: undefined })
		).toBeUndefined();
		expect(
			canvasCompositeForBlendMode({ blendMode: "normal" })
		).toBeUndefined();
		for (const mode of [
			"multiply",
			"screen",
			"overlay",
			"darken",
			"lighten",
		] as const) {
			expect(canvasCompositeForBlendMode({ blendMode: mode })).toBe(mode);
		}
	});

	it("keeps 'normal' on the byte-stable identity fast path", () => {
		expect(
			isIdentityMediaTransform({ visual: { ...IDENTITY, blendMode: "normal" } })
		).toBe(true);
		expect(
			isIdentityMediaTransform({
				visual: { ...IDENTITY, blendMode: "multiply" },
			})
		).toBe(false);
	});

	it("draws under the blend composite and restores it afterwards", async () => {
		const { ctx, state } = createContext();
		let compositeDuringDraw = "";
		await drawWithMediaTransform({
			ctx,
			visual: { ...IDENTITY, blendMode: "screen" },
			bounds: BOUNDS,
			draw: () => {
				compositeDuringDraw = state.globalCompositeOperation;
			},
		});
		expect(compositeDuringDraw).toBe("screen");
		expect(ctx.save).toHaveBeenCalledOnce();
		expect(ctx.restore).toHaveBeenCalledOnce();
	});
});
