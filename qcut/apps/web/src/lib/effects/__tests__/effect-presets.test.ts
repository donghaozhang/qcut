import { describe, expect, it } from "vitest";
import { FFmpegFilterChain } from "@/lib/ffmpeg/ffmpeg-filter-chain";
import { EFFECT_PRESETS } from "../effect-presets";
import { parametersToCSSFilters } from "../effects-utils";

describe("effect presets", () => {
	it("registers 15 unique production effects", () => {
		expect(EFFECT_PRESETS).toHaveLength(15);
		expect(new Set(EFFECT_PRESETS.map((preset) => preset.id)).size).toBe(15);
	});

	it("provides browser preview and FFmpeg export filters for every preset", () => {
		for (const preset of EFFECT_PRESETS) {
			expect(
				parametersToCSSFilters(preset.parameters),
				`${preset.id} is missing its browser preview filter`
			).not.toBe("");
			expect(
				FFmpegFilterChain.fromEffectParameters(preset.parameters),
				`${preset.id} is missing its FFmpeg export filter`
			).not.toBe("");
		}
	});

	it("keeps the sepia preview backed by a real export matrix", () => {
		const sepia = EFFECT_PRESETS.find((preset) => preset.id === "sepia");
		if (!sepia) throw new Error("Sepia preset is missing");

		expect(parametersToCSSFilters(sepia.parameters)).toBe("sepia(0.8)");
		expect(FFmpegFilterChain.fromEffectParameters(sepia.parameters)).toContain(
			"colorchannelmixer="
		);
	});
});
