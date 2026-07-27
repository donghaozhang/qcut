import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	loadBundledAudioLibrary,
	resetBundledAudioLibraryCache,
} from "../audio-bundled-library";

const TRACK = {
	id: -1_000_001,
	kind: "music",
	name: "Piano Hiphop",
	tags: ["music", "instrumental"],
	duration: 70,
	previewUrl: "https://prod-1.storage.jamendo.com/?trackid=211720&format=mp32",
	license: "https://creativecommons.org/licenses/by/3.0/",
	username: "BrunoXe",
} as const;

function jsonResponse({ body, ok = true }: { body: unknown; ok?: boolean }) {
	return {
		ok,
		status: ok ? 200 : 404,
		json: async () => body,
	} as unknown as Response;
}

beforeEach(() => {
	resetBundledAudioLibraryCache();
});

describe("loadBundledAudioLibrary", () => {
	it("maps manifest tracks into playable library entries", async () => {
		const fetchImpl = vi.fn().mockResolvedValue(
			jsonResponse({
				body: {
					version: 1,
					generatedAt: "2026-07-27T00:00:00.000Z",
					tracks: [TRACK],
				},
			})
		);

		const tracks = await loadBundledAudioLibrary({ fetchImpl });

		expect(tracks).toHaveLength(1);
		expect(tracks[0].name).toBe("Piano Hiphop");
		expect(tracks[0].kind).toBe("music");
		expect(tracks[0].previewUrl).toContain("storage.jamendo.com");
		// The license URL must survive so the card can show CC BY and offer a
		// credit line rather than labelling the track QCut-licensed.
		expect(tracks[0].license).toBe(
			"https://creativecommons.org/licenses/by/3.0/"
		);
	});

	it("fetches once per session even with concurrent callers", async () => {
		const fetchImpl = vi.fn().mockResolvedValue(
			jsonResponse({
				body: { version: 1, generatedAt: "2026-07-27", tracks: [TRACK] },
			})
		);

		await Promise.all([
			loadBundledAudioLibrary({ fetchImpl }),
			loadBundledAudioLibrary({ fetchImpl }),
		]);
		await loadBundledAudioLibrary({ fetchImpl });

		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it("degrades to an empty catalog when the manifest is missing", async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValue(jsonResponse({ body: {}, ok: false }));

		await expect(loadBundledAudioLibrary({ fetchImpl })).resolves.toEqual([]);
	});

	it("degrades to an empty catalog when the manifest fails validation", async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValue(jsonResponse({ body: { version: 99, tracks: [] } }));

		await expect(loadBundledAudioLibrary({ fetchImpl })).resolves.toEqual([]);
	});

	it("degrades to an empty catalog when the request throws", async () => {
		const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));

		await expect(loadBundledAudioLibrary({ fetchImpl })).resolves.toEqual([]);
	});
});
