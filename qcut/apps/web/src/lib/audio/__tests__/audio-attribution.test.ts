import { describe, expect, it } from "vitest";
import { createAudioLibraryAssetEntry } from "@/lib/assets/freesound-asset";
import type { SoundEffect } from "@/types/sounds";
import {
	buildAudioAttribution,
	requiresAttribution,
} from "../audio-attribution";

function sound(overrides: Partial<SoundEffect> = {}): SoundEffect {
	return {
		id: -1_000_001,
		name: "Piano Hiphop",
		description: "",
		url: "https://prod-1.storage.jamendo.com/?trackid=211720&format=mp32",
		previewUrl:
			"https://prod-1.storage.jamendo.com/?trackid=211720&format=mp32",
		duration: 70,
		filesize: 0,
		type: "audio/mpeg",
		channels: 2,
		bitrate: 0,
		bitdepth: 16,
		samplerate: 44_100,
		username: "BrunoXe",
		tags: ["music"],
		license: "https://creativecommons.org/licenses/by/3.0/",
		created: "2022-04-01T07:25:28.481Z",
		downloads: 0,
		rating: 5,
		ratingCount: 1,
		source: "qcut",
		kind: "music",
		...overrides,
	};
}

function licenseFor({ track }: { track: SoundEffect }) {
	return createAudioLibraryAssetEntry({ sound: track, kind: "music" }).license;
}

describe("catalog track licensing", () => {
	it("keeps the real Creative Commons license on catalog tracks", () => {
		// Catalog tracks carry source "qcut" like QCut's own loops; the license
		// URL is what distinguishes them.
		const license = licenseFor({ track: sound() });

		expect(license.attributionRequired).toBe(true);
		expect(license.commercialUse).toBe("allowed");
	});

	it("reports the license version the track is actually under", () => {
		// The bundled catalog is overwhelmingly CC BY 3.0; claiming 4.0 next to a
		// 3.0 deed URL would make the credit line contradict itself.
		expect(licenseFor({ track: sound() }).spdxId).toBe("CC-BY-3.0");
		expect(
			licenseFor({
				track: sound({
					license: "https://creativecommons.org/licenses/by/4.0/",
				}),
			}).spdxId
		).toBe("CC-BY-4.0");
	});

	it("does not invent an SPDX id for a jurisdiction port", () => {
		const license = licenseFor({
			track: sound({
				license: "https://creativecommons.org/licenses/by/2.5/it/",
			}),
		});

		expect(license.spdxId).toBeUndefined();
		expect(license.name).toBe("Creative Commons Attribution");
		expect(license.attributionRequired).toBe(true);
	});

	it("does not report a Public Domain Mark work as CC0", () => {
		const license = licenseFor({
			track: sound({
				license: "https://creativecommons.org/publicdomain/mark/1.0/",
			}),
		});

		expect(license.spdxId).toBeUndefined();
		expect(license.name).toBe("Public Domain Mark");
		expect(license.attributionRequired).toBe(false);
	});

	it("names the actual artist in the credit requirement", () => {
		expect(licenseFor({ track: sound() }).attributionText).toBe(
			"Credit BrunoXe"
		);
	});

	it("still reports QCut's own bundled loops as QCut-licensed", () => {
		const license = licenseFor({
			track: sound({
				license: "qcut://license/built-in",
				url: "/audio/builtin/quiet-current.ogg",
				previewUrl: "/audio/builtin/quiet-current.ogg",
			}),
		});

		expect(license.attributionRequired).toBe(false);
		expect(license.spdxId).not.toBe("CC-BY-4.0");
	});

	it("flags ShareAlike and NoDerivatives as unsafe to remix", () => {
		for (const url of [
			"https://creativecommons.org/licenses/by-sa/4.0/",
			"https://creativecommons.org/licenses/by-nd/4.0/",
		]) {
			expect(licenseFor({ track: sound({ license: url }) }).commercialUse).toBe(
				"restricted"
			);
		}
	});
});

describe("buildAudioAttribution", () => {
	it("produces a pasteable credit line", () => {
		const track = sound();

		expect(
			buildAudioAttribution({ sound: track, license: licenseFor({ track }) })
		).toBe(
			'"Piano Hiphop" by BrunoXe — CC-BY-3.0 (https://creativecommons.org/licenses/by/3.0/)'
		);
	});

	it("offers a credit line only when the license demands one", () => {
		expect(
			requiresAttribution({ license: licenseFor({ track: sound() }) })
		).toBe(true);
		expect(
			requiresAttribution({
				license: licenseFor({
					track: sound({
						license: "https://creativecommons.org/publicdomain/zero/1.0/",
					}),
				}),
			})
		).toBe(false);
	});
});
