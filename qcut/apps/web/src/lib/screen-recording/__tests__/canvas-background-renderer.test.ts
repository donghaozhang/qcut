import { describe, it, expect, vi, beforeEach } from "vitest";
import { drawBackground } from "../canvas-background-renderer";
import type { BackgroundConfig } from "../wallpapers";

function createMockCtx() {
	const mockCanvas = {
		width: 1920,
		height: 1080,
	};
	return {
		fillRect: vi.fn(),
		drawImage: vi.fn(),
		createLinearGradient: vi.fn(() => ({
			addColorStop: vi.fn(),
		})),
		fillStyle: "",
		filter: "none",
		canvas: mockCanvas,
	} as unknown as CanvasRenderingContext2D;
}

function makeConfig(
	overrides: Partial<BackgroundConfig> = {}
): BackgroundConfig {
	return {
		type: "none",
		padding: 40,
		borderRadius: 12,
		shadow: true,
		...overrides,
	};
}

describe("canvas-background-renderer", () => {
	describe("drawBackground", () => {
		it("draws gradient background", () => {
			const ctx = createMockCtx();
			drawBackground(
				ctx,
				makeConfig({ type: "gradient", gradientId: "sunset" }),
				1920,
				1080
			);
			expect(ctx.createLinearGradient).toHaveBeenCalled();
			expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 1920, 1080);
		});

		it("draws solid background", () => {
			const ctx = createMockCtx();
			drawBackground(
				ctx,
				makeConfig({ type: "solid", solidColor: "#ff0000" }),
				1920,
				1080
			);
			expect(ctx.fillStyle).toBe("#ff0000");
			expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 1920, 1080);
		});

		it("does nothing for type=none", () => {
			const ctx = createMockCtx();
			drawBackground(ctx, makeConfig({ type: "none" }), 1920, 1080);
			expect(ctx.fillRect).not.toHaveBeenCalled();
		});

		it("falls back to dark fill when wallpaper image not loaded", () => {
			const ctx = createMockCtx();
			drawBackground(
				ctx,
				makeConfig({ type: "wallpaper", wallpaperPath: "/fake/path.png" }),
				1920,
				1080
			);
			// Image won't be loaded in test env, should fall back
			expect(ctx.fillRect).toHaveBeenCalled();
		});

		it("applies background blur when configured", () => {
			const ctx = createMockCtx();
			drawBackground(
				ctx,
				makeConfig({ type: "solid", solidColor: "#000", backgroundBlur: 5 }),
				1920,
				1080
			);
			// After drawing solid, should apply blur filter and draw canvas onto itself
			expect(ctx.drawImage).toHaveBeenCalled();
			// Filter should be reset to none
			expect(ctx.filter).toBe("none");
		});

		it("does not apply blur when backgroundBlur is 0", () => {
			const ctx = createMockCtx();
			drawBackground(
				ctx,
				makeConfig({ type: "solid", solidColor: "#000", backgroundBlur: 0 }),
				1920,
				1080
			);
			expect(ctx.drawImage).not.toHaveBeenCalled();
		});

		it("does not apply blur when backgroundBlur is undefined", () => {
			const ctx = createMockCtx();
			drawBackground(
				ctx,
				makeConfig({ type: "solid", solidColor: "#000" }),
				1920,
				1080
			);
			expect(ctx.drawImage).not.toHaveBeenCalled();
		});
	});
});
