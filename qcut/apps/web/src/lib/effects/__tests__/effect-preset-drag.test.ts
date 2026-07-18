import { describe, expect, it } from "vitest";
import {
	parseEffectPresetDrag,
	serializeEffectPresetDrag,
} from "../effect-preset-drag";

describe("effect preset drag payload", () => {
	it("resolves a published preset by stable ID", () => {
		const value = serializeEffectPresetDrag({
			presetId: "dynamic-camera-shake",
		});
		expect(parseEffectPresetDrag({ value })?.id).toBe("dynamic-camera-shake");
	});

	it.each([
		"not-json",
		JSON.stringify({ version: 2, presetId: "dynamic-camera-shake" }),
		JSON.stringify({ version: 1, presetId: "missing" }),
		JSON.stringify({ version: 1, presetId: "brightness" }),
	])("rejects invalid or unpublished payload %s", (value) => {
		expect(parseEffectPresetDrag({ value })).toBeUndefined();
	});
});
