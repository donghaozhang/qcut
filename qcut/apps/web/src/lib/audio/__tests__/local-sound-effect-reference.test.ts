import { describe, expect, it, vi } from "vitest";
import {
	buildSoundEffectsLabAssetEntry,
	createSoundEffectsLabAssetFetch,
	loadLocalSoundEffectFile,
	loadPrivateSoundEffectFile,
	soundEffectReferenceToSound,
} from "../local-sound-effect-reference";
import type {
	LocalSoundEffectReference,
	PrivateSoundEffectReference,
} from "../local-sound-effects-manifest";

const commonReference = {
	id: "6896679799100689672",
	numericId: -900_000_000,
	title: "唰",
	fileName: "0291b72047769e085e7595ce5d65dbd2.mp3",
	mimeType: "audio/mpeg" as const,
	byteSize: 4,
	duration: 1.25,
	contentMd5: "0291b72047769e085e7595ce5d65dbd2",
	contentSha256:
		"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
	resourceId: "6896679799100689672",
	batch: "01" as const,
	mappingStrategy: "metadata-md5" as const,
	categoryIds: ["jianying-0123456789ab"],
};

const localReference: LocalSoundEffectReference = {
	...commonReference,
	filePath: "/tmp/0291b72047769e085e7595ce5d65dbd2.mp3",
};

const privateReference: PrivateSoundEffectReference = {
	...commonReference,
	asset: {
		kind: "supabase-storage",
		objectKey:
			"jianying/2026-08-01/assets/0291b72047769e085e7595ce5d65dbd2.mp3",
		byteSize: 4,
		checksumSha256: commonReference.contentSha256,
	},
};

describe("Sound Effects Lab references", () => {
	it("loads a size-verified owned local File", async () => {
		const readFile = vi.fn(async () => new Uint8Array([1, 2, 3, 4]));
		const file = await loadLocalSoundEffectFile({
			readFile,
			reference: localReference,
		});

		expect(file.name).toBe(localReference.fileName);
		expect(file.type).toBe("audio/mpeg");
		expect(file.size).toBe(4);
	});

	it("rejects a changed local payload", async () => {
		await expect(
			loadLocalSoundEffectFile({
				reference: localReference,
				readFile: async () => new Uint8Array([1, 2, 3]),
			})
		).rejects.toThrow("size mismatch");
	});

	it("builds an integrity-bearing private asset entry", () => {
		const asset = buildSoundEffectsLabAssetEntry({
			licenseServerUrl: "https://license.example",
			reference: privateReference,
		});

		expect(asset).toMatchObject({
			id: `sound-effects-lab:${privateReference.asset.objectKey}`,
			delivery: "remote",
			files: [
				{
					role: "source",
					byteSize: 4,
					checksumSha256: commonReference.contentSha256,
				},
			],
			license: { commercialUse: "restricted" },
		});
	});

	it("adds the QCut session token only to license-server requests", async () => {
		const fetchImpl = vi.fn(
			async (_input: RequestInfo | URL, _init?: RequestInit) =>
				new Response("ok")
		);
		const authenticatedFetch = createSoundEffectsLabAssetFetch({
			fetchImpl: fetchImpl as typeof fetch,
			getToken: async () => "session-token",
			licenseServerUrl: "https://license.example",
		});

		await authenticatedFetch("https://cdn.example/audio.mp3");
		await authenticatedFetch(
			"https://license.example/api/sound-effects-lab/assets"
		);

		expect(
			new Headers(fetchImpl.mock.calls[0]?.[1]?.headers).get("Authorization")
		).toBeNull();
		expect(
			new Headers(fetchImpl.mock.calls[1]?.[1]?.headers).get("Authorization")
		).toBe("Bearer session-token");
	});

	it("loads a verified private File through the asset cache", async () => {
		const ensureResources = vi.fn(async () => [
			{
				blob: new Blob([new Uint8Array([1, 2, 3, 4])], {
					type: "audio/mpeg",
				}),
				byteSize: 4,
				cacheKey: "sound-effects-lab:test:source:0",
				checksumSha256: commonReference.contentSha256,
				fromCache: false,
				mimeType: "audio/mpeg",
				role: "source" as const,
				sourceUrl: "https://license.example/audio",
				url: "https://license.example/audio",
			},
		]);

		const file = await loadPrivateSoundEffectFile({
			ensureResources,
			reference: privateReference,
		});

		expect(file.name).toBe(privateReference.fileName);
		expect(file.size).toBe(4);
		expect(ensureResources).toHaveBeenCalledWith(
			expect.objectContaining({ roles: ["source"] })
		);
	});

	it("maps reference metadata into a non-persistable audio card", () => {
		const sound = soundEffectReferenceToSound({
			categories: [{ id: "jianying-0123456789ab", label: "转场" }],
			previewUrl: "blob:reference",
			reference: privateReference,
		});

		expect(sound).toMatchObject({
			id: -900_000_000,
			name: "唰",
			previewUrl: "blob:reference",
			source: "sound-effects-lab",
			license: "Third-party reference - redistribution prohibited",
			checksumSha256: privateReference.contentSha256,
		});
		expect(sound.tags).toContain("转场");
	});
});
