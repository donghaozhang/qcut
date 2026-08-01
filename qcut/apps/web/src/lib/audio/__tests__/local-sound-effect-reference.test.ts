import { describe, expect, it, vi } from "vitest";
import {
	loadLocalSoundEffectFile,
	localSoundEffectReferenceToSound,
} from "../local-sound-effect-reference";
import type { LocalSoundEffectReference } from "../local-sound-effects-manifest";

const reference: LocalSoundEffectReference = {
	id: "6896679799100689672",
	numericId: -900_000_000,
	title: "唰",
	fileName: "0291b72047769e085e7595ce5d65dbd2.mp3",
	filePath: "/tmp/0291b72047769e085e7595ce5d65dbd2.mp3",
	mimeType: "audio/mpeg",
	byteSize: 4,
	duration: 1.25,
	contentMd5: "0291b72047769e085e7595ce5d65dbd2",
	contentSha256:
		"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
	resourceId: "6896679799100689672",
	batch: "01",
	mappingStrategy: "metadata-md5",
	categoryIds: ["jianying-0123456789ab"],
};

describe("local sound effect reference", () => {
	it("loads a size-verified owned File", async () => {
		const readFile = vi.fn(async () => new Uint8Array([1, 2, 3, 4]));
		const file = await loadLocalSoundEffectFile({ reference, readFile });

		expect(file.name).toBe(reference.fileName);
		expect(file.type).toBe("audio/mpeg");
		expect(file.size).toBe(4);
	});

	it("rejects a changed local payload", async () => {
		await expect(
			loadLocalSoundEffectFile({
				reference,
				readFile: async () => new Uint8Array([1, 2, 3]),
			})
		).rejects.toThrow("size mismatch");
	});

	it("maps reference metadata into a non-persistable audio card", () => {
		const sound = localSoundEffectReferenceToSound({
			categories: [{ id: "jianying-0123456789ab", label: "转场" }],
			previewUrl: "blob:reference",
			reference,
		});

		expect(sound).toMatchObject({
			id: -900_000_000,
			name: "唰",
			previewUrl: "blob:reference",
			source: "local-reference",
			license: "Third-party reference - redistribution prohibited",
			checksumSha256: reference.contentSha256,
		});
		expect(sound.tags).toContain("转场");
	});
});
