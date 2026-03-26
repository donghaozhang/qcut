import { describe, it, expect } from "vitest";
import { planReplicate } from "../replicate-planner";
import type { VideoRecipe, ShotRecipe } from "../replicate-types";

function makeRecipe(shots: Partial<ShotRecipe>[]): VideoRecipe {
	return {
		version: 1,
		source: {
			filename: "test.mp4",
			duration: 30,
			resolution: { width: 1920, height: 1080 },
			fps: 30,
		},
		style: {
			genre: "tutorial",
			mood: "calm",
			colorPalette: [],
			pacing: "medium",
		},
		audio: { hasBGM: false, hasVoiceover: false },
		shots: shots.map((s, i) => ({
			index: i,
			startTime: i * 5,
			endTime: (i + 1) * 5,
			duration: 5,
			type: "medium" as const,
			camera: "static" as const,
			description: `Shot ${i}`,
			prompt: `Generate shot ${i}`,
			transition: "cut" as const,
			hasText: false,
			hasSubtitle: false,
			...s,
		})),
	};
}

describe("planReplicate", () => {
	it("converts all shots to a ViMax Script", () => {
		const recipe = makeRecipe([{}, {}]);
		const plan = planReplicate(recipe);
		expect(plan.script.scenes).toHaveLength(1);
		expect(plan.script.scenes[0].shots).toHaveLength(2);
		expect(plan.skippedCount).toBe(0);
	});

	it("skips title and transition shots when skipNonVisual is set", () => {
		const recipe = makeRecipe([
			{},
			{ type: "title" },
			{ type: "transition" },
			{},
		]);
		const plan = planReplicate(recipe, { skipNonVisual: true });
		expect(plan.script.scenes[0].shots).toHaveLength(2);
		expect(plan.skippedCount).toBe(2);
	});

	it("uses default model keys", () => {
		const recipe = makeRecipe([{}]);
		const plan = planReplicate(recipe);
		expect(plan.videoModel).toBe("kling_2_6_pro");
		expect(plan.imageModel).toBe("nano_banana_pro");
	});

	it("uses custom model keys", () => {
		const recipe = makeRecipe([{}]);
		const plan = planReplicate(recipe, {
			videoModel: "veo3",
			imageModel: "flux_dev",
		});
		expect(plan.videoModel).toBe("veo3");
		expect(plan.imageModel).toBe("flux_dev");
	});

	it("preserves shot descriptions in converted script", () => {
		const recipe = makeRecipe([
			{ description: "Custom desc", prompt: "Custom prompt" },
		]);
		const plan = planReplicate(recipe);
		const shot = plan.script.scenes[0].shots[0];
		expect(shot.description).toBe("Custom desc");
		expect(shot.prompt_description).toBe("Custom prompt");
	});
});
