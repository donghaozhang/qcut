import { describe, expect, it } from "vitest";
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
}: {
	type?: VideoTransition["type"];
	direction?: VideoTransition["direction"];
	duration?: number;
	easing?: VideoTransition["easing"];
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
		{ type: "slide", direction: "left", expected: "b0(" },
		{ type: "wipe", direction: "right", expected: "gte(X" },
	] satisfies Array<{
		type: VideoTransition["type"];
		direction: VideoTransition["direction"] | undefined;
		expected: string;
	}>)(
		"builds a custom parity expression for $type",
		({ type, direction, expected }) => {
			const filter = buildXfadeTransitionFilter({
				transition: transition({ type, direction }),
			});
			expect(filter.transition).toBe("custom");
			expect(filter.expression).toContain(expected);
			expect(filter.expression).toContain("pow((1-P),3)");
		}
	);
});
