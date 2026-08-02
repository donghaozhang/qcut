import { readFile } from "node:fs/promises";
import type { SoundSearchResult } from "./freesound-client.js";

/**
 * The renderer owns the authoritative zod schema for this manifest
 * (apps/web/src/lib/audio/local-sound-effects-manifest.ts) and validates it
 * before playback. The CLI cannot import renderer code, and duplicating the
 * schema here would be a second copy to keep in sync, so this reads only the
 * fields a search needs and reports a clear error when they are absent.
 */
interface ManifestItem {
	id?: unknown;
	title?: unknown;
	duration?: unknown;
	fileName?: unknown;
	categoryIds?: unknown;
}

interface ManifestCategory {
	id?: unknown;
	label?: unknown;
}

function stringValue({ value }: { value: unknown }): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringArray({ value }: { value: unknown }): string[] {
	if (!Array.isArray(value)) return [];
	return value.filter((entry): entry is string => typeof entry === "string");
}

function categoryLabels({
	categories,
}: {
	categories: ManifestCategory[];
}): Map<string, string> {
	const labels = new Map<string, string>();
	for (const category of categories) {
		const id = stringValue({ value: category.id });
		const label = stringValue({ value: category.label });
		if (id && label) labels.set(id, label);
	}
	return labels;
}

export interface SoundEffectsLabManifestSource {
	/** Absolute path to a manifest JSON file. */
	manifestPath?: string;
	/** URL of the private manifest, served by the license server. */
	manifestUrl?: string;
	headers?: Record<string, string>;
}

async function readManifestJson({
	source,
	signal,
	fetchImpl = fetch,
}: {
	source: SoundEffectsLabManifestSource;
	signal?: AbortSignal;
	fetchImpl?: typeof fetch;
}): Promise<unknown> {
	if (source.manifestPath) {
		return JSON.parse(await readFile(source.manifestPath, "utf8"));
	}
	if (!source.manifestUrl) {
		throw new Error("Provide --manifest or --manifest-url");
	}
	const response = await fetchImpl(source.manifestUrl, {
		headers: source.headers,
		signal,
	});
	if (response.status === 401 || response.status === 403) {
		throw new Error(
			"The Sound Effects Lab catalog is private. Sign in with an allowlisted account: qcut system login"
		);
	}
	if (!response.ok) {
		throw new Error(
			`Unable to fetch the Sound Effects Lab manifest (status ${response.status})`
		);
	}
	return response.json();
}

function matches({
	query,
	title,
	labels,
}: {
	query: string;
	title: string;
	labels: string[];
}): boolean {
	const needle = query.toLowerCase();
	if (title.toLowerCase().includes(needle)) return true;
	return labels.some((label) => label.toLowerCase().includes(needle));
}

export async function searchSoundEffectsLab({
	query,
	limit,
	source,
	signal,
	fetchImpl = fetch,
}: {
	query: string;
	limit: number;
	source: SoundEffectsLabManifestSource;
	signal?: AbortSignal;
	fetchImpl?: typeof fetch;
}): Promise<SoundSearchResult[]> {
	const manifest = await readManifestJson({ source, signal, fetchImpl });
	if (typeof manifest !== "object" || manifest === null) {
		throw new Error("Sound Effects Lab manifest is not a JSON object");
	}
	const record = manifest as { items?: unknown; categories?: unknown };
	if (!Array.isArray(record.items)) {
		throw new Error("Sound Effects Lab manifest has no items array");
	}
	const labels = categoryLabels({
		categories: Array.isArray(record.categories)
			? (record.categories as ManifestCategory[])
			: [],
	});

	const results: SoundSearchResult[] = [];
	for (const entry of record.items as ManifestItem[]) {
		const title = stringValue({ value: entry.title });
		const id = stringValue({ value: entry.id });
		if (!(title && id)) continue;
		const categoryIds = stringArray({ value: entry.categoryIds });
		const categoryNames = categoryIds
			.map((categoryId) => labels.get(categoryId))
			.filter((label): label is string => label !== undefined);
		if (!matches({ query, title, labels: categoryNames })) continue;
		results.push({
			source: "sound-effects-lab",
			id,
			name: title,
			durationSeconds:
				typeof entry.duration === "number" ? entry.duration : null,
			tags: categoryNames,
			categoryIds,
			fileName: stringValue({ value: entry.fileName }),
		});
		if (results.length >= limit) break;
	}
	return results;
}
