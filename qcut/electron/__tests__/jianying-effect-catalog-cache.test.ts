import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { JianyingEffectCategory } from "../jianying-effect-contract.js";
import type { CatalogItem } from "../jianying-effect/catalog-parsing.js";
import {
	mergeQCutEffectCatalog,
	readQCutEffectCatalogSnapshot,
	writeQCutEffectCatalogSnapshot,
} from "../jianying-effect/catalog-cache.js";

const temporaryRoots: string[] = [];

async function temporaryRoot(): Promise<string> {
	const root = await mkdtemp(path.join(os.tmpdir(), "qcut-effect-catalog-"));
	temporaryRoots.push(root);
	return root;
}

function catalogItem({
	effectId = "7399492434700422434",
	title = "360运镜",
	md5 = "e03106b5eeefb8e6674e7506d1c91d41",
	categoryIds = ["5913856"],
}: {
	effectId?: string;
	title?: string;
	md5?: string;
	categoryIds?: string[];
} = {}): CatalogItem {
	return {
		effectId,
		title,
		md5,
		resourceId: effectId,
		panel: "effects2",
		durationMs: 3000,
		requirements: ["blit"],
		adjustParameters: [
			{
				key: "effects_adjust_speed",
				defaultValue: 0.5,
				minimum: 0,
				maximum: 1,
			},
		],
		vip: false,
		itemUrls: ["https://example.com/effect.zip?signature=local-only"],
		categoryIds,
		coverUrl: "https://example.com/cover.webp?signature=local-only",
	};
}

function category({
	id = "5913856",
	name = "运镜",
}: {
	id?: string;
	name?: string;
} = {}): JianyingEffectCategory {
	return { id, name, panel: "effects2", categoryIds: [id] };
}

afterEach(async () => {
	await Promise.all(
		temporaryRoots
			.splice(0)
			.map((root) => rm(root, { recursive: true, force: true }))
	);
});

describe("QCut effect catalog cache", () => {
	it("persists a private structured snapshot and reads it back", async () => {
		const root = await temporaryRoot();
		const cachePath = path.join(root, "catalog", "catalog-v1.json");
		const items = [catalogItem()];
		const categories = [category()];

		await writeQCutEffectCatalogSnapshot({ cachePath, items, categories });

		const snapshot = await readQCutEffectCatalogSnapshot({ cachePath });
		expect(snapshot?.items).toEqual(items);
		expect(snapshot?.categories).toEqual(categories);
		if (process.platform !== "win32") {
			expect((await stat(cachePath)).mode & 0o777).toBe(0o600);
		}
		expect(await readFile(cachePath, "utf8")).not.toContain("response_body");
	});

	it("falls back cleanly when the cache is corrupt", async () => {
		const root = await temporaryRoot();
		const cachePath = path.join(root, "catalog-v1.json");
		await writeFile(cachePath, "{not-json", "utf8");

		expect(await readQCutEffectCatalogSnapshot({ cachePath })).toBeNull();
	});

	it("keeps cached cards while fresh local metadata replaces matching cards", () => {
		const cachedItem = catalogItem();
		const retainedItem = catalogItem({
			effectId: "7399492434700422435",
			title: "3D旋转",
			md5: "f03106b5eeefb8e6674e7506d1c91d42",
			categoryIds: ["7728"],
		});
		const liveItem = catalogItem({ title: "360运镜新版" });
		const merged = mergeQCutEffectCatalog({
			cached: {
				schemaVersion: 1,
				updatedAt: "2026-08-22T00:00:00.000Z",
				items: [cachedItem, retainedItem],
				categories: [category(), category({ id: "7728", name: "基础" })],
			},
			liveItems: [liveItem],
			liveCategories: [category({ name: "运镜新版" })],
		});

		expect(merged.items).toHaveLength(2);
		expect(
			merged.items.find((item) => item.effectId === liveItem.effectId)?.title
		).toBe("360运镜新版");
		expect(merged.items).toContainEqual(retainedItem);
		expect(merged.categories.map(({ name }) => name)).toEqual([
			"运镜新版",
			"基础",
		]);
	});
});
