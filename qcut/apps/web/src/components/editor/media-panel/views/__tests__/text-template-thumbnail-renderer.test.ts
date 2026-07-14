import { describe, expect, it } from "vitest";
import {
	getThumbnailPreviewContent,
	getTextTemplateThumbnailLayoutKind,
	getTextTemplateThumbnailRecipe,
	type TextThumbnailBackgroundKind,
} from "../text-template-thumbnail-renderer";
import { getTextTemplateDefinitionsByCategory } from "@/lib/text/text-template-registry";
import type { TextElement } from "@/types/timeline";

function createTextElement({ content }: { content: string }): TextElement {
	return {
		id: "text-1",
		type: "text",
		name: "Text",
		content,
		fontSize: 64,
		fontFamily: "Arial",
		color: "#ffffff",
		backgroundColor: "transparent",
		textAlign: "center",
		fontWeight: "normal",
		fontStyle: "normal",
		textDecoration: "none",
		x: 0,
		y: 0,
		rotation: 0,
		opacity: 1,
		duration: 5,
		startTime: 0,
		trimStart: 0,
		trimEnd: 0,
	};
}

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
		const redDefinitions = getTextTemplateDefinitionsByCategory({
			category: "red",
		});
		expect(
			getBackgroundKindsForCategory({ category: "red" }).slice(0, 3)
		).toEqual(["burst", "lava", "fire"]);
		expect(
			getBackgroundKindsForCategory({ category: "texture" }).slice(0, 4)
		).toEqual(["texture", "paper", "chrome", "pixel"]);
		expect(
			getBackgroundKindsForCategory({ category: "gradient" }).slice(0, 4)
		).toEqual(["gradient", "gradient", "glass", "gradient"]);
		expect(
			redDefinitions
				.slice(0, 3)
				.every(
					(definition) =>
						getTextTemplateThumbnailRecipe({ definition }).materialDetail ===
						"rich"
				)
		).toBe(true);
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
				expect(recipe.materialDetail.length).toBeGreaterThan(0);
			}
		}
	});

	it("uses compact localized labels for thumbnail preview text", () => {
		const fancyDefinition = getTextTemplateDefinitionsByCategory({
			category: "popular",
		})[0];
		const headlineDefinition = getTextTemplateDefinitionsByCategory({
			category: "headline-template",
		})[0];
		const basicDefinition = getTextTemplateDefinitionsByCategory({
			category: "basic",
		})[0];
		const template = createTextElement({
			content: "Long English preview content",
		});

		expect(
			getThumbnailPreviewContent({ definition: fancyDefinition, template })
		).toBe("花字");
		expect(
			getThumbnailPreviewContent({ definition: headlineDefinition, template })
		).toBe("标题");
		expect(
			getThumbnailPreviewContent({ definition: basicDefinition, template })
		).toBe("文字");
	});

	it("uses pack layout previews for multi-element template categories", () => {
		const templateCategories = [
			"headline-template",
			"quote-template",
			"list-template",
			"split-template",
			"timeline-template",
		] as const;
		for (const category of templateCategories) {
			const definition = getTextTemplateDefinitionsByCategory({ category })[0];
			expect(getTextTemplateThumbnailLayoutKind({ definition })).toBe("pack");
		}
		expect(
			getTextTemplateThumbnailLayoutKind({
				definition: getTextTemplateDefinitionsByCategory({
					category: "red",
				})[0],
			})
		).toBe("single");
	});
});
