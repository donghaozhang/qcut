import { describe, expect, it } from "vitest";
import {
	getValidTextGroupElements,
	isValidTextGroupElement,
} from "../text-group-drag-data";
import type { CreateTextElement } from "@/types/timeline";

function createTextElement({
	content = "标题",
}: {
	content?: string;
} = {}): CreateTextElement {
	return {
		backgroundColor: "transparent",
		color: "#ffffff",
		content,
		duration: 5,
		fontFamily: "Arial",
		fontSize: 52,
		fontStyle: "normal",
		fontWeight: "bold",
		height: 120,
		name: "Pack Title",
		opacity: 1,
		rotation: 0,
		startTime: 0,
		textAlign: "center",
		textDecoration: "none",
		trimEnd: 0,
		trimStart: 0,
		type: "text",
		width: 640,
		x: 100,
		y: 100,
	};
}

describe("text group drag data", () => {
	it("accepts complete grouped text elements", () => {
		const element = createTextElement();

		expect(isValidTextGroupElement({ value: element })).toBe(true);
		expect(getValidTextGroupElements({ value: [element] })).toEqual([element]);
	});

	it("filters malformed grouped text elements from JSON drag payloads", () => {
		const validElement = createTextElement({ content: "主标题" });

		expect(
			getValidTextGroupElements({
				value: [
					validElement,
					{ ...validElement, content: "   " },
					{ ...validElement, fontSize: "52" },
					{ ...validElement, textAlign: "justify" },
					{ ...validElement, type: "image" },
					null,
				],
			})
		).toEqual([validElement]);
	});

	it("treats non-array payloads as empty groups", () => {
		expect(getValidTextGroupElements({ value: undefined })).toEqual([]);
		expect(getValidTextGroupElements({ value: { content: "标题" } })).toEqual(
			[]
		);
	});
});
