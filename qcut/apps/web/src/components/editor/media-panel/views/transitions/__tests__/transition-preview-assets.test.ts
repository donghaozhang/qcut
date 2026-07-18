import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { transitionPresets } from "../transition-presets";

function publicAssetPath({ url }: { url: string }): string {
	// Resolve from this file, not cwd: vitest runs with cwd=apps/web in CI.
	return path.resolve(
		import.meta.dirname,
		"../../../../../../../public",
		url.replace(/^\//, "")
	);
}

describe("transition preview assets", () => {
	it("points every preset at two existing static WebP files", () => {
		for (const preset of transitionPresets) {
			expect(preset.preview.from).toMatch(/\.webp$/);
			expect(preset.preview.to).toMatch(/\.webp$/);
			expect(preset.preview.from).not.toBe(preset.preview.to);
			expect(
				existsSync(publicAssetPath({ url: preset.preview.from })),
				`${preset.id} is missing ${preset.preview.from}`
			).toBe(true);
			expect(
				existsSync(publicAssetPath({ url: preset.preview.to })),
				`${preset.id} is missing ${preset.preview.to}`
			).toBe(true);
		}
	});
});
