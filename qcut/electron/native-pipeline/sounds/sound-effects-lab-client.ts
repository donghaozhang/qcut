import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { SoundSearchResult } from "./freesound-client.js";
import {
	defaultSoundEffectsLabManifestSource,
	soundEffectsLabAssetsUrl,
	type SoundEffectsLabManifestSource,
} from "./sound-effects-lab-config.js";

export type { SoundEffectsLabManifestSource } from "./sound-effects-lab-config.js";

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
	filePath?: unknown;
	byteSize?: unknown;
	contentSha256?: unknown;
	mimeType?: unknown;
	categoryIds?: unknown;
	asset?: {
		objectKey?: unknown;
		byteSize?: unknown;
		checksumSha256?: unknown;
	};
	source?: {
		provider?: unknown;
		redistribution?: unknown;
		license?: unknown;
	};
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

export interface ResolvedSoundEffectsLabAsset {
	id: string;
	name: string;
	durationSeconds: number | null;
	tags: string[];
	categoryIds: string[];
	fileName?: string;
	localPath?: string;
	objectKey?: string;
	byteSize?: number;
	checksumSha256?: string;
	mimeType?: string;
	license?: string;
	provider: "freesound" | "jianying-reference" | "unknown";
	redistribution: "allowed" | "prohibited" | "unknown";
	reusable: boolean;
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
	let response = await fetchImpl(source.manifestUrl, {
		headers: source.headers,
		signal,
	});
	if (response.status === 404 && source.fallbackManifestUrl) {
		response = await fetchImpl(source.fallbackManifestUrl, {
			headers: source.headers,
			signal,
		});
	}
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

function finitePositiveNumber({
	value,
}: {
	value: unknown;
}): number | undefined {
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? value
		: undefined;
}

function resolvedAsset({
	entry,
	labels,
}: {
	entry: ManifestItem;
	labels: Map<string, string>;
}): ResolvedSoundEffectsLabAsset | null {
	const name = stringValue({ value: entry.title });
	const id = stringValue({ value: entry.id });
	if (!(name && id)) return null;
	const categoryIds = stringArray({ value: entry.categoryIds });
	const tags = categoryIds
		.map((categoryId) => labels.get(categoryId))
		.filter((label): label is string => label !== undefined);
	const sourceProvider = stringValue({ value: entry.source?.provider });
	const redistribution = stringValue({ value: entry.source?.redistribution });
	const provider =
		sourceProvider === "freesound" || sourceProvider === "jianying-reference"
			? sourceProvider
			: "unknown";
	const normalizedRedistribution =
		redistribution === "allowed" || redistribution === "prohibited"
			? redistribution
			: "unknown";
	const checksumSha256 =
		stringValue({ value: entry.contentSha256 }) ??
		stringValue({ value: entry.asset?.checksumSha256 });
	return {
		id,
		name,
		durationSeconds: typeof entry.duration === "number" ? entry.duration : null,
		tags,
		categoryIds,
		fileName: stringValue({ value: entry.fileName }),
		localPath: stringValue({ value: entry.filePath }),
		objectKey: stringValue({ value: entry.asset?.objectKey }),
		byteSize:
			finitePositiveNumber({ value: entry.byteSize }) ??
			finitePositiveNumber({ value: entry.asset?.byteSize }),
		checksumSha256,
		mimeType: stringValue({ value: entry.mimeType }),
		license: stringValue({ value: entry.source?.license }),
		provider,
		redistribution: normalizedRedistribution,
		reusable:
			provider === "freesound" && normalizedRedistribution === "allowed",
	};
}

async function readResolvedAssets({
	source,
	signal,
	fetchImpl,
}: {
	source: SoundEffectsLabManifestSource;
	signal?: AbortSignal;
	fetchImpl: typeof fetch;
}): Promise<ResolvedSoundEffectsLabAsset[]> {
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
	return (record.items as ManifestItem[]).flatMap((entry) => {
		const asset = resolvedAsset({ entry, labels });
		return asset ? [asset] : [];
	});
}

export async function listSoundEffectsLabAssets({
	source = defaultSoundEffectsLabManifestSource(),
	signal,
	fetchImpl = fetch,
}: {
	source?: SoundEffectsLabManifestSource;
	signal?: AbortSignal;
	fetchImpl?: typeof fetch;
} = {}): Promise<ResolvedSoundEffectsLabAsset[]> {
	return readResolvedAssets({ source, signal, fetchImpl });
}

export async function resolveSoundEffectsLabAsset({
	assetId,
	source = defaultSoundEffectsLabManifestSource(),
	signal,
	fetchImpl = fetch,
}: {
	assetId: string;
	source?: SoundEffectsLabManifestSource;
	signal?: AbortSignal;
	fetchImpl?: typeof fetch;
}): Promise<ResolvedSoundEffectsLabAsset | null> {
	const assets = await readResolvedAssets({ source, signal, fetchImpl });
	return assets.find((asset) => asset.id === assetId) ?? null;
}

/** Writes one authenticated catalog asset to a caller-chosen local path. */
export async function downloadSoundEffectsLabAsset({
	objectKey,
	assetsUrl,
	headers,
	destinationPath,
	signal,
	fetchImpl = fetch,
	expectedByteSize,
	expectedChecksumSha256,
}: {
	objectKey: string;
	assetsUrl: string;
	headers?: Record<string, string>;
	destinationPath: string;
	signal?: AbortSignal;
	fetchImpl?: typeof fetch;
	expectedByteSize?: number;
	expectedChecksumSha256?: string;
}): Promise<string> {
	const url = `${assetsUrl}?objectKey=${encodeURIComponent(objectKey)}`;
	const response = await fetchImpl(url, { headers, signal });
	if (response.status === 401 || response.status === 403) {
		throw new Error(
			"The Sound Effects Lab audio is private. Sign in with an allowlisted account: qcut system login"
		);
	}
	if (!response.ok) {
		throw new Error(
			`Unable to fetch the Sound Effects Lab asset (status ${response.status})`
		);
	}
	const bytes = new Uint8Array(await response.arrayBuffer());
	if (expectedByteSize !== undefined && bytes.byteLength !== expectedByteSize) {
		throw new Error(
			`Sound Effects Lab asset size mismatch (expected ${expectedByteSize}, got ${bytes.byteLength})`
		);
	}
	if (expectedChecksumSha256) {
		const digest = createHash("sha256").update(bytes).digest("hex");
		if (digest !== expectedChecksumSha256.toLowerCase()) {
			throw new Error("Sound Effects Lab asset checksum mismatch");
		}
	}
	await mkdir(dirname(destinationPath), { recursive: true });
	await writeFile(destinationPath, bytes);
	return destinationPath;
}

export async function materializeSoundEffectsLabAsset({
	asset,
	destinationPath,
	source = defaultSoundEffectsLabManifestSource(),
	signal,
	fetchImpl = fetch,
}: {
	asset: ResolvedSoundEffectsLabAsset;
	destinationPath: string;
	source?: SoundEffectsLabManifestSource;
	signal?: AbortSignal;
	fetchImpl?: typeof fetch;
}): Promise<string> {
	if (!asset.reusable) {
		throw new Error(
			`Sound Effects Lab asset ${asset.id} is reference-only and cannot be added to a QCut project`
		);
	}
	if (asset.localPath) {
		const bytes = await readFile(asset.localPath);
		if (asset.byteSize !== undefined && bytes.byteLength !== asset.byteSize) {
			throw new Error(`Sound Effects Lab asset size mismatch: ${asset.id}`);
		}
		if (asset.checksumSha256) {
			const digest = createHash("sha256").update(bytes).digest("hex");
			if (digest !== asset.checksumSha256.toLowerCase()) {
				throw new Error(
					`Sound Effects Lab asset checksum mismatch: ${asset.id}`
				);
			}
		}
		await mkdir(dirname(destinationPath), { recursive: true });
		await writeFile(destinationPath, bytes);
		return destinationPath;
	}
	if (!asset.objectKey) {
		throw new Error(
			`Sound Effects Lab asset has no readable source: ${asset.id}`
		);
	}
	return downloadSoundEffectsLabAsset({
		objectKey: asset.objectKey,
		assetsUrl: soundEffectsLabAssetsUrl(),
		headers: source.headers,
		destinationPath,
		signal,
		fetchImpl,
		expectedByteSize: asset.byteSize,
		expectedChecksumSha256: asset.checksumSha256,
	});
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
	const assets = await readResolvedAssets({ source, signal, fetchImpl });
	const results: SoundSearchResult[] = [];
	for (const asset of assets) {
		if (!matches({ query, title: asset.name, labels: asset.tags })) continue;
		results.push({
			source: "sound-effects-lab",
			id: asset.id,
			name: asset.name,
			durationSeconds: asset.durationSeconds,
			tags: asset.tags,
			categoryIds: asset.categoryIds,
			fileName: asset.fileName,
			objectKey: asset.objectKey,
			license: asset.reusable
				? (asset.license ?? "CC0-1.0")
				: "reference-only",
		});
		if (results.length >= limit) break;
	}
	return results;
}
