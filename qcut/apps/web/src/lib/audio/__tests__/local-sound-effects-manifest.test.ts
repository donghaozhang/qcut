import { describe, expect, it, vi } from "vitest";
import {
	loadLocalSoundEffectsLabManifest,
	loadPrivateSoundEffectsLabManifest,
	parseLocalSoundEffectsLabManifest,
	parsePrivateSoundEffectsLabManifest,
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

function privateManifestFixture() {
	const localManifest = manifestFixture();
	const localItem = localManifest.items[0];
	return {
		...localManifest,
		schemaVersion: 2 as const,
		items: [
			{
				id: localItem.id,
				numericId: localItem.numericId,
				title: localItem.title,
				fileName: localItem.fileName,
				mimeType: localItem.mimeType,
				byteSize: localItem.byteSize,
				duration: localItem.duration,
				contentMd5: localItem.contentMd5,
				contentSha256: localItem.contentSha256,
				resourceId: localItem.resourceId,
				batch: localItem.batch,
				mappingStrategy: localItem.mappingStrategy,
				categoryIds: localItem.categoryIds,
				asset: {
					kind: "supabase-storage" as const,
					objectKey: `jianying/2026-08-01/assets/${localItem.fileName}`,
					byteSize: localItem.byteSize,
					checksumSha256: localItem.contentSha256,
				},
			},
		],
	};
}

function qcutPrivateManifestFixture() {
	const manifest = privateManifestFixture();
	const item = manifest.items[0];
	return {
		...manifest,
		catalogId: "qcut-sfx-library-2026-08-01",
		provenance: {
			sourceApp: "QCut" as const,
			purpose: "mixed-private-library" as const,
			redistribution: "per-item-license" as const,
		},
		items: [
			{
				...item,
				mappingStrategy: "freesound-cc0" as const,
				source: {
					provider: "freesound" as const,
					sourceId: "540790",
					creator: "CC0 creator",
					sourceUrl: "https://freesound.org/s/540790/",
					license: "CC0-1.0" as const,
					licenseUrl:
						"https://creativecommons.org/publicdomain/zero/1.0/" as const,
					redistribution: "allowed" as const,
				},
				asset: {
					...item.asset,
					objectKey: `qcut/2026-08-01/assets/${item.fileName}`,
				},
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

describe("private Sound Effects Lab manifest", () => {
	it("parses a strict Supabase catalog without local paths", () => {
		const manifest = privateManifestFixture();
		const jsonText = JSON.stringify(manifest);

		expect(parsePrivateSoundEffectsLabManifest({ jsonText })).toEqual(manifest);
		expect(jsonText).not.toContain("/Users/test");
	});

	it("parses a QCut-owned CC0 item with per-item provenance", () => {
		const manifest = qcutPrivateManifestFixture();

		expect(
			parsePrivateSoundEffectsLabManifest({
				jsonText: JSON.stringify(manifest),
			})
		).toEqual(manifest);
	});

	it("rejects a Freesound mapping without verified CC0 source metadata", () => {
		const manifest = qcutPrivateManifestFixture();
		const candidate = structuredClone(manifest) as Record<string, unknown> & {
			items: Array<Record<string, unknown>>;
		};
		candidate.items[0].source = undefined;

		expect(() =>
			parsePrivateSoundEffectsLabManifest({
				jsonText: JSON.stringify(candidate),
			})
		).toThrow("freesound-cc0 mappings require Freesound source metadata");
	});

	it("accepts an immutable object key from an older catalog", () => {
		const manifest = privateManifestFixture();
		manifest.items[0].asset.objectKey =
			"jianying/2026-07-31/assets/0291b72047769e085e7595ce5d65dbd2.mp3";

		expect(
			parsePrivateSoundEffectsLabManifest({
				jsonText: JSON.stringify(manifest),
			})
		).toEqual(manifest);
	});

	it("rejects an object key newer than its catalog", () => {
		const manifest = privateManifestFixture();
		manifest.items[0].asset.objectKey =
			"jianying/2026-08-02/assets/0291b72047769e085e7595ce5d65dbd2.mp3";

		expect(() =>
			parsePrivateSoundEffectsLabManifest({
				jsonText: JSON.stringify(manifest),
			})
		).toThrow("Object key date cannot be newer than catalog");
	});

	it("rejects an object namespace that disagrees with its source", () => {
		const manifest = qcutPrivateManifestFixture();
		manifest.items[0].asset.objectKey =
			"jianying/2026-08-01/assets/0291b72047769e085e7595ce5d65dbd2.mp3";

		expect(() =>
			parsePrivateSoundEffectsLabManifest({
				jsonText: JSON.stringify(manifest),
			})
		).toThrow("Object key namespace must match item source");
	});

	it("rejects asset integrity metadata that differs from the reference", () => {
		const manifest = privateManifestFixture();
		manifest.items[0].asset.byteSize = 5;

		expect(() =>
			parsePrivateSoundEffectsLabManifest({
				jsonText: JSON.stringify(manifest),
			})
		).toThrow("asset byteSize must match reference byteSize");
	});

	it("fetches and validates an authenticated private manifest", async () => {
		const manifest = privateManifestFixture();
		const fetchImpl = vi.fn(
			async () =>
				new Response(JSON.stringify(manifest), {
					headers: { "Content-Type": "application/json" },
				})
		);

		await expect(
			loadPrivateSoundEffectsLabManifest({
				fetchImpl: fetchImpl as typeof fetch,
				manifestUrl:
					"https://license.example/api/sound-effects-lab/private-manifest",
			})
		).resolves.toEqual(manifest);
	});

	// The real batch-04 catalog is 938 references / 806,806 bytes and Phase A is
	// expected to roughly double it. Growth past the old 1 MiB ceiling had to
	// keep loading, because exceeding it fails closed AND silently — the lab
	// entry would simply vanish with no error surfaced.
	it("accepts a catalog grown past the old 1 MiB ceiling", async () => {
		const base = privateManifestFixture();
		const template = base.items[0];
		// ~2,500 references, comfortably past 1 MiB and past the ~1,219 the old
		// ceiling allowed. Every identity field has to stay unique or the
		// duplicate-identity rule rejects it before size is ever considered.
		const items = Array.from({ length: 2_500 }, (_, index) => {
			const md5 = index.toString(16).padStart(32, "0");
			return {
				...template,
				id: `${6_896_679_799_100_000_000n + BigInt(index)}`,
				numericId: template.numericId - index,
				fileName: `${md5}.mp3`,
				contentMd5: md5,
				contentSha256: index.toString(16).padStart(64, "0"),
				resourceId: `${6_896_679_799_100_000_000n + BigInt(index)}`,
				asset: {
					...template.asset,
					objectKey: `jianying/2026-08-01/assets/${md5}.mp3`,
					checksumSha256: index.toString(16).padStart(64, "0"),
				},
			};
		});
		const manifest = { ...base, items };
		const body = JSON.stringify(manifest);
		expect(body.length).toBeGreaterThan(1024 * 1024);

		await expect(
			loadPrivateSoundEffectsLabManifest({
				fetchImpl: (async () =>
					new Response(body, {
						headers: { "Content-Type": "application/json" },
					})) as typeof fetch,
				manifestUrl:
					"https://license.example/api/sound-effects-lab/private-manifest",
			})
		).resolves.toEqual(manifest);
	});

	// The byte ceiling is applied to the raw response before any parsing, so
	// an oversized body is refused whatever it contains.
	it("still refuses a response past the byte ceiling", async () => {
		await expect(
			loadPrivateSoundEffectsLabManifest({
				fetchImpl: (async () =>
					new Response("x".repeat(5 * 1024 * 1024), {
						headers: { "Content-Type": "application/json" },
					})) as typeof fetch,
				manifestUrl:
					"https://license.example/api/sound-effects-lab/private-manifest",
			})
		).rejects.toThrow(/too large|exceed/i);
	});

	it("rejects forbidden private manifest responses", async () => {
		await expect(
			loadPrivateSoundEffectsLabManifest({
				fetchImpl: async () => new Response("Forbidden", { status: 403 }),
				manifestUrl:
					"https://license.example/api/sound-effects-lab/private-manifest",
			})
		).rejects.toThrow("(403)");
	});
});
