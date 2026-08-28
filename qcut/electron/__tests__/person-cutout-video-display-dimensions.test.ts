import { describe, expect, it } from "vitest";
import { resolveAutorotatedVideoDimensions } from "../jianying-person-cutout/video-display-dimensions.js";

describe("person cutout autorotated video dimensions", () => {
	it.each([
		{ expected: { height: 1080, width: 1920 }, rotation: 0 },
		{ expected: { height: 1920, width: 1080 }, rotation: 90 },
		{ expected: { height: 1920, width: 1080 }, rotation: -90 },
		{ expected: { height: 1080, width: 1920 }, rotation: 180 },
	])("resolves display-matrix rotation $rotation", ({ expected, rotation }) => {
		expect(
			resolveAutorotatedVideoDimensions({
				height: 1080,
				sideDataList: [{ rotation }],
				width: 1920,
			})
		).toEqual(expected);
	});

	it("falls back to the legacy rotate tag", () => {
		expect(
			resolveAutorotatedVideoDimensions({
				height: 1080,
				tags: { rotate: "90" },
				width: 1920,
			})
		).toEqual({ height: 1920, width: 1080 });
	});

	it("prefers display-matrix rotation over the legacy tag", () => {
		expect(
			resolveAutorotatedVideoDimensions({
				height: 1080,
				sideDataList: [{ rotation: 0 }],
				tags: { rotate: "90" },
				width: 1920,
			})
		).toEqual({ height: 1080, width: 1920 });
	});
});
