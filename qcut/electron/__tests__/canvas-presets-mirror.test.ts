import { describe, expect, it } from "vitest";
import {
	DEFAULT_CANVAS_PRESETS as CORE_CANVAS_PRESETS,
	findCanvasPresetByName as coreFindByName,
} from "@qcut/editor-core";
import {
	CANVAS_PRESET_NAMES,
	DEFAULT_CANVAS_PRESETS as MIRROR_CANVAS_PRESETS,
	findCanvasPresetByName as mirrorFindByName,
} from "../native-pipeline/editor/canvas-presets.js";

/**
 * The CLI cannot import @qcut/editor-core at runtime, so it carries a copy of
 * the ratio catalog. These pins make any drift between the two a test failure.
 */
describe("canvas preset mirror", () => {
	it("carries exactly the editor-core catalog", () => {
		expect(MIRROR_CANVAS_PRESETS).toEqual(CORE_CANVAS_PRESETS);
	});

	it("resolves names and aliases identically", () => {
		const probes = [
			...CORE_CANVAS_PRESETS.map((preset) => preset.name),
			...CORE_CANVAS_PRESETS.flatMap((preset) => preset.aliases ?? []),
			" 9：16 ",
			"16 : 9",
			"5.8-INCH",
			"5.8 寸",
			"4:5",
			"",
		];
		for (const probe of probes) {
			expect(mirrorFindByName(probe)?.name).toBe(coreFindByName(probe)?.name);
		}
		expect(mirrorFindByName("16 : 9")?.name).toBe("16:9");
		expect(mirrorFindByName("5.8-INCH")?.name).toBe("9:19.5");
	});

	it("lists every preset once in the help text, aliases folded in", () => {
		expect(CANVAS_PRESET_NAMES).toEqual(
			CORE_CANVAS_PRESETS.map((preset) =>
				preset.aliases?.length
					? `${preset.name} (${preset.aliases[0]})`
					: preset.name
			)
		);
		expect(CANVAS_PRESET_NAMES).toContain("9:19.5 (5.8寸)");
	});
});
