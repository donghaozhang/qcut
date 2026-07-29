import { fireEvent, render, screen } from "@/test/test-utils";
import type { TextElement } from "@/types/timeline";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderTextToCanvas } from "@/lib/text/text-canvas-renderer";
import {
	resolveTextPreviewRenderMode,
	TextAnimationCanvas,
} from "../text-animation-canvas";

vi.mock("@/lib/text/text-canvas-renderer", () => ({
	renderTextToCanvas: vi.fn(),
}));

function createCanvasContext() {
	return {
		clearRect: vi.fn(),
		setTransform: vi.fn(),
		translate: vi.fn(),
	};
}

let canvasContext = createCanvasContext();

function createTextElement({
	overrides = {},
}: {
	overrides?: Partial<TextElement>;
} = {}): TextElement {
	return {
		id: "text-1",
		type: "text",
		name: "Animated title",
		content: "Hello",
		fontSize: 64,
		fontFamily: "Arial",
		color: "#ffffff",
		backgroundColor: "transparent",
		textAlign: "center",
		fontWeight: "bold",
		fontStyle: "normal",
		textDecoration: "none",
		x: 192,
		y: -54,
		rotation: 12,
		opacity: 1,
		width: 640,
		height: 180,
		duration: 5,
		startTime: 0,
		trimStart: 0,
		trimEnd: 0,
		...overrides,
	};
}

function canonicalTextElement(): TextElement {
	return createTextElement({
		overrides: {
			textAnimations: {
				schemaVersion: 1,
				entrance: {
					timing: { duration: 0.8, delay: 0, easing: "easeOut" },
					sequence: {
						unit: "grapheme",
						order: "forward",
						staggerRatio: 0.5,
						seed: 42,
					},
					target: "text",
					effect: { kind: "fade", minimumOpacity: 0 },
				},
			},
		},
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	canvasContext = createCanvasContext();
	Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
		configurable: true,
		value: vi.fn(() => canvasContext),
	});
});

describe("resolveTextPreviewRenderMode", () => {
	it("routes canonical phased animation through the shared canvas", () => {
		expect(
			resolveTextPreviewRenderMode({
				element: canonicalTextElement(),
				fps: 30,
			})
		).toBe("canvas");
	});

	it("keeps legacy, empty canonical, and unsupported animation data on DOM", () => {
		const legacy = createTextElement({
			overrides: { animationType: "fade" },
		});
		const emptyCanonical = createTextElement({
			overrides: { textAnimations: { schemaVersion: 1 } },
		});
		const unsupported = {
			...createTextElement(),
			textAnimations: { schemaVersion: 2 },
		} as unknown as TextElement;

		expect(resolveTextPreviewRenderMode({ element: legacy, fps: 30 })).toBe(
			"dom"
		);
		expect(
			resolveTextPreviewRenderMode({ element: emptyCanonical, fps: 30 })
		).toBe("dom");
		expect(
			resolveTextPreviewRenderMode({ element: unsupported, fps: 30 })
		).toBe("dom");
	});
});

describe("TextAnimationCanvas", () => {
	it("renders project coordinates into a cropped backing canvas", () => {
		const element = canonicalTextElement();
		render(
			<TextAnimationCanvas
				element={element}
				canvasSize={{ width: 1920, height: 1080 }}
				previewDimensions={{ width: 960, height: 540 }}
				currentTime={1.25}
				fps={24}
				boxWidth={640}
				boxHeight={180}
				zIndex={4}
				onPointerDown={vi.fn()}
				onSelect={vi.fn()}
			/>
		);

		const canvas = document.querySelector<HTMLCanvasElement>(
			'[data-text-animation-canvas="text-1"]'
		);
		expect(canvas).not.toBeNull();
		const cropWidth = Number(canvas?.getAttribute("width"));
		const cropHeight = Number(canvas?.getAttribute("height"));
		expect(cropWidth).toBeGreaterThan(640);
		expect(cropWidth).toBeLessThan(1000);
		expect(cropHeight).toBeGreaterThan(180);
		expect(cropHeight).toBeLessThan(600);
		expect(canvas?.style.width).toBe(`${cropWidth / 2}px`);
		expect(canvas?.style.height).toBe(`${cropHeight / 2}px`);
		expect(canvas?.parentElement?.style.left).not.toBe("0px");
		expect(canvas?.parentElement?.style.top).not.toBe("0px");
		expect(canvasContext.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
		expect(canvasContext.clearRect).toHaveBeenCalledWith(
			0,
			0,
			cropWidth,
			cropHeight
		);
		const [translateX, translateY] = canvasContext.translate.mock.calls[0];
		expect(translateX).toBeLessThan(0);
		expect(translateY).toBeLessThan(0);
		expect(renderTextToCanvas).toHaveBeenCalledWith(
			expect.objectContaining({
				canvas: { width: 1920, height: 1080 },
				currentTime: 1.25,
				element,
				fps: 24,
			})
		);
	});

	it("uses the width scale when preview height is temporarily unavailable", () => {
		const element = canonicalTextElement();
		render(
			<TextAnimationCanvas
				element={element}
				canvasSize={{ width: 1920, height: 1080 }}
				previewDimensions={{ width: 960, height: 0 }}
				currentTime={1.25}
				fps={24}
				boxWidth={640}
				boxHeight={180}
				zIndex={4}
				onPointerDown={vi.fn()}
				onSelect={vi.fn()}
			/>
		);

		const canvas = document.querySelector<HTMLCanvasElement>(
			'[data-text-animation-canvas="text-1"]'
		);
		const cropWidth = Number(canvas?.getAttribute("width"));
		const cropHeight = Number(canvas?.getAttribute("height"));

		expect(canvas?.style.width).toBe(`${cropWidth / 2}px`);
		expect(canvas?.style.height).toBe(`${cropHeight / 2}px`);
	});

	it("keeps a keyboard and pointer accessible interaction box", () => {
		const onPointerDown = vi.fn();
		const onSelect = vi.fn();
		render(
			<TextAnimationCanvas
				element={canonicalTextElement()}
				canvasSize={{ width: 1920, height: 1080 }}
				previewDimensions={{ width: 960, height: 540 }}
				currentTime={0}
				fps={30}
				boxWidth={640}
				boxHeight={180}
				zIndex={2}
				onPointerDown={onPointerDown}
				onSelect={onSelect}
			/>
		);

		const interaction = screen.getByRole("button", {
			name: "Select text element: Hello",
		});
		expect(interaction.style.left).toBe("60%");
		expect(interaction.style.top).toBe("45%");
		expect(interaction.style.width).toBe("640px");
		expect(interaction.style.height).toBe("180px");

		fireEvent.pointerDown(interaction);
		fireEvent.click(interaction, { shiftKey: true });
		fireEvent.keyDown(interaction, { key: "Enter", metaKey: true });

		expect(onPointerDown).toHaveBeenCalledOnce();
		expect(onSelect).toHaveBeenNthCalledWith(1, { multi: true });
		expect(onSelect).toHaveBeenNthCalledWith(2, { multi: true });
	});
});
