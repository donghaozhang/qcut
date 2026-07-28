import { describe, expect, it } from "vitest";
import { getCurvedTextTransforms } from "../curved-text";

describe("getCurvedTextTransforms", () => {
	it("keeps characters ordered from left to right", () => {
		const transforms = getCurvedTextTransforms({
			text: "HELLO",
			width: 400,
			curve: -60,
		});

		expect(transforms).toHaveLength(5);
		expect(transforms[0].x).toBeLessThan(transforms[4].x);
		expect(transforms[2].x).toBeCloseTo(0);
	});

	it("uses opposite vertical arcs for positive and negative curves", () => {
		const upward = getCurvedTextTransforms({
			text: "ABC",
			width: 300,
			curve: -90,
		});
		const downward = getCurvedTextTransforms({
			text: "ABC",
			width: 300,
			curve: 90,
		});

		expect(upward[0].y).toBeLessThan(0);
		expect(downward[0].y).toBeGreaterThan(0);
		expect(upward[1].y).toBeCloseTo(0);
	});

	it("normalizes line breaks for curved text", () => {
		const transforms = getCurvedTextTransforms({
			text: "A\nB",
			width: 200,
			curve: 45,
		});

		expect(transforms.map((item) => item.character).join("")).toBe("A B");
	});

	it("keeps joined emoji as one curved glyph", () => {
		const transforms = getCurvedTextTransforms({
			text: "A👨‍👩‍👧‍👦B",
			width: 240,
			curve: 45,
		});

		expect(transforms.map((item) => item.character)).toEqual([
			"A",
			"👨‍👩‍👧‍👦",
			"B",
		]);
	});
});
