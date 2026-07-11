import { describe, expect, it } from "vitest";
import type { TextElement } from "@/types/timeline";
import {
	buildTextShadow,
	colorWithOpacity,
	resolveTextStyle,
} from "../text-style";

const createTextElement = (
	overrides: Partial<TextElement> = {}
): TextElement => ({
	id: "text-1",
	type: "text",
	name: "Text",
	content: "Hello",
	fontSize: 48,
	fontFamily: "Arial",
	color: "#ffffff",
	backgroundColor: "transparent",
	textAlign: "center",
	fontWeight: "normal",
	fontStyle: "normal",
	textDecoration: "none",
	x: 0,
	y: 0,
	rotation: 0,
	opacity: 1,
	duration: 5,
	startTime: 0,
	trimStart: 0,
	trimEnd: 0,
	...overrides,
});

describe("resolveTextStyle", () => {
	it("supplies backward-compatible defaults for old text elements", () => {
		const style = resolveTextStyle(createTextElement());

		expect(style).toMatchObject({
			width: 640,
			height: 180,
			letterSpacing: 0,
			lineHeight: 1.2,
			verticalAlign: "middle",
			strokeWidth: 0,
			backgroundOpacity: 0,
			shadowOpacity: 0,
			glowOpacity: 0,
			curve: 0,
			blendMode: "normal",
		});
	});

	it("keeps legacy colored backgrounds visible", () => {
		const style = resolveTextStyle(
			createTextElement({ backgroundColor: "#ff0000" })
		);
		expect(style.backgroundOpacity).toBe(1);
	});

	it("clamps invalid persisted style values", () => {
		const style = resolveTextStyle(
			createTextElement({
				letterSpacing: 999,
				lineHeight: -1,
				strokeOpacity: 4,
				backgroundRadius: -10,
			})
		);

		expect(style.letterSpacing).toBe(100);
		expect(style.lineHeight).toBe(0.5);
		expect(style.strokeOpacity).toBe(1);
		expect(style.backgroundRadius).toBe(0);
	});
});

describe("text CSS helpers", () => {
	it("adds alpha to short and long hex colors", () => {
		expect(colorWithOpacity("#fff", 0.5)).toBe("#ffffff80");
		expect(colorWithOpacity("#112233", 0.25)).toBe("#11223340");
		expect(colorWithOpacity("#112233", 0)).toBe("transparent");
	});

	it("combines shadow and glow without replacing either effect", () => {
		const style = resolveTextStyle(
			createTextElement({
				shadowOpacity: 0.5,
				glowOpacity: 0.75,
			})
		);
		const shadow = buildTextShadow(style);

		expect(shadow).toContain("4px 4px 8px");
		expect(shadow).toContain("0 0 12px");
		expect(shadow).toContain(", ");
	});
});
