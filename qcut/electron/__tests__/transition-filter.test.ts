import { describe, expect, it } from "vitest";
import {
	getClipTransitionPresetConfig,
	transitionPresets,
} from "../../apps/web/src/components/editor/media-panel/views/transitions/transition-presets";
import {
	buildXfadeTransitionFilter,
	canUseTransitionSourceHandles,
	prepareTransitionSource,
} from "../ffmpeg/transition-filter";
import type { VideoSource, VideoTransition } from "../ffmpeg/types";

function transition({
	type = "dissolve",
	direction,
	duration = 1,
	easing = "easeInOut",
	tuning,
}: {
	type?: VideoTransition["type"];
	direction?: VideoTransition["direction"];
	duration?: number;
	easing?: VideoTransition["easing"];
	tuning?: VideoTransition["tuning"];
} = {}): VideoTransition {
	return {
		id: "transition-1",
		trackId: "track-1",
		fromElementId: "clip-a",
		toElementId: "clip-b",
		presetId: type,
		type,
		direction,
		easing,
		duration,
		tuning,
	};
}

function source(overrides: Partial<VideoSource> = {}): VideoSource {
	return {
		elementId: "clip-a",
		trackId: "track-1",
		path: "/source.mp4",
		startTime: 0,
		duration: 10,
		trimStart: 2,
		trimEnd: 3,
		playbackRate: 1,
		...overrides,
	};
}

describe("FFmpeg transition filters", () => {
	it("exports every visible transition preset through the production filter", () => {
		for (const preset of transitionPresets) {
			const config = getClipTransitionPresetConfig({ preset });
			expect(
				config,
				`${preset.id} is missing its timeline mapping`
			).not.toBeNull();
			if (!config) continue;

			const filter = buildXfadeTransitionFilter({
				transition: {
					...transition({
						type: config.type,
						direction: config.direction,
						duration: preset.defaultDuration,
						tuning: config.tuning,
					}),
					presetId: preset.id,
				},
			});
			expect(filter.transition).toBe("custom");
			expect(filter.expression.length).toBeGreaterThan(0);
		}
	});

	it("uses real source handles at constant speed", () => {
		const prepared = prepareTransitionSource({
			source: source({ playbackRate: 2 }),
			previousTransition: transition({ duration: 1 }),
			nextTransition: transition({ duration: 2 }),
		});

		expect(prepared.source.trimStart).toBe(1);
		expect(prepared.source.trimEnd).toBe(1);
		expect(prepared.handleBefore).toBe(0.5);
		expect(prepared.handleAfter).toBe(1);
		expect(prepared.leadingPad).toBe(0);
		expect(prepared.trailingPad).toBe(0);
		expect(prepared.usesSourceHandles).toBe(true);
	});

	it("holds only the part of a transition missing a source handle", () => {
		const prepared = prepareTransitionSource({
			source: source({ trimStart: 0.2, trimEnd: 0.1 }),
			previousTransition: transition({ duration: 1 }),
			nextTransition: transition({ duration: 1 }),
		});

		expect(prepared.source.trimStart).toBe(0);
		expect(prepared.source.trimEnd).toBe(0);
		expect(prepared.handleBefore).toBe(0.2);
		expect(prepared.handleAfter).toBe(0.1);
		expect(prepared.leadingPad).toBeCloseTo(0.3);
		expect(prepared.trailingPad).toBeCloseTo(0.4);
	});

	it.each([
		{ reason: "speed curve", source: source({ speedKeyframes: [] }) },
		{ reason: "reverse", source: source({ reverse: true }) },
		{
			reason: "freeze frame",
			source: source({ freezeFrameDuration: 0.5 }),
		},
		{
			reason: "visual keyframes",
			source: source({
				visual: {
					keyframes: {
						x: [
							{
								id: "x-1",
								frame: 0,
								value: 0,
								easing: "linear",
							},
						],
					},
				} as VideoSource["visual"],
			}),
		},
	])("does not consume source handles for $reason", ({ source: input }) => {
		if (input.speedKeyframes) {
			input.speedKeyframes = [
				{ id: "speed-1", frame: 0, value: 1, easing: "linear" },
			];
		}
		expect(canUseTransitionSourceHandles({ source: input })).toBe(false);
		const prepared = prepareTransitionSource({
			source: input,
			nextTransition: transition({ duration: 1 }),
		});
		expect(prepared.handleAfter).toBe(0);
		expect(prepared.trailingPad).toBe(0.5);
	});

	it.each([
		{ type: "dissolve", direction: undefined, expected: "A*(1-(" },
		{ type: "fade-black", direction: undefined, expected: "eq(PLANE,3)" },
		{ type: "fade-white", direction: undefined, expected: "+255*" },
		{ type: "slide", direction: "left", expected: "b0(" },
		{ type: "push", direction: "up", expected: "a0(" },
		{ type: "wipe", direction: "right", expected: "gte(X" },
		{ type: "zoom-blur", direction: undefined, expected: "W/2+(X-W/2)" },
		{ type: "whip-pan", direction: "left", expected: "0.045*W" },
		{ type: "flash", direction: undefined, expected: "eq(PLANE,0),255" },
		{ type: "light-leak", direction: undefined, expected: "eq(PLANE,0),90" },
		{ type: "rgb-glitch", direction: undefined, expected: "mod(Y,12)" },
		{ type: "shake", direction: undefined, expected: "sin((" },
		{ type: "motion-blur", direction: "left", expected: ")/5" },
		{ type: "pixelate", direction: undefined, expected: "floor(X/" },
		{ type: "water-ripple", direction: undefined, expected: "sqrt(pow(" },
		{
			type: "particle-dissolve",
			direction: undefined,
			expected: "abs(sin(floor(X/",
		},
		{
			type: "glass-refraction",
			direction: "right",
			expected: "mod(floor(Y/",
		},
		{ type: "page-flip", direction: "up", expected: "abs(Y-" },
		{ type: "texture-mask", direction: undefined, expected: "sin(X/W*" },
		{ type: "lens-flare", direction: undefined, expected: "0.035*H" },
	] satisfies Array<{
		type: VideoTransition["type"];
		direction: VideoTransition["direction"] | undefined;
		expected: string;
	}>)("builds a custom parity expression for $type", ({
		type,
		direction,
		expected,
	}) => {
		const filter = buildXfadeTransitionFilter({
			transition: transition({ type, direction }),
		});
		expect(filter.transition).toBe("custom");
		expect(filter.expression).toContain(expected);
		expect(filter.expression).toContain("pow((1-P),3)");
	});

	it("serializes tuning into visibly distinct export expressions", () => {
		const soft = buildXfadeTransitionFilter({
			transition: transition({
				type: "rgb-glitch",
				tuning: { intensity: 0.3, frequency: 0.5 },
			}),
		});
		const strong = buildXfadeTransitionFilter({
			transition: transition({
				type: "rgb-glitch",
				tuning: { intensity: 1.8, frequency: 3 },
			}),
		});
		expect(soft.expression).not.toBe(strong.expression);
		expect(soft.expression).toContain("0.012*W");
		expect(strong.expression).toContain("0.07200000000000001*W");
	});

	it("converts a tint to gbrap plane values for FFmpeg", () => {
		const filter = buildXfadeTransitionFilter({
			transition: transition({
				type: "light-leak",
				tuning: { tint: "#38bdf8" },
			}),
		});
		expect(filter.expression).toContain("eq(PLANE,0),189");
	});

	it("builds an expression for every engine and every mask shape", () => {
		const engineTypes = [
			"dissolve",
			"fade-black",
			"fade-white",
			"slide",
			"wipe",
			"push",
			"zoom-blur",
			"whip-pan",
			"flash",
			"light-leak",
			"rgb-glitch",
			"shake",
			"motion-blur",
			"pixelate",
			"water-ripple",
			"particle-dissolve",
			"glass-refraction",
			"page-flip",
			"texture-mask",
			"lens-flare",
			"vortex",
			"shockwave",
			"cube",
			"color-swipe",
		] as const;
		for (const type of engineTypes) {
			const filter = buildXfadeTransitionFilter({
				transition: transition({ type }),
			});
			expect(filter.transition).toBe("custom");
			expect(filter.expression.length).toBeGreaterThan(4);
		}

		const maskShapes = [
			"circle",
			"clock",
			"blinds",
			"cross",
			"triptych",
			"arrow",
			"heart",
			"star",
			"ink",
			"cloud",
			"fog",
			"drip",
			"curtain",
			"diagonal",
		];
		const expressions = new Set<string>();
		for (const maskShape of maskShapes) {
			const filter = buildXfadeTransitionFilter({
				transition: { ...transition({ type: "texture-mask" }), maskShape },
			});
			expect(filter.expression.length).toBeGreaterThan(4);
			expressions.add(filter.expression);
		}
		// Every shape must produce distinct export geometry.
		expect(expressions.size).toBe(maskShapes.length);
	});
});
