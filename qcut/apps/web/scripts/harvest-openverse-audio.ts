/**
 * Harvest the bundled music library from Openverse.
 *
 * Openverse (https://api.openverse.org) aggregates Jamendo, Freesound and
 * Wikimedia Commons. We keep only CC0 / Public Domain Mark / CC BY tracks, so
 * every track may be used commercially and remixed into a video; CC BY tracks
 * oblige the user to credit the artist, which the library card surfaces.
 *
 * The API is rate limited (anonymous: 20 requests/minute, 200/day, 20 results
 * per page), so raw responses are cached on disk and the manifest is rebuilt
 * from that cache. Re-running with --build-only costs no API budget.
 *
 * Usage:
 *   bun apps/web/scripts/harvest-openverse-audio.ts [--build-only]
 *     [--cache <path>] [--out <path>] [--max-requests <n>] [--pages <n>]
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
	ALLOWED_OPENVERSE_LICENSES,
	buildBundledAudioManifest,
	type OpenverseAudioRecord,
} from "../src/lib/audio/openverse-library-build";
import { parseAudioCdnManifest } from "../src/lib/audio/audio-cdn-catalog";

const API_URL = "https://api.openverse.org/v1/audio/";
const PAGE_SIZE = 20;
const REQUEST_SPACING_MS = 3500; // 20 requests/minute anonymous burst limit.
const USER_AGENT = "QCut/1.0 (https://qcut.app; music library harvester)";

/**
 * Broad queries chosen to span the genre/mood space rather than to mirror the
 * UI categories: Openverse caps anonymous pagination at ~240 results per
 * query, so coverage comes from query variety while categories are assigned
 * locally from each track's own genres and tags.
 */
const QUERY_PLAN: readonly string[] = [
	"piano",
	"acoustic guitar",
	"ambient",
	"cinematic",
	"electronic",
	"chill",
	"folk",
	"jazz",
	"orchestral",
	"rock",
	"hip hop",
	"upbeat",
	"emotional",
	"soundtrack",
	"lounge",
	"funk",
	"blues",
	"dance",
	"world",
	"reggae",
	"country",
	"latin",
	"metal",
	"punk",
	"classical",
	"experimental",
	"pop song",
	"instrumental theme",
	"relaxing",
	"energetic",
	"happy",
	"sad",
	"love",
	"summer",
	"winter",
	"travel",
	"nature",
	"night",
	"retro",
	"groove",
];

function flagValue({ flag }: { flag: string }): string | undefined {
	const index = process.argv.indexOf(flag);
	if (index < 0) return undefined;
	const value = process.argv[index + 1];
	if (!value || value.startsWith("--")) {
		throw new Error(`${flag} requires a value`);
	}
	return value;
}

function flagNumber({
	flag,
	fallback,
}: {
	flag: string;
	fallback: number;
}): number {
	const raw = flagValue({ flag });
	if (raw === undefined) return fallback;
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new Error(`${flag} must be a positive integer`);
	}
	return parsed;
}

const buildOnly = process.argv.includes("--build-only");
const cachePath = path.resolve(
	flagValue({ flag: "--cache" }) ??
		path.join(import.meta.dir, "../audio-cdn/openverse-raw.json")
);
const outPath = path.resolve(
	flagValue({ flag: "--out" }) ??
		path.join(import.meta.dir, "../public/audio/library/manifest.json")
);
const maxRequests = flagNumber({ flag: "--max-requests", fallback: 170 });
const pagesPerQuery = flagNumber({ flag: "--pages", fallback: 12 });

function sleep({ ms }: { ms: number }): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

interface RawCache {
	fetchedAt: string;
	records: OpenverseAudioRecord[];
}

async function readCache(): Promise<RawCache> {
	if (!existsSync(cachePath)) {
		return { fetchedAt: new Date(0).toISOString(), records: [] };
	}
	const parsed: unknown = JSON.parse(await readFile(cachePath, "utf8"));
	if (
		!parsed ||
		typeof parsed !== "object" ||
		!Array.isArray((parsed as RawCache).records)
	) {
		throw new Error(`Cache at ${cachePath} is not a raw harvest file`);
	}
	return parsed as RawCache;
}

interface PageResult {
	records: OpenverseAudioRecord[];
	pageCount: number;
	rateLimited: boolean;
}

async function fetchPage({
	query,
	page,
}: {
	query: string;
	page: number;
}): Promise<PageResult> {
	const url = new URL(API_URL);
	url.searchParams.set("q", query);
	url.searchParams.set("source", "jamendo");
	url.searchParams.set("license", ALLOWED_OPENVERSE_LICENSES.join(","));
	url.searchParams.set("category", "music");
	url.searchParams.set("page_size", String(PAGE_SIZE));
	url.searchParams.set("page", String(page));

	const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
	if (response.status === 429) {
		return { records: [], pageCount: 0, rateLimited: true };
	}
	if (!response.ok) {
		throw new Error(`Openverse ${response.status} for "${query}" page ${page}`);
	}
	const payload = (await response.json()) as {
		results?: OpenverseAudioRecord[];
		page_count?: number;
	};
	return {
		records: payload.results ?? [],
		pageCount: payload.page_count ?? 0,
		rateLimited: false,
	};
}

async function harvest(): Promise<RawCache> {
	const cache = await readCache();
	const seen = new Set(
		cache.records
			.map((record) => (typeof record.id === "string" ? record.id : ""))
			.filter(Boolean)
	);
	let requests = 0;
	let added = 0;

	for (const query of QUERY_PLAN) {
		for (let page = 1; page <= pagesPerQuery; page += 1) {
			if (requests >= maxRequests) {
				console.log(`Request budget (${maxRequests}) reached — stopping.`);
				return { fetchedAt: new Date().toISOString(), records: cache.records };
			}
			if (requests > 0) await sleep({ ms: REQUEST_SPACING_MS });

			let result: PageResult;
			try {
				result = await fetchPage({ query, page });
			} catch (error) {
				console.warn(`  ${query} p${page}: ${(error as Error).message}`);
				break;
			}
			requests += 1;

			if (result.rateLimited) {
				console.log("Rate limited by Openverse — stopping harvest.");
				return { fetchedAt: new Date().toISOString(), records: cache.records };
			}

			for (const record of result.records) {
				const id = typeof record.id === "string" ? record.id : "";
				if (!id || seen.has(id)) continue;
				seen.add(id);
				cache.records.push(record);
				added += 1;
			}
			console.log(
				`  ${query} p${page}: +${result.records.length} (unique total ${cache.records.length})`
			);
			if (result.pageCount && page >= result.pageCount) break;
		}
	}

	console.log(`Harvest done: ${requests} requests, ${added} new records.`);
	return { fetchedAt: new Date().toISOString(), records: cache.records };
}

async function main(): Promise<void> {
	if (buildOnly && !existsSync(cachePath)) {
		// The cache is not committed (it is ~8MB), so a fresh clone lands here.
		// Failing loudly beats overwriting a good manifest with an empty one.
		throw new Error(
			`No harvest cache at ${cachePath}. Run \`bun run assets:audio:harvest\` first (it spends Openverse API budget), or pass --cache <path>.`
		);
	}
	const cache = buildOnly ? await readCache() : await harvest();

	if (!buildOnly) {
		await mkdir(path.dirname(cachePath), { recursive: true });
		await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
		console.log(`Raw cache: ${cachePath} (${cache.records.length} records)`);
	}

	const manifest = buildBundledAudioManifest({
		records: cache.records,
		// Tie the stamp to the harvest so rebuilding from cache is reproducible.
		generatedAt: cache.fetchedAt,
	});

	// An empty manifest parses cleanly, so it would otherwise overwrite a good
	// one and leave the library silently back at the seed catalog.
	if (manifest.tracks.length === 0) {
		throw new Error(
			`Refusing to write an empty manifest to ${outPath} (${cache.records.length} raw records yielded no usable tracks).`
		);
	}

	// The runtime parser is the contract; fail the build rather than ship a
	// manifest the app would silently drop.
	const validated = parseAudioCdnManifest({ value: manifest });
	if (!validated || validated.tracks.length !== manifest.tracks.length) {
		throw new Error(
			`Manifest failed runtime validation (${validated?.tracks.length ?? 0}/${manifest.tracks.length} tracks survived)`
		);
	}

	await mkdir(path.dirname(outPath), { recursive: true });
	await writeFile(outPath, `${JSON.stringify(manifest)}\n`, "utf8");

	const byTag = new Map<string, number>();
	for (const track of manifest.tracks) {
		for (const tag of track.tags) {
			byTag.set(tag, (byTag.get(tag) ?? 0) + 1);
		}
	}
	console.log(`\nManifest: ${outPath}`);
	console.log(`Tracks: ${manifest.tracks.length}`);
	console.log("Category coverage:");
	for (const [tag, count] of [...byTag.entries()].sort((a, b) => b[1] - a[1])) {
		console.log(`  ${tag.padEnd(14)} ${count}`);
	}
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
