import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TextElement } from "@/types/timeline";
import { renderCanonicalTextAnimationToCanvas } from "../text-animation-canvas-renderer";
import { renderTextToCanvas } from "../text-canvas-renderer";

vi.mock("../text-animation-canvas-renderer", () => ({
	renderCanonicalTextAnimationToCanvas: vi.fn(() => true),
}));

function createResolvedElement(): TextElement {
	return {
		id: "resolved-text",
		type: "text",
		name: "Resolved text",
		content: "Hello",
		startTime: 2,
		duration: 1,
		trimStart: 0,
		trimEnd: 0,
		fontSize: 48,
		fontFamily: "Arial",
		color: "#ffffff",
		backgroundColor: "transparent",
		textAlign: "center",
		fontWeight: "normal",
		fontStyle: "normal",
		textDecoration: "none",
		x: 143,
		y: 36,
		rotation: 35,
		opacity: 1,
		keyframes: {
			x: [{ id: "x", frame: 2, value: 40, easing: "linear" }],
			y: [{ id: "y", frame: 2, value: -10, easing: "linear" }],
			rotation: [{ id: "rotation", frame: 2, value: 25, easing: "linear" }],
		},
		textAnimations: {
			schemaVersion: 1,
			entrance: {
				timing: { duration: 0.5, delay: 0, easing: "easeOut" },
				sequence: {
					unit: "grapheme",
					order: "forward",
					staggerRatio: 0.5,
					seed: 1,
				},
				target: "text",
				effect: { kind: "fade", minimumOpacity: 0 },
			},
		},
	};
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("renderTextToCanvas resolved geometry", () => {
	it("does not reapply keyframes to an element resolved by preview or export", () => {
		const element = createResolvedElement();

		renderTextToCanvas({
			ctx: {} as CanvasRenderingContext2D,
			canvas: { width: 640, height: 360 },
			element,
			currentTime: 2.2,
			fps: 10,
		});

		expect(renderCanonicalTextAnimationToCanvas).toHaveBeenCalledWith(
			expect.objectContaining({
				sourceElement: element,
				renderedElement: element,
			})
		);
	});
});
