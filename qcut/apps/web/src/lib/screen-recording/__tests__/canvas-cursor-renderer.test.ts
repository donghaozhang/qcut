import { describe, it, expect, vi } from "vitest";
import {
	getClickAnimProgress,
	drawCursorWithMotionBlur,
} from "../canvas-cursor-renderer";
import type { CursorRenderConfig } from "../cursor-renderer";

function makeConfig(
	overrides: Partial<CursorRenderConfig> = {}
): CursorRenderConfig {
	return {
		cursorStyle: "dot",
		dotRadius: 14,
		dotColor: 0xffffff,
		dotAlpha: 0.95,
		smoothingFactor: 0.5,
		sway: 0,
		motionBlur: 0,
		clickBounce: 0.5,
		...overrides,
	} as CursorRenderConfig;
}

function createMockCtx() {
	return {
		save: vi.fn(),
		restore: vi.fn(),
		beginPath: vi.fn(),
		arc: vi.fn(),
		fill: vi.fn(),
		stroke: vi.fn(),
		translate: vi.fn(),
		rotate: vi.fn(),
		drawImage: vi.fn(),
		globalAlpha: 1,
		fillStyle: "",
		strokeStyle: "",
		lineWidth: 1,
	} as unknown as CanvasRenderingContext2D;
}

describe("canvas-cursor-renderer", () => {
	describe("drawCursorWithMotionBlur", () => {
		it("draws normally when intensity is below threshold", () => {
			const ctx = createMockCtx();
			const config = makeConfig({ motionBlur: 0.5 });
			drawCursorWithMotionBlur(ctx, 100, 100, 99, 100, config, 0, 1920);
			// Small movement = no ghosts, just one main draw
			const saveCount = (ctx.save as ReturnType<typeof vi.fn>).mock.calls
				.length;
			expect(saveCount).toBeLessThanOrEqual(2);
		});

		it("draws ghost trail when cursor moves fast", () => {
			const ctx = createMockCtx();
			const config = makeConfig({ motionBlur: 1.0 });
			drawCursorWithMotionBlur(ctx, 500, 100, 100, 100, config, 0, 1920);
			// Multiple save/restore for ghosts + main cursor
			const saveCount = (ctx.save as ReturnType<typeof vi.fn>).mock.calls
				.length;
			expect(saveCount).toBeGreaterThan(2);
		});

		it("does not draw ghosts when motionBlur is 0", () => {
			const ctx = createMockCtx();
			const config = makeConfig({ motionBlur: 0 });
			drawCursorWithMotionBlur(ctx, 500, 100, 100, 100, config, 0, 1920);
			const saveCount = (ctx.save as ReturnType<typeof vi.fn>).mock.calls
				.length;
			expect(saveCount).toBeLessThanOrEqual(2);
		});
	});

	describe("getClickAnimProgress", () => {
		it("returns 0 when no click started (clickStartMs < 0)", () => {
			expect(getClickAnimProgress(1000, -1)).toBe(0);
		});

		it("returns 0 before click start", () => {
			expect(getClickAnimProgress(500, 1000)).toBe(0);
		});

		it("returns progress during click animation", () => {
			// 75ms into 150ms animation = 0.5
			expect(getClickAnimProgress(1075, 1000)).toBeCloseTo(0.5);
		});

		it("returns 0 at click start", () => {
			expect(getClickAnimProgress(1000, 1000)).toBe(0);
		});

		it("returns 0 after animation completes", () => {
			// 150ms later = done
			expect(getClickAnimProgress(1150, 1000)).toBe(0);
		});

		it("returns value in (0,1) during animation", () => {
			for (let offset = 1; offset < 150; offset++) {
				const progress = getClickAnimProgress(1000 + offset, 1000);
				expect(progress).toBeGreaterThan(0);
				expect(progress).toBeLessThan(1);
			}
		});
	});
});
