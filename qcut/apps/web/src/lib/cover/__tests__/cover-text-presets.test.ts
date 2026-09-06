import { describe, expect, it } from "vitest";
import { assertCoverText, createCoverText } from "@qcut/editor-core/cover";
import { BUILT_IN_TEXT_PRESETS } from "@/lib/text/text-presets";
import type { JianyingTextStyleLabStyleSummary } from "@/types/electron";
import { coverLabPreset, coverTextPresetChanges } from "../cover-text-presets";

const canvas = { width: 1920, height: 1080, backgroundColor: "#000000" };
const layer = {
	...createCoverText({ canvas, content: "Custom title", id: "manual" }),
	rotation: 24,
	x: 0.2,
	fontFamily: "serif" as const,
};
describe("cover text preset adapter", () => {
	it.each(
		BUILT_IN_TEXT_PRESETS
	)("reuses $id while preserving content, geometry and font", (preset) => {
		const changes = coverTextPresetChanges({ layer, canvas, preset });
		const applied = { ...layer, ...changes };
		expect(() => assertCoverText({ layer: applied })).not.toThrow();
		for (const key of [
			"id",
			"content",
			"x",
			"y",
			"width",
			"height",
			"rotation",
			"fontSize",
			"fontFamily",
		] as const)
			expect(applied[key]).toBe(layer[key]);
	});
	it("replaces earlier effects instead of retaining hidden style fields", () => {
		const changes = coverTextPresetChanges({
			layer: {
				...layer,
				background: true,
				textStyle: {
					letterSpacing: 15,
					glowEnabled: true,
					glowOpacity: 1,
					shadowOffsetX: 100,
				},
			},
			canvas,
			preset: BUILT_IN_TEXT_PRESETS[0],
		});
		expect(changes).toMatchObject({
			stroke: false,
			shadow: false,
			background: false,
			textStyle: {
				letterSpacing: 0,
				glowEnabled: false,
				glowOpacity: 0,
				shadowOffsetX: 0,
			},
		});
	});
	it("copies lab approximation parameters without retaining native paths or version metadata", () => {
		const style = {
			styleId: "cached",
			resourceId: "123",
			title: "Cached art",
			approximation: {
				version: 1,
				color: "#eeeeee",
				strokeColor: "#000000",
				strokeWidth: 4,
				strokeOpacity: 0.6,
				shadowColor: "#111111",
				shadowOpacity: 0.5,
				shadowOffsetX: 2,
				shadowOffsetY: 3,
				shadowBlur: 8,
				glowColor: "#12ffab",
				glowOpacity: 0.8,
				glowBlur: 10,
			},
			runtimeReference: { packagePath: "/native/cache" },
		} as unknown as JianyingTextStyleLabStyleSummary;
		const preset = coverLabPreset({ style });
		expect(preset).not.toBeNull();
		if (!preset) throw new Error("Missing fixture preset");
		const changes = coverTextPresetChanges({ layer, canvas, preset });
		expect(changes).toMatchObject({
			stroke: true,
			shadow: true,
			background: false,
			textStyle: { glowEnabled: true, strokeWidth: 4 },
		});
		expect(JSON.stringify(changes)).not.toMatch(
			/native|cached|version|packagePath/
		);
	});
	it("does not manufacture styles for packages without approximation data", () => {
		expect(
			coverLabPreset({
				style: { styleId: "native-only" } as JianyingTextStyleLabStyleSummary,
			})
		).toBeNull();
	});
	it("rejects corrupt lab numeric or color parameters before changing a cover", () => {
		expect(() =>
			coverTextPresetChanges({
				layer,
				canvas,
				preset: {
					id: "invalid",
					name: "bad",
					updates: { strokeWidth: Infinity },
				},
			})
		).toThrow();
		expect(() =>
			coverTextPresetChanges({
				layer,
				canvas,
				preset: {
					id: "invalid",
					name: "bad",
					updates: { glowColor: "url(x)" },
				},
			})
		).toThrow();
	});
});
