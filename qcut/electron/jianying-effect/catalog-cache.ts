import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import type {
	JianyingEffectAdjustParameter,
	JianyingEffectCategory,
	JianyingEffectPanel,
} from "../jianying-effect-contract.js";
import type { CatalogItem } from "./catalog-parsing.js";

const CACHE_SCHEMA_VERSION = 1;
const MAX_CACHE_BYTES = 32 * 1024 * 1024;
const MAX_ITEMS = 5000;
const MAX_CATEGORIES = 500;
const MAX_PARAMETERS = 64;
const MAX_URL_LENGTH = 16_384;
const EFFECT_ID_PATTERN = /^\d{1,32}$/;
const PACKAGE_HASH_PATTERN = /^[a-f0-9]{32}$/i;
const PARAMETER_KEY_PATTERN = /^[a-z0-9_]+$/i;

export interface QCutEffectCatalogSnapshot {
	schemaVersion: 1;
	updatedAt: string;
	items: CatalogItem[];
	categories: JianyingEffectCategory[];
}

function recordValue({
	value,
}: {
	value: unknown;
}): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function boundedString({
	value,
	maximumLength,
}: {
	value: unknown;
	maximumLength: number;
}): string | null {
	return typeof value === "string" && value.length <= maximumLength
		? value
		: null;
}

function parsePanel({ value }: { value: unknown }): JianyingEffectPanel | null {
	return value === "effects2" || value === "face-prop" ? value : null;
}

function parseStringArray({
	value,
	maximumItems,
	maximumLength,
}: {
	value: unknown;
	maximumItems: number;
	maximumLength: number;
}): string[] | null {
	if (!Array.isArray(value) || value.length > maximumItems) return null;
	const parsed: string[] = [];
	for (const entry of value) {
		const text = boundedString({ value: entry, maximumLength });
		if (text === null) return null;
		parsed.push(text);
	}
	return parsed;
}

function parseAdjustParameter({
	value,
}: {
	value: unknown;
}): JianyingEffectAdjustParameter | null {
	const record = recordValue({ value });
	if (!record) return null;
	const key = boundedString({ value: record.key, maximumLength: 128 });
	if (!key || !PARAMETER_KEY_PATTERN.test(key)) return null;
	const { defaultValue, minimum, maximum } = record;
	if (
		typeof defaultValue !== "number" ||
		!Number.isFinite(defaultValue) ||
		typeof minimum !== "number" ||
		!Number.isFinite(minimum) ||
		typeof maximum !== "number" ||
		!Number.isFinite(maximum)
	) {
		return null;
	}
	return { key, defaultValue, minimum, maximum };
}

function parseAdjustParameters({
	value,
}: {
	value: unknown;
}): JianyingEffectAdjustParameter[] | null {
	if (!Array.isArray(value) || value.length > MAX_PARAMETERS) return null;
	const parameters: JianyingEffectAdjustParameter[] = [];
	for (const entry of value) {
		const parameter = parseAdjustParameter({ value: entry });
		if (!parameter) return null;
		parameters.push(parameter);
	}
	return parameters;
}

function parseHttpsUrls({ value }: { value: unknown }): string[] | null {
	const urls = parseStringArray({
		value,
		maximumItems: 8,
		maximumLength: MAX_URL_LENGTH,
	});
	if (!urls || urls.some((url) => !url.startsWith("https://"))) return null;
	return urls;
}

function parseCatalogItem({ value }: { value: unknown }): CatalogItem | null {
	const record = recordValue({ value });
	if (!record) return null;
	const effectId = boundedString({ value: record.effectId, maximumLength: 32 });
	const title = boundedString({ value: record.title, maximumLength: 512 });
	const md5 = boundedString({ value: record.md5, maximumLength: 32 });
	const resourceId = boundedString({
		value: record.resourceId,
		maximumLength: 128,
	});
	const panel = parsePanel({ value: record.panel });
	const requirements = parseStringArray({
		value: record.requirements,
		maximumItems: 64,
		maximumLength: 128,
	});
	const adjustParameters = parseAdjustParameters({
		value: record.adjustParameters,
	});
	const itemUrls = parseHttpsUrls({ value: record.itemUrls });
	const categoryIds = parseStringArray({
		value: record.categoryIds,
		maximumItems: 64,
		maximumLength: 64,
	});
	const coverUrl = boundedString({
		value: record.coverUrl,
		maximumLength: MAX_URL_LENGTH,
	});
	if (
		!effectId ||
		!EFFECT_ID_PATTERN.test(effectId) ||
		title === null ||
		!md5 ||
		!PACKAGE_HASH_PATTERN.test(md5) ||
		!resourceId ||
		!panel ||
		!requirements ||
		!adjustParameters ||
		!itemUrls ||
		!categoryIds ||
		coverUrl === null ||
		(coverUrl.length > 0 && !coverUrl.startsWith("https://")) ||
		typeof record.durationMs !== "number" ||
		!Number.isFinite(record.durationMs) ||
		record.durationMs <= 0 ||
		record.durationMs > 600_000 ||
		typeof record.vip !== "boolean"
	) {
		return null;
	}
	return {
		effectId,
		title,
		md5: md5.toLowerCase(),
		resourceId,
		panel,
		durationMs: record.durationMs,
		requirements,
		adjustParameters,
		vip: record.vip,
		itemUrls,
		categoryIds,
		coverUrl,
	};
}

function parseCategory({
	value,
}: {
	value: unknown;
}): JianyingEffectCategory | null {
	const record = recordValue({ value });
	if (!record) return null;
	const id = boundedString({ value: record.id, maximumLength: 128 });
	const name = boundedString({ value: record.name, maximumLength: 256 });
	const panel = parsePanel({ value: record.panel });
	const categoryIds = parseStringArray({
		value: record.categoryIds,
		maximumItems: 64,
		maximumLength: 64,
	});
	if (!id || !name || !panel || !categoryIds || categoryIds.length === 0) {
		return null;
	}
	return { id, name, panel, categoryIds };
}

export function parseQCutEffectCatalogSnapshot({
	value,
}: {
	value: unknown;
}): QCutEffectCatalogSnapshot | null {
	const record = recordValue({ value });
	if (!record || record.schemaVersion !== CACHE_SCHEMA_VERSION) {
		return null;
	}
	if (
		typeof record.updatedAt !== "string" ||
		!Array.isArray(record.items) ||
		record.items.length > MAX_ITEMS ||
		!Array.isArray(record.categories) ||
		record.categories.length > MAX_CATEGORIES
	) {
		return null;
	}
	const items: CatalogItem[] = [];
	for (const entry of record.items) {
		const item = parseCatalogItem({ value: entry });
		if (!item) return null;
		items.push(item);
	}
	const categories: JianyingEffectCategory[] = [];
	for (const entry of record.categories) {
		const category = parseCategory({ value: entry });
		if (!category) return null;
		categories.push(category);
	}
	return {
		schemaVersion: CACHE_SCHEMA_VERSION,
		updatedAt: record.updatedAt,
		items,
		categories,
	};
}

export async function readQCutEffectCatalogSnapshot({
	cachePath,
}: {
	cachePath: string;
}): Promise<QCutEffectCatalogSnapshot | null> {
	try {
		const metadata = await lstat(cachePath);
		if (!metadata.isFile() || metadata.size > MAX_CACHE_BYTES) return null;
		const text = await readFile(cachePath, "utf8");
		return parseQCutEffectCatalogSnapshot({ value: JSON.parse(text) });
	} catch {
		return null;
	}
}

export async function writeQCutEffectCatalogSnapshot({
	cachePath,
	items,
	categories,
}: {
	cachePath: string;
	items: CatalogItem[];
	categories: JianyingEffectCategory[];
}): Promise<void> {
	const snapshot: QCutEffectCatalogSnapshot = {
		schemaVersion: CACHE_SCHEMA_VERSION,
		updatedAt: new Date().toISOString(),
		items,
		categories,
	};
	if (items.length > MAX_ITEMS || categories.length > MAX_CATEGORIES) {
		throw new Error("QCut 特效目录缓存条目超过数量限制。");
	}
	const data = JSON.stringify(snapshot);
	if (Buffer.byteLength(data) > MAX_CACHE_BYTES) {
		throw new Error("QCut 特效目录缓存超过大小限制。");
	}
	await mkdir(path.dirname(cachePath), { recursive: true, mode: 0o700 });
	const pendingPath = `${cachePath}.${process.pid}.${randomUUID()}.tmp`;
	let handle: Awaited<ReturnType<typeof open>> | null = null;
	try {
		handle = await open(pendingPath, "wx", 0o600);
		await handle.writeFile(data, "utf8");
		await handle.sync();
		await handle.close();
		handle = null;
		await rename(pendingPath, cachePath);
	} finally {
		await handle?.close().catch(() => undefined);
		await rm(pendingPath, { force: true });
	}
}

function categoryIsUsed({
	category,
	items,
}: {
	category: JianyingEffectCategory;
	items: CatalogItem[];
}): boolean {
	return items.some(
		(item) =>
			item.panel === category.panel &&
			item.categoryIds.some((id) => category.categoryIds.includes(id))
	);
}

export function mergeQCutEffectCatalog({
	cached,
	liveItems,
	liveCategories,
}: {
	cached: QCutEffectCatalogSnapshot | null;
	liveItems: CatalogItem[];
	liveCategories: JianyingEffectCategory[];
}): Pick<QCutEffectCatalogSnapshot, "items" | "categories"> {
	const itemsById = new Map<string, CatalogItem>();
	for (const item of cached?.items ?? []) itemsById.set(item.effectId, item);
	for (const item of liveItems) itemsById.set(item.effectId, item);
	const items = [...itemsById.values()];

	const categoriesByKey = new Map<string, JianyingEffectCategory>();
	for (const category of [...liveCategories, ...(cached?.categories ?? [])]) {
		const key = `${category.panel}:${category.id}`;
		if (!categoriesByKey.has(key) && categoryIsUsed({ category, items })) {
			categoriesByKey.set(key, category);
		}
	}
	return { items, categories: [...categoriesByKey.values()] };
}

export function qcutEffectCatalogContentMatches({
	snapshot,
	items,
	categories,
}: {
	snapshot: QCutEffectCatalogSnapshot | null;
	items: CatalogItem[];
	categories: JianyingEffectCategory[];
}): boolean {
	if (!snapshot) return false;
	return (
		JSON.stringify(snapshot.items) === JSON.stringify(items) &&
		JSON.stringify(snapshot.categories) === JSON.stringify(categories)
	);
}

export function selectQCutEffectCategories({
	categories,
	items,
}: {
	categories: JianyingEffectCategory[];
	items: CatalogItem[];
}): JianyingEffectCategory[] {
	return categories.filter((category) => categoryIsUsed({ category, items }));
}
