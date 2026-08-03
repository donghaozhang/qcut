import { describe, expect, it } from "vitest";
import {
	TRANSITION_LAB_RECIPES,
	TRANSITION_LAB_VERTEX_SHADER,
} from "../../../../../../../../../electron/native-pipeline/transitions/transition-lab-catalog";
import { TRANSITION_LAB_PRESETS } from "../transition-lab-presets";

describe("Transition Lab catalog", () => {
	it("keeps UI presets and shader recipes in one-to-one correspondence", () => {
		expect(TRANSITION_LAB_PRESETS.map((preset) => preset.id)).toEqual(
			TRANSITION_LAB_RECIPES.map((recipe) => recipe.id)
		);
		expect(
			new Set(TRANSITION_LAB_PRESETS.map((preset) => preset.id)).size
		).toBe(TRANSITION_LAB_PRESETS.length);
	});

	it("contains only distributable clean-room shader source", () => {
		expect(TRANSITION_LAB_VERTEX_SHADER).toContain("void main()");
		for (const recipe of TRANSITION_LAB_RECIPES) {
			expect(recipe.shader.origin).toBe("qcut-clean-room");
			expect(recipe.shader.license).toBe("MIT");
			expect(recipe.shader.binaryAssets).toBe(false);
			expect(recipe.shader.fragmentSource).toContain("void main()");
			expect(recipe.shader.fragmentSource).not.toMatch(
				/Cache\/effect|\.bundle\b|\.bin\b|\.dat\b|\.zip\b/i
			);
		}
	});
});
