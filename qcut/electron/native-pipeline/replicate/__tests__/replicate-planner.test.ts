import { describe, it, expect } from "vitest";
import { planShots } from "../replicate-planner";
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

describe("planShots", () => {
	it("defaults to ai-video strategy", () => {
		const recipe = makeRecipe([{}, {}]);
		const planned = planShots(recipe);
		expect(planned).toHaveLength(2);
		expect(planned[0].strategy).toBe("ai-video");
		expect(planned[1].strategy).toBe("ai-video");
	});

	it("uses ai-image for title shots", () => {
		const recipe = makeRecipe([{ type: "title" }]);
		const planned = planShots(recipe);
		expect(planned[0].strategy).toBe("ai-image");
	});

	it("uses ai-image for transition shots", () => {
		const recipe = makeRecipe([{ type: "transition" }]);
		const planned = planShots(recipe);
		expect(planned[0].strategy).toBe("ai-image");
	});

	it("applies forceStrategy to all shots", () => {
		const recipe = makeRecipe([{}, { type: "title" }]);
		const planned = planShots(recipe, { forceStrategy: "skip" });
		expect(planned[0].strategy).toBe("skip");
		expect(planned[1].strategy).toBe("skip");
	});

	it("uses custom model keys", () => {
		const recipe = makeRecipe([{}, { type: "title" }]);
		const planned = planShots(recipe, {
			videoModel: "ltx_v2_3",
			imageModel: "flux_schnell",
		});
		expect(planned[0].model).toBe("ltx_v2_3");
		expect(planned[1].model).toBe("flux_schnell");
	});

	it("preserves original shot data", () => {
		const recipe = makeRecipe([
			{ description: "Custom desc", prompt: "Custom prompt" },
		]);
		const planned = planShots(recipe);
		expect(planned[0].description).toBe("Custom desc");
		expect(planned[0].prompt).toBe("Custom prompt");
		expect(planned[0].startTime).toBe(0);
	});
});
