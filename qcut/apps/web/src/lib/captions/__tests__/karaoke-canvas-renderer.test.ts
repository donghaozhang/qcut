import { describe, expect, it, vi } from "vitest";
import type { CaptionElement } from "@/types/timeline";
import { DEFAULT_SUBTITLE_STYLE } from "../subtitle-style";
import { renderKaraokeCaptionToCanvas } from "../karaoke-canvas-renderer";

function context() {
	return {
		save: vi.fn(),
		restore: vi.fn(),
		measureText: vi.fn((text: string) => ({ width: text.length * 10 })),
		fillText: vi.fn(),
		strokeText: vi.fn(),
		fillRect: vi.fn(),
		beginPath: vi.fn(),
		rect: vi.fn(),
		clip: vi.fn(),
		globalAlpha: 1,
		font: "",
		textAlign: "left",
		textBaseline: "middle",
		fillStyle: "",
		strokeStyle: "",
		lineWidth: 1,
		lineJoin: "round",
	};
}

function caption(): CaptionElement {
	return {
		id: "caption",
		type: "captions",
		name: "Lyrics",
		startTime: 0,
		duration: 2,
		trimStart: 0,
		trimEnd: 0,
		text: "Hello world",
		language: "en",
		source: "transcription",
		words: [
			{ id: "hello", text: "Hello", start: 0, end: 1, type: "word" },
			{ id: "world", text: "world", start: 1, end: 2, type: "word" },
		],
	};
}

describe("renderKaraokeCaptionToCanvas", () => {
	it("clips the active word fill to its timing progress", () => {
		const mockContext = context();
		const rendered = renderKaraokeCaptionToCanvas({
			ctx: mockContext as unknown as CanvasRenderingContext2D,
			canvas: { width: 400, height: 200 } as HTMLCanvasElement,
			element: caption(),
			currentTime: 0.5,
			style: {
				...structuredClone(DEFAULT_SUBTITLE_STYLE),
				karaokeMode: "karaoke",
			},
		});

		expect(rendered).toBe(true);
		expect(mockContext.rect).toHaveBeenCalled();
		expect(mockContext.rect.mock.calls[0][2]).toBeCloseTo(29, 1);
	});

	it("falls back when the caption has no karaoke timing", () => {
		const mockContext = context();
		const rendered = renderKaraokeCaptionToCanvas({
			ctx: mockContext as unknown as CanvasRenderingContext2D,
			canvas: { width: 400, height: 200 } as HTMLCanvasElement,
			element: { ...caption(), words: undefined },
			currentTime: 0.5,
			style: structuredClone(DEFAULT_SUBTITLE_STYLE),
		});

		expect(rendered).toBe(false);
		expect(mockContext.fillText).not.toHaveBeenCalled();
	});
});
