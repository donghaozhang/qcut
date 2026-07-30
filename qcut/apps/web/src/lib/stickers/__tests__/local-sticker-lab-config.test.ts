import { describe, expect, it } from "vitest";
import { buildLocalStickerLabSource } from "../local-sticker-lab-config";

describe("local sticker lab config", () => {
	it("requires an explicit enable flag and configured path", () => {
		expect(
			buildLocalStickerLabSource({
				isEnabled: false,
				manifestPath: "/tmp/manifest.json",
			})
		).toBeNull();
		expect(buildLocalStickerLabSource({ isEnabled: true })).toBeNull();
	});

	it("prefers the v1 manifest over the legacy single-file path", () => {
		expect(
			buildLocalStickerLabSource({
				isEnabled: true,
				legacyFilePath: "/tmp/arrow.png",
				manifestPath: " /tmp/manifest.json ",
			})
		).toEqual({
			kind: "manifest",
			manifestPath: "/tmp/manifest.json",
		});
	});

	it("keeps the old single-file environment variable as a migration path", () => {
		const source = buildLocalStickerLabSource({
			isEnabled: true,
			legacyFilePath: " /tmp/arrow.png ",
		});
		expect(source).toEqual({
			kind: "legacy",
			filePath: "/tmp/arrow.png",
		});
	});
});
