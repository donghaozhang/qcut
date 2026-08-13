// @vitest-environment node
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { resolveJianyingTextPackageOwnership } from "../jianying-text-package-ownership.js";

const temporaryDirectories: string[] = [];

async function createDatabaseRoot() {
	const root = await mkdtemp(join(tmpdir(), "qcut-text-ownership-"));
	temporaryDirectories.push(root);
	const accountDirectory = join(root, "account-one");
	const packageRoot = join(root, "packages");
	await Promise.all([
		mkdir(accountDirectory, { recursive: true }),
		mkdir(packageRoot, { recursive: true }),
	]);
	const database = new DatabaseSync(join(accountDirectory, "rp.db"));
	database.exec(`
		CREATE TABLE http_cache (
			url TEXT NOT NULL,
			response_body TEXT NOT NULL,
			timestamp INTEGER NOT NULL
		)
	`);
	return { database, packageRoot, root };
}

async function createCanonicalLutPackage({
	packageRoot,
	resourceId,
	version,
}: {
	packageRoot: string;
	resourceId: string;
	version: string;
}) {
	const amazingFeatureRoot = join(
		packageRoot,
		resourceId,
		version,
		"AmazingFeature"
	);
	const files = [
		"material/Filter.material",
		"xshader/Filter.xshader",
		"xshader/filter.frag",
		"texture/filter.cube.texture",
		"texture/filter.cube.vf",
	];
	await Promise.all(
		files.map(async (relativePath) => {
			const filePath = join(amazingFeatureRoot, relativePath);
			await mkdir(dirname(filePath), { recursive: true });
			await writeFile(filePath, "fixture");
		})
	);
}

async function createPackageFiles({
	files,
	packageRoot,
	resourceId,
	version,
}: {
	files: Record<string, string>;
	packageRoot: string;
	resourceId: string;
	version: string;
}) {
	await Promise.all(
		Object.entries(files).map(async ([relativePath, contents]) => {
			const filePath = join(packageRoot, resourceId, version, relativePath);
			await mkdir(dirname(filePath), { recursive: true });
			await writeFile(filePath, contents);
		})
	);
}

function catalogResponse({
	resourceId,
	version,
}: {
	resourceId: string;
	version: string;
}) {
	return JSON.stringify({
		data: {
			effect_item_list: [
				{
					common_attr: {
						id: resourceId,
						md5: version,
					},
				},
			],
		},
	});
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true }))
	);
});

describe("Jianying text package ownership", () => {
	it("classifies exact and stale catalog identities without exposing URLs", async () => {
		const { database, packageRoot, root } = await createDatabaseRoot();
		const flowerId = "7405879107424111910";
		const filterId = "7127559231062002951";
		const staleFilterId = "7320428711487098153";
		const ambiguousId = "7330581892510649636";
		const missingId = "7460115630973340940";
		const versions = {
			flower: "a".repeat(32),
			filter: "b".repeat(32),
			staleFilter: "c".repeat(32),
			newFilter: "d".repeat(32),
			ambiguous: "e".repeat(32),
			missing: "f".repeat(32),
		};
		const insert = database.prepare(
			"INSERT INTO http_cache (url, response_body, timestamp) VALUES (?, ?, ?)"
		);
		insert.run(
			"https://example.test/flower_jianyingpro_0",
			catalogResponse({ resourceId: flowerId, version: versions.flower }),
			1
		);
		insert.run(
			"https://example.test/get_resources_by_category_id?panel=filter",
			catalogResponse({ resourceId: filterId, version: versions.filter }),
			2
		);
		insert.run(
			"https://example.test/filter/list",
			catalogResponse({
				resourceId: staleFilterId,
				version: versions.newFilter,
			}),
			3
		);
		insert.run(
			"https://example.test/flower/list",
			catalogResponse({
				resourceId: ambiguousId,
				version: versions.ambiguous,
			}),
			4
		);
		insert.run(
			"https://example.test/video-mask-stroke/list",
			catalogResponse({
				resourceId: ambiguousId,
				version: versions.ambiguous,
			}),
			5
		);
		database.close();

		const ownership = await resolveJianyingTextPackageOwnership({
			databaseRoot: root,
			packageRoot,
			references: [
				{ resourceId: flowerId, version: versions.flower },
				{ resourceId: filterId, version: versions.filter },
				{ resourceId: staleFilterId, version: versions.staleFilter },
				{ resourceId: ambiguousId, version: versions.ambiguous },
				{ resourceId: missingId, version: versions.missing },
			],
		});

		expect(ownership.get(`${flowerId}/${versions.flower}`)).toEqual({
			kind: "flower",
			match: "exact",
			catalogFamilies: ["flower"],
		});
		expect(ownership.get(`${filterId}/${versions.filter}`)).toEqual({
			kind: "non-flower",
			match: "exact",
			catalogFamilies: ["filter"],
		});
		expect(ownership.get(`${staleFilterId}/${versions.staleFilter}`)).toEqual({
			kind: "non-flower",
			match: "resource-lineage",
			catalogFamilies: ["filter"],
		});
		expect(ownership.get(`${ambiguousId}/${versions.ambiguous}`)).toEqual({
			kind: "ambiguous",
			match: "exact",
			catalogFamilies: ["flower", "video-mask-stroke"],
		});
		expect(ownership.get(`${missingId}/${versions.missing}`)).toEqual({
			kind: "unclassified",
			match: "none",
			catalogFamilies: [],
		});
		expect(JSON.stringify([...ownership.values()])).not.toContain("https://");
	});

	it("classifies an uncatalogued canonical LUT package as non-flower", async () => {
		const { database, packageRoot, root } = await createDatabaseRoot();
		const resourceId = "7095668136946453797";
		const version = "5bb19a38eb5463945451985631a8fec7";
		database.close();
		await createCanonicalLutPackage({ packageRoot, resourceId, version });

		const ownership = await resolveJianyingTextPackageOwnership({
			databaseRoot: root,
			packageRoot,
			references: [{ resourceId, version, packageKind: "AmazingFeature" }],
		});

		expect(ownership.get(`${resourceId}/${version}`)).toEqual({
			kind: "non-flower",
			match: "package-structure",
			catalogFamilies: ["filter"],
		});
	});

	it("uses catalog item structure instead of generic filter query text", async () => {
		const { database, packageRoot, root } = await createDatabaseRoot();
		const resourceId = "7644791835625442622";
		const unknownResourceId = "7644791835625442623";
		const version = "a".repeat(32);
		database
			.prepare(
				"INSERT INTO http_cache (url, response_body, timestamp) VALUES (?, ?, ?)"
			)
			.run(
				"/artist/v1/panel/get_panel_info_default_get_all_resource_filter_paid_type_only_commercial0",
				JSON.stringify({
					data: {
						effect_item_list: [
							{
								common_attr: { id: resourceId, md5: version },
								sticker: { sticker_type: 2 },
							},
							{
								common_attr: {
									id: unknownResourceId,
									md5: version,
								},
							},
						],
					},
				}),
				1
			);
		database.close();

		const ownership = await resolveJianyingTextPackageOwnership({
			databaseRoot: root,
			packageRoot,
			references: [
				{ resourceId, version, packageKind: "InfoSticker" },
				{
					resourceId: unknownResourceId,
					version,
					packageKind: "InfoSticker",
				},
			],
		});

		expect(ownership.get(`${resourceId}/${version}`)).toEqual({
			kind: "non-flower",
			match: "exact",
			catalogFamilies: ["sticker"],
		});
		expect(ownership.get(`${unknownResourceId}/${version}`)).toEqual({
			kind: "unclassified",
			match: "none",
			catalogFamilies: [],
		});
	});

	it("classifies nested catalog dependencies as components", async () => {
		const { database, packageRoot, root } = await createDatabaseRoot();
		const resourceId = "6935356483945107982";
		const version = "b".repeat(32);
		const dependencies = {
			depend_resource_list: [{ resource_id: resourceId, type: "system-fonts" }],
		};
		database
			.prepare(
				"INSERT INTO http_cache (url, response_body, timestamp) VALUES (?, ?, ?)"
			)
			.run(
				"/artist/v1/effect/subtitle-templates_jianyingpro_0",
				JSON.stringify({
					data: {
						effect_item_list: [
							{
								common_attr: {
									id: "7599874183467699518",
									md5: "c".repeat(32),
									sdk_extra: JSON.stringify(dependencies),
								},
								subtitle_template: {
									depend_resource_list: [
										{ resource_id: resourceId, type: "fonts" },
									],
								},
							},
						],
					},
				}),
				1
			);
		database.close();

		const ownership = await resolveJianyingTextPackageOwnership({
			databaseRoot: root,
			packageRoot,
			references: [{ resourceId, version, packageKind: "InfoSticker" }],
		});

		expect(ownership.get(`${resourceId}/${version}`)).toEqual({
			kind: "component",
			match: "catalog-dependency",
			catalogFamilies: ["subtitle-template"],
			dependencyTypes: ["fonts", "system-fonts"],
		});
	});

	it("classifies uncatalogued standalone sticker layouts as non-flower", async () => {
		const { database, packageRoot, root } = await createDatabaseRoot();
		const resourceId = "6972823419947650312";
		const version = "d".repeat(32);
		database.close();
		await createPackageFiles({
			packageRoot,
			resourceId,
			version,
			files: {
				"config.json": "{}",
				"heycanInfo.json": "{}",
				"infoSticker.lua": "return {}",
				"singleImage.png": "png",
			},
		});

		const ownership = await resolveJianyingTextPackageOwnership({
			databaseRoot: root,
			packageRoot,
			references: [{ resourceId, version, packageKind: "InfoSticker" }],
		});

		expect(ownership.get(`${resourceId}/${version}`)).toEqual({
			kind: "non-flower",
			match: "package-structure",
			catalogFamilies: ["sticker"],
		});
	});

	it("classifies legacy atlas stickers without relying on known IDs", async () => {
		const { database, packageRoot, root } = await createDatabaseRoot();
		const resourceId = "6895926949911301390";
		const version = "e".repeat(32);
		database.close();
		await createPackageFiles({
			packageRoot,
			resourceId,
			version,
			files: {
				"config.json": "{}",
				"infoSticker.lua": "return {}",
				"atlas/frames.json": "{}",
				"atlas/texture.png": "png",
			},
		});

		const ownership = await resolveJianyingTextPackageOwnership({
			databaseRoot: root,
			packageRoot,
			references: [{ resourceId, version, packageKind: "InfoSticker" }],
		});

		expect(ownership.get(`${resourceId}/${version}`)).toEqual({
			kind: "non-flower",
			match: "package-structure",
			catalogFamilies: ["sticker"],
		});
	});

	it("classifies uncatalogued compound text templates as non-flower", async () => {
		const { database, packageRoot, root } = await createDatabaseRoot();
		const resourceId = "7090496807737888034";
		const version = "f".repeat(32);
		database.close();
		await createPackageFiles({
			packageRoot,
			resourceId,
			version,
			files: {
				"config.json": "{}",
				"content.json": JSON.stringify({ root: {}, type: "TextTemplate" }),
				"extra.json": JSON.stringify({ depend_resource_list: [] }),
			},
		});

		const ownership = await resolveJianyingTextPackageOwnership({
			databaseRoot: root,
			packageRoot,
			references: [{ resourceId, version, packageKind: "InfoSticker" }],
		});

		expect(ownership.get(`${resourceId}/${version}`)).toEqual({
			kind: "non-flower",
			match: "package-structure",
			catalogFamilies: ["text-template"],
		});
	});

	it("keeps uncatalogued effect-graph InfoSticker packages unclassified", async () => {
		const { database, packageRoot, root } = await createDatabaseRoot();
		const resourceId = "7008920255976312095";
		const version = "1".repeat(32);
		database.close();
		await createPackageFiles({
			packageRoot,
			resourceId,
			version,
			files: {
				"config.json": "{}",
				"content.json": JSON.stringify({
					filemap: { prefab: "effect.prefab" },
				}),
				"effect.prefab": "prefab",
				"main.scene": "scene",
				"sticker.config": "sticker",
			},
		});

		const ownership = await resolveJianyingTextPackageOwnership({
			databaseRoot: root,
			packageRoot,
			references: [{ resourceId, version, packageKind: "InfoSticker" }],
		});

		expect(ownership.get(`${resourceId}/${version}`)).toEqual({
			kind: "unclassified",
			match: "none",
			catalogFamilies: [],
		});
	});

	it("classifies only structured ScriptInfoSticker references as components", async () => {
		const { database, packageRoot, root } = await createDatabaseRoot();
		const componentId = "7008920255976312095";
		const unrelatedId = "7008920255976312096";
		const scriptId = "7413397177612995877";
		const version = "1".repeat(32);
		database.close();
		await Promise.all([
			createPackageFiles({
				packageRoot,
				resourceId: componentId,
				version,
				files: {
					"config.json": JSON.stringify({
						effect: { Link: [{ type: "InfoSticker" }] },
					}),
					"content.json": JSON.stringify({
						filemap: { prefab: "effect.prefab" },
					}),
				},
			}),
			createPackageFiles({
				packageRoot,
				resourceId: unrelatedId,
				version,
				files: {
					"config.json": JSON.stringify({
						effect: { Link: [{ type: "InfoSticker" }] },
					}),
					"content.json": JSON.stringify({
						filemap: { prefab: "effect.prefab" },
					}),
				},
			}),
			createPackageFiles({
				packageRoot,
				resourceId: scriptId,
				version,
				files: {
					"config.json": JSON.stringify({
						effect: { Link: [{ type: "ScriptInfoSticker" }] },
					}),
					"content.json": JSON.stringify({
						children: [
							{
								note: unrelatedId,
								text_params: {
									richText: `<effectStyle id="${componentId}" path="">花字</effectStyle>`,
								},
							},
						],
					}),
				},
			}),
		]);

		const ownership = await resolveJianyingTextPackageOwnership({
			databaseRoot: root,
			packageRoot,
			references: [
				{ resourceId: componentId, version, packageKind: "InfoSticker" },
				{ resourceId: unrelatedId, version, packageKind: "InfoSticker" },
			],
		});

		expect(ownership.get(`${componentId}/${version}`)).toEqual({
			kind: "component",
			match: "package-dependency",
			catalogFamilies: ["text-component"],
			dependencyTypes: ["effect-style"],
		});
		expect(ownership.get(`${unrelatedId}/${version}`)).toEqual({
			kind: "unclassified",
			match: "none",
			catalogFamilies: [],
		});
	});

	it("recovers direct word-art ownership from local project selections", async () => {
		const { database, packageRoot, root } = await createDatabaseRoot();
		const projectRoot = join(root, "projects");
		const resourceId = "7067070987363208485";
		const unrelatedId = "7067070987363208486";
		const version = "2".repeat(32);
		database.close();
		await mkdir(join(projectRoot, "draft"), { recursive: true });
		await writeFile(
			join(projectRoot, "draft", "key_value.json"),
			JSON.stringify({
				valid: {
					materialCategory: "text",
					materialId: resourceId,
					materialName: "潮酷 紫色 发光",
					materialSubcategory: "text_special_effect",
				},
				unrelated: {
					materialCategory: "video",
					materialId: unrelatedId,
					materialName: "不是花字",
					materialSubcategory: "text_special_effect",
				},
			})
		);

		const ownership = await resolveJianyingTextPackageOwnership({
			databaseRoot: root,
			packageRoot,
			projectRoot,
			references: [
				{ resourceId, version, packageKind: "InfoSticker" },
				{ resourceId: unrelatedId, version, packageKind: "InfoSticker" },
			],
		});

		expect(ownership.get(`${resourceId}/${version}`)).toEqual({
			kind: "flower",
			match: "project-selection",
			catalogFamilies: ["flower"],
			title: "潮酷 紫色 发光",
		});
		expect(ownership.get(`${unrelatedId}/${version}`)).toEqual({
			kind: "unclassified",
			match: "none",
			catalogFamilies: [],
		});
	});

	it("does not infer structural ownership for other package kinds", async () => {
		const { database, packageRoot, root } = await createDatabaseRoot();
		const resourceId = "7095668136946453797";
		const version = "5bb19a38eb5463945451985631a8fec7";
		database.close();
		await createCanonicalLutPackage({ packageRoot, resourceId, version });

		const ownership = await resolveJianyingTextPackageOwnership({
			databaseRoot: root,
			packageRoot,
			references: [{ resourceId, version, packageKind: "InfoSticker" }],
		});

		expect(ownership.get(`${resourceId}/${version}`)).toEqual({
			kind: "unclassified",
			match: "none",
			catalogFamilies: [],
		});
	});

	it("ignores malformed identities", async () => {
		const { database, packageRoot } = await createDatabaseRoot();
		database.close();
		const ownership = await resolveJianyingTextPackageOwnership({
			databaseRoot: "/missing",
			packageRoot,
			references: [
				{ resourceId: "not-an-id", version: "a".repeat(32) },
				{ resourceId: "123", version: "not-a-hash" },
			],
		});
		expect(ownership.size).toBe(0);
	});
});
