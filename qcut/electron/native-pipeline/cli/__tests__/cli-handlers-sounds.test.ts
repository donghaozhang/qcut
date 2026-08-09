import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	handleSoundSearch,
	type SoundSearchDependencies,
} from "../cli-handlers-sounds.js";
import type { SoundSearchResult } from "../../sounds/freesound-client.js";
import { searchSoundEffectsLab } from "../../sounds/sound-effects-lab-client.js";

const noProgress = () => undefined;

const temporaryRoots: string[] = [];

afterEach(() => {
	for (const root of temporaryRoots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

function labManifestPath(): string {
	const root = mkdtempSync(join(tmpdir(), "qcut-sound-lab-"));
	temporaryRoots.push(root);
	const manifestPath = join(root, "manifest.json");
	writeFileSync(
		manifestPath,
		JSON.stringify({
			categories: [
				{ id: "jianying-aaa", label: "转场" },
				{ id: "jianying-bbb", label: "热门" },
			],
			items: [
				{
					id: "6896679799100689672",
					title: "唰",
					duration: 0.47,
					fileName: "0291b72047769e085e7595ce5d65dbd2.mp3",
					categoryIds: ["jianying-bbb", "jianying-aaa"],
				},
				{
					id: "6896679799100656905",
					title: "Applause",
					duration: 2,
					fileName: "1291b72047769e085e7595ce5d65dbd2.mp3",
					categoryIds: ["jianying-bbb"],
				},
			],
		})
	);
	return manifestPath;
}

function dependencies({
	freesound = async () => [],
	lab = searchSoundEffectsLab,
}: {
	freesound?: SoundSearchDependencies["searchFreesound"];
	lab?: SoundSearchDependencies["searchSoundEffectsLab"];
} = {}): SoundSearchDependencies {
	return { searchFreesound: freesound, searchSoundEffectsLab: lab };
}

describe("handleSoundSearch", () => {
	it("requires a query", async () => {
		const result = await handleSoundSearch(
			{},
			noProgress,
			new AbortController().signal,
			dependencies()
		);
		expect(result.success).toBe(false);
		expect(result.error).toBe("Missing --query");
	});

	it("matches a lab entry on its category label, not just its title", async () => {
		const result = await handleSoundSearch(
			{ query: "转场", source: "lab", manifest: labManifestPath() },
			noProgress,
			new AbortController().signal,
			dependencies()
		);

		expect(result.success).toBe(true);
		const data = result.data as { total: number; results: SoundSearchResult[] };
		expect(data.total).toBe(1);
		expect(data.results[0]?.name).toBe("唰");
		expect(data.results[0]?.source).toBe("sound-effects-lab");
		expect(data.results[0]?.tags).toContain("转场");
	});

	it("matches a lab entry on its title", async () => {
		const result = await handleSoundSearch(
			{ query: "applause", source: "lab", manifest: labManifestPath() },
			noProgress,
			new AbortController().signal,
			dependencies()
		);

		const data = result.data as { results: SoundSearchResult[] };
		expect(data.results[0]?.name).toBe("Applause");
	});

	it("returns one catalog's results when the other is unavailable", async () => {
		const result = await handleSoundSearch(
			{ query: "转场", manifest: labManifestPath() },
			noProgress,
			new AbortController().signal,
			dependencies({
				freesound: async () => {
					throw new Error("FREESOUND_API_KEY is not configured");
				},
			})
		);

		expect(result.success).toBe(true);
		const data = result.data as {
			results: SoundSearchResult[];
			warnings: string[];
		};
		expect(data.results).toHaveLength(1);
		expect(data.warnings[0]).toContain("FREESOUND_API_KEY");
	});

	it("fails when every requested catalog fails", async () => {
		const result = await handleSoundSearch(
			{ query: "转场" },
			noProgress,
			new AbortController().signal,
			dependencies({
				freesound: async () => {
					throw new Error("no key");
				},
				lab: async () => {
					throw new Error("no manifest");
				},
			})
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain("no key");
		expect(result.error).toContain("no manifest");
	});

	it("rejects an unknown --source instead of searching everything", async () => {
		const result = await handleSoundSearch(
			{ query: "x", source: "spotify" },
			noProgress,
			new AbortController().signal,
			dependencies()
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("--source must be one of");
	});

	it("reports a private catalog rejection as a sign-in problem", async () => {
		const fetchImpl = vi.fn(
			async () => new Response("", { status: 403 })
		) as unknown as typeof fetch;

		await expect(
			searchSoundEffectsLab({
				query: "x",
				limit: 5,
				source: { manifestUrl: "https://license.example/private-manifest" },
				fetchImpl,
			})
		).rejects.toThrow("qcut system login");
	});
});
