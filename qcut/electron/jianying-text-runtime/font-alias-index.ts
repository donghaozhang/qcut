import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
	JIANYING_TEXT_PACKAGE_HASH_PATTERN,
	JIANYING_TEXT_RESOURCE_ID_PATTERN,
} from "../jianying-text-package-metadata.js";
import { mapWithConcurrency } from "../lib/map-with-concurrency.js";

const INDEX_TTL_MS = 60_000;
const SCAN_CONCURRENCY = 8;
const MAXIMUM_METADATA_BYTES = 16 * 1024 * 1024;
const MAXIMUM_NESTED_JSON_BYTES = 2 * 1024 * 1024;
const MAXIMUM_JSON_DEPTH = 64;
const FONT_METADATA_FILES = new Set([
	"content.json",
	"content.json.bak",
	"upgradeContent.json",
]);
const FONT_FILE_PATTERN = /\.(?:otf|ttc|ttf)$/i;
const FONT_CACHE_PATH_PATTERN = /(?:^|[\\/])text[\\/]/i;
const HASH_SEGMENT_PATTERN = /(?:^|[\\/])([a-f0-9]{32})(?:[\\/]|$)/i;

interface CachedFontAliasIndex {
	createdAt: number;
	promise: Promise<ReadonlyMap<string, string[]>>;
}

const indexes = new Map<string, CachedFontAliasIndex>();

function packageHashFromFontPath({ value }: { value: string }) {
	if (!(FONT_FILE_PATTERN.test(value) || FONT_CACHE_PATH_PATTERN.test(value))) {
		return null;
	}
	const packageHash = HASH_SEGMENT_PATTERN.exec(value)?.[1]?.toLowerCase();
	return packageHash && JIANYING_TEXT_PACKAGE_HASH_PATTERN.test(packageHash)
		? packageHash
		: null;
}

function addFontAlias({
	aliases,
	fontPath,
	resourceId,
}: {
	aliases: Map<string, Set<string>>;
	fontPath: unknown;
	resourceId: unknown;
}) {
	if (
		typeof resourceId !== "string" ||
		!JIANYING_TEXT_RESOURCE_ID_PATTERN.test(resourceId) ||
		typeof fontPath !== "string"
	) {
		return;
	}
	const packageHash = packageHashFromFontPath({ value: fontPath });
	if (!packageHash) return;
	const hashes = aliases.get(resourceId) ?? new Set<string>();
	hashes.add(packageHash);
	aliases.set(resourceId, hashes);
}

function collectFontAliases({
	aliases,
	depth,
	value,
}: {
	aliases: Map<string, Set<string>>;
	depth: number;
	value: unknown;
}) {
	if (depth > MAXIMUM_JSON_DEPTH) return;
	if (Array.isArray(value)) {
		for (const child of value) {
			collectFontAliases({ aliases, depth: depth + 1, value: child });
		}
		return;
	}
	if (typeof value === "string") {
		const trimmed = value.trimStart();
		if (
			value.length <= MAXIMUM_NESTED_JSON_BYTES &&
			(trimmed.startsWith("{") || trimmed.startsWith("["))
		) {
			try {
				collectFontAliases({
					aliases,
					depth: depth + 1,
					value: JSON.parse(value) as unknown,
				});
			} catch {
				return;
			}
		}
		return;
	}
	if (!(value && typeof value === "object")) return;
	const record = value as Record<string, unknown>;
	addFontAlias({
		aliases,
		resourceId: record.resource_id,
		fontPath: record.path,
	});
	addFontAlias({
		aliases,
		resourceId: record.font_resource_id,
		fontPath: record.font_path,
	});
	if (typeof record.path === "string" && FONT_FILE_PATTERN.test(record.path)) {
		addFontAlias({
			aliases,
			resourceId: record.id,
			fontPath: record.path,
		});
	}
	for (const child of Object.values(record)) {
		collectFontAliases({ aliases, depth: depth + 1, value: child });
	}
}

async function listVersionMetadataFiles({
	versionRoot,
}: {
	versionRoot: string;
}) {
	const entries = await readdir(versionRoot, { withFileTypes: true }).catch(
		() => []
	);
	return entries.flatMap((entry) =>
		entry.isFile() && FONT_METADATA_FILES.has(entry.name)
			? [path.join(versionRoot, entry.name)]
			: []
	);
}

async function listResourceMetadataFiles({
	resourceRoot,
}: {
	resourceRoot: string;
}) {
	const versionEntries = await readdir(resourceRoot, {
		withFileTypes: true,
	}).catch(() => []);
	const versionDirectories = versionEntries.filter((entry) =>
		entry.isDirectory()
	);
	const filesByVersion = await mapWithConcurrency({
		items: versionDirectories,
		limit: SCAN_CONCURRENCY,
		task: ({ item: versionEntry }) =>
			listVersionMetadataFiles({
				versionRoot: path.join(resourceRoot, versionEntry.name),
			}),
	});
	return filesByVersion.flat();
}

async function listFontMetadataFiles({
	artistEffectRoot,
}: {
	artistEffectRoot: string;
}) {
	const resourceEntries = await readdir(artistEffectRoot, {
		withFileTypes: true,
	}).catch(() => []);
	const resourceDirectories = resourceEntries.filter((entry) =>
		entry.isDirectory()
	);
	const filesByResource = await mapWithConcurrency({
		items: resourceDirectories,
		limit: SCAN_CONCURRENCY,
		task: ({ item: resourceEntry }) =>
			listResourceMetadataFiles({
				resourceRoot: path.join(artistEffectRoot, resourceEntry.name),
			}),
	});
	return filesByResource.flat().sort();
}

async function buildFontAliasIndex({ cacheRoot }: { cacheRoot: string }) {
	const metadataFiles = await listFontMetadataFiles({
		artistEffectRoot: path.join(cacheRoot, "artistEffect"),
	});
	const aliases = new Map<string, Set<string>>();
	await mapWithConcurrency({
		items: metadataFiles,
		limit: SCAN_CONCURRENCY,
		task: async ({ item: filePath }) => {
			try {
				const metadata = await stat(filePath);
				if (
					!metadata.isFile() ||
					metadata.size <= 0 ||
					metadata.size > MAXIMUM_METADATA_BYTES
				) {
					return;
				}
				collectFontAliases({
					aliases,
					depth: 0,
					value: JSON.parse(await readFile(filePath, "utf8")) as unknown,
				});
			} catch {
				return;
			}
		},
	});
	return new Map(
		[...aliases].map(([resourceId, hashes]) => [resourceId, [...hashes].sort()])
	);
}

function fontAliasIndex({ cacheRoot }: { cacheRoot: string }) {
	const cached = indexes.get(cacheRoot);
	if (cached && Date.now() - cached.createdAt < INDEX_TTL_MS) {
		return cached.promise;
	}
	const promise = buildFontAliasIndex({ cacheRoot }).catch((cause) => {
		indexes.delete(cacheRoot);
		throw cause;
	});
	indexes.set(cacheRoot, { createdAt: Date.now(), promise });
	return promise;
}

export async function findJianyingCachedFontPackageHashes({
	cacheRoots,
	resourceId,
}: {
	cacheRoots: string[];
	resourceId: string;
}) {
	if (!JIANYING_TEXT_RESOURCE_ID_PATTERN.test(resourceId)) return [];
	const indexesByRoot = await Promise.all(
		Array.from(new Set(cacheRoots)).map((cacheRoot) =>
			fontAliasIndex({ cacheRoot })
		)
	);
	return Array.from(
		new Set(indexesByRoot.flatMap((index) => index.get(resourceId) ?? []))
	).sort();
}
