import { describe, expect, it } from "vitest";
import { BUILT_IN_TEXT_PRESETS } from "@/lib/text/text-presets";
import {
	CAPTION_STYLE_PRESETS,
	createCaptionStyleFromTextPreset,
} from "../caption-style-presets";

describe("caption style presets", () => {
	it("references valid shared text style identities", () => {
		const textStyleIds = new Set(
			BUILT_IN_TEXT_PRESETS.map((preset) => preset.id)
		);
		for (const preset of CAPTION_STYLE_PRESETS) {
			expect(textStyleIds.has(preset.textStylePresetId)).toBe(true);
		}
	});

	it("inherits visual values and keeps caption-specific overrides", () => {
		const style = createCaptionStyleFromTextPreset({
			textStylePresetId: "yellow-pop",
			overrides: { fontSize: 72, position: { align: "top", x: 50, y: 12 } },
		});

		expect(style.fontColor).toBe("#ffe600");
		expect(style.outlineColor).toBe("#111111");
		expect(style.outlineWidth).toBe(4);
		expect(style.fontSize).toBe(72);
		expect(style.position).toEqual({ align: "top", x: 50, y: 12 });
	});

	it("fails fast when a template references a removed style", () => {
		expect(() =>
			createCaptionStyleFromTextPreset({
				textStylePresetId: "missing-style",
				overrides: {},
			})
		).toThrow("Unknown shared text style preset 'missing-style'");
	});
});
