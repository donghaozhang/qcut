import { describe, expect, it } from "vitest";
import { ExportQuality, resolveExportResolution } from "@/types/export";

describe("resolveExportResolution", () => {
	it("keeps the quality tier while following landscape, portrait, and square canvases", () => {
		expect(
			resolveExportResolution({
				quality: ExportQuality.HIGH,
				aspectRatio: 16 / 9,
			})
		).toMatchObject({ width: 1920, height: 1080 });
		expect(
			resolveExportResolution({
				quality: ExportQuality.HIGH,
				aspectRatio: 9 / 16,
			})
		).toMatchObject({ width: 1080, height: 1920 });
		expect(
			resolveExportResolution({
				quality: ExportQuality.MEDIUM,
				aspectRatio: 1,
			})
		).toMatchObject({ width: 720, height: 720 });
	});

	it("returns even dimensions for custom ratios", () => {
		const result = resolveExportResolution({
			quality: ExportQuality.LOW,
			aspectRatio: 3 / 4,
		});

		expect(result.width % 2).toBe(0);
		expect(result.height % 2).toBe(0);
		expect(result.label).toBe(`${result.width}×${result.height}`);
	});
});
