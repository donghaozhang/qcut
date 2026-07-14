import { describe, expect, it } from "vitest";
import { getTextTemplateDefinitionsByCategory } from "@/lib/text/text-template-registry";
import {
	buildTextTemplateDragData,
	getExpandedTextTemplateGridColumnCount,
	getTextTemplateGridColumnCount,
} from "../text";

describe("text view layout", () => {
	it("keeps the asset grid at four or five columns for typical panel widths", () => {
		expect(getTextTemplateGridColumnCount({ width: 520 })).toBe(5);
		expect(getTextTemplateGridColumnCount({ width: 460 })).toBe(5);
		expect(getTextTemplateGridColumnCount({ width: 380 })).toBe(4);
		expect(getTextTemplateGridColumnCount({ width: 320 })).toBe(4);
	});

	it("falls back gracefully below normal editor panel widths", () => {
		expect(getTextTemplateGridColumnCount({ width: 260 })).toBe(3);
		expect(getTextTemplateGridColumnCount({ width: 180 })).toBe(2);
	});

	it("uses the expanded asset browser grid density for wide browsing", () => {
		expect(getExpandedTextTemplateGridColumnCount()).toBe(5);
	});

	it("includes grouped template payloads for multi-element text drags", () => {
		const definition = getTextTemplateDefinitionsByCategory({
			category: "headline-template",
		})[0];
		const dragData = buildTextTemplateDragData({ definition });

		expect(dragData.textTemplate).toMatchObject({
			id: definition.id,
			type: "text",
		});
		expect(dragData.textTemplatePack?.id).toContain(definition.id);
		expect(dragData.textTemplatePack?.name).toContain(definition.name);
		expect(dragData.textTemplatePack?.elements.length).toBeGreaterThan(1);
	});

	it("keeps single text template drags compatible with older drop paths", () => {
		const definition = getTextTemplateDefinitionsByCategory({
			category: "basic",
		})[0];

		expect(buildTextTemplateDragData({ definition }).textTemplatePack).toBe(
			undefined
		);
	});
});
