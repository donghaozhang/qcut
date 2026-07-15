import { describe, expect, it } from "vitest";
import {
	getCanvasDropPoint,
	parseDroppedCanvasItem,
	positionTextGroupAtCanvasPoint,
	positionTextTemplateAtCanvasPoint,
} from "../timeline-sticker-interactions";
import type { CreateTextElement, TextItemDragData } from "@/types/timeline";

function createTextDragData({
	content = "Hello",
	name = "Title",
	textTemplate,
	textTemplatePack,
}: Partial<TextItemDragData> = {}): TextItemDragData {
	return {
		content,
		id: "text-1",
		name,
		textTemplate,
		textTemplatePack,
		type: "text",
	};
}

function createTextElement({
	height,
	name,
	width,
	x,
	y,
}: {
	height: number;
	name: string;
	width: number;
	x: number;
	y: number;
}): CreateTextElement {
	return {
		backgroundColor: "transparent",
		color: "#ffffff",
		content: name,
		duration: 5,
		fontFamily: "Arial",
		fontSize: 32,
		fontStyle: "normal",
		fontWeight: "bold",
		height,
		name,
		opacity: 1,
		rotation: 0,
		startTime: 0,
		textAlign: "center",
		textDecoration: "none",
		trimEnd: 0,
		trimStart: 0,
		type: "text",
		width,
		x,
		y,
	};
}

describe("timeline sticker drop interactions", () => {
	it("parses media and text drag payloads for canvas drops", () => {
		expect(
			parseDroppedCanvasItem({
				value: JSON.stringify({ id: "image-1", type: "image" }),
			})
		).toEqual({
			item: { id: "image-1", name: "image-1", type: "image" },
			kind: "media",
		});

		const textItem = createTextDragData({
			name: "Lower Third",
			textTemplate: { content: "Template copy", width: 320 },
		});
		expect(
			parseDroppedCanvasItem({
				value: JSON.stringify(textItem),
			})
		).toEqual({
			item: textItem,
			kind: "text",
		});

		expect(parseDroppedCanvasItem({ value: "not json" })).toBeNull();
	});

	it("maps viewport drops into clamped canvas coordinates", () => {
		expect(
			getCanvasDropPoint({
				bounds: { height: 500, left: 100, top: 50, width: 1000 },
				canvasSize: { height: 1080, width: 1920 },
				clientX: 600,
				clientY: 300,
			})
		).toEqual({ x: 960, y: 540 });

		expect(
			getCanvasDropPoint({
				bounds: { height: 500, left: 100, top: 50, width: 1000 },
				canvasSize: { height: 1080, width: 1920 },
				clientX: 1300,
				clientY: -100,
			})
		).toEqual({ x: 1920, y: 0 });
	});

	it("centers a single text template on the canvas drop point", () => {
		expect(
			positionTextTemplateAtCanvasPoint({
				item: createTextDragData({
					content: "Fallback copy",
					name: "Fallback name",
					textTemplate: {
						content: "Template copy",
						height: 80,
						name: "Template name",
						width: 300,
					},
				}),
				point: { x: 960, y: 540 },
			})
		).toMatchObject({
			content: "Template copy",
			height: 80,
			name: "Template name",
			type: "text",
			width: 300,
			x: 810,
			y: 500,
		});
	});

	it("preserves text group geometry while centering it on the drop point", () => {
		const first = createTextElement({
			height: 60,
			name: "first",
			width: 200,
			x: 100,
			y: 100,
		});
		const second = createTextElement({
			height: 80,
			name: "second",
			width: 300,
			x: 200,
			y: 220,
		});

		expect(
			positionTextGroupAtCanvasPoint({
				elements: [first, second],
				point: { x: 960, y: 540 },
			}).map((element) => ({
				name: element.name,
				x: element.x,
				y: element.y,
			}))
		).toEqual([
			{ name: "first", x: 760, y: 440 },
			{ name: "second", x: 860, y: 560 },
		]);
	});
});
