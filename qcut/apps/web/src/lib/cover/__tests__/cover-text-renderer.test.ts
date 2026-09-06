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
	it("maps explicit paint and layout settings to the shared renderer", () => {
		const layer = {
			...createCoverText({ canvas, content: "Title", id: "styled" }),
			stroke: true,
			shadow: true,
			background: true,
			textStyle: {
				strokeColor: "#00ff00",
				strokeWidth: 6,
				strokeOpacity: 0.4,
				shadowColor: "#ff0000",
				shadowOpacity: 0.3,
				shadowBlur: 20,
				shadowOffsetX: -12,
				shadowOffsetY: 8,
				backgroundColor: "#0088ff",
				backgroundRadius: 24,
				backgroundPadding: 18,
				backgroundOpacity: 0.5,
				glowEnabled: true,
				glowColor: "#ffff00",
				glowBlur: 16,
				glowOpacity: 0.8,
				letterSpacing: 4,
				lineHeight: 1.6,
				verticalAlign: "top" as const,
			},
		};
		const { glowEnabled, ...expected } = layer.textStyle;
		expect(glowEnabled).toBe(true);
		expect(coverTextElement({ layer, canvas, ctx: context() })).toMatchObject(
			expected
		);
		const disabled = coverTextElement({
			layer: {
				...layer,
				stroke: false,
				shadow: false,
				background: false,
				textStyle: { ...layer.textStyle, glowEnabled: false },
			},
			canvas,
			ctx: context(),
		});
		expect(disabled).toMatchObject({
			strokeWidth: 0,
			shadowOpacity: 0,
			backgroundOpacity: 0,
			backgroundPadding: 0,
			glowOpacity: 0,
		});
	});
	it("fits using line height and grapheme spacing and bounds excessive padding", () => {
		const layer = {
			...createCoverText({ canvas, content: "Title\n标题", id: "layout" }),
			width: 0.2,
			height: 0.1,
			fontSize: 100,
		};
		const original = coverTextElement({ layer, canvas, ctx: context() });
		const spaced = coverTextElement({
			layer: { ...layer, textStyle: { lineHeight: 3, letterSpacing: 8 } },
			canvas,
			ctx: context(),
		});
		expect(spaced.fontSize).toBeLessThan(original.fontSize);
		const padded = coverTextElement({
			layer: {
				...layer,
				background: true,
				textStyle: { backgroundPadding: 200 },
			},
			canvas,
			ctx: context(),
		});
		expect(padded.backgroundPadding).toBeLessThan(
			(layer.height * canvas.height) / 2
		);
		expect(padded.fontSize).toBeGreaterThan(0);
		expect(padded.fontSize).toBeLessThan(original.fontSize);
		const inert = coverTextElement({
			layer: { ...layer, textStyle: { backgroundPadding: 200 } },
			canvas,
			ctx: context(),
		});
		expect(inert.backgroundPadding).toBe(0);
		expect(inert.fontSize).toBe(original.fontSize);
	});
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
