import { describe, it, expect } from "vitest";
import {
	GRADIENT_PRESETS,
	DEFAULT_BACKGROUND,
	toWallpaperId,
	toWallpaperLabel,
	createWallpaperEntry,
	sortWallpaperFiles,
	isImageFile,
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

	describe("toWallpaperId", () => {
		it("converts filename to kebab-case id", () => {
			expect(toWallpaperId("My Wallpaper.jpg")).toBe("my-wallpaper");
		});

		it("handles underscores and special chars", () => {
			expect(toWallpaperId("cool_bg_2024.png")).toBe("cool-bg-2024");
		});

		it("strips leading/trailing dashes", () => {
			expect(toWallpaperId("--test--.jpg")).toBe("test");
		});

		it("returns empty for extension-only filename", () => {
			expect(toWallpaperId(".jpg")).toBe("");
		});
	});

	describe("toWallpaperLabel", () => {
		it("converts filename to title case", () => {
			expect(toWallpaperLabel("my-wallpaper.jpg")).toBe("My Wallpaper");
		});

		it("handles underscores", () => {
			expect(toWallpaperLabel("mountain_trees.png")).toBe("Mountain Trees");
		});

		it("returns fallback for empty basename", () => {
			expect(toWallpaperLabel(".jpg")).toBe("Wallpaper");
		});
	});

	describe("createWallpaperEntry", () => {
		it("creates entry with correct fields", () => {
			const entry = createWallpaperEntry("sunset-photo.jpg");
			expect(entry.id).toBe("sunset-photo");
			expect(entry.label).toBe("Sunset Photo");
			expect(entry.relativePath).toBe("wallpapers/sunset-photo.jpg");
		});

		it("handles filenames with spaces", () => {
			const entry = createWallpaperEntry("My Background.png");
			expect(entry.id).toBe("my-background");
			expect(entry.label).toBe("My Background");
		});
	});

	describe("sortWallpaperFiles", () => {
		it("sorts numerically", () => {
			const sorted = sortWallpaperFiles([
				"wallpaper10.jpg",
				"wallpaper2.jpg",
				"wallpaper1.jpg",
			]);
			expect(sorted).toEqual([
				"wallpaper1.jpg",
				"wallpaper2.jpg",
				"wallpaper10.jpg",
			]);
		});

		it("does not mutate input", () => {
			const input = ["b.jpg", "a.jpg"];
			sortWallpaperFiles(input);
			expect(input).toEqual(["b.jpg", "a.jpg"]);
		});
	});

	describe("isImageFile", () => {
		it("accepts common image formats", () => {
			expect(isImageFile("photo.jpg")).toBe(true);
			expect(isImageFile("photo.jpeg")).toBe(true);
			expect(isImageFile("photo.png")).toBe(true);
			expect(isImageFile("photo.webp")).toBe(true);
			expect(isImageFile("photo.avif")).toBe(true);
			expect(isImageFile("photo.gif")).toBe(true);
			expect(isImageFile("photo.svg")).toBe(true);
		});

		it("rejects non-image files", () => {
			expect(isImageFile("video.mp4")).toBe(false);
			expect(isImageFile("doc.pdf")).toBe(false);
			expect(isImageFile("script.ts")).toBe(false);
		});

		it("is case-insensitive", () => {
			expect(isImageFile("PHOTO.JPG")).toBe(true);
			expect(isImageFile("Photo.PNG")).toBe(true);
		});
	});
});
