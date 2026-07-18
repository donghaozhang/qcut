import { describe, expect, it } from "vitest";
import { BUILT_IN_TEXT_PRESETS } from "@/lib/text/text-presets";
import {
	CAPTION_STYLE_PRESETS,
	captionStyleFromTextTemplate,
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

describe("captionStyleFromTextTemplate", () => {
	it("converts a qctext template into a legible caption style", () => {
		const style = captionStyleFromTextTemplate({
			stylePresetId: "cyan-neon",
			overrides: { fontSize: 120, color: "#ff00aa" },
		});

		expect(style).not.toBeNull();
		expect(style?.fontColor).toBe("#ff00aa");
		// Fancy-text sizes are clamped into a caption-legible range.
		expect(style?.fontSize).toBeLessThanOrEqual(64);
		expect(style?.position.align).toBe("bottom");
	});

	it("returns null for an unknown style preset instead of throwing", () => {
		expect(
			captionStyleFromTextTemplate({ stylePresetId: "missing-style" })
		).toBeNull();
	});
});
