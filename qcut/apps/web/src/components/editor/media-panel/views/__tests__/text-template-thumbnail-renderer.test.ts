import { describe, expect, it } from "vitest";
import {
	getTextTemplateThumbnailRecipe,
	type TextThumbnailBackgroundKind,
} from "../text-template-thumbnail-renderer";
import { getTextTemplateDefinitionsByCategory } from "@/lib/text/text-template-registry";

function getBackgroundKindsForCategory({
	category,
	limit = 6,
}: {
	category: Parameters<
		typeof getTextTemplateDefinitionsByCategory
	>[0]["category"];
	limit?: number;
}): TextThumbnailBackgroundKind[] {
	return getTextTemplateDefinitionsByCategory({ category })
		.slice(0, limit)
		.map(
			(definition) =>
				getTextTemplateThumbnailRecipe({ definition }).backgroundKind
		);
}

describe("text template thumbnail renderer", () => {
	it("uses raster-style canvas recipes for curated color and texture categories", () => {
		expect(
			getBackgroundKindsForCategory({ category: "red" }).slice(0, 3)
		).toEqual(["burst", "lava", "fire"]);
		expect(
			getBackgroundKindsForCategory({ category: "texture" }).slice(0, 4)
		).toEqual(["texture", "paper", "chrome", "pixel"]);
		expect(
			getBackgroundKindsForCategory({ category: "gradient" }).slice(0, 4)
		).toEqual(["gradient", "gradient", "glass", "gradient"]);
	});

	it("keeps visible fancy cards on non-empty thumbnail recipes", () => {
		const fancyCategories = [
			"popular",
			"latest",
			"summer",
			"variety",
			"guofeng",
			"glow",
			"gradient",
			"texture",
			"red",
			"yellow",
			"black-white",
			"blue",
			"pink",
			"green",
			"purple",
		] as const;

		for (const category of fancyCategories) {
			const definitions = getTextTemplateDefinitionsByCategory({ category });
			expect(definitions.length).toBeGreaterThanOrEqual(20);
			for (const definition of definitions.slice(0, 10)) {
				const recipe = getTextTemplateThumbnailRecipe({ definition });
				expect(recipe.accentColors.length).toBeGreaterThanOrEqual(4);
				expect(recipe.backgroundKind.length).toBeGreaterThan(0);
				expect(recipe.textFillKind.length).toBeGreaterThan(0);
			}
		}
	});
});
