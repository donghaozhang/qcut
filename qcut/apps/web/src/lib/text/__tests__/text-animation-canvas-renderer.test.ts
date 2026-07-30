import { afterEach, describe, expect, it, vi } from "vitest";
import type { TextElement } from "@/types/timeline";
import { getCachedCompiledTextAnimation } from "../text-animation-compiled-cache";
import { resolveCursorPosition } from "../text-animation-canvas-decorations";
import { buildTextAnimationCanvasLayout } from "../text-animation-canvas-layout";
import { renderCanonicalTextAnimationToCanvas } from "../text-animation-canvas-renderer";
import { applyTextAnimationVisualState } from "../text-animation-canvas-state";
import { resolveTextStyle } from "../text-style";

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
		textAlign: "left",
		fontWeight: "normal",
		fontStyle: "normal",
		textDecoration: "none",
		x: 0,
		y: 0,
		rotation: 0,
		opacity: 1,
		width: 240,
		height: 120,
		duration: 2,
		startTime: 0,
		trimStart: 0,
		trimEnd: 0,
		...overrides,
	};
}

function createContext(): CanvasRenderingContext2D {
	return {
		save: vi.fn(),
		restore: vi.fn(),
		beginPath: vi.fn(),
		closePath: vi.fn(),
		moveTo: vi.fn(),
		lineTo: vi.fn(),
		quadraticCurveTo: vi.fn(),
		bezierCurveTo: vi.fn(),
		rect: vi.fn(),
		clip: vi.fn(),
		fill: vi.fn(),
		stroke: vi.fn(),
		translate: vi.fn(),
		rotate: vi.fn(),
		scale: vi.fn(),
		clearRect: vi.fn(),
		drawImage: vi.fn(),
		fillText: vi.fn(),
		strokeText: vi.fn(),
		measureText: vi.fn((text: string) => ({
			width: Array.from(text).length * 10,
		})),
		globalAlpha: 1,
		globalCompositeOperation: "source-over",
		filter: "none",
		font: "",
		fillStyle: "#000000",
		strokeStyle: "#000000",
		lineWidth: 1,
		lineJoin: "miter",
		lineCap: "butt",
		shadowColor: "transparent",
		shadowBlur: 0,
		shadowOffsetX: 0,
		shadowOffsetY: 0,
		textAlign: "start",
		textBaseline: "alphabetic",
	} as unknown as CanvasRenderingContext2D;
}

function entranceAnimation(): NonNullable<TextElement["textAnimations"]> {
	return {
		schemaVersion: 1,
		entrance: {
			timing: { duration: 1, delay: 0, easing: "linear" },
			sequence: {
				unit: "grapheme",
				order: "forward",
				staggerRatio: 0.5,
				seed: 1,
			},
			target: "text",
			effect: {
				kind: "scale",
				hiddenScale: 0.2,
				overshoot: 0.1,
				fade: true,
			},
		},
	};
}

function laserEntranceAnimation({
	direction,
}: {
	direction: "left" | "right" | "up" | "down";
}): NonNullable<TextElement["textAnimations"]> {
	return {
		schemaVersion: 1,
		entrance: {
			timing: { duration: 1, delay: 0, easing: "linear" },
			sequence: {
				unit: "all",
				order: "forward",
				staggerRatio: 0,
				seed: 1,
			},
			target: "text",
			effect: {
				kind: "laser",
				direction,
				color: "#22d3ee",
				thicknessPx: 2,
				glowPx: 8,
				trail: 0.5,
				fade: true,
			},
		},
	};
}

function shatterExitAnimation(): NonNullable<TextElement["textAnimations"]> {
	return {
		schemaVersion: 1,
		exit: {
			timing: { duration: 1, delay: 0, easing: "linear" },
			sequence: {
				unit: "all",
				order: "forward",
				staggerRatio: 0,
				seed: 1,
			},
			target: "textAndBackground",
			effect: {
				kind: "shatter",
				tilePx: 4,
				distortion: 0.2,
				gravity: { value: 0.2, unit: "em" },
				gravityRotDeg: 180,
				front: "noise",
				frontRotDeg: 0,
				feather: 0.5,
			},
		},
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("text animation canvas layout", () => {
	it("keeps Unicode grapheme clusters aligned with evaluator indices", () => {
		const context = createContext();
		const element = createTextElement({
			overrides: {
				content: "A👨‍👩‍👧‍👦e\u0301\nB",
				verticalAlign: "top",
			},
		});
		const style = resolveTextStyle(element);
		context.font = "40px Arial";

		const layout = buildTextAnimationCanvasLayout({
			ctx: context,
			element,
			style,
			boxLeft: -120,
			boxTop: -60,
			boxWidth: 240,
			boxHeight: 120,
		});

		expect(layout.graphemes.map(({ text }) => text)).toEqual([
			"A",
			"👨‍👩‍👧‍👦",
			"e\u0301",
			"\n",
			"B",
		]);
		expect(layout.animationLayout.graphemes).toHaveLength(5);
		expect(layout.graphemes[3].bounds.width).toBe(0);
		expect(layout.graphemes[4].lineIndex).toBe(1);
	});

	it("uses one curved transform per grapheme instead of per code point", () => {
		const context = createContext();
		const element = createTextElement({
			overrides: {
				content: "🎬好",
				curve: 80,
			},
		});

		const layout = buildTextAnimationCanvasLayout({
			ctx: context,
			element,
			style: resolveTextStyle(element),
			boxLeft: -120,
			boxTop: -60,
			boxWidth: 240,
			boxHeight: 120,
		});

		expect(layout.graphemes).toHaveLength(2);
		expect(layout.graphemes[0].rotationDeg).not.toBe(0);
		expect(layout.graphemes[1].rotationDeg).not.toBe(0);
	});

	it("positions the cursor at the initial and next-line insertion points", () => {
		const context = createContext();
		const element = createTextElement({
			overrides: {
				content: "A\nB",
				verticalAlign: "top",
			},
		});
		const layout = buildTextAnimationCanvasLayout({
			ctx: context,
			element,
			style: resolveTextStyle(element),
			boxLeft: -120,
			boxTop: -60,
			boxWidth: 240,
			boxHeight: 120,
		});
		const first = layout.graphemes[0];
		const nextLine = layout.graphemes[2];

		expect(resolveCursorPosition({ layout, afterGrapheme: 0 })).toEqual({
			x: first.bounds.x,
			y: first.anchorY,
			rotationDeg: first.rotationDeg,
			textBaseline: first.textBaseline,
		});
		expect(resolveCursorPosition({ layout, afterGrapheme: 2 })).toEqual({
			x: nextLine.bounds.x,
			y: nextLine.anchorY,
			rotationDeg: nextLine.rotationDeg,
			textBaseline: nextLine.textBaseline,
		});
	});
});

describe("text animation canvas transforms", () => {
	it("rotates bottom-pivot effects around the glyph baseline", () => {
		const context = createContext();

		applyTextAnimationVisualState({
			ctx: context,
			bounds: { x: 10, y: 20, width: 80, height: 30 },
			visual: {
				opacity: 1,
				translateX: 0,
				translateY: 0,
				scaleX: 1,
				scaleY: 1,
				rotationDeg: 20,
				blurPx: 0,
				transformOrigin: "bottomCenter",
			},
		});

		expect(vi.mocked(context.translate).mock.calls).toEqual([
			[0, 0],
			[50, 50],
			[-50, -50],
		]);
	});
});

describe("compiled text animation cache", () => {
	it("reuses only the most recent timing key for each animation object", () => {
		const textAnimations = entranceAnimation();
		const original = createTextElement({
			overrides: { textAnimations },
		});
		const first = getCachedCompiledTextAnimation({
			element: original,
			fps: 30,
		});
		const same = getCachedCompiledTextAnimation({
			element: { ...original },
			fps: 30,
		});
		const changed = getCachedCompiledTextAnimation({
			element: { ...original, content: "Changed" },
			fps: 30,
		});
		const originalAgain = getCachedCompiledTextAnimation({
			element: original,
			fps: 30,
		});

		expect(same).toBe(first);
		expect(changed).not.toBe(first);
		expect(originalAgain).not.toBe(first);
	});
});

describe("canonical text animation canvas renderer", () => {
	it("leaves legacy text on the existing renderer path", () => {
		const context = createContext();
		const element = createTextElement();

		expect(
			renderCanonicalTextAnimationToCanvas({
				ctx: context,
				canvas: { width: 1280, height: 720 },
				sourceElement: element,
				renderedElement: element,
				style: resolveTextStyle(element),
				currentTime: 0.5,
				fps: 30,
			})
		).toBe(false);
		expect(context.fillText).not.toHaveBeenCalled();
	});

	it("handles canonical frames and applies evaluator transforms", () => {
		const context = createContext();
		const element = createTextElement({
			overrides: { textAnimations: entranceAnimation() },
		});

		expect(
			renderCanonicalTextAnimationToCanvas({
				ctx: context,
				canvas: { width: 1280, height: 720 },
				sourceElement: element,
				renderedElement: element,
				style: resolveTextStyle(element),
				currentTime: 0.4,
				fps: 30,
			})
		).toBe(true);
		expect(context.scale).toHaveBeenCalled();
		expect(context.fillText).toHaveBeenCalledWith("H", 0, 0);
	});

	it("falls back to glyph rendering when shatter rasterization fails", () => {
		vi.stubGlobal(
			"OffscreenCanvas",
			class {
				getContext(): null {
					return null;
				}
			}
		);
		const context = createContext();
		const element = createTextElement({
			overrides: {
				content: "H",
				textAnimations: shatterExitAnimation(),
			},
		});

		expect(
			renderCanonicalTextAnimationToCanvas({
				ctx: context,
				canvas: { width: 1280, height: 720 },
				sourceElement: element,
				renderedElement: element,
				style: resolveTextStyle(element),
				currentTime: 1.5,
				fps: 30,
			})
		).toBe(true);
		expect(context.drawImage).not.toHaveBeenCalled();
		expect(context.fillText).toHaveBeenCalledWith("H", 0, 0);
	});

	it("expands the shatter raster to capture glow ink", () => {
		const rasterSizes: Array<{ width: number; height: number }> = [];
		vi.stubGlobal(
			"OffscreenCanvas",
			class {
				readonly width: number;
				readonly height: number;
				private readonly context = createContext();

				constructor(width: number, height: number) {
					this.width = width;
					this.height = height;
					rasterSizes.push({ width, height });
				}

				getContext(): CanvasRenderingContext2D {
					return this.context;
				}
			}
		);
		const plain = createTextElement({
			overrides: {
				content: "H",
				textAnimations: shatterExitAnimation(),
			},
		});
		const glowing = {
			...plain,
			id: "text-glow",
			glowOpacity: 1,
			glowBlur: 80,
		};

		for (const element of [plain, glowing]) {
			renderCanonicalTextAnimationToCanvas({
				ctx: createContext(),
				canvas: { width: 1280, height: 720 },
				sourceElement: element,
				renderedElement: element,
				style: resolveTextStyle(element),
				currentTime: 1.5,
				fps: 30,
			});
		}

		expect(rasterSizes).toHaveLength(2);
		expect(rasterSizes[1].width - rasterSizes[0].width).toBe(152);
		expect(rasterSizes[1].height - rasterSizes[0].height).toBe(152);
	});

	it.each([
		["right", "vertical"],
		["left", "vertical"],
		["down", "horizontal"],
		["up", "horizontal"],
	] as const)("draws a %s laser as a %s scanner bar", (direction, orientation) => {
		const context = createContext();
		const element = createTextElement({
			overrides: {
				content: "H",
				textAnimations: laserEntranceAnimation({ direction }),
			},
		});

		renderCanonicalTextAnimationToCanvas({
			ctx: context,
			canvas: { width: 1280, height: 720 },
			sourceElement: element,
			renderedElement: element,
			style: resolveTextStyle(element),
			currentTime: 0.5,
			fps: 30,
		});

		const moveCalls = vi.mocked(context.moveTo).mock.calls;
		const lineCalls = vi.mocked(context.lineTo).mock.calls;
		const [startX, startY] = moveCalls[moveCalls.length - 1];
		const [endX, endY] = lineCalls[lineCalls.length - 1];
		if (orientation === "vertical") {
			expect(endX).toBe(startX);
			expect(endY).not.toBe(startY);
			return;
		}
		expect(endY).toBe(startY);
		expect(endX).not.toBe(startX);
	});

	it("owns out-of-range canonical frames without drawing stale text", () => {
		const context = createContext();
		const element = createTextElement({
			overrides: {
				startTime: 2,
				textAnimations: entranceAnimation(),
			},
		});

		expect(
			renderCanonicalTextAnimationToCanvas({
				ctx: context,
				canvas: { width: 1280, height: 720 },
				sourceElement: element,
				renderedElement: element,
				style: resolveTextStyle(element),
				currentTime: 1,
				fps: 30,
			})
		).toBe(true);
		expect(context.fillText).not.toHaveBeenCalled();
	});
});
