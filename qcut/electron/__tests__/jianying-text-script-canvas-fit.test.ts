// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	centerJianyingScriptContentBounds,
	nextJianyingScriptCanvasWidth,
} from "../jianying-text-runtime/script-canvas-fit.js";

describe("Jianying script canvas fitting", () => {
	it("uses conservative retries until an animated script clears the frame", () => {
		expect(
			nextJianyingScriptCanvasWidth({
				canvasWidth: 1024,
				canvasHeight: 512,
				targetWidth: 1024,
				bounds: { x: 264, y: 0, width: 526, height: 512 },
			})
		).toBe(768);
		expect(
			nextJianyingScriptCanvasWidth({
				canvasWidth: 768,
				canvasHeight: 512,
				targetWidth: 1024,
				bounds: { x: 173, y: 0, width: 420, height: 512 },
			})
		).toBe(576);
		expect(
			nextJianyingScriptCanvasWidth({
				canvasWidth: 576,
				canvasHeight: 512,
				targetWidth: 1024,
				bounds: { x: 130, y: 8, width: 315, height: 472 },
			})
		).toBe(547);
		expect(
			nextJianyingScriptCanvasWidth({
				canvasWidth: 547,
				canvasHeight: 512,
				targetWidth: 1024,
				bounds: { x: 123, y: 20, width: 299, height: 449 },
			})
		).toBeNull();
	});

	it("adds one outer inset for a horizontal edge animation", () => {
		expect(
			nextJianyingScriptCanvasWidth({
				canvasWidth: 640,
				canvasHeight: 360,
				targetWidth: 640,
				bounds: { x: 0, y: 33, width: 640, height: 223 },
			})
		).toBe(588);
		expect(
			nextJianyingScriptCanvasWidth({
				canvasWidth: 588,
				canvasHeight: 360,
				targetWidth: 640,
				bounds: { x: 0, y: 45, width: 588, height: 205 },
			})
		).toBeNull();
	});

	it("maps fitted bounds into the centered target canvas", () => {
		expect(
			centerJianyingScriptContentBounds({
				bounds: { x: 123, y: 20, width: 299, height: 449 },
				sourceWidth: 547,
				targetWidth: 1024,
			})
		).toEqual({ x: 361, y: 20, width: 299, height: 449 });
		expect(
			centerJianyingScriptContentBounds({
				bounds: null,
				sourceWidth: 547,
				targetWidth: 1024,
			})
		).toBeNull();
	});
});
