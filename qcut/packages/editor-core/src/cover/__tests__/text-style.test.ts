import { describe, expect, it } from "vitest";
import {
	assertCoverText,
	createCoverText,
	assertCoverTextStyle,
	resolveCoverTextStyle,
	COVER_TEXT_STYLE_RANGES,
} from "../index";

const canvas = { width: 1920, height: 1080, backgroundColor: "#000000" };
describe("cover text style persistence", () => {
	it("accepts legacy layers without style overrides", () => {
		const layer = createCoverText({ canvas, id: "text", content: "Title" });
		expect(layer.textStyle).toBeUndefined();
		expect(() => assertCoverText({ layer })).not.toThrow();
		const defaults = resolveCoverTextStyle({
			fontSize: 100,
			width: 800,
			height: 200,
		});
		expect(defaults.strokeWidth).toBeCloseTo(3.5);
		expect(defaults).toMatchObject({
			shadowBlur: 8,
			shadowOffsetY: 4,
			backgroundPadding: 10,
			lineHeight: 1.2,
			glowEnabled: false,
		});
	});
	it("round-trips all paint parameters without font or geometry changes", () => {
		const layer = createCoverText({ canvas, id: "text", content: "标题" });
		const textStyle = resolveCoverTextStyle({
			fontSize: 72,
			width: 800,
			height: 200,
			style: {
				strokeColor: "#EFA012",
				shadowOffsetX: -20,
				backgroundRadius: 28,
				glowEnabled: true,
				letterSpacing: 6,
				lineHeight: 1.8,
				verticalAlign: "bottom",
			},
		});
		const restored = JSON.parse(JSON.stringify({ ...layer, textStyle }));
		expect(() => assertCoverText({ layer: restored })).not.toThrow();
		expect(restored).toEqual({ ...layer, textStyle });
	});
	it.each(
		Object.entries(COVER_TEXT_STYLE_RANGES)
	)("bounds %s and rejects nonfinite or coercible values", (key, [
		min,
		max,
	]) => {
		for (const value of [min, max])
			expect(() =>
				assertCoverTextStyle({ style: { [key]: value } })
			).not.toThrow();
		for (const value of [min - 0.01, max + 0.01, NaN, Infinity, "1", null])
			expect(() => assertCoverTextStyle({ style: { [key]: value } })).toThrow();
	});
	it.each(
		[
			null,
			[],
			true,
			{ strokeColor: "red" },
			{ shadowColor: "url(file:///tmp/x)" },
			{ glowEnabled: 1 },
			{ verticalAlign: "baseline" },
			{ nativePath: "/tmp/style" },
			{ unknown: true },
		].map((style) => ({ style }))
	)("rejects malformed or unsupported styles: $style", ({ style }) => {
		expect(() => assertCoverTextStyle({ style })).toThrow();
	});
});
