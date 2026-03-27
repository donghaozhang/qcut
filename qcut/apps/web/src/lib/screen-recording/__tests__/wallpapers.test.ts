import { describe, it, expect } from "vitest";
import {
	GRADIENT_PRESETS,
	DEFAULT_BACKGROUND,
	type BackgroundConfig,
} from "../wallpapers";

describe("wallpapers", () => {
	describe("GRADIENT_PRESETS", () => {
		it("has at least 10 presets", () => {
			expect(GRADIENT_PRESETS.length).toBeGreaterThanOrEqual(10);
		});

		it("each preset has id, label, and two colors", () => {
			for (const preset of GRADIENT_PRESETS) {
				expect(preset.id).toBeTruthy();
				expect(preset.label).toBeTruthy();
				expect(preset.colors).toHaveLength(2);
				expect(preset.colors[0]).toMatch(/^#[0-9a-fA-F]{6}$/);
				expect(preset.colors[1]).toMatch(/^#[0-9a-fA-F]{6}$/);
			}
		});

		it("has unique ids", () => {
			const ids = GRADIENT_PRESETS.map((p) => p.id);
			expect(new Set(ids).size).toBe(ids.length);
		});
	});

	describe("DEFAULT_BACKGROUND", () => {
		it("defaults to type none", () => {
			expect(DEFAULT_BACKGROUND.type).toBe("none");
		});

		it("has sensible defaults", () => {
			expect(DEFAULT_BACKGROUND.padding).toBe(40);
			expect(DEFAULT_BACKGROUND.borderRadius).toBe(12);
			expect(DEFAULT_BACKGROUND.shadow).toBe(true);
			expect(DEFAULT_BACKGROUND.gradientAngle).toBe(135);
		});
	});
});
