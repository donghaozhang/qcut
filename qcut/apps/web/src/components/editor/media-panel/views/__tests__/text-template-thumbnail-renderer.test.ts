import { describe, expect, it, vi } from "vitest";
import {
	getThumbnailPreviewContent,
	getTextTemplatePackPreviewBounds,
	getTextTemplatePackPreviewModel,
	getTextTemplateThumbnailLayoutKind,
	getTextTemplateThumbnailRecipe,
	renderTextTemplateThumbnail,
	type TextThumbnailBackgroundKind,
} from "../text-template-thumbnail-renderer";
import {
	buildTextTemplate,
	getTextTemplateDefinitionsByCategory,
} from "@/lib/text/text-template-registry";
import {
	applyTextTemplatePackCopy,
	buildTextTemplatePack,
} from "@/lib/text/text-template-packs";
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

function createCanvasFixture() {
	const gradient = { addColorStop: vi.fn() } as unknown as CanvasGradient;
	const clearRect = vi.fn();
	const fillRect = vi.fn();
	const context = new Proxy(
		{
			clearRect,
			createLinearGradient: vi.fn(() => gradient),
			createRadialGradient: vi.fn(() => gradient),
			fillRect,
		},
		{
			get(target, property, receiver) {
				if (Reflect.has(target, property)) {
					return Reflect.get(target, property, receiver);
				}
				const method = vi.fn();
				Reflect.set(target, property, method);
				return method;
			},
		}
	) as unknown as CanvasRenderingContext2D;
	const canvas = {
		getContext: vi.fn(() => context),
		height: 304,
		width: 320,
	} as unknown as HTMLCanvasElement;
	return { canvas, clearRect, fillRect };
}

describe("text template thumbnail renderer", () => {
	it("renders decorative cards over a transparent canvas", () => {
		const definition = getTextTemplateDefinitionsByCategory({
			category: "basic",
		})[0];
		const template = buildTextTemplate({ definition });
		const { canvas, clearRect, fillRect } = createCanvasFixture();

		renderTextTemplateThumbnail({ canvas, definition, template });

		expect(clearRect).toHaveBeenCalledWith(0, 0, 320, 304);
		expect(fillRect).not.toHaveBeenCalled();
	});

	it("retains scene backdrops for semantic packaging cards", () => {
		const definition = getTextTemplateDefinitionsByCategory({
			category: "cover-pack",
		})[0];
		const template = buildTextTemplate({ definition });
		const { canvas, fillRect } = createCanvasFixture();

		renderTextTemplateThumbnail({ canvas, definition, template });

		expect(fillRect).toHaveBeenCalledWith(0, 0, 320, 304);
	});

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

	it("builds pack preview models from template pack copy slots", () => {
		const template = createTextElement({ content: "主标题" });
		const expectedKinds = {
			"headline-template": "headline",
			"quote-template": "quote",
			"list-template": "list",
			"split-template": "split",
			"timeline-template": "timeline",
		} as const;

		for (const [category, expectedKind] of Object.entries(expectedKinds)) {
			const definition = getTextTemplateDefinitionsByCategory({
				category: category as keyof typeof expectedKinds,
			})[0];
			const model = getTextTemplatePackPreviewModel({ definition, template });

			expect(model).toMatchObject({
				kind: expectedKind,
				layerCount: expect.any(Number),
				decorations: expect.arrayContaining([
					expect.objectContaining({
						id: expect.any(String),
						kind: expect.any(String),
					}),
				]),
				elements: expect.arrayContaining([
					expect.objectContaining({
						content: expect.any(String),
						fontSize: expect.any(Number),
						height: expect.any(Number),
						id: expect.any(String),
						name: expect.any(String),
						width: expect.any(Number),
						x: expect.any(Number),
						y: expect.any(Number),
					}),
				]),
				slots: expect.arrayContaining([
					expect.objectContaining({
						content: expect.any(String),
						id: expect.any(String),
						label: expect.any(String),
					}),
				]),
			});
			expect(model?.layerCount).toBeGreaterThan(1);
			expect(model?.elements.length).toBe(model?.layerCount);
			expect(model?.slots.length).toBeGreaterThan(0);
			expect(model?.decorations.length).toBeGreaterThan(0);
		}
	});

	it("adds structural decorations for template pack thumbnails", () => {
		const template = createTextElement({ content: "主标题" });
		const headlineModel = getTextTemplatePackPreviewModel({
			definition: getTextTemplateDefinitionsByCategory({
				category: "headline-template",
			})[0],
			template,
		});
		const listModel = getTextTemplatePackPreviewModel({
			definition: getTextTemplateDefinitionsByCategory({
				category: "list-template",
			})[0],
			template,
		});
		const splitModel = getTextTemplatePackPreviewModel({
			definition: getTextTemplateDefinitionsByCategory({
				category: "split-template",
			})[0],
			template,
		});
		const timelineModel = getTextTemplatePackPreviewModel({
			definition: getTextTemplateDefinitionsByCategory({
				category: "timeline-template",
			})[0],
			template,
		});

		expect(
			headlineModel?.decorations.map((decoration) => decoration.id)
		).toEqual(["headline-panel", "headline-rule"]);
		expect(listModel?.decorations.map((decoration) => decoration.kind)).toEqual(
			["line", "circle", "circle"]
		);
		expect(splitModel?.decorations).toEqual([
			expect.objectContaining({ id: "split-divider", kind: "line" }),
		]);
		expect(
			timelineModel?.decorations.map((decoration) => decoration.id)
		).toEqual([
			"timeline-rail",
			"timeline-node-1",
			"timeline-node-2",
			"timeline-node-3",
		]);
	});

	it("includes pack decorations in thumbnail preview bounds", () => {
		const definition = getTextTemplateDefinitionsByCategory({
			category: "list-template",
		})[0];
		const template = createTextElement({ content: "主标题" });
		const model = getTextTemplatePackPreviewModel({ definition, template });
		if (!model) throw new Error("Expected list template pack model");

		const textOnlyBounds = getTextTemplatePackPreviewBounds({
			elements: model.elements,
		});
		const decoratedBounds = getTextTemplatePackPreviewBounds({
			decorations: model.decorations,
			elements: model.elements,
		});

		expect(decoratedBounds.minX).toBeLessThan(textOnlyBounds.minX);
		expect(decoratedBounds.maxY).toBeGreaterThanOrEqual(textOnlyBounds.maxY);
	});

	it("keeps real pack element geometry in thumbnail preview models", () => {
		const definition = getTextTemplateDefinitionsByCategory({
			category: "headline-template",
		})[0];
		const template = createTextElement({ content: "主标题" });
		const model = getTextTemplatePackPreviewModel({ definition, template });

		expect(model?.elements.map((element) => element.content)).toEqual([
			"本期重点",
			definition.content,
			"三句话讲清楚",
		]);

		const [kicker, headline, subhead] = model?.elements ?? [];
		expect(kicker?.y).toBeLessThan(headline?.y ?? 0);
		expect(headline?.y).toBeLessThan(subhead?.y ?? 0);
		expect(kicker?.backgroundColor).not.toBe("transparent");
		expect(headline?.width).toBeGreaterThan(kicker?.width ?? 0);
	});

	it("renders custom pack copy in thumbnail preview models", () => {
		const definition = getTextTemplateDefinitionsByCategory({
			category: "headline-template",
		})[0];
		const template = createTextElement({ content: "主标题" });
		const pack = buildTextTemplatePack({ baseTemplate: template, definition });
		if (!pack) throw new Error("Expected headline template pack");

		const customizedPack = applyTextTemplatePackCopy({
			contents: ["开场提醒", "新主标题", "新副标题"],
			pack,
		});
		const model = getTextTemplatePackPreviewModel({
			definition,
			pack: customizedPack,
			template,
		});

		expect(model?.slots.map((slot) => slot.content)).toEqual([
			"开场提醒",
			"新主标题",
			"新副标题",
		]);
		expect(model?.elements.map((element) => element.content)).toEqual([
			"开场提醒",
			"新主标题",
			"新副标题",
		]);
	});
});
