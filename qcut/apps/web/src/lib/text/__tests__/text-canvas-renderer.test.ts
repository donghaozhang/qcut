import { describe, expect, it } from "vitest";
import { wrapTextForBox } from "../text-canvas-renderer";

const ctx = {
	measureText: (text: string) => ({ width: Array.from(text).length * 10 }),
} as CanvasRenderingContext2D;

describe("wrapTextForBox", () => {
	it("wraps words to the configured text box", () => {
		expect(
			wrapTextForBox({
				ctx,
				text: "one two three",
				maxWidth: 55,
				letterSpacing: 0,
			})
		).toEqual(["one", "two", "three"]);
	});

	it("preserves explicit newlines", () => {
		expect(
			wrapTextForBox({
				ctx,
				text: "first\n\nsecond",
				maxWidth: 200,
				letterSpacing: 0,
			})
		).toEqual(["first", "", "second"]);
	});

	it("accounts for letter spacing and splits oversized tokens", () => {
		expect(
			wrapTextForBox({
				ctx,
				text: "ABCD",
				maxWidth: 25,
				letterSpacing: 5,
			})
		).toEqual(["AB", "CD"]);
	});

	it("never splits a joined emoji grapheme while wrapping", () => {
		expect(
			wrapTextForBox({
				ctx,
				text: "👨‍👩‍👧‍👦A",
				maxWidth: 15,
				letterSpacing: 0,
			})
		).toEqual(["👨‍👩‍👧‍👦", "A"]);
	});
});
