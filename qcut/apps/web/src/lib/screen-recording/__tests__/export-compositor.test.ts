import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	ScreenRecordingExportCompositor,
	type ExportCompositorConfig,
} from "../export-compositor";
import type { CursorTelemetryData } from "@/types/electron/cursor-telemetry";

// Mock canvas context
function createMockCtx() {
	return {
		save: vi.fn(),
		restore: vi.fn(),
		translate: vi.fn(),
		scale: vi.fn(),
		rotate: vi.fn(),
		drawImage: vi.fn(),
		beginPath: vi.fn(),
		moveTo: vi.fn(),
		lineTo: vi.fn(),
		closePath: vi.fn(),
		clip: vi.fn(),
		arc: vi.fn(),
		ellipse: vi.fn(),
		rect: vi.fn(),
		roundRect: vi.fn(),
		fill: vi.fn(),
		stroke: vi.fn(),
		fillStyle: "",
		strokeStyle: "",
		lineWidth: 1,
		lineCap: "butt",
		lineJoin: "miter",
		globalAlpha: 1,
		shadowColor: "",
		shadowBlur: 0,
		shadowOffsetX: 0,
		shadowOffsetY: 0,
	} as unknown as CanvasRenderingContext2D;
}

// Mock video frame
const mockVideoFrame = {} as CanvasImageSource;

// Basic telemetry data
const mockTelemetry: CursorTelemetryData = {
	version: 1,
	captureRect: { x: 0, y: 0, width: 1920, height: 1080 },
	points: [
		{ t: 0, x: 100, y: 100, p: false },
		{ t: 100, x: 500, y: 300, p: false },
		{ t: 200, x: 900, y: 500, p: true },
		{ t: 300, x: 900, y: 500, p: false },
	],
};

function baseConfig(): ExportCompositorConfig {
	return {
		background: {
			type: "none",
			padding: 0,
			borderRadius: 0,
			shadow: false,
		},
		cursorConfig: {
			dotRadius: 28,
			dotColor: 0xffffff,
			dotAlpha: 0.95,
			smoothingFactor: 0.18,
			motionBlur: 0,
			clickBounce: 1,
			sway: 0,
			cursorStyle: "dot",
		},
		zoomRegions: [],
		telemetry: mockTelemetry,
		outputWidth: 1920,
		outputHeight: 1080,
	};
}

// Mock the imported drawing functions
vi.mock("../canvas-background-renderer", () => ({
	drawBackground: vi.fn(),
	drawRoundedVideoFrame: vi.fn(),
}));

vi.mock("../canvas-cursor-renderer", () => ({
	drawCursor: vi.fn(),
	getClickAnimProgress: vi.fn(() => 0),
}));

vi.mock("../zoom-transform", () => ({
	computeZoomTransform: vi.fn(() => ({
		scale: 1,
		translateX: 0,
		translateY: 0,
	})),
}));

describe("ScreenRecordingExportCompositor", () => {
	let ctx: CanvasRenderingContext2D;

	beforeEach(() => {
		ctx = createMockCtx();
		vi.clearAllMocks();
	});

	describe("basic rendering", () => {
		it("renders a frame without errors", () => {
			const compositor = new ScreenRecordingExportCompositor(baseConfig());
			expect(() =>
				compositor.renderFrame(ctx, mockVideoFrame, 100),
			).not.toThrow();
			compositor.destroy();
		});

		it("draws video frame on canvas", () => {
			const compositor = new ScreenRecordingExportCompositor(baseConfig());
			compositor.renderFrame(ctx, mockVideoFrame, 100);
			expect(ctx.drawImage).toHaveBeenCalled();
			compositor.destroy();
		});
	});

	describe("cursor sway", () => {
		it("passes swayRotation to drawCursor when sway > 0", async () => {
			const { drawCursor } = await import("../canvas-cursor-renderer");
			const config = baseConfig();
			config.cursorConfig.sway = 1.5;

			const compositor = new ScreenRecordingExportCompositor(config);
			// Render multiple frames so spring has velocity
			compositor.renderFrame(ctx, mockVideoFrame, 0);
			compositor.renderFrame(ctx, mockVideoFrame, 16);
			compositor.renderFrame(ctx, mockVideoFrame, 32);

			// drawCursor should be called with 7 args (including swayRotation)
			expect(drawCursor).toHaveBeenCalled();
			const lastCall = (drawCursor as ReturnType<typeof vi.fn>).mock
				.calls.at(-1);
			expect(lastCall).toHaveLength(7);

			compositor.destroy();
		});

		it("passes 0 swayRotation when sway is disabled", async () => {
			const { drawCursor } = await import("../canvas-cursor-renderer");
			const config = baseConfig();
			config.cursorConfig.sway = 0;

			const compositor = new ScreenRecordingExportCompositor(config);
			compositor.renderFrame(ctx, mockVideoFrame, 0);
			compositor.renderFrame(ctx, mockVideoFrame, 16);

			const lastCall = (drawCursor as ReturnType<typeof vi.fn>).mock
				.calls.at(-1);
			// 7th arg (swayRotation) should be 0
			expect(lastCall?.[6]).toBe(0);

			compositor.destroy();
		});
	});

	describe("cursor loop mode", () => {
		it("processes telemetry when cursorLoopMode is enabled", () => {
			const config = baseConfig();
			config.cursorLoopMode = true;
			config.totalDurationMs = 1000;

			const compositor = new ScreenRecordingExportCompositor(config);
			// Should not throw — loop processing happens in constructor
			compositor.renderFrame(ctx, mockVideoFrame, 0);
			compositor.destroy();
		});

		it("does not process telemetry when cursorLoopMode is disabled", () => {
			const config = baseConfig();
			config.cursorLoopMode = false;

			const compositor = new ScreenRecordingExportCompositor(config);
			compositor.renderFrame(ctx, mockVideoFrame, 100);
			compositor.destroy();
		});
	});

	describe("speed regions", () => {
		it("remaps time when speed regions are provided", async () => {
			const { computeZoomTransform } = await import("../zoom-transform");
			const config = baseConfig();
			config.speedRegions = [
				{ id: "s1", startMs: 100, endMs: 300, speed: 2 },
			];

			const compositor = new ScreenRecordingExportCompositor(config);
			compositor.renderFrame(ctx, mockVideoFrame, 200);

			// computeZoomTransform should be called with remapped time
			// At output time 200ms with 2x speed region starting at 100:
			// 100ms normal + (200-100)*2 = 100 + 200 = 300ms source time
			expect(computeZoomTransform).toHaveBeenCalled();
			const callArgs = (
				computeZoomTransform as ReturnType<typeof vi.fn>
			).mock.calls.at(-1);
			// Source time should differ from output time due to speed remapping
			expect(callArgs?.[0]).not.toBe(200);

			compositor.destroy();
		});

		it("passes through time with no speed regions", async () => {
			const { computeZoomTransform } = await import("../zoom-transform");
			const config = baseConfig();

			const compositor = new ScreenRecordingExportCompositor(config);
			compositor.renderFrame(ctx, mockVideoFrame, 200);

			const callArgs = (
				computeZoomTransform as ReturnType<typeof vi.fn>
			).mock.calls.at(-1);
			expect(callArgs?.[0]).toBe(200);

			compositor.destroy();
		});
	});

	describe("webcam overlay", () => {
		it("does not render webcam when disabled", () => {
			const config = baseConfig();
			config.webcamConfig = {
				enabled: false,
				position: "bottom-left",
				size: 25,
				mirror: false,
				roundness: 80,
				shadow: 50,
				margin: 20,
				zoomReactive: false,
				opacity: 1,
				deviceId: null,
			};

			const compositor = new ScreenRecordingExportCompositor(config);
			compositor.renderFrame(ctx, mockVideoFrame, 100);

			// drawImage should only be called once (for video frame, not webcam)
			expect(ctx.drawImage).toHaveBeenCalledTimes(1);
			compositor.destroy();
		});

		it("does not render webcam when no video element", () => {
			const config = baseConfig();
			config.webcamConfig = {
				enabled: true,
				position: "bottom-left",
				size: 25,
				mirror: false,
				roundness: 80,
				shadow: 50,
				margin: 20,
				zoomReactive: false,
				opacity: 1,
				deviceId: null,
			};
			// webcamVideo is undefined

			const compositor = new ScreenRecordingExportCompositor(config);
			compositor.renderFrame(ctx, mockVideoFrame, 100);

			expect(ctx.drawImage).toHaveBeenCalledTimes(1);
			compositor.destroy();
		});
	});

	describe("figure annotations", () => {
		it("renders annotations within their time range", () => {
			const config = baseConfig();
			config.telemetry = null; // No cursor to simplify
			config.figureAnnotations = [
				{
					id: "fig1",
					type: "arrow",
					arrowDirection: "right",
					x: 10,
					y: 20,
					width: 30,
					height: 30,
					rotation: 0,
					strokeColor: "#ff0000",
					strokeWidth: 3,
					opacity: 1,
					startMs: 50,
					endMs: 250,
					zIndex: 1,
				},
			];

			const compositor = new ScreenRecordingExportCompositor(config);

			// At t=100 (inside range) — should save/restore for annotation
			compositor.renderFrame(ctx, mockVideoFrame, 100);
			// save is called for zoom context + annotation
			const saveCount100 = (ctx.save as ReturnType<typeof vi.fn>).mock
				.calls.length;

			vi.clearAllMocks();

			// At t=300 (outside range) — should not render annotation
			compositor.renderFrame(ctx, mockVideoFrame, 300);
			const saveCount300 = (ctx.save as ReturnType<typeof vi.fn>).mock
				.calls.length;

			// Fewer save calls when annotation is not visible
			expect(saveCount300).toBeLessThan(saveCount100);

			compositor.destroy();
		});

		it("handles empty annotations array", () => {
			const config = baseConfig();
			config.figureAnnotations = [];

			const compositor = new ScreenRecordingExportCompositor(config);
			expect(() =>
				compositor.renderFrame(ctx, mockVideoFrame, 100),
			).not.toThrow();
			compositor.destroy();
		});
	});

	describe("ExportCompositorConfig", () => {
		it("accepts all new optional fields", () => {
			const config: ExportCompositorConfig = {
				...baseConfig(),
				cursorLoopMode: true,
				totalDurationMs: 5000,
				speedRegions: [
					{ id: "s1", startMs: 0, endMs: 1000, speed: 2 },
				],
				webcamConfig: {
					enabled: false,
					position: "bottom-right",
					size: 20,
					mirror: true,
					roundness: 40,
					shadow: 30,
					margin: 10,
					zoomReactive: true,
					opacity: 0.9,
					deviceId: null,
				},
				figureAnnotations: [],
			};

			const compositor = new ScreenRecordingExportCompositor(config);
			expect(() =>
				compositor.renderFrame(ctx, mockVideoFrame, 500),
			).not.toThrow();
			compositor.destroy();
		});
	});
});
