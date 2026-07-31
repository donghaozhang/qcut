import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";
import {
	isRemoteStickerCatalog,
	parseLocalStickerManifest,
} from "../local-sticker-manifest";

const repositoryRootCandidate = cwd();
const REPOSITORY_ROOT = existsSync(
	resolve(repositoryRootCandidate, "apps/web/public")
)
	? repositoryRootCandidate
	: resolve(repositoryRootCandidate, "../..");
const STICKER_LAB_DIRECTORY = resolve(
	REPOSITORY_ROOT,
	"apps/web/public/sticker-lab"
);
const MANIFEST_PATH = resolve(
	STICKER_LAB_DIRECTORY,
	"qcut-original-2026-07-31.json"
);
const MAX_CATALOG_BYTES = 25 * 1024 * 1024;
const MAX_CATEGORY_BYTES = 1024 * 1024;

function sha256({ filePath }: { filePath: string }): string {
	return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

describe("QCut original sticker lab inventory", () => {
	it("ships 42 categories with at least 10 distinct stickers each", () => {
		const manifestText = readFileSync(MANIFEST_PATH, "utf8");
		const catalog = parseLocalStickerManifest({ jsonText: manifestText });
		if (!isRemoteStickerCatalog(catalog)) {
			throw new Error(
				"Expected the bundled sticker lab catalog to use v2 with provenance"
			);
		}

		expect(catalog.catalogId).toBe("qcut-original-42x10-r2-2026-07-31");
		expect(catalog.categories).toHaveLength(42);
		for (const category of catalog.categories) {
			expect(category.items.length, category.id).toBeGreaterThanOrEqual(10);
			const categoryBytes = category.items.reduce(
				(total, item) => total + item.asset.byteSize,
				0
			);
			expect(categoryBytes, category.id).toBeLessThanOrEqual(
				MAX_CATEGORY_BYTES
			);
		}

		const items = catalog.categories.flatMap((category) => category.items);
		expect(items).toHaveLength(420);
		expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
		expect(new Set(items.map((item) => item.asset.objectKey)).size).toBe(
			items.length
		);
		expect(new Set(items.map((item) => item.asset.checksumSha256)).size).toBe(
			items.length
		);
		expect(new Set(items.map((item) => item.sourceAsset.id)).size).toBe(
			items.length
		);
		expect(new Set(items.map((item) => item.sourceAsset.path)).size).toBe(
			items.length
		);
		expect(
			new Set(items.map((item) => item.sourceAsset.checksumSha256)).size
		).toBe(items.length);

		const totalAssetBytes = items.reduce(
			(total, item) => total + item.asset.byteSize,
			0
		);
		expect(totalAssetBytes).toBeLessThanOrEqual(MAX_CATALOG_BYTES);
		expect(Buffer.byteLength(manifestText)).toBeLessThanOrEqual(1024 * 1024);
		expect(manifestText).not.toMatch(/jianying|剪映/i);
	});

	it("pins every source to the checked-in QCut original artwork", () => {
		const catalog = parseLocalStickerManifest({
			jsonText: readFileSync(MANIFEST_PATH, "utf8"),
		});
		if (!isRemoteStickerCatalog(catalog)) {
			throw new Error(
				"Expected the bundled sticker lab catalog to use v2 with provenance"
			);
		}

		expect(catalog.provenance).toMatchObject({
			creator: "QCut",
			license: {
				name: "MIT",
				commercialUse: "allowed",
				attributionRequired: false,
				licenseFile: "LICENSE",
			},
			sourceCollections: ["qcut-original", "qcut-themed"],
			sourceTreeGitOid: "1ae49f649f9e3950609f874085048669e0f76232",
		});
		expect(
			existsSync(
				resolve(REPOSITORY_ROOT, catalog.provenance.license.licenseFile)
			)
		).toBe(true);

		for (const item of catalog.categories.flatMap(
			(category) => category.items
		)) {
			expect(item.sourceAsset.path).toMatch(
				/^apps\/web\/public\/stickers\/qcut-original\/.+\.svg$/
			);
			const sourcePath = resolve(REPOSITORY_ROOT, item.sourceAsset.path);
			expect(existsSync(sourcePath), item.sourceAsset.path).toBe(true);
			expect(statSync(sourcePath).isFile(), item.sourceAsset.path).toBe(true);
			expect(sha256({ filePath: sourcePath }), item.sourceAsset.path).toBe(
				item.sourceAsset.checksumSha256
			);
		}
	});

	it("keeps binary sticker payloads out of the repository catalog folder", () => {
		const entries = readdirSync(STICKER_LAB_DIRECTORY, {
			withFileTypes: true,
		});
		expect(entries.length).toBeGreaterThan(0);
		for (const entry of entries) {
			expect(entry.isFile(), entry.name).toBe(true);
			expect(entry.name.endsWith(".json"), entry.name).toBe(true);
		}
	});
});
