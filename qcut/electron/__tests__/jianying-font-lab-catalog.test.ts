// @vitest-environment node
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	buildJianyingFontCatalog,
	readVerifiedJianyingFontBytes,
	summarizeJianyingFontCatalog,
} from "../jianying-font-lab-catalog.js";

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory() {
	const directory = await mkdtemp(join(tmpdir(), "qcut-font-lab-"));
	temporaryDirectories.push(directory);
	return directory;
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true }))
	);
});

describe("Jianying font lab catalog", () => {
	it("deduplicates exact font files, combines sources, and never exposes paths", async () => {
		const cache = await createTemporaryDirectory();
		const effect = join(cache, "effect");
		const artistEffect = join(cache, "artistEffect");
		await Promise.all([
			mkdir(join(effect, "one"), { recursive: true }),
			mkdir(join(artistEffect, "two"), { recursive: true }),
		]);
		await Promise.all([
			writeFile(join(effect, "one", "same.ttf"), "same-font-bytes"),
			writeFile(join(artistEffect, "two", "same.otf"), "same-font-bytes"),
			writeFile(join(effect, "one", "other.otf"), "other-font-bytes"),
			writeFile(join(effect, "one", "empty.ttf"), ""),
			writeFile(join(effect, "one", "._ignored.ttf"), "apple-double"),
		]);

		const catalog = await buildJianyingFontCatalog({
			roots: [
				{ path: effect, sourceKind: "effect" },
				{ path: artistEffect, sourceKind: "artist-effect" },
			],
			readFontMetadata: ({ bytes }) => {
				const label = bytes.toString().startsWith("same") ? "Same" : "Other";
				return {
					familyName: `${label} Family`,
					fullName: `${label} Regular`,
					postscriptName: `${label}-Regular`,
					subfamilyName: "Regular",
				};
			},
		});

		expect(catalog).toMatchObject({
			rootCount: 2,
			fileCount: 4,
			duplicateFileCount: 1,
			invalidFileCount: 1,
			oversizedFileCount: 0,
		});
		expect(catalog.entries).toHaveLength(2);
		const same = catalog.entries.find(({ familyName }) =>
			familyName.startsWith("Same")
		);
		expect(same).toMatchObject({
			fontId: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
			cssFamily: expect.stringMatching(/^QCutLocal_[a-f0-9]{20}$/),
			sourceKinds: ["artist-effect", "effect"],
		});

		const publicCatalog = summarizeJianyingFontCatalog({ catalog });
		expect(publicCatalog.count).toBe(2);
		expect(JSON.stringify(publicCatalog)).not.toContain(cache);
		expect(publicCatalog.fonts[0]).not.toHaveProperty("filePaths");
		expect(publicCatalog.fonts[0]).not.toHaveProperty("sha256");
	});

	it("rechecks the content hash before returning bytes", async () => {
		const cache = await createTemporaryDirectory();
		const fontPath = join(cache, "font.ttf");
		await writeFile(fontPath, "original-font");
		const catalog = await buildJianyingFontCatalog({
			roots: [{ path: cache, sourceKind: "effect" }],
			readFontMetadata: () => ({
				familyName: "Test",
				fullName: "Test Regular",
				postscriptName: "Test-Regular",
				subfamilyName: "Regular",
			}),
		});
		const entry = catalog.entries[0];
		expect((await readVerifiedJianyingFontBytes({ entry })).toString()).toBe(
			"original-font"
		);

		await writeFile(fontPath, "replacement-font");
		await expect(readVerifiedJianyingFontBytes({ entry })).rejects.toThrow(
			"已经变化"
		);
	});
});
