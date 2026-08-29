import { createHash, randomUUID } from "node:crypto";
import {
	access,
	mkdir,
	readFile,
	readdir,
	rename,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
	detectJianyingMusicMimeType,
	probeJianyingMusicAudio,
	type JianyingMusicAudioProbeResult,
} from "./jianying-music-lab-audio.js";
import { mapWithConcurrency } from "./lib/map-with-concurrency.js";
import { listJianyingResourceDatabasePaths } from "./jianying-resource-database.js";
import type {
	JianyingMusicLabBatchSummary,
	JianyingMusicLabListResult,
	JianyingMusicLabLoadResult,
	JianyingMusicLabScanStats,
	JianyingMusicLabTrackSummary,
} from "./jianying-music-lab-contract.js";

const MANIFEST_SCHEMA_VERSION = 2;
const MANIFEST_FILE_NAME = "manifest.json";
const AUDIO_DIRECTORY_NAME = "audio";
const COPY_CONCURRENCY = 4;
const SONG_ID_PATTERN = /^\d{1,24}$/;
const DOWNLOAD_HASH_PATTERN = /^[a-f0-9]{32}$/;
const DOWNLOAD_FILE_PATTERN = /^[a-f0-9]{32}\.mp3$/;
const CHECKSUM_PATTERN = /^[a-f0-9]{64}$/;
const CACHED_FILE_PATTERN = /^\d{1,24}-[a-f0-9]{16}\.(?:m4a|mp3)$/;

interface RawSongRow {
	trackId: string | null;
	title: string | null;
	author: string | null;
	album: string | null;
	durationSeconds: number | null;
	genresJson: string | null;
	paidType: string | null;
	copyrighted: number | null;
	isCommerce: number | null;
	observedAt: string | null;
}

interface SongMetadata {
	trackId: string;
	title: string;
	author: string;
	album: string;
	durationSeconds: number;
	genres: string[];
	paidType: string;
	copyrighted: boolean;
	isCommerce: boolean;
	observedAt: string;
}

interface DownloadConfigEntry {
	date: string;
	hex: string;
	path: string;
}

export interface JianyingMusicLabCachedTrack
	extends JianyingMusicLabTrackSummary {
	fileName: string;
}

export interface JianyingMusicLabManifest {
	schemaVersion: 2;
	refreshedAt: string;
	stats: JianyingMusicLabScanStats;
	tracks: JianyingMusicLabCachedTrack[];
	batches: JianyingMusicLabBatchSummary[];
}

interface MatchedSourceTrack {
	metadata: SongMetadata;
	sourcePath: string;
}

export interface JianyingMusicLabCatalog {
	result: JianyingMusicLabListResult;
	manifest: JianyingMusicLabManifest;
	cacheRoot: string;
}

export interface BuildJianyingMusicLabCatalogOptions {
	qcutCacheRoot: string;
	sourceCacheRoot?: string;
	refresh?: boolean;
	probeAudio?: ({
		filePath,
	}: {
		filePath: string;
	}) => Promise<JianyingMusicAudioProbeResult>;
}

function defaultSourceCacheRoot() {
	return path.join(homedir(), "Movies", "JianyingPro", "User Data", "Cache");
}

function sha256({ bytes }: { bytes: Uint8Array }) {
	return createHash("sha256").update(bytes).digest("hex");
}

function md5Text({ value }: { value: string }) {
	return createHash("md5").update(value).digest("hex");
}

function asRecord({ value }: { value: unknown }) {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function parseGenres({ value }: { value: string | null }) {
	if (!value) return [];
	try {
		const parsed: unknown = JSON.parse(value);
		if (!Array.isArray(parsed)) return [];
		return [
			...new Set(
				parsed
					.filter((genre) => typeof genre === "string")
					.map((genre) => genre.trim())
					.filter(Boolean)
			),
		];
	} catch {
		return [];
	}
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

function readSongRows({ database }: { database: DatabaseSync }) {
	if (!tableExists({ database, table: "http_cache" })) return [];
	return database
		.prepare(`
			SELECT
				CAST(json_extract(song.value, '$.id') AS TEXT) AS trackId,
				CAST(json_extract(song.value, '$.title') AS TEXT) AS title,
				CAST(json_extract(song.value, '$.author') AS TEXT) AS author,
				CAST(json_extract(song.value, '$.album') AS TEXT) AS album,
				CAST(json_extract(song.value, '$.duration') AS REAL)
					AS durationSeconds,
				CAST(json_extract(song.value, '$.genres') AS TEXT) AS genresJson,
				CAST(json_extract(song.value, '$.paid_type') AS TEXT) AS paidType,
				CAST(json_extract(song.value, '$.copyrighted') AS INTEGER)
					AS copyrighted,
				CAST(json_extract(song.value, '$.is_commerce') AS INTEGER)
					AS isCommerce,
				CAST(cache.timestamp AS TEXT) AS observedAt
			FROM http_cache AS cache,
				json_each(
					CASE WHEN json_valid(cache.response_body)
						THEN cache.response_body ELSE '{}' END,
					'$.data.songs'
				) AS song
			WHERE json_type(song.value) = 'object'
				AND json_type(song.value, '$.id') IN ('integer', 'text')
				AND json_type(song.value, '$.title') = 'text'
		`)
		.all() as unknown as RawSongRow[];
}

function normalizeSongRow({ row }: { row: RawSongRow }): SongMetadata | null {
	const trackId = row.trackId?.trim() ?? "";
	const title = row.title?.trim() ?? "";
	if (!SONG_ID_PATTERN.test(trackId) || !title) return null;
	const duration = Number(row.durationSeconds ?? 0);
	return {
		trackId,
		title,
		author: row.author?.trim() || "剪映",
		album: row.album?.trim() ?? "",
		durationSeconds: Number.isFinite(duration) && duration >= 0 ? duration : 0,
		genres: parseGenres({ value: row.genresJson }),
		paidType: row.paidType?.trim() ?? "",
		copyrighted: row.copyrighted === 1,
		isCommerce: row.isCommerce === 1,
		observedAt: row.observedAt?.trim() ?? "",
	};
}

function mergeSongMetadata({ songs }: { songs: SongMetadata[] }) {
	const byTrackId = new Map<string, SongMetadata>();
	for (const song of songs) {
		const current = byTrackId.get(song.trackId);
		if (!current) {
			byTrackId.set(song.trackId, song);
			continue;
		}
		const latest = song.observedAt >= current.observedAt ? song : current;
		byTrackId.set(song.trackId, {
			...latest,
			genres: [...new Set([...current.genres, ...song.genres])],
		});
	}
	return [...byTrackId.values()];
}

function readDatabaseSongs({ databasePath }: { databasePath: string }) {
	const database = new DatabaseSync(databasePath, { readOnly: true });
	try {
		return readSongRows({ database })
			.map((row) => normalizeSongRow({ row }))
			.filter((song): song is SongMetadata => song !== null);
	} finally {
		database.close();
	}
}

async function readAllSongMetadata({ databaseRoot }: { databaseRoot: string }) {
	const candidates = await listJianyingResourceDatabasePaths({ databaseRoot });
	const availablePaths = (
		await Promise.all(
			candidates.map(async (databasePath) => {
				try {
					await access(databasePath);
					return databasePath;
				} catch {
					return null;
				}
			})
		)
	).filter((databasePath): databasePath is string => databasePath !== null);
	const rows = availablePaths.flatMap((databasePath) => {
		try {
			return readDatabaseSongs({ databasePath });
		} catch (error) {
			console.warn(
				`[JianyingMusicLab] Failed to read resource database ${databasePath}`,
				error
			);
			return [];
		}
	});
	return {
		databaseCount: availablePaths.length,
		songs: mergeSongMetadata({ songs: rows }),
	};
}

function normalizeDownloadEntry({ value }: { value: unknown }) {
	const record = asRecord({ value });
	if (!record) return null;
	const date = typeof record.date === "string" ? record.date : "";
	const hex = typeof record.hex === "string" ? record.hex.toLowerCase() : "";
	const fileName =
		typeof record.path === "string" ? record.path.toLowerCase() : "";
	if (
		!DOWNLOAD_HASH_PATTERN.test(hex) ||
		!DOWNLOAD_FILE_PATTERN.test(fileName)
	) {
		return null;
	}
	return { date, hex, path: fileName } satisfies DownloadConfigEntry;
}

async function readDownloadConfig({ musicRoot }: { musicRoot: string }) {
	const configPath = path.join(musicRoot, "downLoadcfg");
	const parsed: unknown = JSON.parse(await readFile(configPath, "utf8"));
	const record = asRecord({ value: parsed });
	const rawList =
		record && Array.isArray(record.list) ? record.list : ([] as unknown[]);
	const entries = rawList
		.map((value) => normalizeDownloadEntry({ value }))
		.filter((entry): entry is DownloadConfigEntry => entry !== null);
	return {
		entries,
		invalidCount: rawList.length - entries.length,
		rawCount: rawList.length,
	};
}

async function matchDownloadedTracks({
	musicRoot,
	songs,
	downloads,
}: {
	musicRoot: string;
	songs: SongMetadata[];
	downloads: DownloadConfigEntry[];
}) {
	const byHash = new Map<string, DownloadConfigEntry>();
	for (const download of downloads) {
		const current = byHash.get(download.hex);
		if (!current || download.date >= current.date) {
			byHash.set(download.hex, download);
		}
	}
	const candidates = songs.flatMap((metadata) => {
		// Jianying keys downLoadcfg by MD5(song.id), not by the signed preview URL.
		const download = byHash.get(md5Text({ value: metadata.trackId }));
		if (!download) return [];
		return [
			{
				metadata,
				sourcePath: path.join(musicRoot, download.path),
			} satisfies MatchedSourceTrack,
		];
	});
	const existing = await Promise.all(
		candidates.map(async (candidate) => {
			try {
				const info = await stat(candidate.sourcePath);
				return info.isFile() && info.size > 0 ? candidate : null;
			} catch {
				return null;
			}
		})
	);
	return existing.filter(
		(candidate): candidate is MatchedSourceTrack => candidate !== null
	);
}

function parseTrackSummary({ value }: { value: unknown }) {
	const record = asRecord({ value });
	if (
		!record ||
		typeof record.trackId !== "string" ||
		!SONG_ID_PATTERN.test(record.trackId) ||
		typeof record.title !== "string" ||
		typeof record.author !== "string" ||
		typeof record.album !== "string" ||
		typeof record.durationSeconds !== "number" ||
		!Array.isArray(record.genres) ||
		!record.genres.every((genre) => typeof genre === "string") ||
		typeof record.paidType !== "string" ||
		typeof record.copyrighted !== "boolean" ||
		typeof record.isCommerce !== "boolean" ||
		typeof record.byteSize !== "number" ||
		!Number.isSafeInteger(record.byteSize) ||
		record.byteSize <= 0 ||
		typeof record.checksumSha256 !== "string" ||
		!CHECKSUM_PATTERN.test(record.checksumSha256) ||
		typeof record.observedAt !== "string" ||
		typeof record.fileName !== "string" ||
		!CACHED_FILE_PATTERN.test(record.fileName)
	) {
		return null;
	}
	return record as unknown as JianyingMusicLabCachedTrack;
}

function parseBatchSummary({ value }: { value: unknown }) {
	const record = asRecord({ value });
	if (
		!record ||
		typeof record.batchId !== "string" ||
		!/^batch-[a-zA-Z0-9._-]{1,96}$/.test(record.batchId) ||
		typeof record.startedAt !== "string" ||
		typeof record.completedAt !== "string" ||
		typeof record.sourceEndpointKey !== "string" ||
		!/^(?:[A-F0-9]{32})?$/.test(record.sourceEndpointKey) ||
		typeof record.sourceObservedAt !== "string"
	) {
		return null;
	}
	const validCounts = [
		"requestedCount",
		"eligibleCount",
		"attemptedCount",
		"newTrackCount",
		"downloadedPayloadCount",
		"sharedPayloadCount",
		"failedCount",
		"remainingEligibleCount",
		"totalCachedTrackCount",
	].every((key) => {
		const count = record[key];
		return (
			typeof count === "number" && Number.isSafeInteger(count) && count >= 0
		);
	});
	return validCounts
		? (record as unknown as JianyingMusicLabBatchSummary)
		: null;
}

function parseScanStats({ value }: { value: unknown }) {
	const record = asRecord({ value });
	if (!record || typeof record.sourceAvailable !== "boolean") {
		return null;
	}
	const validCounts = [
		"databaseCount",
		"metadataSongCount",
		"downloadRecordCount",
		"matchedTrackCount",
		"cachedTrackCount",
		"unmatchedDownloadCount",
		"invalidDownloadRecordCount",
		"copiedTrackCount",
		"reusedTrackCount",
	].every((key) => {
		const count = record[key];
		return (
			typeof count === "number" && Number.isSafeInteger(count) && count >= 0
		);
	});
	return validCounts ? (record as unknown as JianyingMusicLabScanStats) : null;
}

export async function readJianyingMusicLabManifest({
	cacheRoot,
}: {
	cacheRoot: string;
}) {
	try {
		const parsed: unknown = JSON.parse(
			await readFile(path.join(cacheRoot, MANIFEST_FILE_NAME), "utf8")
		);
		const record = asRecord({ value: parsed });
		const stats = parseScanStats({ value: record?.stats });
		const tracks = Array.isArray(record?.tracks)
			? record.tracks.map((track) => parseTrackSummary({ value: track }))
			: [];
		const batches = Array.isArray(record?.batches)
			? record.batches.map((batch) => parseBatchSummary({ value: batch }))
			: [];
		if (
			!record ||
			(record.schemaVersion !== 1 &&
				record.schemaVersion !== MANIFEST_SCHEMA_VERSION) ||
			typeof record.refreshedAt !== "string" ||
			!stats ||
			tracks.some((track) => track === null) ||
			batches.some((batch) => batch === null)
		) {
			return null;
		}
		const manifest: JianyingMusicLabManifest = {
			schemaVersion: MANIFEST_SCHEMA_VERSION,
			refreshedAt: record.refreshedAt,
			stats,
			tracks: tracks.filter(
				(track): track is JianyingMusicLabCachedTrack => track !== null
			),
			batches: batches.filter(
				(batch): batch is JianyingMusicLabBatchSummary => batch !== null
			),
		};
		const presentTracks = (
			await Promise.all(
				manifest.tracks.map(async (track) => {
					try {
						const info = await stat(
							path.join(cacheRoot, AUDIO_DIRECTORY_NAME, track.fileName)
						);
						return info.isFile() && info.size === track.byteSize ? track : null;
					} catch {
						return null;
					}
				})
			)
		).filter((track): track is JianyingMusicLabCachedTrack => track !== null);
		return {
			...manifest,
			stats: {
				...manifest.stats,
				cachedTrackCount: presentTracks.length,
			},
			tracks: presentTracks,
		};
	} catch {
		return null;
	}
}

export async function writeJianyingMusicLabManifest({
	cacheRoot,
	manifest,
}: {
	cacheRoot: string;
	manifest: JianyingMusicLabManifest;
}) {
	await mkdir(cacheRoot, { recursive: true, mode: 0o700 });
	const manifestPath = path.join(cacheRoot, MANIFEST_FILE_NAME);
	const temporaryPath = `${manifestPath}.${process.pid}.${randomUUID()}.tmp`;
	try {
		await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, {
			encoding: "utf8",
			flag: "wx",
			mode: 0o600,
		});
		await rename(temporaryPath, manifestPath);
	} finally {
		await rm(temporaryPath, { force: true }).catch(() => undefined);
	}
}

async function cacheSourceTrack({
	audioRoot,
	probeAudio,
	track,
}: {
	audioRoot: string;
	probeAudio: NonNullable<BuildJianyingMusicLabCatalogOptions["probeAudio"]>;
	track: MatchedSourceTrack;
}) {
	const probe = await probeAudio({ filePath: track.sourcePath });
	const bytes = await readFile(track.sourcePath);
	const checksumSha256 = sha256({ bytes });
	const fileName = `${track.metadata.trackId}-${checksumSha256.slice(0, 16)}.${probe.fileExtension}`;
	const destinationPath = path.join(audioRoot, fileName);
	let reused = false;
	try {
		const existing = await readFile(destinationPath);
		reused = sha256({ bytes: existing }) === checksumSha256;
	} catch {
		reused = false;
	}
	if (!reused) {
		const temporaryPath = `${destinationPath}.${process.pid}.${randomUUID()}.tmp`;
		try {
			await writeFile(temporaryPath, bytes, { flag: "wx", mode: 0o600 });
			await rm(destinationPath, { force: true });
			await rename(temporaryPath, destinationPath);
		} finally {
			await rm(temporaryPath, { force: true }).catch(() => undefined);
		}
	}
	return {
		track: {
			...track.metadata,
			byteSize: bytes.byteLength,
			checksumSha256,
			fileName,
		} satisfies JianyingMusicLabCachedTrack,
		reused,
	};
}

async function removeUnreferencedAudioPayloads({
	audioRoot,
	tracks,
}: {
	audioRoot: string;
	tracks: JianyingMusicLabCachedTrack[];
}) {
	const referencedFiles = new Set(tracks.map((track) => track.fileName));
	const entries = await readdir(audioRoot, { withFileTypes: true }).catch(
		() => []
	);
	await Promise.all(
		entries
			.filter(
				(entry) =>
					entry.isFile() &&
					CACHED_FILE_PATTERN.test(entry.name) &&
					!referencedFiles.has(entry.name)
			)
			.map((entry) => rm(path.join(audioRoot, entry.name), { force: true }))
	);
}

export function createJianyingMusicLabCatalog({
	cacheRoot,
	manifest,
}: {
	cacheRoot: string;
	manifest: JianyingMusicLabManifest;
}): JianyingMusicLabCatalog {
	return {
		cacheRoot,
		manifest,
		result: {
			refreshedAt: manifest.refreshedAt,
			cacheDirectory: cacheRoot,
			stats: manifest.stats,
			tracks: manifest.tracks.map(({ fileName: _fileName, ...track }) => track),
			batchCount: manifest.batches.length,
			latestBatch: manifest.batches[manifest.batches.length - 1] ?? null,
		},
	};
}

async function scanAndCache({
	qcutCacheRoot,
	probeAudio,
	sourceCacheRoot,
	previousManifest,
}: {
	qcutCacheRoot: string;
	probeAudio: NonNullable<BuildJianyingMusicLabCatalogOptions["probeAudio"]>;
	sourceCacheRoot: string;
	previousManifest: JianyingMusicLabManifest | null;
}) {
	const musicRoot = path.join(sourceCacheRoot, "music");
	const databaseRoot = path.join(sourceCacheRoot, "ressdk_db");
	let sourceAvailable = true;
	let downloadRecordCount = 0;
	let invalidDownloadRecordCount = 0;
	let downloads: DownloadConfigEntry[] = [];
	try {
		const config = await readDownloadConfig({ musicRoot });
		downloadRecordCount = config.rawCount;
		invalidDownloadRecordCount = config.invalidCount;
		downloads = config.entries;
	} catch (error) {
		sourceAvailable = false;
		console.warn(
			"[JianyingMusicLab] Jianying download config unavailable",
			error
		);
	}
	const metadata = sourceAvailable
		? await readAllSongMetadata({ databaseRoot })
		: { databaseCount: 0, songs: [] };
	const matchedTracks = sourceAvailable
		? await matchDownloadedTracks({
				musicRoot,
				songs: metadata.songs,
				downloads,
			})
		: [];
	const audioRoot = path.join(qcutCacheRoot, AUDIO_DIRECTORY_NAME);
	await mkdir(audioRoot, { recursive: true, mode: 0o700 });
	const cached = await mapWithConcurrency({
		items: matchedTracks,
		limit: COPY_CONCURRENCY,
		task: ({ item }) =>
			cacheSourceTrack({ audioRoot, probeAudio, track: item }),
	});
	const merged = new Map<string, JianyingMusicLabCachedTrack>();
	for (const track of previousManifest?.tracks ?? []) {
		merged.set(track.trackId, track);
	}
	for (const cachedTrack of cached) {
		merged.set(cachedTrack.track.trackId, cachedTrack.track);
	}
	const tracks = [...merged.values()].sort((left, right) => {
		const observed = right.observedAt.localeCompare(left.observedAt);
		return observed || left.title.localeCompare(right.title);
	});
	const copiedTrackCount = cached.filter((entry) => !entry.reused).length;
	const reusedTrackCount = cached.length - copiedTrackCount;
	const refreshedAt = new Date().toISOString();
	const stats: JianyingMusicLabScanStats = {
		sourceAvailable,
		databaseCount: metadata.databaseCount,
		metadataSongCount: metadata.songs.length,
		downloadRecordCount,
		matchedTrackCount: matchedTracks.length,
		cachedTrackCount: tracks.length,
		unmatchedDownloadCount: Math.max(
			0,
			downloads.length - matchedTracks.length
		),
		invalidDownloadRecordCount,
		copiedTrackCount,
		reusedTrackCount,
	};
	const manifest: JianyingMusicLabManifest = {
		schemaVersion: MANIFEST_SCHEMA_VERSION,
		refreshedAt,
		stats,
		tracks,
		batches: previousManifest?.batches ?? [],
	};
	await writeJianyingMusicLabManifest({
		cacheRoot: qcutCacheRoot,
		manifest,
	});
	await removeUnreferencedAudioPayloads({ audioRoot, tracks });
	console.info(
		`[JianyingMusicLab] Refresh complete: ${matchedTracks.length} matched, ${tracks.length} cached, ${copiedTrackCount} copied`
	);
	return manifest;
}

export async function buildJianyingMusicLabCatalog({
	qcutCacheRoot,
	probeAudio = probeJianyingMusicAudio,
	sourceCacheRoot = defaultSourceCacheRoot(),
	refresh = false,
}: BuildJianyingMusicLabCatalogOptions): Promise<JianyingMusicLabCatalog> {
	const previousManifest = await readJianyingMusicLabManifest({
		cacheRoot: qcutCacheRoot,
	});
	const manifest =
		previousManifest && !refresh
			? previousManifest
			: await scanAndCache({
					qcutCacheRoot,
					probeAudio,
					sourceCacheRoot,
					previousManifest,
				});
	return createJianyingMusicLabCatalog({
		cacheRoot: qcutCacheRoot,
		manifest,
	});
}

export async function loadJianyingMusicLabTrack({
	catalog,
	trackId,
}: {
	catalog: JianyingMusicLabCatalog;
	trackId: string;
}): Promise<JianyingMusicLabLoadResult> {
	if (!SONG_ID_PATTERN.test(trackId)) {
		throw new Error("音乐实验室音乐 ID 无效");
	}
	const cachedTrack = catalog.manifest.tracks.find(
		(track) => track.trackId === trackId
	);
	if (!cachedTrack) throw new Error("音乐实验室缓存中没有找到该音乐");
	const filePath = path.join(
		catalog.cacheRoot,
		AUDIO_DIRECTORY_NAME,
		cachedTrack.fileName
	);
	const bytes = await readFile(filePath);
	if (
		bytes.byteLength !== cachedTrack.byteSize ||
		sha256({ bytes }) !== cachedTrack.checksumSha256
	) {
		throw new Error("音乐实验室缓存校验失败，请刷新缓存");
	}
	const { fileName: _fileName, ...track } = cachedTrack;
	return {
		track,
		mimeType: detectJianyingMusicMimeType({ bytes }),
		bytes: new Uint8Array(bytes),
	};
}
