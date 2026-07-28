import { describe, expect, it } from "vitest";
import {
	createTextAnimationPresetPreview,
	evaluateTextAnimationPresetPreview,
} from "../text-animation-preset-preview";
import { TEXT_ANIMATION_PRESETS } from "../text-animation-presets";

function preset({
	phase,
	id,
}: {
	phase: keyof typeof TEXT_ANIMATION_PRESETS;
	id: string;
}) {
	const result = TEXT_ANIMATION_PRESETS[phase].find(
		(candidate) => candidate.id === id
	);
	expect(result).toBeDefined();
	return result!;
}

describe("text animation preset preview", () => {
	it("uses the canonical evaluator for entrance frames", () => {
		const preview = createTextAnimationPresetPreview({
			preset: preset({ phase: "entrance", id: "typewriter-cursor" }),
		});
		const start = evaluateTextAnimationPresetPreview({
			preview,
			progress: 0,
		});
		const nearEnd = evaluateTextAnimationPresetPreview({
			preview,
			progress: 0.9,
		});

		expect(start.activePhases).toContain("entrance");
		expect(start.units.every((unit) => unit.visual.opacity === 0)).toBe(true);
		expect(
			nearEnd.units.filter((unit) => unit.visual.opacity > 0).length
		).toBeGreaterThan(0);
		expect(nearEnd.decorations.some(({ kind }) => kind === "cursor")).toBe(
			true
		);
	});

	it("samples the active exit window rather than the clip start", () => {
		const preview = createTextAnimationPresetPreview({
			preset: preset({ phase: "exit", id: "fade-out" }),
		});
		const frame = evaluateTextAnimationPresetPreview({
			preview,
			progress: 0.7,
		});

		expect(frame.activePhases).toEqual(["exit"]);
		expect(frame.container.opacity).toBeLessThan(1);
	});

	it("samples the first canonical loop cycle deterministically", () => {
		const preview = createTextAnimationPresetPreview({
			preset: preset({ phase: "loop", id: "rotate" }),
		});
		const first = evaluateTextAnimationPresetPreview({
			preview,
			progress: 0.25,
		});
		const repeated = evaluateTextAnimationPresetPreview({
			preview,
			progress: 0.25,
		});

		expect(first.activePhases).toEqual(["loop"]);
		expect(first).toEqual(repeated);
		expect(first.container.rotationDeg).toBeGreaterThan(0);
	});
});
