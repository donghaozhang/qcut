import { describe, expect, it } from "vitest";
import type { TextElement, TextPropertyKeyframe } from "@/types/timeline";
import {
	buildFFmpegKeyframeExpression,
	getTextKeyframeValue,
	resolveTextKeyframes,
	upsertTextKeyframe,
} from "../text-keyframes";

const xKeyframes: TextPropertyKeyframe[] = [
	{ id: "start", frame: 0, value: -200, easing: "linear" },
	{ id: "end", frame: 30, value: 100, easing: "linear" },
];

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
	startTime: 2,
	trimStart: 0,
	trimEnd: 0,
	...overrides,
});

describe("text property keyframes", () => {
	it("interpolates frames relative to the text element start", () => {
		const element = createTextElement({ keyframes: { x: xKeyframes } });

		expect(
			getTextKeyframeValue({
				element,
				property: "x",
				currentTime: 2.5,
				fps: 30,
			})
		).toBe(-50);
		expect(resolveTextKeyframes(element, 3, 30).x).toBe(100);
		expect(resolveTextKeyframes(element, 3, 30).y).toBe(0);
	});

	it("upserts by id and keeps the timeline sorted", () => {
		const updated = upsertTextKeyframe({
			keyframes: xKeyframes,
			keyframe: { id: "start", frame: 15, value: -50, easing: "easeOut" },
		});
		const inserted = upsertTextKeyframe({
			keyframes: updated,
			keyframe: { id: "middle", frame: 10, value: 0, easing: "linear" },
		});

		expect(inserted).toHaveLength(3);
		expect(inserted.map((item) => item.frame)).toEqual([10, 15, 30]);
		expect(inserted.find((item) => item.id === "start")?.value).toBe(-50);
	});

	it("builds a time expression using project fps", () => {
		const expression = buildFFmpegKeyframeExpression({
			element: createTextElement({ keyframes: { x: xKeyframes } }),
			property: "x",
			fps: 30,
		});

		expect(expression).toContain("lt(t,2)");
		expect(expression).toContain("lt(t,3)");
		expect(expression).toContain("-200+(100--200)");
	});
});
