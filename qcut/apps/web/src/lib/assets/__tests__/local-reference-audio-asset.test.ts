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
			source: "local-reference",
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
});
