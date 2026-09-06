import { describe, it, expect } from "vitest";
import { createCoverText } from "@qcut/editor-core/cover";
import { coverTextElement } from "../cover-text-renderer";

const canvas = { width: 1080, height: 1920, backgroundColor: "#000000" };
function context() {
	return {
		font: "",
		measureText(this: { font: string }, text: string) {
			const match = this.font.match(/([0-9.]+)px/);
			return { width: [...text].length * Number(match?.[1] ?? 10) };
		},
	} as unknown as CanvasRenderingContext2D;
}
describe("cover text renderer adapter", () => {
	it("maps cover coordinates and all visible style controls into timeline text", () => {
		const layer = {
			...createCoverText({ canvas, content: "Hello", id: "title" }),
			x: 0.25,
			y: 0.75,
			rotation: 12,
			underline: true,
			italic: true,
			stroke: true,
			background: true,
		};
		const element = coverTextElement({ layer, canvas, ctx: context() });
		expect(element).toMatchObject({
			x: -270,
			y: 480,
			rotation: 12,
			fontStyle: "italic",
			textDecoration: "underline",
			backgroundColor: "#171717",
			content: "Hello",
		});
		expect(element.strokeWidth).toBeGreaterThan(0);
		expect(element.shadowOpacity).toBeGreaterThan(0);
	});
	it("fits long CJK and unbroken text inside the box instead of clipping", () => {
		const layer = {
			...createCoverText({
				canvas,
				content: "很长的中文标题MixedUnbrokenText".repeat(4),
				id: "title",
			}),
			width: 0.2,
			height: 0.1,
			fontSize: 100,
		};
		const element = coverTextElement({ layer, canvas, ctx: context() });
		expect(element.fontSize).toBeLessThan(100);
		expect(element.letterSpacing).toBe(0);
		expect(element.content).toBe(layer.content);
	});
});
