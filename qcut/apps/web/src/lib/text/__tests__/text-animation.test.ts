import { describe, expect, it } from "vitest";
import type { TextElement } from "@/types/timeline";
import {
	buildFFmpegTextAnimationExpressions,
	getTextAnimationState,
	resolveTextAnimation,
} from "../text-animation";

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

describe("text animation", () => {
	it("resolves old elements to no animation", () => {
		expect(resolveTextAnimation(createTextElement())).toEqual({
			type: "none",
			duration: 0.6,
			delay: 0,
		});
	});

	it("calculates the same linear slide state throughout playback", () => {
		const element = createTextElement({
			animationType: "slide-up",
			animationDuration: 2,
			animationDelay: 0.5,
		});

		expect(getTextAnimationState(element, 2.25)).toEqual({
			opacity: 0,
			offsetX: 0,
			offsetY: 80,
		});
		expect(getTextAnimationState(element, 3.5)).toEqual({
			opacity: 0.5,
			offsetX: 0,
			offsetY: 40,
		});
		expect(getTextAnimationState(element, 5)).toEqual({
			opacity: 1,
			offsetX: 0,
			offsetY: 0,
		});
	});

	it("builds equivalent FFmpeg alpha and position expressions", () => {
		const expressions = buildFFmpegTextAnimationExpressions(
			createTextElement({
				animationType: "slide-left",
				animationDuration: 1,
				animationDelay: 0.5,
			})
		);

		expect(expressions.alpha).toContain("lt(t,2.5)");
		expect(expressions.alpha).toContain("lt(t,3.5)");
		expect(expressions.xOffset).toContain("120*(1-");
		expect(expressions.yOffset).toBeUndefined();
	});
});
