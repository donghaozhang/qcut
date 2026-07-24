import { describe, expect, it } from "vitest";
import { resolveInitialWindowSize } from "../window-sizing.js";

describe("initial QCut window size", () => {
	it("keeps a full-HD capture surface when the display supports it", () => {
		expect(
			resolveInitialWindowSize({
				workAreaWidth: 2560,
				workAreaHeight: 1300,
			})
		).toEqual({
			width: 2048,
			height: 1080,
		});
	});

	it("does not exceed a smaller display work area", () => {
		expect(
			resolveInitialWindowSize({
				workAreaWidth: 1440,
				workAreaHeight: 900,
			})
		).toEqual({
			width: 1440,
			height: 900,
		});
	});
});
