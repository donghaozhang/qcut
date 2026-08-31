import { describe, expect, it } from "vitest";
import {
	getPlanarFitMapping,
	planarContainerPointToSource,
	sourcePointToPlanarContainer,
} from "../planar-tracking-overlay-geometry";

describe("planar tracking overlay geometry", () => {
	it("maps contain content through its letterbox", () => {
		const mapping = getPlanarFitMapping({
			containerHeight: 1000,
			containerWidth: 1000,
			fitMode: "contain",
			sourceHeight: 1080,
			sourceWidth: 1920,
		});
		expect(mapping.displayHeight).toBeCloseTo(562.5);
		expect(mapping.displayWidth).toBeCloseTo(1000);
		expect(mapping.offsetX).toBeCloseTo(0);
		expect(mapping.offsetY).toBeCloseTo(218.75);
		const center = sourcePointToPlanarContainer({
			mapping,
			point: { x: 0.5, y: 0.5 },
		});
		expect(center).toEqual({ x: 500, y: 500 });
		expect(planarContainerPointToSource({ mapping, point: center })).toEqual({
			x: 0.5,
			y: 0.5,
		});
	});

	it("maps cover content through the cropped source extent", () => {
		const mapping = getPlanarFitMapping({
			containerHeight: 1000,
			containerWidth: 1000,
			fitMode: "cover",
			sourceHeight: 1080,
			sourceWidth: 1920,
		});
		expect(mapping.displayWidth).toBeCloseTo(1777.777_778);
		expect(mapping.displayHeight).toBe(1000);
		expect(mapping.offsetX).toBeCloseTo(-388.888_889);
		expect(
			planarContainerPointToSource({
				mapping,
				point: { x: 0, y: 500 },
			})
		).toEqual({ x: 0.21875, y: 0.5 });
	});
});
