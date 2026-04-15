/**
 * Kling V3 Omni element orchestrator for `flow novel2video`.
 *
 * Before Stage 4 can render shots with `--model gmi_kling_v3_omni`, every
 * character who appears with a portrait needs an `element_id` registered
 * on GMI's `kling-create-element` endpoint. This module handles that
 * pre-flight step and persists the mapping inside the project so re-runs
 * skip the (slow, paid) create-element calls.
 *
 * Cache file (idempotent per project):
 *   <project>/videos/kling-elements.json
 *   {
 *     "沈念安": { "element_id": "307795693621", "portrait_url": "..." },
 *     ...
 *   }
 *
 * If the cached `portrait_url` drifts (user regenerated portraits), the
 * orchestrator treats the entry as stale and re-creates the element.
 *
 * Testability: `createElementImpl` and `fs` are injectable.
 *
 * @module electron/native-pipeline/cli/vimax-cli-handlers/kling-element-orchestrator
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
	callModelApi,
	type ApiCallResult,
} from "../../infra/api-caller.js";

export interface KlingElementCacheEntry {
	element_id: string;
	portrait_url: string;
	created_at: string;
}

export type KlingElementCache = Record<string, KlingElementCacheEntry>;

/** Call signature for creating a single Kling element. Injectable for tests. */
export type CreateKlingElementFn = (args: {
	name: string;
	description: string;
	frontalImageUrl: string;
}) => Promise<{ success: true; elementId: string } | { success: false; error: string }>;

/** Default implementation: calls GMI `kling-create-element`. */
export async function defaultCreateKlingElement(args: {
	name: string;
	description: string;
	frontalImageUrl: string;
}): Promise<
	{ success: true; elementId: string } | { success: false; error: string }
> {
	// Kling accepts URLs for frontal_image. At least one refer_image is
	// required — the frontal itself is a safe fallback when no side
	// images are available (which is our case: portraits/ only has front.png).
	const payload: Record<string, unknown> = {
		element_name: args.name.slice(0, 20),
		element_description: args.description.slice(0, 100),
		reference_type: "image_refer",
		frontal_image: args.frontalImageUrl,
		refer_images: [args.frontalImageUrl],
	};
	const result: ApiCallResult = await callModelApi({
		endpoint: "kling-create-element",
		payload,
		provider: "gmi",
	});
	if (!result.success) {
		return { success: false, error: result.error ?? "Element creation failed" };
	}
	const data = result.data as Record<string, unknown> | undefined;
	const outcome = (data?.outcome as Record<string, unknown>) ?? data ?? {};
	const elementId =
		(outcome.element_id as string) ||
		(outcome.id as string) ||
		((data as Record<string, unknown> | undefined)?.element_id as string) ||
		((data as Record<string, unknown> | undefined)?.id as string) ||
		"";
	if (!elementId) {
		return {
			success: false,
			error: "Element created but no element_id returned",
		};
	}
	return { success: true, elementId };
}

/** Pure helpers are exported for testing. */
export function readElementCache(cachePath: string): KlingElementCache {
	if (!fs.existsSync(cachePath)) return {};
	try {
		const raw = fs.readFileSync(cachePath, "utf-8");
		const parsed = JSON.parse(raw) as unknown;
		if (parsed && typeof parsed === "object") {
			return parsed as KlingElementCache;
		}
		return {};
	} catch {
		return {};
	}
}

export function writeElementCache(
	cachePath: string,
	cache: KlingElementCache
): void {
	fs.mkdirSync(path.dirname(cachePath), { recursive: true });
	fs.writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf-8");
}

export interface EnsureKlingElementsArgs {
	/** name → FAL-CDN URL of the portrait's front.png (already uploaded). */
	portraitUrls: Record<string, string>;
	/** Path to `<project>/videos/kling-elements.json`. */
	cachePath: string;
	/** Optional: name → character description for richer element_description. */
	descriptions?: Record<string, string>;
	/** Optional: progress callback for per-character creation. */
	onProgress?: (event: {
		name: string;
		index: number;
		total: number;
		status: "cached" | "creating" | "created" | "failed";
		error?: string;
	}) => void;
	/** Dependency injection for tests. */
	createElementImpl?: CreateKlingElementFn;
	/** Dependency injection for tests (filesystem). */
	readCacheImpl?: typeof readElementCache;
	writeCacheImpl?: typeof writeElementCache;
}

export interface EnsureKlingElementsResult {
	elementIds: Record<string, string>;
	created: string[];
	cached: string[];
	failed: Record<string, string>;
}

/**
 * Ensure every portrait has a Kling element. Reads the cache, re-uses
 * entries whose `portrait_url` still matches, creates the rest, and
 * writes the cache back. Returns a `name → element_id` map suitable
 * to pass as the `portraits` argument to `adaptShotForSeedance` when
 * family is `"kling-omni"`.
 */
export async function ensureKlingElements(
	args: EnsureKlingElementsArgs
): Promise<EnsureKlingElementsResult> {
	const {
		portraitUrls,
		cachePath,
		descriptions = {},
		onProgress,
		createElementImpl = defaultCreateKlingElement,
		readCacheImpl = readElementCache,
		writeCacheImpl = writeElementCache,
	} = args;

	const cache = readCacheImpl(cachePath);
	const names = Object.keys(portraitUrls);
	const total = names.length;
	const elementIds: Record<string, string> = {};
	const created: string[] = [];
	const cachedNames: string[] = [];
	const failed: Record<string, string> = {};

	let index = 0;
	for (const name of names) {
		index++;
		const url = portraitUrls[name];
		const hit = cache[name];
		if (hit && hit.portrait_url === url && hit.element_id) {
			elementIds[name] = hit.element_id;
			cachedNames.push(name);
			onProgress?.({ name, index, total, status: "cached" });
			continue;
		}
		onProgress?.({ name, index, total, status: "creating" });
		const description =
			descriptions[name]?.slice(0, 100) ||
			`Character ${name} (auto-generated for novel2video)`;
		const result = await createElementImpl({
			name,
			description,
			frontalImageUrl: url,
		});
		if (!result.success) {
			failed[name] = result.error;
			onProgress?.({ name, index, total, status: "failed", error: result.error });
			continue;
		}
		cache[name] = {
			element_id: result.elementId,
			portrait_url: url,
			created_at: new Date().toISOString(),
		};
		elementIds[name] = result.elementId;
		created.push(name);
		onProgress?.({ name, index, total, status: "created" });
		// Persist incrementally so a mid-run failure doesn't lose progress.
		writeCacheImpl(cachePath, cache);
	}

	// Final write catches the all-cached case (no incremental writes).
	writeCacheImpl(cachePath, cache);

	return { elementIds, created, cached: cachedNames, failed };
}
