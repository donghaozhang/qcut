const ICONIFY_API_ORIGIN = "https://api.iconify.design";
const DEFAULT_SEARCH_LIMIT = 24;
const MAX_SEARCH_LIMIT = 100;
const REQUEST_TIMEOUT_MS = 10_000;
const STICKER_ID_PATTERN =
	/^(?<collection>[a-z0-9]+(?:-[a-z0-9]+)*):(?<icon>[a-z0-9]+(?:-[a-z0-9]+)*)$/;

interface IconifyCollection {
	name?: string;
	total?: number;
	author?: { name?: string; url?: string };
	license?: { title?: string; spdx?: string; url?: string };
}

interface IconifySearchResponse {
	icons?: string[];
	total?: number;
	limit?: number;
	start?: number;
	collections?: Record<string, IconifyCollection>;
}

export interface StickerSearchResult {
	id: string;
	collection: string;
	icon: string;
	name: string;
	previewUrl: string;
	collectionName?: string;
	license?: {
		name?: string;
		spdxId?: string;
		url?: string;
	};
}

export interface StickerSearchResponse {
	query: string;
	collection?: string;
	total: number;
	results: StickerSearchResult[];
}

type FetchLike = typeof fetch;

function combinedSignal({
	signal,
	timeoutMs = REQUEST_TIMEOUT_MS,
}: {
	signal?: AbortSignal;
	timeoutMs?: number;
}): { signal: AbortSignal; dispose: () => void } {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	const abort = () => controller.abort();
	if (signal?.aborted) controller.abort();
	signal?.addEventListener("abort", abort, { once: true });
	return {
		signal: controller.signal,
		dispose: () => {
			clearTimeout(timeout);
			signal?.removeEventListener("abort", abort);
		},
	};
}

function stickerName({ icon }: { icon: string }): string {
	return icon
		.split("-")
		.filter(Boolean)
		.map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
		.join(" ");
}

export function parseIconifyStickerId({ stickerId }: { stickerId: string }): {
	collection: string;
	icon: string;
} {
	const match = STICKER_ID_PATTERN.exec(stickerId.trim());
	const collection = match?.groups?.collection;
	const icon = match?.groups?.icon;
	if (!collection || !icon) {
		throw new Error(
			`Invalid sticker ID "${stickerId}". Expected collection:icon.`
		);
	}
	return { collection, icon };
}

export function iconifyStickerUrl({
	stickerId,
	size = 512,
}: {
	stickerId: string;
	size?: number;
}): string {
	const { collection, icon } = parseIconifyStickerId({ stickerId });
	const url = new URL(`${ICONIFY_API_ORIGIN}/${collection}:${icon}.svg`);
	url.searchParams.set("width", String(size));
	url.searchParams.set("height", String(size));
	return url.toString();
}

async function fetchIconify({
	url,
	signal,
	fetchImpl,
}: {
	url: URL | string;
	signal?: AbortSignal;
	fetchImpl: FetchLike;
}): Promise<Response> {
	const request = combinedSignal({ signal });
	try {
		const response = await fetchImpl(url, {
			headers: { Accept: "application/json, image/svg+xml" },
			signal: request.signal,
		});
		if (!response.ok) {
			throw new Error(
				`Iconify request failed with HTTP ${response.status}: ${response.statusText}`
			);
		}
		return response;
	} finally {
		request.dispose();
	}
}

export async function searchIconifyStickers({
	query,
	collection,
	limit = DEFAULT_SEARCH_LIMIT,
	signal,
	fetchImpl = fetch,
}: {
	query: string;
	collection?: string;
	limit?: number;
	signal?: AbortSignal;
	fetchImpl?: FetchLike;
}): Promise<StickerSearchResponse> {
	const normalizedQuery = query.trim();
	if (!normalizedQuery) throw new Error("Sticker search query cannot be empty");
	const normalizedCollection = collection?.trim().toLocaleLowerCase();
	if (
		normalizedCollection &&
		!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedCollection)
	) {
		throw new Error(`Invalid Iconify collection: ${collection}`);
	}
	const requestedLimit = Number.isFinite(limit)
		? Math.floor(limit)
		: DEFAULT_SEARCH_LIMIT;
	const normalizedLimit = Math.min(
		MAX_SEARCH_LIMIT,
		Math.max(1, requestedLimit)
	);
	const url = new URL(`${ICONIFY_API_ORIGIN}/search`);
	url.searchParams.set("query", normalizedQuery);
	url.searchParams.set("limit", String(normalizedLimit));
	if (normalizedCollection) {
		url.searchParams.set("prefixes", normalizedCollection);
	}

	const response = await fetchIconify({ url, signal, fetchImpl });
	const payload = (await response.json()) as IconifySearchResponse;
	const ids = (payload.icons ?? []).filter((id) => {
		if (!normalizedCollection) return true;
		return id.startsWith(`${normalizedCollection}:`);
	});
	const results = ids.slice(0, normalizedLimit).map((id) => {
		const { collection: prefix, icon } = parseIconifyStickerId({
			stickerId: id,
		});
		const collectionInfo = payload.collections?.[prefix];
		return {
			id,
			collection: prefix,
			icon,
			name: stickerName({ icon }),
			previewUrl: iconifyStickerUrl({ stickerId: id }),
			collectionName: collectionInfo?.name,
			license: collectionInfo?.license
				? {
						name: collectionInfo.license.title,
						spdxId: collectionInfo.license.spdx,
						url: collectionInfo.license.url,
					}
				: undefined,
		};
	});

	return {
		query: normalizedQuery,
		collection: normalizedCollection,
		total: Number.isFinite(payload.total)
			? Number(payload.total)
			: results.length,
		results,
	};
}

export async function downloadIconifyStickerSvg({
	stickerId,
	size = 512,
	signal,
	fetchImpl = fetch,
}: {
	stickerId: string;
	size?: number;
	signal?: AbortSignal;
	fetchImpl?: FetchLike;
}): Promise<string> {
	const response = await fetchIconify({
		url: iconifyStickerUrl({ stickerId, size }),
		signal,
		fetchImpl,
	});
	const svg = await response.text();
	if (!/<svg[\s>]/i.test(svg) || !/<\/svg>/i.test(svg)) {
		throw new Error(`Iconify returned invalid SVG for ${stickerId}`);
	}
	if (Buffer.byteLength(svg, "utf8") > 2 * 1024 * 1024) {
		throw new Error(`Sticker SVG is unexpectedly large: ${stickerId}`);
	}
	return svg;
}
