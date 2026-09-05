import { describe, expect, it } from "vitest";
import { resolveClaudeTextTemplate } from "../claude-text-template";
import { TEXT_TEMPLATES } from "@/lib/text/text-template-registry";
import { BUILT_IN_TEXT_PRESETS } from "@/lib/text/text-presets";

describe("Compose text template materialization", () => {
	it("uses real registry properties while preserving editable content and identity", () => {
		const template = TEXT_TEMPLATES[0];
		const result = resolveClaudeTextTemplate({
			element: {
				textTemplateId: template.id,
				content: "Edited",
				id: "timeline-id",
				fontSize: 42,
			},
		});
		expect(result).toMatchObject({
			textTemplateId: template.id,
			content: "Edited",
			id: "timeline-id",
			fontSize: 42,
			color: template.color,
		});
	});
	it("applies style presets and lets explicit or legacy properties win", () => {
		const preset = BUILT_IN_TEXT_PRESETS[0];
		const result = resolveClaudeTextTemplate({
			element: {
				stylePresetId: preset.id,
				style: { color: "#abcdef" },
				fontSize: 37,
			},
		});
		expect(result).toMatchObject({
			color: "#abcdef",
			fontSize: 37,
			stylePresetId: preset.id,
		});
	});
	it("accepts plain text but rejects unknown identities before timeline mutation", () => {
		expect(
			resolveClaudeTextTemplate({
				element: { textTemplateId: "plain", content: "Text" },
			})
		).toMatchObject({ content: "Text" });
		expect(() =>
			resolveClaudeTextTemplate({ element: { textTemplateId: "missing" } })
		).toThrow("Unknown text template");
		expect(() =>
			resolveClaudeTextTemplate({ element: { stylePresetId: "missing" } })
		).toThrow("Unknown text style");
	});
});
