import { describe, expect, it } from "vitest";
import {
	buildLocalStickerLabSource,
	DEFAULT_STICKER_LAB_MANIFEST_URL,
} from "../local-sticker-lab-config";

describe("local sticker lab config", () => {
	it("requires an explicit enable flag", () => {
		expect(
			buildLocalStickerLabSource({
				isEnabled: false,
				manifestPath: "/tmp/manifest.json",
			})
		).toBeNull();
	});

	it("uses the bundled remote manifest URL by default", () => {
		expect(buildLocalStickerLabSource({ isEnabled: true })).toEqual({
			kind: "remote-manifest",
			manifestUrl: DEFAULT_STICKER_LAB_MANIFEST_URL,
		});
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

	it("prefers both legacy local sources over the remote manifest URL", () => {
		expect(
			buildLocalStickerLabSource({
				isEnabled: true,
				legacyFilePath: "/tmp/arrow.png",
				manifestUrl: "https://assets.example/catalog.json",
			})
		).toEqual({
			kind: "legacy",
			filePath: "/tmp/arrow.png",
		});
	});

	it("trims a configured remote manifest URL", () => {
		expect(
			buildLocalStickerLabSource({
				isEnabled: true,
				manifestUrl: " https://assets.example/catalog.json ",
			})
		).toEqual({
			kind: "remote-manifest",
			manifestUrl: "https://assets.example/catalog.json",
		});
	});
});
