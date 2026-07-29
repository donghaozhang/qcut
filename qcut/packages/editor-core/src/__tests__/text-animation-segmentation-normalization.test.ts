import { describe, expect, it } from "vitest";
import type { TextElement } from "../types/timeline.js";
import {
	isCanonicalTextAnimations,
	normalizeTextAnimations,
	segmentGraphemesFallback,
	segmentText,
	TEXT_ANIMATION_SCHEMA_VERSION,
	type TextAnimationsV1,
} from "../text-animation/index.js";
import {
	createAnimation,
	createElement,
	createPhase,
} from "./text-animation-test-helpers.js";

describe("text animation segmentation", () => {
	it("keeps emoji sequences, flags, and combining marks intact", () => {
		const content = "A👩🏽‍💻e\u0301🇦🇺";
		const expected = ["A", "👩🏽‍💻", "e\u0301", "🇦🇺"];

		expect(
			segmentText({ content, unit: "grapheme" }).map((segment) => segment.text)
		).toEqual(expected);
		expect(
			segmentGraphemesFallback({ content }).map((segment) => segment.text)
		).toEqual(expected);
	});

	it("attaches punctuation and whitespace without losing source text", () => {
		const content = "Hello, 世界!\nNext";
		const words = segmentText({ content, unit: "word" });
		const fallbackWords = segmentText({
			content,
			unit: "word",
			forceFallback: true,
		});

		expect(words.map((segment) => segment.text).join("")).toBe(content);
		expect(fallbackWords.map((segment) => segment.text).join("")).toBe(content);
		expect(words.length).toBeGreaterThanOrEqual(3);
		expect(fallbackWords.length).toBeGreaterThanOrEqual(3);
	});

	it("returns one segment for all and no segment for empty text", () => {
		expect(segmentText({ content: "A B", unit: "all" })).toEqual([
			{ start: 0, end: 3, text: "A B" },
		]);
		expect(segmentText({ content: "", unit: "grapheme" })).toEqual([]);
	});
});

describe("text animation normalization", () => {
	it("maps every supported legacy animation without changing its geometry", () => {
		const fade = normalizeTextAnimations({
			element: createElement({
				overrides: {
					animationType: "fade",
					animationDuration: 1.25,
					animationDelay: 0.2,
				},
			}),
		});
		const slideUp = normalizeTextAnimations({
			element: createElement({ overrides: { animationType: "slide-up" } }),
		});
		const slideLeft = normalizeTextAnimations({
			element: createElement({ overrides: { animationType: "slide-left" } }),
		});

		expect(fade.source).toBe("legacy");
		expect(fade.animation?.entrance).toMatchObject({
			effect: { kind: "fade", minimumOpacity: 0 },
			timing: { duration: 1.25, delay: 0.2, easing: "linear" },
			target: "textAndBackground",
			sequence: { unit: "all", staggerRatio: 0 },
		});
		expect(slideUp.animation?.entrance?.effect).toEqual({
			kind: "slide",
			direction: "up",
			distance: { value: 80, unit: "px" },
			fade: true,
		});
		expect(slideLeft.animation?.entrance?.effect).toEqual({
			kind: "slide",
			direction: "left",
			distance: { value: 120, unit: "px" },
			fade: true,
		});
	});

	it("preserves the legacy scale fallback as fade", () => {
		const element = createElement() as TextElement & { animationType: "scale" };
		element.animationType = "scale";
		const result = normalizeTextAnimations({ element });

		expect(result.animation?.entrance?.effect.kind).toBe("fade");
		expect(result.issues).toEqual([
			{ code: "legacy-scale-preserved-as-fade", path: "animationType" },
		]);
	});

	it("makes canonical animation authoritative and normalizes illegal combinations", () => {
		const textAnimations = createAnimation({
			entrance: createPhase({
				effect: {
					kind: "typewriter",
					reveal: "step",
					cursor: { text: "|", blinkPeriod: 0.5, persist: true },
				},
				unit: "word",
				target: "textAndBackground",
				staggerRatio: 2,
			}),
		});
		const element = createElement({
			overrides: { animationType: "slide-left", textAnimations },
		});
		const result = normalizeTextAnimations({ element });

		expect(result.source).toBe("canonical");
		expect(result.animation?.entrance).toMatchObject({
			target: "text",
			sequence: { unit: "grapheme", staggerRatio: 0.95 },
			effect: { kind: "typewriter" },
		});
	});

	it("rejects future schemas without destructively interpreting them", () => {
		const value = { schemaVersion: 2, entrance: {} };
		const result = normalizeTextAnimations({
			element: createElement({
				overrides: { textAnimations: value as unknown as TextAnimationsV1 },
			}),
		});

		expect(result).toEqual({
			animation: null,
			source: "unsupported",
			issues: [
				{ code: "unsupported-schema", path: "textAnimations.schemaVersion" },
			],
		});
		expect(isCanonicalTextAnimations({ value })).toBe(false);
		expect(
			isCanonicalTextAnimations({
				value: { schemaVersion: TEXT_ANIMATION_SCHEMA_VERSION },
			})
		).toBe(true);
	});

	it("clamps non-finite and unsafe canonical values", () => {
		const animation = createAnimation({
			entrance: createPhase({
				effect: {
					kind: "scale",
					hiddenScale: Number.POSITIVE_INFINITY,
					overshoot: -1,
					fade: true,
				},
				duration: Number.NaN,
				delay: -5,
			}),
		});
		const result = normalizeTextAnimations({
			element: createElement({ overrides: { textAnimations: animation } }),
			fps: 25,
		});

		expect(result.animation?.entrance?.timing).toEqual({
			duration: 0.6,
			delay: 0,
			easing: "linear",
		});
		expect(result.animation?.entrance?.effect).toMatchObject({
			hiddenScale: 0.6,
			overshoot: 0,
		});
	});

	it("normalizes optional loop profiles without changing the schema", () => {
		const animation: TextAnimationsV1 = {
			schemaVersion: 1,
			entrance: createPhase({
				effect: {
					kind: "rotate",
					degrees: 20,
					fade: false,
					oscillation: {
						cycles: Number.POSITIVE_INFINITY,
						phaseEasing: "smoothstep",
						pivot: "bottomCenter",
					},
				},
			}),
			exit: createPhase({
				effect: {
					kind: "scale",
					hiddenScale: 0.85,
					overshoot: 0,
					fade: false,
					pulse: { cycles: -2, easing: "smoothstep" },
				},
			}),
			loop: {
				...createPhase({
					effect: {
						kind: "bounce",
						direction: "up",
						distance: { value: 0.2, unit: "em" },
						hiddenScale: 1,
						spring: {
							mass: 1,
							stiffness: 210,
							damping: 14,
							velocity: 0,
						},
						spatialWave: {
							spatialCycles: 500,
							phaseOffset: Number.NaN,
						},
					},
				}),
				repeat: { mode: "restart", gap: 0, phaseOffset: 0 },
			},
		};
		const result = normalizeTextAnimations({
			element: createElement({ overrides: { textAnimations: animation } }),
		});

		expect(result.animation?.schemaVersion).toBe(1);
		expect(result.animation?.entrance?.effect).toMatchObject({
			oscillation: {
				cycles: 1,
				phaseEasing: "smoothstep",
				pivot: "bottomCenter",
			},
		});
		expect(result.animation?.exit?.effect).toMatchObject({
			pulse: { cycles: 1, easing: "smoothstep" },
		});
		expect(result.animation?.loop?.effect).toMatchObject({
			spatialWave: { spatialCycles: 100, phaseOffset: 0 },
		});
	});
});
