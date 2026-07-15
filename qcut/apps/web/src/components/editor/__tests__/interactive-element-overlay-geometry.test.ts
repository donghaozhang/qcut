import { describe, expect, it } from "vitest";
import type { TextElement } from "@/types/timeline";
import {
	buildCenteredOverlayStyle,
	resolveElementTransform,
} from "../interactive-element-overlay";

function textElement(overrides: Partial<TextElement> = {}): TextElement {
	return {
		id: "text-1",
		name: "Title",
		type: "text",
		content: "Hello",
		startTime: 0,
		duration: 5,
		trimStart: 0,
		trimEnd: 0,
		x: 0,
		y: 0,
		rotation: 0,
		opacity: 1,
		fontSize: 64,
		fontFamily: "Arial",
		fontWeight: "normal",
		fontStyle: "normal",
		textDecoration: "none",
		color: "#ffffff",
		backgroundColor: "transparent",
		textAlign: "center",
		...overrides,
	};
}

describe("interactive element overlay geometry", () => {
	it("positions text from the canvas center like the text renderer", () => {
		const style = buildCenteredOverlayStyle({
			transform: resolveElementTransform({
				element: textElement({
					x: -120,
					y: 80,
					width: 640,
					height: 180,
					rotation: -5,
				}),
			}),
			canvasSize: { width: 1920, height: 1080 },
			previewDimensions: { width: 960, height: 540 },
		});

		expect(style).toEqual({
			left: "calc(50% + -60px)",
			top: "calc(50% + 40px)",
			width: "320px",
			height: "90px",
			transform: "translate(-50%, -50%) rotate(-5deg)",
		});
	});

	it("uses the same default text box size as the text renderer", () => {
		expect(resolveElementTransform({ element: textElement() })).toMatchObject({
			width: 640,
			height: 180,
		});
	});
});
