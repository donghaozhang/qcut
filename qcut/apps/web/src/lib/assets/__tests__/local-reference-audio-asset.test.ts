import { describe, expect, it } from "vitest";
import type { SoundEffect } from "@/types/sounds";
import { createAudioLibraryAssetEntry } from "../freesound-asset";

describe("local reference audio asset", () => {
	it("keeps integrity metadata and a restricted license", () => {
		const sound: SoundEffect = {
			id: -900_000_000,
			name: "Reference",
			description: "Internal reference",
			url: "blob:reference",
			previewUrl: "blob:reference",
			duration: 1,
			filesize: 4,
			type: "audio/mpeg",
			channels: 0,
			bitrate: 0,
			bitdepth: 0,
			samplerate: 0,
			username: "Jianying reference",
			tags: ["internal-reference"],
			license: "Third-party reference - redistribution prohibited",
			created: "2026-08-01T00:00:00.000Z",
			downloads: 0,
			rating: 0,
			ratingCount: 0,
			source: "sound-effects-lab",
			kind: "sound-effect",
			checksumSha256:
				"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		};

		const asset = createAudioLibraryAssetEntry({
			sound,
			kind: "sound-effect",
		});

		expect(asset.license).toEqual({
			name: "Third-party reference - internal use only",
			commercialUse: "restricted",
			attributionRequired: false,
		});
		expect(asset.files[0]).toMatchObject({
			role: "preview",
			byteSize: 4,
			checksumSha256: sound.checksumSha256,
		});
	});

	it("preserves an explicit CC0 license on a QCut-owned lab sound", () => {
		const sound: SoundEffect = {
			id: -900_000_001,
			name: "Owned CC0 sound",
			description: "Freesound CC0",
			url: "blob:owned-cc0",
			previewUrl: "blob:owned-cc0",
			duration: 1,
			filesize: 4,
			type: "audio/mpeg",
			channels: 0,
			bitrate: 0,
			bitdepth: 0,
			samplerate: 0,
			username: "CC0 creator",
			tags: ["sound-effects-lab", "cc0"],
			license: "https://creativecommons.org/publicdomain/zero/1.0/",
			created: "2026-08-22T00:00:00.000Z",
			downloads: 0,
			rating: 0,
			ratingCount: 0,
			source: "sound-effects-lab",
			kind: "sound-effect",
			checksumSha256:
				"abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
			soundEffectsLab: {
				provider: "freesound",
				redistribution: "allowed",
				resourceId: "8800000000000324894",
				asset: {
					objectKey:
						"qcut/2026-08-22/assets/a3bb18a41c76abd0d1af22b05072655e.mp3",
					byteSize: 4,
					checksumSha256:
						"abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
					mimeType: "audio/mpeg",
				},
			},
		};

		const asset = createAudioLibraryAssetEntry({
			sound,
			kind: "sound-effect",
		});

		expect(asset.license).toEqual({
			name: "Creative Commons Zero",
			spdxId: "CC0-1.0",
			commercialUse: "allowed",
			attributionRequired: false,
			sourceUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
		});
		expect(asset.files[0]).toMatchObject({
			role: "source",
			url: expect.stringContaining(
				"/api/sound-effects-lab/assets?objectKey=qcut%2F2026-08-22%2Fassets%2F"
			),
			byteSize: 4,
			checksumSha256: sound.checksumSha256,
		});
		expect(asset.id).toContain("sound-effects-lab:qcut/2026-08-22/assets/");
	});
});
