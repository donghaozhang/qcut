import { describe, expect, it } from "vitest";
import type { TextElement } from "@/types/timeline";
import { BUILT_IN_TEXT_PRESETS, captureTextPreset } from "../text-presets";

const element: TextElement = {
	id: "text-1",
	type: "text",
	name: "Text",
	content: "Do not save me",
	fontSize: 64,
	fontFamily: "Arial",
	color: "#ffffff",
	backgroundColor: "transparent",
	textAlign: "center",
	fontWeight: "normal",
	fontStyle: "normal",
	textDecoration: "none",
	x: 400,
	y: 200,
	rotation: 15,
	opacity: 0.5,
	duration: 5,
	startTime: 3,
	trimStart: 0,
	trimEnd: 0,
};

describe("text style presets", () => {
	it("provides distinct built-in styles", () => {
		expect(BUILT_IN_TEXT_PRESETS.length).toBeGreaterThanOrEqual(8);
		expect(new Set(BUILT_IN_TEXT_PRESETS.map((preset) => preset.id)).size).toBe(
			BUILT_IN_TEXT_PRESETS.length
		);
	});

	it("captures only reusable style and resolves old-project defaults", () => {
		const updates = captureTextPreset(element);

		expect(updates.fontSize).toBe(64);
		expect(updates.lineHeight).toBe(1.2);
		expect(updates.strokeWidth).toBe(0);
		expect(updates.backgroundOpacity).toBe(0);
		expect(updates).not.toHaveProperty("content");
		expect(updates).not.toHaveProperty("x");
		expect(updates).not.toHaveProperty("startTime");
	});
});
