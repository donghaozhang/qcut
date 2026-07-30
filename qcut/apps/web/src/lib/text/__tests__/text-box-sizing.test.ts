import { describe, expect, it } from "vitest";
import type { CreateTextElement } from "@/types/timeline";
import { fitTextElementBoxToContent } from "../text-box-sizing";

function createTextElement({
	overrides = {},
}: {
	overrides?: Partial<CreateTextElement>;
} = {}): CreateTextElement {
	return {
		type: "text",
		name: "Text",
		content: "Default text",
		duration: 5,
		startTime: 0,
		trimStart: 0,
		trimEnd: 0,
		fontSize: 76,
		fontFamily: "Arial",
		color: "#ffffff",
		backgroundColor: "transparent",
		textAlign: "center",
		fontWeight: "bold",
		fontStyle: "normal",
		textDecoration: "none",
		x: 0,
		y: 0,
		rotation: 0,
		opacity: 1,
		width: 780,
		height: 230,
		lineHeight: 1.2,
		backgroundPadding: 14,
		strokeWidth: 5,
		...overrides,
	};
}

describe("fitTextElementBoxToContent", () => {
	it("shrinks an oversized template box around its rendered text", () => {
		const element = createTextElement();
		const fitted = fitTextElementBoxToContent({
			element,
			measureTextWidth: () => 414,
		});

		expect(fitted.width).toBe(442);
		expect(fitted.height).toBe(120);
	});

	it("includes explicit lines, letter spacing, and style outsets", () => {
		const element = createTextElement({
			overrides: {
				content: "AB\nC",
				fontSize: 50,
				letterSpacing: 4,
				lineHeight: 1,
				backgroundPadding: 10,
				strokeWidth: 2,
			},
		});
		const fitted = fitTextElementBoxToContent({
			element,
			measureTextWidth: ({ text }) => (text === "AB" ? 70 : 35),
		});

		expect(fitted.width).toBe(94);
		expect(fitted.height).toBe(120);
	});

	it("does not add stroke space twice when padding already contains it", () => {
		const element = createTextElement({
			overrides: {
				fontSize: 66,
				backgroundPadding: 20,
				strokeWidth: 7,
			},
		});
		const fitted = fitTextElementBoxToContent({
			element,
			measureTextWidth: () => 359.390625,
		});

		expect(fitted.width).toBe(400);
		expect(fitted.height).toBe(120);
	});

	it("preserves a deliberately constrained box instead of changing wrapping", () => {
		const element = createTextElement({
			overrides: { width: 240, height: 100 },
		});
		const fitted = fitTextElementBoxToContent({
			element,
			measureTextWidth: () => 414,
		});

		expect(fitted).toBe(element);
	});

	it("grows an existing box when edited content needs more room", () => {
		const element = createTextElement({
			overrides: { width: 240, height: 100 },
		});
		const fitted = fitTextElementBoxToContent({
			element,
			measureTextWidth: () => 414,
			mode: "grow",
		});

		expect(fitted.width).toBe(442);
		expect(fitted.height).toBe(120);
	});

	it("keeps an empty text box selectable", () => {
		const element = createTextElement({ overrides: { content: "   " } });
		expect(fitTextElementBoxToContent({ element })).toBe(element);
	});
});
