import { describe, expect, it, vi } from "vitest";
import type { TextElement } from "@/types/timeline";
import { resolveTextOverlayBounds } from "../text-overlay-bounds";

function createTextElement({
	overrides = {},
}: {
	overrides?: Partial<TextElement>;
} = {}): TextElement {
	return {
		id: "text-1",
		type: "text",
		name: "Text",
		content: "Hello",
		fontSize: 40,
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
		width: 640,
		height: 180,
		duration: 2,
		startTime: 0,
		trimStart: 0,
		trimEnd: 0,
		...overrides,
	} as TextElement;
}

function createContext(): CanvasRenderingContext2D {
	return {
		measureText: vi.fn((text: string) => ({
			width: Array.from(text).length * 10,
		})),
		font: "",
	} as unknown as CanvasRenderingContext2D;
}

describe("resolveTextOverlayBounds", () => {
	it("wraps the measured glyph runs instead of the logical box", () => {
		const bounds = resolveTextOverlayBounds({
			element: createTextElement(),
			canvasWidth: 1920,
			canvasHeight: 1080,
			ctx: createContext(),
		});

		// "Hello" measures 50px wide at 10px per character; the box must hug
		// that run (plus breathing padding), not the 640x180 logical box.
		expect(bounds.width).toBeLessThan(120);
		expect(bounds.height).toBeLessThan(120);
		expect(Math.abs(bounds.offsetX)).toBeLessThan(10);
	});

	it("keeps the logical box when a background is visible", () => {
		const bounds = resolveTextOverlayBounds({
			element: createTextElement({
				overrides: { backgroundColor: "#ffe600", backgroundOpacity: 1 },
			}),
			canvasWidth: 1920,
			canvasHeight: 1080,
			ctx: createContext(),
		});

		expect(bounds).toEqual({
			offsetX: 0,
			offsetY: 0,
			width: 640,
			height: 180,
		});
	});

	it("keeps the logical box for empty content", () => {
		const bounds = resolveTextOverlayBounds({
			element: createTextElement({ overrides: { content: "   " } }),
			canvasWidth: 1920,
			canvasHeight: 1080,
			ctx: createContext(),
		});

		expect(bounds.width).toBe(640);
		expect(bounds.height).toBe(180);
	});

	it("keeps the runtime surface while native Jianying bounds are loading", () => {
		const bounds = resolveTextOverlayBounds({
			element: createTextElement({
				overrides: {
					jianyingTextStyle: {
						schemaVersion: 1,
						source: "jianying-cache",
						packageKind: "TextStyle",
						resourceId: "style-1",
						packageHash: "a".repeat(32),
						editMode: "runtime-with-preload-fallback",
						slotMapping: "line-to-widget",
						timeMapping: "stretch",
						templateDuration: 2,
					},
				},
			}),
			canvasWidth: 1920,
			canvasHeight: 1080,
			ctx: createContext(),
		});

		expect(bounds).toEqual({
			offsetX: 0,
			offsetY: 0,
			width: 640,
			height: 180,
		});
	});
});
