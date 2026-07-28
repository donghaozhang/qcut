import type {
	TextAnimationEffect,
	TextAnimationPhaseBase,
	TextElement,
	TextAnimationsV1,
} from "@qcut/editor-core";
import { describe, expect, it } from "vitest";
import { resolveTextAnimationPreviewCrop } from "../text-animation-preview-crop";

const PROJECT_4K = { width: 3840, height: 2160 };

function phase({
	effect,
	target = "text",
}: {
	effect: TextAnimationEffect;
	target?: TextAnimationPhaseBase["target"];
}): TextAnimationPhaseBase {
	return {
		timing: { duration: 0.8, delay: 0, easing: "easeOut" },
		sequence: {
			unit: target === "text" ? "grapheme" : "all",
			order: "forward",
			staggerRatio: 0.4,
			seed: 42,
		},
		target,
		effect,
	};
}

function createTextElement({
	textAnimations,
	overrides = {},
}: {
	textAnimations: TextAnimationsV1;
	overrides?: Partial<TextElement>;
}): TextElement {
	return {
		id: "crop-text",
		type: "text",
		name: "Animated title",
		content: "Hello Melbourne",
		fontSize: 64,
		fontFamily: "Arial",
		color: "#ffffff",
		backgroundColor: "transparent",
		textAlign: "center",
		fontWeight: "bold",
		fontStyle: "normal",
		textDecoration: "none",
		x: 0,
		y: 0,
		rotation: 0,
		opacity: 1,
		width: 640,
		height: 180,
		duration: 5,
		startTime: 0,
		trimStart: 0,
		trimEnd: 0,
		textAnimations,
		...overrides,
	};
}

function cropFor({
	element,
	canvas = PROJECT_4K,
}: {
	element: TextElement;
	canvas?: { width: number; height: number };
}) {
	return resolveTextAnimationPreviewCrop({
		element,
		canvas,
		boxWidth: element.width ?? 640,
		boxHeight: element.height ?? 180,
		fps: 30,
	});
}

describe("resolveTextAnimationPreviewCrop", () => {
	it("contains the rotated text box and paint overscan", () => {
		const element = createTextElement({
			textAnimations: {
				schemaVersion: 1,
				entrance: phase({
					effect: { kind: "fade", minimumOpacity: 0 },
					target: "textAndBackground",
				}),
			},
			overrides: { rotation: 45 },
		});
		const crop = cropFor({ element });
		const centerX = PROJECT_4K.width / 2;
		const centerY = PROJECT_4K.height / 2;
		const rotatedHalfWidth =
			Math.abs(Math.cos(Math.PI / 4)) * 320 +
			Math.abs(Math.sin(Math.PI / 4)) * 90;
		const rotatedHalfHeight =
			Math.abs(Math.sin(Math.PI / 4)) * 320 +
			Math.abs(Math.cos(Math.PI / 4)) * 90;

		expect(crop.x).toBeLessThanOrEqual(Math.floor(centerX - rotatedHalfWidth));
		expect(crop.y).toBeLessThanOrEqual(Math.floor(centerY - rotatedHalfHeight));
		expect(crop.x + crop.width).toBeGreaterThanOrEqual(
			Math.ceil(centerX + rotatedHalfWidth)
		);
		expect(crop.y + crop.height).toBeGreaterThanOrEqual(
			Math.ceil(centerY + rotatedHalfHeight)
		);
	});

	it("adds movement and effect rotation to the stable lifetime crop", () => {
		const plain = cropFor({
			element: createTextElement({
				textAnimations: {
					schemaVersion: 1,
					entrance: phase({
						effect: { kind: "fade", minimumOpacity: 0 },
					}),
				},
			}),
		});
		const animated = cropFor({
			element: createTextElement({
				textAnimations: {
					schemaVersion: 1,
					entrance: phase({
						effect: {
							kind: "rotate",
							degrees: -40,
							travelDirection: "right",
							distance: { value: 0.5, unit: "boxWidth" },
							fade: true,
						},
					}),
				},
			}),
		});

		expect(animated.x).toBeLessThan(plain.x - 250);
		expect(animated.x + animated.width).toBeGreaterThan(
			plain.x + plain.width + 250
		);
		expect(animated.height).toBeGreaterThan(plain.height * 2);
	});

	it("reserves blur, laser glow, and heart particle overscan", () => {
		const plain = cropFor({
			element: createTextElement({
				textAnimations: {
					schemaVersion: 1,
					entrance: phase({
						effect: { kind: "fade", minimumOpacity: 0 },
					}),
				},
			}),
		});
		const decorated = cropFor({
			element: createTextElement({
				textAnimations: {
					schemaVersion: 1,
					entrance: phase({
						effect: {
							kind: "heart",
							direction: "up",
							distance: { value: 0.2, unit: "boxHeight" },
							hiddenScale: 0.55,
							color: "#fb7185",
							particleCount: 6,
							spread: 1.2,
							seed: 7,
						},
					}),
					loop: {
						...phase({
							effect: {
								kind: "laser",
								direction: "right",
								color: "#22d3ee",
								thicknessPx: 4,
								glowPx: 24,
								trail: 0.8,
								fade: false,
							},
						}),
						repeat: { mode: "restart", gap: 0, phaseOffset: 0 },
					},
					exit: phase({
						effect: {
							kind: "blur",
							direction: "right",
							distance: { value: 0.2, unit: "boxWidth" },
							radiusPx: 20,
							fade: true,
						},
					}),
				},
			}),
		});

		expect(decorated.width).toBeGreaterThan(plain.width + 350);
		expect(decorated.height).toBeGreaterThan(plain.height + 250);
	});

	it("keeps ten representative 4K layers far below ten full canvases", () => {
		const crop = cropFor({
			element: createTextElement({
				textAnimations: {
					schemaVersion: 1,
					entrance: phase({
						effect: {
							kind: "rotate",
							degrees: -40,
							travelDirection: "right",
							distance: { value: 0.22, unit: "boxWidth" },
							fade: true,
						},
					}),
					loop: {
						...phase({
							effect: {
								kind: "laser",
								direction: "right",
								color: "#22d3ee",
								thicknessPx: 2,
								glowPx: 14,
								trail: 0.55,
								fade: false,
							},
						}),
						repeat: { mode: "restart", gap: 0, phaseOffset: 0 },
					},
				},
			}),
		});
		const projectPixels = PROJECT_4K.width * PROJECT_4K.height;
		const tenCroppedLayerPixels = crop.width * crop.height * 10;
		const tenFullLayerPixels = projectPixels * 10;

		expect(crop.width * crop.height).toBeLessThan(projectPixels * 0.2);
		expect(tenCroppedLayerPixels).toBeLessThan(projectPixels * 2);
		expect(tenCroppedLayerPixels).toBeLessThan(tenFullLayerPixels * 0.2);
	});
});
