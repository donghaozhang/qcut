import { describe, expect, it, vi } from "vitest";
import {
	loadLocalSoundEffectsLabManifest,
	parseLocalSoundEffectsLabManifest,
} from "../local-sound-effects-manifest";

function manifestFixture() {
	return {
		schemaVersion: 1 as const,
		catalogId: "jianying-sfx-reference-2026-08-01",
		generatedAt: "2026-08-01T00:00:00.000Z",
		provenance: {
			sourceApp: "Jianying Pro" as const,
			purpose: "internal-reference" as const,
			redistribution: "prohibited" as const,
		},
		categories: [
			{ id: "jianying-0123456789ab", label: "热门" },
			{ id: "jianying-abcdef012345", label: "转场" },
		],
		items: [
			{
				id: "6896679799100689672",
				numericId: -900_000_000,
				title: "唰",
				fileName: "0291b72047769e085e7595ce5d65dbd2.mp3",
				filePath:
					"/Users/test/Movies/JianyingPro/Cache/music/0291b72047769e085e7595ce5d65dbd2.mp3",
				mimeType: "audio/mpeg" as const,
				byteSize: 4,
				duration: 1.25,
				contentMd5: "0291b72047769e085e7595ce5d65dbd2",
				contentSha256:
					"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
				resourceId: "6896679799100689672",
				batch: "01" as const,
				mappingStrategy: "metadata-md5" as const,
				categoryIds: ["jianying-0123456789ab", "jianying-abcdef012345"],
			},
		],
	};
}

describe("local Sound Effects Lab manifest", () => {
	it("parses a strict, integrity-bearing local catalog", () => {
		const manifest = manifestFixture();
		expect(
			parseLocalSoundEffectsLabManifest({
				jsonText: JSON.stringify(manifest),
			})
		).toEqual(manifest);
	});

	it("accepts long Jianying BGM references within the 30-minute guardrail", () => {
		const manifest = manifestFixture();
		manifest.items[0].duration = 888.792;

		expect(
			parseLocalSoundEffectsLabManifest({
				jsonText: JSON.stringify(manifest),
			})
		).toEqual(manifest);
	});

	it.each([
		{
			name: "relative file path",
			mutate: (candidate: ReturnType<typeof manifestFixture>) => {
				candidate.items[0].filePath = "../sound.mp3";
			},
			message: "filePath must be absolute",
		},
		{
			name: "resource identity mismatch",
			mutate: (candidate: ReturnType<typeof manifestFixture>) => {
				candidate.items[0].id = "6896679799100689673";
			},
			message: "id must match resourceId",
		},
		{
			name: "file and MD5 mismatch",
			mutate: (candidate: ReturnType<typeof manifestFixture>) => {
				candidate.items[0].fileName = "ffffffffffffffffffffffffffffffff.mp3";
			},
			message: "fileName must use the content MD5",
		},
		{
			name: "unknown category",
			mutate: (candidate: ReturnType<typeof manifestFixture>) => {
				candidate.items[0].categoryIds = ["jianying-111111111111"];
			},
			message: "Unknown category id",
		},
	])("rejects $name", ({ message, mutate }) => {
		const candidate = structuredClone(manifestFixture());
		mutate(candidate);
		expect(() =>
			parseLocalSoundEffectsLabManifest({
				jsonText: JSON.stringify(candidate),
			})
		).toThrow(message);
	});

	it("rejects duplicate resource and content identities", () => {
		const candidate = structuredClone(manifestFixture());
		candidate.items.push(structuredClone(candidate.items[0]));
		expect(() =>
			parseLocalSoundEffectsLabManifest({
				jsonText: JSON.stringify(candidate),
			})
		).toThrow("Duplicate resource id");
		expect(() =>
			parseLocalSoundEffectsLabManifest({
				jsonText: JSON.stringify(candidate),
			})
		).toThrow("Duplicate SHA-256");
	});

	it("loads UTF-8 JSON through the desktop file reader", async () => {
		const manifest = manifestFixture();
		const bytes = new TextEncoder().encode(JSON.stringify(manifest));
		const readFile = vi.fn(async () => bytes);

		await expect(
			loadLocalSoundEffectsLabManifest({
				manifestPath: "/tmp/sound-effects-lab.json",
				readFile,
			})
		).resolves.toEqual(manifest);
		expect(readFile).toHaveBeenCalledWith({
			filePath: "/tmp/sound-effects-lab.json",
		});
	});

	it("rejects an unsafe manifest path before reading", async () => {
		const readFile = vi.fn();
		await expect(
			loadLocalSoundEffectsLabManifest({
				manifestPath: "../sound-effects-lab.json",
				readFile,
			})
		).rejects.toThrow("path must be absolute");
		expect(readFile).not.toHaveBeenCalled();
	});
});
