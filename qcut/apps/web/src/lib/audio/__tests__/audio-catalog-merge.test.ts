import { describe, expect, it } from "vitest";
import type { SoundEffect } from "@/types/sounds";
import { mergeUniqueAudio } from "../audio-catalog-merge";

function sound({ id, name }: { id: number; name: string }): SoundEffect {
	return {
		id,
		name,
		description: "",
		url: "",
		tags: [],
		duration: 1,
		previewUrl: "",
		downloadUrl: "",
		filesize: 0,
		type: "wav",
		channels: 2,
		bitrate: 0,
		bitdepth: 0,
		samplerate: 48_000,
		username: "QCut",
		license: "",
		created: "2026-07-27T00:00:00.000Z",
		downloads: 0,
		rating: 0,
		ratingCount: 0,
	};
}

describe("mergeUniqueAudio", () => {
	it("preserves primary order and drops secondary id collisions", () => {
		const primary = [
			sound({ id: 1, name: "Primary one" }),
			sound({ id: 2, name: "Primary two" }),
		];
		const secondary = [
			sound({ id: 2, name: "Duplicate" }),
			sound({ id: 3, name: "Secondary three" }),
		];

		expect(mergeUniqueAudio({ primary, secondary })).toEqual([
			primary[0],
			primary[1],
			secondary[1],
		]);
	});
});
