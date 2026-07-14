import { describe, expect, it } from "vitest";
import { getTextTemplateGridColumnCount } from "../text";

describe("text view layout", () => {
	it("keeps the asset grid at four or five columns for typical panel widths", () => {
		expect(getTextTemplateGridColumnCount({ width: 520 })).toBe(5);
		expect(getTextTemplateGridColumnCount({ width: 460 })).toBe(5);
		expect(getTextTemplateGridColumnCount({ width: 380 })).toBe(4);
		expect(getTextTemplateGridColumnCount({ width: 320 })).toBe(4);
	});

	it("falls back gracefully below normal editor panel widths", () => {
		expect(getTextTemplateGridColumnCount({ width: 260 })).toBe(3);
		expect(getTextTemplateGridColumnCount({ width: 180 })).toBe(2);
	});
});
