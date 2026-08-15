// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { buildJianyingTextAnimationCatalog } from "../jianying-text-animation-lab-catalog.js";

const VALID_RESOURCE_ID = "7168819879183651359";
const MISSING_RESOURCE_ID = "7179135028343870012";
const INVALID_RESOURCE_ID = "7398492769628459539";
const CATEGORY_FALLBACK_RESOURCE_ID = "7598107928222092598";
const DURATION_FALLBACK_RESOURCE_ID = "7660451431320669481";
const VALID_HASH = "a".repeat(32);
const MISSING_HASH = "b".repeat(32);
const INVALID_HASH = "c".repeat(32);
const CATEGORY_FALLBACK_HASH = "d".repeat(32);
const DURATION_FALLBACK_HASH = "e".repeat(32);
const temporaryDirectories: string[] = [];

async function createTemporaryDirectory() {
	const directory = await mkdtemp(
		path.join(tmpdir(), "qcut-text-animation-lab-")
	);
	temporaryDirectories.push(directory);
	return directory;
}

async function writeAnimationPackage({
	cacheRoot,
	packageHash,
	resourceId,
	type,
}: {
	cacheRoot: string;
	packageHash: string;
	resourceId: string;
	type: string;
}) {
	const packagePath = path.join(cacheRoot, "effect", resourceId, packageHash);
	await mkdir(packagePath, { recursive: true });
	await Promise.all([
		writeFile(
			path.join(packagePath, "config.json"),
			JSON.stringify({
				version: "12.4.0",
				effect: { Link: [{ type }] },
			})
		),
		writeFile(path.join(packagePath, "TextAnim.lua"), "Camera perspective"),
		writeFile(
			path.join(packagePath, "surface.vert"),
			"uniform mat4 projectionMatrix;"
		),
	]);
}

async function writeCatalogDatabase({
	databaseRoot,
	effectItems,
}: {
	databaseRoot: string;
	effectItems: unknown[];
}) {
	const accountRoot = path.join(databaseRoot, "account");
	await mkdir(accountRoot, { recursive: true });
	const database = new DatabaseSync(path.join(accountRoot, "rp.db"));
	try {
		database.exec(
			"CREATE TABLE http_cache (id INTEGER PRIMARY KEY, response_body TEXT, timestamp INTEGER)"
		);
		const response = {
			data: {
				effect_item_list: effectItems,
			},
		};
		database
			.prepare(
				"INSERT INTO http_cache (response_body, timestamp) VALUES (?, ?)"
			)
			.run(JSON.stringify(response), 1000);
	} finally {
		database.close();
	}
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true }))
	);
});

describe("Jianying text animation lab catalog", () => {
	it("returns only exact local animation packages that the runtime can load", async () => {
		const root = await createTemporaryDirectory();
		const cacheRoot = path.join(root, "Cache");
		const databaseRoot = path.join(cacheRoot, "ressdk_db");
		await Promise.all([
			writeAnimationPackage({
				cacheRoot,
				packageHash: VALID_HASH,
				resourceId: VALID_RESOURCE_ID,
				type: "InfoSticker",
			}),
			writeAnimationPackage({
				cacheRoot,
				packageHash: INVALID_HASH,
				resourceId: INVALID_RESOURCE_ID,
				type: "Transition",
			}),
			writeCatalogDatabase({
				databaseRoot,
				effectItems: [
					{
						common_attr: {
							id: VALID_RESOURCE_ID,
							md5: VALID_HASH,
							title: "翻页 I",
						},
						text_animation: { animation_type: "loop", duration: 1200 },
					},
					{
						common_attr: {
							id: MISSING_RESOURCE_ID,
							md5: MISSING_HASH,
							title: "圆柱环绕",
						},
						text_animation: { animation_type: "loop", duration: 1500 },
					},
					{
						common_attr: {
							id: INVALID_RESOURCE_ID,
							md5: INVALID_HASH,
							title: "无效动画",
						},
						text_animation: { animation_type: "in", duration: 500 },
					},
				],
			}),
		]);

		const catalog = await buildJianyingTextAnimationCatalog({
			cacheRoot,
			databaseRoot,
		});

		expect(catalog).toMatchObject({
			count: 1,
			catalogCount: 3,
			packageCount: 2,
			missingPackageCount: 1,
			invalidPackageCount: 1,
			animations: [
				{
					animationId: `loop:${VALID_RESOURCE_ID}/${VALID_HASH}`,
					resourceId: VALID_RESOURCE_ID,
					packageHash: VALID_HASH,
					title: "翻页 I",
					slot: "loop",
					duration: 1.2,
					capabilities: {
						animationComponents: true,
						shaderComponents: true,
						threeDimensional: true,
					},
				},
			],
		});
	});

	it("infers text animation slots and durations from Jianying fallback metadata", async () => {
		const root = await createTemporaryDirectory();
		const cacheRoot = path.join(root, "Cache");
		const databaseRoot = path.join(cacheRoot, "ressdk_db");
		await Promise.all([
			writeAnimationPackage({
				cacheRoot,
				packageHash: CATEGORY_FALLBACK_HASH,
				resourceId: CATEGORY_FALLBACK_RESOURCE_ID,
				type: "InfoSticker",
			}),
			writeAnimationPackage({
				cacheRoot,
				packageHash: DURATION_FALLBACK_HASH,
				resourceId: DURATION_FALLBACK_RESOURCE_ID,
				type: "TextAnimation",
			}),
			writeCatalogDatabase({
				databaseRoot,
				effectItems: [
					{
						common_attr: {
							category_ids: [2066],
							id: CATEGORY_FALLBACK_RESOURCE_ID,
							md5: CATEGORY_FALLBACK_HASH,
							sdk_extra: JSON.stringify({
								setting: { animation_duration: 0.75 },
							}),
							title: "文字旋入",
						},
						text_animation: { animation_type: "" },
					},
					{
						common_attr: {
							category_ids: [2067],
							id: DURATION_FALLBACK_RESOURCE_ID,
							md5: DURATION_FALLBACK_HASH,
							title: "淡出",
						},
						text_animation: { animation_type: "out" },
					},
					{
						common_attr: {
							category_ids: [2065],
							id: "7665240025805753641",
							md5: "f".repeat(32),
							title: "视频动画不应进入文字目录",
						},
					},
				],
			}),
		]);

		const catalog = await buildJianyingTextAnimationCatalog({
			cacheRoot,
			databaseRoot,
		});

		expect(catalog).toMatchObject({
			count: 2,
			catalogCount: 2,
			packageCount: 2,
			missingPackageCount: 0,
			invalidPackageCount: 0,
			animations: [
				{
					title: "文字旋入",
					slot: "entrance",
					duration: 0.75,
				},
				{
					title: "淡出",
					slot: "exit",
					duration: 0.5,
				},
			],
		});
	});
});
