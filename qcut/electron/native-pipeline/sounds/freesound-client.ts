import { getKey } from "../infra/key-manager.js";

const FREESOUND_SEARCH_URL = "https://freesound.org/apiv2/search/text/";

/** Mirrors what the app's sounds:search IPC requests, minus playback-only fields. */
const FREESOUND_FIELDS = [
	"id",
	"name",
	"description",
	"url",
	"previews",
	"duration",
	"filesize",
	"type",
	"username",
	"tags",
	"license",
	"num_downloads",
	"avg_rating",
].join(",");

export interface SoundSearchResult {
	source: "freesound" | "sound-effects-lab";
	id: string;
	name: string;
	durationSeconds: number | null;
	tags: string[];
	/** Freesound: the sound page. Lab: absent, the asset is fetched by id. */
	url?: string;
	previewUrl?: string;
	license?: string;
	author?: string;
	categoryIds?: string[];
	fileName?: string;
	/** Lab only: the storage key the license server signs on request. */
	objectKey?: string;
	/** Lab only: set once the audio has been written to disk. */
	localPath?: string;
}

interface FreesoundItem {
	id?: number;
	name?: string;
	url?: string;
	duration?: number;
	tags?: string[];
	license?: string;
	username?: string;
	previews?: Record<string, string>;
}

function resultFrom({ item }: { item: FreesoundItem }): SoundSearchResult {
	return {
		source: "freesound",
		id: String(item.id ?? ""),
		name: item.name ?? "",
		durationSeconds: typeof item.duration === "number" ? item.duration : null,
		tags: Array.isArray(item.tags) ? item.tags : [],
		url: item.url,
		previewUrl:
			item.previews?.["preview-hq-mp3"] ?? item.previews?.["preview-lq-mp3"],
		license: item.license,
		author: item.username,
	};
}

export async function searchFreesound({
	query,
	limit,
	signal,
	fetchImpl = fetch,
}: {
	query: string;
	limit: number;
	signal?: AbortSignal;
	fetchImpl?: typeof fetch;
}): Promise<SoundSearchResult[]> {
	const token = getKey("FREESOUND_API_KEY");
	if (!token) {
		throw new Error(
			"FREESOUND_API_KEY is not configured. Run: qcut system set-key FREESOUND_API_KEY <key>"
		);
	}

	const params = new URLSearchParams({
		query,
		token,
		page: "1",
		page_size: String(limit),
		sort: "score",
		fields: FREESOUND_FIELDS,
	});
	const response = await fetchImpl(`${FREESOUND_SEARCH_URL}?${params}`, {
		signal,
	});
	if (!response.ok) {
		// The token is in the query string, so never surface the URL itself.
		throw new Error(`Freesound search failed with status ${response.status}`);
	}
	const payload = (await response.json()) as { results?: FreesoundItem[] };
	const items = Array.isArray(payload.results) ? payload.results : [];
	return items.map((item) => resultFrom({ item }));
}
