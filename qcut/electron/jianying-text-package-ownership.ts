import { constants } from "node:fs";
import { access, readdir } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getDefaultJianyingFlowerDatabaseRoot } from "./jianying-flower-resource-metadata.js";
import { listJianyingResourceDatabasePaths } from "./jianying-resource-database.js";
import {
	collectJianyingProjectWordArtEvidence,
	collectJianyingScriptComponentRoles,
	jianyingProjectStoreRootForPackageRoot,
	type JianyingProjectWordArtEvidence,
} from "./jianying-text-local-ownership-evidence.js";
import {
	JIANYING_TEXT_PACKAGE_HASH_PATTERN,
	JIANYING_TEXT_RESOURCE_ID_PATTERN,
	readBoundedJianyingTextJson,
} from "./jianying-text-package-metadata.js";
import type { JianyingTextStylePackageKind } from "./jianying-text-style-lab-contract.js";
import { jianyingEffectCacheRoot } from "./native-pipeline/filters/filter-lab-lut.js";

export type JianyingTextPackageOwnershipKind =
	| "flower"
	| "non-flower"
	| "component"
	| "ambiguous"
	| "unclassified";

export type JianyingTextPackageOwnershipMatch =
	| "exact"
	| "resource-lineage"
	| "catalog-dependency"
	| "project-selection"
	| "package-dependency"
	| "package-structure"
	| "none";

export type JianyingTextCatalogFamily =
	| "flower"
	| "filter"
	| "video-mask-stroke"
	| "sticker"
	| "text-template"
	| "subtitle-template"
	| "text-component"
	| "font"
	| "composition";

export interface JianyingTextPackageOwnership {
	kind: JianyingTextPackageOwnershipKind;
	match: JianyingTextPackageOwnershipMatch;
	catalogFamilies: JianyingTextCatalogFamily[];
	dependencyTypes?: string[];
	title?: string;
}

export interface JianyingTextPackageOwnershipReference {
	resourceId: string;
	version: string;
	packageKind?: JianyingTextStylePackageKind;
}

interface CatalogOwnershipRow {
	resourceId: string;
	packageHash?: string;
	family: JianyingTextCatalogFamily;
	relation: "direct" | "dependency";
	dependencyType?: string;
}

interface CatalogResponseRow {
	url: string;
	body: string;
}

const MAXIMUM_CATALOG_RESPONSE_CHARACTERS = 32 * 1024 * 1024;
const MAXIMUM_CATALOG_RESPONSE_NODES = 250_000;
const MAXIMUM_NESTED_JSON_CHARACTERS = 2 * 1024 * 1024;
const CATALOG_FAMILY_ORDER = [
	"flower",
	"filter",
	"video-mask-stroke",
	"sticker",
	"text-template",
	"subtitle-template",
	"text-component",
	"font",
	"composition",
] as const satisfies readonly JianyingTextCatalogFamily[];

function ownershipKey({
	resourceId,
	version,
}: JianyingTextPackageOwnershipReference) {
	return `${resourceId}/${version.toLowerCase()}`;
}

function tableExists({
	database,
	table,
}: {
	database: DatabaseSync;
	table: string;
}) {
	const row = database
		.prepare(
			"SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?) AS present"
		)
		.get(table) as { present?: number } | undefined;
	return row?.present === 1;
}

function readCatalogResponses({
	database,
	resourceIds,
}: {
	database: DatabaseSync;
	resourceIds: ReadonlySet<string>;
}) {
	if (!tableExists({ database, table: "http_cache" })) return [];
	const resourcePattern = new RegExp([...resourceIds].join("|"));
	const rows = database
		.prepare("SELECT url, response_body AS body FROM http_cache")
		.iterate() as IterableIterator<CatalogResponseRow>;
	const matching: CatalogResponseRow[] = [];
	for (const row of rows) {
		if (
			row.body.length > 0 &&
			row.body.length <= MAXIMUM_CATALOG_RESPONSE_CHARACTERS &&
			resourcePattern.test(row.body)
		) {
			matching.push(row);
		}
	}
	return matching;
}

function asRecord({ value }: { value: unknown }) {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function recordHasOwnKey({
	key,
	record,
}: {
	key: string;
	record: Record<string, unknown>;
}) {
	return Object.getOwnPropertyDescriptor(record, key) !== undefined;
}

function catalogFamilyFromUrl({ url }: { url: string }) {
	const normalized = url.toLowerCase();
	if (normalized.includes("video-mask-stroke")) {
		return "video-mask-stroke" as const;
	}
	if (normalized.includes("subtitle-templates")) {
		return "subtitle-template" as const;
	}
	if (normalized.includes("composition")) return "composition" as const;
	if (normalized.includes("flower")) return "flower" as const;
	if (
		normalized.includes("panel=filter") ||
		/(?:\/filter(?:\/|$)|_filter_jianying)/.test(normalized)
	) {
		return "filter" as const;
	}
	if (/(?:^|[/_?&=])sticker(?:[/_?&=]|$)/.test(normalized)) {
		return "sticker" as const;
	}
	if (/(?:^|[/_?&=])font(?:[/_?&=]|$)/.test(normalized)) {
		return "font" as const;
	}
	return null;
}

function catalogFamilyFromRecord({
	record,
}: {
	record: Record<string, unknown>;
}) {
	if (recordHasOwnKey({ key: "word_art", record })) return "flower" as const;
	if (recordHasOwnKey({ key: "filter", record })) return "filter" as const;
	if (recordHasOwnKey({ key: "sticker", record })) return "sticker" as const;
	if (recordHasOwnKey({ key: "subtitle_template", record })) {
		return "subtitle-template" as const;
	}
	if (recordHasOwnKey({ key: "text_template", record })) {
		return "text-template" as const;
	}
	if (recordHasOwnKey({ key: "font", record })) return "font" as const;
	const effectType = asRecord({ value: record.common_attr })?.effect_type;
	switch (effectType) {
		case 1:
			return "flower" as const;
		case 2:
			return "sticker" as const;
		case 6:
			return "text-template" as const;
		case 10:
			return "font" as const;
		case 12:
			return "filter" as const;
		case 28:
			return "video-mask-stroke" as const;
		case 29:
			return "text-component" as const;
		default:
			return null;
	}
}

function parseNestedJson({ value }: { value: string }) {
	if (value.length === 0 || value.length > MAXIMUM_NESTED_JSON_CHARACTERS) {
		return null;
	}
	const trimmed = value.trimStart();
	if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return null;
	try {
		return JSON.parse(value) as unknown;
	} catch {
		return null;
	}
}

function dependencyType({ value }: { value: unknown }) {
	return typeof value === "string" && /^[a-z0-9_-]{1,64}$/i.test(value)
		? value
		: undefined;
}

function collectResponseRows({
	body,
	resourceIds,
	url,
}: {
	body: string;
	resourceIds: ReadonlySet<string>;
	url: string;
}) {
	let response: unknown;
	try {
		response = JSON.parse(body) as unknown;
	} catch {
		return [];
	}
	const rows: CatalogOwnershipRow[] = [];
	const pending: {
		family: JianyingTextCatalogFamily | null;
		value: unknown;
	}[] = [{ family: catalogFamilyFromUrl({ url }), value: response }];
	let inspectedNodeCount = 0;
	while (
		pending.length > 0 &&
		inspectedNodeCount < MAXIMUM_CATALOG_RESPONSE_NODES
	) {
		const current = pending.pop();
		inspectedNodeCount += 1;
		if (!current) continue;
		const { family, value } = current;
		if (typeof value === "string") {
			const nested = parseNestedJson({ value });
			if (nested !== null) pending.push({ family, value: nested });
			continue;
		}
		if (Array.isArray(value)) {
			for (const child of value) {
				if (
					pending.length + inspectedNodeCount >=
					MAXIMUM_CATALOG_RESPONSE_NODES
				) {
					break;
				}
				pending.push({ family, value: child });
			}
			continue;
		}
		const record = asRecord({ value });
		if (!record) continue;
		const recordFamily = catalogFamilyFromRecord({ record }) ?? family;
		const attributes = asRecord({ value: record.common_attr });
		const resourceId = attributes?.id;
		const packageHash = attributes?.md5;
		if (
			recordFamily &&
			typeof resourceId === "string" &&
			resourceIds.has(resourceId) &&
			typeof packageHash === "string" &&
			JIANYING_TEXT_PACKAGE_HASH_PATTERN.test(packageHash)
		) {
			rows.push({
				resourceId,
				packageHash: packageHash.toLowerCase(),
				family: recordFamily,
				relation: "direct",
			});
		}
		const dependencyResourceId = record.resource_id;
		if (
			recordFamily &&
			typeof dependencyResourceId === "string" &&
			resourceIds.has(dependencyResourceId)
		) {
			const role = dependencyType({ value: record.type });
			rows.push({
				resourceId: dependencyResourceId,
				family: recordFamily,
				relation: "dependency",
				...(role ? { dependencyType: role } : {}),
			});
		}
		for (const child of Object.values(record)) {
			if (
				pending.length + inspectedNodeCount >=
				MAXIMUM_CATALOG_RESPONSE_NODES
			) {
				break;
			}
			pending.push({ family: recordFamily, value: child });
		}
	}
	return rows;
}

function collectRows({
	databasePath,
	resourceIds,
}: {
	databasePath: string;
	resourceIds: ReadonlySet<string>;
}) {
	const database = new DatabaseSync(databasePath, { readOnly: true });
	try {
		return readCatalogResponses({ database, resourceIds }).flatMap(
			({ body, url }) => collectResponseRows({ body, resourceIds, url })
		);
	} finally {
		database.close();
	}
}

function sortFamilies({
	families,
}: {
	families: Set<JianyingTextCatalogFamily>;
}) {
	return CATALOG_FAMILY_ORDER.filter((family) => families.has(family));
}

function classifyFamilies({
	families,
	match,
}: {
	families: Set<JianyingTextCatalogFamily>;
	match: JianyingTextPackageOwnershipMatch;
}): JianyingTextPackageOwnership {
	const hasFlower = families.has("flower");
	const hasNonFlower = [...families].some((family) => family !== "flower");
	if (hasFlower && hasNonFlower) {
		return {
			kind: "ambiguous",
			match,
			catalogFamilies: sortFamilies({ families }),
		};
	}
	if (hasFlower) {
		return {
			kind: "flower",
			match,
			catalogFamilies: sortFamilies({ families }),
		};
	}
	if (hasNonFlower) {
		return {
			kind: "non-flower",
			match,
			catalogFamilies: sortFamilies({ families }),
		};
	}
	return { kind: "unclassified", match, catalogFamilies: [] };
}

function classifyReference({
	reference,
	rows,
}: {
	reference: JianyingTextPackageOwnershipReference;
	rows: CatalogOwnershipRow[];
}) {
	const directRows = rows.filter(({ relation }) => relation === "direct");
	const exactFamilies = new Set<JianyingTextCatalogFamily>();
	const lineageFamilies = new Set<JianyingTextCatalogFamily>();
	for (const row of directRows) {
		lineageFamilies.add(row.family);
		if (row.packageHash === reference.version.toLowerCase()) {
			exactFamilies.add(row.family);
		}
	}
	if (exactFamilies.size > 0) {
		return classifyFamilies({ families: exactFamilies, match: "exact" });
	}
	if (lineageFamilies.size > 0) {
		return classifyFamilies({
			families: lineageFamilies,
			match: "resource-lineage",
		});
	}
	const dependencyRows = rows.filter(
		({ relation }) => relation === "dependency"
	);
	if (dependencyRows.length > 0) {
		const families = new Set(dependencyRows.map(({ family }) => family));
		const dependencyTypes = Array.from(
			new Set(
				dependencyRows.flatMap(({ dependencyType: type }) =>
					type ? [type] : []
				)
			)
		).sort();
		return {
			kind: "component" as const,
			match: "catalog-dependency" as const,
			catalogFamilies: sortFamilies({ families }),
			...(dependencyTypes.length > 0 ? { dependencyTypes } : {}),
		};
	}
	return {
		kind: "unclassified" as const,
		match: "none" as const,
		catalogFamilies: [],
	};
}

function classifyProjectSelection({
	projectEvidence,
	reference,
}: {
	projectEvidence: ReadonlyMap<string, JianyingProjectWordArtEvidence>;
	reference: JianyingTextPackageOwnershipReference;
}): JianyingTextPackageOwnership | null {
	const selectedWordArt = projectEvidence.get(reference.resourceId);
	if (selectedWordArt) {
		return {
			kind: "flower",
			match: "project-selection",
			catalogFamilies: ["flower"],
			...(selectedWordArt.title ? { title: selectedWordArt.title } : {}),
		};
	}
	return null;
}

function classifyPackageDependency({
	componentRoles,
	reference,
}: {
	componentRoles: ReadonlyMap<string, readonly string[]>;
	reference: JianyingTextPackageOwnershipReference;
}): JianyingTextPackageOwnership | null {
	const dependencyTypes = componentRoles.get(reference.resourceId);
	if (dependencyTypes && dependencyTypes.length > 0) {
		return {
			kind: "component",
			match: "package-dependency",
			catalogFamilies: ["text-component"],
			dependencyTypes: [...dependencyTypes],
		};
	}
	return null;
}

function normalizeReferences({
	references,
}: {
	references: JianyingTextPackageOwnershipReference[];
}) {
	const byKey = new Map<string, JianyingTextPackageOwnershipReference>();
	for (const reference of references) {
		if (
			!JIANYING_TEXT_RESOURCE_ID_PATTERN.test(reference.resourceId) ||
			!JIANYING_TEXT_PACKAGE_HASH_PATTERN.test(reference.version)
		) {
			continue;
		}
		const normalized = {
			resourceId: reference.resourceId,
			version: reference.version.toLowerCase(),
			...(reference.packageKind ? { packageKind: reference.packageKind } : {}),
		};
		byKey.set(ownershipKey(normalized), normalized);
	}
	return [...byKey.values()];
}

async function packageFileExists({
	packagePath,
	relativePath,
}: {
	packagePath: string;
	relativePath: string;
}) {
	try {
		await access(path.join(packagePath, relativePath), constants.R_OK);
		return true;
	} catch {
		return false;
	}
}

async function packageFilesExist({
	packagePath,
	relativePaths,
}: {
	packagePath: string;
	relativePaths: string[];
}) {
	const checks = await Promise.all(
		relativePaths.map((relativePath) =>
			packageFileExists({ packagePath, relativePath })
		)
	);
	return checks.every(Boolean);
}

async function isCanonicalLutAmazingFeature({
	packageRoot,
	reference,
}: {
	packageRoot: string;
	reference: JianyingTextPackageOwnershipReference;
}) {
	if (reference.packageKind !== "AmazingFeature") return false;
	const packagePath = path.join(
		packageRoot,
		reference.resourceId,
		reference.version,
		"AmazingFeature"
	);
	const [hasCoreFiles, cubePayloads] = await Promise.all([
		packageFilesExist({
			packagePath,
			relativePaths: [
				"material/Filter.material",
				"xshader/Filter.xshader",
				"xshader/filter.frag",
				"texture/filter.cube.texture",
			],
		}),
		Promise.all(
			["texture/filter.cube", "texture/filter.cube.vf"].map((relativePath) =>
				packageFileExists({ packagePath, relativePath })
			)
		),
	]);
	return hasCoreFiles && cubePayloads.some(Boolean);
}

async function classifyInfoStickerStructure({
	packageRoot,
	reference,
}: {
	packageRoot: string;
	reference: JianyingTextPackageOwnershipReference;
}): Promise<JianyingTextCatalogFamily | null> {
	if (reference.packageKind !== "InfoSticker") return null;
	const packagePath = path.join(
		packageRoot,
		reference.resourceId,
		reference.version
	);
	const relativeFiles = await readdir(packagePath, { recursive: true }).catch(
		() => []
	);
	const files = new Set(relativeFiles);
	const isStaticSticker =
		files.has("infoSticker.lua") && files.has("singleImage.png");
	const isGifSticker = files.has("heycanInfo.json") && files.has("final.gif");
	const isSequenceSticker =
		files.has("infoSticker.lua") &&
		files.has("SequenceMap.png") &&
		files.has("ani_info.json");
	const isLegacyAtlasSticker =
		files.has("infoSticker.lua") &&
		!files.has("content.json") &&
		relativeFiles.some(
			(relativePath) =>
				relativePath.includes(path.sep) && /\.png$/i.test(relativePath)
		) &&
		relativeFiles.some(
			(relativePath) =>
				relativePath.includes(path.sep) && /\.json$/i.test(relativePath)
		);
	if (
		isStaticSticker ||
		isGifSticker ||
		isSequenceSticker ||
		isLegacyAtlasSticker
	) {
		return "sticker";
	}
	if (!files.has("content.json")) return null;
	try {
		const content = asRecord({
			value: await readBoundedJianyingTextJson({
				filePath: path.join(packagePath, "content.json"),
			}),
		});
		return content?.type === "TextTemplate" ? "text-template" : null;
	} catch {
		return null;
	}
}

async function classifyPackageStructure({
	packageRoot,
	reference,
}: {
	packageRoot: string;
	reference: JianyingTextPackageOwnershipReference;
}) {
	if (await isCanonicalLutAmazingFeature({ packageRoot, reference })) {
		return "filter" as const;
	}
	return classifyInfoStickerStructure({ packageRoot, reference });
}

export async function resolveJianyingTextPackageOwnership({
	references,
	databaseRoot = getDefaultJianyingFlowerDatabaseRoot(),
	packageRoot,
	projectRoot,
}: {
	references: JianyingTextPackageOwnershipReference[];
	databaseRoot?: string;
	packageRoot?: string;
	projectRoot?: string;
}): Promise<Map<string, JianyingTextPackageOwnership>> {
	const normalizedReferences = normalizeReferences({ references });
	if (normalizedReferences.length === 0) return new Map();
	const resolvedPackageRoot = packageRoot ?? jianyingEffectCacheRoot();
	const resolvedProjectRoot =
		projectRoot ??
		jianyingProjectStoreRootForPackageRoot({
			packageRoot: resolvedPackageRoot,
		});
	const resourceIds = new Set(
		normalizedReferences.map(({ resourceId }) => resourceId)
	);
	const localEvidencePromise = Promise.all([
		collectJianyingProjectWordArtEvidence({
			projectRoot: resolvedProjectRoot,
			resourceIds,
		}),
		collectJianyingScriptComponentRoles({
			packageRoot: resolvedPackageRoot,
			resourceIds,
		}),
	]);
	const databasePaths = await listJianyingResourceDatabasePaths({
		databaseRoot,
	});
	const rows = databasePaths.flatMap((databasePath) => {
		try {
			return collectRows({
				databasePath,
				resourceIds,
			});
		} catch {
			return [];
		}
	});
	const rowsByResourceId = new Map<string, CatalogOwnershipRow[]>();
	for (const row of rows) {
		const current = rowsByResourceId.get(row.resourceId) ?? [];
		current.push(row);
		rowsByResourceId.set(row.resourceId, current);
	}
	const [projectEvidence, componentRoles] = await localEvidencePromise;
	const classifications = await Promise.all(
		normalizedReferences.map(async (reference) => {
			const catalogClassification = classifyReference({
				reference,
				rows: rowsByResourceId.get(reference.resourceId) ?? [],
			});
			const projectClassification =
				catalogClassification.kind === "unclassified"
					? classifyProjectSelection({
							projectEvidence,
							reference,
						})
					: null;
			const evidenceClassification =
				projectClassification ?? catalogClassification;
			const structuralFamily =
				evidenceClassification.kind === "unclassified" &&
				(await classifyPackageStructure({
					packageRoot: resolvedPackageRoot,
					reference,
				}));
			const dependencyClassification =
				evidenceClassification.kind === "unclassified" && !structuralFamily
					? classifyPackageDependency({ componentRoles, reference })
					: null;
			return [
				ownershipKey(reference),
				structuralFamily
					? {
							kind: "non-flower" as const,
							match: "package-structure" as const,
							catalogFamilies: [structuralFamily],
						}
					: (dependencyClassification ?? evidenceClassification),
			] as const;
		})
	);
	return new Map(classifications);
}
