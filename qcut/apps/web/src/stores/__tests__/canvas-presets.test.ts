import { describe, expect, it } from "vitest";
import { useEditorStore } from "@/stores/editor/editor-store";

/**
 * The ratio menu renders straight from this table, so its shape is a contract:
 * grouped landscape-then-portrait, every dimension even (H.264/yuv420p export
 * rejects odd sizes), and every name honest about its actual ratio.
 */

function parseRatio(name: string): number | null {
	const parts = name.split(":");
	if (parts.length !== 2) return null;
	const [w, h] = parts.map(Number);
	if (!Number.isFinite(w) || !Number.isFinite(h) || h === 0) return null;
	return w / h;
}

describe("canvas presets", () => {
	const presets = useEditorStore.getState().canvasPresets;

	it("lists the landscape section before the portrait section", () => {
		const groups = presets.map((preset) => preset.group);
		const firstPortrait = groups.indexOf("portrait");
		expect(firstPortrait).toBeGreaterThan(0);
		expect(groups.slice(0, firstPortrait).every((g) => g === "landscape")).toBe(
			true
		);
		expect(groups.slice(firstPortrait).every((g) => g === "portrait")).toBe(
			true
		);
	});

	it("keeps every dimension even for H.264 export", () => {
		for (const preset of presets) {
			expect(preset.width % 2, `${preset.name} width`).toBe(0);
			expect(preset.height % 2, `${preset.name} height`).toBe(0);
		}
	});

	it("names match the actual pixel ratio within half a percent", () => {
		for (const preset of presets) {
			const named = parseRatio(preset.name);
			if (named === null) continue;
			const actual = preset.width / preset.height;
			expect(
				Math.abs(actual - named) / named,
				`${preset.name} = ${preset.width}x${preset.height}`
			).toBeLessThan(0.005);
		}
	});

	it("carries the expected platform badges and localized label", () => {
		const byName = new Map(presets.map((preset) => [preset.name, preset]));
		expect(byName.get("16:9")?.badgeKey).toBe("editor.preview.ratioBadgeXigua");
		expect(byName.get("9:16")?.badgeKey).toBe(
			"editor.preview.ratioBadgeDouyin"
		);
		expect(byName.get("9:19.5")?.nameKey).toBe("editor.preview.ratio58Inch");
	});

	it("has no duplicate names or sizes", () => {
		expect(new Set(presets.map((p) => p.name)).size).toBe(presets.length);
		expect(new Set(presets.map((p) => `${p.width}x${p.height}`)).size).toBe(
			presets.length
		);
	});
});
